// 생산과 성장 잇기 시험 (TASKS DOT-030~032, SPEC 10).
import { describe, expect, it } from 'vitest';
import { FOOD, MEALS, PRODUCE } from '../../src/dotori/data/balance';
import { startAct } from '../../src/dotori/sim/act';
import { arrivalCheck, arrivalLimit } from '../../src/dotori/sim/arrival';
import { checkPlace } from '../../src/dotori/sim/build';
import { place } from '../../src/dotori/sim/commands';
import { newWorld } from '../../src/dotori/sim/create';
import { mk } from '../../src/dotori/sim/decide';
import { bakery, foodOf, mill, tavern } from '../../src/dotori/sim/produce';
import { computeStats } from '../../src/dotori/sim/stats';
import { run } from '../../src/dotori/sim/step';
import type { Villager, World } from '../../src/dotori/sim/types';
import { bld } from '../../src/dotori/sim/world';

const SEED = 20260926;

/** 주민을 건물 문 앞에 세우고 그 건물에서 먹기 시작하게 한다. 식사 시작 뒤의 즐거움을 돌려준다. */
function eatAt(w: World, v: Villager, bldId: number, where: 'home' | 'bakery' | 'tavern'): number {
  const b = bld(w, bldId);
  if (!b) throw new Error('건물이 없다');
  v.x = v.px = b.door.x + 0.5;
  v.y = v.py = b.door.y + 0.5;
  v.fun = 50;
  v.social = 50;
  v.hunger = 30;
  w.pathBudget = 16;
  v.inside = null;
  startAct(w, v, mk(w, 'eat', { bld: bldId, dur: 25, where }));
  expect(v.act?.phase).toBe('do');
  return v.fun;
}

/** 빈 풀밭에 집 청사진을 n 채 놓는다. */
function placeHouses(w: World, n: number): void {
  let left = n;
  for (let y = 22; y < 48 && left > 0; y += 4)
    for (let x = 44; x < 76 && left > 0; x += 4)
      if (checkPlace(w, 'house', x, y, 's').ok && place(w, 'house', x, y, 's').ok) left--;
}

/** 매력이 이사 조건보다 모자라지 않도록 꽃밭을 놓는다. */
function keepCharm(w: World): void {
  if (w.stats.charm >= w.vs.length * 0.5 + 3) return;
  for (let y = 10; y < 45; y += 3)
    for (let x = 40; x < 76; x += 3)
      if (checkPlace(w, 'flowerbed', x, y, 's').ok && place(w, 'flowerbed', x, y, 's').ok) return;
}

describe('먹은 것이 기분으로 (SPEC 10.1, DOT-030)', () => {
  it('빵집·주점에서 먹으면 집밥보다 즐거움이 높다', () => {
    const w = newWorld(SEED);
    const [a, b, c] = w.vs;
    if (!a || !b || !c) throw new Error('주민이 없다');
    bakery(w).bread = 10;
    tavern(w).fish = 10;
    const home = eatAt(w, a, a.home, 'home');
    const bread = eatAt(w, b, bakery(w).id, 'bakery');
    const supper = eatAt(w, c, tavern(w).id, 'tavern');
    expect(home).toBe(50);
    expect(bread).toBe(50 + MEALS.bakery.fun);
    expect(supper).toBe(50 + MEALS.tavern.fun);
    expect(b.social).toBe(50 + MEALS.bakery.social);
    expect(w.tally.breadEaten).toBeGreaterThan(0);
    expect(w.tally.suppers).toBe(1);
  });

  it('빵이 없는 빵집에서는 보너스가 없다', () => {
    const w = newWorld(SEED);
    const v = w.vs[0];
    if (!v) throw new Error('주민이 없다');
    bakery(w).bread = 0;
    expect(eatAt(w, v, bakery(w).id, 'bakery')).toBe(50);
  });
});

describe('먹을 것이 이사로 (SPEC 10.2, DOT-031)', () => {
  it('먹거리 여유 단계: 빠듯 · 알맞음 · 넉넉', () => {
    const w = newWorld(SEED);
    const pop = w.vs.length;
    tavern(w).fish = 0;
    bakery(w).bread = Math.floor(pop * FOOD.tightBelow) - 1;
    expect(foodOf(w).level).toBe('tight');
    bakery(w).bread = Math.ceil(pop * FOOD.tightBelow);
    expect(foodOf(w).level).toBe('ok');
    bakery(w).bread = Math.ceil(pop * FOOD.plentyFrom);
    expect(foodOf(w).level).toBe('plenty');
  });

  it('빠듯하면 빈 집이 있어도 이사 오지 않고, 넉넉하면 하루 최대 수가 는다', () => {
    const w = newWorld(SEED);
    w.lumber = 400;
    placeHouses(w, 1);
    run(w, 1440);
    expect(w.buildings.some((b) => b.kind === 'house' && b.residents.length < 2)).toBe(true);
    w.arrivalsToday = 0;
    bakery(w).bread = 0;
    tavern(w).fish = 0;
    expect(arrivalCheck(w).reason).toBe('food');
    bakery(w).bread = PRODUCE.breadCap;
    tavern(w).fish = PRODUCE.fishCap;
    computeStats(w);
    expect(arrivalLimit(w)).toBe(FOOD.plentyMaxPerDay);
  });

  it('먹거리가 넉넉한 마을이 모자란 마을보다 10 일 뒤 인구가 많다', () => {
    /** 같은 시드로 집을 계속 짓는 마을. starve 면 빵·생선을 만드는 일손이 없다. */
    const grow = (starve: boolean): World => {
      const w = newWorld(SEED);
      w.lumber = 200;
      if (starve) {
        for (const v of w.vs) if (v.job === '제빵사' || v.job === '어부') v.job = '한량';
        bakery(w).bread = 0;
        bakery(w).flour = 0;
        mill(w).flour = 0;
        tavern(w).fish = 0;
      }
      for (let d = 0; d < 20; d++) {
        if (w.blueprints.filter((b) => b.kind === 'house').length < 2) placeHouses(w, 1);
        keepCharm(w);
        run(w, 720);
      }
      return w;
    };
    const fed = grow(false);
    const hungry = grow(true);
    expect(fed.vs.length).toBeGreaterThan(hungry.vs.length + 5);
    expect(hungry.feed.some((e) => e.html.includes('빵집 빵이 넉넉하면'))).toBe(true);
  }, 30000);
});

describe('성장 고리 (SPEC 10.3, DOT-032)', () => {
  it('10 일 동안 밀가루가 방앗간에 쌓이기만 하지 않고 구운 빵이 먹힌다', () => {
    const w = newWorld(777);
    w.lumber = 200;
    const flour: number[] = [];
    for (let d = 0; d < 20; d++) {
      if (w.blueprints.filter((b) => b.kind === 'house').length < 2) placeHouses(w, 1);
      keepCharm(w);
      run(w, 720);
      flour.push(mill(w).flour);
    }
    // 방앗간 밀가루가 창고 용량에 붙어 있지 않은 때가 절반을 넘는다.
    expect(flour.filter((f) => f < PRODUCE.millFlourCap).length).toBeGreaterThan(flour.length / 2);
    expect(w.tally.bread).toBeGreaterThan(300);
    expect(w.tally.breadEaten).toBeGreaterThan(w.tally.bread * 0.9);
    expect(w.vs.length).toBeGreaterThan(35);
  }, 30000);
});
