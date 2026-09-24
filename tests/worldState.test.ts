import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import type { WorldStateData } from '../src/game/types';
import { computeWorldState, WorldStateSystem } from '../src/game/systems/WorldStateSystem';
import { at, bed, run, village, Y } from './helpers/village';

/** 기본 입력에 덮어쓴다. */
function state(over: Partial<Parameters<typeof computeWorldState>[0]> = {}): WorldStateData {
  return computeWorldState({
    population: 3,
    food: 6,
    accessibleBeds: 3,
    lastRaid: null,
    balance,
    ...over,
  });
}

describe('World State (TASK-039, MVP_SPEC 21)', () => {
  it('네 지표가 21.1 식대로 계산된다', () => {
    // food 6 / (3 × 2 × 2) = 50, 침대 2 / 3 = 66.7, 안전 100 → 행복 0.4·50 + 0.3·66.67 + 0.3·100 = 70
    expect(state({ accessibleBeds: 2 })).toEqual({
      foodLevel: 50,
      housingLevel: 67,
      safetyLevel: 100,
      happinessLevel: 70,
      population: 3,
    });
    // 넘치는 값은 100 으로 자른다
    expect(state({ food: 100, accessibleBeds: 10 })).toMatchObject({
      foodLevel: 100,
      housingLevel: 100,
    });
  });

  it('반올림은 마지막에 한 번만 한다(행복은 반올림 전 값으로 계산한다)', () => {
    // 주민 3: food 1 → 8.33, 침대 1 → 33.33, 안전 100 → 0.4·8.333 + 0.3·33.333 + 30 = 43.33 → 43
    // 반올림한 값(8, 33)으로 계산하면 42.1 → 42 가 된다
    expect(state({ food: 1, accessibleBeds: 1 }).happinessLevel).toBe(43);
  });

  it('population 0 에서 0 으로 나누지 않는다(식량·주거 100)', () => {
    const s = state({ population: 0, food: 0, accessibleBeds: 0 });
    expect(s).toEqual({
      foodLevel: 100,
      housingLevel: 100,
      safetyLevel: 100,
      happinessLevel: 100,
      population: 0,
    });
    expect(Object.values(s).every(Number.isFinite)).toBe(true);
  });

  it('food 가 줄면 foodLevel 이 내려가고, 주민이 늘면 housingLevel 이 내려간다', () => {
    expect(state({ food: 3 }).foodLevel).toBeLessThan(state({ food: 6 }).foodLevel);
    expect(state({ population: 4 }).housingLevel).toBeLessThan(
      state({ population: 3 }).housingLevel,
    );
  });

  it('습격 전에는 safetyLevel 100, 습격 뒤에는 도달하지 못한 비율이다', () => {
    expect(state().safetyLevel).toBe(100);
    const raid = { raidId: 1, total: 8, reached: 2, endedAtGameMinutes: 100 };
    expect(state({ lastRaid: raid }).safetyLevel).toBe(75);
    expect(state({ lastRaid: { ...raid, total: 0, reached: 0 } }).safetyLevel).toBe(100);
  });

  it('WorldState 에 변경 API 가 없다(계산기와 읽기만 있다)', () => {
    const methods = Object.getOwnPropertyNames(WorldStateSystem.prototype).filter(
      (n) => n !== 'constructor',
    );
    expect(methods.sort()).toEqual(['compute', 'current', 'update'].sort());
    // 원천 상태가 그대로면 다음 프레임에도 같은 값이 나온다
    const w = village(at(9));
    const snapshot = { ...w.worldState };
    run(w, 0.1);
    expect(w.worldState).toEqual(snapshot);
  });

  it('게임에서 accessibleBeds 는 Bedroom 의 facilities.beds 로만 센다(식사 연동 포함)', () => {
    const w = village(at(11, 50));
    w.spawnResident('farmer', { x: 20, y: Y, z: 20 });
    w.spawnResident('cook', { x: 21, y: Y, z: 20 });
    run(w, 0.2);
    expect(w.worldState).toMatchObject({ population: 2, housingLevel: 0, foodLevel: 0 });
    bed(w, 10, 10);
    run(w, 0.5);
    const beds = w.rooms.getByType('Bedroom').reduce((n, r) => n + r.facilities.beds.length, 0);
    expect(beds).toBe(1);
    expect(w.worldState.housingLevel).toBe(50);
    // 화덕·물통을 놓아 주방이 되면(주방 우선) 침대가 있어도 Bedroom 이 아니므로 0 이다
    w.voxels.setBlock(14, Y, 14, BlockId.cooking_stove, 'player');
    w.voxels.setBlock(13, Y, 14, BlockId.water_pot, 'player');
    run(w, 0.5);
    expect(w.worldState.housingLevel).toBe(0);
    // food 가 생기면 foodLevel 이 오르고, 점심을 먹으면 다시 내려간다
    w.storage.add('food', 8);
    run(w, 0.1);
    expect(w.worldState.foodLevel).toBe(100);
    w.clock.advanceTo(12, 0);
    run(w, 60, () => w.storage.get('food') <= 6);
    run(w, 0.1);
    expect(w.worldState.foodLevel).toBe(75);
  });

  it('값이 바뀔 때만 WORLD_STATE_CHANGED 를 발행한다', () => {
    const w = village(at(9));
    const seen: WorldStateData[] = [];
    w.events.on('WORLD_STATE_CHANGED', (s) => seen.push(s));
    run(w, 0.5);
    expect(seen).toHaveLength(0);
    w.spawnResident('farmer', { x: 20, y: Y, z: 20 });
    run(w, 0.5);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.population).toBe(1);
  });
});
