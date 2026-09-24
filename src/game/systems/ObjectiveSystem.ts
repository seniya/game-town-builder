// 목표 (MVP_SPEC 27.4 / 29, ARCHITECTURE 21, TASK-041). 현재 목표 하나의 소유자다. update 16 번 슬롯.
// 대사 종료(DIALOGUE_ENDED)의 nextObjective 와 이벤트 커맨드(setObjective, TASK-042)가 같은 apply 를 쓴다.
// 목표는 진행 이벤트 순서로만 전진한다: 현재보다 이른 단계의 목표는 무시하고, 같은 목표의 재적용은 아무것도 바꾸지 않는다.
// 진행 수치(current)는 저장하지 않고 매 프레임 원천 소유자의 집계에서 읽는다.
import { dialogueById } from '../data/dialogues';
import { eventRank } from '../data/gameEventOrder';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type { ObjectiveDefinition, ObjectiveProgressKind } from '../types';

/** 목표 표시 한 줄. progress 가 없으면 수치를 붙이지 않는다. */
export interface ObjectiveView {
  readonly text: string;
  readonly progress?: { readonly current: number; readonly total: number };
}

/** 진행 수치의 원천 집계. */
export type ObjectiveSources = Readonly<Record<ObjectiveProgressKind, () => number>>;

/** 현재 목표와 표시. */
export class ObjectiveSystem implements SlotSystem {
  private current: ObjectiveDefinition | null = null;
  private shown: ObjectiveView | null = null;

  /** 대사 종료를 구독한다. sources 는 진행 수치의 원천이다. */
  constructor(
    private readonly events: EventBus,
    private readonly sources: ObjectiveSources,
  ) {
    events.on('DIALOGUE_ENDED', (e) => {
      const next = dialogueById(e.dialogueId)?.nextObjective;
      if (next) this.apply(next);
    });
  }

  /** 현재 목표 정의. 없으면 null. */
  get objective(): ObjectiveDefinition | null {
    return this.current;
  }

  /** 지금 표시할 한 줄. 없으면 null. */
  get view(): ObjectiveView | null {
    return this.shown;
  }

  /**
   * 목표를 적용한다. 현재보다 이른 단계(sourceEventId 순서)이거나 같은 목표이면 바꾸지 않고 false.
   * 대사·이벤트 커맨드·로드가 모두 이 경로를 쓴다.
   */
  apply(def: ObjectiveDefinition): boolean {
    const cur = this.current;
    if (cur && (cur.id === def.id || eventRank(def.sourceEventId) < eventRank(cur.sourceEventId))) {
      return false;
    }
    this.current = def;
    this.refresh();
    return true;
  }

  /** 16 번 슬롯: 진행 수치를 원천에서 다시 읽고, 표시가 바뀌면 OBJECTIVE_CHANGED 를 낸다. */
  update(): void {
    this.refresh();
  }

  /** 저장용: 현재 목표 정의(표시 수치는 저장하지 않는다). */
  snapshot(): ObjectiveDefinition | null {
    return this.current;
  }

  /** 로드 복원. 순서 검사 없이 그대로 쓴다. */
  restore(def: ObjectiveDefinition | null): void {
    this.current = def;
    this.shown = null;
    this.refresh();
  }

  /** 표시를 계산하고 바뀌었으면 알린다. */
  private refresh(): void {
    const d = this.current;
    const next: ObjectiveView | null = d
      ? d.progress
        ? {
            text: d.text,
            progress: {
              current: Math.min(d.progress.total, this.sources[d.progress.kind]()),
              total: d.progress.total,
            },
          }
        : { text: d.text }
      : null;
    const prev = this.shown;
    const same =
      prev?.text === next?.text &&
      prev?.progress?.current === next?.progress?.current &&
      prev?.progress?.total === next?.progress?.total;
    if (same && (prev === null) === (next === null)) return;
    this.shown = next;
    if (next) {
      this.events.emit(
        'OBJECTIVE_CHANGED',
        next.progress ? { text: next.text, progress: next.progress } : { text: next.text },
      );
    }
  }
}
