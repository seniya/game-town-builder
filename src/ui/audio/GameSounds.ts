// 게임 소리 전체 (MVP_SPEC 30, TASK-050). 파일 에셋 없이 Web Audio 로 합성한다. 게임 상태를 소유하지 않고 이벤트만 구독한다.
//   블록 파괴·설치(재질 4 종) / 발소리(재질별) / 방 인식 성공(★ 전용, 리버브) / 방 해제 경고음 / 감사 포인트 짧은 벨
//   종(긴 종소리 + 리버브) / 습격 시작 스팅어 / 몬스터가 벽을 부수는 소리 / 낮·밤 BGM(생성 음악, 부드럽게 전환)
//   주민의 한마디 웅얼거림(역할별 음높이, 거리 감쇠, 동시 두 주민. TASK-BARK-002)
// 이벤트 안에서는 소리를 내지 않고 다음 작업으로 미룬다(방 판정·편집 예산에 오디오 비용을 섞지 않는다).
import type { EventBus } from '../../game/EventBus';
import type { BarkTopic, DayPhase, NPCRole } from '../../game/types';
import type { AudioEngine } from './AudioEngine';
import { barkBlips, BarkVoiceLimiter, barkVolume } from './barkVoice';
import { soundMaterial, type SoundMaterial } from './soundMaterial';

/** 재질별 파괴음 필터 중심 주파수·길이, 설치음 음높이. */
const MATERIAL: Record<SoundMaterial, { band: number; q: number; length: number; knock: number }> =
  {
    wood: { band: 900, q: 1.2, length: 0.18, knock: 180 },
    stone: { band: 2200, q: 0.8, length: 0.22, knock: 120 },
    soil: { band: 450, q: 0.7, length: 0.2, knock: 90 },
    glass: { band: 4200, q: 2.5, length: 0.26, knock: 620 },
  };

/** 방 인식 성공: 밝은 장3화음 아르페지오 위에 한 옥타브 위 종소리(Hz, 지연 초). */
const SUCCESS_NOTES: readonly (readonly [number, number])[] = [
  [523.25, 0],
  [659.25, 0.07],
  [783.99, 0.14],
  [1046.5, 0.24],
  [1318.5, 0.36],
];
/** 해제 경고: 낮게 내려가는 두 음. */
const WARN_NOTES: readonly (readonly [number, number])[] = [
  [392.0, 0],
  [277.18, 0.16],
];
/** 종의 배음(작은 교회 종에 가까운 비화성 배음)과 세기. */
const BELL_PARTIALS: readonly (readonly [number, number])[] = [
  [0.5, 0.5],
  [1, 1],
  [1.2, 0.6],
  [1.5, 0.45],
  [2, 0.35],
  [2.74, 0.25],
];
/** 낮 BGM: C 장조 펜타토닉 느린 아르페지오. 밤 BGM: A 단조의 낮고 느린 음. */
const DAY_SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33];
const NIGHT_SCALE = [220.0, 246.94, 261.63, 329.63, 349.23, 440.0];
/**
 * BGM 을 울리는가. 2026-09-25 오너 확인(HR-029)에서 "너무 기계적이다, 지금은 없는 게 낫다" 는 판단으로 끈다
 * (MVP_SPEC 30). 합성 코드는 음악을 다시 만들 때 참고하려고 남긴다.
 */
const BGM_ENABLED = false;

/** BGM 음 간격(초). */
const DAY_BEAT = 0.55;
const NIGHT_BEAT = 0.95;
/** 한마디 웅얼거림의 최대 음량과 동시에 내는 주민 수. */
const BARK_GAIN = 0.09;
const BARK_VOICES = 2;

/** 말한 주민의 목소리 조회: 역할과 듣는 위치(카메라)까지 거리. 없는 주민이면 null. */
export type BarkSpeaker = (npcId: string) => { role: NPCRole; distance: number } | null;

/** 소리를 모은다. */
export class GameSounds {
  private last: Record<string, number> = {};
  private bgmDay: GainNode | null = null;
  private bgmNight: GainNode | null = null;
  private night = false;
  private nextBeat = 0;
  private step = 0;
  private footDistance = 0;
  /** 동시에 웅얼거리는 주민 수 제한 */
  private readonly barkVoices = new BarkVoiceLimiter(BARK_VOICES);

