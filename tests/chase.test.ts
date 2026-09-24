import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { createMonster, type Monster } from '../src/game/entities/Monster';
import { GameWorld } from '../src/game/GameWorld';
import type { PathRequest } from '../src/game/nav/PathScheduler';
import { PathScheduler } from '../src/game/nav/PathScheduler';
import type { BlockPos } from '../src/game/types';
import { at, run, Y } from './helpers/village';

const M = balance.monster;
const BELL: BlockPos = { x: 20, y: Y, z: 20 };

/** 종이 가운데 있는 40 × 40 평지. 플레이어는 모든 몬스터의 추적 반경 밖 구석에 둔다. */
function field(): GameWorld {
  const w = new GameWorld({
    storage: balance.storage,
    worldSize: { sizeX: 40, sizeY: 10, sizeZ: 40 },
    startGameMinutes: at(22),
    playerSpawn: { x: 1, y: Y, z: 1 },
    plazaCenter: BELL,
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

/** (cx, cz) 한 칸을 둘러싸는 돌 상자(벽 두 칸 + 지붕). 몬스터는 돌을 부수지 않으므로 안은 닿을 수 없다. */
function sealCell(w: GameWorld, cx: number, cz: number): void {
  for (let x = cx - 1; x <= cx + 1; x++)
    for (let z = cz - 1; z <= cz + 1; z++) {
      w.voxels.writeInitial(x, Y + 2, z, BlockId.stone);
      if (x === cx && z === cz) continue;
      w.voxels.writeInitial(x, Y, z, BlockId.stone);
      w.voxels.writeInitial(x, Y + 1, z, BlockId.stone);
    }
  w.rooms.rebuildAll();
}

/** 종 둘레 반지름 r 의 닫힌 돌 고리 벽(높이 2). */
function ring(w: GameWorld, r: number): void {
  for (let x = BELL.x - r; x <= BELL.x + r; x++)
    for (let z = BELL.z - r; z <= BELL.z + r; z++) {
      if (Math.abs(x - BELL.x) !== r && Math.abs(z - BELL.z) !== r) continue;
      w.voxels.writeInitial(x, Y, z, BlockId.stone);
      w.voxels.writeInitial(x, Y + 1, z, BlockId.stone);
    }
  w.rooms.rebuildAll();
}

/** 몬스터를 세운다. */
function monster(w: GameWorld, x: number, z: number, id: string): Monster {
  const m = createMonster(id, 1, { x: 0, y: Y, z: 0 });
  m.body.pos = { x, y: Y, z };
  w.registry.monsters.add(m);
  return m;
}

/** 몬스터가 낸 경로 요청을 모두 모은다. */
function recordRequests(w: GameWorld): PathRequest[] {
  const seen: PathRequest[] = [];
  const original = w.paths.request.bind(w.paths);
  w.paths.request = (from, goal, actor, options) => {
    const r = original(from, goal, actor, options);
    if (actor === 'monster') seen.push(r);
    return r;
  };
  return seen;
}

describe('몬스터 추적 재탐색 비용 (TASK-PERF-003, MVP_SPEC 24.3 의 5)', () => {
  it('요청의 누적 확장 상한: 넘으면 continuation 없는 NODE_LIMIT 으로 끝난다', () => {
    const w = field();
    const s = new PathScheduler(w.nav, 100);
    const req = s.request(
      { x: 2, y: Y, z: 2 },
      { kind: 'cell', pos: { x: 38, y: Y + 5, z: 38 } },
      'monster',
      { maxNodes: 250 },
    );
    for (let i = 0; i < 10 && req.status === 'pending'; i++) s.update();
    expect(req.status).toBe('done');
    expect(req.result?.path).toBeNull();
    expect(req.result?.reason).toBe('NODE_LIMIT');
    expect(req.result?.continuation).toBeNull();
    expect(req.explored).toBe(250);
  });

  it('닿을 수 없는 주민을 두고 몬스터 다섯이 60 초 있어도 요청마다 chaseMaxNodes 이하이고, 포기한 대상은 잠시 다시 찾지 않는다', () => {
    const w = field();
    sealCell(w, 20, 27);
    w.spawnResident('farmer', { x: 20, y: Y, z: 27 });
    const requests = recordRequests(w);
    const ms = [0, 1, 2, 3, 4].map((i) => monster(w, 18.5 + i, 21.5, `m${i}`));
    run(w, 60);
    const chase = requests.filter((r) => r.goal.kind === 'cell');
    expect(chase.length).toBeGreaterThan(0);
    for (const r of chase) expect(r.explored).toBeLessThanOrEqual(M.chaseMaxNodes);
    // 1 초마다 다시 찾던 이전 방식이면 몬스터당 60 번이다. 포기(3 초) 뒤에만 다시 찾으므로 한 몬스터당 60 / 3 + 여유 이하
    const perMonster = Math.ceil(60 / M.chaseRetrySeconds) + 2;
    expect(chase.length).toBeLessThanOrEqual(ms.length * perMonster);
    // 종 옆의 몬스터는 추적을 포기하면 서서 기다린다
    for (const m of ms) expect(['idle', 'move']).toContain(m.action.kind);
  });

  it('더 가까운 대상에 닿을 수 없으면 반경 안의 다른 대상을 쫓아가 때린다', () => {
    const w = field();
    sealCell(w, 20, 24);
    w.spawnResident('farmer', { x: 20, y: Y, z: 24 });
    const open = w.spawnResident('cook', { x: 29, y: Y, z: 20 });
    const m = monster(w, 20.5, 21.5, 'm1');
    run(w, 20, () => open.health < balance.npc.maxHealth);
    expect(open.health).toBeLessThan(balance.npc.maxHealth);
    expect(m.body.pos.x).toBeGreaterThan(25);
  });

  it('배회하던 몬스터는 닿을 수 없는 대상을 포기하면 배회로 돌아간다', () => {
    const w = field();
    ring(w, 8);
    sealCell(w, 6, 20);
    w.spawnResident('farmer', { x: 6, y: Y, z: 20 });
    const m = monster(w, 4.5, 26.5, 'm1');
    const kinds = new Set<string>();
    let wanderAfterChase = false;
    let chased = false;
    const step = 1 / 30;
    for (let t = 0; t < 20; t += step) {
      w.update(step);
      kinds.add(m.action.kind);
      if (m.action.kind === 'move') chased = true;
      if (chased && m.action.kind === 'wander') wanderAfterChase = true;
    }
    expect(chased).toBe(true);
    expect(wanderAfterChase).toBe(true);
    expect(w.raids.active?.destroyedCells ?? 0).toBe(0);
  });
});
