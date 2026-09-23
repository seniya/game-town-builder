// 천장 걷어 내기의 단면 뚜껑 (MVP_SPEC 9.3, ADR 026). 게임 상태는 읽기만 한다.
// 지붕 바로 밑의 벽 윗면은 청크 메시에서 지붕에 가려 만들어지지 않는다. 지붕을 걷어 내면 벽 속이 비어 보이므로,
// 걷어 낸 칸 바로 밑이 불투명 블록이면 그 윗면 높이에 단면 판을 그린다. 블록은 바꾸지 않는다.
import * as THREE from 'three';
import { BlockId, isOpaque } from '../game/data/blocks';
import { isCut, type CeilingCut } from '../game/systems/aim';
import type { VoxelWorld } from '../game/voxel/VoxelWorld';
import { createCeilingCapMaterial } from './materials';

/** 다시 모으는 간격(초). */
const REFRESH_SECONDS = 0.2;
/** 인스턴스 상한(반경 7 원 안의 칸 수보다 넉넉하게). */
const MAX_CAPS = 1024;

/** 단면 색. 밑 블록의 윗면과 비슷한 밝기로 둔다(Lambert 조명이 복셀 셰이더보다 어둡게 나온다). */
function capColor(id: number): number {
  if (id === BlockId.plank) return 0xc9a06a;
  if (id === BlockId.stone_brick || id === BlockId.stone) return 0xa4a8ae;
  if (id === BlockId.dirt || id === BlockId.grass) return 0x9a7650;
  return 0x9a8a76;
}

/** 걷어 낸 천장 밑 벽·기둥 윗면의 단면을 그린다. */
export class CeilingCapView {
  readonly object3d: THREE.InstancedMesh;
  private since = REFRESH_SECONDS;
  private last = '';
  private readonly m = new THREE.Matrix4();
  private readonly color = new THREE.Color();

  /** 월드를 받는다. */
  constructor(private readonly world: VoxelWorld) {
    this.object3d = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      createCeilingCapMaterial(),
      MAX_CAPS,
    );
    this.object3d.count = 0;
    this.object3d.frustumCulled = false;
  }

  /** 매 프레임 부른다. 범위가 없으면 숨긴다. 범위가 바뀌었거나 간격이 지나면 다시 모은다. */
  update(dt: number, cut: CeilingCut | null): void {
    this.object3d.visible = cut !== null;
    if (!cut) {
      this.last = '';
      return;
    }
    this.since += dt;
    const key = `${cut.y}:${Math.floor(cut.x)}:${Math.floor(cut.z)}`;
    if (key === this.last && this.since < REFRESH_SECONDS) return;
    this.last = key;
    this.since = 0;
    let n = 0;
    const r = Math.ceil(cut.radius);
    const cx = Math.floor(cut.x);
    const cz = Math.floor(cut.z);
    for (let x = cx - r; x <= cx + r && n < MAX_CAPS; x++) {
      for (let z = cz - r; z <= cz + r && n < MAX_CAPS; z++) {
        if (!isCut(cut, x, cut.y, z)) continue;
        const above = this.world.getBlock(x, cut.y, z);
        const below = this.world.getBlock(x, cut.y - 1, z);
        if (above === BlockId.air || !isOpaque(below)) continue;
        this.m.makeScale(1, 0.02, 1).setPosition(x + 0.5, cut.y + 0.01, z + 0.5);
        this.object3d.setMatrixAt(n, this.m);
        this.object3d.setColorAt(n, this.color.setHex(capColor(below)));
        n += 1;
      }
    }
    this.object3d.count = n;
    this.object3d.instanceMatrix.needsUpdate = true;
    if (this.object3d.instanceColor) this.object3d.instanceColor.needsUpdate = true;
  }
}
