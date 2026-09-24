// 식탁 위 음식 연출 (MVP_SPEC 17, ADR 032). 게임 상태는 읽기만 하며 블록이 아니다.
// 식당 의자에 앉아 먹는 주민마다 그 앞 식탁 윗면에 그릇과 음식을 놓는다. 먹는 동안만 보인다.
// 부위별 InstancedMesh 라 먹는 주민 수와 드로우콜이 무관하다.
import * as THREE from 'three';
import type { NPC } from '../game/entities/NPC';
import type { ActionView } from '../game/types';
import { createPropMaterial } from './materials';

/** 인스턴스 상한. 주민 100 명을 넉넉히 넘는다. */
const MAX_DISHES = 256;
/** 그릇을 식탁 가운데에서 의자 쪽으로 옮기는 거리. */
const TOWARD_SEAT = 0.26;

/** 식탁 위 그릇과 음식. */
export class DishView {
  readonly object3d = new THREE.Group();
  private readonly bowls: THREE.InstancedMesh;
  private readonly meals: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();

  /** 주민 목록 조회를 받는다. */
  constructor(private readonly npcs: () => Iterable<NPC<ActionView>>) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.bowls = new THREE.InstancedMesh(box, createPropMaterial(0xf2ece0), MAX_DISHES);
    this.meals = new THREE.InstancedMesh(box, createPropMaterial(0xd9893b), MAX_DISHES);
    for (const mesh of [this.bowls, this.meals]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.object3d.add(mesh);
    }
  }

  /** 매 프레임 부른다. 식당 의자에서 먹는 주민 앞에 그릇을 놓는다. */
  update(): void {
    let n = 0;
    for (const npc of this.npcs()) {
      if (n >= MAX_DISHES) break;
      const a = npc.action;
      const seat = a.facilityUse;
      const table = a.lookAt;
      if (a.kind !== 'eat' || !seat || !table) continue;
      const dx = seat.usePosition.x - table.x;
      const dz = seat.usePosition.z - table.z;
      const len = Math.hypot(dx, dz) || 1;
      const x = table.x + (dx / len) * TOWARD_SEAT;
      const z = table.z + (dz / len) * TOWARD_SEAT;
      this.place(this.bowls, n, x, table.y + 0.05, z, 0.3, 0.1, 0.3);
      this.place(this.meals, n, x, table.y + 0.11, z, 0.2, 0.05, 0.2);
      n += 1;
    }
    for (const mesh of [this.bowls, this.meals]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** 인스턴스 하나를 놓는다. */
  private place(
    mesh: THREE.InstancedMesh,
    i: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ): void {
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(sx, sy, sz));
    mesh.setMatrixAt(i, this.m);
  }
}
