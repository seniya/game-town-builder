import { describe, expect, it } from 'vitest';
import { CookAction } from '../src/game/actions/CookAction';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { kitchenLabFixture } from '../src/game/data/visualFixtures';
import { GameWorld } from '../src/game/GameWorld';
import { npcCell } from '../src/game/systems/NPCDecisionSystem';
import { at, run, village, Y } from './helpers/village';

// 시험 마을의 방(내부 x 10~14, z 10~14, 문 남쪽)에 화덕·물통을 놓으면 Kitchen 이 된다
const STOVE = { x: 14, y: Y, z: 14 };
const POT = { x: 13, y: Y, z: 14 };
const HOUR = balance.clock.secondsPerGameHour;

/** 방에 화덕·물통을 놓아 주방을 만든다. */
function kitchen(w: GameWorld): void {
  w.voxels.setBlock(STOVE.x, STOVE.y, STOVE.z, BlockId.cooking_stove, 'player');
  w.voxels.setBlock(POT.x, POT.y, POT.z, BlockId.water_pot, 'player');
  run(w, 0.3);
}

/** 요리사 한 명과 (선택) 주방이 있는 마을. 시작 09:00(역할 작업 시간). */
function scene(opts: { kitchen?: boolean; crop?: number; hour?: number } = {}): {
  w: GameWorld;
  id: string;
} {
  const w = village(at(opts.hour ?? 9), true);
  if (opts.kitchen ?? true) kitchen(w);
  if (opts.crop) w.storage.add('crop', opts.crop);
  const id = w.spawnResident('cook', { x: 20, y: Y, z: 20 }).id;
  return { w, id };
}

/** 현재 Action 종류. */
function kindOf(w: GameWorld, id: string): string {
  return w.registry.npcs.get(id)?.action.kind ?? 'none';
}

/** 조리를 시작할 때까지 진행한다. */
function untilCooking(w: GameWorld, id: string): void {
  run(w, 30, () => kindOf(w, id) === 'cook');
  expect(kindOf(w, id)).toBe('cook');
}

