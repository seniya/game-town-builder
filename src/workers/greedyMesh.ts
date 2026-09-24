// 청크 그리디 메싱 — 순수 함수 (ARCHITECTURE 9.3, MVP_SPEC 33.2). Worker 도 three 도 모른다.
// 입력은 경계 1 칸을 포함한 18³ padded 뷰다. padded 인덱스 = px + pz * 18 + py * 324.
// 모양 블록(가구·소품, ADR 028 보완)은 그리디 마스크에서 빼고 모양 표의 상자마다 면을 낸다. 같은 청크 메시에 들어간다.
import { BlockId } from '../game/data/blocks';
import { BLOCK_SHAPES, type BlockShape, type ShapeBox } from '../game/data/blockShapes';
import type { BlockDefinition, MeshBuffers, MeshData } from '../game/types';

/** padded 한 변 (16 + 경계 2). */
export const PADDED_SIZE = 18;
/** padded 배열 길이 (18³ = 5832). */
export const PADDED_VOLUME = PADDED_SIZE * PADDED_SIZE * PADDED_SIZE;
const S = 16;
const P = PADDED_SIZE;
/** AO 최대값(가려지지 않음). ao 속성은 이 값으로 나눈 0~1 이다. */
const AO_MAX = 3;

/** 계측용 옵션. 기본은 둘 다 켠다. */
export interface GreedyMeshOptions {
  /** false 면 모든 정점 AO 를 최대로 둔다 (AO 에 의한 병합 제약 측정용) */
  readonly ao?: boolean;
  /** false 면 병합 없이 면마다 쿼드를 만든다 (면 컬링만의 결과 측정용) */
  readonly greedy?: boolean;
  /** 모양 표. 기본은 BLOCK_SHAPES. 빈 Map 이면 모든 블록을 정육면체로 그린다 */
  readonly shapes?: ReadonlyMap<number, BlockShape>;
}

/** padded 좌표 → 배열 인덱스. */
export function paddedIndex(px: number, py: number, pz: number): number {
  return px + pz * P + py * P * P;
}

