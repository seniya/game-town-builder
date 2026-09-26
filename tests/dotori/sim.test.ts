// 도토리 마을 시뮬레이션 기본 시험 (TASKS DOT-002·003): 결정성, 이틀 진행, 파티, 경로 예산, 100 명.
import { describe, expect, it } from 'vitest';
import { PERF } from '../../src/dotori/data/balance';
import { newWorld } from '../../src/dotori/sim/create';
import { findPath } from '../../src/dotori/sim/path';
import { run, step } from '../../src/dotori/sim/step';
import { TILE } from '../../src/dotori/sim/types';
import { getT } from '../../src/dotori/sim/map';

describe('도토리 마을 시뮬레이션', () => {
  it('같은 시드는 같은 이야기를 만든다', () => {
    const a = newWorld(20260926);
    const b = newWorld(20260926);
    run(a, 1440);
    run(b, 1440);
    expect(a.feed.map((e) => e.html)).toEqual(b.feed.map((e) => e.html));
    expect(a.vs.map((v) => [v.x, v.y])).toEqual(b.vs.map((v) => [v.x, v.y]));
  });

  it('처음 마을: 주민 20 명, 집 10 채, 목재 30', () => {
    const w = newWorld(1);
    expect(w.vs.length).toBe(20);
    expect(w.buildings.filter((b) => b.kind === 'house').length).toBe(10);
    expect(w.lumber).toBe(30);
    for (const b of w.buildings) expect(getT(w, b.door.x, b.door.y)).toBe(TILE.DOOR);
  });

  it('이틀 동안 오류 없이 돌고 첫날 파티가 열린다', () => {
    const w = newWorld(20260926);
    let partyEnded = false;
    for (let i = 0; i < 2880; i++) {
      step(w);
      if (w.lastPartyCame != null) partyEnded = true;
      for (const v of w.vs) {
        expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
        expect(v.hunger).toBeGreaterThanOrEqual(0);
      }
    }
    expect(partyEnded).toBe(true);
    expect(w.feed.some((e) => e.html.includes('파티가 시작됐다'))).toBe(true);
    expect(w.feed.length).toBeGreaterThan(20);
  });

  it('한 틱의 경로 탐색은 예산을 넘지 않는다', () => {
    const w = newWorld(7);
    w.pathBudget = PERF.pathsPerTick;
    let ok = 0;
    for (let i = 0; i < PERF.pathsPerTick + 5; i++) if (findPath(w, 31, 20, 40, 9) !== 'busy') ok++;
    expect(ok).toBe(PERF.pathsPerTick);
  });

  it('주민 100 명 마을이 하루 동안 오류 없이 돈다', () => {
    const w = newWorld(3, { residents: 100 });
    expect(w.vs.length).toBe(100);
    expect(new Set(w.vs.map((v) => v.name)).size).toBe(100);
    expect(w.vs.every((v) => !/\d/.test(v.name))).toBe(true);
    run(w, 1440);
    expect(w.vs.every((v) => Number.isFinite(v.x))).toBe(true);
    expect(w.aff.get(99, 0)).not.toBe(Number.NaN);
  });
});
