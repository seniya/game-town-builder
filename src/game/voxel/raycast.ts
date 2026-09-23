// 복셀 DDA 레이캐스트 (MVP_SPEC 10.1, ARCHITECTURE 8.1). Amanatides & Woo (1987).
// 광선이 지나는 칸을 한 축씩 차례로 방문하므로 대각선에서도 칸을 건너뛰지 않는다. 월드는 읽기만 한다.
import { BlockId, isSolid } from '../data/blocks';
import type { BlockPos, Vec3 } from '../types';
import type { VoxelWorld } from './VoxelWorld';

/** 레이캐스트 결과. face 는 광선이 들어온 면의 단위 법선이다. */
export interface RaycastHit {
  readonly pos: BlockPos;
  /** -1 / 0 / 1. 시작 칸이 대상이면 (0, 0, 0) 이다 */
  readonly face: BlockPos;
  /** 원점에서 칸 경계까지의 거리 */
  readonly distance: number;
}

/** 레이캐스트가 읽는 월드 조회. */
export type RaycastWorld = Pick<VoxelWorld, 'getBlock'>;

/** 블록 파괴·설치의 조준 대상: air 가 아닌 모든 블록 (ARCHITECTURE 8.1). */
export function isAimTarget(id: number): boolean {
  return id !== BlockId.air;
}

/** 카메라를 막는 블록: 충돌 고체(window 포함)와 door (MVP_SPEC 9.3, TASK-011). */
export function isCameraBlocking(id: number): boolean {
  return isSolid(id) || id === BlockId.door;
}

/**
 * origin 에서 direction(정규화) 으로 maxDistance 까지 광선을 보내 isTarget 인 첫 칸을 찾는다.
 * 경계가 정확히 모서리를 지나면 x → y → z 순서로 한 축씩 넘어간다.
 */
export function raycastVoxels(
  world: RaycastWorld,
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  isTarget: (id: number) => boolean,
): RaycastHit | null {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);
  if (isTarget(world.getBlock(x, y, z))) {
    return { pos: { x, y, z }, face: { x: 0, y: 0, z: 0 }, distance: 0 };
  }
  const stepX = Math.sign(direction.x);
  const stepY = Math.sign(direction.y);
  const stepZ = Math.sign(direction.z);
  const tDeltaX = stepX === 0 ? Infinity : 1 / Math.abs(direction.x);
  const tDeltaY = stepY === 0 ? Infinity : 1 / Math.abs(direction.y);
  const tDeltaZ = stepZ === 0 ? Infinity : 1 / Math.abs(direction.z);
  let tMaxX = boundaryDistance(origin.x, x, stepX, tDeltaX);
  let tMaxY = boundaryDistance(origin.y, y, stepY, tDeltaY);
  let tMaxZ = boundaryDistance(origin.z, z, stepZ, tDeltaZ);

  for (;;) {
    let t: number;
    let face: BlockPos;
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      t = tMaxX;
      x += stepX;
      tMaxX += tDeltaX;
      face = { x: -stepX, y: 0, z: 0 };
    } else if (tMaxY <= tMaxZ) {
      t = tMaxY;
      y += stepY;
      tMaxY += tDeltaY;
      face = { x: 0, y: -stepY, z: 0 };
    } else {
      t = tMaxZ;
      z += stepZ;
      tMaxZ += tDeltaZ;
      face = { x: 0, y: 0, z: -stepZ };
    }
    if (!(t <= maxDistance)) return null;
    if (isTarget(world.getBlock(x, y, z))) return { pos: { x, y, z }, face, distance: t };
  }
}

/** 한 축에서 원점부터 첫 칸 경계까지의 광선 거리. 움직이지 않는 축은 Infinity. */
function boundaryDistance(o: number, cell: number, step: number, tDelta: number): number {
  if (step === 0) return Infinity;
  const toBoundary = step > 0 ? cell + 1 - o : o - cell;
  return toBoundary * tDelta;
}
