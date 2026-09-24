import { describe, expect, it } from 'vitest';
import { BLOCK_SHAPES, CHAIR_SEAT_HEIGHT } from '../src/game/data/blockShapes';
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

  it('모양 블록은 이웃 면을 가리지 않고, 불투명 블록에 붙은 자기 상자 면만 지운다', () => {
    const p = empty();
    put(p, 5, 4, 5, BlockId.stone);
    put(p, 5, 5, 5, BlockId.torch);
    const mesh = greedyMesh(p, BLOCKS, { greedy: false });
    // 돌은 여섯 면이 모두 보인다(횃불 아래 윗면 포함). 횃불 막대 밑면은 돌에 붙어 지운다
    expect(mesh.stats.visibleFaces).toBe(6 + faceCount(BlockId.torch) - 1);
    // 식탁 아래 바닥 윗면도 보인다(다리 사이로 보인다)
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

  it('의자 등받이는 맞닿은 식탁의 반대쪽에 선다', () => {
    const seatTop = 5 + CHAIR_SEAT_HEIGHT;
    // 의자 칸 안쪽(경계 제외): 옆 칸 식탁의 정점을 빼기 위해서다
    const inside = (c: number): boolean => c > 5 + 1e-6 && c < 6 - 1e-6;
    const backrest = (tx: number, tz: number): [number, number, number][] => {
      const p = empty();
      put(p, 5, 5, 5, BlockId.chair);
      put(p, 5 + tx, 5, 5 + tz, BlockId.table);
      return vertices(greedyMesh(p, BLOCKS).opaque).filter(
        (v) => v[1] > seatTop + 0.01 && inside(v[0]) && inside(v[2]),
      );
    };
    // 식탁이 남(+z) → 등받이는 북(z 2~4/16)
    expect(range(backrest(0, 1), 2)).toEqual([5 + 2 / 16, 5 + 4 / 16]);
    // 식탁이 북(−z) → 등받이는 남(z 12~14/16)
    expect(range(backrest(0, -1), 2)).toEqual([5 + 12 / 16, 5 + 14 / 16]);
    // 식탁이 동(+x) → 등받이는 서(x 2~4/16)
    expect(range(backrest(1, 0), 0)).toEqual([5 + 2 / 16, 5 + 4 / 16]);
    // 식탁이 서(−x) → 등받이는 동(x 12~14/16)
    expect(range(backrest(-1, 0), 0)).toEqual([5 + 12 / 16, 5 + 14 / 16]);
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
    const t0 = performance.now();
    const runs = 5;
    let mesh = greedyMesh(p, BLOCKS);
    for (let i = 1; i < runs; i++) mesh = greedyMesh(p, BLOCKS);
    const ms = (performance.now() - t0) / runs;
    expect(Object.keys(mesh).sort()).toEqual(['opaque', 'stats', 'transparent']);
    expect(mesh.transparent).not.toBeNull();
    expect(ms).toBeLessThan(20);
    console.info(`[shape] 256 칸 모양 층 메싱 평균 ${ms.toFixed(2)} ms, 쿼드 ${mesh.stats.quads}`);
  });

  it('정육면체로 그리던 결과는 모양 표를 비우면 그대로다', () => {
    const p = empty();
    put(p, 5, 5, 5, BlockId.table);
    expect(greedyMesh(p, BLOCKS, { shapes: new Map() }).stats.visibleFaces).toBe(6);
  });
});
