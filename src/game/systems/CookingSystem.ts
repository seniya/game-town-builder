// 요리 (MVP_SPEC 16, ARCHITECTURE 14 / 14.4 / 14.5 / 15, TASK-031).
// 조리 시설(Kitchen 의 cookingSpots) 목록·재료(crop) 예약의 소유자다. 결과 확정(crop −2, food +3)도 여기서만 한다.
// 화덕 자체의 예약(한 화덕 한 명)은 NPCSystem 이 소유하고(MVP_SPEC 12.4) 여기서는 facilityTaken 으로 읽기만 한다.
// 시작 때 재료를 예약하되 소비하지 않고, 완료 때 한 트랜잭션으로 소비·생산한다. 예약은 저장하지 않는다(로드 때 버린다).
// 화덕 목록은 방 이벤트로 갱신하고 요리사에게 가까운 화덕 하나만 좁혀 준다. 주민마다 월드·방 전체를 훑지 않는다.
import { balance } from '../data/balance';
import { BlockId } from '../data/blocks';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type { BlockPos, Facility, Room } from '../types';
import type { VillageStorage } from '../VillageStorage';

/** 요리사 한 명에게 좁힌 후보 (ARCHITECTURE 14 의 CookCandidate). */
export interface CookCandidate {
  /** Kitchen 의 cookingSpot(화덕) */
  readonly facility: Facility;
  /** 다른 요리사의 예약을 뺀 crop 이 한 번 조리할 만큼 있는가 */
  readonly ingredientsReady: boolean;
}

/** CookingSystem 이 읽고 쓰는 것. */
export interface CookingDeps {
  /** 모든 방(dirty 포함). 진행 중 조리는 재판정 중인 방에서도 유지하고, 새 후보는 dirty 방에서 내지 않는다 */
  readonly rooms: () => readonly Room[];
  readonly storage: VillageStorage;
  readonly events: EventBus;
  /** 칸의 블록 id. 방 재판정 전에 부서진 화덕을 목록에 되살리지 않게 확인한다 */
  readonly blockAt: (pos: BlockPos) => number;
  /** 이 시설을 다른 주민이 예약했는가 (NPCSystem 의 시설 예약 조회) */
  readonly facilityTaken: (objectId: string, npcId: string) => boolean;
}

/** 계측값 (F3). */
export interface CookingStats {
  /** 인식된 Kitchen 의 화덕 수 */
  readonly stoves: number;
  /** 조리 중인 수 */
  readonly cooking: number;
  /** 예약된 crop 합계 */
  readonly reservedCrop: number;
}

/** 조리 중 재료 예약. */
interface Reservation {
  readonly stoveId: string;
  readonly crop: number;
}

/** 두 칸의 맨해튼 거리. */
function manhattan(a: BlockPos, b: BlockPos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}

/** 화덕·재료 예약과 조리 결과를 관리한다. */
export class CookingSystem implements SlotSystem {
  /** 화덕 objectId → 시설과 방의 재판정 여부 */
  private stoves = new Map<string, { facility: Facility; roomDirty: boolean }>();
  /** npcId → 조리 중 재료 예약 */
  private readonly reserved = new Map<string, Reservation>();
  private dirty = true;

  /** 방·블록·저장소 변경을 구독한다. 화덕 파괴는 방 재판정을 기다리지 않고 즉시 반영한다. */
  constructor(private readonly deps: CookingDeps) {
    const mark = (): void => void (this.dirty = true);
    deps.events.on('ROOM_REGISTERED', mark);
    deps.events.on('ROOM_TYPE_CHANGED', mark);
    deps.events.on('ROOM_FACILITIES_CHANGED', mark);
    deps.events.on('ROOM_UNREGISTERED', mark);
    // 화덕 칸이 바뀌면 다음 조회에서 목록을 다시 만든다. 그 칸의 화덕은 blockAt 확인으로 빠지고 예약도 풀린다
    deps.events.on('BLOCK_CHANGED', (c) => {
      if (c.from === BlockId.cooking_stove) mark();
    });
    // crop 이 예약 합계보다 적어지면(디버그·로드 등) 뒤에 잡은 예약부터 푼다. 완료 때 부족으로 실패하기 전에 알린다
    deps.events.on('STORAGE_CHANGED', (s) => this.revalidateIngredients(s.crop));
  }

  /** 계측값. */
  get stats(): CookingStats {
    this.refreshIfDirty();
    let reservedCrop = 0;
    for (const r of this.reserved.values()) reservedCrop += r.crop;
    return {
      stoves: this.stoves.size,
      cooking: this.reserved.size,
      reservedCrop,
    };
  }

  /** 방이 바뀌었으면 화덕 목록을 다시 만들고, 사라진 화덕의 재료 예약을 푼다. NPC 판단(10 번) 전에 부른다. */
  update(): void {
    this.refreshIfDirty();
  }

