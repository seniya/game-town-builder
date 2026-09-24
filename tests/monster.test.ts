import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import type { Monster } from '../src/game/entities/Monster';
import { GameWorld } from '../src/game/GameWorld';
import { PathScheduler } from '../src/game/nav/PathScheduler';
import { MonsterSystem } from '../src/game/systems/MonsterSystem';
import type { BlockPos } from '../src/game/types';
import { at, placeObject, run, Y } from './helpers/village';

const BELL: BlockPos = { x: 20, y: Y, z: 20 };
/** 고리 벽 반지름. 목표 반경 6 바깥이어야 벽을 넘어야 닿는다 */
const R = 8;

/** 종이 가운데 있는 40 × 40 평지. 몬스터 스폰 칸은 (4, Y, 20). */
function field(spawn: BlockPos = { x: 4, y: Y, z: 20 }): GameWorld {
  const w = new GameWorld({
    storage: balance.storage,
    worldSize: { sizeX: 40, sizeY: 10, sizeZ: 40 },
    startGameMinutes: at(20, 55),
    plazaCenter: BELL,
    monsterSpawns: [spawn],
    gameEvents: [],
  });
  for (let x = 0; x < 40; x++)
    for (let z = 0; z < 40; z++) {
      w.voxels.writeInitial(x, 0, z, BlockId.bedrock);
      w.voxels.writeInitial(x, 1, z, BlockId.grass);
    }
  w.voxels.writeInitial(BELL.x, BELL.y, BELL.z, BlockId.bell);
  w.rooms.rebuildAll();
  return w;
}

/** 종 둘레 반지름 r 의 정사각 고리 벽(높이 h). gap 칸은 비운다. */
function ring(w: GameWorld, r: number, id: number, h = 2, gap: BlockPos | null = null): void {
  for (let x = BELL.x - r; x <= BELL.x + r; x++)
    for (let z = BELL.z - r; z <= BELL.z + r; z++) {
      const edge = Math.abs(x - BELL.x) === r || Math.abs(z - BELL.z) === r;
      if (!edge || (gap && gap.x === x && gap.z === z)) continue;
      for (let k = 0; k < h; k++) w.voxels.writeInitial(x, Y + k, z, id);
    }
  w.rooms.rebuildAll();
}

/** 레벨 2 로 두고 21:00 습격을 시작한다. 한 마리만 남긴다. */
function raid(w: GameWorld): Monster {
  w.village.restore(2);
  run(w, 0.1);
  w.clock.advanceTo(21, 0);
  run(w, 1 / 30);
  const all = [...w.registry.monsters.values()];
  for (const m of all.slice(1)) w.registry.monsters.remove(m.id);
  const m = all[0];
  if (!m) throw new Error('몬스터 없음');
  return m;
}

/** 종까지 수평 거리. */
function toBell(m: Monster): number {
  return Math.hypot(m.body.pos.x - (BELL.x + 0.5), m.body.pos.z - (BELL.z + 0.5));
}

