// 소리 시험 (TASKS DOT-051, SPEC 12.2·12.3): 곡 짓기와 환경음 크기는 Web Audio 없이 node 에서 확인한다.
import { describe, expect, it } from 'vitest';
import { chordPcs, composeSong, leadPitches, moodAt } from '../../src/dotori/audio/compose';
import { atten, hearing, mixAt, type Listener } from '../../src/dotori/audio/mix';
import { MOODS, MUSIC, SEASON_TRANSPOSE } from '../../src/dotori/data/music';
import { SOUND } from '../../src/dotori/data/sound';
import { newWorld } from '../../src/dotori/sim/create';
import type { World } from '../../src/dotori/sim/types';

/** 시드 난수(mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 1440;
/** 광장 위를 가까이서 보는 카메라. */
const NEAR: Listener = { x: 31, z: 16, dist: 20, rx: 1, rz: 0 };

describe('곡 짓기', () => {
  it('시간대: 5 시 아침, 11 시 낮, 17 시 저녁, 20 시와 새벽 3 시는 밤', () => {
    expect([5, 10.9, 11, 17, 20, 23.5, 3].map((h) => moodAt(h).id)).toEqual([
      'morning',
      'morning',
      'day',
      'evening',
      'night',
      'night',
      'night',
    ]);
  });

  it('8 마디(32 박) 안에 음이 있고, 앞소리는 음계 안·음역 안이다', () => {
    for (const mood of MOODS)
      for (const tr of Object.values(SEASON_TRANSPOSE)) {
        const song = composeSong(mood, tr, rng(7), true);
        expect(song.beats).toBe(MUSIC.bars * 4);
        const scale = new Set(leadPitches(mood, tr));
        for (const n of song.notes) {
          expect(n.beat).toBeGreaterThanOrEqual(0);
          // 앞소리·베이스는 곡 안에서 끝난다(분산화음·패드·종은 여운이 넘쳐도 된다).
          if (n.part === 'lead' || n.part === 'bass')
            expect(n.beat + n.dur).toBeLessThanOrEqual(32);
          else expect(n.beat).toBeLessThan(32);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
          if (n.part === 'lead') expect(scale.has(n.midi)).toBe(true);
        }
      }
  });

  it('강박의 앞소리는 그 마디 화음의 구성음이고, 마지막 음은 으뜸음이다', () => {
    const mood = moodAt(8);
    for (let s = 1; s <= 20; s++) {
      const song = composeSong(mood, 0, rng(s));
      const lead = song.notes.filter((n) => n.part === 'lead');
      for (const n of lead) {
        if (n.beat % 2 !== 0) continue;
        const bar = Math.floor(n.beat / 4);
        const ch = chordPcs(mood, mood.prog[bar % mood.prog.length] ?? 0, 0);
        expect(ch).toContain(n.midi % 12);
      }
      const last = lead[lead.length - 1];
      expect((last?.midi ?? 0) % 12).toBe(mood.root % 12);
      expect((last?.beat ?? 0) + (last?.dur ?? 0)).toBe(32);
    }
  });

  it('A 와 마지막 A 는 같은 리듬이다(짜임 A A′ B A)', () => {
    const song = composeSong(moodAt(12), 0, rng(3));
    const at = (from: number, to: number): number[] =>
      song.notes
        .filter((n) => n.part === 'lead' && n.beat >= from && n.beat < to)
        .map((n) => n.beat - from);
    expect(at(24, 32)).toEqual(at(0, 8));
    expect(at(8, 16)).toEqual(at(0, 8));
  });

  it('같은 난수면 같은 곡, 다른 난수면 다른 곡', () => {
    const m = moodAt(18);
    const a = JSON.stringify(composeSong(m, 0, rng(11)).notes);
    expect(JSON.stringify(composeSong(m, 0, rng(11)).notes)).toBe(a);
    expect(JSON.stringify(composeSong(m, 0, rng(12)).notes)).not.toBe(a);
  });

  it('겨울 종은 bell=true 일 때만 나온다', () => {
    const m = moodAt(21);
    const has = (b: boolean): boolean =>
      [1, 2, 3, 4, 5].some((s) =>
        composeSong(m, -4, rng(s), b).notes.some((n) => n.part === 'bell'),
      );
    expect(has(true)).toBe(true);
    expect(has(false)).toBe(false);
  });
});

