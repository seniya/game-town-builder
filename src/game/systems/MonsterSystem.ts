// 몬스터 AI (MVP_SPEC 24.2 / 24.3 / 24.4, ARCHITECTURE 4.1 의 9 번 / 18, ADR 015, TASK-045).
// 판단 순서: 종 반경 6 의 발 위치로 경로를 찾는다 → 있으면 걷는다 → 탐색이 이어지는 중(NODE_LIMIT)이면 서서 기다린다
// → NO_PATH 이면 도달 가능 경계의 파괴 후보(비지형·파괴 가능·예산 이하)로 걸어가 부순다 → 후보·예산이 없으면 배회한다.
// 종은 부수지 않는다(파괴 시간이 없다). 파괴는 VoxelWorld 편집 API 로 하며 두 칸 객체는 통째로 부순다. 습격당 16 칸까지다.
import { balance } from '../data/balance';
import { BlockId, getBlockDef } from '../data/blocks';
import type { Monster } from '../entities/Monster';
import type { SlotSystem } from '../GameWorld';
import { MovementController, standStill } from '../nav/MovementController';
import { pathWatchCells, type NavigationGraph } from '../nav/NavigationGraph';
import type { BoundaryObstacle, PathGoal } from '../nav/pathfind';
import type { PathRequest, PathScheduler } from '../nav/PathScheduler';
import type { BlockPos, Vec3 } from '../types';
import { objectCells } from '../voxel/PlacementIndex';
import type { VoxelWorld } from '../voxel/VoxelWorld';

const M = balance.monster;
/** 배회 중 다시 종을 향해 탐색하는 간격(실초). 막힌 벽이 열렸는지 본다 */
const RESEEK_SECONDS = 4;
/** 배회 반경(칸). */
const WANDER_RADIUS = 4;

/** MonsterSystem 이 읽고 쓰는 것. */
export interface MonsterDeps {
  readonly monsters: () => Iterable<Monster>;
  readonly world: VoxelWorld;
  readonly nav: NavigationGraph;
  readonly paths: PathScheduler;
  /** 종 칸. 없으면 몬스터가 움직이지 않는 시험 월드다 */
  readonly bell: BlockPos | null;
  readonly raid: {
    markReached(monsterId: string): void;
    readonly remainingDestroyCells: number;
    spendDestroyCells(cells: number): boolean;
  };
}

/** 몬스터 한 마리의 실행 상태. 저장하지 않는다(로드 뒤 다시 판단한다). */
interface Runtime {
  mode: 'seek' | 'approach' | 'break' | 'wander' | 'arrived';
  request: PathRequest | null;
  controller: MovementController;
  unwatch: (() => void) | null;
  target: BlockPos | null;
  /** 파괴 대상 블록 id(도중에 바뀌면 멈춘다) */
  targetId: number;
  progress: number;
  /** 배회 뒤 다시 탐색까지 남은 초 */
  reseek: number;
  wanderStep: number;
}

/** 두 좌표의 3 차원 거리. */
function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** 몬스터 판단·이동·파괴. */
export class MonsterSystem implements SlotSystem {
  private readonly runtime = new Map<string, Runtime>();

  /** 포트를 받는다. */
  constructor(private readonly deps: MonsterDeps) {}

  /** 종 중심(발밑 기준). 도달 판정과 목표 반경의 중심이다. */
  private get center(): Vec3 | null {
    const b = this.deps.bell;
    return b ? { x: b.x + 0.5, y: b.y, z: b.z + 0.5 } : null;
  }

  /** 9 번 슬롯: 몬스터마다 한 걸음 진행한다. 사라진 몬스터의 상태를 정리한다. */
  update(dt: number): void {
    const center = this.center;
    const seen = new Set<string>();
    for (const m of this.deps.monsters()) {
      seen.add(m.id);
      if (!center) {
        standStill(this.deps.world, m.body, dt);
        continue;
      }
      const rt = this.runtimeOf(m);
      if (dist(m.body.pos, center) <= M.reachedRadius) this.deps.raid.markReached(m.id);
      this.step(m, rt, center, dt);
    }
    for (const [id, rt] of this.runtime) {
      if (seen.has(id)) continue;
      this.release(rt);
      this.runtime.delete(id);
    }
  }

  /** 모드별 한 프레임. */
  private step(m: Monster, rt: Runtime, center: Vec3, dt: number): void {
    switch (rt.mode) {
      case 'seek':
        return this.seek(m, rt, center, dt);
      case 'approach':
        return this.follow(m, rt, dt, () => this.startBreak(m, rt));
      case 'break':
        return this.breaking(m, rt, dt);
      case 'wander':
        return this.wander(m, rt, dt);
      case 'arrived':
        standStill(this.deps.world, m.body, dt);
        m.action = { kind: 'idle' };
        return;
    }
  }

