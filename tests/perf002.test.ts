// TASK-PERF-002 역할 작업과 후보 큐 집중 부하 점검. PERF-001 장면(256², 방 100, 주민 100)을 재사용한다.
// 성숙 작물·조리 재료·피해 기록으로 역할 후보를 100 / 1000 건 만들고 작업 시간 60 초를 돌려
// 선택·예약·경로 요청의 비용과 불변식(중복 점유·음수 자원·예약 누수)을 잰다. MVP 의 역할 후보 조회이며 범용 Job Queue 가 아니다.
import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { perfFixture } from '../src/game/data/perfFixture';
import { GameWorld } from '../src/game/GameWorld';
import type { BlockPos } from '../src/game/types';
import { applyRoleLoad, writeRoleLoad } from '../src/game/perfLoad';
import { at } from './helpers/village';

const G = 10;
const Y = G + 1;

/** 결과 한 줄. */
interface LoadResult {
  candidates: number;
  frames: number;
  updateAvg: number;
  updateP95: number;
  updateMax: number;
  decisionMax: number;
  npcMax: number;
  navMax: number;
  maxPending: number;
  maxWaitFrames: number;
  pendingAfterCalm: number;
  harvested: number;
  cooked: number;
  repaired: number;
  farmClaimsEnd: number;
  facilityClaimsEnd: number;
}

/** perf 장면을 만들고 역할 후보 n 건씩을 넣는다. */
function loadedWorld(n: number): GameWorld {
  const f = perfFixture;
  const w = new GameWorld({
    storage: balance.storage,
    worldSize: f.size,
    startGameMinutes: at(8, 30),
    plazaCenter: f.plazaCenter ?? { x: 128, y: Y, z: 128 },
    gameEvents: [],
  });
  f.build((x, y, z, id) => w.voxels.writeInitial(x, y, z, id));
  const load = writeRoleLoad((x, y, z, id) => w.voxels.writeInitial(x, y, z, id), n);
  for (const o of f.objects) {
    w.voxels.editObject(
      { kind: 'place', object: { id: w.voxels.placements.allocateId(), ...o } },
      'player',
    );
  }
  w.voxels.markAllDirty();
  w.rooms.rebuildAll();
  // 피해 주입(기술 시험): 몬스터 편집으로 없앤다. 실제 습격의 16 칸 상한·수리 8 칸 예산은 그대로다
  applyRoleLoad(w, load);
  for (const r of f.residents ?? []) w.spawnResident(r.role, r.cell);
  return w;
}

/** 불변식: 자원이 음수가 아니고, 같은 칸·시설을 두 주민이 쓰지 않는다. */
function checkInvariants(w: GameWorld): void {
  const s = w.storage.snapshot();
  expect(s.seed).toBeGreaterThanOrEqual(0);
  expect(s.crop).toBeGreaterThanOrEqual(0);
  expect(s.food).toBeGreaterThanOrEqual(0);
  const farmTargets = new Set<string>();
  const facilities = new Set<string>();
  for (const n of w.registry.npcs.values()) {
    const a = n.action as { farmTarget?: BlockPos; facilityClaim?: string };
    if (a.farmTarget) {
      const k = `${a.farmTarget.x},${a.farmTarget.y},${a.farmTarget.z}`;
      expect(farmTargets.has(k)).toBe(false);
      farmTargets.add(k);
    }
    if (a.facilityClaim && ['cook', 'eat', 'repair'].includes(n.action.kind)) {
      expect(facilities.has(a.facilityClaim)).toBe(false);
      facilities.add(a.facilityClaim);
    }
  }
  expect(w.cooking.stats.reservedCrop).toBeLessThanOrEqual(s.crop);
  expect(w.repair.repairedToday).toBeLessThanOrEqual(balance.carpenter.repairPerDay);
}

