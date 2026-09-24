import { describe, expect, it } from 'vitest';
import { EatAction } from '../src/game/actions/EatAction';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import type { GameWorld } from '../src/game/GameWorld';
import { currentMealId } from '../src/game/systems/MealSystem';
import { at, run, village, Y } from './helpers/village';

// 시험 마을의 방(내부 x 10~14, z 10~14, 문 남쪽)에 식탁 하나와 의자를 놓으면 DiningRoom 이 된다
const TABLE = { x: 12, y: Y, z: 12 };
const CHAIRS = [
  { x: 11, y: Y, z: 12 },
  { x: 13, y: Y, z: 12 },
];
const HOUR = balance.clock.secondsPerGameHour;

/** 방에 식탁과 의자 chairs 개를 놓는다. */
function diningRoom(w: GameWorld, chairs = CHAIRS): void {
  w.voxels.setBlock(TABLE.x, TABLE.y, TABLE.z, BlockId.table, 'player');
  for (const c of chairs) w.voxels.setBlock(c.x, c.y, c.z, BlockId.chair, 'player');
  run(w, 0.3);
}

/** 주민 n 명과 (선택) 식당. 시작 11:55, food 는 opts.food. */
function scene(
  opts: { dining?: boolean; food?: number; residents?: number; chairs?: typeof CHAIRS } = {},
): {
  w: GameWorld;
  ids: string[];
} {
  const w = village(at(11, 55), true);
  if (opts.dining ?? true) diningRoom(w, opts.chairs ?? CHAIRS);
  if (opts.food) w.storage.add('food', opts.food);
  const roles = ['farmer', 'cook', 'carpenter'] as const;
  const ids: string[] = [];
  for (let i = 0; i < (opts.residents ?? 2); i++) {
    ids.push(w.spawnResident(roles[i % 3] ?? 'villager', { x: 20 + i, y: Y, z: 22 }).id);
  }
  return { w, ids };
}

/** 현재 Action 종류. */
function kindOf(w: GameWorld, id: string): string {
  return w.registry.npcs.get(id)?.action.kind ?? 'none';
}

/** 12:00 이 될 때까지 진행한다. */
function untilNoon(w: GameWorld): void {
  run(w, HOUR, () => w.meal.active);
  expect(currentMealId(w.clock)).toBe('1:lunch');
}

