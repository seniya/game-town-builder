// 파괴와 수리 (MVP_SPEC 25, ARCHITECTURE 15 / 19, TASK-048). DamageLog·피해 이력·당일 수리량의 유일한 소유자다.
// 몬스터가 부순 것(BLOCK_CHANGED by 'monster')을 batchId 로 한 번씩 기록한다. 두 칸 객체는 한 건이다.
// 목수는 07:00~18:00 에 하루 8 점유 복셀까지, 칸당 게임 15 분 걸려 원래 블록을 재료 없이 복원한다.
// 플레이어가 직접 모든 칸을 채우면(by 'player') 미수리 목록에서만 빼고 아침 보고용 이력은 남긴다.
// 농사 편집(by 'npc')을 수리 완료로 보지 않는다. 수리 완료는 complete 한 곳에서만 확정한다.
import { balance } from '../data/balance';
import { BlockId } from '../data/blocks';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type { NavigationGraph } from '../nav/NavigationGraph';
import type {
  AabbBody,
  BlockPos,
  DamageEntry,
  GameClockReader,
  PlacedObjectSnapshot,
} from '../types';
import { objectCells } from '../voxel/PlacementIndex';
import type { VoxelWorld } from '../voxel/VoxelWorld';

const R = balance.carpenter;

export type { DamageEntry } from '../types';

/** 목수에게 줄 수리 후보 (ARCHITECTURE 14 의 RepairCandidate). */
export interface RepairCandidate {
  readonly damageId: string;
  readonly cells: readonly BlockPos[];
  readonly approachCells: readonly BlockPos[];
}

/** 저장 단위. */
export interface RepairSnapshot {
  readonly pending: readonly DamageEntry[];
  readonly history: readonly DamageEntry[];
  readonly day: number;
  readonly repairedCells: number;
  readonly counter: number;
  /** 마지막으로 아침 보고를 한 day 와 그때까지 센 시각 (MVP_SPEC 25.4) */
  readonly reportedDay: number;
  readonly reportedThrough: number;
}

/** RepairSystem 이 읽고 쓰는 것. */
export interface RepairDeps {
  readonly events: EventBus;
  readonly clock: GameClockReader;
  readonly world: VoxelWorld;
  readonly nav: NavigationGraph;
  /** 캐릭터 몸체(복원 칸과 겹치면 복원하지 않는다) */
  readonly bodies: () => Iterable<AabbBody>;
  /** 이 후보를 다른 주민이 잡았는가 (NPCSystem 시설 예약) */
  readonly claimed: (key: string, npcId: string) => boolean;
}

/** 피해 기록·수리 후보·복원. */
export class RepairSystem implements SlotSystem {
  private readonly pendingMap = new Map<string, DamageEntry>();
  private readonly historyList: DamageEntry[] = [];
  private readonly seen = new Set<string>();
  private day: number;
  private repaired = 0;
  private counter = 0;
  private reportedDay: number;
  /** 미수리 목록·예약·블록이 바뀔 때마다 오른다(후보 캐시, PERF-002) */
  private revision = 0;
  private readonly cache = new Map<string, { rev: number; result: RepairCandidate | null }>();
  private reportedThrough = -1;

  /** 블록 변경을 구독한다. */
  constructor(private readonly deps: RepairDeps) {
    this.day = deps.clock.day;
    // 07:00 뒤에 시작했으면 그날 아침은 지난 것으로 본다(07:00 전이면 그날 07:00 에 보고한다)
    this.reportedDay =
      deps.clock.minuteOfDay >= R.repairStartHour * 60 ? deps.clock.day : deps.clock.day - 1;
    this.reportedThrough = deps.clock.gameMinutes - 1e-6;
    deps.events.on('BLOCK_CHANGED', (c) => {
      this.revision += 1;
      if (c.by === 'monster' && c.from !== BlockId.air)
        this.log(c.batchId, c.pos, c.from, c.removedObject ?? null);
      else if (c.by === 'player' && c.to !== BlockId.air) this.resolveCoveredCells();
    });
  }

  /** 미수리 피해. */
  get pending(): readonly DamageEntry[] {
    return [...this.pendingMap.values()];
  }

  /** 모든 피해 이력(수리 뒤에도 남는다). 아침 보고가 읽는다. */
  get history(): readonly DamageEntry[] {
    return this.historyList;
  }

  /** 오늘 수리한 점유 복셀 수. */
  get repairedToday(): number {
    this.rollDay();
    return this.repaired;
  }

  /** 수리 후보의 예약 키. */
  static claimKey(damageId: string): string {
    return `repair:${damageId}`;
  }