  /** 종 반경으로 경로를 찾는다. 결과가 오기 전(이어 탐색 포함)에는 서서 기다린다. */
  private seek(m: Monster, rt: Runtime, center: Vec3, dt: number): void {
    const goal: PathGoal = { kind: 'radius', center, radius: M.reachedRadius };
    if (!rt.request) {
      const from = this.startCell(m);
      if (!from) return this.toWander(m, rt);
      rt.request = this.deps.paths.request(from, goal, 'monster');
    }
    const req = rt.request;
    if (req.status === 'pending') {
      standStill(this.deps.world, m.body, dt);
      m.action = { kind: 'idle' };
      return;
    }
    rt.request = null;
    const r = req.result;
    if (r?.path) {
      this.setPath(rt, r.path);
      rt.mode = 'approach';
      rt.target = null;
      return;
    }
    // NO_PATH: 경계에서 부술 것을 고른다. NODE_LIMIT 은 스케줄러가 이어 가므로 여기에 오지 않는다
    const pick = this.pickBreakable(r?.reachableBoundary ?? [], center);
    if (!pick) return this.toWander(m, rt);
    rt.target = pick.obstacle;
    rt.targetId = this.deps.world.getBlock(pick.obstacle.x, pick.obstacle.y, pick.obstacle.z);
    this.setPath(rt, pick.path);
    rt.mode = 'approach';
  }

  /**
   * 파괴 후보를 고른다 (ARCHITECTURE 18.2): air·지형·파괴 불가(종)가 아니고, 두 칸 객체면 전체 점유 수가 남은 예산 이하.
   * 목표까지 거리 → 접근 경로 길이 → 좌표 순.
   */
  private pickBreakable(
    boundary: readonly BoundaryObstacle[],
    center: Vec3,
  ): BoundaryObstacle | null {
    const budget = this.deps.raid.remainingDestroyCells;
    let best: { o: BoundaryObstacle; d: number } | null = null;
    for (const o of boundary) {
      const p = o.obstacle;
      const id = this.deps.world.getBlock(p.x, p.y, p.z);
      const def = getBlockDef(id);
      if (id === BlockId.air || def.terrain || def.breakSeconds === null) continue;
      if (this.cellsOf(p) > budget) continue;
      const d = dist({ x: p.x + 0.5, y: p.y, z: p.z + 0.5 }, center);
      if (
        !best ||
        d < best.d - 1e-9 ||
        (Math.abs(d - best.d) < 1e-9 &&
          (o.path.length < best.o.path.length ||
            (o.path.length === best.o.path.length && key(p) < key(best.o.obstacle))))
      ) {
        best = { o, d };
      }
    }
    return best?.o ?? null;
  }

  /** 경로를 따라 걷는다. 끝나면 arrive, 경로 위 칸이 바뀌면 다시 탐색한다. */
  private follow(m: Monster, rt: Runtime, dt: number, arrive: () => void): void {
    const status = rt.controller.update(dt, m.body, M.moveSpeed);
    m.action = { kind: 'move', path: rt.controller.remaining };
    if (status === 'arrived') {
      this.stopWatching(rt);
      if (rt.target) arrive();
      else rt.mode = 'arrived';
      return;
    }
    if (rt.controller.takeRepath() || status === 'blocked') this.reseekNow(rt);
  }

  /** 벽 앞에 도착했다. 대상이 그대로면 부수기 시작한다. */
  private startBreak(m: Monster, rt: Runtime): void {
    const t = rt.target;
    if (!t || this.deps.world.getBlock(t.x, t.y, t.z) !== rt.targetId) return this.reseekNow(rt);
    rt.mode = 'break';
    rt.progress = 0;
    m.action = { kind: 'break', target: t, progress: 0 };
  }

  /** 부순다: breakSeconds × 2 가 지나면 예산을 쓰고 편집 API 로 없앤 뒤 다시 종을 향한다. */
  private breaking(m: Monster, rt: Runtime, dt: number): void {
    standStill(this.deps.world, m.body, dt);
    const t = rt.target;
    const w = this.deps.world;
    if (!t || w.getBlock(t.x, t.y, t.z) !== rt.targetId) return this.reseekNow(rt);
    const need = (getBlockDef(rt.targetId).breakSeconds ?? 0) * M.breakSpeedMultiplier;
    rt.progress += dt;
    m.action = { kind: 'break', target: t, progress: Math.min(1, rt.progress / need) };
    if (rt.progress < need) return;
    const cells = this.cellsOf(t);
    if (!this.deps.raid.spendDestroyCells(cells)) return this.toWander(m, rt);
    const obj = w.placements.objectAt(t);
    const ok = obj
      ? w.editObject({ kind: 'remove', objectId: obj.id }, 'monster')
      : w.setBlock(t.x, t.y, t.z, BlockId.air, 'monster');
    void ok;
    this.reseekNow(rt);
  }

