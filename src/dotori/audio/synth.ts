// Web Audio 음색 (SPEC 12.2·12.3, ADR 053). 음원 파일 없이 발진기·잡음·필터로 소리를 만든다.
// 모든 함수는 시각 t(AudioContext 시계, 초)에 소리를 예약하고 스스로 멈춘다.
import type { Part } from './compose';
import { midiHz } from './compose';
import type { LeadInst, ArpInst } from '../data/music';

/** 흰 잡음 버퍼(2 초, 되풀이해 쓴다). */
export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  return buf;
}

/** 잔향 충격응답: 점점 사그라드는 양쪽 잡음(sec 초). */
export function makeImpulse(ctx: BaseAudioContext, sec: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * sec);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let seed = 777 + ch * 99;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const n = (seed / 0x7fffffff) * 2 - 1;
      d[i] = n * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

/** 발진기 하나를 t 에 켜고 끝에 끈다. */
function osc(
  ctx: BaseAudioContext,
  type: OscillatorType,
  f: number,
  t: number,
  end: number,
  dest: AudioNode,
): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.connect(dest);
  o.start(t);
  o.stop(end + 0.05);
  return o;
}

/** 치자마자 사그라드는 크기 틀(attack → 지수 감쇠). */
function pluckEnv(
  ctx: BaseAudioContext,
  t: number,
  peak: number,
  decay: number,
  dest: AudioNode,
): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  g.connect(dest);
  return g;
}

/** 오르골: 사인 배음 셋, 길게 울린다. */
function musicbox(ctx: BaseAudioContext, t: number, f: number, v: number, dest: AudioNode): void {
  const parts: [number, number, number][] = [
    [1, 1, 1.8],
    [2, 0.28, 0.7],
    [4.2, 0.07, 0.25],
  ];
  for (const [r, k, d] of parts)
    osc(ctx, 'sine', f * r, t, t + d, pluckEnv(ctx, t, v * k, d, dest));
}

/** 마림바: 사인 몸통 + 짧은 4 배음 "톡". */
function marimba(ctx: BaseAudioContext, t: number, f: number, v: number, dest: AudioNode): void {
  osc(ctx, 'sine', f, t, t + 0.9, pluckEnv(ctx, t, v, 0.9, dest));
  osc(ctx, 'sine', f * 4, t, t + 0.09, pluckEnv(ctx, t, v * 0.22, 0.09, dest));
  osc(ctx, 'triangle', f * 2, t, t + 0.3, pluckEnv(ctx, t, v * 0.12, 0.3, dest));
}

/** 하프: 삼각파 + 닫혀 가는 낮은 통과 필터. */
function harp(ctx: BaseAudioContext, t: number, f: number, v: number, dest: AudioNode): void {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(12000, f * 7), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.6), t + 0.5);
  lp.connect(pluckEnv(ctx, t, v, 1.5, dest));
  osc(ctx, 'triangle', f, t, t + 1.5, lp);
  osc(ctx, 'sine', f * 2, t, t + 0.6, pluckEnv(ctx, t, v * 0.15, 0.6, dest));
}

/** 플루트: 부드러운 시작, 늦게 드는 떨림, 숨소리 조금. */
function flute(
  ctx: BaseAudioContext,
  t: number,
  f: number,
  dur: number,
  v: number,
  dest: AudioNode,
  noise: AudioBuffer,
): void {
  const end = t + dur;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + 0.07);
  g.gain.setValueAtTime(v * 0.9, Math.max(t + 0.08, end - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.25);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(9000, f * 5);
  lp.connect(g);
  g.connect(dest);
  const a = osc(ctx, 'sine', f, t, end + 0.3, lp);
  const b = osc(ctx, 'triangle', f, t, end + 0.3, lp);
  const bg = ctx.createGain();
  bg.gain.value = 0.25;
  b.disconnect();
  b.connect(bg);
  bg.connect(lp);
  if (dur > 0.35) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.006, t + 0.35);
    lfo.connect(depth);
    depth.connect(a.frequency);
    depth.connect(b.frequency);
    lfo.start(t);
    lfo.stop(end + 0.3);
  }
  const n = ctx.createBufferSource();
  n.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f * 2;
  bp.Q.value = 1.2;
  n.connect(bp);
  bp.connect(pluckEnv(ctx, t, v * 0.05, 0.12, dest));
  n.start(t, Math.random() * 1.5);
  n.stop(t + 0.15);
}

