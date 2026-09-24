// 엔딩 상태 (MVP_SPEC 27.1 EVENT_SLICE_END, ARCHITECTURE 23.1 ending, TASK-052).
// 이벤트가 엔딩 연출을 요청하면 pending, 연출이 끝나거나 건너뛰면 played 다. 연출 뒤에도 게임은 그대로 계속된다.
// 저장에 싣는다: 연출 중 새로고침하면 이어 할 때 다시 보여 준다. 이벤트는 다시 발생하지 않는다(완료 이벤트는 롤백되지 않는다, 27.3).
import { ENDING_CUTSCENE_ID } from '../data/ending';
import type { EventBus } from '../EventBus';

/** 저장 형태. */
export interface EndingSnapshot {
  readonly pending: boolean;
  readonly played: boolean;
}

/** 엔딩을 보여 줄 차례인지, 이미 보았는지. */
export class EndingSystem {
  private pendingFlag = false;
  private playedFlag = false;

  /** 연출 요청을 구독한다. */
  constructor(private readonly events: EventBus) {
    events.on('CUTSCENE_REQUESTED', (c) => {
      if (c.id === ENDING_CUTSCENE_ID && !this.playedFlag) this.pendingFlag = true;
    });
  }

  /** 보여 줄 엔딩이 기다리는가. */
  get pending(): boolean {
    return this.pendingFlag;
  }

  /** 엔딩을 보았는가. */
  get played(): boolean {
    return this.playedFlag;
  }

  /** 연출이 끝났다(끝까지 보았거나 건너뛰었다). 한 번만 알린다. */
  finish(): void {
    if (!this.pendingFlag) return;
    this.pendingFlag = false;
    this.playedFlag = true;
    this.events.emit('ENDING_FINISHED', undefined);
  }

  /** 저장 형태. */
  snapshot(): EndingSnapshot {
    return { pending: this.pendingFlag, played: this.playedFlag };
  }

  /** 저장에서 되돌린다. 이벤트를 내지 않는다. */
  restore(s: EndingSnapshot): void {
    this.playedFlag = s.played;
    this.pendingFlag = s.pending && !s.played;
  }
}
