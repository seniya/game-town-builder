import { describe, expect, it } from 'vitest';
import { RestAction } from '../src/game/actions/RestAction';
import { SleepAction } from '../src/game/actions/SleepAction';
import { BlockId } from '../src/game/data/blocks';
import type { GameWorld } from '../src/game/GameWorld';
import { at, bed, DOOR, run, village, Y } from './helpers/village';

/** 주민의 현재 칸. */
function cellOf(w: GameWorld, id: string): { x: number; y: number; z: number } {
  const p = w.registry.npcs.get(id)?.body.pos;
  if (!p) throw new Error('주민 없음');
  return { x: Math.floor(p.x), y: Math.floor(p.y + 0.01), z: Math.floor(p.z) };
}

/** 주민의 현재 Action 종류. */
function kindOf(w: GameWorld, id: string): string {
  return w.registry.npcs.get(id)?.action.kind ?? 'none';
}

/** 침실 하나·침대 n 개·주민 m 명. 시작은 19:50. */
function scene(beds: number, residents: number): { w: GameWorld; ids: string[]; bedIds: string[] } {
  const w = village(at(19, 50));
  const bedIds: string[] = [];
  for (let i = 0; i < beds; i++) bedIds.push(bed(w, 10 + i * 2, 10));
  const ids: string[] = [];
  const roles = ['farmer', 'cook', 'carpenter'] as const;
  for (let i = 0; i < residents; i++) {
    ids.push(w.spawnResident(roles[i % 3] ?? 'villager', { x: 20 + i, y: Y, z: 26 }).id);
  }
  run(w, 1);
  return { w, ids, bedIds };
}