/** 버퍼를 만드는 동안 쓰는 가변 배열. */
class MeshBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  ao: number[] = [];
  tiles: number[] = [];
  indices: number[] = [];
  quads = 0;

  /**
   * 쿼드 하나를 추가한다. corners 는 반시계(바깥에서 볼 때) 순서의 네 정점이다.
   * AO 이방성 보정 (0fps 방식): a0 + a2 > a1 + a3 이면 1-3 대각선으로 삼각형을 나눈다.
   */
  addQuad(
    corners: readonly (readonly [number, number, number])[],
    normal: readonly [number, number, number],
    uv: readonly (readonly [number, number])[],
    ao: readonly number[],
    tile: number,
  ): void {
    const base = this.positions.length / 3;
    for (let i = 0; i < 4; i++) {
      const c = corners[i] as readonly [number, number, number];
      this.positions.push(c[0], c[1], c[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      const t = uv[i] as readonly [number, number];
      this.uvs.push(t[0], t[1]);
      this.ao.push((ao[i] ?? AO_MAX) / AO_MAX);
      this.tiles.push(tile);
    }
    const a0 = ao[0] ?? AO_MAX;
    const a1 = ao[1] ?? AO_MAX;
    const a2 = ao[2] ?? AO_MAX;
    const a3 = ao[3] ?? AO_MAX;
    if (a0 + a2 > a1 + a3) {
      this.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    } else {
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    this.quads += 1;
  }

  /** TypedArray 버퍼로 변환한다. */
  build(): MeshBuffers {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      ao: new Float32Array(this.ao),
      tiles: new Float32Array(this.tiles),
      indices: new Uint32Array(this.indices),
    };
  }
}

/**
 * 18³ padded 뷰에서 가운데 16³ 청크의 메시를 만든다.
 * 면 컬링 → 같은 블록·같은 균일 AO 의 면을 그리디 병합 → 정점 AO. 불투명과 반투명을 분리한다.
 */
export function greedyMesh(
  padded: Uint16Array,
  defs: readonly BlockDefinition[],
  options: GreedyMeshOptions = {},
): MeshData {
  if (padded.length !== PADDED_VOLUME) {
    throw new RangeError(`padded 길이는 ${PADDED_VOLUME} 이어야 한다: ${padded.length}`);
  }
  const useAo = options.ao ?? true;
  const useGreedy = options.greedy ?? true;
  const shapes = options.shapes ?? BLOCK_SHAPES;
  const opaque = new MeshBuilder();
  const transparent = new MeshBuilder();
  let visibleFaces = 0;

  // padded 인덱스의 축별 보폭: x = 1, y = 324, z = 18
  const stride = [1, P * P, P];
  /**
   * padded 인덱스의 블록 정의. air·모르는 id·렌더 모형 블록(prop: door / bed)은 undefined.
   * 모형 블록은 면을 만들지 않고 이웃 면을 가리지도 않는다(모형이 그 자리를 따로 그린다, ADR 026).
   */
  const defAtIndex = (index: number): BlockDefinition | undefined => {
    const id = padded[index] ?? 0;
    const def = id === 0 ? undefined : defs[id];
    return def?.prop ? undefined : def;
  };
  /** AO·컬링의 가림 판정. 불투명 블록만 가린다. 모양 블록은 칸을 다 채우지 않으므로 가리지 않는다. */
  const occludes = (index: number): boolean => {
    const def = defAtIndex(index);
    return def?.opaque === true && !shapes.has(def.id);
  };

  // 한 슬라이스의 면 정보. blockId 0 은 면 없음.
  const maskBlock = new Int32Array(S * S);
  const maskAo = new Int32Array(S * S * 4);
  // 네 모서리 순서: (-u,-v) (+u,-v) (+u,+v) (-u,+v)
  const cornerU = [-1, 1, 1, -1];
  const cornerV = [-1, -1, 1, 1];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const sd = stride[d] ?? 0;
    const su = stride[u] ?? 0;
    const sv = stride[v] ?? 0;
    for (const s of [1, -1] as const) {
      const normal: [number, number, number] = [0, 0, 0];
      normal[d] = s;
      const faceClass = d === 1 ? (s === 1 ? 0 : 1) : 2;

      for (let slice = 0; slice < S; slice++) {
        maskBlock.fill(0);
        // 1) 면 컬링과 AO 계산으로 마스크를 채운다
        for (let j = 0; j < S; j++) {
          for (let i = 0; i < S; i++) {
            const bi = (slice + 1) * sd + (i + 1) * su + (j + 1) * sv;
            const bd = defAtIndex(bi);
            if (!bd || shapes.has(bd.id)) continue;
            const ni = bi + s * sd;
            const nd = defAtIndex(ni);
            if (occludes(ni)) continue;
            // 같은 종류끼리 맞닿은 면은 반투명(water / window)만 지운다. 잎처럼 구멍 뚫린 블록은 안쪽 면도 그려
            // 나무 속에서 봐도 잎이 차 있어 보이게 한다 (HR 기타 의견 2, ADR 027)
            if (bd.translucent && nd?.id === bd.id) continue;
            visibleFaces += 1;
            const m = i + j * S;
            maskBlock[m] = bd.id;
            for (let k = 0; k < 4; k++) {
              let value = AO_MAX;
              if (useAo) {
                const du = (cornerU[k] ?? 0) * su;
                const dv = (cornerV[k] ?? 0) * sv;
                const o1 = occludes(ni + du);
                const o2 = occludes(ni + dv);
                value =
                  o1 && o2
                    ? 0
                    : AO_MAX - (Number(o1) + Number(o2) + Number(occludes(ni + du + dv)));
              }
              maskAo[m * 4 + k] = value;
            }
          }
        }

        // 2) 그리디 병합. AO 가 네 모서리 모두 같은 면끼리만 합친다 (보간 왜곡 방지)
        const plane = s === 1 ? slice + 1 : slice;
        for (let j = 0; j < S; j++) {
          for (let i = 0; i < S;) {
            const m = i + j * S;
            const id = maskBlock[m] ?? 0;
            if (id === 0) {
              i += 1;
              continue;
            }
            const ao = [maskAo[m * 4], maskAo[m * 4 + 1], maskAo[m * 4 + 2], maskAo[m * 4 + 3]].map(
              (x) => x ?? AO_MAX,
            );
            const uniform = ao.every((x) => x === ao[0]);
            const same = (mm: number): boolean =>
              maskBlock[mm] === id &&
              maskAo[mm * 4] === ao[0] &&
              maskAo[mm * 4 + 1] === ao[1] &&
              maskAo[mm * 4 + 2] === ao[2] &&
              maskAo[mm * 4 + 3] === ao[3];
            let w = 1;
            let h = 1;
            if (useGreedy && uniform) {
              while (i + w < S && same(i + w + j * S)) w++;
              outer: while (j + h < S) {
                for (let k = 0; k < w; k++) if (!same(i + k + (j + h) * S)) break outer;
                h++;
              }
            }
            for (let jj = 0; jj < h; jj++) {
              for (let ii = 0; ii < w; ii++) maskBlock[i + ii + (j + jj) * S] = 0;
            }
            const corner = (cu: number, cv: number): [number, number, number] => {
              const p: [number, number, number] = [0, 0, 0];
              p[d] = plane;
              p[u] = cu;
              p[v] = cv;
              return p;
            };
            let corners = [corner(i, j), corner(i + w, j), corner(i + w, j + h), corner(i, j + h)];
            // x 면(d = 0)은 u 축이 y 이므로 uv 를 바꿔 텍스처의 위쪽이 월드 +y 를 향하게 한다
            let uv: [number, number][] =
              d === 0
                ? [
                    [0, 0],
                    [0, w],
                    [h, w],
                    [h, 0],
                  ]
                : [
                    [0, 0],
                    [w, 0],
                    [w, h],
                    [0, h],
                  ];
            let aoOrdered = ao;
            if (s === -1) {
              // 뒷면은 감는 방향을 뒤집는다 (0,3,2,1)
              corners = [corners[0], corners[3], corners[2], corners[1]] as typeof corners;
              uv = [uv[0], uv[3], uv[2], uv[1]] as typeof uv;
              aoOrdered = [ao[0], ao[3], ao[2], ao[1]].map((x) => x ?? AO_MAX);
            }
            const def = defs[id];
            const target = def?.translucent ? transparent : opaque;
            target.addQuad(corners, normal, uv, aoOrdered, id * 3 + faceClass);
            i += w;
          }
        }
      }
    }
  }

  // 3) 모양 블록: 상자마다 여섯 면. 칸 경계의 면은 이웃이 (모양이 아닌) 불투명 블록일 때만 지운다. AO 는 1 이다
  for (let y = 0; y < S; y++) {
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const bi = paddedIndex(x + 1, y + 1, z + 1);
        const def = defAtIndex(bi);
        const shape = def ? shapes.get(def.id) : undefined;
        if (!def || !shape) continue;
        const target = def.translucent ? transparent : opaque;
        const turns = orientTurns(shape, bi, padded, defs, shapes);
        // 반투명 모양(판유리)은 같은 블록과 맞닿은 경계 면도 지운다. 이어진 창문 사이에 선이 비치지 않게 한다
        const hidden = (n: number): boolean =>
          occludes(n) || (def.translucent && (padded[n] ?? 0) === def.id);
        for (const raw of shape.boxes) {
          const b = rotateBox(raw, turns);
          const tile = (raw.tileFrom ?? def.id) * 3;
          visibleFaces += emitBox(target, b, [x, y, z], bi, tile, stride, hidden);
        }
      }
    }
  }

  return {
    opaque: opaque.build(),
    transparent: transparent.quads > 0 ? transparent.build() : null,
    stats: { visibleFaces, quads: opaque.quads + transparent.quads },
  };
}

