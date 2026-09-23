import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/game/data/blocks';
import { detectRoom, RoomSearch } from '../src/game/room/detectRoom';
import type { RoomDetection } from '../src/game/types';
import { buildTestWorld } from './helpers/buildTestWorld';
import { LIMITS, squareRoom } from './helpers/roomFixtures';

/** 실패 사유를 꺼낸다. 성공이면 'OK'. */
function reason(d: RoomDetection): string {
  return d.ok ? 'OK' : d.failure.reason;
}

const ROOM_5X5 = `
  y=0:  # # # # # # #
        # # # # # # #
        # # # # # # #
        # # # # # # #
        # # # # # # #
        # # # # # # #
        # # # # # # #
  y=1:  # # # # # # #
        # . . . . . #
        # . . . . . #
        # . . . . . #
        # . . . . . #
        # . . . . . #
        # # # D # # #
  y=2:  # # # # # # #
        # . . . . . #
        # . . . . . #
        # . . . . . #
        # . . . . . #
        # . . . . . #
        # # # D # # #
`;

describe('detectRoom 성공 (TASK-018, MVP_SPEC 11.2)', () => {
  it('5 × 5 판자방 + 문 1 개가 성공한다', () => {
    const t = buildTestWorld(ROOM_5X5);
    const d = detectRoom(t, { x: 3, y: 1, z: 3 }, LIMITS);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.shape.interior).toHaveLength(25);
    expect(d.shape.floorY).toBe(1);
    expect(d.shape.doors).toEqual([{ x: 3, y: 1, z: 6 }]);
    // 경계는 내부의 4 방향 이웃뿐이다. 모서리 기둥은 필요 없다
    expect(d.shape.boundary).toHaveLength(20);
  });

  it('RoomBlockReader 만 받는다: VoxelWorld 없이 Map 으로도 판정한다', () => {
    const t = buildTestWorld(ROOM_5X5);
    const cells = new Map<string, number>();
    for (let y = 0; y < 3; y++)
      for (let z = 0; z < 7; z++)
        for (let x = 0; x < 7; x++) cells.set(`${x},${y},${z}`, t.get(x, y, z));
    const reader = {
      get: (x: number, y: number, z: number) => cells.get(`${x},${y},${z}`) ?? 0,
      contains: (p: { x: number; y: number; z: number }) => cells.has(`${p.x},${p.y},${p.z}`),
      objectAt: t.objectAt,
    };
    expect(detectRoom(reader, { x: 1, y: 1, z: 1 }, LIMITS).ok).toBe(true);
  });

  it('돌벽돌·창문 벽도 인정된다. 천장은 요구하지 않는다', () => {
    const t = buildTestWorld(squareRoom({ inner: 4, wall: 'S' }));
    t.world.writeInitial(0, 2, 2, BlockId.window);
    expect(detectRoom(t, { x: 2, y: 1, z: 2 }, LIMITS).ok).toBe(true);
  });

  it('고체 가구를 놓아도 방 형태가 유지되고 점유 칸이 바닥 면적에 포함된다', () => {
    const t = buildTestWorld(
      `
      y=0:  # # # # #
            # # # # #
            # # # # #
            # # # # #
      y=1:  # # # # #
            # B B T #
            # . . C #
            # # D # #
      y=2:  # # # # #
            # . . . #
            # . . . #
            # # D # #
    `,
      { beds: [{ anchor: { x: 1, y: 1, z: 1 }, facing: 'east' }] },
    );
    const d = detectRoom(t, { x: 1, y: 1, z: 2 }, LIMITS);
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.shape.interior).toHaveLength(6);
    // 가구 칸에서 시작해도 같은 방이다
    const fromBed = detectRoom(t, { x: 2, y: 1, z: 1 }, LIMITS);
    expect(fromBed.ok && fromBed.shape.interior.length).toBe(6);
  });

  it('문은 비고체보다 먼저 경계로 처리한다: 문 밖으로 새지 않는다', () => {
    const t = buildTestWorld(squareRoom({ inner: 3 }));
    const d = detectRoom(t, { x: 2, y: 1, z: 2 }, LIMITS);
    expect(d.ok && d.shape.interior.length).toBe(9);
    if (d.ok) expect(d.shape.boundary).toContainEqual({ x: 2, y: 1, z: 4 });
  });

  it('10 × 10(100 칸)은 성공한다', () => {
    const t = buildTestWorld(squareRoom({ inner: 10 }));
    expect(reason(detectRoom(t, { x: 5, y: 1, z: 5 }, LIMITS))).toBe('OK');
  });

  it('2 × 2(4 칸)은 성공한다', () => {
    const t = buildTestWorld(squareRoom({ inner: 2 }));
    expect(reason(detectRoom(t, { x: 1, y: 1, z: 1 }, LIMITS))).toBe('OK');
  });
});

