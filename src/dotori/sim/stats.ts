// 마을 통계: 인구·빈 자리·행복·매력·목재·공사 수 (SPEC 4.1·4.4, HUD).
import { ARRIVAL } from '../data/balance';
import { charmOf } from './build';
import type { Villager, World } from './types';

/** 한 사람의 행복 = 네 욕구의 평균. */
export function happinessOf(v: Villager): number {
  return (v.hunger + v.energy + v.social + v.fun) / 4;
}

/** 통계를 다시 계산해 w.stats 에 넣는다. */
export function computeStats(w: World): void {
  const houses = w.buildings.filter((b) => b.kind === 'house');
  const pop = w.vs.length;
  const happy = pop ? w.vs.reduce((s, v) => s + happinessOf(v), 0) / pop : 0;
  w.stats = {
    pop,
    beds: houses.length * ARRIVAL.perHouse,
    happy: Math.round(happy),
    charm: charmOf(w),
    lumber: w.lumber,
    sites: w.blueprints.length,
  };
}
