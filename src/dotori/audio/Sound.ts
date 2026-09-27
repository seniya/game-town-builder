// 마을 소리 (SPEC 12, ADR 053): 배경음악 스케줄러와 환경음. World 를 읽기만 한다(ui 와 같은 규칙).
// 브라우저 자동재생 정책 때문에 첫 누르기·키 입력에서 unlock() 을 불러야 소리가 난다.
import { MUSIC, SEASON_TRANSPOSE, type MoodDef } from '../data/music';
import { SOUND } from '../data/sound';
import { seasonOf } from '../sim/season';
import { hourOf } from '../sim/text';
import type { World } from '../sim/types';
import { composeSong, moodAt, type Song } from './compose';
import { mixAt, strikeSchedule, type Listener } from './mix';
import {
  chirp,
  chop,
  clap,
  clink,
  cricket,
  jingle,
  knock,
  makeImpulse,
  makeNoise,
  panned,
  playNote,
  shaker,
} from './synth';

/** 미리 예약하는 시간(초). 프레임이 늦어도 소리가 끊기지 않게 한다. */
const AHEAD = 0.35;
/** 시간대가 바뀐 뒤 다시 바꾸지 않는 최소 시간(초). 8× 에서 곡이 쉴 새 없이 바뀌지 않게 한다. */
const MIN_HOLD = 16;

interface Playing {
  song: Song;
  mood: MoodDef;
  gain: GainNode;
  /** 곡 첫 박의 시각. */
  t0: number;
  /** 다음에 예약할 음 번호와 남은 되풀이. */
  next: number;
  loop: number;
  /** 흔들이·박수를 예약한 마지막 8 분음표 번호. */
  perc: number;
}

/** 이어지는 소리 한 줄(잡음 → 필터 → 크기). */
interface Layer {
  gain: GainNode;
  filter: BiquadFilterNode;
}

