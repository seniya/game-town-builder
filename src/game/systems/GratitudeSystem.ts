// 감사 포인트 (MVP_SPEC 22, ARCHITECTURE 16, TASK-035). 포인트 누적의 유일한 소유자다. update 13 번 슬롯.
// 반복 보상(취침·조리·식당 식사)은 주민의 사용에서 즉시 gain 으로 오고, 최초 방 타입 보너스는 방 이벤트를 모아 13 번에서 처리한다.
// 모든 gain 은 +N 연출 좌표를 받는다 (16.2). 얻은 포인트는 방이 해제되어도 줄지 않는다 (22.3). 소비는 spend 하나뿐이다.
import { balance } from '../data/balance';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type { GameClockReader, GratitudeSource, Room, RoomType, Vec3 } from '../types';

/** 저장 대상 (SaveData.gratitude / gratitudeOnce, ARCHITECTURE 23.1). */
export interface GratitudeSnapshot {
  readonly total: number;
  readonly roomTypes: readonly RoomType[];
  readonly eventIds: readonly string[];
  readonly sleepKeys: readonly { readonly npcId: string; readonly nightId: number }[];
}

/** GratitudeSystem 이 읽는 것. */
export interface GratitudeDeps {
  readonly events: EventBus;
  readonly clock: GameClockReader;
  /** 방 id 로 방을 찾는다(최초 인식 보너스의 좌표) */
  readonly room: (roomId: string) => Room | undefined;
}

/** 방 라벨 위 +N 을 띄울 높이(블록). */
const ROOM_POPUP_HEIGHT = 2.2;

/**
 * 취침 구간의 nightId: 그 구간이 시작된 20:00 의 day 다 (MVP_SPEC 22.1).
 * 자정 뒤(00:00~05:00)에는 전날 day 를 쓴다.
 */
export function nightIdOf(clock: GameClockReader): number {
  return clock.minuteOfDay >= balance.clock.sleepStartHour * 60 ? clock.day : clock.day - 1;
}

/** 감사 포인트 누적·중복 방지·소비. */
export class GratitudeSystem implements SlotSystem {
  private points = 0;
  private readonly roomTypes = new Set<RoomType>();
  private readonly eventIds = new Set<string>();
  /** `${npcId}|${nightId}` */
  private readonly sleepKeys = new Set<string>();
  /** 13 번 슬롯에서 처리할 방 인식 (roomId, 타입) */
  private readonly pendingRooms: { roomId: string; type: RoomType }[] = [];

  /** 방 인식·타입 변경을 같은 최초 인식 경로로 구독한다 (MVP_SPEC 22.1). */
  constructor(private readonly deps: GratitudeDeps) {
    deps.events.on('ROOM_REGISTERED', (p) =>
      this.pendingRooms.push({ roomId: p.roomId, type: p.type }),
    );
    deps.events.on('ROOM_TYPE_CHANGED', (p) =>
      this.pendingRooms.push({ roomId: p.roomId, type: p.to }),
    );
  }

  /** 지금까지 모은 포인트(쓴 것을 뺀 값). */
  get total(): number {
    return this.points;
  }

  /**
   * 포인트를 더한다. at 은 +N 연출 좌표다(필수, 16.2). 중복 방지 키가 이미 있으면 무시하고 false.
   *   sleep     npcId + nightId 로 한 번 / firstRoom 타입당 한 번(EmptyRoom 제외) / gameEvent id 당 한 번
   *   cook·eat  완료 트랜잭션마다 (중복은 호출하는 도메인의 완료 규칙이 막는다)
   */
  gain(source: GratitudeSource, amount: number, at: Vec3): boolean {
    if (!Number.isInteger(amount) || amount <= 0) return false;
    if (!this.claimOnce(source)) return false;
    this.points += amount;
    this.deps.events.emit('GRATITUDE_GAINED', { amount, source, at, total: this.points });
    return true;
  }

  /** 비용을 검사하고 차감한다. 모자라면 아무것도 바꾸지 않고 false (VillageLevelSystem 만 부른다, 15.1). */
  spend(amount: number): boolean {
    if (!Number.isInteger(amount) || amount < 0 || amount > this.points) return false;
    this.points -= amount;
    return true;
  }

  /** 모아 둔 방 인식을 처리한다: 새 타입이면 +20 을 방 위에 (EmptyRoom 제외). */
  update(): void {
    while (this.pendingRooms.length > 0) {
      const p = this.pendingRooms.shift();
      if (!p || p.type === 'EmptyRoom') continue;
      const room = this.deps.room(p.roomId);
      // 인식 직후 해제·다른 타입으로 바뀐 방은 그 타입의 보너스를 주지 않는다(다음 이벤트가 처리한다)
      if (!room || room.type !== p.type) continue;
      const c = room.center;
      const at = { x: c.x + 0.5, y: c.y + ROOM_POPUP_HEIGHT, z: c.z + 0.5 };
      this.gain({ kind: 'firstRoom', roomType: p.type }, balance.gratitude.onFirstRoomOfType, at);
    }
  }

  /** 저장용 스냅샷. */
  snapshot(): GratitudeSnapshot {
    return {
      total: this.points,
      roomTypes: [...this.roomTypes],
      eventIds: [...this.eventIds],
      sleepKeys: [...this.sleepKeys].map((k) => {
        const i = k.lastIndexOf('|');
        return { npcId: k.slice(0, i), nightId: Number(k.slice(i + 1)) };
      }),
    };
  }

  /** 로드 복원. 로드 중에는 이벤트를 내지 않는다. */
  restore(s: GratitudeSnapshot): void {
    this.points = s.total;
    this.roomTypes.clear();
    for (const t of s.roomTypes) this.roomTypes.add(t);
    this.eventIds.clear();
    for (const id of s.eventIds) this.eventIds.add(id);
    this.sleepKeys.clear();
    for (const k of s.sleepKeys) this.sleepKeys.add(`${k.npcId}|${k.nightId}`);
    this.pendingRooms.length = 0;
  }

  /** 일회성 출처의 키를 잡는다. 이미 있으면 false. 반복 출처는 항상 true. */
  private claimOnce(source: GratitudeSource): boolean {
    switch (source.kind) {
      case 'sleep': {
        const key = `${source.npcId}|${nightIdOf(this.deps.clock)}`;
        if (this.sleepKeys.has(key)) return false;
        this.sleepKeys.add(key);
        return true;
      }
      case 'firstRoom':
        if (source.roomType === 'EmptyRoom' || this.roomTypes.has(source.roomType)) return false;
        this.roomTypes.add(source.roomType);
        return true;
      case 'gameEvent':
        if (this.eventIds.has(source.id)) return false;
        this.eventIds.add(source.id);
        return true;
      case 'cook':
      case 'eat':
      case 'debug':
        return true;
    }
  }
}
