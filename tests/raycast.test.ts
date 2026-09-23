import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { EventBus } from '../src/game/EventBus';
import { cameraBoomDistance, findAimTarget, shoulderPoint } from '../src/game/systems/aim';
import { createPlayer } from '../src/game/systems/PlayerMovementSystem';
import type { Vec3 } from '../src/game/types';
import {
  isAimTarget,
  isCameraBlocking,
  raycastVoxels,
  type RaycastWorld,
} from '../src/game/voxel/raycast';
import { VoxelWorld } from '../src/game/voxel/VoxelWorld';

/** 칸 집합으로 만든 가짜 월드. */
function cells(list: [number, number, number][], id: number = BlockId.stone): RaycastWorld {
  const set = new Set(list.map((c) => c.join(',')));
  return { getBlock: (x, y, z) => (set.has(`${x},${y},${z}`) ? id : 0) };
}

/** 정규화. */
function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** 광선을 아주 잘게 샘플링해 처음 들어가는 대상 칸을 찾는 기준 구현. */
function bruteForce(
  world: RaycastWorld,
  o: Vec3,
  d: Vec3,
  max: number,
): { x: number; y: number; z: number } | null {
  for (let t = 0; t <= max; t += 0.0005) {
    const p = {
      x: Math.floor(o.x + d.x * t),
      y: Math.floor(o.y + d.y * t),
      z: Math.floor(o.z + d.z * t),
    };
    if (world.getBlock(p.x, p.y, p.z) !== 0) return p;
  }
  return null;
}

