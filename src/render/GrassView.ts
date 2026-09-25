// 풀잎 장식 (STYLE-008, MVP_SPEC 45.8). 풀 블록 윗면에 작은 풀잎 포기를 흩뿌려 풀밭을 부드럽게 보이게 한다.
// 렌더 전용 장식이며 게임 상태·충돌·조준·방 판정과 무관하다. 칸 목록은 청크마다 한 번 모아 두고,
// 그 청크(또는 바로 위 청크)의 리비전이 바뀔 때만 다시 모은다. 카메라 주변 반경 안의 포기만 InstancedMesh 하나로 그린다.
import * as THREE from 'three';
import { BlockId } from '../game/data/blocks';
import type { ChunkCoord } from '../game/types';
import type { VoxelWorld } from '../game/voxel/VoxelWorld';
import { createGrassMaterial, createToonGradient } from './materials';
import { merge, paint, place } from './style/cuteFigure';

/** 그리는 반경(칸). 가장자리 GRASS_FADE 칸은 작아지며 사라진다. */
export const GRASS_RADIUS = 30;
const GRASS_FADE = 6;
/** 카메라가 이만큼 움직이면 인스턴스를 다시 놓는다(칸). */
const REBUILD_MOVE = 3;
/** 인스턴스 상한. 반경 30 칸 원(약 2800 칸) × 평균 1.55 포기를 넉넉히 넘는다. */
const MAX_TUFTS = 8000;
const CHUNK = 16;

/** 칸 좌표 해시(0~1). 같은 칸은 늘 같은 값이다. */
export function cellHash(x: number, z: number, salt: number): number {
  let h = (x * 374761393 + z * 668265263 + salt * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** 한 칸의 포기 수(0~3). 15 % 없음, 35 % 하나, 30 % 둘, 20 % 셋. */
export function tuftCount(x: number, z: number): number {
  const r = cellHash(x, z, 1);
  return r < 0.15 ? 0 : r < 0.5 ? 1 : r < 0.8 ? 2 : 3;
}

/** 블록 조회. */
export interface GrassWorld {
  getBlock(x: number, y: number, z: number): number;
}

/** 청크 하나의 풀 윗면 칸(바로 위가 air 인 grass). [x, y, z] 를 이어 붙인 배열이다. y 는 윗면 높이. */
export function grassCellsInChunk(
  world: GrassWorld,
  coord: ChunkCoord,
  blocks: Uint16Array,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i] !== BlockId.grass) continue;
    const x = coord.cx * CHUNK + (i & 15);
    const z = coord.cz * CHUNK + ((i >> 4) & 15);
    const y = coord.cy * CHUNK + (i >> 8);
    if (world.getBlock(x, y + 1, z) !== BlockId.air) continue;
    out.push(x, y + 1, z);
  }
  return out;
}

/** 포기 하나의 잎 수. */
const BLADES = 7;

/** 포기 하나: 가운데서 벌어지는 짧고 넓은 잎 일곱, 밑동은 짙고 끝은 밝다. 높이 약 0.15~0.2 칸. */
function tuftGeometry(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < BLADES; i++) {
    const h = 0.13 + (i % 3) * 0.04;
    const g = new THREE.BufferGeometry();
    // 두 마디 잎(삼각형 셋): 밑동 폭 0.07, 끝은 한 점
    const w = 0.055;
    const lean = 0.07;
    const pos = [
      -w,
      0,
      0,
      w,
      0,
      0,
      -w * 0.6,
      h * 0.55,
      lean * 0.4,
      w * 0.6,
      h * 0.55,
      lean * 0.4,
      0,
      h,
      lean,
    ];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 4]);
    // 법선을 위로 두어 풀잎이 땅과 같은 빛을 받게 한다(얇은 잎이 옆면처럼 어둡게 보이지 않게)
    g.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(
        new Array(15).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)),
        3,
      ),
    );
    const base = new THREE.Color(0x5aa83e);
    const tip = new THREE.Color(0xa6dc6c);
    const col: number[] = [];
    for (let v = 0; v < 5; v++) {
      const t = (pos[v * 3 + 1] ?? 0) / h;
      const c = base.clone().lerp(tip, t);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    blades.push(place(g, [0, 0, 0], [1, 1, 1], [0, (i / BLADES) * Math.PI * 2 + 0.3, 0]));
  }
  return merge(blades);
}

/** 청크 캐시 한 칸. */
interface ChunkCells {
  readonly revision: string;
  readonly cells: number[];
}