  /**
   * 이 요리사에게 줄 가까운 화덕 하나. 다른 주민이 예약한 화덕과 재판정 중인 방의 화덕은 건너뛴다.
   * 화덕이 없으면 null (Kitchen 없음 → 요리하지 않는다).
   * 음식 부족 조건은 보지 않는다 (ARCHITECTURE 14.4). 재료는 ingredientsReady 로만 알린다.
   */
  candidateFor(npcId: string, from: BlockPos): CookCandidate | null {
    this.refreshIfDirty();
    const ready = this.availableCropFor(npcId) >= balance.cooking.cropPerCook;
    let best: Facility | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const [id, s] of this.stoves) {
      if (s.roomDirty || this.deps.facilityTaken(id, npcId)) continue;
      const d = manhattan(from, s.facility.anchor);
      if (d < bestD || (d === bestD && best !== null && id < best.objectId)) {
        best = s.facility;
        bestD = d;
      }
    }
    return best ? { facility: best, ingredientsReady: ready } : null;
  }

  /**
   * 조리를 시작한다: crop 을 예약한다. 소비하지 않는다 (MVP_SPEC 16).
   * 화덕이 없거나(방 해제·파괴) 다른 요리사의 것이거나 재료가 모자라면 아무것도 바꾸지 않고 false.
   */
  begin(npcId: string, stoveId: string): boolean {
    this.refreshIfDirty();
    const need = balance.cooking.cropPerCook;
    if (this.availableCropFor(npcId) < need) return false;
    if (!this.stoves.has(stoveId) || this.deps.facilityTaken(stoveId, npcId)) return false;
    this.reserved.set(npcId, { stoveId, crop: need });
    return true;
  }

  /** 이 요리사가 지금 이 화덕에서 조리 중인가: 화덕이 남아 있고 재료 예약이 살아 있다. */
  isCooking(npcId: string, stoveId: string): boolean {
    this.refreshIfDirty();
    const r = this.reserved.get(npcId);
    return r !== undefined && r.stoveId === stoveId && this.stoves.has(stoveId);
  }

  /**
   * 조리를 끝낸다: 예약한 crop 을 한 번에 소비하고 food 를 만든다 (MVP_SPEC 16).
   * 조리 중이 아니거나 crop 이 모자라면 아무것도 바꾸지 않고 false. 성공하면 재료 예약을 지운다.
   * 감사 포인트 +3 은 GratitudeSystem(TASK-035) 이 생기면 ActionServices 포트로 요청한다.
   */
  complete(npcId: string, stoveId: string): boolean {
    if (!this.isCooking(npcId, stoveId)) return false;
    const c = balance.cooking;
    const s = this.deps.storage;
    const ok = this.deps.events.transaction(() => {
      if (s.get('crop') < c.cropPerCook) return false;
      // 예약을 먼저 지워 소비로 인한 STORAGE_CHANGED 재검증이 이 예약을 부족으로 보지 않게 한다
      this.reserved.delete(npcId);
      s.take('crop', c.cropPerCook);
      s.add('food', c.foodPerCook);
      return true;
    });
    return ok;
  }

  /** 이 요리사의 재료 예약을 푼다(조리 취소·실패·다른 행동). 재료는 소비하지 않았으므로 돌려줄 것이 없다. */
  release(npcId: string): void {
    this.reserved.delete(npcId);
  }

  /** 로드: 예약은 저장하지 않으므로 전부 버리고 화덕 목록을 다시 만든다 (ARCHITECTURE 23). */
  resetForLoad(): void {
    this.reserved.clear();
    this.dirty = true;
  }

  /** 다른 요리사의 예약을 뺀 crop. 자기 예약은 자기 몫으로 센다. */
  private availableCropFor(npcId: string): number {
    let others = 0;
    for (const [id, r] of this.reserved) if (id !== npcId) others += r.crop;
    return this.deps.storage.get('crop') - others;
  }

  /** 방이 바뀌었으면 Kitchen 의 화덕 목록을 다시 만든다. 사라진 화덕의 예약은 푼다. */
  private refreshIfDirty(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const next = new Map<string, { facility: Facility; roomDirty: boolean }>();
    for (const room of this.deps.rooms()) {
      if (room.type !== 'Kitchen') continue;
      for (const f of room.facilities.cookingSpots) {
        if (this.deps.blockAt(f.anchor) !== BlockId.cooking_stove) continue;
        next.set(f.objectId, { facility: f, roomDirty: room.dirty });
      }
    }
    this.stoves = next;
    for (const [npcId, r] of [...this.reserved])
      if (!next.has(r.stoveId)) this.reserved.delete(npcId);
  }

  /** crop 이 예약 합계보다 적으면 합계가 맞을 때까지 예약을 푼다. */
  private revalidateIngredients(crop: number): void {
    let total = 0;
    for (const r of this.reserved.values()) total += r.crop;
    for (const [npcId, r] of [...this.reserved].reverse()) {
      if (total <= crop) break;
      this.reserved.delete(npcId);
      total -= r.crop;
    }
  }
}