describe('환경음 크기', () => {
  /** t 시각의 새 마을(비 없음). */
  function at(day: number, hour: number): World {
    const w = newWorld(20260926);
    w.t = (day - 1) * DAY + hour * 60;
    w.weather.rain = false;
    w.party = null;
    return w;
  }

  it('가까울수록 크고, 반경 밖이면 0, 멀리 볼수록 작다', () => {
    const { R, zoom } = hearing(NEAR);
    expect(atten(NEAR, NEAR.x, NEAR.z).gain).toBeCloseTo(zoom);
    expect(atten(NEAR, NEAR.x + R + 1, NEAR.z).gain).toBe(0);
    expect(atten(NEAR, NEAR.x + 3, NEAR.z).pan).toBeGreaterThan(0);
    const far = { ...NEAR, dist: 80 };
    expect(atten(far, far.x, far.z).gain).toBeCloseTo(SOUND.zoomMin);
  });

  it('봄 낮에는 새, 여름 밤에는 풀벌레, 겨울 밤에는 풀벌레가 없다', () => {
    const spring = mixAt(at(2, 9), NEAR);
    expect(spring.birds).toBeGreaterThan(0.5);
    expect(spring.crickets).toBe(0);
    expect(mixAt(at(9, 22), NEAR).crickets).toBeGreaterThan(0.5);
    expect(mixAt(at(9, 22), NEAR).birds).toBe(0);
    expect(mixAt(at(23, 22), NEAR).crickets).toBe(0);
  });

  it('비가 오면 빗소리, 겨울에는 빗소리 대신 바람이 세다', () => {
    const w = at(3, 12);
    w.weather.rain = true;
    const r = mixAt(w, NEAR);
    expect(r.rain).toBe(SOUND.rain);
    expect(r.birds).toBe(0);
    const s = at(23, 12);
    s.weather.rain = true;
    const m = mixAt(s, NEAR);
    expect(m.rain).toBe(0);
    expect(m.wind).toBe(SOUND.windSnow);
  });

  it('호숫가를 보면 물소리, 광장을 보면 작다', () => {
    const w = at(2, 12);
    const p = w.L.water[Math.floor(w.L.water.length / 2)];
    if (!p) throw new Error('물 없음');
    expect(mixAt(w, { ...NEAR, x: p.x, z: p.y }).water).toBeGreaterThan(0.8);
    expect(mixAt(w, NEAR).water).toBeLessThan(0.3);
  });

  it('주점 안에 사람이 있으면 웅성임, 잔치 중 광장이면 잔치 층', () => {
    const w = at(2, 20);
    const tav = w.buildings.find((b) => b.kind === 'tavern');
    if (!tav) throw new Error('주점 없음');
    const L = { ...NEAR, x: tav.x + tav.w / 2, z: tav.y + tav.h / 2 };
    expect(mixAt(w, L).tavern).toBe(0);
    for (const v of w.vs.slice(0, 6)) v.inside = tav.id;
    expect(mixAt(w, L).tavern).toBeGreaterThan(0.8);
    w.party = {
      host: 0,
      start: w.t - 10,
      end: w.t + 100,
      rumor: 0,
      att: new Set(),
      prepLogged: true,
      startLogged: true,
    };
    expect(mixAt(w, NEAR).festive).toBeGreaterThan(0.8);
  });

  it('짓는 목수는 망치, 나무꾼은 도끼 — 가까운 사람만, 최대 수까지', () => {
    const w = at(2, 10);
    w.vs.forEach((v, i) => {
      v.inside = null;
      v.talk = null;
      v.x = NEAR.x + (i % 5);
      v.y = NEAR.z;
      v.act = {
        ...(v.act ?? ({} as NonNullable<typeof v.act>)),
        type: i < 8 ? 'build' : 'work',
        phase: 'do',
      };
      if (i >= 8) v.job = '나무꾼';
    });
    const m = mixAt(w, NEAR);
    expect(m.points.filter((p) => p.kind === 'hammer').length).toBe(SOUND.hammerMax);
    expect(m.points.filter((p) => p.kind === 'axe').length).toBe(SOUND.axeMax);
    const far = mixAt(w, { ...NEAR, x: NEAR.x + 60 });
    expect(far.points.length).toBe(0);
  });
});
