import { describe, expect, it } from 'vitest';
import { EventBus, type GameEventMap } from '../src/game/EventBus';
import { BlockId } from '../src/game/data/blocks';
import { balance } from '../src/game/data/balance';
import { Chunk } from '../src/game/voxel/Chunk';
import { VoxelWorld, type WorldSize } from '../src/game/voxel/VoxelWorld';
import { chunkKey, type PlacedObjectSnapshot } from '../src/game/types';

type Changed = GameEventMap['BLOCK_CHANGED'];

/** 테스트용 월드와 BLOCK_CHANGED 기록. 기본은 MVP 크기다. */
function setup(size: WorldSize = balance.world): {
  world: VoxelWorld;
  changes: Changed[];
} {
  const events = new EventBus();
  const world = new VoxelWorld(size, events);
  const changes: Changed[] = [];
  events.on('BLOCK_CHANGED', (p) => changes.push(p));
  return { world, changes };
}

/** dirty 청크를 키 집합으로 가져온다. */
function dirtyKeys(world: VoxelWorld): string[] {
  return world.takeDirtyChunks().map(chunkKey).sort();
}

describe('Chunk', () => {
  it('index = x + z*16 + y*256', () => {
    expect(Chunk.index(1, 2, 3)).toBe(1 + 3 * 16 + 2 * 256);
    expect(new Chunk({ cx: 0, cy: 0, cz: 0 }).blocks).toHaveLength(4096);
  });
});

describe('VoxelWorld getBlock / setBlock', () => {
  it('MVP 크기는 청크 8 × 4 × 8 = 256 개다', () => {
    const { world } = setup();
    expect([world.chunksX, world.chunksY, world.chunksZ]).toEqual([8, 4, 8]);
    expect(world.allChunkCoords()).toHaveLength(256);
  });

  it('getBlock 이 월드 밖 좌표에 대해 0 을 반환한다', () => {
    const { world } = setup();
    world.setBlock(0, 0, 0, BlockId.stone, 'player');
    for (const [x, y, z] of [
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, -1],
      [128, 0, 0],
      [0, 64, 0],
      [0, 0, 128],
      [0.5, 0, 0],
    ] as const) {
      expect(world.getBlock(x, y, z)).toBe(0);
    }
    expect(world.getBlock(0, 0, 0)).toBe(BlockId.stone);
  });

  it('월드 밖 setBlock 은 false 다', () => {
    const { world, changes } = setup();
    expect(world.setBlock(128, 0, 0, BlockId.stone, 'player')).toBe(false);
    expect(changes).toHaveLength(0);
  });

  it('setBlock 이 같은 id 면 false 를 반환하고 dirty 를 만들지 않는다', () => {
    const { world, changes } = setup();
    expect(world.setBlock(5, 5, 5, BlockId.air, 'player')).toBe(false);
    expect(world.takeDirtyChunks()).toEqual([]);
    expect(world.setBlock(5, 5, 5, BlockId.dirt, 'player')).toBe(true);
    world.takeDirtyChunks();
    const rev = world.getRevision({ cx: 0, cy: 0, cz: 0 });
    expect(world.setBlock(5, 5, 5, BlockId.dirt, 'player')).toBe(false);
    expect(world.takeDirtyChunks()).toEqual([]);
    expect(world.getRevision({ cx: 0, cy: 0, cz: 0 })).toBe(rev);
    expect(changes).toHaveLength(1);
  });

  it('내부 블록은 해당 청크만 dirty 다', () => {
    const { world } = setup();
    world.setBlock(20, 20, 20, BlockId.stone, 'player');
    expect(dirtyKeys(world)).toEqual(['1,1,1']);
  });

  it('청크 경계(x % 16 === 0)의 블록을 바꾸면 인접 청크도 dirty 가 된다', () => {
    const { world } = setup();
    world.setBlock(16, 20, 20, BlockId.stone, 'player');
    expect(dirtyKeys(world)).toEqual(['0,1,1', '1,1,1']);
    world.setBlock(15, 20, 20, BlockId.stone, 'player');
    expect(dirtyKeys(world)).toEqual(['0,1,1', '1,1,1']);
  });

  it('AO 를 위해 모서리·꼭짓점 이웃도 dirty·revision 이 갱신된다', () => {
    const { world } = setup();
    const before = world.getRevision({ cx: 0, cy: 0, cz: 0 });
    world.setBlock(16, 16, 16, BlockId.stone, 'player');
    expect(dirtyKeys(world)).toEqual([
      '0,0,0',
      '0,0,1',
      '0,1,0',
      '0,1,1',
      '1,0,0',
      '1,0,1',
      '1,1,0',
      '1,1,1',
    ]);
    expect(world.getRevision({ cx: 0, cy: 0, cz: 0 })).toBe(before + 1);
  });

  it('월드 가장자리에서 범위 밖 청크는 dirty 가 되지 않는다', () => {
    const { world } = setup();
    world.setBlock(0, 0, 0, BlockId.stone, 'player');
    expect(dirtyKeys(world)).toEqual(['0,0,0']);
  });

  it('takeDirtyChunks() 가 중복 없이 반환하고, 호출 후 비워진다', () => {
    const { world } = setup();
    world.setBlock(3, 3, 3, BlockId.stone, 'player');
    world.setBlock(4, 3, 3, BlockId.stone, 'player');
    world.setBlock(3, 3, 3, BlockId.dirt, 'player');
    expect(world.takeDirtyChunks()).toEqual([{ cx: 0, cy: 0, cz: 0 }]);
    expect(world.takeDirtyChunks()).toEqual([]);
  });

  it('BLOCK_CHANGED 가 from / to / by 와 편집별 batchId 로 발행된다', () => {
    const { world, changes } = setup();
    world.setBlock(1, 2, 3, BlockId.plank, 'player');
    world.setBlock(1, 2, 3, BlockId.air, 'monster');
    expect(changes).toEqual([
      { batchId: 1, pos: { x: 1, y: 2, z: 3 }, from: 0, to: BlockId.plank, by: 'player' },
      { batchId: 2, pos: { x: 1, y: 2, z: 3 }, from: BlockId.plank, to: 0, by: 'monster' },
    ]);
    expect(world.editBatchCounter).toBe(2);
  });
});