  /** 자정이 지나면 당일 수리량을 초기화하고, 07:00 을 지나면 아침 보고를 한 번 한다. */
  update(): void {
    this.rollDay();
    this.morningReport();
  }

  /**
   * 07:00 아침 보고 (MVP_SPEC 25.4): 지난 보고 뒤에 기록된 파괴가 있으면 파괴 칸 수를 알린다.
   * 그 사이 수리한 피해도 센다(이력 기준). 피해가 없으면 알리지 않는다. 하루 한 번이며 보고 여부는 저장한다.
   */
  private morningReport(): void {
    const c = this.deps.clock;
    if (c.day === this.reportedDay || c.minuteOfDay < R.repairStartHour * 60) return;
    this.reportedDay = c.day;
    const since = this.reportedThrough;
    this.reportedThrough = c.gameMinutes;
    const entries = this.historyList.filter((e) => e.gameMinutes > since);
    const cells = entries.reduce((n, e) => n + e.cells.length, 0);
    if (cells > 0) this.deps.events.emit('DAMAGE_REPORT', { cells, entries: entries.length });
  }

  /**
   * 이 목수에게 줄 가까운 후보. 수리 시간(07~18) 밖·예산 소진이면 null.
   * 모든 칸이 비어 있고, 남은 예산 이하이고, 다른 목수가 잡지 않았고, 설 수 있는 작업 칸이 있는 피해만.
   */
  candidateFor(npcId: string, from: BlockPos): RepairCandidate | null {
    if (!this.inHours()) return null;
    // 미수리 목록·블록·예약·당일 수리량이 그대로면 지난 결과를 쓴다 (PERF-002)
    // 예약이 풀린 후보를 놓치지 않게 5 게임분마다도 다시 계산한다
    const rev =
      (this.revision * 64 + this.repairedToday) * 1_000_000 +
      Math.floor(this.deps.clock.gameMinutes / 5);
    const hit = this.cache.get(npcId);
    if (
      hit &&
      hit.rev === rev &&
      (!hit.result || !this.deps.claimed(RepairSystem.claimKey(hit.result.damageId), npcId))
    ) {
      return hit.result;
    }
    const result = this.computeCandidate(npcId, from);
    this.cache.set(npcId, { rev, result });
    return result;
  }

  /** 후보를 새로 계산한다. */
  private computeCandidate(npcId: string, from: BlockPos): RepairCandidate | null {
    const left = R.repairPerDay - this.repairedToday;
    let best: { c: RepairCandidate; d: number } | null = null;
    for (const e of this.pendingMap.values()) {
      if (
        e.cells.length > left ||
        !this.allEmpty(e) ||
        this.deps.claimed(RepairSystem.claimKey(e.id), npcId)
      ) {
        continue;
      }
      const a = e.cells[0] as BlockPos;
      const d = Math.abs(a.x - from.x) + Math.abs(a.y - from.y) + Math.abs(a.z - from.z);
      if (best && d >= best.d) continue;
      const approach = this.approachCells(e);
      if (approach.length === 0) continue;
      best = { c: { damageId: e.id, cells: e.cells, approachCells: approach }, d };
    }
    return best?.c ?? null;
  }

  /** 아직 미수리인가. */
  isPending(damageId: string): boolean {
    return this.pendingMap.has(damageId);
  }

  /**
   * 복원한다: 시간·예산·빈 칸·캐릭터 비점유를 다시 확인하고 원래 블록(객체는 원래 배치)을 한 번에 놓는다.
   * 조건이 맞지 않으면 아무것도 바꾸지 않고 false. 재료를 쓰지 않는다.
   */
  complete(damageId: string): boolean {
    const e = this.pendingMap.get(damageId);
    if (!e || !this.inHours()) return false;
    if (this.repairedToday + e.cells.length > R.repairPerDay) return false;
    if (!this.allEmpty(e) || this.occupied(e)) return false;
    const w = this.deps.world;
    return this.deps.events.transaction(() => {
      const ok = e.object
        ? w.editObject(
            { kind: 'place', object: { ...e.object, id: w.placements.allocateId() } },
            'npc',
          )
        : e.cells.every((c) => w.setBlock(c.x, c.y, c.z, e.blockId, 'npc'));
      if (!ok) return false;
      this.pendingMap.delete(e.id);
      this.repaired += e.cells.length;
      for (const c of e.cells) this.deps.events.emit('BLOCK_REPAIRED', { pos: c });
      return true;
    });
  }