  /** 엔진과 이벤트를 받는다. speaker 가 없으면 한마디 소리를 내지 않는다. */
  constructor(
    private readonly engine: AudioEngine,
    events: EventBus,
    private readonly speaker?: BarkSpeaker,
  ) {
    const later = (fn: () => void): void => queueMicrotask(fn);
    events.on('ROOM_REGISTERED', () => later(() => this.roomSuccess()));
    events.on('ROOM_TYPE_CHANGED', () => later(() => this.roomSuccess()));
    events.on('ROOM_UNREGISTERED', (p) => {
      // 합병은 새 방 등록음이 곧 따라오므로 경고음을 내지 않는다
      if (p.reason.reason !== 'MERGED') later(() => this.roomWarn());
    });
    events.on('BLOCK_CHANGED', (c) => {
      if (c.by === 'player' && c.from !== 0 && c.to === 0)
        later(() => this.breakSound(soundMaterial(c.from)));
      else if (c.by === 'player' && c.to !== 0) later(() => this.placeSound(soundMaterial(c.to)));
      else if (c.by === 'monster') later(() => this.crash(soundMaterial(c.from)));
    });
    events.on('GRATITUDE_GAINED', () => later(() => this.chime()));
    events.on('VILLAGE_LEVEL_UP', () => later(() => this.bell()));
    events.on('RAID_STARTED', () => later(() => this.stinger()));
    events.on('DAY_PHASE_CHANGED', (p) => void (this.night = isNight(p.phase)));
    events.on('NPC_BARK', (b) => later(() => this.bark(b.npcId, b.text, b.topic)));
  }

  /** 시작 시간대를 맞춘다. */
  setPhase(phase: DayPhase): void {
    this.night = isNight(phase);
  }

  /**
   * 매 프레임 부른다. BGM(현재 꺼짐)과 발소리를 이어 간다.
   * walked 는 이번 프레임에 땅 위를 걸은 수평 거리, ground 는 발밑 블록이다(발소리).
   */
  update(dt: number, walked: number, ground: number | null): void {
    const ctx = this.engine.ctx;
    if (!ctx) return;
    if (BGM_ENABLED) this.updateBgm(ctx);
    if (ground !== null && walked > 0) {
      this.footDistance += walked;
      if (this.footDistance >= 1.6) {
        this.footDistance = 0;
        this.footstep(soundMaterial(ground));
      }
    }
  }

  /** 방 인식 성공음 ★: 반짝이는 아르페지오 + 리버브. 같은 순간 여러 방이어도 한 번만. */
  private roomSuccess(): void {
    const ctx = this.throttle('success', 0.08);
    if (!ctx) return;
    const t0 = ctx.currentTime;
    SUCCESS_NOTES.forEach(([f, d], i) =>
      this.tone(ctx, f, t0 + d, 1.6 - i * 0.12, 0.3, 'sine', true),
    );
    this.tone(ctx, 130.81, t0, 1.2, 0.18, 'triangle', true);
  }

  /**
   * 주민의 한마디 웅얼거림. 듣는 위치에서 멀수록 작고 22 칸 밖은 내지 않는다.
   * 이미 두 주민이 웅얼거리는 중이면 건너뛴다(여럿이 한꺼번에 말해도 시끄럽지 않게).
   */
  private bark(npcId: string, text: string, topic: BarkTopic): void {
    const ctx = this.engine.ctx;
    const who = this.speaker?.(npcId);
    if (!ctx || !who) return;
    const volume = barkVolume(who.distance);
    if (volume <= 0) return;
    const t0 = ctx.currentTime;
    const blips = barkBlips(text, who.role, npcId, topic);
    const last = blips[blips.length - 1];
    if (!this.barkVoices.tryStart(t0, t0 + (last ? last.at + last.length : 0))) return;
    for (const b of blips) {
      this.tone(ctx, b.freq, t0 + b.at, b.length, BARK_GAIN * volume, 'triangle', false, 2400);
    }
  }

  /** 방 해제 경고음. */
  private roomWarn(): void {
    const ctx = this.throttle('warn', 0.08);
    if (!ctx) return;
    for (const [f, d] of WARN_NOTES)
      this.tone(ctx, f, ctx.currentTime + d, 0.3, 0.35, 'triangle', false, 1400);
  }

