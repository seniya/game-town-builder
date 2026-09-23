import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/game/EventBus';
import { balance } from '../src/game/data/balance';
import { BlockId, isSolid, isTerrain } from '../src/game/data/blocks';
import { buildIsland, ISLAND_REGIONS, surfaceY, type IslandData } from '../src/game/data/island';
import { selectQuarryRespawnCells } from '../src/game/voxel/quarryRespawn';
import { VoxelWorld } from '../src/game/voxel/VoxelWorld';
import type { BlockPos } from '../src/game/types';

/** 섬을 새 월드에 만든다. */
function makeIsland(): { world: VoxelWorld; data: IslandData; ms: number } {
  const world = new VoxelWorld(balance.world, new EventBus());
  const t0 = performance.now();
  const data = buildIsland((x, y, z, id) => world.writeInitial(x, y, z, id));
  return { world, data, ms: performance.now() - t0 };
}

/** 블록 종류별 개수. */
function countBlocks(world: VoxelWorld): Map<number, number> {
  const counts = new Map<number, number>();
  for (let y = 0; y < world.sizeY; y++)
    for (let z = 0; z < world.sizeZ; z++)
      for (let x = 0; x < world.sizeX; x++) {
        const id = world.getBlock(x, y, z);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
  return counts;
}

const { world, data, ms } = makeIsland();
const counts = countBlocks(world);

describe('섬 생성 (TASK-008)', () => {
  it('생성이 결정적이다. 두 번 실행해도 같은 섬이 나온다', () => {
    const second = makeIsland();
    for (const c of world.allChunkCoords()) {
      const a = world.getChunk(c.cx, c.cy, c.cz)?.blocks;
      const b = second.world.getChunk(c.cx, c.cy, c.cz)?.blocks;
      expect(a === undefined).toBe(b === undefined);
      if (a && b) expect(a.every((v, i) => v === b[i])).toBe(true);
    }
    expect(second.data).toEqual(data);
  });

  it('생성 시간이 1 초 이하다 (Node, 이 머신)', () => {
    expect(ms).toBeLessThan(1000);
  });

  it('나무가 24 그루이며 log 96 / leaves 480 이다', () => {
    expect(data.treeBases).toHaveLength(balance.resource.treeCount);
    expect(counts.get(BlockId.log)).toBe(24 * 4);
    expect(counts.get(BlockId.leaves)).toBe(24 * 20);
    for (const b of data.treeBases) {
      for (let i = 0; i < 4; i++) expect(world.getBlock(b.x, b.y + i, b.z)).toBe(BlockId.log);
      expect(isSolid(world.getBlock(b.x, b.y - 1, b.z))).toBe(true);
    }
  });

  it('마을의 종이 (64, 지표면 + 1, 64) 에 한 개 있고 광장 지면 위에 선다', () => {
    expect(counts.get(BlockId.bell)).toBe(1);
    const s = surfaceY(64, 64);
    expect(data.bellPos).toEqual({ x: 64, y: s + 1, z: 64 });
    expect(world.getBlock(64, s + 1, 64)).toBe(BlockId.bell);
    expect(isTerrain(world.getBlock(64, s, 64))).toBe(true);
    // 광장(반지름 6)은 평평하다
    for (let dz = -6; dz <= 6; dz++)
      for (let dx = -6; dx <= 6; dx++) {
        if (dx * dx + dz * dz > 36) continue;
        expect(surfaceY(64 + dx, 64 + dz)).toBe(s);
      }
  });

  it('y=0 은 bedrock, 지표면은 25~34, 바다는 y=24 까지 물이다', () => {
    for (let z = 0; z < 128; z += 7)
      for (let x = 0; x < 128; x += 7) expect(world.getBlock(x, 0, z)).toBe(BlockId.bedrock);
    // 섬 중심에서 먼 모서리는 바다
    expect(world.getBlock(2, 24, 2)).toBe(BlockId.water);
    expect(world.getBlock(2, 25, 2)).toBe(BlockId.air);
    expect(world.getBlock(125, 24, 125)).toBe(BlockId.water);
    for (const r of Object.values(ISLAND_REGIONS)) {
      const s = surfaceY(r.x, r.z);
      expect(s).toBeGreaterThanOrEqual(24);
      expect(s).toBeLessThanOrEqual(34);
    }
  });

  it('영역별 지표: 채석장 돌 / 숲 풀·나무 / 물가 물·모래 / 외곽 흙 / 마을 풀과 폐허', () => {
    const top = (x: number, z: number): number => world.getBlock(x, surfaceY(x, z), z);
    expect(top(ISLAND_REGIONS.quarry.x, ISLAND_REGIONS.quarry.z)).toBe(BlockId.stone);
    expect(surfaceY(ISLAND_REGIONS.quarry.x, ISLAND_REGIONS.quarry.z)).toBeGreaterThan(30);
    expect(top(ISLAND_REGIONS.forest.x, ISLAND_REGIONS.forest.z)).toBe(BlockId.grass);
    const w = ISLAND_REGIONS.waterside;
    expect(world.getBlock(w.x, 26, w.z)).toBe(BlockId.water);
    expect(top(w.x + 7, w.z)).toBe(BlockId.sand);
    expect(top(ISLAND_REGIONS.outskirtsNorth.x, ISLAND_REGIONS.outskirtsNorth.z)).toBe(
      BlockId.dirt,
    );
    expect(top(ISLAND_REGIONS.outskirtsWest.x, ISLAND_REGIONS.outskirtsWest.z)).toBe(BlockId.dirt);
    expect(top(64, 64)).toBe(BlockId.grass);
    expect(counts.get(BlockId.plank)).toBeGreaterThan(10);
    expect(counts.get(BlockId.stone_brick)).toBeGreaterThan(40);
  });

  it('시작·스폰 칸은 발밑이 고체이고 몸이 들어갈 두 칸이 비어 있다 (MVP_SPEC 7.5)', () => {
    const spots: BlockPos[] = [
      data.playerSpawn,
      data.npcSpawns.farmer,
      data.npcSpawns.cook,
      data.npcSpawns.carpenter,
      ...data.monsterSpawns,
    ];
    expect(data.playerSpawn).toMatchObject({ x: 64, z: 70 });
    expect(data.npcSpawns.farmer).toMatchObject({ x: 62, z: 62 });
    expect(data.npcSpawns.cook).toMatchObject({ x: 66, z: 62 });
    expect(data.npcSpawns.carpenter).toMatchObject({ x: 64, z: 60 });
    for (const p of spots) {
      expect(isSolid(world.getBlock(p.x, p.y - 1, p.z))).toBe(true);
      expect(world.getBlock(p.x, p.y, p.z)).toBe(BlockId.air);
      expect(world.getBlock(p.x, p.y + 1, p.z)).toBe(BlockId.air);
    }
  });

  it('채석장 재생 후보는 원래 돌이며 y → z → x 순서로 고정된다', () => {
    const c = data.quarryRespawnCandidates;
    expect(c.length).toBeGreaterThan(balance.resource.stoneRespawnPerDay * 10);
    for (const p of c) expect(world.getBlock(p.x, p.y, p.z)).toBe(BlockId.stone);
    for (let i = 1; i < c.length; i++) {
      const a = c[i - 1] as BlockPos;
      const b = c[i] as BlockPos;
      expect(a.y < b.y || (a.y === b.y && (a.z < b.z || (a.z === b.z && a.x < b.x)))).toBe(true);
    }
  });
});

describe('채석장 재생 선택 (READY-01, MVP_SPEC 14.2)', () => {
  /** 섬 복사본 위에서 후보 앞쪽 n 칸을 캔다. */
  function minedIsland(n: number): { w: VoxelWorld; mined: BlockPos[] } {
    const { world: w, data: d } = makeIsland();
    const mined = d.quarryRespawnCandidates.slice(0, n);
    for (const p of mined) w.setBlock(p.x, p.y, p.z, BlockId.air, 'player');
    return { w, mined };
  }
  const limit = balance.resource.stoneRespawnPerDay;

  it('파낸 칸이 없으면 아무것도 복구하지 않는다', () => {
    const q = { getBlock: world.getBlock.bind(world), isOccupiedByCharacter: () => false };
    expect(selectQuarryRespawnCells(data.quarryRespawnCandidates, q, limit)).toEqual([]);
  });

  it('후보 순서대로 air 인 칸을 최대 8 개 고른다 (재현 가능)', () => {
    const { w, mined } = minedIsland(20);
    const q = { getBlock: w.getBlock.bind(w), isOccupiedByCharacter: () => false };
    const first = selectQuarryRespawnCells(data.quarryRespawnCandidates, q, limit);
    expect(first).toEqual(mined.slice(0, 8));
    expect(selectQuarryRespawnCells(data.quarryRespawnCandidates, q, limit)).toEqual(first);
  });

  it('캐릭터가 서 있는 칸은 건너뛴다', () => {
    const { w, mined } = minedIsland(12);
    const blocked = mined[0] as BlockPos;
    const q = {
      getBlock: w.getBlock.bind(w),
      isOccupiedByCharacter: (p: BlockPos) =>
        p.x === blocked.x && p.y === blocked.y && p.z === blocked.z,
    };
    const picked = selectQuarryRespawnCells(data.quarryRespawnCandidates, q, limit);
    expect(picked).not.toContainEqual(blocked);
    expect(picked).toEqual(mined.slice(1, 9));
  });

  it('플레이어가 놓은 블록을 덮지 않고, 건축물 바로 옆 칸도 메우지 않는다', () => {
    const { w, mined } = minedIsland(12);
    const a = mined[0] as BlockPos;
    w.setBlock(a.x, a.y, a.z, BlockId.plank, 'player'); // 파낸 자리에 판자를 놓음
    const q = { getBlock: w.getBlock.bind(w), isOccupiedByCharacter: () => false };
    const picked = selectQuarryRespawnCells(data.quarryRespawnCandidates, q, limit);
    expect(picked).not.toContainEqual(a);
    expect(w.getBlock(a.x, a.y, a.z)).toBe(BlockId.plank);
    // a 와 면으로 맞닿은 파낸 칸은 건너뛴다
    const adjacent = mined.filter(
      (m) => Math.abs(m.x - a.x) + Math.abs(m.y - a.y) + Math.abs(m.z - a.z) === 1,
    );
    for (const m of adjacent) expect(picked).not.toContainEqual(m);
    expect(picked.length).toBeLessThanOrEqual(limit);
  });

  it('후보가 부족하면 있는 만큼만 고른다', () => {
    const { w, mined } = minedIsland(3);
    const q = { getBlock: w.getBlock.bind(w), isOccupiedByCharacter: () => false };
    expect(selectQuarryRespawnCells(data.quarryRespawnCandidates, q, limit)).toEqual(mined);
  });
});