describe('다중 칸 객체 editObject (ARCHITECTURE 6.3)', () => {
  /** 침대 스냅샷을 만든다. */
  function bed(world: VoxelWorld, x: number, y: number, z: number): PlacedObjectSnapshot {
    return {
      id: world.placements.allocateId(),
      blockId: BlockId.bed,
      anchor: { x, y, z },
      facing: 'east',
    };
  }

  it('침대·문의 점유 칸과 메타데이터가 함께 변경된다', () => {
    const { world, changes } = setup();
    const b = bed(world, 10, 30, 10);
    expect(world.editObject({ kind: 'place', object: b }, 'player')).toBe(true);
    expect(world.getBlock(10, 30, 10)).toBe(BlockId.bed);
    expect(world.getBlock(11, 30, 10)).toBe(BlockId.bed);
    expect(world.placements.objectAt({ x: 11, y: 30, z: 10 })).toEqual(b);
    const door: PlacedObjectSnapshot = {
      id: world.placements.allocateId(),
      blockId: BlockId.door,
      anchor: { x: 20, y: 30, z: 10 },
      facing: 'north',
    };
    expect(world.editObject({ kind: 'place', object: door }, 'player')).toBe(true);
    expect(world.getBlock(20, 31, 10)).toBe(BlockId.door);
    expect(world.placements.objectAt({ x: 20, y: 31, z: 10 })?.id).toBe(door.id);
    // 한 편집의 칸들은 같은 batchId 다
    expect(changes.map((c) => c.batchId)).toEqual([1, 1, 2, 2]);
  });

  it('같은 blockId 의 인접 객체도 서로 다른 id 로 구별된다', () => {
    const { world } = setup();
    const a = bed(world, 10, 30, 10);
    const b = bed(world, 12, 30, 10);
    world.editObject({ kind: 'place', object: a }, 'player');
    world.editObject({ kind: 'place', object: b }, 'player');
    expect(world.placements.objectAt({ x: 11, y: 30, z: 10 })?.id).toBe(a.id);
    expect(world.placements.objectAt({ x: 12, y: 30, z: 10 })?.id).toBe(b.id);
    expect(a.id).not.toBe(b.id);
    expect(world.placements.objectIdCounter).toBe(2);
  });

  it('일부 칸만 실패하면 모두 롤백한다 — 둘째 칸이 막혀 있음', () => {
    const { world, changes } = setup();
    world.setBlock(11, 30, 10, BlockId.stone, 'player');
    world.takeDirtyChunks();
    changes.length = 0;
    const b = bed(world, 10, 30, 10);
    expect(world.editObject({ kind: 'place', object: b }, 'player')).toBe(false);
    expect(world.getBlock(10, 30, 10)).toBe(BlockId.air);
    expect(world.placements.get(b.id)).toBeUndefined();
    expect(world.takeDirtyChunks()).toEqual([]);
    expect(changes).toEqual([]);
  });

  it('일부 칸만 실패하면 모두 롤백한다 — 둘째 칸이 월드 밖 / 기존 객체', () => {
    const { world } = setup();
    const edge: PlacedObjectSnapshot = { ...bed(world, 127, 30, 5) };
    expect(world.editObject({ kind: 'place', object: edge }, 'player')).toBe(false);
    expect(world.getBlock(127, 30, 5)).toBe(BlockId.air);
    const top: PlacedObjectSnapshot = {
      id: world.placements.allocateId(),
      blockId: BlockId.door,
      anchor: { x: 3, y: 63, z: 3 },
      facing: 'south',
    };
    expect(world.editObject({ kind: 'place', object: top }, 'player')).toBe(false);
    const a = bed(world, 10, 30, 10);
    world.editObject({ kind: 'place', object: a }, 'player');
    const overlap: PlacedObjectSnapshot = { ...bed(world, 9, 30, 10) };
    expect(world.editObject({ kind: 'place', object: overlap }, 'player')).toBe(false);
    expect(world.getBlock(9, 30, 10)).toBe(BlockId.air);
    // 같은 id 재설치 거부
    expect(
      world.editObject(
        { kind: 'place', object: { ...a, anchor: { x: 30, y: 30, z: 30 } } },
        'player',
      ),
    ).toBe(false);
  });

  it('어느 칸을 통해 찾든 제거하면 객체 전체가 사라지고 removedObject 가 실린다', () => {
    const { world, changes } = setup();
    const b = bed(world, 10, 30, 10);
    world.editObject({ kind: 'place', object: b }, 'player');
    changes.length = 0;
    const found = world.placements.objectAt({ x: 11, y: 30, z: 10 });
    expect(found).toBeDefined();
    expect(world.editObject({ kind: 'remove', objectId: found?.id ?? '' }, 'player')).toBe(true);
    expect(world.getBlock(10, 30, 10)).toBe(BlockId.air);
    expect(world.getBlock(11, 30, 10)).toBe(BlockId.air);
    expect(world.placements.isOccupied({ x: 10, y: 30, z: 10 })).toBe(false);
    expect(changes).toHaveLength(2);
    expect(changes.every((c) => c.removedObject?.id === b.id && c.to === 0)).toBe(true);
    expect(world.editObject({ kind: 'remove', objectId: b.id }, 'player')).toBe(false);
  });

  it('다중 칸 객체에 단일 setBlock 을 직접 적용하면 거부한다', () => {
    const { world, changes } = setup();
    expect(world.setBlock(5, 30, 5, BlockId.bed, 'player')).toBe(false);
    expect(world.setBlock(5, 30, 5, BlockId.door, 'player')).toBe(false);
    const b = bed(world, 10, 30, 10);
    world.editObject({ kind: 'place', object: b }, 'player');
    changes.length = 0;
    expect(world.setBlock(11, 30, 10, BlockId.air, 'player')).toBe(false);
    expect(world.setBlock(10, 30, 10, BlockId.stone, 'monster')).toBe(false);
    expect(world.getBlock(11, 30, 10)).toBe(BlockId.bed);
    expect(changes).toEqual([]);
    // 단일 칸 블록 id 로 다중 칸 editObject 도 거부한다
    expect(
      world.editObject(
        {
          kind: 'place',
          object: { ...b, id: 'x', blockId: BlockId.plank, anchor: { x: 1, y: 1, z: 1 } },
        },
        'player',
      ),
    ).toBe(false);
  });
});

