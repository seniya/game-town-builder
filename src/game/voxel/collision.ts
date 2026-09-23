// 복셀 AABB 충돌 (MVP_SPEC 9.4 / 9.5, ARCHITECTURE 8.2). 물리 엔진을 쓰지 않는다.
// 축 분리 스윕: x → z → y 순서로 움직이고 겹치는 고체 칸에서 밀어낸다. 월드는 읽기만 한다.
import { isSolid } from '../data/blocks';
import type { AabbBody, Vec3 } from '../types';
import type { VoxelWorld } from './VoxelWorld';

export type { AabbBody };

/** 충돌 판정에 필요한 월드 조회. 테스트는 가짜 구현을 넣는다. */
export type CollisionWorld = Pick<VoxelWorld, 'getBlock' | 'sizeX' | 'sizeY' | 'sizeZ'>;

/** 한 substep 에서 움직일 수 있는 최대 거리 (ARCHITECTURE 3.1). */
export const MAX_SUBSTEP_DISTANCE = 0.4;

/** 면에 붙일 때 남기는 틈. 부동소수 오차로 다음 판정에서 같은 칸과 겹치지 않게 한다. */
const SKIN = 1e-5;
/** 칸 범위 상한을 계산할 때 빼는 값. 정확히 면에 닿은 경우를 겹침으로 세지 않는다. */
const EDGE = 1e-7;

/**
 * 칸 (x, y, z) 가 충돌에서 고체인가 (MVP_SPEC 9.5).
 * 수평 범위 밖과 y < 0 은 고체, y ≥ sizeY 는 air 다. 안쪽은 블록 정의의 solid 를 따른다.
 */
export function isCollisionSolid(world: CollisionWorld, x: number, y: number, z: number): boolean {
  if (x < 0 || z < 0 || x >= world.sizeX || z >= world.sizeZ) return true;
  if (y < 0) return true;
  if (y >= world.sizeY) return false;
  return isSolid(world.getBlock(x, y, z));
}

/** 발밑 중심 feet 에 놓인 width × height AABB 가 고체 칸과 겹치지 않는가. */
export function isAabbFree(
  world: CollisionWorld,
  feet: Vec3,
  width: number,
  height: number,
): boolean {
  return findOverlap(world, feet, width, height) === null;
}

/** 겹치는 고체 칸들의 경계. 없으면 null. */
interface Overlap {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** AABB 와 겹치는 고체 칸을 모두 찾아 그 칸들의 정수 경계를 돌려준다. */
function findOverlap(
  world: CollisionWorld,
  feet: Vec3,
  width: number,
  height: number,
): Overlap | null {
  const half = width / 2;
  const x0 = Math.floor(feet.x - half);
  const x1 = Math.floor(feet.x + half - EDGE);
  const y0 = Math.floor(feet.y);
  const y1 = Math.floor(feet.y + height - EDGE);
  const z0 = Math.floor(feet.z - half);
  const z1 = Math.floor(feet.z + half - EDGE);
  let hit: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  } | null = null;
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (!isCollisionSolid(world, x, y, z)) continue;
        if (!hit) hit = { minX: x, maxX: x, minY: y, maxY: y, minZ: z, maxZ: z };
        else {
          hit.minX = Math.min(hit.minX, x);
          hit.maxX = Math.max(hit.maxX, x);
          hit.minY = Math.min(hit.minY, y);
          hit.maxY = Math.max(hit.maxY, y);
          hit.minZ = Math.min(hit.minZ, z);
          hit.maxZ = Math.max(hit.maxZ, z);
        }
      }
    }
  }
  return hit;
}

/**
 * 몸체를 velocity × dt 만큼 움직인다 (ARCHITECTURE 8.2).
 * 이동 거리가 0.4 를 넘으면 나눠서 푼다. 막힌 축의 속도는 0 이 된다.
 * stepUpHeight 이하의 턱은 지면에 서 있을 때 자동으로 오른다 (MVP_SPEC 9.4).
 */
