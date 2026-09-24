import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import type { GameWorld } from '../src/game/GameWorld';
import type { BlockPos } from '../src/game/types';
import { at, placeObject, run, village, Y } from './helpers/village';

const HOUR = balance.clock.secondsPerGameHour;

/** 판자 벽 칸 하나를 놓고(초기) 몬스터가 부순 것처럼 없앤다. */
function smash(w: GameWorld, p: BlockPos): void {
  if (w.voxels.getBlock(p.x, p.y, p.z) === BlockId.air)
    w.voxels.writeInitial(p.x, p.y, p.z, BlockId.plank);
  w.voxels.setBlock(p.x, p.y, p.z, BlockId.air, 'monster');
}

/** 광장 남쪽 z = 30 줄의 판자 칸들. */
function cells(n: number): BlockPos[] {
  return Array.from({ length: n }, (_, i) => ({ x: 4 + i * 2, y: Y, z: 30 }));
}

/** 목수 한 명과 시작 시각. */
function scene(hour: number, minute = 0): { w: GameWorld; id: string } {
  const w = village(at(hour, minute), false);
  const id = w.spawnResident('carpenter', { x: 20, y: Y, z: 26 }).id;
  return { w, id };
}

describe('수리 (TASK-048, MVP_SPEC 25)', () => {
  it('몬스터가 부순 좌표를 기록하고, 아침에 목수가 가서 15 게임분 뒤 원래 블록을 재료 없이 복구한다', () => {
    const { w, id } = scene(6, 30);
    const [c] = cells(1) as [BlockPos];
    smash(w, c);
    expect(w.repair.pending).toEqual([
      expect.objectContaining({ blockId: BlockId.plank, cells: [c], object: null }),
    ]);
    const storage0 = w.storage.snapshot();
    run(w, 1);
    expect(w.registry.npcs.get(id)?.action.kind).not.toBe('repair'); // 07:00 전에는 하지 않는다
    w.clock.advanceTo(7, 0);
    run(w, 0.3);
    expect(w.registry.npcs.get(id)?.action.label).toBe('고치러 가는 중');
    run(w, 20, () => w.registry.npcs.get(id)?.action.kind === 'repair');
    expect(w.registry.npcs.get(id)?.action.label).toBe('고치는 중');
    run(w, HOUR * 0.2);
    expect(w.voxels.getBlock(c.x, c.y, c.z)).toBe(BlockId.air); // 15 분이 안 됐다
    run(w, HOUR * 0.1, () => w.voxels.getBlock(c.x, c.y, c.z) !== BlockId.air);
    expect(w.voxels.getBlock(c.x, c.y, c.z)).toBe(BlockId.plank);
    expect(w.repair.pending).toHaveLength(0);
    expect(w.repair.history).toHaveLength(1);
    expect(w.repair.repairedToday).toBe(1);
    expect(w.storage.snapshot()).toEqual(storage0);
  });

  it('하루 8 점유 복셀까지만 고치고 9 번째부터는 다음 날로 넘어간다', () => {
    const { w } = scene(6, 59);
    for (const c of cells(10)) smash(w, c);
    w.clock.setTimeScale(16);
    run(w, 60, () => w.repair.repairedToday >= 8);
    expect(w.repair.repairedToday).toBe(8);
    run(w, 3);
    expect(w.repair.pending).toHaveLength(2);
    expect(w.clock.minuteOfDay).toBeLessThan(18 * 60);
    // 다음 날 07:00 뒤에 나머지를 고친다
    w.clock.advanceTo(7, 0);
    run(w, 40, () => w.repair.pending.length === 0);
    expect(w.repair.pending).toHaveLength(0);
    expect(w.repair.repairedToday).toBe(2);
  });

  it('18:00 이후에는 수리하지 않는다', () => {
    const { w, id } = scene(18, 5);
    smash(w, cells(1)[0] as BlockPos);
    run(w, 10);
    expect(w.registry.npcs.get(id)?.action.kind).not.toBe('repair');
    expect(w.repair.pending).toHaveLength(1);
    expect(w.repair.complete(w.repair.pending[0]?.id ?? '')).toBe(false);
  });

  it('플레이어가 직접 채우면 미수리에서 빠지고 이력은 남는다. 농사 편집(by npc)은 수리로 보지 않는다', () => {
    const { w } = scene(20);
    const [a, b] = cells(2) as [BlockPos, BlockPos];
    smash(w, a);
    smash(w, b);
    w.voxels.setBlock(a.x, a.y, a.z, BlockId.dirt, 'player');
    expect(w.repair.pending.map((e) => e.cells[0])).toEqual([b]);
    expect(w.repair.history).toHaveLength(2);
    w.voxels.setBlock(b.x, b.y, b.z, BlockId.crop, 'npc');
    expect(w.repair.pending).toHaveLength(1);
  });

  it('문은 전체 배치로 복원하고 당일 예산에서 2 칸을 쓴다. 부분 복구·캐릭터 점유가 있으면 덮어쓰지 않는다', () => {
    const { w, id } = scene(7, 30);
    const doorAt = { x: 18, y: Y, z: 30 };
    const doorId = placeObject(w, BlockId.door, doorAt, 'south');
    w.voxels.editObject({ kind: 'remove', objectId: doorId }, 'monster');
    expect(w.repair.pending).toEqual([
      expect.objectContaining({ blockId: BlockId.door, cells: [doorAt, { ...doorAt, y: Y + 1 }] }),
    ]);
    const dmg = w.repair.pending[0]?.id ?? '';
    // 부분 복구(위 칸만 채움) → 후보가 아니다
    w.voxels.setBlock(doorAt.x, Y + 1, doorAt.z, BlockId.plank, 'player');
    expect(w.repair.candidateFor(id, doorAt)).toBeNull();
    expect(w.repair.complete(dmg)).toBe(false);
    w.voxels.setBlock(doorAt.x, Y + 1, doorAt.z, BlockId.air, 'player');
    // 캐릭터가 서 있으면 복원하지 않는다
    const npc = w.registry.npcs.get(id);
    if (!npc) throw new Error('목수 없음');
    npc.body.pos = { x: doorAt.x + 0.5, y: Y, z: doorAt.z + 0.5 };
    expect(w.repair.complete(dmg)).toBe(false);
    npc.body.pos = { x: 20.5, y: Y, z: 26.5 };
    expect(w.repair.complete(dmg)).toBe(true);
    expect(w.voxels.placements.objectAt(doorAt)?.blockId).toBe(BlockId.door);
    expect(w.repair.repairedToday).toBe(2);
  });

  it('같은 편집의 두 칸 객체는 한 건으로 기록한다(batchId 중복 방지)', () => {
    const { w } = scene(20);
    const bedId = placeObject(w, BlockId.bed, { x: 10, y: Y, z: 30 }, 'south');
    w.voxels.editObject({ kind: 'remove', objectId: bedId }, 'monster');
    expect(w.repair.history).toHaveLength(1);
    expect(w.repair.history[0]?.cells).toHaveLength(2);
  });
});
