import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { EventBus, type GameEventMap } from '../src/game/EventBus';
import type { GameWorld } from '../src/game/GameWorld';
import { NavigationGraph } from '../src/game/nav/NavigationGraph';
import { GameClockSystem } from '../src/game/systems/GameClockSystem';
import { cropStage, FarmSystem, isMature, MATURE_MINUTES } from '../src/game/systems/FarmSystem';
import type { BlockPos } from '../src/game/types';
import { VillageStorage } from '../src/game/VillageStorage';
import { VoxelWorld } from '../src/game/voxel/VoxelWorld';
import { at, run, village, Y } from './helpers/village';

const G = Y - 1; // 지면(풀) 높이. farmland 는 지면을 바꿔 깐다

/** 지면에 farmland 를 깐다. */
function till(w: GameWorld, x: number, z: number): BlockPos {
  w.voxels.setBlock(x, G, z, BlockId.farmland, 'player');
  return { x, y: G, z };
}

/** 농부 한 명과 밭이 있는 마을. 시작 09:00(역할 작업 시간). */
function farmScene(plots: readonly [number, number][]): {
  w: GameWorld;
  id: string;
  cells: BlockPos[];
} {
  const w = village(at(9), false);
  const id = w.spawnResident('farmer', { x: 20, y: Y, z: 20 }).id;
  const cells = plots.map(([x, z]) => till(w, x, z));
  return { w, id, cells };
}

/** 칸 위에 crop 이 있는가. */
function hasCrop(w: GameWorld, c: BlockPos): boolean {
  return w.voxels.getBlock(c.x, c.y + 1, c.z) === BlockId.crop;
}

/** 현재 Action 종류. */
function kindOf(w: GameWorld, id: string): string {
  return w.registry.npcs.get(id)?.action.kind ?? 'none';
}

describe('성장 계산 (MVP_SPEC 15.2)', () => {
  it('표시 단계 0 / 1 / 2 는 각각 4 시간, 12 시간 이상만 성숙이다(8 시간의 단계 2 는 미성숙)', () => {
    expect(MATURE_MINUTES).toBe(720);
    expect([0, 239, 240, 479, 480, 719, 720, 2000].map(cropStage)).toEqual([
      0, 0, 1, 1, 2, 2, 2, 2,
    ]);
    expect(isMature(480)).toBe(false);
    expect(isMature(719)).toBe(false);
    expect(isMature(720)).toBe(true);
  });
});