describe('몬스터 AI 와 블록 파괴 (TASK-045, MVP_SPEC 24.3)', () => {
  it('열린 마을에서는 종까지 걸어와 반경 6 안에서 "도달" 로 기록된다. 종은 부서지지 않는다', () => {
    const w = field();
    const m = raid(w);
    run(w, 15, () => toBell(m) <= balance.monster.reachedRadius);
    expect(toBell(m)).toBeLessThanOrEqual(balance.monster.reachedRadius);
    run(w, 1);
    expect(w.raids.active?.reachedIds).toContain(m.id);
    run(w, 5);
    expect(w.voxels.getBlock(BELL.x, BELL.y, BELL.z)).toBe(BlockId.bell);
    expect(w.raids.active?.destroyedCells).toBe(0);
  });

  it('판자벽으로 막으면 벽 앞에서 멈추고 1.6 초에 부수며, 통행이 갱신되어 들어온다', () => {
    const w = field();
    ring(w, R, BlockId.plank);
    const m = raid(w);
    const changes: { pos: BlockPos; by: string; t: number }[] = [];
    let t = 0;
    w.events.on('BLOCK_CHANGED', (c) => changes.push({ pos: c.pos, by: c.by, t }));
    const step = 1 / 30;
    let firstBreakStart: number | null = null;
    for (; t < 40 && toBell(m) > balance.monster.reachedRadius; t += step) {
      w.update(step);
      if (m.action.kind === 'break' && firstBreakStart === null) firstBreakStart = t;
    }
    expect(firstBreakStart).not.toBeNull();
    const first = changes.find((c) => c.by === 'monster');
    expect(first).toBeDefined();
    // plank 0.8 × 2.0 = 1.6 초
    const took = (first?.t ?? 0) - (firstBreakStart ?? 0);
    expect(took).toBeGreaterThanOrEqual(1.6 - step * 2);
    expect(took).toBeLessThan(1.6 + step * 3);
    // 벽 앞(고리 바깥쪽 칸)에서 부쉈다
    expect(
      Math.max(Math.abs((first?.pos.x ?? 0) - BELL.x), Math.abs((first?.pos.z ?? 0) - BELL.z)),
    ).toBe(R);
    // 결국 벽 안(목표 반경)으로 들어왔다(두 칸 높이라 두 칸을 부순다)
    expect(toBell(m)).toBeLessThanOrEqual(balance.monster.reachedRadius);
    expect(w.raids.active?.destroyedCells).toBe(changes.filter((c) => c.by === 'monster').length);
    expect(w.raids.active?.destroyedCells).toBeLessThanOrEqual(
      balance.monster.maxDestroyedCellsPerRaid,
    );
  });

  it('흙·돌은 부수지 않는다: 틈이 있으면 우회하고, 완전히 막히면 배회한다', () => {
    const open = field();
    ring(open, R, BlockId.dirt, 2, { x: BELL.x + R, y: Y, z: BELL.z });
    const a = raid(open);
    run(open, 40, () => toBell(a) <= balance.monster.reachedRadius);
    expect(toBell(a)).toBeLessThanOrEqual(balance.monster.reachedRadius);
    expect(open.raids.active?.destroyedCells).toBe(0);

    const closed = field();
    ring(closed, R, BlockId.stone);
    const b = raid(closed);
    run(closed, 20);
    expect(closed.raids.active?.destroyedCells).toBe(0);
    expect(toBell(b)).toBeGreaterThan(R);
    expect(b.action.kind).toBe('wander');
  });

  it('두 칸 객체(문)는 통째로 부수고, 남은 예산보다 크면 부수지 않는다', () => {
    const w = field();
    // 판자 대신 돌벽에 문 하나: 부술 수 있는 것은 문뿐이다
    ring(w, R, BlockId.stone, 2, { x: BELL.x - R, y: Y, z: BELL.z });
    const doorId = placeObject(w, BlockId.door, { x: BELL.x - R, y: Y, z: BELL.z }, 'east');
    const m = raid(w);
    run(w, 25, () => !w.voxels.placements.get(doorId));
    expect(w.voxels.placements.get(doorId)).toBeUndefined();
    expect(w.raids.active?.destroyedCells).toBe(2);
    expect(w.voxels.getBlock(BELL.x - R, Y + 1, BELL.z)).toBe(BlockId.air);
    void m;

    // 예산이 1 칸만 남았으면 문을 부수지 않는다
    const tight = field();
    ring(tight, R, BlockId.stone, 2, { x: BELL.x - R, y: Y, z: BELL.z });
    const door2 = placeObject(tight, BlockId.door, { x: BELL.x - R, y: Y, z: BELL.z }, 'east');
    raid(tight);
    expect(tight.raids.spendDestroyCells(balance.monster.maxDestroyedCellsPerRaid - 1)).toBe(true);
    run(tight, 20);
    expect(tight.voxels.placements.get(door2)).toBeDefined();
  });

  it('벽에서 떨어져 스폰해도 벽 앞까지 걸어간 뒤 부순다', () => {
    const w = field({ x: 1, y: Y, z: 1 });
    ring(w, R, BlockId.plank);
    const m = raid(w);
    run(w, 40, () => m.action.kind === 'break');
    expect(m.action.kind).toBe('break');
    // 부수는 곳은 고리 벽 칸이고 몬스터는 그 바로 바깥에 있다
    const t = m.action.kind === 'break' ? m.action.target : null;
    expect(t && Math.max(Math.abs(t.x - BELL.x), Math.abs(t.z - BELL.z))).toBe(R);
    expect(t && Math.hypot(m.body.pos.x - (t.x + 0.5), m.body.pos.z - (t.z + 0.5))).toBeLessThan(
      1.6,
    );
  });

  it('탐색이 이어지는 중(NODE_LIMIT)에는 서서 기다리고 부수지 않는다', () => {
    const w = field();
    ring(w, R, BlockId.plank);
    const m = raid(w);
    // 프레임당 확장 예산 5 노드: 결과가 나오기까지 여러 프레임이 걸린다
    const paths = new PathScheduler(w.nav, 5);
    const sys = new MonsterSystem({
      monsters: () => [m],
      world: w.voxels,
      nav: w.nav,
      paths,
      bell: BELL,
      raid: w.raids,
    });
    const p0 = { ...m.body.pos };
    for (let i = 0; i < 20; i++) {
      sys.update(1 / 30);
      paths.update();
    }
    expect(m.action.kind).toBe('idle');
    expect(Math.hypot(m.body.pos.x - p0.x, m.body.pos.z - p0.z)).toBeLessThan(0.01);
    expect(w.raids.active?.destroyedCells).toBe(0);
  });

  it('Test 8-10·12~15 (MVP_SPEC 39): 몬스터가 부순 판자는 DamageLog 에 남고, 흙으로 완전히 막으면 배회하다 05:00 에 사라져 safetyLevel 100', () => {
    const w = field();
    ring(w, R, BlockId.plank);
    const m = raid(w);
    const broken: BlockPos[] = [];
    w.events.on('BLOCK_CHANGED', (c) => void (c.by === 'monster' && broken.push(c.pos)));
    run(w, 40, () => toBell(m) <= balance.monster.reachedRadius);
    expect(broken.length).toBeGreaterThan(0);
    const logged = w.repair.pending.flatMap((e) => e.cells);
    for (const p of broken) expect(logged).toContainEqual(p);

    const closed = field();
    ring(closed, R, BlockId.dirt);
    const b = raid(closed);
    run(closed, 20);
    expect(b.action.kind).toBe('wander');
    expect(closed.raids.active?.destroyedCells).toBe(0);
    closed.clock.advanceTo(5, 0);
    run(closed, 0.5);
    expect(closed.registry.monsters.size).toBe(0);
    expect(closed.raids.active).toBeNull();
    expect(closed.raids.snapshot().results.at(-1)?.reached).toBe(0);
    expect(closed.worldStateSystem.current.safetyLevel).toBe(100);
  });
});