describe('식사 (TASK-032, MVP_SPEC 17)', () => {
  it('12:00 에 식당 의자로 걸어가 앉아 먹는다: 주민마다 food −1, 식탁 위에는 블록을 놓지 않는다', () => {
    const { w, ids } = scene({ food: 5 });
    expect(w.rooms.getByType('DiningRoom')).toHaveLength(1);
    run(w, 1);
    expect(ids.every((id) => kindOf(w, id) !== 'eat')).toBe(true);
    untilNoon(w);
    run(w, 0.3);
    expect(w.registry.npcs.get(ids[0] as string)?.action.label).toBe('식당으로 가는 중');
    run(w, 40, () => ids.every((id) => kindOf(w, id) === 'eat'));
    expect(w.storage.get('food')).toBe(3);
    const seats = new Set<string>();
    for (const id of ids) {
      const npc = w.registry.npcs.get(id);
      expect(npc?.action).toBeInstanceOf(EatAction);
      expect(npc?.action.label).toBe('식당에서 먹는 중');
      // 앉는 자세는 렌더용 facilityUse 이고, 식탁을 바라본다
      expect(npc?.action.facilityUse?.pose).toBe('sit');
      expect(npc?.action.lookAt).toMatchObject({ x: TABLE.x + 0.5, z: TABLE.z + 0.5 });
      seats.add(npc?.action.facilityUse?.objectId ?? '');
      expect(npc?.hasEatenThisMeal).toBe(true);
    }
    // 같은 의자를 두 명이 쓰지 않는다
    expect(seats.size).toBe(2);
    expect(w.npcSystem.facilityClaims).toBe(2);
    // 음식은 연출이다: 식탁 위 칸은 비어 있다
    expect(w.voxels.getBlock(TABLE.x, TABLE.y + 1, TABLE.z)).toBe(BlockId.air);
    // 먹고 나서 구간 안에서는 다시 먹지 않는다
    run(w, HOUR * 0.9);
    expect(w.storage.get('food')).toBe(3);
    expect(ids.every((id) => kindOf(w, id) !== 'eat')).toBe(true);
    expect(w.npcSystem.facilityClaims).toBe(0);
  });

  it('DiningRoom 이 없으면 광장에서 먹는다', () => {
    const { w, ids } = scene({ dining: false, food: 5 });
    untilNoon(w);
    run(w, 40, () => ids.every((id) => kindOf(w, id) === 'eat'));
    for (const id of ids) {
      const a = w.registry.npcs.get(id)?.action;
      expect(a?.label).toBe('광장에서 먹는 중');
      expect(a?.pose).toBe('sit');
      expect(a?.facilityUse).toBeUndefined();
    }
    expect(w.storage.get('food')).toBe(3);
  });

  it('food 가 0 이면 먹지 않고 넘어가며 게임은 계속 진행된다', () => {
    const { w, ids } = scene({ food: 0 });
    untilNoon(w);
    run(w, HOUR * 1.1);
    expect(w.meal.active).toBe(false);
    expect(ids.every((id) => kindOf(w, id) !== 'eat')).toBe(true);
    expect(w.registry.npcs.get(ids[0] as string)?.hasEatenThisMeal).toBe(false);
    expect(w.storage.get('food')).toBe(0);
  });

  it('food 가 주민보다 적으면 있는 만큼만 먹고 나머지는 넘어간다', () => {
    const { w, ids } = scene({ food: 1 });
    untilNoon(w);
    run(w, 40, () => ids.some((id) => kindOf(w, id) === 'eat'));
    run(w, 5);
    const eaten = ids.filter((id) => w.registry.npcs.get(id)?.hasEatenThisMeal);
    expect(eaten).toHaveLength(1);
    expect(w.storage.get('food')).toBe(0);
  });

  it('의자가 모자라면 남는 주민은 광장에서 먹는다(같은 의자를 동시에 예약하지 않는다)', () => {
    const { w, ids } = scene({ food: 5, residents: 3 });
    untilNoon(w);
    run(w, 60, () => ids.every((id) => kindOf(w, id) === 'eat'));
    const labels = ids.map((id) => w.registry.npcs.get(id)?.action.label).sort();
    expect(labels).toEqual(['광장에서 먹는 중', '식당에서 먹는 중', '식당에서 먹는 중']);
    expect(w.storage.get('food')).toBe(2);
  });

  it('저녁(18:00)에는 새 끼니로 플래그가 초기화되어 다시 먹는다', () => {
    const { w, ids } = scene({ food: 6 });
    untilNoon(w);
    run(w, 40, () => ids.every((id) => kindOf(w, id) === 'eat'));
    expect(w.storage.get('food')).toBe(4);
    w.clock.advanceTo(17, 58);
    run(w, HOUR * 0.2, () => w.meal.active);
    expect(currentMealId(w.clock)).toBe('1:dinner');
    // 식당 의자 앞에 서 있던 주민은 같은 프레임에 다시 앉아 먹는다. 새 mealId 와 food 감소로 초기화를 확인한다
    run(w, 40, () => ids.every((id) => kindOf(w, id) === 'eat'));
    expect(ids.every((id) => w.registry.npcs.get(id)?.mealId === '1:dinner')).toBe(true);
    expect(w.storage.get('food')).toBe(2);
  });

  it('로드로 같은 구간에 다시 들어와도(mealId 가 같으면) 플래그를 초기화하지 않는다', () => {
    const { w, ids } = scene({ food: 5 });
    untilNoon(w);
    const npc = w.registry.npcs.get(ids[0] as string);
    if (!npc) throw new Error('주민 없음');
    // 저장된 값의 복원을 흉내 낸다: 이번 구간에 이미 먹었다
    npc.mealId = currentMealId(w.clock);
    npc.hasEatenThisMeal = true;
    run(w, 40, () => kindOf(w, ids[1] as string) === 'eat');
    run(w, 1);
    expect(npc.hasEatenThisMeal).toBe(true);
    expect(kindOf(w, npc.id)).not.toBe('eat');
    expect(w.storage.get('food')).toBe(4);
  });

  it('의자로 가는 중 식당이 해제되면 의자 예약이 풀리고 광장에서 먹는다', () => {
    const { w, ids } = scene({ food: 5, residents: 1 });
    const id = ids[0] as string;
    untilNoon(w);
    run(w, 0.3);
    expect(kindOf(w, id)).toBe('move');
    expect(w.npcSystem.facilityClaims).toBe(1);
    // 식탁을 치우면 식당 조건이 깨진다
    w.voxels.setBlock(TABLE.x, TABLE.y, TABLE.z, BlockId.air, 'player');
    run(w, 0.5);
    expect(w.rooms.getByType('DiningRoom')).toHaveLength(0);
    run(w, 60, () => kindOf(w, id) === 'eat');
    expect(w.registry.npcs.get(id)?.action.label).toBe('광장에서 먹는 중');
    expect(w.npcSystem.facilityClaims).toBe(0);
  });

  it('식사를 마친 뒤 13:00 에는 역할 작업으로 돌아간다(요리사는 식사 여부와 무관하게 조리한다)', () => {
    const { w, ids } = scene({ food: 0 });
    // 주방도 만든다: 방 안에 화덕·물통이 있으면 주방이 우선이므로 식당을 치운다
    w.voxels.setBlock(TABLE.x, TABLE.y, TABLE.z, BlockId.air, 'player');
    for (const c of CHAIRS) w.voxels.setBlock(c.x, c.y, c.z, BlockId.air, 'player');
    w.voxels.setBlock(14, Y, 14, BlockId.cooking_stove, 'player');
    w.voxels.setBlock(13, Y, 14, BlockId.water_pot, 'player');
    w.storage.add('crop', 2);
    run(w, 0.5);
    const cook = ids[1] as string;
    untilNoon(w);
    // 점심 동안은 조리하지 않고(food 0 이라 먹지도 않는다), 13:00 에 조리를 시작한다
    run(w, HOUR * 0.5);
    expect(kindOf(w, cook)).not.toBe('cook');
    w.clock.advanceTo(13, 0);
    run(w, 30, () => kindOf(w, cook) === 'cook');
    expect(kindOf(w, cook)).toBe('cook');
  });
});
