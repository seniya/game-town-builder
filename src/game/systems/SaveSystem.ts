// 자동 저장 (ARCHITECTURE 4.1 의 16 번 / 23.3, TASK-051). 매일 07:00 과 종을 친 직후 저장 요청을 큐에 넣고,
// 프레임 끝(16 번 슬롯, 목표 갱신 뒤)의 커밋된 상태를 캡처해 저장소에 넘긴다. 저장 자체는 Action·예약을 바꾸지 않는다.
// 같은 슬롯의 쓰기는 순서대로 하나씩 한다. 쓰는 동안 새 요청이 오면 최신 스냅샷 하나로 합쳐 마지막에 쓴다.
// 실패하면 이전 슬롯을 그대로 두고(저장소가 트랜잭션으로 교체한다) SAVE_FAILED 를 알린다. 성공 전에는 완료로 알리지 않는다.
import { balance } from '../data/balance';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type { GameClockReader } from '../types';
import type { SaveData } from '../save/saveData';

/** 저장소 포트(브라우저는 IndexedDB). */
export interface SaveStore {
  write(data: SaveData): Promise<void>;
}

/** SaveSystem 이 쓰는 것. */
export interface SaveDeps {
  readonly events: EventBus;
  readonly clock: GameClockReader;
  /** 지금 상태를 캡처한다(살아 있는 데이터와 분리된 복사본) */
  readonly capture: () => SaveData;
  readonly store: SaveStore | null;
}

/** 저장 요청·순서·실패. */
export class SaveSystem implements SlotSystem {
  private requested = false;
  private writing = false;
  private queued: SaveData | null = null;
  private lastMorningDay: number;
  private okCount = 0;
  private failCount = 0;

  /** 종 치기를 구독한다. 시작 시각이 07:00 뒤면 그날 아침은 지난 것으로 본다. */
  constructor(private readonly deps: SaveDeps) {
    // 07:00 전에 시작했으면 그날 아침은 아직 오지 않았다
    const c = deps.clock;
    this.lastMorningDay = c.minuteOfDay >= balance.clock.workStartHour * 60 ? c.day : c.day - 1;
    deps.events.on('VILLAGE_LEVEL_UP', () => this.request());
  }

  /** 성공·실패 횟수(계측·시험). */
  get stats(): { saved: number; failed: number; writing: boolean } {
    return { saved: this.okCount, failed: this.failCount, writing: this.writing };
  }

  /** 저장을 요청한다. 이번 프레임 끝에 캡처한다. */
  request(): void {
    this.requested = true;
  }

  /** 16 번 슬롯: 07:00 경계를 넘었으면 요청하고, 요청이 있으면 커밋된 상태를 캡처해 쓴다. */
  update(): void {
    const c = this.deps.clock;
    if (c.day !== this.lastMorningDay && c.minuteOfDay >= balance.clock.workStartHour * 60) {
      this.lastMorningDay = c.day;
      this.requested = true;
    }
    if (!this.requested || !this.deps.store) return;
    this.requested = false;
    this.queued = this.deps.capture();
    void this.pump();
  }

  /** 대기 중인 최신 스냅샷을 순서대로 쓴다. */
  private async pump(): Promise<void> {
    if (this.writing || !this.deps.store) return;
    const store = this.deps.store;
    while (this.queued) {
      const data = this.queued;
      this.queued = null;
      this.writing = true;
      try {
        await store.write(data);
        this.okCount += 1;
        this.deps.events.emit('SAVE_COMPLETED', { gameMinutes: data.gameMinutes });
      } catch (e) {
        this.failCount += 1;
        this.deps.events.emit('SAVE_FAILED', {
          reason: e instanceof Error ? e.message : String(e),
        });
      } finally {
        this.writing = false;
      }
    }
  }
}
