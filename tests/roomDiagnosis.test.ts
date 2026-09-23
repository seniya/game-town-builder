import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { ROOM_RECIPES } from '../src/game/data/roomRecipes';
import { EventBus } from '../src/game/EventBus';
import { RoomRegistry } from '../src/game/room/RoomRegistry';
import { createRoomReader } from '../src/game/room/roomReader';
import { EMPTY_INPUT_FRAME, type InputFrame } from '../src/game/systems/InputSystem';
import { createPlayer } from '../src/game/systems/PlayerMovementSystem';
import { diagnosisStart, RoomSystem } from '../src/game/systems/RoomSystem';
import type { RoomDiagnostic } from '../src/game/types';
import { VoxelWorld } from '../src/game/voxel/VoxelWorld';
import { describeDiagnostic } from '../src/ui/RoomDiagnosticPanel';

/** 평지(y=0 grass) 월드와 진단 가능한 RoomSystem. 플레이어는 (x, 1, z) 칸에 선다. */
function setup(opts: { tickMs?: number; size?: number } = {}) {
  const size = opts.size ?? 64;
  const events = new EventBus();
  const world = new VoxelWorld({ sizeX: size, sizeY: 8, sizeZ: size }, events);
  for (let x = 0; x < size; x++)
    for (let z = 0; z < size; z++) world.writeInitial(x, 0, z, BlockId.grass);
  const reader = createRoomReader(world);
  let clock = 0;
  const registry = new RoomRegistry(reader, events, {
    limits: balance.room,
    recipes: ROOM_RECIPES,
    now:
      opts.tickMs === undefined
        ? () => performance.now()
        : () => {
            clock += opts.tickMs as number;
            return clock;
          },
    listDoors: () => [],
  });
  const input = { frame: EMPTY_INPUT_FRAME as InputFrame };
  const player = createPlayer({ x: 30, y: 1, z: 30 });
  const system = new RoomSystem(registry, events, reader, balance.room.detectBudgetMs, {
    input,
    player,
  });
  /** 한 프레임. tab 이면 이번 프레임에 Tab 을 눌렀다. */
  const frame = (tab = false) => {
    input.frame = { ...EMPTY_INPUT_FRAME, pressed: new Set(tab ? ['Tab'] : []) };
    system.update();
  };
  /** 진단 결과가 나올 때까지 update 한다. */
  const diagnose = (): RoomDiagnostic => {
    for (let i = 0; i < 200; i++) {
      const d = registry.getDiagnosis();
      if (d.result && !d.pending) return d.result;
      frame();
    }
    throw new Error('진단이 끝나지 않았다');
  };
  /** 플레이어를 칸 (x, 1, z) 가운데로 옮긴다. */
  const stand = (x: number, z: number) => {
    player.body.pos = { x: x + 0.5, y: 1, z: z + 0.5 };
  };
  return { events, world, registry, system, frame, diagnose, stand, player };
}

type Env = ReturnType<typeof setup>;

/** (x0, z0) 에 내부 inner × inner 두 층 벽. wall 블록, skip 칸은 비운다. 바닥은 평지 grass 다. */
function ring(
  env: Env,
  x0: number,
  z0: number,
  inner: number,
  wall: number,
  skip: [number, number][] = [],
): void {
  const s = new Set(skip.map(([x, z]) => `${x},${z}`));
  for (let x = x0; x <= x0 + inner + 1; x++)
    for (let z = z0; z <= z0 + inner + 1; z++) {
      const edge = x === x0 || z === z0 || x === x0 + inner + 1 || z === z0 + inner + 1;
      if (!edge || s.has(`${x},${z}`)) continue;
      env.world.setBlock(x, 1, z, wall, 'player');
      env.world.setBlock(x, 2, z, wall, 'player');
    }
}

