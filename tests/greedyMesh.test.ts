import { describe, expect, it } from 'vitest';
import { BLOCKS, BlockId } from '../src/game/data/blocks';
import { greedyMesh, PADDED_VOLUME, paddedIndex } from '../src/workers/greedyMesh';
import type { MeshBuffers } from '../src/game/types';

/** 빈 padded 뷰. */
function emptyPadded(): Uint16Array {
  return new Uint16Array(PADDED_VOLUME);
}

/** 청크 로컬 좌표(0~15)에 블록을 둔다. 경계 칸은 -1 / 16 으로 지정한다. */
function put(padded: Uint16Array, x: number, y: number, z: number, id: number): void {
  padded[paddedIndex(x + 1, y + 1, z + 1)] = id;
}

/** 버퍼의 정점 수. */
function vertexCount(b: MeshBuffers): number {
  return b.positions.length / 3;
}

describe('greedyMesh (TASK-005)', () => {
  it('전부 air 인 청크가 정점 0 개를 만든다', () => {
    const mesh = greedyMesh(emptyPadded(), BLOCKS);
    expect(vertexCount(mesh.opaque)).toBe(0);
    expect(mesh.opaque.indices).toHaveLength(0);
    expect(mesh.transparent).toBeNull();
  });

  it('단일 블록 하나가 정확히 6 면 24 정점을 만든다', () => {
    const p = emptyPadded();
    put(p, 5, 5, 5, BlockId.stone);
    const mesh = greedyMesh(p, BLOCKS);
    expect(mesh.stats.visibleFaces).toBe(6);
    expect(mesh.stats.quads).toBe(6);
    expect(vertexCount(mesh.opaque)).toBe(24);
    expect(mesh.opaque.indices).toHaveLength(36);
  });

  it('2 × 1 × 1 로 붙은 같은 블록에서 맞닿은 2 면이 컬링되어 보이는 면이 10 개다', () => {
    const p = emptyPadded();
    put(p, 5, 5, 5, BlockId.stone);
    put(p, 6, 5, 5, BlockId.stone);
    expect(greedyMesh(p, BLOCKS, { greedy: false }).stats).toEqual({ visibleFaces: 10, quads: 10 });
  });

  it('주변 장애물이 없고 재질·AO가 같은 두 블록의 10면이 쿼드 6개로 병합된다', () => {
    const p = emptyPadded();
    put(p, 5, 5, 5, BlockId.stone);
    put(p, 6, 5, 5, BlockId.stone);
    const mesh = greedyMesh(p, BLOCKS);
    expect(mesh.stats).toEqual({ visibleFaces: 10, quads: 6 });
    expect(vertexCount(mesh.opaque)).toBe(24);
  });

  it('다른 재질은 병합하지 않는다', () => {
    const p = emptyPadded();
    put(p, 5, 5, 5, BlockId.stone);
    put(p, 6, 5, 5, BlockId.dirt);
    expect(greedyMesh(p, BLOCKS).stats.quads).toBe(10);
  });

  it('경계(padded 의 바깥 1 칸)가 불투명이면 해당 면이 생성되지 않는다', () => {
    const p = emptyPadded();
    put(p, 0, 5, 5, BlockId.stone);
    put(p, -1, 5, 5, BlockId.stone); // 이웃 청크의 블록
    const mesh = greedyMesh(p, BLOCKS);
    expect(mesh.stats.visibleFaces).toBe(5);
    // -x 방향 면(법선 x = -1)이 없다
    const n = mesh.opaque.normals;
    for (let i = 0; i < n.length; i += 3) expect(n[i]).not.toBe(-1);
    // 경계 칸 자체는 메싱하지 않는다
    const q = emptyPadded();
    put(q, -1, 5, 5, BlockId.stone);
    expect(greedyMesh(q, BLOCKS).stats.visibleFaces).toBe(0);
  });

  it('경계가 반투명(window)이면 면이 생성된다', () => {
    const p = emptyPadded();
    put(p, 0, 5, 5, BlockId.stone);
    put(p, -1, 5, 5, BlockId.window);
    expect(greedyMesh(p, BLOCKS).stats.visibleFaces).toBe(6);
  });

  it('삼각형의 감는 방향이 법선과 일치한다 (바깥에서 반시계)', () => {
    const p = emptyPadded();
    put(p, 5, 5, 5, BlockId.stone);
    const { positions, normals, indices } = greedyMesh(p, BLOCKS).opaque;
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t] ?? 0, indices[t + 1] ?? 0, indices[t + 2] ?? 0];
      const pa = [positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]].map(Number);
      const pb = [positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]].map(Number);
      const pc = [positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2]].map(Number);
      const e1 = pb.map((x, i) => x - (pa[i] ?? 0));
      const e2 = pc.map((x, i) => x - (pa[i] ?? 0));
      const cross = [
        (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
        (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
        (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
      ];
      const dot = cross.reduce((sum, x, i) => sum + x * (normals[a * 3 + i] ?? 0), 0);
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('바닥 위 블록의 옆면 아래 모서리가 AO 로 어두워진다', () => {
    const p = emptyPadded();
    for (let x = 3; x <= 7; x++) for (let z = 3; z <= 7; z++) put(p, x, 4, z, BlockId.stone);
    put(p, 5, 5, 5, BlockId.plank);
    const { positions, normals, ao, tiles } = greedyMesh(p, BLOCKS).opaque;
    // plank 의 +x 옆면 정점들: y=5 인 두 정점은 바닥에 가려 어둡고, y=6 은 밝다
    const values: Record<string, number[]> = { low: [], high: [] };
    for (let i = 0; i < positions.length / 3; i++) {
      if (tiles[i] !== BlockId.plank * 3 + 2 || normals[i * 3] !== 1) continue;
      values[positions[i * 3 + 1] === 5 ? 'low' : 'high']?.push(ao[i] ?? -1);
    }
    expect(values.low).toHaveLength(2);
    expect(Math.max(...(values.low ?? []))).toBeLessThan(1);
    expect(values.high).toEqual([1, 1]);
  });

  it('불투명 / 반투명(water / window)을 분리한다', () => {
    const p = emptyPadded();
    put(p, 1, 1, 1, BlockId.water);
    put(p, 2, 1, 1, BlockId.water);
    put(p, 8, 1, 1, BlockId.window);
    put(p, 12, 1, 1, BlockId.stone);
    const mesh = greedyMesh(p, BLOCKS);
    expect(mesh.transparent).not.toBeNull();
    expect(vertexCount(mesh.opaque)).toBe(24);
    // 물 두 칸은 맞닿은 면이 컬링되고 병합되어 6 쿼드, 창문 6 쿼드
    expect(vertexCount(mesh.transparent as MeshBuffers)).toBe((6 + 6) * 4);
  });

  it('면 종류별 타일: 윗면 0 / 아랫면 1 / 옆면 2', () => {
    const p = emptyPadded();
    put(p, 5, 5, 5, BlockId.grass);
    const { tiles, normals } = greedyMesh(p, BLOCKS).opaque;
    for (let i = 0; i < tiles.length; i++) {
      const ny = normals[i * 3 + 1];
      const expected = BlockId.grass * 3 + (ny === 1 ? 0 : ny === -1 ? 1 : 2);
      expect(tiles[i]).toBe(expected);
    }
  });

  it('padded 길이가 다르면 거부한다', () => {
    expect(() => greedyMesh(new Uint16Array(16 ** 3), BLOCKS)).toThrow(RangeError);
  });
});

describe('면 컬링 / 그리디 병합 / AO 의 감소량을 구분해 측정한다', () => {
  /** 5×5 바닥 + 높이 2 의 판자벽 한 줄 + 창문, 작은 집 조각. */
  function houseFixture(): Uint16Array {
    const p = emptyPadded();
    for (let x = 2; x <= 10; x++) for (let z = 2; z <= 10; z++) put(p, x, 3, z, BlockId.dirt);
    for (let x = 4; x <= 8; x++) for (let z = 4; z <= 8; z++) put(p, x, 4, z, BlockId.plank);
    for (let x = 4; x <= 8; x++) {
      put(p, x, 5, 4, BlockId.plank);
      put(p, x, 6, 4, x === 6 ? BlockId.window : BlockId.plank);
    }
    return p;
  }

  it('측정값', () => {
    const p = houseFixture();
    // 블록 수 × 6 = 컬링 전 면 수
    let blocks = 0;
    for (const id of p) if (id !== 0) blocks += 1;
    const facesBeforeCulling = blocks * 6;
    const cullOnly = greedyMesh(p, BLOCKS, { greedy: false });
    const greedyAo = greedyMesh(p, BLOCKS);
    const greedyNoAo = greedyMesh(p, BLOCKS, { ao: false });
    const verts = (m: typeof cullOnly): number =>
      m.opaque.positions.length / 3 + (m.transparent ? m.transparent.positions.length / 3 : 0);

    // 면 컬링: 컬링 전 면 → 보이는 면
    expect(cullOnly.stats.visibleFaces).toBeLessThan(facesBeforeCulling);
    // 그리디 병합: 보이는 면 → 쿼드
    expect(greedyAo.stats.quads).toBeLessThan(cullOnly.stats.quads);
    // AO 는 병합을 제한한다: AO 끔 ≤ AO 켬
    expect(greedyNoAo.stats.quads).toBeLessThanOrEqual(greedyAo.stats.quads);
    expect(verts(greedyAo)).toBe(greedyAo.stats.quads * 4);

    // 기록용 고정값. 알고리즘을 바꾸면 이 값과 state 기록을 함께 갱신한다.
    expect({
      facesBeforeCulling,
      visibleFaces: cullOnly.stats.visibleFaces,
      quadsCullOnly: cullOnly.stats.quads,
      quadsGreedyAo: greedyAo.stats.quads,
      quadsGreedyNoAo: greedyNoAo.stats.quads,
      vertsGreedyAo: verts(greedyAo),
      vertsGreedyNoAo: verts(greedyNoAo),
    }).toMatchInlineSnapshot(`
      {
        "facesBeforeCulling": 696,
        "quadsCullOnly": 245,
        "quadsGreedyAo": 79,
        "quadsGreedyNoAo": 29,
        "vertsGreedyAo": 316,
        "vertsGreedyNoAo": 116,
        "visibleFaces": 245,
      }
    `);
  });
});
