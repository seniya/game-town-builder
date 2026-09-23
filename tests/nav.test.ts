import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/game/data/blocks';
import { NavigationGraph, pathWatchCells } from '../src/game/nav/NavigationGraph';
import { findPath } from '../src/game/nav/pathfind';
import { PathScheduler } from '../src/game/nav/PathScheduler';
import type { ActorKind, BlockPos } from '../src/game/types';
import { FEET_Y, navFixture, wallAlongZ } from './helpers/navWorld';

/** 이웃 목록. */
function neighborsOf(graph: NavigationGraph, p: BlockPos, actor: ActorKind = 'npc'): BlockPos[] {
  const out: BlockPos[] = [];
  graph.neighbors(p, actor, out);
  return out;
}

describe('NavigationGraph (TASK-024)', () => {
  it('평지에서 4 방향 이웃이 4 개다', () => {
    const f = navFixture();
    expect(neighborsOf(f.graph, f.cell(10, 10))).toHaveLength(4);
  });

  it('1 칸 턱을 오르는 이웃이 포함되고 2 칸 턱은 아니다', () => {
    const f = navFixture();
    f.put(11, FEET_Y, 10, BlockId.plank); // 동쪽 1 칸 턱
    f.put(9, FEET_Y, 10, BlockId.plank); // 서쪽 2 칸 턱
    f.put(9, FEET_Y + 1, 10, BlockId.plank);
    const n = neighborsOf(f.graph, f.cell(10, 10));
    expect(n).toContainEqual({ x: 11, y: FEET_Y + 1, z: 10 });
    expect(n.some((p) => p.x === 9)).toBe(false);
    expect(n).toHaveLength(3);
  });

  it('1 칸 낙차는 이웃이고 2 칸 낙차는 아니다', () => {
    const f = navFixture();
    // 높이 2 단 위에 선 칸(10, 4, 10) 주변
    for (let x = 8; x <= 12; x++)
      for (let z = 8; z <= 12; z++) {
        f.put(x, FEET_Y, z, BlockId.plank);
        f.put(x, FEET_Y + 1, z, BlockId.plank);
      }
    f.world.setBlock(11, FEET_Y + 1, 10, BlockId.air, 'player'); // 동쪽 1 칸 낙차
    f.world.setBlock(10, FEET_Y + 1, 11, BlockId.air, 'player'); // 남쪽 2 칸 낙차
    f.world.setBlock(10, FEET_Y, 11, BlockId.air, 'player');
    const top = { x: 10, y: FEET_Y + 2, z: 10 };
    const n = neighborsOf(f.graph, top);
    expect(n).toContainEqual({ x: 11, y: FEET_Y + 1, z: 10 });
    expect(n.some((p) => p.z === 11)).toBe(false);
  });

  it("door 가 'npc' 에게는 통행 가능, 'monster' 에게는 불가다", () => {
    const f = navFixture();
    f.door(11, 10);
    expect(f.graph.isStandable(f.cell(11, 10), 'npc')).toBe(true);
    expect(f.graph.isStandable(f.cell(11, 10), 'monster')).toBe(false);
    expect(neighborsOf(f.graph, f.cell(10, 10), 'npc')).toContainEqual(f.cell(11, 10));
    expect(neighborsOf(f.graph, f.cell(10, 10), 'monster')).not.toContainEqual(f.cell(11, 10));
  });

  it('ActorKind 에 기본값이 없다 (생략하면 컴파일 에러)', () => {
    const f = navFixture();
    // 실행하지 않는 함수: 타입 검사만 확인한다
    const unchecked = (): void => {
      // @ts-expect-error — actor 를 생략할 수 없다 (ARCHITECTURE 11.2)
      f.graph.isStandable(f.cell(1, 1));
      // @ts-expect-error — neighbors 도 마찬가지다
      f.graph.neighbors(f.cell(1, 1), []);
    };
    expect(typeof unchecked).toBe('function');
  });

  it('발·머리 칸이 물인 칸은 서 있을 수 없다 (MVP_SPEC 9.5)', () => {
    const f = navFixture();
    f.put(11, FEET_Y, 10, BlockId.water);
    expect(f.graph.isStandable(f.cell(11, 10), 'npc')).toBe(false);
    expect(neighborsOf(f.graph, f.cell(10, 10))).toHaveLength(3);
  });

  it('이웃 캐시는 읽은 칸의 변경에서만 지워진다', () => {
    const f = navFixture();
    neighborsOf(f.graph, f.cell(10, 10));
    neighborsOf(f.graph, f.cell(20, 20));
    expect(f.graph.stats.cachedCells).toBe(2);
    f.put(11, FEET_Y, 10, BlockId.plank);
    expect(f.graph.stats.cachedCells).toBe(1);
    expect(neighborsOf(f.graph, f.cell(10, 10))).toContainEqual({ x: 11, y: FEET_Y + 1, z: 10 });
  });

  it('step-up 출발·도착 중 머리 공간 변경도 이웃 캐시와 경로를 즉시 무효화한다', () => {
    const f = navFixture();
    f.put(11, FEET_Y, 10, BlockId.plank);
    const up = { x: 11, y: FEET_Y + 1, z: 10 };
    expect(neighborsOf(f.graph, f.cell(10, 10))).toContainEqual(up);
    const path = [f.cell(10, 10), up];
    let hits = 0;
    const stop = f.graph.watch(pathWatchCells(path), () => void (hits += 1));
    // 출발 칸 y+2 (오르는 동안 머리)
    f.put(10, FEET_Y + 2, 10, BlockId.plank);
    expect(hits).toBe(1);
    expect(neighborsOf(f.graph, f.cell(10, 10))).not.toContainEqual(up);
    f.world.setBlock(10, FEET_Y + 2, 10, BlockId.air, 'player');
    expect(hits).toBe(2);
    expect(neighborsOf(f.graph, f.cell(10, 10))).toContainEqual(up);
    // 도착 칸의 머리
    f.put(11, FEET_Y + 2, 10, BlockId.plank);
    expect(hits).toBe(3);
    expect(neighborsOf(f.graph, f.cell(10, 10))).not.toContainEqual(up);
    stop();
    f.world.setBlock(11, FEET_Y + 2, 10, BlockId.air, 'player');
    expect(hits).toBe(3);
  });
});

