import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { EventBus, type GameEventMap } from '../src/game/EventBus';
import { GameWorld } from '../src/game/GameWorld';
import {
  dayOf,
  formatClock,
  GameClockSystem,
  latestBoundaryDay,
  minuteOfDayOf,
  nextOccurrence,
  phaseAt,
} from '../src/game/systems/GameClockSystem';
import {
  bodyOverlapsCell,
  QuarryRespawnSystem,
  type QuarryRespawnDeps,
} from '../src/game/systems/QuarryRespawnSystem';
import type { AabbBody, BlockPos, DayPhase } from '../src/game/types';
import { standCellToWorldFeet } from '../src/game/voxel/coords';
import { VoxelWorld } from '../src/game/voxel/VoxelWorld';

/** 게임 시각 hh:mm 까지 걸리는 실초(1× 기준). */
function realSeconds(gameMinutes: number): number {
  return (gameMinutes / 60) * balance.clock.secondsPerGameHour;
}

/** 시계와 발행된 시간대 목록. */
function clockWithLog(start = 0): { clock: GameClockSystem; phases: DayPhase[] } {
  const events = new EventBus();
  const phases: DayPhase[] = [];
  events.on('DAY_PHASE_CHANGED', (p) => void phases.push(p.phase));
  return { clock: new GameClockSystem(events, start), phases };
}

/** 프레임 dt 로 total 실초만큼 진행한다. */
function run(clock: GameClockSystem, totalSeconds: number, dt = 0.1): void {
  const steps = Math.round(totalSeconds / dt);
  for (let i = 0; i < steps; i++) clock.update(dt);
}

describe('GameClockSystem (TASK-023, MVP_SPEC 20)', () => {
  it('1 게임일이 실시간 600 초다', () => {
    const { clock } = clockWithLog();
    run(clock, 600);
    expect(clock.gameMinutes).toBeCloseTo(1440, 6);
    expect(clock.day).toBe(2);
    expect(clock.minuteOfDay).toBeCloseTo(7 * 60, 6);
  });

  it('gameMinutes 단일 누적값에서 날·시각을 파생한다 (0 = Day 1 07:00)', () => {
    expect(dayOf(0)).toBe(1);
    expect(minuteOfDayOf(0)).toBe(420);
    expect(dayOf(17 * 60 - 1)).toBe(1); // Day 1 23:59
    expect(dayOf(17 * 60)).toBe(2); // Day 2 00:00
    expect(formatClock(13 * 60 + 30)).toBe('Day 1 20:30');
    const { clock } = clockWithLog();
    expect(Object.keys(clock).some((k) => /day|hour/i.test(k))).toBe(false);
  });

  it('DayPhase 가 MVP_SPEC 20.1 대로다', () => {
    const at = (h: number, m = 0): DayPhase => phaseAt(h * 60 + m);
    expect(at(4, 59)).toBe('night');
    expect(at(5)).toBe('dawn');
    expect(at(6, 59)).toBe('dawn');
    expect(at(7)).toBe('morning');
    expect(at(12)).toBe('noon');
    expect(at(13)).toBe('afternoon');
    expect(at(18)).toBe('evening');
    expect(at(19, 59)).toBe('evening');
    expect(at(20)).toBe('night');
    expect(at(0)).toBe('night');
  });

  it('하루를 돌면 전이할 때만 DAY_PHASE_CHANGED 를 순서대로 한 번씩 발행한다', () => {
    const { clock, phases } = clockWithLog();
    expect(clock.phase).toBe('morning');
    run(clock, 600);
    expect(phases).toEqual(['noon', 'afternoon', 'evening', 'night', 'dawn', 'morning']);
  });

  it('디버그 배속 1× / 4× / 16× 만 허용하고 진행량이 배수로 바뀐다', () => {
    const { clock } = clockWithLog();
    expect(clock.setTimeScale(4)).toBe(true);
    run(clock, 25);
    expect(clock.gameMinutes).toBeCloseTo(240, 6);
    expect(clock.setTimeScale(16)).toBe(true);
    run(clock, 25);
    expect(clock.gameMinutes).toBeCloseTo(240 + 960, 6);
    expect(clock.setTimeScale(2)).toBe(false);
    expect(clock.timeScale).toBe(16);
  });

  it('시각 강제 설정은 다음 도래로만 앞당기고 최종 시간대를 한 번 발행한다 (20.3)', () => {
    const { clock, phases } = clockWithLog();
    clock.advanceTo(20);
    expect(formatClock(clock.gameMinutes)).toBe('Day 1 20:00');
    expect(phases).toEqual(['night']);
    clock.advanceTo(19);
    expect(formatClock(clock.gameMinutes)).toBe('Day 2 19:00');
    expect(phases).toEqual(['night', 'evening']);
    expect(nextOccurrence(0, 7)).toBe(1440);
  });

  it('최근 경계 day 는 경계 시각을 넘는 순간 바뀐다', () => {
    const at = (day: number, h: number, m = 0): number => (day - 1) * 1440 + h * 60 + m - 420;
    expect(latestBoundaryDay(at(1, 7), 5)).toBe(1);
    expect(latestBoundaryDay(at(2, 4, 59), 5)).toBe(1);
    expect(latestBoundaryDay(at(2, 5), 5)).toBe(2);
    // nightId: 자정 뒤에도 전날 20:00 의 day
    expect(latestBoundaryDay(at(1, 20), 20)).toBe(1);
    expect(latestBoundaryDay(at(2, 3), 20)).toBe(1);
  });
});