describe('raycastVoxels (TASK-012)', () => {
  it('축 방향으로 바라본 블록과 들어온 면을 돌려준다', () => {
    const w = cells([[3, 0, 0]]);
    const hit = raycastVoxels(w, { x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 5, isAimTarget);
    expect(hit?.pos).toEqual({ x: 3, y: 0, z: 0 });
    expect(hit?.face).toEqual({ x: -1, y: 0, z: 0 });
    expect(hit?.distance).toBeCloseTo(2.5);
    // 설치 위치 = pos + face = 바로 앞 칸
    const down = raycastVoxels(
      cells([[0, -3, 0]]),
      { x: 0.5, y: 0.5, z: 0.5 },
      { x: 0, y: -1, z: 0 },
      5,
      isAimTarget,
    );
    expect(down?.face).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('5.0 보다 먼 블록은 선택하지 않는다', () => {
    const w = cells([[6, 0, 0]]);
    const o = { x: 0.5, y: 0.5, z: 0.5 };
    expect(raycastVoxels(w, o, { x: 1, y: 0, z: 0 }, 5, isAimTarget)).toBeNull();
    // 경계까지 정확히 5.0 이면 선택된다 (0.5 + 4.5)
    const near = cells([[5, 0, 0]]);
    expect(raycastVoxels(near, o, { x: 1, y: 0, z: 0 }, 5, isAimTarget)?.pos.x).toBe(5);
    expect(raycastVoxels(near, o, { x: 1, y: 0, z: 0 }, 4.49, isAimTarget)).toBeNull();
  });

  it('대각선으로 볼 때도 블록을 건너뛰지 않는다 (샘플링 기준 구현과 일치)', () => {
    // 모서리를 스치는 칸 하나씩만 있는 월드에서 여러 방향을 비교한다
    const dirs: Vec3[] = [
      { x: 1, y: 1, z: 0 },
      { x: 1, y: 0.999, z: 0.001 },
      { x: 1, y: 1, z: 1 },
      { x: 0.3, y: -0.7, z: 0.9 },
      { x: -0.5, y: 0.2, z: -0.8 },
      { x: 2, y: 1, z: -0.5 },
    ];
    const o = { x: 0.3, y: 0.6, z: 0.45 };
    for (const raw of dirs) {
      const d = norm(raw);
      // 광선이 지나는 칸 하나를 골라 그 칸만 고체로 두고, 먼저 지나는 이웃 칸에 대상이 없음을 확인한다
      for (let k = 1; k <= 6; k++) {
        const t = k * 0.7;
        const target: [number, number, number] = [
          Math.floor(o.x + d.x * t),
          Math.floor(o.y + d.y * t),
          Math.floor(o.z + d.z * t),
        ];
        const w = cells([target]);
        const expected = bruteForce(w, o, d, 6);
        const hit = raycastVoxels(w, o, d, 6, isAimTarget);
        expect(hit?.pos ?? null).toEqual(expected);
      }
    }
  });

  it('정확히 모서리를 지나는 광선은 두 이웃 중 하나를 방문한다', () => {
    // (0.5, 0.5) 에서 (1,1) 방향: 모서리 (1,1) 을 정확히 지난다. x 칸(1,0) 을 먼저 방문한다
    const w = cells([[1, 0, 0]]);
    const d = norm({ x: 1, y: 1, z: 0 });
    const hit = raycastVoxels(w, { x: 0.5, y: 0.5, z: 0.5 }, d, 5, isAimTarget);
    expect(hit?.pos).toEqual({ x: 1, y: 0, z: 0 });
    expect(hit?.face).toEqual({ x: -1, y: 0, z: 0 });
  });

  it('시작 칸이 대상이면 거리 0 · face 0 이다', () => {
    const w = cells([[0, 0, 0]]);
    const hit = raycastVoxels(w, { x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 5, isAimTarget);
    expect(hit).toEqual({ pos: { x: 0, y: 0, z: 0 }, face: { x: 0, y: 0, z: 0 }, distance: 0 });
  });

  it('카메라는 window·door 에 막히고 torch·water 에는 막히지 않는다', () => {
    expect(isCameraBlocking(BlockId.window)).toBe(true);
    expect(isCameraBlocking(BlockId.door)).toBe(true);
    expect(isCameraBlocking(BlockId.plank)).toBe(true);
    expect(isCameraBlocking(BlockId.torch)).toBe(false);
    expect(isCameraBlocking(BlockId.water)).toBe(false);
    expect(isCameraBlocking(BlockId.air)).toBe(false);
  });
});

describe('조준 광선 (MVP_SPEC 9.3 / 10.1)', () => {
  /** 평지(y ≤ 4)와 플레이어. */
  function setup(): { world: VoxelWorld; player: ReturnType<typeof createPlayer> } {
    const world = new VoxelWorld({ sizeX: 32, sizeY: 16, sizeZ: 32 }, new EventBus());
    for (let x = 0; x < 32; x++)
      for (let z = 0; z < 32; z++) for (let y = 0; y <= 4; y++) world.writeInitial(x, y, z, 4);
    const player = createPlayer({ x: 10, y: 5, z: 10 });
    player.body.pos = { x: 10.5, y: 5, z: 10.5 };
    return { world, player };
  }

  it('어깨점은 시선 원점에서 오른쪽으로 0.6 이다. 벽 안이면 시선 원점이다', () => {
    const { world, player } = setup();
    const s = shoulderPoint(world, player);
    expect(s.y).toBeCloseTo(5 + balance.player.eyeHeight);
    expect(s.x).toBeCloseTo(10.5 + balance.player.shoulderOffset);
    world.setBlock(11, 6, 10, BlockId.plank, 'player');
    expect(shoulderPoint(world, player).x).toBeCloseTo(10.5);
  });

  it('내려다보면 발 앞의 지면을, 멀리 보면 null 을 조준한다', () => {
    const { world, player } = setup();
    player.pitch = -Math.PI / 4;
    const hit = findAimTarget(world, player);
    expect(hit?.pos.y).toBe(4);
    expect(hit?.face).toEqual({ x: 0, y: 1, z: 0 });
    player.pitch = 0;
    expect(findAimTarget(world, player)).toBeNull();
  });
});

describe('3 인칭 카메라 거리 (TASK-011)', () => {
  /** 평지 위, 뒤(+z) 에 벽을 세울 수 있는 월드와 플레이어(yaw 0 → 카메라는 +z 쪽). */
  function setup(): { world: VoxelWorld; player: ReturnType<typeof createPlayer> } {
    const world = new VoxelWorld({ sizeX: 32, sizeY: 16, sizeZ: 32 }, new EventBus());
    for (let x = 0; x < 32; x++)
      for (let z = 0; z < 32; z++) for (let y = 0; y <= 4; y++) world.writeInitial(x, y, z, 4);
    const player = createPlayer({ x: 10, y: 5, z: 10 });
    player.body.pos = { x: 10.5, y: 5, z: 10.5 };
    return { world, player };
  }

  /** z = wallZ 에 x 0~31, y 5~10 벽을 세운다. */
  function wall(world: VoxelWorld, wallZ: number, id: number): void {
    for (let x = 0; x < 32; x++)
      for (let y = 5; y <= 10; y++) world.setBlock(x, y, wallZ, id, 'player');
  }

  it('막힌 것이 없으면 거리 5.0 이다', () => {
    const { world, player } = setup();
    expect(cameraBoomDistance(world, player)).toBe(balance.player.cameraDistance);
  });

  it('뒤의 벽에 붙으면 거리를 줄여 벽 안쪽에 머문다', () => {
    const { world, player } = setup();
    wall(world, 12, BlockId.plank);
    const d = cameraBoomDistance(world, player);
    expect(d).toBeLessThan(1.5);
    // 카메라 z = 어깨점 z + d (yaw 0 이면 뒤가 +z). 벽 면 z = 12 를 넘지 않는다
    expect(10.5 + d).toBeLessThan(12);
  });

  it('투명한 window 와 door 도 카메라를 막는다', () => {
    for (const id of [BlockId.window, BlockId.stone_brick]) {
      const { world, player } = setup();
      wall(world, 13, id);
      expect(10.5 + cameraBoomDistance(world, player)).toBeLessThan(13);
    }
    const { world, player } = setup();
    // door 는 다중 칸 객체다: 카메라 광선이 지나는 높이에 문을 둔다
    const eyeY = Math.floor(5 + balance.player.eyeHeight);
    world.editObject(
      {
        kind: 'place',
        object: {
          id: 'd',
          blockId: BlockId.door,
          anchor: { x: 11, y: eyeY - 1, z: 13 },
          facing: 'north',
        },
      },
      'player',
    );
    player.body.pos = { x: 11.5 - balance.player.shoulderOffset, y: 5, z: 10.5 };
    expect(10.5 + cameraBoomDistance(world, player)).toBeLessThan(13);
  });

  it('실내에서 올려다봐도 천장 밖으로 나가지 않는다', () => {
    const { world, player } = setup();
    // 천장 y = 8
    for (let x = 0; x < 32; x++)
      for (let z = 0; z < 32; z++) world.setBlock(x, 8, z, BlockId.plank, 'player');
    player.pitch = -1.2; // 내려다보면 카메라는 위로 간다
    const d = cameraBoomDistance(world, player);
    const eyeY = 5 + balance.player.eyeHeight;
    const camY = eyeY + Math.sin(1.2) * d;
    expect(camY).toBeLessThan(8);
  });
});