describe('농부와 밭 (TASK-030)', () => {
  it('farmland 를 깔면 농부가 걸어가서 심는다. seed 가 1 준다', () => {
    const { w, id, cells } = farmScene([[10, 10]]);
    const seed0 = w.storage.get('seed');
    run(w, 0.3);
    expect(kindOf(w, id)).toBe('move');
    expect(w.registry.npcs.get(id)?.action.label).toBe('밭으로 가는 중');
    run(w, 20, () => hasCrop(w, cells[0] as BlockPos));
    expect(hasCrop(w, cells[0] as BlockPos)).toBe(true);
    expect(w.storage.get('seed')).toBe(seed0 - 1);
    // 심는 동안 작업 자세를 보인다(걷기와 구별)
    expect(kindOf(w, id)).toBe('plant');
    expect(w.registry.npcs.get(id)?.action.pose).toBe('work');
  });

  it('12 시간 뒤 수확 가능해지고, 수확하면 crop +1·seed +1 이며 같은 칸을 다시 심는다', () => {
    const { w, id, cells } = farmScene([[10, 10]]);
    const c = cells[0] as BlockPos;
    run(w, 20, () => hasCrop(w, c));
    const seedAfterPlant = w.storage.get('seed');
    // 8 시간: 단계 2, 미성숙 → 수확할 수 없다
    w.clock.advanceTo(17, Math.floor(w.clock.minuteOfDay % 60) + 0);
    expect(w.farm.harvest(c)).toBe(false);
    // 다음 날 아침: 12 시간 이상 → 수확한다
    w.clock.advanceTo(9, 30);
    run(w, 20, () => w.storage.get('crop') === 1);
    expect(w.storage.get('crop')).toBe(1);
    run(w, 10, () => hasCrop(w, c));
    // 수확으로 seed +1, 다시 심어 −1: 결과적으로 심은 직후와 같다
    expect(w.storage.get('seed')).toBe(seedAfterPlant);
    expect(hasCrop(w, c)).toBe(true);
    expect(kindOf(w, id)).not.toBe('none');
  });

  it('성장이 농부와 무관하게 진행된다(농부가 없어도 성숙한다)', () => {
    const w = village(at(9), false);
    const c = till(w, 10, 10);
    expect(w.farm.plant(c)).toBe(true);
    w.clock.advanceTo(21);
    expect(w.farm.crops()[0]?.mature).toBe(true);
    expect(w.registry.npcs.size).toBe(0);
  });

  it('farmland 를 부수면 위의 crop 도 사라지고(by = world) 씨앗은 돌아오지 않는다', () => {
    const w = village(at(9), false);
    const c = till(w, 10, 10);
    w.farm.plant(c);
    const seed = w.storage.get('seed');
    const changes: GameEventMap['BLOCK_CHANGED'][] = [];
    w.events.on('BLOCK_CHANGED', (e) => void changes.push(e));
    w.voxels.setBlock(c.x, c.y, c.z, BlockId.dirt, 'player');
    expect(hasCrop(w, c)).toBe(false);
    expect(changes.some((e) => e.from === BlockId.crop && e.by === 'world')).toBe(true);
    expect(w.storage.get('seed')).toBe(seed);
    expect(w.farm.stats.crops).toBe(0);
  });

  it('작물을 플레이어가 부수면 기록이 지워지고 씨앗은 돌아오지 않는다(채집으로 보충)', () => {
    const w = village(at(9), false);
    const c = till(w, 10, 10);
    w.farm.plant(c);
    const seed = w.storage.get('seed');
    w.voxels.setBlock(c.x, c.y + 1, c.z, BlockId.air, 'player');
    expect(w.farm.stats.crops).toBe(0);
    expect(w.storage.get('seed')).toBe(seed);
  });

  it('seed 가 0 이면 심지 않고 다른 행동을 한다', () => {
    const { w, id, cells } = farmScene([[10, 10]]);
    w.storage.take('seed', w.storage.get('seed'));
    run(w, 5);
    expect(hasCrop(w, cells[0] as BlockPos)).toBe(false);
    expect(kindOf(w, id)).toBe('idle');
    // 디버그 투입 뒤에는 심는다
    w.debug.addSeeds(1);
    run(w, 20, () => hasCrop(w, cells[0] as BlockPos));
    expect(hasCrop(w, cells[0] as BlockPos)).toBe(true);
  });

  it('성숙 작물 수확을 빈 밭 파종보다 먼저 한다', () => {
    const { w, cells } = farmScene([
      [10, 10],
      [30, 10],
    ]);
    const [near, far] = cells as [BlockPos, BlockPos];
    // 먼 밭에 먼저 심고 성숙시킨 뒤, 가까운 빈 밭이 있어도 먼 성숙 작물을 먼저 수확하는지 본다
    expect(w.farm.plant(far)).toBe(true);
    w.clock.advanceTo(21);
    w.clock.advanceTo(9);
    const candidate = w.farm.candidateFor('farmer-1', { x: 11, y: Y, z: 11 });
    expect(candidate?.kind).toBe('harvest');
    expect(candidate?.target).toEqual(far);
    expect(near).toBeDefined();
  });

  it('역할 작업 시간 밖에는 밭일을 하지 않는다', () => {
    const { w, id, cells } = farmScene([[10, 10]]);
    w.clock.advanceTo(12, 10); // 점심
    run(w, 5);
    expect(hasCrop(w, cells[0] as BlockPos)).toBe(false);
    expect(['idle', 'move']).toContain(kindOf(w, id));
    expect(w.registry.npcs.get(id)?.action.key.startsWith('move:farm')).toBe(false);
  });

  it('한 칸은 한 농부만 예약한다', () => {
    const w = village(at(9), false);
    const c = till(w, 10, 10);
    expect(w.farm.claim('a', c)).toBe(true);
    expect(w.farm.claim('b', c)).toBe(false);
    expect(w.farm.candidateFor('b', { x: 12, y: Y, z: 12 })).toBeNull();
    w.farm.release('a', c);
    expect(w.farm.candidateFor('b', { x: 12, y: Y, z: 12 })?.target).toEqual(c);
  });
});

describe('후보는 밭 목록에서 고른다: 월드 크기와 무관 (AC)', () => {
  /** 크기만 다른 두 평지 월드에서 후보를 고를 때 읽는 블록 수. */
  function reads(size: number): number {
    const events = new EventBus();
    const voxels = new VoxelWorld({ sizeX: size, sizeY: 8, sizeZ: size }, events);
    for (let x = 0; x < size; x++)
      for (let z = 0; z < size; z++) voxels.writeInitial(x, 0, z, BlockId.grass);
    const nav = new NavigationGraph(voxels);
    const clock = new GameClockSystem(events);
    const storage = new VillageStorage(events, balance.storage);
    let count = 0;
    const counted = {
      getBlock: (x: number, y: number, z: number) => {
        count += 1;
        return voxels.getBlock(x, y, z);
      },
      setBlock: voxels.setBlock.bind(voxels),
      allChunkCoords: voxels.allChunkCoords.bind(voxels),
      getChunk: voxels.getChunk.bind(voxels),
    };
    const farm = new FarmSystem({ voxels: counted, clock, storage, nav, events });
    for (const [x, z] of [
      [3, 3],
      [5, 3],
      [7, 3],
    ] as const)
      voxels.setBlock(x, 0, z, BlockId.farmland, 'player');
    count = 0;
    farm.candidateFor('f', { x: 4, y: 1, z: 6 });
    return count;
  }

  it('16 칸 월드와 128 칸 월드에서 후보를 고를 때 읽는 블록 수가 같다', () => {
    expect(reads(128)).toBe(reads(16));
    expect(reads(16)).toBeLessThan(40);
  });
});
