import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/game/data/blocks';
import { balance } from '../src/game/data/balance';
import {
  isAabbFree,
  isCollisionSolid,
  moveWithCollision,
  type AabbBody,
  type CollisionWorld,
} from '../src/game/voxel/collision';

/** Map 으로 만든 가짜 VoxelWorld. 경계 밖은 air(0) 다. */
function fakeWorld(size = { sizeX: 32, sizeY: 32, sizeZ: 32 }): CollisionWorld & {
  set(x: number, y: number, z: number, id: number): void;
} {
  const cells = new Map<string, number>();
  return {
    ...size,
    getBlock: (x, y, z) => {
      if (x < 0 || y < 0 || z < 0 || x >= size.sizeX || y >= size.sizeY || z >= size.sizeZ) {
        return 0;
      }
      return cells.get(`${x},${y},${z}`) ?? 0;
    },
    set(x, y, z, id) {
      cells.set(`${x},${y},${z}`, id);
    },
  };
}

/** y = 0 한 층을 stone 으로 깐 월드. */
function flatWorld(): ReturnType<typeof fakeWorld> {
  const w = fakeWorld();
  for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) w.set(x, 0, z, BlockId.stone);
  return w;
}

/** 플레이어 제원의 몸체. */
function body(x: number, y: number, z: number): AabbBody {
  return {
    pos: { x, y, z },
    velocity: { x: 0, y: 0, z: 0 },
    width: balance.player.width,
    height: balance.player.height,
    onGround: true,
  };
}

/** 일정 속도로 seconds 동안 60Hz 로 움직인다. 중력을 적용한다. */
function simulate(
  w: CollisionWorld,
  b: AabbBody,
  vx: number,
  vz: number,
  seconds: number,
  dt = 1 / 60,
): void {
  for (let t = 0; t < seconds; t += dt) {
    const vy = Math.max(b.velocity.y + balance.player.gravity * dt, balance.player.maxFallSpeed);
    b.velocity = { x: vx, y: vy, z: vz };
    moveWithCollision(w, b, dt, 1.0);
  }
}

