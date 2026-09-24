// 3 인칭 카메라 (MVP_SPEC 9.3, TASK-011). 게임 상태는 읽기만 한다.
// 카메라는 어깨점(aim.ts)에서 시선 반대 방향으로 cameraBoomDistance 만큼 뒤에 있고 시선 방향을 본다.
// 그래서 화면 중앙 조준점과 조준 레이캐스트가 같은 직선이다. 거리 계산은 게임 쪽 순수 함수다.
import type * as THREE from 'three';
import { balance } from '../game/data/balance';
import type { Player } from '../game/entities/Player';
import { aimRay, cameraBoomDistance, ceilingCutFor, type CeilingCut } from '../game/systems/aim';
import type { CollisionWorld } from '../game/voxel/collision';
import type { VoxelLightingUniforms } from './materials';

/**
 * 카메라가 이보다 가까우면 캐릭터 모형을 숨긴다. 좁은 방에서 카메라가 벽에 밀려 모형이 화면을 가리지 않게 한다
 * (TASK-033 G2 "카메라가 벽에 가림", ADR 026).
 */
export const HIDE_PLAYER_BELOW = 1.6;

/** 플레이어를 따라가는 카메라. */
export class CameraController {
  /** 마지막 update 에서 정한 카메라 거리. 벽에 막히면 cameraDistance 보다 작다. */
  distance: number = balance.player.cameraDistance;
  /** 마지막 update 의 천장 걷어 내기 범위. 지붕 밑이 아니면 null (MVP_SPEC 9.3) */
  ceilingCut: CeilingCut | null = null;
  /** 남은 흔들림(초). 종 연출이 켠다 (TASK-036) */
  private shakeLeft = 0;
  private shakeTime = 0;

  /** 제어할 카메라, 충돌을 읽을 월드, 따라갈 플레이어를 받는다. */
  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly world: CollisionWorld,
    private readonly player: Player,
    private readonly lighting: VoxelLightingUniforms | null = null,
  ) {}

  /** 짧게 흔든다(렌더 표현). 게임 상태·조준에는 영향이 없다. */
  shake(seconds: number): void {
    this.shakeLeft = Math.max(this.shakeLeft, seconds);
  }

  /** 카메라 위치와 방향을 갱신한다. 게임 update 뒤, 렌더 전에 부른다. dt 는 흔들림 진행에만 쓴다. */
  update(dt = 0): void {
    const { origin: o, direction: d } = aimRay(this.world, this.player);
    // 지붕 밑이면 천장을 걷어 낸다: 셰이더가 그리지 않고 카메라 충돌에서도 뺀다 (MVP_SPEC 9.3)
    const cut = ceilingCutFor(this.world, this.player);
    this.ceilingCut = cut;
    if (this.lighting) {
      this.lighting.cutParams.value.set(cut ? 1 : 0, cut?.y ?? 0, cut?.radius ?? 0);
      if (cut) this.lighting.cutCenter.value.set(cut.x, cut.z);
    }
    this.distance = cameraBoomDistance(this.world, this.player, cut);
    this.camera.position.set(
      o.x - d.x * this.distance,
      o.y - d.y * this.distance,
      o.z - d.z * this.distance,
    );
    this.camera.lookAt(o.x + d.x, o.y + d.y, o.z + d.z);
    if (this.shakeLeft > 0) {
      // 잦아드는 작은 흔들림. 조준 광선(게임 쪽)은 그대로이고 화면만 흔들린다
      this.shakeLeft = Math.max(0, this.shakeLeft - dt);
      this.shakeTime += dt;
      const a = 0.06 * Math.min(1, this.shakeLeft / 0.4);
      this.camera.position.x += Math.sin(this.shakeTime * 47) * a;
      this.camera.position.y += Math.sin(this.shakeTime * 61 + 1) * a;
    }
  }
}
