// 타입 안전 이벤트 버스 (ARCHITECTURE 5). "일어난 일" 을 알린다. 명령에는 쓰지 않는다 (5.1).
import type {
  BlockChangeSource,
  BlockPos,
  DayPhase,
  PlacedObjectSnapshot,
  RoomFailure,
  RoomType,
  GratitudeSource,
  Vec3,
  VillageStorageData,
  WorldStateData,
} from './types';

/**
 * 방 해제 사유. 판정 실패(RoomFailure) 또는 다른 방에 합쳐짐(MERGED).
 * MERGED 는 두 방 이상의 내부가 하나로 이어졌을 때 이전 방들을 해제하는 경우다 (ARCHITECTURE 10.4).
 */
export type RoomUnregisterReason = RoomFailure | { readonly reason: 'MERGED' };

/**
 * 이벤트 이름 → payload. ARCHITECTURE 5 의 GameEventMap 이 정본이다.
 * payload 타입이 아직 정의되지 않은 이벤트(방·습격·대사 등)는 해당 Task 에서
 * 정본과 같은 이름·형태로 추가한다. 여기서 새 이벤트를 만들지 않는다.
 */
export interface GameEventMap {
  BLOCK_CHANGED: {
    batchId: number;
    pos: BlockPos;
    from: number;
    to: number;
    by: BlockChangeSource;
    removedObject?: PlacedObjectSnapshot;
  };
  ROOM_REGISTERED: { roomId: string; type: RoomType };
  ROOM_FACILITIES_CHANGED: { roomId: string };
  ROOM_TYPE_CHANGED: { roomId: string; from: RoomType; to: RoomType };
  ROOM_UNREGISTERED: { roomId: string; reason: RoomUnregisterReason };
  STORAGE_CHANGED: VillageStorageData;
  /** 새 주민이 도착했다 (MVP_SPEC 19.6) */
  NPC_ARRIVED: { npcId: string };
  /** 종을 쳐 마을 레벨이 올랐다. unlocked 는 새로 해금된 블록 id (MVP_SPEC 23.3) */
  VILLAGE_LEVEL_UP: { level: number; unlocked: number[] };
  /** 감사 포인트를 얻었다. at 은 +N 연출 좌표, total 은 얻은 뒤 합계다 (MVP_SPEC 22.2) */
  GRATITUDE_GAINED: { amount: number; source: GratitudeSource; at: Vec3; total: number };
  /** 정본의 void payload. lint 규칙(no-invalid-void-type) 때문에 undefined 로 표기한다. */
  INVENTORY_CHANGED: undefined;
  /** NPC 의 현재 Action 이 바뀌었다. label 은 Action 이 제공하는 표시용 이름이다 (MVP_SPEC 19.3) */
  NPC_ACTION_CHANGED: { npcId: string; label: string };
  /** 시간대가 바뀌었다. 바뀔 때만 발행한다 (MVP_SPEC 20.1) */
  DAY_PHASE_CHANGED: { phase: DayPhase };
  /** 파생 지표가 바뀌었다. 바뀔 때만 발행한다 (MVP_SPEC 21.5, TASK-039) */
  WORLD_STATE_CHANGED: WorldStateData;
}

export type GameEventName = keyof GameEventMap;
type Listener<K extends GameEventName> = (payload: GameEventMap[K]) => void;

/** 트랜잭션 중 미뤄 둔 발행 하나. */
interface Deferred {
  readonly name: GameEventName;
  readonly payload: GameEventMap[GameEventName];
}

/** 이벤트 구독·발행. 구독자 목록은 이벤트 이름별로 따로 둔다. */
export class EventBus {
  private readonly listeners = new Map<GameEventName, Set<Listener<GameEventName>>>();
  private depth = 0;
  private deferred: Deferred[] = [];

  /**
   * fn 안의 발행을 모아 두었다가 fn 이 끝난 뒤 순서대로 발행한다 (ARCHITECTURE 6.1).
   * 인벤토리와 블록을 함께 바꾸는 편집에서 구독자가 한쪽만 바뀐 중간 상태를 읽지 않게 한다.
   * fn 이 예외를 던지면 모아 둔 발행을 버린다(호출자는 커밋 전에 검증을 끝내야 한다). 중첩할 수 있다.
   */
  transaction<T>(fn: () => T): T {
    this.depth += 1;
    let ok = false;
    try {
      const result = fn();
      ok = true;
      return result;
    } finally {
      this.depth -= 1;
      if (this.depth === 0) {
        const queued = this.deferred;
        this.deferred = [];
        if (ok) for (const d of queued) this.dispatch(d.name, d.payload);
      }
    }
  }

  /** 구독한다. 반환된 함수를 호출하면 구독이 해제된다. */
  on<K extends GameEventName>(name: K, fn: Listener<K>): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    // Set<Listener<GameEventName>> 에 넣기 위한 변환. emit 은 같은 K 의 payload 만 전달한다.
    const stored = fn as Listener<GameEventName>;
    set.add(stored);
    return () => {
      set.delete(stored);
    };
  }

  /** 발행한다. 트랜잭션 중이면 끝날 때까지 미룬다. 발행 중 구독 해제가 일어나도 목록의 복사본을 순회한다. */
  emit<K extends GameEventName>(name: K, payload: GameEventMap[K]): void {
    if (this.depth > 0) {
      this.deferred.push({ name, payload });
      return;
    }
    this.dispatch(name, payload);
  }

  /** 구독자에게 바로 전달한다. */
  private dispatch<K extends GameEventName>(name: K, payload: GameEventMap[K]): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }
}