/** 패드: 살짝 어긋난 톱니파 둘 + 낮은 통과 필터, 느리게 차오른다. */
function pad(
  ctx: BaseAudioContext,
  t: number,
  f: number,
  dur: number,
  v: number,
  dest: AudioNode,
): void {
  const end = t + dur;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + Math.min(1.2, dur * 0.4));
  g.gain.setValueAtTime(v, Math.max(t + 0.1, end - 0.3));
  g.gain.linearRampToValueAtTime(0.0001, end + 1.2);
  g.connect(dest);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  lp.Q.value = 0.4;
  lp.connect(g);
  for (const cents of [-7, 7]) {
    const o = osc(ctx, 'sawtooth', f, t, end + 1.3, lp);
    o.detune.value = cents;
  }
}

/** 베이스: 부드럽게 퉁기는 낮은 음. */
function bass(
  ctx: BaseAudioContext,
  t: number,
  f: number,
  dur: number,
  v: number,
  dest: AudioNode,
): void {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  const d = Math.max(0.6, dur * 0.9);
  lp.connect(pluckEnv(ctx, t, v, d, dest));
  osc(ctx, 'sine', f, t, t + d, lp);
  osc(ctx, 'triangle', f, t, t + d * 0.5, pluckEnv(ctx, t, v * 0.25, d * 0.5, lp));
}

/** 종: 어긋난 배음(1·2.76·5.4), 길게. */
export function bell(
  ctx: BaseAudioContext,
  t: number,
  f: number,
  v: number,
  dest: AudioNode,
): void {
  const parts: [number, number, number][] = [
    [1, 1, 3],
    [2.76, 0.35, 1.6],
    [5.4, 0.15, 0.8],
  ];
  for (const [r, k, d] of parts)
    osc(ctx, 'sine', f * r, t, t + d, pluckEnv(ctx, t, v * k, d, dest));
}

/** 곡의 음 하나를 연주한다. sec 는 한 박의 초. */
export function playNote(
  ctx: BaseAudioContext,
  dest: AudioNode,
  noise: AudioBuffer,
  part: Part,
  lead: LeadInst,
  arp: ArpInst,
  t: number,
  midi: number,
  durBeats: number,
  sec: number,
  vel: number,
): void {
  const f = midiHz(midi);
  const dur = durBeats * sec;
  const v = vel * 0.9;
  switch (part) {
    case 'lead':
      if (lead === 'flute') flute(ctx, t, f, dur, v * 0.8, dest, noise);
      else if (lead === 'marimba') marimba(ctx, t, f, v, dest);
      else musicbox(ctx, t, f, v, dest);
      return;
    case 'arp':
      if (arp === 'marimba') marimba(ctx, t, f, v, dest);
      else harp(ctx, t, f, v, dest);
      return;
    case 'pad':
      pad(ctx, t, f, dur, v * 0.18, dest);
      return;
    case 'bass':
      bass(ctx, t, f, dur, v * 0.9, dest);
      return;
    case 'bell':
      bell(ctx, t, f, v * 0.6, dest);
  }
}

/** 잡음 조각 하나(필터를 거쳐 짧게). */
function burst(
  ctx: BaseAudioContext,
  noise: AudioBuffer,
  t: number,
  dur: number,
  type: BiquadFilterType,
  freq: number,
  q: number,
  v: number,
  dest: AudioNode,
): void {
  const n = ctx.createBufferSource();
  n.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  n.connect(f);
  f.connect(pluckEnv(ctx, t, v, dur, dest));
  n.start(t, Math.random() * 1.8);
  n.stop(t + dur + 0.02);
}