describe('findPath (TASK-025)', () => {
  it('직선 경로를 찾는다', () => {
    const f = navFixture();
    const r = findPath(f.graph, f.cell(2, 5), { kind: 'cell', pos: f.cell(12, 5) }, 'npc', 4000);
    expect(r.reason).toBeUndefined();
    expect(r.path).toHaveLength(11);
    expect(r.path?.every((p) => p.z === 5)).toBe(true);
  });

  it('벽을 우회한다', () => {
    const f = navFixture();
    wallAlongZ(f, 7, 0, 20);
    const r = findPath(f.graph, f.cell(4, 5), { kind: 'cell', pos: f.cell(10, 5) }, 'npc', 4000);
    expect(r.path).not.toBeNull();
    expect(r.path?.some((p) => p.z > 20)).toBe(true);
    expect(r.path?.some((p) => p.x === 7 && p.y === FEET_Y)).toBe(true); // 벽 끝(z=21) 을 돈다
  });

  it('계단(1 칸씩 쌓은 블록)을 오른다', () => {
    const f = navFixture();
    for (let i = 0; i < 4; i++)
      for (let k = 0; k <= i; k++) f.put(6 + i, FEET_Y + k, 5, BlockId.plank);
    const goal = { x: 9, y: FEET_Y + 4, z: 5 };
    const r = findPath(f.graph, f.cell(3, 5), { kind: 'cell', pos: goal }, 'npc', 4000);
    expect(r.path?.at(-1)).toEqual(goal);
    expect(r.path?.map((p) => p.y)).toEqual([2, 2, 2, 3, 4, 5, 6]);
  });

  it("완전히 막히면 reason: 'NO_PATH' 이고 접근 경로가 있는 장애물만 경계에 든다", () => {
    const f = navFixture(20);
    // 목표를 판자 방으로 둘러싼다(지형이 아니므로 파괴 후보)
    for (let x = 12; x <= 16; x++)
      for (let z = 12; z <= 16; z++) {
        if (x > 12 && x < 16 && z > 12 && z < 16) continue;
        f.put(x, FEET_Y, z, BlockId.plank);
        f.put(x, FEET_Y + 1, z, BlockId.plank);
      }
    // 출발 쪽과 이어지지 않은 곳의 판자(두 칸 흙 벽 안쪽)
    const r = findPath(
      f.graph,
      f.cell(2, 2),
      { kind: 'cell', pos: f.cell(14, 14) },
      'monster',
      100000,
    );
    expect(r.reason).toBe('NO_PATH');
    expect(r.path).toBeNull();
    expect(r.reachableBoundary.length).toBeGreaterThan(0);
    for (const b of r.reachableBoundary) {
      expect(b.path[0]).toEqual(f.cell(2, 2));
      expect(b.path.at(-1)).toEqual(b.approach);
      expect(Math.abs(b.obstacle.x - b.approach.x) + Math.abs(b.obstacle.z - b.approach.z)).toBe(1);
      // 방 안쪽 면(x 13~15, z 13~15 를 향한 면)에서 접근하는 장애물은 없다
      expect(b.approach.x > 12 && b.approach.x < 16 && b.approach.z > 12 && b.approach.z < 16).toBe(
        false,
      );
    }
    // 지형(흙) 은 파괴 후보가 아니다
    expect(
      r.reachableBoundary.every(
        (b) => f.world.getBlock(b.obstacle.x, b.obstacle.y, b.obstacle.z) === BlockId.plank,
      ),
    ).toBe(true);
  });

  it("노드 상한을 넘으면 reason: 'NODE_LIMIT' 이고 두 reason 이 구분된다", () => {
    const f = navFixture(64);
    const r = findPath(f.graph, f.cell(1, 1), { kind: 'cell', pos: f.cell(60, 60) }, 'npc', 50);
    expect(r.reason).toBe('NODE_LIMIT');
    expect(r.continuation).not.toBeNull();
    expect(r.path).toBeNull();
    expect(r.reachableBoundary).toEqual([]);
    const blocked = navFixture(16);
    wallAlongZ(blocked, 8, 0, 15, BlockId.dirt);
    const n = findPath(
      blocked.graph,
      blocked.cell(2, 2),
      { kind: 'cell', pos: blocked.cell(12, 2) },
      'npc',
      4000,
    );
    expect(n.reason).toBe('NO_PATH');
    expect(n.reason).not.toBe(r.reason);
  });

  it('NODE_LIMIT 의 partialPath 는 검증된 칸만 포함한다', () => {
    const f = navFixture(64);
    wallAlongZ(f, 20, 0, 40);
    const r = findPath(f.graph, f.cell(5, 5), { kind: 'cell', pos: f.cell(40, 5) }, 'npc', 200);
    expect(r.reason).toBe('NODE_LIMIT');
    expect(r.partialPath.length).toBeGreaterThan(1);
    expect(r.partialPath[0]).toEqual(f.cell(5, 5));
    for (let i = 1; i < r.partialPath.length; i++) {
      expect(
        f.graph.canStep(r.partialPath[i - 1] as BlockPos, r.partialPath[i] as BlockPos, 'npc'),
      ).toBe(true);
    }
  });

  it('continuation 으로 이어 가면 같은 경로에 도달하고 토큰은 한 번만 쓸 수 있다', () => {
    const f = navFixture(64);
    const goal = { kind: 'cell' as const, pos: f.cell(50, 40) };
    const whole = findPath(f.graph, f.cell(3, 3), goal, 'npc', 100000);
    let r = findPath(f.graph, f.cell(3, 3), goal, 'npc', 30);
    const first = r.continuation;
    let calls = 1;
    while (r.reason === 'NODE_LIMIT' && r.continuation) {
      r = findPath(f.graph, f.cell(3, 3), goal, 'npc', 30, r.continuation);
      calls += 1;
    }
    expect(calls).toBeGreaterThan(1);
    expect(r.path?.length).toBe(whole.path?.length);
    expect(first?.consumed).toBe(true);
    expect(() => findPath(f.graph, f.cell(3, 3), goal, 'npc', 30, first ?? undefined)).toThrow();
  });

  it('4000 노드보다 큰 막힌 영역도 세션을 이어서 탐색해 NO_PATH 로 종료한다', () => {
    const f = navFixture(96, 8);
    // 80 × 80 = 6400 칸 영역을 흙 벽으로 닫는다
    for (let i = 0; i <= 81; i++) {
      for (const [x, z] of [
        [i, 0],
        [i, 81],
        [0, i],
        [81, i],
      ] as const) {
        f.world.setBlock(x, FEET_Y, z, BlockId.dirt, 'player');
        f.world.setBlock(x, FEET_Y + 1, z, BlockId.dirt, 'player');
      }
    }
    const goal = { kind: 'cell' as const, pos: f.cell(90, 90) };
    let r = findPath(f.graph, f.cell(40, 40), goal, 'npc', 4000);
    let calls = 1;
    while (r.reason === 'NODE_LIMIT' && r.continuation) {
      r = findPath(f.graph, f.cell(40, 40), goal, 'npc', 4000, r.continuation);
      calls += 1;
    }
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(r.reason).toBe('NO_PATH');
  });

  it('반경 목표는 고체 종이 아니라 반경 안의 통행 가능한 셀에서 성공한다', () => {
    const f = navFixture();
    f.put(15, FEET_Y, 15, BlockId.bell);
    const center = { x: 15.5, y: FEET_Y, z: 15.5 };
    const cellGoal = findPath(
      f.graph,
      f.cell(2, 2),
      { kind: 'cell', pos: f.cell(15, 15) },
      'npc',
      4000,
    );
    expect(cellGoal.reason).toBe('NO_PATH');
    const r = findPath(f.graph, f.cell(2, 2), { kind: 'radius', center, radius: 2 }, 'npc', 4000);
    expect(r.path).not.toBeNull();
    const end = r.path?.at(-1) as BlockPos;
    expect(f.graph.isStandable(end, 'npc')).toBe(true);
    expect(Math.hypot(end.x + 0.5 - center.x, end.z + 0.5 - center.z)).toBeLessThanOrEqual(2);
  });

  it('64 칸 거리 탐색이 5ms 이하다', () => {
    const f = navFixture(80);
    const goal = { kind: 'cell' as const, pos: f.cell(70, 70) };
    // 캐시 없이 처음 탐색하는 경우와 같은 조건으로 여러 번 재어 중앙값을 본다
    const times: number[] = [];
    for (let i = 0; i < 7; i++) {
      f.graph.clear();
      const t0 = performance.now();
      const r = findPath(f.graph, f.cell(6, 6), goal, 'npc', 4000);
      times.push(performance.now() - t0);
      expect(r.path).not.toBeNull();
    }
    times.sort((a, b) => a - b);
    expect(times[3]).toBeLessThanOrEqual(5);
  });
});

