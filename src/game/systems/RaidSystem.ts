// 습격 스케줄 (MVP_SPEC 24.1 / 24.4 / 24.5, ARCHITECTURE 4.1 의 8 번 / 18, TASK-044). 습격과 그 이력의 유일한 소유자다.
// 1 차: 레벨 2 이상이 된 뒤 첫 21:00 에 3 마리. 2 차: 레벨 3 이상이고 1 차가 끝난 뒤 첫 21:00 에 5 마리.
// 예정 시각은 조건이 참이 된 시각보다 엄격히 뒤인 첫 21:00 이다. 그 외의 밤에는 나오지 않는다(상시 스폰 없음).
// 05:00 에 남은 몬스터를 소멸시키고, 모두 처치되거나 소멸하면 결과(도달 수 / 총 수)를 기록한다.
import { balance } from '../data/balance';
import { createMonster, type Monster } from '../entities/Monster';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type { BlockPos, GameClockReader, RaidResult } from '../types';
import { nextOccurrence } from './GameClockSystem';

const M = balance.monster;

/** 진행 중인 습격. */
export interface ActiveRaid {
  readonly raidId: number;
  readonly total: number;
  readonly despawnAtGameMinutes: number;
  readonly reachedIds: readonly string[];
  /** 이번 습격에서 부순 점유 복셀 수 (상한 16, TASK-045) */
  readonly destroyedCells: number;
}

/** 저장 단위 (SaveData.raid). */
export interface RaidSnapshot {
  readonly results: readonly RaidResult[];
  readonly active: ActiveRaid | null;
  /** 다음 습격 예정 시각. 없으면 null */
  readonly scheduledAtGameMinutes: number | null;
}

/** RaidSystem 이 읽고 쓰는 것. */
export interface RaidDeps {
  readonly events: EventBus;
  readonly clock: GameClockReader;
  readonly villageLevel: () => number;
  readonly monsters: {
    add(m: Monster): void;
    remove(id: string): boolean;
    values(): IterableIterator<Monster>;
    readonly size: number;
  };
  /** 몬스터 스폰 칸(어두운 외곽 두 곳). 비어 있으면 습격하지 않는 시험 월드다 */
  readonly spawnCells: readonly BlockPos[];
}

/** 습격 예약·시작·종료. */
export class RaidSystem implements SlotSystem {
  private readonly finished: RaidResult[] = [];
  private current: ActiveRaid | null = null;
  private scheduledAt: number | null = null;

  /** 포트를 받는다. */
  constructor(private readonly deps: RaidDeps) {}

  /** 완료한 습격 결과(순서대로). 진행 이벤트와 WorldState 가 읽는다. */
  get results(): readonly RaidResult[] {
    return this.finished;
  }

  /** 가장 최근 습격 결과. 없으면 null (safetyLevel 의 입력). */
  get lastResult(): RaidResult | null {
    return this.finished[this.finished.length - 1] ?? null;
  }

  /** 진행 중인 습격. */
  get active(): ActiveRaid | null {
    return this.current;
  }

  /** 다음 습격 예정 시각. */
  get scheduledAtGameMinutes(): number | null {
    return this.scheduledAt;
  }

  /** 몬스터가 종 반경 6 안에 들어왔다(MonsterSystem). 한 마리는 한 번만 센다. */
  markReached(monsterId: string): void {
    const a = this.current;
    if (!a || a.reachedIds.includes(monsterId)) return;
    this.current = { ...a, reachedIds: [...a.reachedIds, monsterId] };
  }

  /** 남은 파괴 예산(점유 복셀). 습격 중이 아니면 0. */
  get remainingDestroyCells(): number {
    return this.current ? M.maxDestroyedCellsPerRaid - this.current.destroyedCells : 0;
  }

  /** 파괴 예산을 쓴다. 모자라면 false 이고 아무것도 바꾸지 않는다. */
  spendDestroyCells(cells: number): boolean {
    const a = this.current;
    if (!a || cells <= 0 || a.destroyedCells + cells > M.maxDestroyedCellsPerRaid) return false;
    this.current = { ...a, destroyedCells: a.destroyedCells + cells };
    return true;
  }