  /** 플레이어가 모든 칸을 다시 채운 피해를 미수리 목록에서 뺀다(이력은 남긴다). */
  resolveCoveredCells(): void {
    for (const e of [...this.pendingMap.values()]) {
      const w = this.deps.world;
      if (e.cells.every((c) => w.getBlock(c.x, c.y, c.z) !== BlockId.air)) {
        this.pendingMap.delete(e.id);
        for (const c of e.cells) this.deps.events.emit('BLOCK_REPAIRED', { pos: c });
      }
    }
  }

  /** 저장용 스냅샷. */
  snapshot(): RepairSnapshot {
    return {
      pending: this.pending,
      history: [...this.historyList],
      day: this.day,
      repairedCells: this.repaired,
      counter: this.counter,
      reportedDay: this.reportedDay,
      reportedThrough: this.reportedThrough,
    };
  }

  /** 로드 복원. */
  restore(s: RepairSnapshot): void {
    this.pendingMap.clear();
    for (const e of s.pending) this.pendingMap.set(e.id, e);
    this.historyList.length = 0;
    this.historyList.push(...s.history);
    this.seen.clear();
    for (const e of s.history)
      this.seen.add(this.seenKey(e.batchId, e.object?.id ?? null, e.cells[0] as BlockPos));
    this.day = s.day;
    this.repaired = s.repairedCells;
    this.counter = s.counter;
    this.reportedDay = s.reportedDay;
    this.reportedThrough = s.reportedThrough;
  }

  /** 파괴 한 건을 기록한다. 같은 편집(batchId)의 같은 객체는 한 번만. */
  private log(
    batchId: number,
    pos: BlockPos,
    from: number,
    object: PlacedObjectSnapshot | null,
  ): void {
    const key = this.seenKey(batchId, object?.id ?? null, pos);
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.counter += 1;
    const entry: DamageEntry = {
      id: `damage-${this.counter}`,
      batchId,
      blockId: object ? object.blockId : from,
      cells: object ? objectCells(object) : [pos],
      object,
      gameMinutes: this.deps.clock.gameMinutes,
    };
    this.pendingMap.set(entry.id, entry);
    this.historyList.push(entry);
    this.deps.events.emit('DAMAGE_LOGGED', entry);
  }

  /** 중복 방지 키. 객체는 batchId + objectId, 단일 칸은 batchId + 좌표. */
  private seenKey(batchId: number, objectId: string | null, pos: BlockPos): string {
    return objectId ? `${batchId}:${objectId}` : `${batchId}:${pos.x},${pos.y},${pos.z}`;
  }

  /** 수리 시간 07:00~18:00 인가. */
  private inHours(): boolean {
    const m = this.deps.clock.minuteOfDay;
    return m >= R.repairStartHour * 60 && m < R.repairEndHour * 60;
  }

  /** 날이 바뀌었으면 당일 수리량을 초기화한다(자정에 한 번). */
  private rollDay(): void {
    const d = this.deps.clock.day;
    if (d !== this.day) {
      this.day = d;
      this.repaired = 0;
    }
  }

  /** 모든 칸이 비어 있는가(부분 복구가 있으면 덮어쓰지 않는다). */
  private allEmpty(e: DamageEntry): boolean {
    const w = this.deps.world;
    return e.cells.every((c) => w.getBlock(c.x, c.y, c.z) === BlockId.air);
  }

  /** 캐릭터가 복원 칸과 겹치는가. */
  private occupied(e: DamageEntry): boolean {
    for (const b of this.deps.bodies()) {
      const h = b.width / 2;
      for (const c of e.cells) {
        if (
          b.pos.x + h > c.x &&
          b.pos.x - h < c.x + 1 &&
          b.pos.z + h > c.z &&
          b.pos.z - h < c.z + 1 &&
          b.pos.y + b.height > c.y &&
          b.pos.y < c.y + 1
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /** 작업 칸: 피해 칸의 수평 이웃(같은 높이·한 칸 아래) 중 설 수 있고 피해 칸이 아닌 칸. */
  private approachCells(e: DamageEntry): BlockPos[] {
    const inside = new Set(e.cells.map((c) => `${c.x},${c.y},${c.z}`));
    const out: BlockPos[] = [];
    for (const c of e.cells) {
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        for (const dy of [0, -1]) {
          const p = { x: c.x + dx, y: c.y + dy, z: c.z + dz };
          if (inside.has(`${p.x},${p.y},${p.z}`)) continue;
          if (
            this.deps.nav.isStandable(p, 'npc') &&
            !out.some((q) => q.x === p.x && q.y === p.y && q.z === p.z)
          ) {
            out.push(p);
          }
        }
      }
    }
    return out;
  }
}