/** 좌우 자리를 둔 출력. */
export function panned(ctx: BaseAudioContext, pan: number, dest: AudioNode): AudioNode {
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(dest);
  return p;
}

/** 새 지저귐: 내려가는 짧은 휘파람 2~4 번, 가끔 떨림. */
export function chirp(ctx: BaseAudioContext, t: number, v: number, dest: AudioNode): void {
  const kind = Math.random();
  const base = 2600 + Math.random() * 1800;
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const t0 = t + i * (0.09 + Math.random() * 0.05);
    const o = ctx.createOscillator();
    o.type = 'sine';
    if (kind < 0.6) {
      o.frequency.setValueAtTime(base * 1.25, t0);
      o.frequency.exponentialRampToValueAtTime(base * 0.8, t0 + 0.07);
    } else {
      o.frequency.setValueAtTime(base * 0.85, t0);
      o.frequency.exponentialRampToValueAtTime(base * 1.3, t0 + 0.05);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + 0.1);
  }
}

/** 풀벌레: 높은 음을 빠르게 세 번 끊어 운다. */
export function cricket(ctx: BaseAudioContext, t: number, v: number, dest: AudioNode): void {
  const f = 4300 + Math.random() * 700;
  for (let i = 0; i < 3; i++) {
    const t0 = t + i * 0.055;
    osc(ctx, 'sine', f, t0, t0 + 0.035, pluckEnv(ctx, t0, v, 0.035, dest));
  }
}

/** 망치질: 나무를 치는 "똑". */
export function knock(
  ctx: BaseAudioContext,
  noise: AudioBuffer,
  t: number,
  v: number,
  dest: AudioNode,
): void {
  burst(ctx, noise, t, 0.05, 'bandpass', 1900, 4, v, dest);
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(420, t);
  o.frequency.exponentialRampToValueAtTime(180, t + 0.06);
  o.connect(pluckEnv(ctx, t, v * 0.8, 0.08, dest));
  o.start(t);
  o.stop(t + 0.1);
}

/** 도끼질: 둔탁한 "턱". */
export function chop(
  ctx: BaseAudioContext,
  noise: AudioBuffer,
  t: number,
  v: number,
  dest: AudioNode,
): void {
  burst(ctx, noise, t, 0.12, 'bandpass', 700, 1.5, v, dest);
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
  o.connect(pluckEnv(ctx, t, v, 0.16, dest));
  o.start(t);
  o.stop(t + 0.18);
}

/** 잔 부딪힘. */
export function clink(ctx: BaseAudioContext, t: number, v: number, dest: AudioNode): void {
  const f = 2400 + Math.random() * 900;
  osc(ctx, 'sine', f, t, t + 0.25, pluckEnv(ctx, t, v, 0.25, dest));
  osc(ctx, 'sine', f * 2.3, t, t + 0.12, pluckEnv(ctx, t, v * 0.4, 0.12, dest));
}

/** 흔들이(8 분음표). */
export function shaker(
  ctx: BaseAudioContext,
  noise: AudioBuffer,
  t: number,
  v: number,
  dest: AudioNode,
): void {
  burst(ctx, noise, t, 0.045, 'highpass', 6500, 0.7, v, dest);
}

/** 박수: 여러 손이 조금씩 어긋나게. */
export function clap(
  ctx: BaseAudioContext,
  noise: AudioBuffer,
  t: number,
  v: number,
  dest: AudioNode,
): void {
  for (let i = 0; i < 3; i++)
    burst(ctx, noise, t + i * 0.012, 0.07, 'bandpass', 1400, 1.2, v, dest);
}

/** 두세 음 올림(완공 종·알림 방울). midis 를 gap 초 간격으로. */
export function jingle(
  ctx: BaseAudioContext,
  t: number,
  midis: readonly number[],
  gap: number,
  v: number,
  dest: AudioNode,
): void {
  midis.forEach((m, i) => musicbox(ctx, t + i * gap, midiHz(m), v, dest));
}
