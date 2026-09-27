// 생산 사슬 시험 (TASKS DOT-021~026, SPEC 9).
import { describe, expect, it } from 'vitest';
import { PRODUCE } from '../../src/dotori/data/balance';
import { place } from '../../src/dotori/sim/commands';
import { newWorld } from '../../src/dotori/sim/create';
import { getT } from '../../src/dotori/sim/map';
import {
  bakeTick,
  bakery,
  growthTick,
  mill,
  millTick,
  setCrop,
  tavern,
} from '../../src/dotori/sim/produce';
import { deserialize, serialize } from '../../src/dotori/sim/save';
import { run } from '../../src/dotori/sim/step';
import { TILE } from '../../src/dotori/sim/types';

const SEED = 20260926;

describe('작물 (SPEC 9.1)', () => {
  it('심은 칸은 시간이 지나 익는다', () => {
    const w = newWorld(SEED);
    const f = w.L.farm[0];
    if (!f) throw new Error('밭이 없다');
    setCrop(w, f.x, f.y, 1);
    for (w.t = 0; w.t < PRODUCE.stageTicks * 3 + PRODUCE.growEvery; w.t++) growthTick(w);
    expect(w.crop[f.y * w.W + f.x]).toBe(PRODUCE.ripe);
  });

  it('밭 일구기: 풀밭 3 × 3 이 빈 밭이 되고 농부가 심는다', () => {
    const w = newWorld(SEED);
    expect(place(w, 'farm', 50, 21, 's').ok).toBe(true);
    expect(getT(w, 51, 22)).toBe(TILE.FARM);
    expect(w.crop[22 * w.W + 51]).toBe(0);
    run(w, 1440 * 2);
    let planted = 0;
    for (let y = 21; y < 24; y++)
      for (let x = 50; x < 53; x++) if ((w.crop[y * w.W + x] ?? 0) > 0) planted++;
    expect(planted).toBeGreaterThan(0);
  });
});

describe('밀 → 방앗간 → 밀가루 → 빵 (SPEC 9.2~9.4)', () => {
  it('하루 동안 밀을 거두고 방앗간이 밀가루를 만들고 빵을 굽는다', () => {
    const w = newWorld(SEED);
    run(w, 1440);
    expect(w.tally.wheat).toBeGreaterThan(10);
    expect(mill(w).flour + bakery(w).flour).toBeGreaterThan(0);
    expect(w.tally.bread).toBeGreaterThan(5);
  });

  it('방앗간은 밀 1 을 밀가루 1 로 빻는다', () => {
    const w = newWorld(SEED);
    const m = mill(w);
    m.wheat = 3;
    const f0 = m.flour;
    for (w.t = 0; w.t < PRODUCE.millEvery * 3 + 1; w.t++) millTick(w);
    expect(m.wheat).toBe(0);
    expect(m.flour).toBe(f0 + 3);
  });

  it('밀가루가 없으면 빵이 늘지 않고 소식이 남는다(아침에 빵이 저절로 채워지지 않는다)', () => {
    const w = newWorld(SEED);
    const b = bakery(w);
    b.flour = 0;
    b.bread = 5;
    const baker = w.vs.find((v) => v.job === '제빵사');
    if (!baker) throw new Error('제빵사가 없다');
    w.t = PRODUCE.bakeEvery * 100;
    // 방앗간에 밀가루가 있으면 굽기를 멈추고 가지러 간다(true).
    mill(w).flour = 4;
    expect(bakeTick(w, baker)).toBe(true);
    mill(w).flour = 0;
    expect(bakeTick(w, baker)).toBe(false);
    expect(b.bread).toBe(5);
    expect(w.feed.some((e) => e.html.includes('밀가루가 떨어졌다'))).toBe(true);
  });
});

describe('생선과 주점 저녁상 (SPEC 9.5)', () => {
  it('이틀 동안 어부가 생선을 주점에 나르고 누군가 저녁상을 먹는다', () => {
    const w = newWorld(SEED);
    let ate = false;
    for (let d = 0; d < 2 * 24; d++) {
      run(w, 60);
      if (w.vs.some((v) => v.diary.some((e) => e.text.includes('생선구이')))) ate = true;
    }
    expect(w.tally.fish).toBeGreaterThan(5);
    expect(ate).toBe(true);
    expect(tavern(w).fish).toBeLessThanOrEqual(PRODUCE.fishCap);
  });
});

describe('새 장식을 궁금해하기 (SPEC 9.6)', () => {
  it('벤치가 완성되면 반나절 안에 누군가 처음 앉는다', () => {
    const w = newWorld(SEED);
    place(w, 'bench', 45, 22, 's');
    run(w, 900);
    const d = w.decor.find((e) => e.playerBuilt);
    expect(d?.firstUse).not.toBeNull();
  });
});

describe('저장 판 2 (SPEC 9.8)', () => {
  it('작물·재고·누계가 왕복한다', () => {
    const w = newWorld(SEED);
    run(w, 600);
    const b = deserialize(serialize(w));
    if (!b) throw new Error('불러오기 실패');
    expect(Array.from(b.crop)).toEqual(Array.from(w.crop));
    expect(mill(b).flour).toBe(mill(w).flour);
    expect(b.tally).toEqual(w.tally);
  });

  it('판 1 저장을 읽으면 밭은 2 단계, 재고는 처음값', () => {
    const w = newWorld(SEED);
    const raw = JSON.parse(serialize(w)) as Record<string, unknown>;
    raw.version = 1;
    delete raw.crop;
    delete raw.growth;
    delete raw.tally;
    const b = deserialize(JSON.stringify(raw));
    if (!b) throw new Error('판 1 을 읽지 못했다');
    const f = b.L.farm[0];
    if (!f) throw new Error('밭이 없다');
    expect(b.crop[f.y * b.W + f.x]).toBe(2);
    expect(b.tally.wheat).toBe(0);
  });
});