/** 수평 방향 [dx, dz] → padded 보폭. */
function paddedOffset(dx: number, dz: number): number {
  return dx + dz * P;
}

/**
 * 방향 규칙에 따른 y 축 ¼ 회전 수 (ADR 028 보완 2). 0 = 모양 표 그대로.
 *   pane     ±z 쪽 벽 이웃이 ±x 쪽보다 많으면 판유리를 z 방향으로 돌린다(1)
 *   backrest 맞닿은 식탁의 반대쪽에 등받이: 식탁이 남(+z) 0 / 서(−x) 1 / 북(−z) 2 / 동(+x) 3. 식탁이 없으면 0
 */
function orientTurns(
  shape: BlockShape,
  bi: number,
  padded: Uint16Array,
  defs: readonly BlockDefinition[],
  shapes: ReadonlyMap<number, BlockShape>,
): number {
  const idAt = (dx: number, dz: number): number => padded[bi + paddedOffset(dx, dz)] ?? 0;
  if (shape.orient === 'pane') {
    const wall = (id: number): boolean => {
      if (id === BlockId.window) return true;
      const d = defs[id];
      return d !== undefined && (d.kind === 'door' || (d.solid && !d.prop && !shapes.has(id)));
    };
    const xs = Number(wall(idAt(1, 0))) + Number(wall(idAt(-1, 0)));
    const zs = Number(wall(idAt(0, 1))) + Number(wall(idAt(0, -1)));
    return zs > xs ? 1 : 0;
  }
  if (shape.orient === 'backrest') {
    const T = BlockId.table;
    if (idAt(0, 1) === T) return 0;
    if (idAt(-1, 0) === T) return 1;
    if (idAt(0, -1) === T) return 2;
    if (idAt(1, 0) === T) return 3;
  }
  return 0;
}