describe('요리와 요리사 (TASK-031, MVP_SPEC 16)', () => {
  it('Kitchen 과 crop 2 가 있으면 화덕으로 걸어가 조리하고, 1 게임시간 뒤 crop −2 · food +3 이다', () => {
    const { w, id } = scene({ crop: 2 });
    expect(w.rooms.getByType('Kitchen')).toHaveLength(1);
    run(w, 0.3);
    expect(w.registry.npcs.get(id)?.action.label).toBe('주방으로 가는 중');
    untilCooking(w, id);
    // 시작 때 재료를 예약하되 소비하지 않는다
    expect(w.storage.get('crop')).toBe(2);
    expect(w.cooking.stats).toMatchObject({ cooking: 1, reservedCrop: 2 });
    expect(w.npcSystem.facilityClaims).toBe(1);
    const action = w.registry.npcs.get(id)?.action;
    expect(action).toBeInstanceOf(CookAction);
    // 화덕을 쓰는 조리 자세: 이동·대기와 구별된다
    expect(action?.pose).toBe('cook');
    expect(action?.facilityUse?.pose).toBe('cook');
    expect(action?.lookAt).toMatchObject({ x: STOVE.x + 0.5, z: STOVE.z + 0.5 });
    // 1 시간이 되기 전에는 아무것도 바뀌지 않는다
    run(w, HOUR * 0.9);
    expect(w.storage.snapshot()).toMatchObject({ crop: 2, food: 0 });
    run(w, HOUR * 0.2, () => w.storage.get('food') > 0);
    expect(w.storage.snapshot()).toMatchObject({ crop: 0, food: 3 });
    // 재료가 없으니 다시 조리하지 않고 예약도 남지 않는다
    run(w, 1);
    expect(kindOf(w, id)).not.toBe('cook');
    expect(w.cooking.stats).toMatchObject({ cooking: 0, reservedCrop: 0 });
    expect(w.npcSystem.facilityClaims).toBe(0);
  });

  it('crop 이 2 미만이면 요리하지 않는다', () => {
    const { w, id } = scene({ crop: 1 });
    run(w, 10);
    expect(kindOf(w, id)).toBe('idle');
    expect(w.storage.snapshot()).toMatchObject({ crop: 1, food: 0 });
  });

  it('Kitchen 이 없으면 crop 이 쌓이기만 하고 게임은 계속 진행된다', () => {
    const { w, id } = scene({ kitchen: false, crop: 4 });
    const t0 = w.clock.gameMinutes;
    run(w, HOUR * 1.5);
    expect(kindOf(w, id)).toBe('idle');
    expect(w.storage.snapshot()).toMatchObject({ crop: 4, food: 0 });
    expect(w.clock.gameMinutes - t0).toBeGreaterThan(60);
  });

  it('crop 이 넉넉하면 역할 시간 동안 이어서 조리한다', () => {
    const { w, id } = scene({ crop: 4 });
    untilCooking(w, id);
    run(w, HOUR * 2.3, () => w.storage.get('food') >= 6);
    expect(w.storage.snapshot()).toMatchObject({ crop: 0, food: 6 });
  });

  it('요리 중 주방이 해제되면 Action 이 취소되고 재료를 잃지 않는다', () => {
    const { w, id } = scene({ crop: 2 });
    untilCooking(w, id);
    // 물통을 치우면 주방 조건이 깨진다
    w.voxels.setBlock(POT.x, POT.y, POT.z, BlockId.air, 'player');
    run(w, 0.5);
    expect(w.rooms.getByType('Kitchen')).toHaveLength(0);
    expect(kindOf(w, id)).not.toBe('cook');
    expect(w.cooking.stats).toMatchObject({ cooking: 0, reservedCrop: 0 });
    expect(w.npcSystem.facilityClaims).toBe(0);
    run(w, HOUR * 1.2);
    expect(w.storage.snapshot()).toMatchObject({ crop: 2, food: 0 });
  });

  it('요리 중 화덕을 부수면 방 재판정을 기다리지 않고 취소된다', () => {
    const { w, id } = scene({ crop: 2 });
    untilCooking(w, id);
    w.voxels.setBlock(STOVE.x, STOVE.y, STOVE.z, BlockId.air, 'player');
    run(w, 1 / 30);
    expect(kindOf(w, id)).not.toBe('cook');
    expect(w.cooking.stats.reservedCrop).toBe(0);
    run(w, HOUR * 1.2);
    expect(w.storage.snapshot()).toMatchObject({ crop: 2, food: 0 });
  });

  it('역할 시간이 끝나면(12:00) 조리가 중단되어 예약만 풀리고, 식사를 못 했어도 13:00 에 다시 조리한다', () => {
    const { w, id } = scene({ crop: 2, hour: 11 });
    w.clock.advanceTo(11, 40);
    untilCooking(w, id);
    run(w, HOUR * 0.5, () => w.clock.minuteOfDay >= 12 * 60 + 1);
    run(w, 0.2);
    expect(kindOf(w, id)).not.toBe('cook');
    expect(w.cooking.stats.reservedCrop).toBe(0);
    expect(w.storage.snapshot()).toMatchObject({ crop: 2, food: 0 });
    // 점심을 먹지 않은 채로 오후 역할 시간이 된다(MealSystem 은 TASK-032)
    expect(w.registry.npcs.get(id)?.hasEatenThisMeal).toBe(false);
    w.clock.advanceTo(13, 0);
    untilCooking(w, id);
    run(w, HOUR * 1.2, () => w.storage.get('food') > 0);
    expect(w.storage.snapshot()).toMatchObject({ crop: 0, food: 3 });
  });

  it('로드로 예약을 버리면 조리는 실패하고 재료를 잃거나 음식을 복제하지 않는다', () => {
    const { w, id } = scene({ crop: 2 });
    untilCooking(w, id);
    w.cooking.resetForLoad();
    run(w, 1 / 30);
    expect(kindOf(w, id)).not.toBe('cook');
    expect(w.storage.snapshot()).toMatchObject({ crop: 2, food: 0 });
    // 같은 조리의 완료를 두 번 요청해도 한 번만 생산한다
    const stove = w.cooking.candidateFor(id, STOVE)?.facility.objectId as string;
    expect(w.cooking.begin(id, stove)).toBe(true);
    expect(w.cooking.complete(id, stove, STOVE)).toBe(true);
    expect(w.cooking.complete(id, stove, STOVE)).toBe(false);
    expect(w.storage.snapshot()).toMatchObject({ crop: 0, food: 3 });
  });

  it('조리 중 crop 이 예약보다 적어지면 예약을 풀고 완료가 실패한다(음수가 되지 않는다)', () => {
    const { w, id } = scene({ crop: 2 });
    untilCooking(w, id);
    w.storage.take('crop', 1);
    run(w, 1 / 30);
    expect(kindOf(w, id)).not.toBe('cook');
    run(w, HOUR * 1.2);
    expect(w.storage.snapshot()).toMatchObject({ crop: 1, food: 0 });
  });

  it('주방이 생기거나 crop 이 늘면 다음 판단에서 조리 후보가 갱신된다', () => {
    const { w, id } = scene({ kitchen: false });
    run(w, 1);
    expect(w.cooking.candidateFor(id, STOVE)).toBeNull();
    kitchen(w);
    expect(w.cooking.candidateFor(id, STOVE)?.ingredientsReady).toBe(false);
    run(w, 1);
    expect(kindOf(w, id)).toBe('idle');
    w.storage.add('crop', 2);
    expect(w.cooking.candidateFor(id, STOVE)?.ingredientsReady).toBe(true);
    untilCooking(w, id);
  });

  it('화덕 하나에 요리사 둘: 한 명만 화덕과 재료를 예약한다', () => {
    const { w, id } = scene({ crop: 4 });
    const other = w.spawnResident('cook', { x: 21, y: Y, z: 20 }).id;
    run(w, 30, () => kindOf(w, id) === 'cook' || kindOf(w, other) === 'cook');
    run(w, 1);
    const cooking = [id, other].filter((n) => kindOf(w, n) === 'cook');
    expect(cooking).toHaveLength(1);
    expect(w.cooking.stats).toMatchObject({ cooking: 1, reservedCrop: 2 });
    expect(w.npcSystem.facilityClaims).toBe(1);
  });

  it('요리사가 아니면 조리하지 않는다', () => {
    const w = village(at(9), true);
    kitchen(w);
    w.storage.add('crop', 2);
    const id = w.spawnResident('farmer', { x: 20, y: Y, z: 20 }).id;
    run(w, 10);
    expect(kindOf(w, id)).not.toBe('cook');
    expect(w.storage.get('crop')).toBe(2);
  });
});

