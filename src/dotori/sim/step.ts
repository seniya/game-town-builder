// 한 틱(게임 1 분)의 순서 (ARCHITECTURE 3).
import { PERF, TIME } from '../data/balance';
import { actTick } from './act';
import { arrivalTick } from './arrival';
import { morning, needsTick, partyTick, weatherTick } from './events';
import { convTick, socialTick } from './social';
import { computeStats } from './stats';
import { hourOf } from './text';
import type { World } from './types';

/** 시뮬레이션을 한 틱 진행한다. */
export function step(w: World): void {
  w.t++;
  const h = hourOf(w.t);
  if (w.t % 1440 === TIME.morningMinute) morning(w);
  weatherTick(w);
  partyTick(w);
  arrivalTick(w);
  for (const v of w.vs) {
    v.px = v.x;
    v.py = v.y;
    needsTick(w, v, h);
  }
  w.pathBudget = PERF.pathsPerTick;
  for (const v of w.vs) actTick(w, v, h);
  socialTick(w);
  convTick(w);
  if (w.t % 60 === 0) computeStats(w);
}

/** n 틱 진행한다(시험·빨리 감기). */
export function run(w: World, n: number): void {
  for (let i = 0; i < n; i++) step(w);
}