  /** 배회: 가까운 설 수 있는 칸으로 조금씩 걷고, 간격마다 다시 종을 향해 탐색한다. */
  private wander(m: Monster, rt: Runtime, dt: number): void {
    rt.reseek -= dt;
    if (rt.reseek <= 0) return this.reseekNow(rt);
    m.action = { kind: 'wander' };
    const status = rt.controller.update(dt, m.body, M.moveSpeed * 0.5);
    if (status === 'moving') return;
    const from = this.startCell(m);
    if (!from) return;
    // 결정적인 배회: 몬스터 id 와 걸음 수로 방향을 고른다
    rt.wanderStep += 1;
    const h = hash(m.id, rt.wanderStep);
    const dx = (h % (WANDER_RADIUS * 2 + 1)) - WANDER_RADIUS;
    const dz = (Math.floor(h / 97) % (WANDER_RADIUS * 2 + 1)) - WANDER_RADIUS;
    const to = { x: from.x + dx, y: from.y, z: from.z + dz };
    if (this.deps.nav.isStandable(to, 'monster') && (dx !== 0 || dz !== 0)) {
      rt.controller.setPath([from, to]);
    }
  }

  /** 배회로 바꾼다. */
  private toWander(m: Monster, rt: Runtime): void {
    this.release(rt);
    rt.mode = 'wander';
    rt.reseek = RESEEK_SECONDS;
    rt.target = null;
    m.action = { kind: 'wander' };
  }

  /** 다시 종을 향해 탐색한다. */
  private reseekNow(rt: Runtime): void {
    this.release(rt);
    rt.mode = 'seek';
    rt.target = null;
    rt.progress = 0;
  }

  /** 경로를 따르기 시작하고 경로 칸을 감시한다. */
  private setPath(rt: Runtime, path: readonly BlockPos[]): void {
    this.stopWatching(rt);
    rt.controller.setPath(path);
    const c = rt.controller;
    rt.unwatch = this.deps.nav.watch(pathWatchCells(path), () => c.invalidate());
  }

  /** 요청·감시를 정리한다. */
  private release(rt: Runtime): void {
    if (rt.request) this.deps.paths.cancel(rt.request);
    rt.request = null;
    this.stopWatching(rt);
  }

  /** 경로 감시를 푼다. */
  private stopWatching(rt: Runtime): void {
    rt.unwatch?.();
    rt.unwatch = null;
  }

  /** 이 칸을 부수면 사라지는 점유 칸 수(두 칸 객체는 전체). */
  private cellsOf(p: BlockPos): number {
    const obj = this.deps.world.placements.objectAt(p);
    return obj ? objectCells(obj).length : 1;
  }

  /** 발밑 칸에서 몬스터가 설 수 있는 출발 칸. 위·아래 한 칸까지 본다. */
  private startCell(m: Monster): BlockPos | null {
    const p = m.body.pos;
    const base = { x: Math.floor(p.x), y: Math.floor(p.y + 0.01), z: Math.floor(p.z) };
    for (const dy of [0, 1, -1]) {
      const c = { ...base, y: base.y + dy };
      if (this.deps.nav.isStandable(c, 'monster')) return c;
    }
    return null;
  }

  /** 몬스터의 실행 상태(없으면 만든다). */
  private runtimeOf(m: Monster): Runtime {
    let rt = this.runtime.get(m.id);
    if (!rt) {
      rt = {
        mode: 'seek',
        request: null,
        controller: new MovementController(this.deps.world),
        unwatch: null,
        target: null,
        targetId: 0,
        progress: 0,
        reseek: 0,
        wanderStep: 0,
      };
      this.runtime.set(m.id, rt);
    }
    return rt;
  }
}

/** 좌표 비교 키. */
function key(p: BlockPos): string {
  return `${String(p.y).padStart(4, '0')},${String(p.z).padStart(4, '0')},${String(p.x).padStart(4, '0')}`;
}

/** 결정적 정수 해시. */
function hash(id: string, n: number): number {
  let h = n * 2654435761;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return Math.abs(h) % 1000003;
}