/** 5 × 1 × 1 줄의 후보 칸과 바닥이 있는 작은 월드. */
function quarryFixture(): {
  voxels: VoxelWorld;
  clock: GameClockSystem;
  bodies: AabbBody[];
  candidates: BlockPos[];
  system: QuarryRespawnSystem;
  changes: GameEventMap['BLOCK_CHANGED'][];
} {
  const events = new EventBus();
  const voxels = new VoxelWorld({ sizeX: 16, sizeY: 8, sizeZ: 16 }, events);
  for (let x = 0; x < 16; x++)
    for (let z = 0; z < 16; z++) voxels.writeInitial(x, 0, z, BlockId.stone);
  const candidates: BlockPos[] = [];
  for (let x = 0; x < 12; x++) candidates.push({ x, y: 1, z: 5 });
  const clock = new GameClockSystem(events);
  const bodies: AabbBody[] = [];
  const deps: QuarryRespawnDeps = { voxels, clock, candidates, bodies: () => bodies };
  const changes: GameEventMap['BLOCK_CHANGED'][] = [];
  events.on('BLOCK_CHANGED', (c) => void changes.push(c));
  return { voxels, clock, bodies, candidates, system: new QuarryRespawnSystem(deps), changes };
}

/** 시계를 dt 로 진행하며 매 프레임 채석장 시스템을 돌린다(GameWorld 슬롯 순서와 같다). */
function tick(f: ReturnType<typeof quarryFixture>, seconds: number, dt = 0.1): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    f.clock.update(dt);
    f.system.update();
  }
}