describe('취침 (TASK-033, MVP_SPEC 18)', () => {
  it('한 주민·침실·침대: 20:00 에 배정된 침대로 걸어가 눕고, 05:00 에 일어나 방에서 나온다', () => {
    const { w, ids, bedIds } = scene(1, 1);
    const id = ids[0] as string;
    expect(w.rooms.getByType('Bedroom')).toHaveLength(1);
    expect(w.sleep.assignedBed(id)?.objectId).toBe(bedIds[0]);
    expect(kindOf(w, id)).not.toBe('sleep');
    // 20:00 이 되면 침대로 간다
    run(w, 30, () => w.clock.phase === 'night');
    run(w, 0.5);
    expect(w.registry.npcs.get(id)?.action.label).toBe('침대로 가는 중');
    run(w, 30, () => kindOf(w, id) === 'sleep');
    const npc = w.registry.npcs.get(id);
    expect(npc?.action).toBeInstanceOf(SleepAction);
    // 몸체는 접근 셀에 있고, 눕는 자세는 렌더용 facilityUse 로만 나타난다
    const facility = w.sleep.assignedBed(id);
    expect(facility?.approachCells).toContainEqual(cellOf(w, id));
    expect(npc?.action.facilityUse).toMatchObject({ objectId: bedIds[0], pose: 'lie' });
    expect(w.voxels.getBlock(cellOf(w, id).x, Y, cellOf(w, id).z)).toBe(BlockId.air);
    expect(w.rooms.findContaining(cellOf(w, id))).toBeDefined();
    // 05:00 에 일어나 방에서 나온다(방 밖, 광장 쪽 칸으로 간다)
    w.clock.advanceTo(4, 59);
    run(w, 5, () => w.clock.phase === 'dawn');
    run(w, 0.3);
    expect(kindOf(w, id)).toBe('move');
    run(w, 40, () => kindOf(w, id) === 'idle');
    expect(w.rooms.findContaining(cellOf(w, id))).toBeUndefined();
    // 기상 뒤 고체 침대 안에서 이동을 시작하지 않았다(발·머리 칸이 비어 있다)
    const c = cellOf(w, id);
    expect(w.voxels.getBlock(c.x, c.y, c.z)).toBe(BlockId.air);
  });

  it('주민 세 명·침대 둘: 두 명은 각자의 침대, 남는 한 명은 광장에서 RestAction 을 한다', () => {
    const { w, ids, bedIds } = scene(2, 3);
    const assigned = ids.map((id) => w.sleep.assignedBed(id)?.objectId ?? null);
    expect(assigned.filter((b) => b !== null).sort()).toEqual([...bedIds].sort());
    w.clock.advanceTo(20, 0);
    run(w, 60, () => ids.every((id) => ['sleep', 'rest'].includes(kindOf(w, id))));
    const kinds = ids.map((id) => kindOf(w, id)).sort();
    expect(kinds).toEqual(['rest', 'sleep', 'sleep']);
    const resting = ids.find((id) => kindOf(w, id) === 'rest') as string;
    expect(w.registry.npcs.get(resting)?.action).toBeInstanceOf(RestAction);
    expect(w.sleep.assignedBed(resting)).toBeNull();
    // 광장(종) 주변 칸에서 앉는다
    const c = cellOf(w, resting);
    expect(Math.hypot(c.x - 24, c.z - 24)).toBeLessThanOrEqual(6);
    expect(w.registry.npcs.get(resting)?.action.pose).toBe('sit');
  });

  it('SleepAction 과 RestAction 이 별개의 클래스다', () => {
    expect(SleepAction).not.toBe(RestAction);
    expect(Object.getPrototypeOf(SleepAction.prototype)).not.toBe(RestAction.prototype);
    expect(Object.getPrototypeOf(RestAction.prototype)).not.toBe(SleepAction.prototype);
  });

  it('자고 있는 주민의 침대를 부수면 깨어나고 배정이 해제된다', () => {
    const { w, ids, bedIds } = scene(1, 1);
    const id = ids[0] as string;
    w.clock.advanceTo(20, 0);
    run(w, 40, () => kindOf(w, id) === 'sleep');
    expect(kindOf(w, id)).toBe('sleep');
    w.voxels.editObject({ kind: 'remove', objectId: bedIds[0] as string }, 'player');
    run(w, 0.2);
    expect(kindOf(w, id)).not.toBe('sleep');
    expect(w.sleep.assignedBed(id)).toBeNull();
    expect(w.sleep.isAssigned(id, bedIds[0] as string)).toBe(false);
    // 침대가 없으니 광장으로 쉬러 간다
    run(w, 60, () => kindOf(w, id) === 'rest');
    expect(kindOf(w, id)).toBe('rest');
  });

  it('방이 해제되면 그 방의 배정이 전부 풀린다', () => {
    const { w, ids } = scene(2, 2);
    expect(ids.every((id) => w.sleep.assignedBed(id) !== null)).toBe(true);
    w.voxels.setBlock(9, Y, 12, BlockId.air, 'player'); // 서쪽 벽 두 층을 뚫는다
    w.voxels.setBlock(9, Y + 1, 12, BlockId.air, 'player');
    run(w, 0.5);
    expect(w.rooms.getByType('Bedroom')).toHaveLength(0);
    expect(ids.every((id) => w.sleep.assignedBed(id) === null)).toBe(true);
  });

  it('방 타입이 바뀌거나 같은 타입에서 침대 하나만 없어져도 해당 배정을 해제한다', () => {
    const { w, ids, bedIds } = scene(2, 2);
    const owner = (b: string): string | undefined => ids.find((id) => w.sleep.isAssigned(id, b));
    const first = owner(bedIds[0] as string) as string;
    const second = owner(bedIds[1] as string) as string;
    // 침대 하나만 없어진다: 그 배정만 풀리고 다른 배정은 유지된다
    w.voxels.editObject({ kind: 'remove', objectId: bedIds[0] as string }, 'player');
    run(w, 0.5);
    expect(w.sleep.assignedBed(first)).toBeNull();
    expect(w.sleep.isAssigned(second, bedIds[1] as string)).toBe(true);
    // 화덕·물통을 놓아 주방이 되면(주방이 우선) 남은 배정도 풀린다
    w.voxels.setBlock(14, Y, 14, BlockId.cooking_stove, 'player');
    w.voxels.setBlock(13, Y, 14, BlockId.water_pot, 'player');
    run(w, 0.5);
    expect(w.rooms.getByType('Kitchen')).toHaveLength(1);
    expect(w.sleep.assignedBed(second)).toBeNull();
  });

  it('실제 접근 경로가 없으면 다른 침대 또는 RestAction 을 선택한다', () => {
    const w = village(at(19, 50));
    const b = bed(w, 10, 10);
    // 문 바깥 앞 칸을 두 층 판자로 막는다. 방 판정은 국소 접근성이라 성립하지만 주민은 들어갈 수 없다
    w.voxels.setBlock(DOOR.x, Y, DOOR.z + 1, BlockId.plank, 'player');
    w.voxels.setBlock(DOOR.x, Y + 1, DOOR.z + 1, BlockId.plank, 'player');
    w.voxels.setBlock(DOOR.x - 1, Y, DOOR.z + 1, BlockId.plank, 'player');
    w.voxels.setBlock(DOOR.x - 1, Y + 1, DOOR.z + 1, BlockId.plank, 'player');
    w.voxels.setBlock(DOOR.x + 1, Y, DOOR.z + 1, BlockId.plank, 'player');
    w.voxels.setBlock(DOOR.x + 1, Y + 1, DOOR.z + 1, BlockId.plank, 'player');
    w.voxels.setBlock(DOOR.x, Y, DOOR.z + 2, BlockId.plank, 'player');
    w.voxels.setBlock(DOOR.x, Y + 1, DOOR.z + 2, BlockId.plank, 'player');
    const id = w.spawnResident('farmer', { x: 20, y: Y, z: 26 }).id;
    run(w, 1);
    expect(w.rooms.getByType('Bedroom')).toHaveLength(1);
    expect(w.sleep.isAssigned(id, b)).toBe(false);
    w.clock.advanceTo(20, 0);
    run(w, 40, () => kindOf(w, id) === 'rest');
    expect(kindOf(w, id)).toBe('rest');
  });

  it('침대는 SleepSystem 만 소유한다: NPC 엔티티에 배정 상태가 없다', () => {
    const { w, ids } = scene(1, 1);
    const npc = w.registry.npcs.get(ids[0] as string);
    expect(npc).toBeDefined();
    expect(Object.keys(npc ?? {}).some((k) => /bed/i.test(k))).toBe(false);
    expect(w.sleep.snapshot()).toHaveLength(1);
  });

  it('침대를 하나 더 놓으면 침대 없던 주민이 그 침대로 간다', () => {
    const { w, ids } = scene(1, 2);
    const without = ids.find((id) => w.sleep.assignedBed(id) === null) as string;
    expect(without).toBeDefined();
    bed(w, 13, 10);
    run(w, 1);
    expect(w.sleep.assignedBed(without)).not.toBeNull();
  });

  it('Test 6 (MVP_SPEC 39): 침대 셋·주민 셋은 각자의 침대에 누워 각각 +5, 침대가 둘이면 쉬는 한 명은 포인트가 없다', () => {
    const { w, ids } = scene(3, 3);
    const gains: string[] = [];
    w.events.on('GRATITUDE_GAINED', (g) => {
      if (g.source.kind === 'sleep' && g.amount === 5) gains.push(g.source.npcId);
    });
    w.clock.advanceTo(20, 0);
    run(w, 60, () => ids.every((id) => kindOf(w, id) === 'sleep') && gains.length === 3);
    expect(ids.map((id) => kindOf(w, id))).toEqual(['sleep', 'sleep', 'sleep']);
    const beds = ids.map((id) => w.sleep.assignedBed(id)?.objectId);
    expect(new Set(beds).size).toBe(3);
    expect([...gains].sort()).toEqual([...ids].sort());

    const two = scene(2, 3);
    const got: string[] = [];
    two.w.events.on('GRATITUDE_GAINED', (g) => {
      if (g.source.kind === 'sleep' || g.source.kind === 'eat' || g.source.kind === 'cook')
        got.push(g.source.npcId);
    });
    two.w.clock.advanceTo(20, 0);
    run(two.w, 60, () => two.ids.every((id) => ['sleep', 'rest'].includes(kindOf(two.w, id))));
    run(two.w, 5);
    const resting = two.ids.find((id) => kindOf(two.w, id) === 'rest');
    expect(resting).toBeDefined();
    expect(got).toHaveLength(2);
    expect(got).not.toContain(resting);
  });
});