describe('방 진단 모드 (TASK-022, MVP_SPEC 11.5)', () => {
  it('Tab 으로 켜고 끈다', () => {
    const env = setup();
    expect(env.system.diagnosisActive).toBe(false);
    env.frame(true);
    expect(env.system.diagnosisActive).toBe(true);
    env.frame();
    expect(env.system.diagnosisActive).toBe(true);
    env.frame(true);
    expect(env.system.diagnosisActive).toBe(false);
    expect(env.registry.getDiagnosis()).toEqual({ pending: false, result: null });
  });

  it('열린 평지에서는 탐색 영역·경로와 "공간이 열려 있거나 너무 큽니다"가 표시된다', () => {
    const env = setup();
    env.frame(true);
    const d = env.diagnose();
    expect(d.detection.ok).toBe(false);
    expect(describeDiagnostic(d).title).toBe('공간이 열려 있거나 너무 큽니다');
    expect(d.explored.length).toBeGreaterThan(balance.room.maxFloorArea);
    expect(d.escapeTrace[0]).toEqual({ x: 30, y: 1, z: 30 });
    expect(d.escapeTrace.length).toBeGreaterThan(1);
  });

  it('문을 아직 안 단 공간도 진단된다: "문이 없습니다"', () => {
    const env = setup();
    ring(env, 27, 27, 5, BlockId.plank);
    env.frame(true);
    const d = env.diagnose();
    expect(d.detection).toEqual({ ok: false, failure: { reason: 'NO_DOOR' } });
    expect(describeDiagnostic(d).title).toBe('문이 없습니다');
    expect(d.explored).toHaveLength(25);
  });

  it('벽 한 칸 뚫린 방: 탐색 경로가 구멍을 지나고, 막으면 예산 내 재판정 후 인식된다 (Test 3)', () => {
    const env = setup();
    ring(env, 27, 27, 5, BlockId.plank, [
      [30, 33],
      [27, 30],
    ]);
    env.world.editObject(
      {
        kind: 'place',
        object: {
          id: env.world.placements.allocateId(),
          blockId: BlockId.door,
          anchor: { x: 30, y: 1, z: 33 },
          facing: 'south',
        },
      },
      'player',
    );
    env.frame(true);
    const d = env.diagnose();
    expect(describeDiagnostic(d).title).toBe('공간이 열려 있거나 너무 큽니다');
    expect(d.escapeTrace).toContainEqual({ x: 27, y: 1, z: 30 });
    expect(env.registry.getAll()).toHaveLength(0);
    env.world.setBlock(27, 1, 30, BlockId.plank, 'player');
    env.world.setBlock(27, 2, 30, BlockId.plank, 'player');
    const after = env.diagnose();
    expect(after.detection.ok).toBe(true);
    expect(describeDiagnostic(after).title).toBe('빈 방 — 방으로 인정됩니다');
    env.frame();
    expect(env.registry.getAll()).toHaveLength(1);
  });

  it('흙으로 둘러싼 공간: "이 블록은 방의 벽으로 인정되지 않습니다" + 지형 좌표 (Test 3)', () => {
    const env = setup();
    ring(env, 27, 27, 5, BlockId.dirt);
    env.frame(true);
    const d = env.diagnose();
    expect(describeDiagnostic(d).title).toBe('이 블록은 방의 벽으로 인정되지 않습니다');
    expect(d.detection.ok).toBe(false);
    if (!d.detection.ok && d.detection.failure.reason === 'NOT_ENCLOSED') {
      const at = d.detection.failure.at;
      expect(env.world.getBlock(at.x, at.y, at.z)).toBe(BlockId.dirt);
    }
  });

  it('바닥 구멍·낮은 벽은 실제 확인한 좌표와 사유를 표시한다', () => {
    const env = setup();
    ring(env, 27, 27, 5, BlockId.plank);
    env.world.setBlock(31, 0, 29, BlockId.air, 'player');
    env.frame(true);
    const hole = env.diagnose();
    expect(hole.detection).toEqual({
      ok: false,
      failure: { reason: 'NO_FLOOR', at: { x: 31, y: 0, z: 29 } },
    });
    expect(describeDiagnostic(hole).title).toBe('바닥에 구멍이 있습니다');
    env.world.setBlock(31, 0, 29, BlockId.grass, 'player');
    env.world.setBlock(33, 2, 30, BlockId.air, 'player');
    const low = env.diagnose();
    expect(low.detection).toEqual({
      ok: false,
      failure: { reason: 'WALL_TOO_LOW', at: { x: 33, y: 2, z: 30 } },
    });
    expect(describeDiagnostic(low).title).toBe('벽 높이가 부족합니다');
  });

  it('가구 접근 실패를 진단한다. 막힌 가구 좌표만 가리킨다', () => {
    const env = setup();
    ring(env, 27, 27, 3, BlockId.plank, [[29, 31]]);
    env.world.editObject(
      {
        kind: 'place',
        object: {
          id: env.world.placements.allocateId(),
          blockId: BlockId.door,
          anchor: { x: 29, y: 1, z: 31 },
          facing: 'south',
        },
      },
      'player',
    );
    // 구석 상자(28,1,28). 옆 보행 칸 (29,1,28) (28,1,29) 의 머리 칸을 공중 판자로 막는다
    env.world.setBlock(28, 1, 28, BlockId.chest, 'player');
    env.world.setBlock(29, 2, 28, BlockId.plank, 'player');
    env.world.setBlock(28, 2, 29, BlockId.plank, 'player');
    env.stand(29, 30);
    env.frame(true);
    const d = env.diagnose();
    expect(d.detection.ok).toBe(true);
    expect(d.roomType).toBe('EmptyRoom');
    expect(d.facilityIssues).toEqual([
      {
        at: { x: 28, y: 1, z: 28 },
        message: '상자에 다가갈 칸이 없습니다 (옆 칸이 막혔거나 문과 이어지지 않음)',
      },
    ]);
    // 머리 칸 하나를 치우면 창고가 된다
    env.world.setBlock(29, 2, 28, BlockId.air, 'player');
    const d2 = env.diagnose();
    expect(d2.roomType).toBe('Storeroom');
    expect(d2.facilityIssues).toEqual([]);
  });

  it('진단이 자동 큐보다 먼저 시작하고 공통 3ms 예산 안에서 이어서 수행된다', () => {
    // now() 한 번에 1 ms: 한 프레임(3 ms)에 탐색 묶음 두세 개만 진행한다
    const env = setup({ tickMs: 1 });
    for (let i = 0; i < 3; i++) ring(env, 2 + i * 14, 2, 10, BlockId.plank, [[7 + i * 14, 13]]);
    for (let i = 0; i < 3; i++) {
      env.world.editObject(
        {
          kind: 'place',
          object: {
            id: env.world.placements.allocateId(),
            blockId: BlockId.door,
            anchor: { x: 7 + i * 14, y: 1, z: 13 },
            facing: 'south',
          },
        },
        'player',
      );
    }
    const queued = env.registry.queueLength;
    expect(queued).toBeGreaterThan(0);
    // 셋째 방(내부 x 31~40, z 3~12, 100 칸) 안에서 진단한다
    env.stand(35, 7);
    env.frame(true);
    let frames = 1;
    while (env.registry.getDiagnosis().pending) {
      env.frame();
      frames += 1;
      expect(env.registry.stats.lastFrameMs).toBeLessThanOrEqual(balance.room.detectBudgetMs + 1);
    }
    // 100 칸 방 진단은 여러 프레임에 걸쳐 끝나고, 그동안 자동 큐는 진행하지 않았다
    expect(frames).toBeGreaterThan(1);
    expect(env.registry.getDiagnosis().result?.detection.ok).toBe(true);
    expect(env.registry.getAll()).toHaveLength(0);
    for (let i = 0; i < 100 && env.registry.queueLength > 0; i++) env.frame();
    expect(env.registry.getAll()).toHaveLength(3);
  });

  it('문 칸에 서 있으면 시선 앞쪽의 방 안 칸에서 진단한다', () => {
    const env = setup();
    ring(env, 27, 27, 5, BlockId.plank, [[30, 33]]);
    env.world.editObject(
      {
        kind: 'place',
        object: {
          id: env.world.placements.allocateId(),
          blockId: BlockId.door,
          anchor: { x: 30, y: 1, z: 33 },
          facing: 'south',
        },
      },
      'player',
    );
    env.stand(30, 33);
    env.player.yaw = 0; // -z (방 안쪽)
    expect(diagnosisStart(createRoomReader(env.world), env.player)).toEqual({ x: 30, y: 1, z: 32 });
    env.player.yaw = Math.PI; // +z (바깥)
    expect(diagnosisStart(createRoomReader(env.world), env.player)).toEqual({ x: 30, y: 1, z: 34 });
  });
});
