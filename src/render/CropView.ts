// 작물 렌더 모형 (MVP_SPEC 15.2 / 15.4, ADR 030). 게임 상태는 읽기만 한다.
// crop 블록은 청크 메시에서 빠지고(blocks.prop) 여기서 FarmSystem 의 표시 단계대로 그린다.
// 한 칸에 포기 넷. 단계 0 새싹 / 1 중간 / 2 큰 포기 / 성숙은 이삭이 달린다. 부위별 InstancedMesh 라 작물 수와 드로우콜이 무관하다.
import * as THREE from 'three';
import type { CropView as CropState } from '../game/systems/FarmSystem';
import { createPropMaterial } from './materials';

/** 다시 모으는 간격(초). 단계는 게임 시간 4 시간(100 실초)마다 바뀌므로 자주 볼 필요가 없다. */
const REFRESH_SECONDS = 0.5;
/** 인스턴스 상한(작물 칸 수 × 포기 4). MVP 밭 8 칸을 넉넉히 넘는다. */
const MAX_CROPS = 512;
/** 한 칸 안 포기 위치(칸 가운데 기준). */
const TUFTS: readonly (readonly [number, number])[] = [
  [-0.22, -0.2],
  [0.2, -0.22],
  [-0.2, 0.22],
  [0.22, 0.19],
];
/** 단계별 줄기 높이·잎 크기. */
const STAGE = [
  { stem: 0.1, leaf: 0.12 },
  { stem: 0.32, leaf: 0.2 },
  { stem: 0.55, leaf: 0.26 },
] as const;

/** 작물 모형 모음. */
export class CropView {
  readonly object3d = new THREE.Group();
  private readonly stems: THREE.InstancedMesh;
  private readonly leaves: THREE.InstancedMesh;
  private readonly heads: THREE.InstancedMesh;
  private since = REFRESH_SECONDS;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();

  /** 작물 목록 조회를 받는다. */
  constructor(private readonly crops: () => readonly CropState[]) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.stems = new THREE.InstancedMesh(box, createPropMaterial(0x5f9a3a), MAX_CROPS * 4);
    this.leaves = new THREE.InstancedMesh(box, createPropMaterial(0x7cc04a), MAX_CROPS * 8);
    this.heads = new THREE.InstancedMesh(box, createPropMaterial(0xe7c24f), MAX_CROPS * 4);
    for (const mesh of [this.stems, this.leaves, this.heads]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      this.object3d.add(mesh);
    }
  }

  /** 매 프레임 부른다. 간격마다 인스턴스를 다시 놓는다. */
  update(dt: number): void {
    this.since += dt;
    if (this.since < REFRESH_SECONDS) return;
    this.since = 0;
    let s = 0;
    let l = 0;
    let h = 0;
    for (const c of this.crops().slice(0, MAX_CROPS)) {
      const g = STAGE[Math.min(c.stage, STAGE.length - 1)] ?? STAGE[0];
      TUFTS.forEach(([dx, dz], i) => {
        const x = c.pos.x + 0.5 + dx;
        const z = c.pos.z + 0.5 + dz;
        const y = c.pos.y;
        const lean = (i % 2 === 0 ? 1 : -1) * 0.08;
        this.place(this.stems, s++, x, y + g.stem / 2, z, 0.05, g.stem, 0.05, lean, i * 0.7);
        // 잎 두 장: 줄기 중간에서 비스듬히 벌어진다
        for (const side of [-1, 1]) {
          const ly = y + g.stem * 0.55;
          this.place(
            this.leaves,
            l++,
            x + side * g.leaf * 0.35,
            ly,
            z,
            g.leaf,
            0.04,
            g.leaf * 0.45,
            0,
            i * 0.7 + side * 0.4,
          );
        }
        if (c.mature) {
          this.place(this.heads, h++, x, y + g.stem + 0.07, z, 0.11, 0.16, 0.11, lean, i * 0.7);
        }
      });
    }
    this.finish(this.stems, s);
    this.finish(this.leaves, l);
    this.finish(this.heads, h);
  }

  /** 인스턴스 하나를 놓는다(크기·기울기·회전). */
  private place(
    mesh: THREE.InstancedMesh,
    i: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    tilt: number,
    yaw: number,
  ): void {
    this.q.setFromEuler(this.e.set(tilt, yaw, 0));
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(sx, sy, sz));
    mesh.setMatrixAt(i, this.m);
  }

  /** 개수를 확정하고 GPU 갱신을 요청한다. */
  private finish(mesh: THREE.InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }
}
