// 새 주민 도착 (MVP_SPEC 19.6 / 23.3, ARCHITECTURE 4.1 의 8 번 / 15, ADR 034, TASK-038).
// 레벨별 도착 예약과 실제 스폰의 유일한 소유자다. 종을 쳐 레벨 L 이 되면 키 L 로 한 번만 예약하고,
// 예약 시각(다음 07:00)을 넘긴 첫 프레임에 Villager 를 도착 칸에 세우며 예약을 완료한다.
import { balance } from '../data/balance';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type { BlockPos, GameClockReader } from '../types';
import { nextOccurrence } from './GameClockSystem';

/** 저장 단위 (SaveData.residentArrivals). */
export interface ResidentArrival {
  readonly level: number;
  readonly dueAtGameMinutes: number;
  readonly npcId: string;
  readonly arrived: boolean;
}

/** ResidentArrivalSystem 이 쓰는 것. */
export interface ResidentArrivalDeps {
  readonly events: EventBus;
  readonly clock: GameClockReader;
  /** 도착 칸. 같은 아침 두 번째 주민은 옆 칸을 쓴다 */
  readonly arrivalCells: () => readonly BlockPos[];
  /** 주민 한 명을 id 로 세운다 (GameWorld.spawnResident) */
  readonly spawn: (id: string, cell: BlockPos) => void;
}

/** 레벨별 도착 예약. */
export class ResidentArrivalSystem implements SlotSystem {
  private readonly arrivals = new Map<number, ResidentArrival>();

  /** 레벨 상승을 구독해 예약한다. */
  constructor(private readonly deps: ResidentArrivalDeps) {
    deps.events.on('VILLAGE_LEVEL_UP', (e) => this.reserve(e.level));
  }

  /** 모든 예약(완료 포함) snapshot. */
  snapshot(): ResidentArrival[] {
    return [...this.arrivals.values()];
  }

  /** 로드 복원. 완료 여부를 그대로 쓴다. */
  restore(list: readonly ResidentArrival[]): void {
    this.arrivals.clear();
    for (const a of list) this.arrivals.set(a.level, a);
  }

  /** 레벨 L 의 도착을 한 번만 예약한다. 시각은 지금보다 엄격히 뒤인 다음 07:00 이다. */
  private reserve(level: number): void {
    if (this.arrivals.has(level)) return;
    const due = nextOccurrence(this.deps.clock.gameMinutes, balance.clock.workStartHour, 0);
    this.arrivals.set(level, {
      level,
      dueAtGameMinutes: due,
      npcId: `villager-lv${level}`,
      arrived: false,
    });
  }

  /** 예약 시각을 넘긴 도착을 처리한다. 경계 통과로 판정하고 등호 비교를 쓰지 않는다(ARCHITECTURE 4.4). */
  update(): void {
    const now = this.deps.clock.gameMinutes;
    const cells = this.deps.arrivalCells();
    let slot = 0;
    for (const a of [...this.arrivals.values()].sort((x, y) => x.level - y.level)) {
      if (a.arrived || now < a.dueAtGameMinutes) continue;
      const cell = cells[slot % Math.max(1, cells.length)];
      slot += 1;
      if (!cell) continue;
      this.deps.events.transaction(() => {
        this.deps.spawn(a.npcId, cell);
        this.arrivals.set(a.level, { ...a, arrived: true });
        this.deps.events.emit('NPC_ARRIVED', { npcId: a.npcId });
      });
    }
  }
}
