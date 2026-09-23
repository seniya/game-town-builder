import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/game/EventBus';
import { BLOCKS, BlockId } from '../src/game/data/blocks';
import { VoxelWorld } from '../src/game/voxel/VoxelWorld';
import { MeshJobQueue } from '../src/render/MeshJobQueue';
import { greedyMesh, paddedIndex } from '../src/workers/greedyMesh';
import { chunkKey, type ChunkCoord, type MeshResult } from '../src/game/types';
import workerSource from '../src/workers/mesher.worker.ts?raw';

/** 작은 월드(3 × 2 × 3 청크). */
function makeWorld(): VoxelWorld {
  return new VoxelWorld({ sizeX: 48, sizeY: 32, sizeZ: 48 }, new EventBus());
}

/** Worker 없이 요청을 처리한 것과 같은 결과를 만든다. */
function mesh(world: VoxelWorld, coord: ChunkCoord, revision: number): MeshResult {
  return { coord, revision, ...greedyMesh(world.copyPadded(coord), BLOCKS) };
}

describe('VoxelWorld.copyPadded (ARCHITECTURE 9.2)', () => {
  it('경계 1 칸에 이웃 청크 블록을, 월드 밖은 air 를 담는다', () => {
    const world = makeWorld();
    world.setBlock(16, 5, 5, BlockId.stone, 'player'); // 청크 (1,0,0) 의 로컬 x=0
    world.setBlock(15, 5, 5, BlockId.dirt, 'player'); // 청크 (0,0,0) 의 로컬 x=15
    const p0 = world.copyPadded({ cx: 0, cy: 0, cz: 0 });
    const p1 = world.copyPadded({ cx: 1, cy: 0, cz: 0 });
    expect(p0[paddedIndex(17, 6, 6)]).toBe(BlockId.stone); // 이웃이 +x 경계에 보인다
    expect(p0[paddedIndex(16, 6, 6)]).toBe(BlockId.dirt);
    expect(p1[paddedIndex(0, 6, 6)]).toBe(BlockId.dirt); // 이웃이 -x 경계에 보인다
    expect(p1[paddedIndex(1, 6, 6)]).toBe(BlockId.stone);
    expect(p0[paddedIndex(0, 6, 6)]).toBe(0); // 월드 밖
  });

  it('월드 원본 배열과 버퍼를 공유하지 않는다 (transferable 로 넘겨도 안전)', () => {
    const world = makeWorld();
    world.setBlock(1, 1, 1, BlockId.stone, 'player');
    const padded = world.copyPadded({ cx: 0, cy: 0, cz: 0 });
    const chunk = world.getChunk(0, 0, 0);
    expect(padded.buffer).not.toBe(chunk?.blocks.buffer);
    padded.fill(0);
    expect(world.getBlock(1, 1, 1)).toBe(BlockId.stone);
  });

  it('청크 경계에 구멍이 없다: 두 청크 메시의 면 합이 전체 블록의 면과 같다', () => {
    const world = makeWorld();
    // x 14~17 의 벽이 청크 0 과 1 에 걸친다
    for (let x = 14; x <= 17; x++)
      for (let y = 2; y <= 4; y++) world.setBlock(x, y, 5, BlockId.plank, 'player');
    const a = mesh(world, { cx: 0, cy: 0, cz: 0 }, 0);
    const b = mesh(world, { cx: 1, cy: 0, cz: 0 }, 0);
    // 4 × 3 × 1 판의 보이는 면: 앞뒤 12 + 12, 위아래 4 + 4, 양 끝 3 + 3 = 38. 경계의 맞닿은 면은 없다
    expect(a.stats.visibleFaces + b.stats.visibleFaces).toBe(38);
  });
});