  /** 감사 포인트: 짧은 벨 두 음. */
  private chime(): void {
    const ctx = this.throttle('chime', 0.05);
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 1318.5, t, 0.45, 0.14, 'sine', true);
    this.tone(ctx, 1760, t + 0.06, 0.5, 0.1, 'sine', true);
  }

  /** 종을 세 번 친다(긴 종소리 + 리버브). */
  private bell(): void {
    const ctx = this.throttle('bell', 0.5);
    if (!ctx) return;
    for (let k = 0; k < 3; k++) {
      for (const [ratio, amp] of BELL_PARTIALS) {
        this.tone(
          ctx,
          523.25 * ratio,
          ctx.currentTime + k * 0.9,
          2.8 / Math.max(1, ratio),
          0.16 * amp,
          'sine',
          true,
        );
      }
    }
  }

  /** 습격 시작 스팅어: 낮게 떨어지는 불협 두 음과 북. */
  private stinger(): void {
    const ctx = this.throttle('stinger', 1);
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 164.81, t, 1.4, 0.3, 'sawtooth', true, 900);
    this.tone(ctx, 174.61, t + 0.02, 1.4, 0.25, 'sawtooth', true, 900);
    this.noise(ctx, t, 0.5, 120, 0.8, 0.5);
  }

  /** 플레이어가 부순 블록: 재질별 잡음 한 번. */
  private breakSound(m: SoundMaterial): void {
    const ctx = this.throttle(`break-${m}`, 0.03);
    if (!ctx) return;
    const s = MATERIAL[m];
    this.noise(ctx, ctx.currentTime, s.length, s.band, s.q, 0.45);
  }

  /** 플레이어가 놓은 블록: 재질별 짧은 두드림. */
  private placeSound(m: SoundMaterial): void {
    const ctx = this.throttle(`place-${m}`, 0.03);
    if (!ctx) return;
    const s = MATERIAL[m];
    this.tone(ctx, s.knock, ctx.currentTime, 0.09, 0.35, 'triangle', false, s.band);
    this.noise(ctx, ctx.currentTime, 0.05, s.band, s.q, 0.2);
  }

  /** 몬스터가 벽을 부쉈다: 둔탁하고 큰 파괴음. */
  private crash(m: SoundMaterial): void {
    const ctx = this.throttle('crash', 0.1);
    if (!ctx) return;
    const s = MATERIAL[m];
    this.noise(ctx, ctx.currentTime, 0.4, s.band * 0.6, 0.6, 0.7);
    this.tone(ctx, 70, ctx.currentTime, 0.25, 0.4, 'sine', false);
  }

  /** 발소리: 재질별 아주 짧은 잡음. */
  private footstep(m: SoundMaterial): void {
    const ctx = this.engine.ctx;
    if (!ctx) return;
    const s = MATERIAL[m];
    this.noise(ctx, ctx.currentTime, 0.06, s.band * 0.7, s.q, 0.12);
  }

  /** BGM 한 음: 부드러운 사인파 두 층. 낮은 밝은 음계, 밤은 낮고 느린 음계. */
  private bgmNote(ctx: AudioContext, at: number): void {
    this.step += 1;
    const pick = (scale: number[]): number =>
      scale[(this.step * 3 + (this.step >> 2)) % scale.length] ?? 261.63;
    if (this.bgmDay) this.pad(ctx, pick(DAY_SCALE), at, 1.6, this.bgmDay);
    if (this.bgmNight && this.step % 2 === 0)
      this.pad(ctx, pick(NIGHT_SCALE) / 2, at, 3.2, this.bgmNight);
  }

  /** BGM 을 이어 가고 낮·밤 층을 부드럽게 바꾼다. */
  private updateBgm(ctx: AudioContext): void {
    this.ensureBgm(ctx);
    const t = ctx.currentTime;
    this.bgmDay?.gain.setTargetAtTime(this.night ? 0 : 0.07, t, 1.5);
    this.bgmNight?.gain.setTargetAtTime(this.night ? 0.08 : 0, t, 1.5);
    if (this.nextBeat < t) this.nextBeat = t + 0.05;
    while (this.nextBeat < t + 0.2) {
      this.bgmNote(ctx, this.nextBeat);
      this.nextBeat += this.night ? NIGHT_BEAT : DAY_BEAT;
    }
  }

  /** BGM 층을 만든다. */
  private ensureBgm(ctx: AudioContext): void {
    const out = this.engine.wet;
    if (this.bgmDay || !out) return;
    this.bgmDay = ctx.createGain();
    this.bgmNight = ctx.createGain();
    this.bgmDay.gain.value = 0;
    this.bgmNight.gain.value = 0;
    this.bgmDay.connect(out);
    this.bgmNight.connect(out);
  }

  /** 부드럽게 들어오고 사라지는 음. */
  private pad(ctx: AudioContext, freq: number, at: number, length: number, out: AudioNode): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(1, at + length * 0.3);
    g.gain.linearRampToValueAtTime(0, at + length);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }

  /** 음 하나. reverb 면 리버브 경로, filterHz 가 있으면 저역 필터를 거친다. */
  private tone(
    ctx: AudioContext,
    freq: number,
    at: number,
    length: number,
    gain: number,
    type: OscillatorType,
    reverb: boolean,
    filterHz?: number,
  ): void {
    const out = reverb ? this.engine.wet : this.engine.dry;
    if (!out) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    let node: AudioNode = osc;
    if (filterHz !== undefined) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterHz;
      node = node.connect(f);
    }
    node.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + length + 0.02);
  }

  /** 대역 통과 잡음 한 번(파괴·발소리·북). */
  private noise(
    ctx: AudioContext,
    at: number,
    length: number,
    band: number,
    q: number,
    gain: number,
  ): void {
    const out = this.engine.dry;
    if (!out) return;
    const n = Math.max(1, Math.floor(ctx.sampleRate * length));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = band;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(out);
    src.start(at);
  }

  /** 같은 소리를 interval 초 안에 다시 내지 않는다. 준비된 AudioContext 를 돌려준다. */
  private throttle(key: string, interval: number): AudioContext | null {
    const ctx = this.engine.ctx;
    if (!ctx) return null;
    const t = ctx.currentTime;
    if (t - (this.last[key] ?? -1) < interval) return null;
    this.last[key] = t;
    return ctx;
  }
}

/** 밤 BGM 을 쓰는 시간대. */
export function isNight(phase: DayPhase): boolean {
  return phase === 'night' || phase === 'evening';
}