describe('moveWithCollision', () => {
  it('벽으로 걸어가면 멈추고 관통하지 않는다', () => {
    const w = flatWorld();
    for (let z = 0; z < 32; z++) for (let y = 1; y <= 3; y++) w.set(10, y, z, BlockId.plank);
    const b = body(5.5, 1, 5.5);
    simulate(w, b, balance.player.walkSpeed, 0, 3);
    expect(b.pos.x).toBeLessThan(10 - 0.3);
    expect(b.pos.x).toBeGreaterThan(10 - 0.3 - 0.01);
    expect(b.pos.y).toBe(1);
  });

  it('높이 1 블록 턱을 자동으로 오른다', () => {
    const w = flatWorld();
    for (let z = 0; z < 32; z++) for (let x = 10; x < 32; x++) w.set(x, 1, z, BlockId.dirt);
    const b = body(5.5, 1, 5.5);
    simulate(w, b, balance.player.walkSpeed, 0, 2);
    expect(b.pos.x).toBeGreaterThan(11);
    expect(b.pos.y).toBe(2);
  });

  it('높이 2 블록 턱은 오르지 못한다', () => {
    const w = flatWorld();
    for (let z = 0; z < 32; z++) {
      for (let x = 10; x < 32; x++) {
        w.set(x, 1, z, BlockId.dirt);
        w.set(x, 2, z, BlockId.dirt);
      }
    }
    const b = body(5.5, 1, 5.5);
    simulate(w, b, balance.player.walkSpeed, 0, 2);
    expect(b.pos.x).toBeLessThan(10 - 0.3);
    expect(b.pos.y).toBe(1);
  });

  it('머리 위가 막힌 턱은 오르지 않는다', () => {
    const w = flatWorld();
    for (let z = 0; z < 32; z++) {
      w.set(10, 1, z, BlockId.dirt);
      // 올라선 자리의 머리 칸(y=3)이 막혔다
      w.set(10, 3, z, BlockId.dirt);
    }
    const b = body(5.5, 1, 5.5);
    simulate(w, b, balance.player.walkSpeed, 0, 2);
    expect(b.pos.x).toBeLessThan(10 - 0.3);
  });

  it('속도 -30 으로 떨어져도 바닥을 관통하지 않는다', () => {
    const w = flatWorld();
    const b = body(5.5, 25, 5.5);
    b.onGround = false;
    b.velocity = { x: 0, y: balance.player.maxFallSpeed, z: 0 };
    // dt 클램프 상한 0.1 초 한 번에 3 칸을 움직이는 경우도 포함한다
    for (let i = 0; i < 20; i++) {
      b.velocity = { x: 0, y: balance.player.maxFallSpeed, z: 0 };
      moveWithCollision(w, b, 0.1, 1.0);
    }
    expect(b.pos.y).toBe(1);
    expect(b.onGround).toBe(true);
  });

  it('얇은 한 칸 바닥도 -30 에서 관통하지 않는다', () => {
    const w = fakeWorld();
    w.set(5, 10, 5, BlockId.plank);
    const b = body(5.5, 20, 5.5);
    b.onGround = false;
    b.velocity = { x: 0, y: -30, z: 0 };
    moveWithCollision(w, b, 0.1, 1.0);
    moveWithCollision(w, b, 0.1, 1.0);
    moveWithCollision(w, b, 0.1, 1.0);
    expect(b.pos.y).toBe(11);
  });

  it('1 칸 폭 통로를 통과할 수 있다 (폭 0.6)', () => {
    const w = flatWorld();
    for (let x = 0; x < 32; x++) {
      if (x === 5) continue;
      for (let y = 1; y <= 2; y++) w.set(x, y, 10, BlockId.stone_brick);
    }
    const b = body(5.5, 1, 5.5);
    simulate(w, b, 0, balance.player.walkSpeed, 3);
    expect(b.pos.z).toBeGreaterThan(12);
  });

  it('비스듬히 1 칸 통로 입구에 닿으면 벽을 따라 미끄러진다', () => {
    const w = flatWorld();
    for (let x = 0; x < 32; x++) {
      if (x === 5) continue;
      for (let y = 1; y <= 2; y++) w.set(x, y, 10, BlockId.stone_brick);
    }
    const b = body(4.6, 1, 5.5);
    simulate(w, b, 0.2, balance.player.walkSpeed, 3);
    // x 가 통로 안으로 들어오기 전에는 z 가 벽 앞에서 멈춘다
    expect(b.pos.z).toBeLessThan(10);
  });

  it('door·torch·water 는 플레이어 충돌에서 비고체다 (MVP_SPEC 8.3)', () => {
    const w = flatWorld();
    for (let z = 0; z < 32; z++) {
      w.set(10, 1, z, BlockId.door);
      w.set(10, 2, z, BlockId.door);
    }
    const b = body(5.5, 1, 5.5);
    simulate(w, b, balance.player.walkSpeed, 0, 2);
    expect(b.pos.x).toBeGreaterThan(11);
    expect(isCollisionSolid(w, 3, 3, 3)).toBe(false);
    w.set(3, 3, 3, BlockId.water);
    expect(isCollisionSolid(w, 3, 3, 3)).toBe(false);
    w.set(3, 3, 3, BlockId.window);
    expect(isCollisionSolid(w, 3, 3, 3)).toBe(true);
  });

  it('천장에 머리를 부딪치면 위로 멈춘다', () => {
    const w = flatWorld();
    w.set(5, 3, 5, BlockId.plank);
    const b = body(5.5, 1, 5.5);
    b.velocity = { x: 0, y: 8, z: 0 };
    moveWithCollision(w, b, 0.1, 1.0);
    expect(b.pos.y + b.height).toBeLessThanOrEqual(3);
    expect(b.velocity.y).toBe(0);
  });

  it('발밑이 사라지면 onGround 가 풀리고 떨어진다', () => {
    const w = flatWorld();
    w.set(5, 1, 5, BlockId.dirt);
    const b = body(5.5, 2, 5.5);
    simulate(w, b, 0, 0, 0.2);
    expect(b.pos.y).toBe(2);
    w.set(5, 1, 5, BlockId.air);
    simulate(w, b, 0, 0, 1);
    expect(b.pos.y).toBe(1);
  });
});

describe('월드 경계 (MVP_SPEC 9.5)', () => {
  it('수평 범위 밖과 y < 0 은 고체, y ≥ sizeY 는 air 다', () => {
    const w = fakeWorld();
    expect(isCollisionSolid(w, -1, 5, 5)).toBe(true);
    expect(isCollisionSolid(w, 32, 5, 5)).toBe(true);
    expect(isCollisionSolid(w, 5, 5, -1)).toBe(true);
    expect(isCollisionSolid(w, 5, 5, 32)).toBe(true);
    expect(isCollisionSolid(w, 5, -1, 5)).toBe(true);
    expect(isCollisionSolid(w, 5, 32, 5)).toBe(false);
  });

  it('월드 가장자리로 걸어가면 경계에서 멈춘다', () => {
    const w = flatWorld();
    const b = body(29.5, 1, 5.5);
    simulate(w, b, balance.player.runSpeed, 0, 2);
    expect(b.pos.x).toBeLessThanOrEqual(32 - 0.3);
    expect(b.pos.x).toBeGreaterThan(31.6);
    const c = body(2.5, 1, 5.5);
    simulate(w, c, -balance.player.runSpeed, 0, 2);
    expect(c.pos.x).toBeGreaterThanOrEqual(0.3);
  });

  it('바닥이 없어도 y < 0 으로 빠지지 않는다', () => {
    const w = fakeWorld();
    const b = body(5.5, 3, 5.5);
    b.onGround = false;
    simulate(w, b, 0, 0, 2);
    expect(b.pos.y).toBe(0);
    expect(isAabbFree(w, b.pos, b.width, b.height)).toBe(true);
  });
});