export class SoundSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private layers: Record<'rain' | 'wind' | 'water' | 'tavern', Layer> | null = null;
  private play: Playing | null = null;
  private lastSwitch = -Infinity;
  private nextChirp = 0;
  private nextCricket = 0;
  private nextBabble = 0;
  private hits = new Map<number, number>();
  private festive = 0;
  on: boolean = SOUND.defaultOn;
  volume: number = SOUND.defaultVolume;
  private hidden = false;

  /** 저장된 켜기·음량을 읽는다(못 읽으면 기본값). */
  load(): void {
    try {
      const raw = window.localStorage.getItem(SOUND.saveKey);
      if (!raw) return;
      const d = JSON.parse(raw) as { on?: unknown; volume?: unknown };
      if (typeof d.on === 'boolean') this.on = d.on;
      if (typeof d.volume === 'number') this.volume = Math.max(0, Math.min(1, d.volume));
    } catch {
      // 저장소를 못 쓰는 환경: 기본값으로 둔다.
    }
  }

  /** 켜기·음량을 저장한다. */
  private save(): void {
    try {
      window.localStorage.setItem(
        SOUND.saveKey,
        JSON.stringify({ on: this.on, volume: this.volume }),
      );
    } catch {
      // 무시
    }
  }

  /** 첫 조작에서 소리 장치를 만든다(이미 있으면 다시 깨운다). */
  unlock(): void {
    if (!this.on) return;
    if (!this.ctx) this.build();
    if (this.ctx && this.ctx.state === 'suspended' && !this.hidden) void this.ctx.resume();
  }

  /** 소리가 실제로 나고 있는가(자동 관찰용). */
  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** 켜기/끄기. */
  setOn(on: boolean): void {
    this.on = on;
    this.save();
    if (on) this.unlock();
    this.applyVolume();
    if (!on && this.ctx) {
      const c = this.ctx;
      setTimeout(() => {
        if (!this.on) void c.suspend();
      }, 400);
    }
  }

  /** 음량(0~1). */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.save();
    this.applyVolume();
  }

  /** 창이 숨으면 멈추고, 보이면 잇는다. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else if (this.on) void this.ctx.resume();
  }

  /** 전체 음량을 반영한다(부드럽게). */
  private applyVolume(): void {
    if (!this.ctx || !this.master) return;
    const v = this.on ? this.volume * this.volume : 0;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.08);
  }

  /** 소리 장치와 버스·잔향·이어지는 소리 줄을 만든다. */
  private build(): void {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.noise = makeNoise(ctx);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(comp);
    this.master = master;
    const verb = ctx.createConvolver();
    verb.buffer = makeImpulse(ctx, 2.6, 2.4);
    verb.connect(master);
    const music = ctx.createGain();
    music.gain.value = SOUND.musicGain;
    music.connect(master);
    const mWet = ctx.createGain();
    mWet.gain.value = 0.32;
    music.connect(mWet);
    mWet.connect(verb);
    this.musicBus = music;
    const amb = ctx.createGain();
    amb.gain.value = SOUND.ambienceGain;
    amb.connect(master);
    const aWet = ctx.createGain();
    aWet.gain.value = 0.18;
    amb.connect(aWet);
    aWet.connect(verb);
    this.ambBus = amb;
    const layer = (type: BiquadFilterType, freq: number, q: number): Layer => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(amb);
      src.start(0, Math.random() * 1.9);
      return { gain, filter };
    };
    this.layers = {
      rain: layer('lowpass', 3200, 0.3),
      wind: layer('bandpass', 380, 0.8),
      water: layer('lowpass', 650, 0.6),
      tavern: layer('bandpass', 950, 1.6),
    };
    this.applyVolume();
  }

  /** 프레임마다: 배경음악 예약, 환경음 크기, 점 소리. speed 0 이면 망치·도끼는 멈춘다. */
  update(w: World, l: Listener, speed: number, clock: { t: number; rate: number }): void {
    const ctx = this.ctx;
    if (!ctx || !this.on || ctx.state !== 'running' || !this.noise) return;
    const now = ctx.currentTime;
    this.updateMusic(w, now);
    const mix = mixAt(w, l);
    this.festive = mix.festive;
    const L = this.layers;
    const amb = this.ambBus;
    if (!L || !amb) return;
    const set = (ly: Layer, v: number, k = 0.6): void => {
      ly.gain.gain.setTargetAtTime(v, now, k);
    };
    set(L.rain, mix.rain * 0.5);
    set(L.wind, mix.wind * 0.35, 1.2);
    L.wind.filter.frequency.setTargetAtTime(300 + Math.sin(now * 0.15) * 120, now, 1);
    set(L.water, mix.water * 0.45);
    // 주점: 웅성임 크기를 짧게 흔들어 말소리처럼 들리게 한다.
    if (now >= this.nextBabble) {
      this.nextBabble = now + 0.1 + Math.random() * 0.12;
      set(L.tavern, mix.tavern * (0.12 + Math.random() * 0.22), 0.05);
      L.tavern.filter.frequency.setTargetAtTime(700 + Math.random() * 900, now, 0.05);
      if (mix.tavern > 0.05 && Math.random() < 0.04) clink(ctx, now + 0.05, 0.12 * mix.tavern, amb);
    }
    // 새·풀벌레: 크기에 비례한 빈도로 띄엄띄엄.
    if (mix.birds > 0.01 && now >= this.nextChirp) {
      this.nextChirp = now + (0.6 + Math.random() * 2.2) / mix.birds;
      chirp(ctx, now + 0.05, 0.05 * mix.birds, panned(ctx, Math.random() * 1.4 - 0.7, amb));
    }
    if (mix.crickets > 0.01 && now >= this.nextCricket) {
      this.nextCricket = now + (0.35 + Math.random() * 0.5) / Math.max(0.3, mix.crickets);
      cricket(ctx, now + 0.05, 0.025 * mix.crickets, panned(ctx, Math.random() * 1.6 - 0.8, amb));
    }
    // 망치·도끼: 그리기와 같은 박자 함수로, 치는 순간에 맞춰 예약한다(SPEC 13.3).
    if (speed > 0) {
      const seen = new Set<number>();
      for (const p of mix.points) {
        seen.add(p.id);
        const plan = strikeSchedule(
          p.kind,
          p.id,
          clock.t,
          clock.rate,
          AHEAD,
          this.hits.get(p.id) ?? null,
        );
        for (const dt of plan.at) {
          const out = panned(ctx, p.pan, amb);
          const t = now + Math.max(0.01, dt);
          if (p.kind === 'hammer') knock(ctx, this.noise, t, 0.22 * p.gain, out);
          else chop(ctx, this.noise, t, 0.28 * p.gain, out);
        }
        if (plan.lastN != null) this.hits.set(p.id, plan.lastN);
      }
      for (const id of [...this.hits.keys()]) if (!seen.has(id)) this.hits.delete(id);
    }
  }

  /** 배경음악: 곡을 예약하고, 시간대가 바뀌면 마디 끝에서 엇갈려 바꾼다. */
  private updateMusic(w: World, now: number): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    const mood = moodAt(hourOf(w.t));
    const season = seasonOf(w.t).id;
    const tr = SEASON_TRANSPOSE[season];
    const P = this.play;
    const newSong = (t0: number): Playing => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(bus);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(1, t0 + (P ? MUSIC.crossfade : 1.5));
      const song = composeSong(mood, tr, Math.random, season === 'winter');
      return { song, mood, gain: g, t0, next: 0, loop: MUSIC.repeats, perc: -1 };
    };
    if (!P) {
      this.play = newSong(now + 0.1);
      this.lastSwitch = now;
    }
    const cur = this.play;
    if (!cur) return;
    const csec = 60 / cur.song.bpm;
    const songLen = cur.song.beats * csec;
    const noise = this.noise;
    if (!noise) return;
    // 음 예약.
    for (;;) {
      const n = cur.song.notes[cur.next];
      if (!n) {
        // 곡 끝: 되풀이하거나 같은 시간대의 새 곡.
        cur.t0 += songLen;
        cur.next = 0;
        cur.perc = -1;
        cur.loop--;
        if (cur.loop <= 0) {
          cur.song = composeSong(cur.mood, tr, Math.random, season === 'winter');
          cur.loop = MUSIC.repeats;
        }
        if (cur.t0 > now + AHEAD) break;
        continue;
      }
      const t = cur.t0 + n.beat * csec;
      if (t > now + AHEAD) break;
      if (t >= now - 0.05)
        playNote(
          ctx,
          cur.gain,
          noise,
          n.part,
          cur.mood.lead,
          cur.mood.arp,
          Math.max(t, now),
          n.midi,
          n.dur,
          csec,
          n.vel,
        );
      cur.next++;
    }
    const barSec = csec * 4;
    // 시간대가 바뀌었으면 다음 마디 끝에서 새 곡으로.
    if (cur.mood.id !== mood.id && now - this.lastSwitch > MIN_HOLD) {
      const bars = Math.ceil((now + AHEAD - cur.t0) / barSec);
      const at = cur.t0 + bars * barSec;
      if (at - now < AHEAD + 0.05) {
        const old = cur.gain;
        old.gain.setValueAtTime(old.gain.value, at);
        old.gain.linearRampToValueAtTime(0.0001, at + MUSIC.crossfade);
        setTimeout(() => old.disconnect(), (at - now + MUSIC.crossfade + 3) * 1000);
        this.play = newSong(at);
        this.lastSwitch = now;
        return;
      }
    }
    // 잔치 층: 흔들이 8 분음표, 박수 2·4 박.
    if (this.festive > 0.02) {
      const eighth = csec / 2;
      let k = Math.max(cur.perc + 1, Math.ceil((now - cur.t0) / eighth));
      for (; cur.t0 + k * eighth < now + AHEAD; k++) {
        const t = cur.t0 + k * eighth;
        shaker(ctx, noise, t, (k % 2 ? 0.05 : 0.08) * this.festive, cur.gain);
        if (k % 4 === 2) clap(ctx, noise, t, 0.12 * this.festive, cur.gain);
        cur.perc = k;
      }
    }
  }

  /** 공사 완공 종(SPEC 12.3): 세 음 올림, 멀어도 조금은 들린다. */
  done(gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.ambBus || ctx.state !== 'running') return;
    jingle(
      ctx,
      ctx.currentTime + 0.05,
      [84, 88, 91],
      0.12,
      0.22 * Math.max(SOUND.doneMin, gain),
      this.ambBus,
    );
  }

  /** 큰 순간 알림 방울: 두 음. */
  notice(): void {
    const ctx = this.ctx;
    if (!ctx || !this.ambBus || ctx.state !== 'running') return;
    jingle(ctx, ctx.currentTime + 0.05, [91, 96], 0.1, 0.12, this.ambBus);
  }
}