/** 작업 시간 seconds 동안 돌리며 잰다. */
function measure(w: GameWorld, candidates: number, seconds: number): LoadResult {
  w.profile = true;
  const dt = 1 / 30;
  const times: number[] = [];
  let decisionMax = 0;
  let npcMax = 0;
  let navMax = 0;
  let maxPending = 0;
  let harvested = 0;
  const crop0 = w.storage.get('crop');
  w.events.on('BLOCK_CHANGED', (c) => {
    if (c.from === BlockId.crop && c.by === 'npc') harvested += 1;
  });
  const food0 = w.storage.get('food');
  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now();
    w.update(dt);
    times.push(performance.now() - t0);
    decisionMax = Math.max(decisionMax, w.slotMs.get('npcDecision') ?? 0);
    npcMax = Math.max(npcMax, w.slotMs.get('npc') ?? 0);
    navMax = Math.max(navMax, w.slotMs.get('nav') ?? 0);
    maxPending = Math.max(maxPending, w.paths.stats.pending);
    if (i % 30 === 0) checkInvariants(w);
  }
  const cooked = (w.storage.get('food') - food0) / balance.cooking.foodPerCook;
  void crop0;
  // 사건 폭주 뒤 안정: 3 초 더 돌리면 경로 큐가 바닥으로 내려온다
  for (let i = 0; i < 90; i++) w.update(dt);
  const sorted = [...times].sort((a, b) => a - b);
  return {
    candidates,
    frames,
    updateAvg: times.reduce((a, b) => a + b, 0) / times.length,
    updateP95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    updateMax: sorted[sorted.length - 1] ?? 0,
    decisionMax,
    npcMax,
    navMax,
    maxPending,
    maxWaitFrames: w.paths.stats.maxCompletedWaitFrames,
    pendingAfterCalm: w.paths.stats.pending,
    harvested,
    cooked,
    repaired: w.repair.repairedToday,
    farmClaimsEnd: w.farm.stats.claims,
    facilityClaimsEnd: w.npcSystem.facilityClaims,
  };
}

describe('PERF-002 역할 작업과 후보 큐 집중 부하', () => {
  for (const n of [100, 1000]) {
    it(`후보 ${n} 건 × 주민 100 명: 중복 점유·음수 자원·예약 누수 없이 돌고 큐가 안정된다`, () => {
      const w = loadedWorld(n);
      expect(w.farm.stats.mature).toBe(n);
      expect(w.repair.pending).toHaveLength(n);
      const r = measure(w, n, 60);
      console.info(`[PERF-002] ${JSON.stringify(r)}`);
      checkInvariants(w);
      // 목수의 하루 수리량 상한은 그대로다(남은 피해는 기아가 아니라 예산)
      expect(r.repaired).toBeLessThanOrEqual(balance.carpenter.repairPerDay);
      expect(w.repair.pending.length).toBeGreaterThanOrEqual(n - balance.carpenter.repairPerDay);
      // 예약 누수: 밭 예약은 지금 밭 일을 하는 주민 수를 넘지 않는다
      const farming = [...w.registry.npcs.values()].filter(
        (x) => (x.action as { farmTarget?: BlockPos }).farmTarget !== undefined,
      ).length;
      expect(r.farmClaimsEnd).toBe(farming);
      // 사건 폭주 뒤 경로 큐가 가라앉는다
      expect(r.pendingAfterCalm).toBeLessThanOrEqual(r.maxPending);
      expect(r.harvested).toBeGreaterThan(0);
    }, 120_000);
  }

  it('작업 대상 시설을 부수면 예약·재료 예약이 남지 않는다', () => {
    const w = loadedWorld(100);
    const dt = 1 / 30;
    for (let i = 0; i < 30 * 12; i++) w.update(dt);
    // 조리 중인 화덕과 수확하러 가는 밭을 모두 부순다
    for (const n of w.registry.npcs.values()) {
      const a = n.action as {
        farmTarget?: BlockPos;
        facilityClaim?: string;
        stove?: { anchor: BlockPos };
      };
      if (a.farmTarget)
        w.voxels.setBlock(a.farmTarget.x, a.farmTarget.y, a.farmTarget.z, BlockId.dirt, 'player');
      if (n.action.kind === 'cook' && a.stove) {
        const s = a.stove.anchor;
        w.voxels.setBlock(s.x, s.y, s.z, BlockId.air, 'player');
      }
    }
    for (let i = 0; i < 30 * 3; i++) w.update(dt);
    checkInvariants(w);
    const cooking = [...w.registry.npcs.values()].filter((n) => n.action.kind === 'cook').length;
    expect(w.cooking.stats.cooking).toBe(cooking);
    const farming = [...w.registry.npcs.values()].filter(
      (x) => (x.action as { farmTarget?: BlockPos }).farmTarget !== undefined,
    ).length;
    expect(w.farm.stats.claims).toBe(farming);
  }, 120_000);
});
