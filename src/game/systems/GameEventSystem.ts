// 진행 이벤트 (MVP_SPEC 27, ARCHITECTURE 20, ADR 007 / 010, TASK-042). update 15 번 슬롯.
// 이벤트 정의는 순수 함수다: canTrigger 로 조건을 보고 execute 는 부작용 대신 커맨드 배열을 반환한다.
// 커맨드는 이 시스템 한 곳에서만 해석해 소유자의 API 를 부른다. 완료는 먼저 기록하며 제거하는 경로가 없다 (27.3).
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type {
  EventContext,
  GameCommand,
  GameEventDefinition,
  GameEventId,
  GratitudeSource,
  ObjectiveDefinition,
  Vec3,
} from '../types';

export type { EventContext, GameCommand, GameEventDefinition } from '../types';

/** 커맨드를 받는 소유자의 포트. */
export interface GameCommandPorts {
  setObjective(objective: ObjectiveDefinition): void;
  /** 대화 표시 등록. npcId 는 대사 데이터의 화자 키와 같아야 한다 */
  markDialogueAvailable(npcId: string, dialogueId: string): void;
  gainGratitude(source: GratitudeSource, amount: number, at: Vec3): void;
  playCutscene(id: string): void;
}

/** GameEventSystem 이 쓰는 것. */
export interface GameEventDeps {
  readonly events: EventBus;
  readonly definitions: readonly GameEventDefinition[];
  /** completed 를 뺀 나머지 snapshot 을 조립한다 */
  readonly context: () => Omit<EventContext, 'completed'>;
  readonly ports: GameCommandPorts;
}

/** 이벤트 평가·완료 기록·커맨드 해석. */
export class GameEventSystem implements SlotSystem {
  private readonly done = new Set<GameEventId>();

  /** 정의·snapshot 조립·포트를 받는다. */
  constructor(private readonly deps: GameEventDeps) {}

  /** 완료한 이벤트(읽기 전용 복사본). */
  get completed(): ReadonlySet<GameEventId> {
    return new Set(this.done);
  }

  /**
   * 15 번 슬롯: 정의 순서대로 평가한다. 조건을 만족한 이벤트는 완료를 먼저 기록하고 커맨드를 실행한다 (20.2).
   * 같은 프레임의 뒤 이벤트는 앞 이벤트의 완료를 본다(이벤트마다 snapshot 을 다시 조립한다).
   */
  update(): void {
    for (const def of this.deps.definitions) {
      if (this.done.has(def.id)) continue;
      const ctx: EventContext = { ...this.deps.context(), completed: this.completed };
      if (!def.canTrigger(ctx)) continue;
      this.done.add(def.id);
      const commands = def.execute(ctx);
      this.deps.events.emit('GAME_EVENT_FIRED', { id: def.id });
      for (const c of commands) this.dispatch(c);
    }
  }

  /** 로드 복원. 완료 집합을 그대로 쓴다(커맨드를 다시 실행하지 않는다). */
  restore(completed: readonly GameEventId[]): void {
    this.done.clear();
    for (const id of completed) this.done.add(id);
  }

  /** 커맨드 하나를 소유자의 API 로 옮긴다. 커맨드를 해석하는 유일한 곳이다. */
  private dispatch(c: GameCommand): void {
    const p = this.deps.ports;
    switch (c.kind) {
      case 'setObjective':
        p.setObjective(c.objective);
        return;
      case 'markDialogueAvailable':
        p.markDialogueAvailable(c.npcId, c.dialogueId);
        return;
      case 'gainGratitude':
        p.gainGratitude(c.source, c.amount, c.at);
        return;
      case 'playCutscene':
        p.playCutscene(c.id);
        return;
    }
  }
}
