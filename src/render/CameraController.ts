// 3 인칭 카메라 (MVP_SPEC 9.3, TASK-011). 게임 상태는 읽기만 한다.
// 카메라는 어깨점(aim.ts)에서 시선 반대 방향으로 cameraBoomDistance 만큼 뒤에 있고 시선 방향을 본다.
// 그래서 화면 중앙 조준점과 조준 레이캐스트가 같은 직선이다. 거리 계산은 게임 쪽 순수 함수다.
import type * as THREE from 'three';
import { balance } from '../game/data/balance';
import type { Player } from '../game/entities/Player';
import { aimRay, cameraBoomDistance } from '../game/systems/aim';
import type { CollisionWorld } from '../game/voxel/collision';

/** 카메라가 이보다 가까우면 캐릭터 모형을 숨긴다. */
export const HIDE_PLAYER_BELOW = 0.9;

/** 플레이어를 따라가는 카메라. */
export class CameraController {
  /** 마지막 update 에서 정한 카메라 거리. 벽에 막히면 cameraDistance 보다 작다. */
  distance: number = balance.player.cameraDistance;

  /** 제어할 카메라, 충돌을 읽을 월드, 따라갈 플레이어를 받는다. */
  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly world: CollisionWorld,
    private readonly player: Player,
  ) {}

  /** 카메라 위치와 방향을 갱신한다. 게임 update 뒤, 렌더 전에 부른다. */
  update(): void {
    const { origin: o, direction: d } = aimRay(this.world, this.player);
    this.distance = cameraBoomDistance(this.world, this.player);
    this.camera.position.set(
      o.x - d.x * this.distance,
      o.y - d.y * this.distance,
      o.z - d.z * this.distance,
    );
    this.camera.lookAt(o.x + d.x, o.y + d.y, o.z + d.z);
  }
}
