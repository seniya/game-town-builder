// 미수리 피해 표시 (MVP_SPEC 25.4, TASK-049). 부서진 칸을 붉은 반투명 상자로 보인다. 수리되면 사라진다.
// 게임 상태는 읽기만 한다. InstancedMesh 하나라 피해 수와 드로우콜이 무관하다.
import * as THREE from 'three';
import type { BlockPos } from '../game/types';
import { createDamageMarkMaterial } from './materials';

/** 인스턴스 상한(습격 두 번 × 16 칸을 넉넉히 넘는다). */
const MAX_MARKS = 256;

/** 붉은 피해 표시. */
export class DamageMarkView {
  readonly object3d: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private time = 0;

  /** 미수리 칸 조회를 받는다. */
  constructor(private readonly cells: () => Iterable<BlockPos>) {
    this.object3d = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.02, 1.02, 1.02),
      createDamageMarkMaterial(),
      MAX_MARKS,
    );
    this.object3d.count = 0;
    this.object3d.frustumCulled = false;
  }

  /** 매 프레임 부른다. 천천히 숨쉬듯 밝기가 바뀐다. */
  update(dt: number): void {
    this.time += dt;
    let n = 0;
    for (const c of this.cells()) {
      if (n >= MAX_MARKS) break;
      this.m.makeTranslation(c.x + 0.5, c.y + 0.5, c.z + 0.5);
      this.object3d.setMatrixAt(n++, this.m);
    }
    this.object3d.count = n;
    this.object3d.instanceMatrix.needsUpdate = true;
    const mat = this.object3d.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.28 + Math.sin(this.time * 2.2) * 0.08;
  }
}
