// 식사 (MVP_SPEC 17, ARCHITECTURE 4.1 의 10 번, 14 / 15, TASK-032). 허기 수치는 없다.
// 식사 구간(12~13 점심, 18~19 저녁)의 mealId 와 주민별 hasEatenThisMeal 의 유일한 변경자다.
// 구간에 들어서면 새 mealId 로 갱신하고 플래그를 초기화한다. 주민의 mealId 가 이미 같으면(로드·같은 구간 재진입) 초기화하지 않는다.
// DiningRoom 의 의자 목록을 방 이벤트로 유지하고 주민에게 가까운 빈 의자 하나를 좁혀 준다. 의자 예약은 NPCSystem 이 소유한다.
import { balance } from '../data/balance';
import { BlockId } from '../data/blocks';
import type { NPC } from '../entities/NPC';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type { ActionView, BlockPos, DiningSeat, GameClockReader, Room } from '../types';
import type { VillageStorage } from '../VillageStorage';

/** MealSystem 이 읽고 쓰는 것. */
export interface MealDeps {
  readonly clock: GameClockReader;
  readonly npcs: () => Iterable<NPC<ActionView>>;
  readonly npcById: (id: string) => NPC<ActionView> | undefined;
  readonly storage: VillageStorage;
  readonly events: EventBus;
  /** 모든 방(dirty 포함). 새 의자는 재판정 중인 방에서 내지 않는다 */
  readonly rooms: () => readonly Room[];
  /** 칸의 블록 id. 의자에 맞닿은 식탁을 찾고 부서진 의자를 뺀다 */
  readonly blockAt: (pos: BlockPos) => number;
  /** 이 시설을 다른 주민이 예약했는가 (NPCSystem 의 시설 예약 조회) */
  readonly facilityTaken: (objectId: string, npcId: string) => boolean;
}

/** 계측값 (F3). */
export interface MealStats {
  /** 지금 열린 식사 구간 id. 없으면 null */
  readonly mealId: string | null;
  /** 인식된 DiningRoom 의 의자 수 */
  readonly seats: number;
  /** 이번 구간에 먹은 주민 수 */
  readonly eaten: number;
}

const C = balance.clock;

/** 그날 분이 식사 구간이면 그 종류. */
function mealKindAt(minuteOfDay: number): 'lunch' | 'dinner' | null {
  if (minuteOfDay >= C.lunchStartHour * 60 && minuteOfDay < C.lunchEndHour * 60) return 'lunch';
  if (minuteOfDay >= C.dinnerStartHour * 60 && minuteOfDay < C.dinnerEndHour * 60) return 'dinner';
  return null;
}

/** 시계의 현재 식사 구간 id "day:lunch|dinner". 구간 밖이면 null. */
export function currentMealId(clock: GameClockReader): string | null {
  const kind = mealKindAt(clock.minuteOfDay);
  return kind ? `${clock.day}:${kind}` : null;
}

/** 두 칸의 맨해튼 거리. */
function manhattan(a: BlockPos, b: BlockPos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}

/** 식사 구간·식사 플래그·식당 의자 후보를 관리한다. */
export class MealSystem implements SlotSystem {
  /** 의자 objectId → 의자와 방의 재판정 여부 */
  private seats = new Map<string, { seat: DiningSeat; roomDirty: boolean }>();
  private dirty = true;

  /** 방·블록 변경을 구독한다. 의자·식탁 칸이 바뀌면 다음 조회에서 목록을 다시 만든다. */
  constructor(private readonly deps: MealDeps) {
    const mark = (): void => void (this.dirty = true);
    deps.events.on('ROOM_REGISTERED', mark);
    deps.events.on('ROOM_TYPE_CHANGED', mark);
    deps.events.on('ROOM_FACILITIES_CHANGED', mark);
    deps.events.on('ROOM_UNREGISTERED', mark);
    deps.events.on('BLOCK_CHANGED', (c) => {
      if (c.from === BlockId.chair || c.from === BlockId.table) mark();
    });
  }

  /** 지금 식사 구간이 열려 있는가. */
  get active(): boolean {
    return currentMealId(this.deps.clock) !== null;
  }