describe('월드 크기 주입', () => {
  it('MVP 와 다른 작은 fixture(20 × 18 × 33)에서도 경계·청크 좌표가 맞다', () => {
    const { world } = setup({ sizeX: 20, sizeY: 18, sizeZ: 33 });
    expect([world.chunksX, world.chunksY, world.chunksZ]).toEqual([2, 2, 3]);
    expect(world.setBlock(19, 17, 32, BlockId.stone, 'player')).toBe(true);
    expect(world.setBlock(20, 0, 0, BlockId.stone, 'player')).toBe(false);
    expect(world.getBlock(19, 17, 32)).toBe(BlockId.stone);
    expect(world.getBlock(20, 17, 32)).toBe(0);
    // z=32 은 로컬 0 이므로 cz=1 이웃도 포함된다
    expect(dirtyKeys(world)).toEqual(['1,1,1', '1,1,2']);
    expect(world.setBlock(17, 17, 40, BlockId.dirt, 'player')).toBe(false);
    world.setBlock(17, 17, 20, BlockId.dirt, 'player');
    expect(dirtyKeys(world)).toEqual(['1,1,1']);
    world.setBlock(16, 16, 32, BlockId.dirt, 'player');
    expect(dirtyKeys(world)).toEqual([
      '0,0,1',
      '0,0,2',
      '0,1,1',
      '0,1,2',
      '1,0,1',
      '1,0,2',
      '1,1,1',
      '1,1,2',
    ]);
    expect(world.getChunk(1, 1, 2)?.coord).toEqual({ cx: 1, cy: 1, cz: 2 });
    expect(world.getChunk(2, 0, 0)).toBeUndefined();
  });

  it('잘못된 크기를 거부한다', () => {
    expect(() => setup({ sizeX: 0, sizeY: 1, sizeZ: 1 })).toThrow(RangeError);
  });
});
