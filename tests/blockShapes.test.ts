import { describe, expect, it } from 'vitest';
import { BLOCK_SHAPES } from '../src/game/data/blockShapes';
import { BLOCKS, BlockId } from '../src/game/data/blocks';
import type { MeshBuffers } from '../src/game/types';
import { greedyMesh, PADDED_VOLUME, paddedIndex } from '../src/workers/greedyMesh';

/** 빈 padded 뷰. */
function empty(): Uint16Array {
  return new Uint16Array(PADDED_VOLUME);
}

/** 청크 로컬 칸 (x, y, z) 에 블록을 둔다(padded 는 +1). */
function put(p: Uint16Array, x: number, y: number, z: number, id: number): void {
  p[paddedIndex(x + 1, y + 1, z + 1)] = id;
}

/** 버퍼의 정점 좌표 목록. */
function vertices(b: MeshBuffers): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < b.positions.length; i += 3) {
    out.push([b.positions[i] ?? 0, b.positions[i + 1] ?? 0, b.positions[i + 2] ?? 0]);
  }
  return out;
}

/** 축 a 의 [최소, 최대]. */
function range(vs: readonly [number, number, number][], a: 0 | 1 | 2): [number, number] {
  const xs = vs.map((v) => v[a]);
  return [Math.min(...xs), Math.max(...xs)];
}

/** 모양의 상자 수 × 6. */
function faceCount(id: number): number {
  return (BLOCK_SHAPES.get(id)?.boxes.length ?? 0) * 6;
}

describe('기존 블록의 모양 표현 (TASK-SHAPE-001, ADR 028 보완)', () => {
  it('모양 블록 하나는 상자마다 여섯 면을 내고, 칸을 넘지 않는다', () => {
    for (const id of BLOCK_SHAPES.keys()) {
      const p = empty();
      put(p, 5, 5, 5, id);
      const mesh = greedyMesh(p, BLOCKS);
      expect(mesh.stats.visibleFaces).toBe(faceCount(id));
      const b = BLOCKS[id]?.translucent ? mesh.transparent : mesh.opaque;
      if (!b) throw new Error('버퍼 없음');
      const vs = vertices(b);
      for (const a of [0, 1, 2] as const) {
        const [lo, hi] = range(vs, a);
        expect(lo).toBeGreaterThanOrEqual(5);
        expect(hi).toBeLessThanOrEqual(6);
      }
      // AO 는 1 이다(작은 상자에 칸 단위 AO 를 쓰지 않는다)
      expect([...b.ao].every((x) => x === 1)).toBe(true);
    }
  });

  it('가구 모형 블록(prop)은 청크 면을 내지 않고 이웃 면을 가리지 않는다 (STYLE-003)', () => {
    const p = empty();
    put(p, 5, 4, 5, BlockId.stone);
    put(p, 5, 5, 5, BlockId.torch);
    const mesh = greedyMesh(p, BLOCKS, { greedy: false });
    // 돌 여섯 면만(횃불 아래 윗면 포함). 횃불은 FurnitureView 가 모형으로 그린다
    expect(mesh.stats.visibleFaces).toBe(6);
    const q = empty();
    put(q, 5, 4, 5, BlockId.plank);
    put(q, 5, 5, 5, BlockId.table);
    const top = vertices(greedyMesh(q, BLOCKS, { greedy: false }).opaque).filter(
      (v) => v[1] === 5 && v[0] >= 5 && v[0] <= 6,
    );
    expect(top.length).toBeGreaterThanOrEqual(4);
  });

  it('모양 블록은 이웃의 AO 를 어둡게 하지 않는다', () => {
    const p = empty();
    put(p, 5, 5, 5, BlockId.stone);
    put(p, 6, 6, 5, BlockId.chest); // 돌 윗면 모서리 위 대각선
    const withChest = greedyMesh(p, BLOCKS);
    expect([...withChest.opaque.ao].filter((x) => x < 1)).toHaveLength(0);
  });

  it('창문 판유리는 벽을 따라 선다: ±x 가 벽이면 z 로 얇고, ±z 가 벽이면 x 로 얇다', () => {
    const inX = empty();
    put(inX, 4, 5, 5, BlockId.plank);
    put(inX, 6, 5, 5, BlockId.plank);
    put(inX, 5, 5, 5, BlockId.window);
    const a = vertices(greedyMesh(inX, BLOCKS).transparent as MeshBuffers);
    expect(range(a, 2)).toEqual([5 + 7 / 16, 5 + 9 / 16]);
    expect(range(a, 0)).toEqual([5, 6]);
    const inZ = empty();
    put(inZ, 5, 5, 4, BlockId.plank);
    put(inZ, 5, 5, 6, BlockId.plank);
    put(inZ, 5, 5, 5, BlockId.window);
    const b = vertices(greedyMesh(inZ, BLOCKS).transparent as MeshBuffers);
    expect(range(b, 0)).toEqual([5 + 7 / 16, 5 + 9 / 16]);
    expect(range(b, 2)).toEqual([5, 6]);
    // 이어진 창문 둘 사이의 끝면은 지운다
    const pair = empty();
    put(pair, 5, 5, 5, BlockId.window);
    put(pair, 6, 5, 5, BlockId.window);
    expect(greedyMesh(pair, BLOCKS).stats.visibleFaces).toBe(10);
  });

  it('바닥 한 층을 모양 블록으로 채워도 버퍼는 두 벌이고 메싱은 20 ms 미만이다', () => {
    const ids = [...BLOCK_SHAPES.keys()];
    const p = empty();
    for (let x = 0; x < 16; x++)
      for (let z = 0; z < 16; z++) {
        put(p, x, 0, z, BlockId.plank);
        put(p, x, 1, z, ids[(x + z * 3) % ids.length] ?? BlockId.table);
      }
    greedyMesh(p, BLOCKS); // 워밍업
    // 병렬 테스트 부하에 흔들리지 않게 다섯 번 중 가장 빠른 값을 잰다(메싱 자체의 비용)
    let ms = Number.POSITIVE_INFINITY;
    let mesh = greedyMesh(p, BLOCKS);
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      mesh = greedyMesh(p, BLOCKS);
      ms = Math.min(ms, performance.now() - t0);
    }
    expect(Object.keys(mesh).sort()).toEqual(['opaque', 'stats', 'transparent']);
    expect(mesh.transparent).not.toBeNull();
    expect(ms).toBeLessThan(20);
    console.info(`[shape] 256 칸 모양 층 메싱 최소 ${ms.toFixed(2)} ms, 쿼드 ${mesh.stats.quads}`);
  });

  it('정육면체로 그리던 결과는 모양 표를 비우면 그대로다', () => {
    const p = empty();
    put(p, 5, 5, 5, BlockId.window);
    expect(greedyMesh(p, BLOCKS, { shapes: new Map() }).stats.visibleFaces).toBe(6);
  });
});
