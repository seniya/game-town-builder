// 엔티티 표시 (ARCHITECTURE 12.2). Entity 를 읽어서 그리고 고치지 않는다.
// 지금은 플레이어의 임시 모형만 있다. 주민·몬스터 View 는 TASK-028 / 045 에서 더한다.
import * as THREE from 'three';
import type { Player } from '../game/entities/Player';
import { createCharacterMaterial } from './materials';

/** 상자 하나를 만든다. 위치는 발밑 기준 로컬 좌표다. */
function box(w: number, h: number, d: number, y: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.y = y + h / 2;
  return mesh;
}

/** 플레이어 임시 모형: 다리·몸통·머리 상자. 높이 1.8, 폭 0.6 안에 들어간다. */
export class PlayerView {
  readonly object3d = new THREE.Group();

  /** 모형을 만든다. */
  constructor() {
    const cloth = createCharacterMaterial(0x4f7cac);
    const trousers = createCharacterMaterial(0x6b5a45);
    const skin = createCharacterMaterial(0xf0c8a0);
    const hair = createCharacterMaterial(0x5a3b24);
    this.object3d.add(
      box(0.44, 0.7, 0.26, 0, trousers),
      box(0.52, 0.62, 0.3, 0.7, cloth),
      box(0.42, 0.42, 0.42, 1.34, skin),
      box(0.44, 0.1, 0.44, 1.7, hair),
    );
  }

  /** 위치·방향을 엔티티에서 읽는다. visible 이 false 면 숨긴다(카메라가 너무 가까울 때). */
  syncFrom(player: Player, visible: boolean): void {
    const p = player.body.pos;
    this.object3d.position.set(p.x, p.y, p.z);
    this.object3d.rotation.y = player.yaw;
    this.object3d.visible = visible;
  }
}