describe('MeshJobQueue — revision 과 순서 (TASK-006)', () => {
  it('내부 블록 하나는 해당 청크만, 경계 블록은 인접 청크도 다시 메싱한다', () => {
    const world = makeWorld();
    const q = new MeshJobQueue(world);
    world.setBlock(20, 5, 20, BlockId.stone, 'player');
    q.enqueue(world.takeDirtyChunks());
    expect(q.takeJobs(8).map((j) => chunkKey(j.coord))).toEqual(['1,0,1']);
    world.setBlock(16, 5, 20, BlockId.stone, 'player');
    q.enqueue(world.takeDirtyChunks());
    expect(
      q
        .takeJobs(8)
        .map((j) => chunkKey(j.coord))
        .sort(),
    ).toEqual(['0,0,1']);
    // 1,0,1 은 아직 진행 중이라 대기열에 남는다
    expect(q.pendingCount).toBe(1);
  });

  it('Worker 결과가 역순 도착해도 최신 meshRevision 의 메시만 표시된다', () => {
    const world = makeWorld();
    const q = new MeshJobQueue(world);
    const c = { cx: 0, cy: 0, cz: 0 };
    world.setBlock(3, 3, 3, BlockId.stone, 'player');
    q.enqueue(world.takeDirtyChunks());
    const [first] = q.takeJobs(4);
    const oldResult = mesh(world, c, first?.revision ?? -1);
    world.setBlock(4, 3, 3, BlockId.stone, 'player');
    q.enqueue(world.takeDirtyChunks());
    // 진행 중이므로 같은 청크의 두 번째 작업은 아직 나가지 않는다
    expect(q.takeJobs(4)).toEqual([]);
    q.receive(oldResult); // 오래된 결과 도착 → 버림. 대기열의 최신 작업은 그대로다
    expect(q.takeUploads(2)).toEqual([]);
    expect(q.pendingCount).toBe(1);
    const [second] = q.takeJobs(4);
    expect(second?.revision).toBe(world.getRevision(c));
    const newResult = mesh(world, c, second?.revision ?? -1);
    q.receive(newResult);
    q.receive(oldResult); // 더 늦게 도착한 오래된 결과도 최신을 덮지 않는다
    const uploads = q.takeUploads(2);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.revision).toBe(world.getRevision(c));
    expect(uploads[0]?.stats.visibleFaces).toBe(10);
    expect(q.idle).toBe(true);
  });

  it('처리 중 인접 청크 변경과 연속 편집에서 오래된 결과가 dirty 를 해제하지 않는다', () => {
    const world = makeWorld();
    const q = new MeshJobQueue(world);
    const c0 = { cx: 0, cy: 0, cz: 0 };
    world.setBlock(5, 5, 5, BlockId.stone, 'player');
    q.enqueue(world.takeDirtyChunks());
    const [job] = q.takeJobs(4);
    const stale = mesh(world, c0, job?.revision ?? -1);
    // 처리 중 이웃 청크의 경계 블록이 바뀌어 c0 의 padded 가 달라진다
    world.setBlock(16, 5, 5, BlockId.dirt, 'player');
    q.enqueue(world.takeDirtyChunks());
    q.receive(stale);
    expect(q.discarded).toBe(1);
    // c0 는 여전히 메싱이 필요하다
    const keys = q.takeJobs(4).map((j) => chunkKey(j.coord));
    expect(keys).toContain('0,0,0');
    expect(keys).toContain('1,0,0');
  });

  it('업로드 직전에 revision 이 바뀐 결과는 올리지 않고, dirty 로 다시 들어온다', () => {
    const world = makeWorld();
    const q = new MeshJobQueue(world);
    const c = { cx: 0, cy: 0, cz: 0 };
    world.setBlock(1, 1, 1, BlockId.stone, 'player');
    q.enqueue(world.takeDirtyChunks());
    const [job] = q.takeJobs(1);
    q.receive(mesh(world, c, job?.revision ?? -1));
    world.setBlock(2, 1, 1, BlockId.stone, 'player'); // dirty 는 아직 큐에 안 들어감
    expect(q.takeUploads(2)).toEqual([]);
    q.enqueue(world.takeDirtyChunks());
    expect(q.pendingCount).toBe(1);
  });

  it('프레임당 업로드는 요청한 개수까지만 꺼낸다', () => {
    const world = makeWorld();
    const q = new MeshJobQueue(world);
    world.markAllDirty();
    q.enqueue(world.takeDirtyChunks());
    const jobs = q.takeJobs(100);
    expect(jobs).toHaveLength(18);
    for (const j of jobs) q.receive(mesh(world, j.coord, j.revision));
    expect(q.takeUploads(2)).toHaveLength(2);
    expect(q.readyCount).toBe(16);
  });
});

describe('mesher.worker.ts 는 배선만 한다', () => {
  it('반복문·면 계산이 없고 greedyMesh 를 호출한다', () => {
    expect(workerSource).toContain('greedyMesh(');
    expect(workerSource).not.toMatch(/\bfor\s*\(|\bwhile\s*\(/);
  });
});
