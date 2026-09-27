// 도토리 마을 시뮬레이션 기본 시험 (TASKS DOT-002·003): 결정성, 이틀 진행, 파티, 경로 예산, 100 명.
import { describe, expect, it } from 'vitest';
import { PERF } from '../../src/dotori/data/balance';
import { newWorld } from '../../src/dotori/sim/create';
import { findPath, findPathRaw } from '../../src/dotori/sim/path';
import { run, step } from '../../src/dotori/sim/step';
import { TILE } from '../../src/dotori/sim/types';
import { getT, setT } from '../../src/dotori/sim/map';

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
    // 시작 칸을 모두 다르게 해서 캐시를 피한다(길 20 번 줄 위의 서로 다른 칸)
    for (let i = 0; i < PERF.pathsPerTick + 5; i++)
      if (findPath(w, 5 + i, 20, 40, 9) !== 'busy') ok++;
    expect(ok).toBe(PERF.pathsPerTick);
  });

  it('같은 경로는 캐시에서 꺼내 예산을 쓰지 않고, 타일이 바뀌면 캐시를 비운다', () => {
    const w = newWorld(7);
    w.pathBudget = 1;
    const a = findPath(w, 31, 20, 40, 9);
    expect(Array.isArray(a)).toBe(true);
    expect(w.pathBudget).toBe(0);
    const b = findPath(w, 31, 20, 40, 9);
    expect(b).toBe(a);
    expect(b).toEqual(findPathRaw(w, 31, 20, 40, 9));
    // 길 위 한 칸을 공사 자리로 바꾸면 캐시가 비고, 다시 찾으려면 예산이 든다
    setT(w, 35, 20, TILE.SITE);
    expect(findPath(w, 31, 20, 40, 9)).toBe('busy');
    w.pathBudget = 1;
    const c = findPath(w, 31, 20, 40, 9);
    expect(Array.isArray(c) && c.some((p) => p.x === 35 && p.y === 20)).toBe(false);
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