export function moveWithCollision(
  world: CollisionWorld,
  body: AabbBody,
  dt: number,
  stepUpHeight: number,
): void {
  if (!(dt > 0)) return;
  const v = body.velocity;
  const distance = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt;
  const steps = Math.max(1, Math.ceil(distance / MAX_SUBSTEP_DISTANCE));
  const sub = dt / steps;
  for (let i = 0; i < steps; i++) step(world, body, sub, stepUpHeight);
}

/** 한 substep: x → z → y 순서로 축 분리 이동한다 (MVP_SPEC 9.4). */
function step(world: CollisionWorld, body: AabbBody, dt: number, stepUpHeight: number): void {
  const grounded = body.onGround;
  moveHorizontal(world, body, 'x', body.velocity.x * dt, grounded, stepUpHeight);
  moveHorizontal(world, body, 'z', body.velocity.z * dt, grounded, stepUpHeight);
  moveVertical(world, body, body.velocity.y * dt);
}

/**
 * 수평 한 축의 이동. 막히면 지면 위에서 step-up 을 시도하고, 안 되면 면에 붙여 멈춘다.
 * step-up 은 올라설 높이가 stepUpHeight 이하이고 올라선 자리에 머리 공간이 있을 때만 한다.
 */
function moveHorizontal(
  world: CollisionWorld,
  body: AabbBody,
  axis: 'x' | 'z',
  delta: number,
  grounded: boolean,
  stepUpHeight: number,
): void {
  if (delta === 0) return;
  const p = body.pos;
  const moved = axis === 'x' ? { ...p, x: p.x + delta } : { ...p, z: p.z + delta };
  const hit = findOverlap(world, moved, body.width, body.height);
  if (!hit) {
    body.pos = moved;
    return;
  }
  if (grounded && stepUpHeight > 0) {
    const lift = hit.maxY + 1 - p.y;
    if (lift > 0 && lift <= stepUpHeight + EDGE) {
      const raised = { ...moved, y: hit.maxY + 1 };
      // 올라서는 동안 머리가 천장에 막히지 않고, 올라선 자리가 비어 있어야 한다
      const headroom = { ...p, y: hit.maxY + 1 };
      if (
        isAabbFree(world, headroom, body.width, body.height) &&
        isAabbFree(world, raised, body.width, body.height)
      ) {
        body.pos = raised;
        return;
      }
    }
  }
  const half = body.width / 2;
  if (axis === 'x') {
    const x = delta > 0 ? hit.minX - half - SKIN : hit.maxX + 1 + half + SKIN;
    body.pos = { ...p, x };
    body.velocity = { ...body.velocity, x: 0 };
  } else {
    const z = delta > 0 ? hit.minZ - half - SKIN : hit.maxZ + 1 + half + SKIN;
    body.pos = { ...p, z };
    body.velocity = { ...body.velocity, z: 0 };
  }
}

/** 수직 이동. 아래로 막히면 칸 윗면에 서서 onGround = true, 위로 막히면 천장 아래에 멈춘다. */
function moveVertical(world: CollisionWorld, body: AabbBody, delta: number): void {
  const p = body.pos;
  if (delta === 0) {
    // 정지 중에도 발밑이 사라지면 떨어지기 시작해야 한다
    body.onGround = !isAabbFree(world, { ...p, y: p.y - SKIN * 10 }, body.width, body.height);
    return;
  }
  const moved = { ...p, y: p.y + delta };
  const hit = findOverlap(world, moved, body.width, body.height);
  if (!hit) {
    body.pos = moved;
    body.onGround = false;
    return;
  }
  if (delta < 0) {
    body.pos = { ...p, y: hit.maxY + 1 };
    body.onGround = true;
  } else {
    body.pos = { ...p, y: hit.minY - body.height - SKIN };
    body.onGround = false;
  }
  body.velocity = { ...body.velocity, y: 0 };
}