describe('detectRoom 실패 (TASK-018, MVP_SPEC 11.3 / 11.4)', () => {
  it('문이 없으면 NO_DOOR 다', () => {
    const t = buildTestWorld(squareRoom({ inner: 5, door: false }));
    expect(reason(detectRoom(t, { x: 3, y: 1, z: 3 }, LIMITS))).toBe('NO_DOOR');
  });

  it('벽이 1 칸 높이면 WALL_TOO_LOW + 둘째 층 좌표다', () => {
    const t = buildTestWorld(squareRoom({ inner: 5 }));
    t.world.setBlock(0, 2, 3, BlockId.air, 'player');
    const d = detectRoom(t, { x: 3, y: 1, z: 3 }, LIMITS);
    expect(d).toEqual({ ok: false, failure: { reason: 'WALL_TOO_LOW', at: { x: 0, y: 2, z: 3 } } });
  });

  it('벽 전체가 1 칸이면 WALL_TOO_LOW 다', () => {
    const t = buildTestWorld(squareRoom({ inner: 4, wallHeight: 1, door: false }));
    expect(reason(detectRoom(t, { x: 2, y: 1, z: 2 }, LIMITS))).toBe('WALL_TOO_LOW');
  });

  it('바닥에 구멍이 있으면 NO_FLOOR + 구멍 좌표(y-1)다', () => {
    const t = buildTestWorld(squareRoom({ inner: 5 }));
    t.world.setBlock(4, 0, 2, BlockId.air, 'player');
    const d = detectRoom(t, { x: 1, y: 1, z: 1 }, LIMITS);
    expect(d).toEqual({ ok: false, failure: { reason: 'NO_FLOOR', at: { x: 4, y: 0, z: 2 } } });
  });

  it('2 × 1 공간은 TOO_SMALL 이다', () => {
    const t = buildTestWorld(squareRoom({ inner: 2, innerZ: 1 }));
    expect(reason(detectRoom(t, { x: 1, y: 1, z: 1 }, LIMITS))).toBe('TOO_SMALL');
  });

  it('내부 셀 3 개(2 × 2 미만)는 TOO_SMALL 이다', () => {
    const t = buildTestWorld(squareRoom({ inner: 2 }));
    t.world.setBlock(2, 1, 2, BlockId.plank, 'player');
    expect(reason(detectRoom(t, { x: 1, y: 1, z: 1 }, LIMITS))).toBe('TOO_SMALL');
  });

  it('내부 바닥 11 × 11 공간은 TOO_LARGE 다', () => {
    const t = buildTestWorld(squareRoom({ inner: 11 }));
    expect(reason(detectRoom(t, { x: 6, y: 1, z: 6 }, LIMITS))).toBe('TOO_LARGE');
  });

  it('dirt 로만 둘러싸인 공간은 NOT_ENCLOSED 다 (MVP_SPEC 8.4)', () => {
    const t = buildTestWorld(squareRoom({ inner: 4, wall: 'd', floor: 'd', door: false }));
    const s = new RoomSearch(t, { x: 2, y: 1, z: 2 }, LIMITS);
    s.step(10_000);
    expect(s.result?.ok).toBe(false);
    if (s.result && !s.result.ok) {
      expect(s.result.failure.reason).toBe('NOT_ENCLOSED');
      if (s.result.failure.reason === 'NOT_ENCLOSED') {
        expect(t.get(s.result.failure.at.x, s.result.failure.at.y, s.result.failure.at.z)).toBe(
          BlockId.dirt,
        );
      }
    }
    expect(s.failureDetail).toBe('notWall');
  });

  it('산비탈 동굴(stone 벽)은 방이 아니다', () => {
    const t = buildTestWorld(squareRoom({ inner: 4, wall: 's', door: false }));
    expect(reason(detectRoom(t, { x: 2, y: 1, z: 2 }, LIMITS))).toBe('NOT_ENCLOSED');
  });

  it('평지의 벽 구멍은 TOO_LARGE 로 끝나고 탐색 영역·경로를 남긴다', () => {
    // 64 × 64 평지 위에 한 칸 뚫린 5 × 5 방. 월드 끝보다 먼저 100 칸을 넘는다
    const t = buildTestWorld(squareRoom({ inner: 5 }), {
      offset: { x: 20, y: 0, z: 20 },
      size: { sizeX: 64, sizeY: 4, sizeZ: 64 },
    });
    for (let x = 0; x < 64; x++)
      for (let z = 0; z < 64; z++)
        if (t.get(x, 0, z) === BlockId.air) t.world.writeInitial(x, 0, z, BlockId.grass);
    t.world.setBlock(20, 1, 23, BlockId.air, 'player');
    t.world.setBlock(20, 2, 23, BlockId.air, 'player');
    const s = new RoomSearch(t, { x: 23, y: 1, z: 23 }, LIMITS);
    s.step(100_000);
    expect(s.result).toEqual({ ok: false, failure: { reason: 'TOO_LARGE' } });
    expect(s.explored.length).toBe(LIMITS.maxFloorArea + 1);
    const trace = s.escapeTrace();
    expect(trace[0]).toEqual({ x: 23, y: 1, z: 23 });
    // 경로는 실제로 구멍(20, 1, 23)을 지나 밖으로 나갔다
    expect(trace).toContainEqual({ x: 20, y: 1, z: 23 });
    // 경로의 이웃 칸은 모두 수평 한 칸 차이다
    for (let i = 1; i < trace.length; i++) {
      const a = trace[i - 1];
      const b = trace[i];
      if (!a || !b) continue;
      expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
    }
  });

  it('작은 월드의 벽 구멍은 월드 밖에 닿아 NOT_ENCLOSED(outside) 로 끝난다', () => {
    const t = buildTestWorld(squareRoom({ inner: 5 }));
    t.world.setBlock(0, 1, 3, BlockId.air, 'player');
    const s = new RoomSearch(t, { x: 3, y: 1, z: 3 }, LIMITS);
    s.step(10_000);
    expect(s.result).toEqual({
      ok: false,
      failure: { reason: 'NOT_ENCLOSED', at: { x: -1, y: 1, z: 3 } },
    });
    expect(s.failureDetail).toBe('outside');
    expect(s.escapeTrace().at(-1)).toEqual({ x: -1, y: 1, z: 3 });
  });

  it('열린 공간에서 시작해도 종료된다(무한 루프 없음)', () => {
    const t = buildTestWorld(`y=0: g`, {
      size: { sizeX: 128, sizeY: 3, sizeZ: 128 },
    });
    for (let x = 0; x < 128; x++)
      for (let z = 0; z < 128; z++) t.world.writeInitial(x, 0, z, BlockId.grass);
    const d = detectRoom(t, { x: 64, y: 1, z: 64 }, LIMITS);
    expect(['TOO_LARGE', 'NOT_ENCLOSED']).toContain(reason(d));
    // 바닥도 없는 허공
    const air = detectRoom(t, { x: 64, y: 2, z: 64 }, LIMITS);
    expect(reason(air)).toBe('NO_FLOOR');
  });

  it('반쪽 문(윗칸만 이 평면)은 문으로 세지 않는다', () => {
    // 문을 한 칸 낮게 놓아 윗칸이 y=1 경계에 있다
    const t = buildTestWorld(
      `
      y=0:  # # # # #
            # # # # #
            # # # # #
            # # D # #
      y=1:  # # # # #
            # . . . #
            # . . . #
            # # D # #
      y=2:  # # # # #
            # . . . #
            # . . . #
            # # # # #
    `,
    );
    expect(reason(detectRoom(t, { x: 1, y: 1, z: 1 }, LIMITS))).toBe('NO_DOOR');
  });

  it('벽 칸에서 시작하면 내부가 없으므로 TOO_SMALL 이다', () => {
    const t = buildTestWorld(squareRoom({ inner: 3 }));
    expect(reason(detectRoom(t, { x: 0, y: 1, z: 0 }, LIMITS))).toBe('TOO_SMALL');
  });
});

describe('RoomSearch 분할 실행 (ARCHITECTURE 10.1)', () => {
  it('한 셀씩 진행해도 한 번에 실행한 결과와 같다', () => {
    const t = buildTestWorld(squareRoom({ inner: 6 }));
    const s = new RoomSearch(t, { x: 3, y: 1, z: 3 }, LIMITS);
    let steps = 0;
    while (!s.step(1)) steps += 1;
    expect(steps).toBeGreaterThan(36);
    expect(s.result).toEqual(detectRoom(t, { x: 3, y: 1, z: 3 }, LIMITS));
  });

  it('touches 는 바닥·두 층과 xz 경계 +1 을 포함한다', () => {
    const t = buildTestWorld(squareRoom({ inner: 3 }));
    const s = new RoomSearch(t, { x: 2, y: 1, z: 2 }, LIMITS);
    s.step(10_000);
    expect(s.touches({ x: 0, y: 0, z: 0 })).toBe(true);
    expect(s.touches({ x: 4, y: 2, z: 4 })).toBe(true);
    expect(s.touches({ x: 2, y: 3, z: 2 })).toBe(false);
    expect(s.touches({ x: 6, y: 1, z: 2 })).toBe(false);
  });
});