/**
 * 상자를 칸 가운데를 축으로 y 축 ¼ 회전 turns 번 돌린다. 한 번은 (x, z) → (16 − z, x):
 * 북쪽(−z)에 있던 부분이 동쪽(+x)으로 간다.
 */
function rotateBox(b: ShapeBox, turns: number): ShapeBox {
  let x0 = b.min[0];
  let z0 = b.min[2];
  let x1 = b.max[0];
  let z1 = b.max[2];
  for (let t = 0; t < turns % 4; t++) {
    const nx0 = 16 - z1;
    const nx1 = 16 - z0;
    z0 = x0;
    z1 = x1;
    x0 = nx0;
    x1 = nx1;
  }
  return { ...b, min: [x0, b.min[1], z0], max: [x1, b.max[1], z1] };
}

/**
 * 상자 하나의 면을 낸다. cell 은 청크 로컬 칸, 상자 좌표는 1/16 단위다. 낸 면 수를 반환한다.
 * 칸 경계에 닿은 면은 그 이웃 칸이 hidden 이면 지운다. 정점 AO 는 1, UV 는 칸 로컬 좌표(0~1)다.
 */
function emitBox(
  target: MeshBuilder,
  b: ShapeBox,
  cell: readonly [number, number, number],
  bi: number,
  tileBase: number,
  stride: readonly number[],
  hidden: (index: number) => boolean,
): number {
  let faces = 0;
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    for (const s of [1, -1] as const) {
      const at = s === 1 ? (b.max[d] ?? 16) : (b.min[d] ?? 0);
      const onBoundary = s === 1 ? at === 16 : at === 0;
      if (onBoundary && hidden(bi + s * (stride[d] ?? 0))) continue;
      const normal: [number, number, number] = [0, 0, 0];
      normal[d] = s;
      const faceClass = d === 1 ? (s === 1 ? 0 : 1) : 2;
      const u0 = b.min[u] ?? 0;
      const u1 = b.max[u] ?? 16;
      const v0 = b.min[v] ?? 0;
      const v1 = b.max[v] ?? 16;
      const corner = (cu: number, cv: number): [number, number, number] => {
        const p: [number, number, number] = [0, 0, 0];
        p[d] = (cell[d] ?? 0) + at / 16;
        p[u] = (cell[u] ?? 0) + cu / 16;
        p[v] = (cell[v] ?? 0) + cv / 16;
        return p;
      };
      // greedy 와 같은 텍스처 방향: x 면은 (v, u), 나머지는 (u, v). 타일 위쪽이 월드 +y 를 향한다
      const tex = (cu: number, cv: number): [number, number] =>
        d === 0 ? [cv / 16, cu / 16] : [cu / 16, cv / 16];
      let corners = [corner(u0, v0), corner(u1, v0), corner(u1, v1), corner(u0, v1)];
      let uv = [tex(u0, v0), tex(u1, v0), tex(u1, v1), tex(u0, v1)];
      if (s === -1) {
        corners = [corners[0], corners[3], corners[2], corners[1]] as typeof corners;
        uv = [uv[0], uv[3], uv[2], uv[1]] as typeof uv;
      }
      target.addQuad(corners, normal, uv, [AO_MAX, AO_MAX, AO_MAX, AO_MAX], tileBase + faceClass);
      faces += 1;
    }
  }
  return faces;
}