describe('QuarryRespawnSystem (READY-04, MVP_SPEC 14.3)', () => {
  it('시작 시각(Day 1 07:00)에는 처리하지 않고 Day 2 05:00 경계에서 한 번 8 칸 복구한다', () => {
    const f = quarryFixture();
    tick(f, realSeconds(22 * 60 - 1)); // Day 2 04:59
    expect(f.changes).toHaveLength(0);
    tick(f, realSeconds(2));
    expect(f.changes).toHaveLength(8);
    expect(f.system.respawnedThroughDay).toBe(2);
    expect(f.changes.every((c) => c.by === 'world' && c.to === BlockId.stone)).toBe(true);
    expect(f.changes.map((c) => c.pos.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // 같은 날 다시 채석장을 비워도 다음 05:00 전에는 처리하지 않는다
    for (let x = 0; x < 8; x++) f.voxels.setBlock(x, 1, 5, BlockId.air, 'player');
    f.changes.length = 0;
    tick(f, realSeconds(23 * 60));
    expect(f.changes).toHaveLength(0);
    tick(f, realSeconds(61));
    expect(f.changes).toHaveLength(8);
  });

  it('16× 배속으로 경계를 넘어도 한 번만 처리한다', () => {
    const f = quarryFixture();
    f.clock.setTimeScale(16);
    tick(f, realSeconds(24 * 60) / 16);
    expect(f.changes).toHaveLength(8);
    expect(f.system.lastRestored).toBe(8);
  });

  it('강제 설정으로 여러 날의 경계를 한 번에 넘어도 한 번이며 보충하지 않는다', () => {
    const f = quarryFixture();
    f.clock.advanceTo(4);
    f.clock.advanceTo(4); // Day 3 04:00 — 아직 처리 전
    f.clock.advanceTo(6); // Day 3 06:00 — 경계 둘(Day 2, 3)을 넘었다
    f.system.update();
    expect(f.changes).toHaveLength(8);
    expect(f.system.respawnedThroughDay).toBe(3);
    f.system.update();
    expect(f.changes).toHaveLength(8);
  });

  it('후보가 모자라면 있는 만큼만 복구한다', () => {
    const f = quarryFixture();
    for (let x = 3; x < 12; x++) f.voxels.setBlock(x, 1, 5, BlockId.stone, 'player');
    f.changes.length = 0;
    f.clock.advanceTo(5);
    f.system.update();
    expect(f.changes.map((c) => c.pos.x)).toEqual([0, 1, 2]);
  });

  it('캐릭터가 선 후보 칸은 건너뛰고 뒤의 후보로 채운다', () => {
    const f = quarryFixture();
    f.bodies.push({
      pos: standCellToWorldFeet({ x: 2, y: 1, z: 5 }),
      velocity: { x: 0, y: 0, z: 0 },
      width: 0.6,
      height: 1.8,
      onGround: true,
    });
    f.clock.advanceTo(5);
    f.system.update();
    expect(f.changes.map((c) => c.pos.x)).toEqual([0, 1, 3, 4, 5, 6, 7, 8]);
  });

  it('AABB 겹침은 면에 닿기만 한 칸을 포함하지 않는다', () => {
    const body: AabbBody = {
      pos: { x: 2.5, y: 1, z: 5.5 },
      velocity: { x: 0, y: 0, z: 0 },
      width: 0.6,
      height: 1.8,
      onGround: true,
    };
    expect(bodyOverlapsCell(body, { x: 2, y: 1, z: 5 })).toBe(true);
    expect(bodyOverlapsCell(body, { x: 2, y: 2, z: 5 })).toBe(true);
    expect(bodyOverlapsCell(body, { x: 2, y: 0, z: 5 })).toBe(false);
    expect(bodyOverlapsCell(body, { x: 3, y: 1, z: 5 })).toBe(false);
  });

  it('snapshot / restore 뒤 같은 날을 다시 처리하지 않는다', () => {
    const f = quarryFixture();
    f.clock.advanceTo(6);
    f.system.update();
    const saved = f.system.snapshot();
    expect(saved).toEqual({ respawnedThroughDay: 2 });
    // 저장 뒤 로드: 같은 시각의 새 시계·시스템
    const g = quarryFixture();
    g.clock.restore(f.clock.gameMinutes);
    const restored = new QuarryRespawnSystem({
      voxels: g.voxels,
      clock: g.clock,
      candidates: g.candidates,
      bodies: () => [],
    });
    restored.restore(saved);
    restored.update();
    expect(g.changes).toHaveLength(0);
    // 필드가 없는 저장은 현재 시각의 최근 경계로 둔다
    restored.restore(null);
    restored.update();
    expect(g.changes).toHaveLength(0);
    // 05:00 전에 저장된 키라면 로드 뒤 첫 update 에서 한 번 처리한다
    restored.restore({ respawnedThroughDay: 1 });
    restored.update();
    restored.update();
    expect(g.changes).toHaveLength(8);
  });

  it('GameWorld 에서 시계는 1 번, 채석장은 4 번 슬롯에서 돈다', () => {
    const world = new GameWorld({
      storage: balance.storage,
      worldSize: { sizeX: 16, sizeY: 8, sizeZ: 16 },
      quarryCandidates: [{ x: 1, y: 1, z: 1 }],
    });
    world.voxels.writeInitial(1, 0, 1, BlockId.stone);
    world.clock.advanceTo(4, 59);
    world.update(realSeconds(2) / 1);
    expect(world.voxels.getBlock(1, 1, 1)).toBe(BlockId.stone);
    expect(world.quarry.respawnedThroughDay).toBe(2);
  });
});
