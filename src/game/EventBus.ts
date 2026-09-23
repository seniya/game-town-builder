// 타입 안전 이벤트 버스 (ARCHITECTURE 5). "일어난 일" 을 알린다. 명령에는 쓰지 않는다 (5.1).
import type {
  BlockChangeSource,
  BlockPos,
  PlacedObjectSnapshot,
  VillageStorageData,
} from './types';

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
  STORAGE_CHANGED: VillageStorageData;
  /** 정본의 void payload. lint 규칙(no-invalid-void-type) 때문에 undefined 로 표기한다. */
  INVENTORY_CHANGED: undefined;
}

export type GameEventName = keyof GameEventMap;
type Listener<K extends GameEventName> = (payload: GameEventMap[K]) => void;

/** 이벤트 구독·발행. 구독자 목록은 이벤트 이름별로 따로 둔다. */
export class EventBus {
  private readonly listeners = new Map<GameEventName, Set<Listener<GameEventName>>>();

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

  /** 발행한다. 발행 중 구독 해제가 일어나도 현재 목록의 복사본을 순회한다. */
  emit<K extends GameEventName>(name: K, payload: GameEventMap[K]): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }
}