describe('주방·식당 관찰 장면 (kitchen-lab)', () => {
  it('주방·식당·침실이 인식되고, 요리사가 조리한 뒤 12:00 에 세 주민이 식당 의자에 앉아 먹는다', () => {
    const f = kitchenLabFixture;
    const w = new GameWorld({
      storage: { ...balance.storage, ...f.startStorage },
      worldSize: f.size,
      startGameMinutes: at(f.defaultStartHour ?? 7),
      ...(f.plazaCenter ? { plazaCenter: f.plazaCenter } : {}),
    });
    f.build((x, y, z, id) => w.voxels.writeInitial(x, y, z, id));
    for (const o of f.objects) {
      const id = w.voxels.placements.allocateId();
      expect(w.voxels.editObject({ kind: 'place', object: { id, ...o } }, 'player')).toBe(true);
    }
    w.rooms.rebuildAll();
    expect(w.rooms.getByType('Kitchen')).toHaveLength(1);
    expect(w.rooms.getByType('Bedroom')).toHaveLength(1);
    expect(w.rooms.getByType('DiningRoom')).toHaveLength(1);
    for (const r of f.residents ?? []) w.spawnResident(r.role, r.cell);
    const cook = [...w.registry.npcs.values()].find((n) => n.role === 'cook');
    if (!cook) throw new Error('요리사 없음');
    run(w, 40, () => cook.action.kind === 'cook');
    expect(cook.action.kind).toBe('cook');
    expect(w.rooms.findContaining(npcCell(cook))?.type).toBe('Kitchen');
    run(w, HOUR * 1.2, () => w.storage.get('crop') < 4);
    expect(w.storage.snapshot()).toMatchObject({ crop: 2, food: 6 });
    // 점심: 세 주민이 모두 식당 의자에 앉아 먹는다
    w.clock.advanceTo(12, 0);
    const all = [...w.registry.npcs.values()];
    run(w, 60, () => all.every((n) => n.action.kind === 'eat'));
    expect(all.map((n) => n.action.label)).toEqual(Array(3).fill('식당에서 먹는 중'));
    expect(w.storage.get('food')).toBe(3);
  });
});
