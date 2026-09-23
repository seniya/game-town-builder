// 조준 광선 (MVP_SPEC 9.3 / 10.1). 카메라(render)와 BlockEditSystem 이 같은 함수를 써서
// 화면 중앙 조준점과 실제 대상이 같은 직선 위에 있게 한다.
import { balance } from '../data/balance';
import { eyePosition, lookDirection, rightDirection, type Player } from '../entities/Player';
import type { Vec3 } from '../types';
import { isCollisionSolid, type CollisionWorld } from '../voxel/collision';
import { isAimTarget, isCameraBlocking, raycastVoxels, type RaycastHit } from '../voxel/raycast';

/**
 * 어깨점: 시선 원점에서 카메라 기준 오른쪽으로 shoulderOffset (MVP_SPEC 9.3).
 * 어깨점이 고체 칸 안이면(벽에 오른쪽으로 붙은 경우) 시선 원점을 그대로 쓴다.
 */
export function shoulderPoint(world: CollisionWorld, player: Player): Vec3 {
  const eye = eyePosition(player);
  const r = rightDirection(player);
  const s = balance.player.shoulderOffset;
  const p = { x: eye.x + r.x * s, y: eye.y, z: eye.z + r.z * s };
  if (isCollisionSolid(world, Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) return eye;
  return p;
}

/** 조준 광선의 원점과 방향. */
export interface AimRay {
  readonly origin: Vec3;
  readonly direction: Vec3;
}

/** 플레이어의 현재 조준 광선. */
export function aimRay(world: CollisionWorld, player: Player): AimRay {
  return { origin: shoulderPoint(world, player), direction: lookDirection(player) };
}

/** 조준 대상 블록. reachDistance(5.0) 보다 먼 블록은 선택하지 않는다 (MVP_SPEC 10.1). */
export function findAimTarget(world: CollisionWorld, player: Player): RaycastHit | null {
  const ray = aimRay(world, player);
  return raycastVoxels(world, ray.origin, ray.direction, balance.player.reachDistance, isAimTarget);
}

/** 벽 앞에 남기는 여유. 카메라 near 평면(0.1)이 벽을 파고들지 않게 한다. */
export const CAMERA_WALL_MARGIN = 0.25;

/**
 * 3 인칭 카메라 거리 (MVP_SPEC 9.3, TASK-011). 어깨점에서 시선 반대 방향으로 cameraDistance 까지
 * 광선을 보내 카메라를 막는 블록(window·door 포함)에 닿으면 그 앞에서 멈춘다.
 * 카메라 위치 = origin − direction × distance.
 */
export function cameraBoomDistance(
  world: CollisionWorld,
  player: Player,
  cut: CeilingCut | null = null,
): number {
  const ray = aimRay(world, player);
  const d = ray.direction;
  const back = { x: -d.x, y: -d.y, z: -d.z };
  const max = balance.player.cameraDistance;
  const read = cut
    ? {
        getBlock: (x: number, y: number, z: number) =>
          isCut(cut, x, y, z) ? 0 : world.getBlock(x, y, z),
      }
    : world;
  const hit = raycastVoxels(read, ray.origin, back, max, isCameraBlocking);
  return hit ? Math.max(0, hit.distance - CAMERA_WALL_MARGIN) : max;
}

/** 천장 걷어 내기의 범위 (MVP_SPEC 9.3). y 이상이고 (x, z) 에서 수평 radius 안인 칸을 그리지 않는다. */
export interface CeilingCut {
  readonly y: number;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/**
 * 플레이어 머리 위(발 칸 +2 ~ +1+ceilingSearchHeight)에 카메라를 막는 블록이 있으면 그 가장 낮은 y 로 천장 범위를 만든다.
 * 없으면 null(지붕 밑이 아니다). 블록·충돌은 바꾸지 않는 표현 전용 범위다.
 */
export function ceilingCutFor(world: CollisionWorld, player: Player): CeilingCut | null {
  const p = player.body.pos;
  const x = Math.floor(p.x);
  const z = Math.floor(p.z);
  const feet = Math.floor(p.y + 0.01);
  for (let y = feet + 2; y <= feet + 1 + balance.player.ceilingSearchHeight; y++) {
    if (isCameraBlocking(world.getBlock(x, y, z))) {
      return { y, x: p.x, z: p.z, radius: balance.player.ceilingCutRadius };
    }
  }
  return null;
}

/** 칸이 천장 범위 안인가. */
export function isCut(cut: CeilingCut, x: number, y: number, z: number): boolean {
  return y >= cut.y && Math.hypot(x + 0.5 - cut.x, z + 0.5 - cut.z) <= cut.radius;
}