/** 카메라 주변 풀밭의 풀잎 포기. */
export class GrassView {
  readonly mesh: THREE.InstancedMesh;
  private readonly cache = new Map<string, ChunkCells>();
  private readonly columns = new Map<string, ChunkCoord[]>();
  private center: THREE.Vector3 | null = null;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  /** 마지막으로 놓은 포기 수(계측) */
  count = 0;
  /** 청크를 다시 모은 횟수(계측·시험) */
  scans = 0;

  /** 월드와 바람 시간 uniform 을 받는다. */
  constructor(
    private readonly world: VoxelWorld,
    time: THREE.IUniform<number>,
  ) {
    this.mesh = new THREE.InstancedMesh(
      paintless(tuftGeometry()),
      createGrassMaterial(createToonGradient(3), time),
      MAX_TUFTS,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    for (const c of world.allChunkCoords()) {
      const key = `${c.cx},${c.cz}`;
      const list = this.columns.get(key) ?? [];
      list.push(c);
      this.columns.set(key, list);
    }
  }

  /** 매 프레임 부른다. 카메라가 충분히 움직였거나 가까운 청크가 바뀌었을 때만 다시 놓는다. */
  update(camera: THREE.Vector3): void {
    const moved = !this.center || this.center.distanceTo(camera) > REBUILD_MOVE;
    const changed = this.refreshNear(camera);
    if (!moved && !changed) return;
    this.center = camera.clone();
    this.place(camera);
  }

  /** 반경 안 청크의 캐시를 리비전으로 확인해 바뀐 것만 다시 모은다. 하나라도 바뀌면 true. */
  private refreshNear(camera: THREE.Vector3): boolean {
    let changed = false;
    for (const coord of this.nearChunks(camera)) {
      const key = `${coord.cx},${coord.cy},${coord.cz}`;
      const above = { cx: coord.cx, cy: coord.cy + 1, cz: coord.cz };
      const revision = `${this.world.getRevision(coord)}:${this.world.getChunk(above.cx, above.cy, above.cz) ? this.world.getRevision(above) : -1}`;
      if (this.cache.get(key)?.revision === revision) continue;
      const chunk = this.world.getChunk(coord.cx, coord.cy, coord.cz);
      const cells = chunk ? grassCellsInChunk(this.world, coord, chunk.blocks) : [];
      this.cache.set(key, { revision, cells });
      this.scans += 1;
      changed = true;
    }
    return changed;
  }

  /** 카메라 반경에 걸친 청크. */
  private nearChunks(camera: THREE.Vector3): ChunkCoord[] {
    const out: ChunkCoord[] = [];
    const r = GRASS_RADIUS;
    const x0 = Math.floor((camera.x - r) / CHUNK);
    const x1 = Math.floor((camera.x + r) / CHUNK);
    const z0 = Math.floor((camera.z - r) / CHUNK);
    const z1 = Math.floor((camera.z + r) / CHUNK);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) out.push(...(this.columns.get(`${cx},${cz}`) ?? []));
    return out;
  }

  /** 반경 안 칸마다 해시로 정한 수·위치·크기·방향으로 포기를 놓는다. 가장자리는 작아진다. */
  private place(camera: THREE.Vector3): void {
    let n = 0;
    const r = GRASS_RADIUS;
    for (const coord of this.nearChunks(camera)) {
      const cells = this.cache.get(`${coord.cx},${coord.cy},${coord.cz}`)?.cells ?? [];
      for (let i = 0; i < cells.length && n < MAX_TUFTS; i += 3) {
        const x = cells[i] ?? 0;
        const y = cells[i + 1] ?? 0;
        const z = cells[i + 2] ?? 0;
        const d = Math.hypot(x + 0.5 - camera.x, z + 0.5 - camera.z);
        if (d > r) continue;
        const fade = Math.min(1, (r - d) / GRASS_FADE);
        const count = tuftCount(x, z);
        for (let k = 0; k < count && n < MAX_TUFTS; k++) {
          const px = x + 0.15 + cellHash(x, z, 10 + k) * 0.7;
          const pz = z + 0.15 + cellHash(x, z, 20 + k) * 0.7;
          const s = (0.75 + cellHash(x, z, 30 + k) * 0.55) * fade;
          this.q.setFromAxisAngle(this.up, cellHash(x, z, 40 + k) * Math.PI * 2);
          this.m.compose(new THREE.Vector3(px, y, pz), this.q, new THREE.Vector3(s, s, s));
          this.mesh.setMatrixAt(n++, this.m);
        }
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.count = n;
  }
}

/** 이미 정점 색이 있는 지오메트리를 그대로 돌려준다(paint 로 덮지 않는다는 표시). */
function paintless(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return g.getAttribute('color') ? g : paint(g, 0x6fbf4a);
}