describe('PathScheduler (TASK-025)', () => {
  it('여러 NPC 요청이 4000 확장 예산을 공유하고 대기 요청이 굶지 않는다', () => {
    const f = navFixture(96, 8);
    const s = new PathScheduler(f.graph, 4000);
    const far = Array.from({ length: 6 }, (_, i) =>
      s.request(f.cell(1, 1 + i), { kind: 'cell', pos: f.cell(94, 94 - i) }, 'npc'),
    );
    const near = s.request(f.cell(10, 10), { kind: 'cell', pos: f.cell(12, 10) }, 'npc');
    s.update();
    expect(s.stats.lastFrameNodes).toBeLessThanOrEqual(4000);
    expect(near.status).toBe('done');
    let frames = 1;
    while (far.some((r) => r.status === 'pending') && frames < 200) {
      s.update();
      expect(s.stats.lastFrameNodes).toBeLessThanOrEqual(4000);
      frames += 1;
    }
    expect(far.every((r) => r.status === 'done' && r.result?.path)).toBe(true);
    // 먼저 들어온 요청만 계속 받지 않았다: 모든 요청이 첫 프레임부터 확장을 받았다
    expect(Math.min(...far.map((r) => r.explored))).toBeGreaterThan(0);
  });

  it('진행 중 세션이 읽은 범위가 바뀌면 처음부터 다시 하고, 먼 변경은 무시한다', () => {
    const f = navFixture(96, 8);
    const s = new PathScheduler(f.graph, 30);
    const req = s.request(f.cell(2, 2), { kind: 'cell', pos: f.cell(90, 90) }, 'npc');
    s.update();
    expect(req.status).toBe('pending');
    f.put(93, FEET_Y, 2, BlockId.plank); // 탐색 범위 밖
    s.update();
    expect(req.restarts).toBe(0);
    f.put(3, FEET_Y, 3, BlockId.plank); // 탐색 범위 안
    s.update();
    expect(req.restarts).toBe(1);
    s.cancel(req);
    expect(req.status).toBe('cancelled');
    expect(s.stats.pending).toBe(0);
  });
});