  /** 8 번 슬롯: 예약 → 시작 → 종료(소멸 시각·전멸)를 차례로 확인한다. 경계는 도달 여부로 판정한다. */
  update(): void {
    const now = this.deps.clock.gameMinutes;
    const a = this.current;
    if (a) {
      if (now >= a.despawnAtGameMinutes) this.despawnAll(a.raidId);
      if (this.aliveCount(a.raidId) > 0) return;
      // 끝난 프레임에 곧바로 다음 습격을 예약한다(종료 시각보다 엄격히 뒤인 첫 21:00)
      this.finish(a, now);
    }
    const next = this.nextRaid();
    if (!next) {
      this.scheduledAt = null;
      return;
    }
    if (this.scheduledAt === null) this.scheduledAt = nextOccurrence(now, M.spawnHour, 0);
    if (now < this.scheduledAt) return;
    // 시각 강제 설정으로 그 밤(21:00~05:00)을 통째로 건너뛰었으면 낮에 열지 않고 다음 21:00 로 미룬다 (MVP_SPEC 20.3)
    if (now >= nextOccurrence(this.scheduledAt, M.despawnHour, 0)) {
      this.scheduledAt = nextOccurrence(now, M.spawnHour, 0);
      return;
    }
    this.start(next.raidId, next.count, now);
  }

  /** 저장용 스냅샷. */
  snapshot(): RaidSnapshot {
    return {
      results: [...this.finished],
      active: this.current,
      scheduledAtGameMinutes: this.scheduledAt,
    };
  }

  /** 로드 복원(몬스터 엔티티 복원은 저장 시스템이 한다). */
  restore(s: RaidSnapshot): void {
    this.finished.length = 0;
    this.finished.push(...s.results);
    this.current = s.active;
    this.scheduledAt = s.scheduledAtGameMinutes;
  }

  /** 조건이 참인 다음 습격(1 차 → 2 차 순서). 없으면 null. */
  private nextRaid(): { raidId: number; count: number } | null {
    const raidId = this.finished.length + 1;
    const def = balance.raids[raidId - 1];
    if (!def || this.deps.spawnCells.length === 0) return null;
    if (this.deps.villageLevel() < def.afterVillageLevel) return null;
    return { raidId, count: def.monsterCount };
  }

  /** 습격을 시작한다: 몬스터를 두 스폰 칸에 번갈아 세운다. */
  private start(raidId: number, count: number, now: number): void {
    const cells = this.deps.spawnCells;
    this.deps.events.transaction(() => {
      for (let i = 0; i < count; i++) {
        const base = cells[i % cells.length] as BlockPos;
        // 같은 칸에 겹치지 않게 한 칸씩 옆으로 비킨다
        const k = Math.floor(i / cells.length);
        const cell = { x: base.x + (k % 2 === 0 ? k / 2 : -(k + 1) / 2), y: base.y, z: base.z };
        this.deps.monsters.add(createMonster(`monster-${raidId}-${i + 1}`, raidId, cell));
      }
      this.current = {
        raidId,
        total: count,
        despawnAtGameMinutes: nextOccurrence(now, M.despawnHour, 0),
        reachedIds: [],
        destroyedCells: 0,
      };
      this.scheduledAt = null;
      this.deps.events.emit('RAID_STARTED', { raidId, count });
    });
  }

  /** 이 습격의 남은 몬스터를 모두 없앤다(05:00 강제 소멸). */
  private despawnAll(raidId: number): void {
    for (const m of [...this.deps.monsters.values()]) {
      if (m.raidId === raidId) this.deps.monsters.remove(m.id);
    }
  }

  /** 살아 있는 이 습격의 몬스터 수. */
  private aliveCount(raidId: number): number {
    let n = 0;
    for (const m of this.deps.monsters.values()) if (m.raidId === raidId) n += 1;
    return n;
  }

  /** 습격을 끝내고 결과를 기록한다. */
  private finish(a: ActiveRaid, now: number): void {
    const result: RaidResult = {
      raidId: a.raidId,
      total: a.total,
      reached: a.reachedIds.length,
      endedAtGameMinutes: now,
    };
    this.finished.push(result);
    this.current = null;
    this.scheduledAt = null;
    this.deps.events.emit('RAID_ENDED', result);
  }
}