  /** 계측값. */
  get stats(): MealStats {
    this.refreshIfDirty();
    const mealId = currentMealId(this.deps.clock);
    let eaten = 0;
    for (const n of this.deps.npcs())
      if (mealId && n.mealId === mealId && n.hasEatenThisMeal) eaten += 1;
    return { mealId, seats: this.seats.size, eaten };
  }

  /**
   * 구간에 들어선 주민의 mealId 를 새 구간으로 바꾸고 hasEatenThisMeal 을 초기화한다 (MVP_SPEC 17).
   * mealId 가 이미 같으면 두지 않는다(로드·같은 구간 재진입). 판단(10 번) 전에 부른다.
   */
  update(): void {
    const mealId = currentMealId(this.deps.clock);
    if (mealId === null) return;
    for (const npc of this.deps.npcs()) {
      if (npc.mealId === mealId) continue;
      npc.mealId = mealId;
      npc.hasEatenThisMeal = false;
    }
  }

  /** 이 주민에게 줄 가까운 빈 의자 하나. 다른 주민이 예약한 의자·재판정 중인 방의 의자는 건너뛴다. 없으면 null(광장에서 먹는다). */
  seatFor(npcId: string, from: BlockPos): DiningSeat | null {
    this.refreshIfDirty();
    let best: DiningSeat | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const [id, s] of this.seats) {
      if (s.roomDirty || this.deps.facilityTaken(id, npcId)) continue;
      const d = manhattan(from, s.seat.anchor);
      if (d < bestD || (d === bestD && best !== null && id < best.objectId)) {
        best = s.seat;
        bestD = d;
      }
    }
    return best;
  }

  /** 이 의자가 아직 DiningRoom 의 의자인가. */
  isSeatUsable(seatId: string): boolean {
    this.refreshIfDirty();
    return this.seats.has(seatId);
  }

  /**
   * 먹는다: food 1 을 소비하고 이번 구간에 먹었다고 기록한다 (MVP_SPEC 17). 한 트랜잭션이다.
   * 구간 밖·이미 먹음·food 부족·(의자면) 쓸 수 없는 의자이면 아무것도 바꾸지 않고 false.
   * 식당 의자에서 먹으면 감사 포인트 +2 를 GratitudeSystem(TASK-035) 이 생기면 여기서 요청한다. 광장은 포인트가 없다.
   */
  eat(npcId: string, seatId: string | null): boolean {
    const mealId = currentMealId(this.deps.clock);
    if (mealId === null) return false;
    const npc = this.deps.npcById(npcId);
    if (!npc || (npc.mealId === mealId && npc.hasEatenThisMeal)) return false;
    if (seatId !== null && (!this.isSeatUsable(seatId) || this.deps.facilityTaken(seatId, npcId))) {
      return false;
    }
    const s = this.deps.storage;
    const need = balance.meal.foodPerMeal;
    return this.deps.events.transaction(() => {
      if (!s.take('food', need)) return false;
      npc.mealId = mealId;
      npc.hasEatenThisMeal = true;
      return true;
    });
  }

  /** 방이 바뀌었으면 DiningRoom 의 의자 목록을 다시 만든다. 부서진 의자와 식탁 없는 의자는 뺀다. */
  private refreshIfDirty(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const next = new Map<string, { seat: DiningSeat; roomDirty: boolean }>();
    for (const room of this.deps.rooms()) {
      if (room.type !== 'DiningRoom') continue;
      for (const f of room.facilities.diningSeats) {
        if (this.deps.blockAt(f.anchor) !== BlockId.chair) continue;
        const table = this.tableNextTo(f.anchor);
        if (!table) continue;
        next.set(f.objectId, {
          seat: { ...f, tableTop: { x: table.x + 0.5, y: table.y + 1, z: table.z + 0.5 } },
          roomDirty: room.dirty,
        });
      }
    }
    this.seats = next;
  }

  /** 의자에 수평으로 맞닿은 식탁 칸. 여럿이면 x → z 순으로 첫 칸. 없으면 null. 의자 둘레 네 칸만 읽는다. */
  private tableNextTo(chair: BlockPos): BlockPos | null {
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const p = { x: chair.x + dx, y: chair.y, z: chair.z + dz };
      if (this.deps.blockAt(p) === BlockId.table) return p;
    }
    return null;
  }
}
