// 진행 이벤트 8 개 (MVP_SPEC 27.1, ARCHITECTURE 20.3, TASK-043). 조건과 결과는 순수 함수다.
// 표의 순서대로 이전 이벤트 완료를 AND 로 붙인다. 모든 조건은 게임 상태만으로 결정된다(난수·모호한 시간 없음, 27.2).
// 결과는 대화 표시·목표·감사 포인트 +15·연출 커맨드뿐이다. 주민을 만들거나 해금하지 않는다 (ADR 010).
import type { EventContext, GameCommand, GameEventDefinition, GameEventId } from '../types';
import { balance } from './balance';

/** 하루의 게임분. gameMinutes 0 이 Day 1 07:00 이므로 07:00 은 이 값의 배수에 온다 (MVP_SPEC 20). */
const DAY = 24 * 60;

/** t 보다 엄격히 뒤인 첫 07:00 의 gameMinutes. */
function first7AmAfter(t: number): number {
  return (Math.floor(t / DAY) + 1) * DAY;
}

/** 이벤트 보상 +15 를 종 위에 띄운다. */
function reward(id: GameEventId, ctx: EventContext): GameCommand {
  return {
    kind: 'gainGratitude',
    amount: balance.gratitude.onGameEvent,
    source: { kind: 'gameEvent', id },
    at: ctx.bellWorldCenter,
  };
}

/** 대화 표시 등록 커맨드. */
function talk(npcId: string, dialogueId: string): GameCommand {
  return { kind: 'markDialogueAvailable', npcId, dialogueId };
}

/** 이전 이벤트가 완료되었는가. */
function after(ctx: EventContext, id: GameEventId): boolean {
  return ctx.completed.has(id);
}

/** 습격 raidId 의 결과. 없으면 undefined. */
function raid(ctx: EventContext, raidId: number) {
  return ctx.raidResults.find((r) => r.raidId === raidId);
}

/** 표의 순서다. GameEventSystem 은 이 순서로 평가한다. */
export const GAME_EVENTS: readonly GameEventDefinition[] = [
  {
    id: 'EVENT_ARRIVAL',
    canTrigger: () => true,
    execute: (ctx) => [
      {
        kind: 'setObjective',
        objective: {
          id: 'objective_explore',
          sourceEventId: 'EVENT_ARRIVAL',
          text: '섬을 둘러보세요',
          progress: null,
        },
      },
      talk('farmer', 'farmer_first'),
      talk('cook', 'cook_first'),
      talk('carpenter', 'carpenter_first'),
      reward('EVENT_ARRIVAL', ctx),
    ],
  },
  {
    // 첫 농부 대화 완료가 명시 조건이다. 밭 목표는 그 대사의 nextObjective 가 이미 적용했다 (27.4)
    id: 'EVENT_FARM_REQUEST',
    canTrigger: (ctx) => after(ctx, 'EVENT_ARRIVAL') && ctx.dialogueCompleted.has('farmer_first'),
    execute: (ctx) => [reward('EVENT_FARM_REQUEST', ctx)],
  },
  {
    id: 'EVENT_KITCHEN_REQUEST',
    canTrigger: (ctx) => after(ctx, 'EVENT_FARM_REQUEST') && ctx.storage.crop >= 3,
    execute: (ctx) => [talk('cook', 'kitchen_request'), reward('EVENT_KITCHEN_REQUEST', ctx)],
  },
  {
    id: 'EVENT_BEDROOM_REQUEST',
    canTrigger: (ctx) => after(ctx, 'EVENT_KITCHEN_REQUEST') && ctx.storage.food >= 3,
    execute: (ctx) => [talk('carpenter', 'bedroom_request'), reward('EVENT_BEDROOM_REQUEST', ctx)],
  },
  {
    // 인식된 방은 EmptyRoom 을 포함하고 dirty 방은 세지 않는다. 레벨 게이트와 같은 기준이다
    id: 'EVENT_BELL_REQUEST',
    canTrigger: (ctx) =>
      after(ctx, 'EVENT_BEDROOM_REQUEST') &&
      ctx.rooms.filter((r) => !r.dirty).length >= (balance.village.levels[1]?.gate.minRooms ?? 2),
    execute: (ctx) => [talk('carpenter', 'bell_intro'), reward('EVENT_BELL_REQUEST', ctx)],
  },
  {
    id: 'EVENT_WALL_REQUEST',
    canTrigger: (ctx) => after(ctx, 'EVENT_BELL_REQUEST') && raid(ctx, 1) !== undefined,
    execute: (ctx) => [talk('carpenter', 'wall_request'), reward('EVENT_WALL_REQUEST', ctx)],
  },
  {
    // 도착 사실만 확인한다. 스폰은 ResidentArrivalSystem 만 한다 (27.1)
    id: 'EVENT_NEW_RESIDENT',
    canTrigger: (ctx) =>
      after(ctx, 'EVENT_WALL_REQUEST') && ctx.villageLevel >= 3 && ctx.worldState.population >= 5,
    execute: (ctx) => [
      talk('farmer', 'new_resident_welcome'),
      { kind: 'playCutscene', id: 'new_resident' },
      reward('EVENT_NEW_RESIDENT', ctx),
    ],
  },
  {
    // 2 차 습격 종료 뒤 첫 07:00 에 도달했는가(누적 시각 비교, 등호 한 프레임에 의존하지 않는다)
    id: 'EVENT_SLICE_END',
    canTrigger: (ctx) => {
      const second = raid(ctx, 2);
      return (
        after(ctx, 'EVENT_NEW_RESIDENT') &&
        second !== undefined &&
        ctx.clock.gameMinutes >= first7AmAfter(second.endedAtGameMinutes) &&
        ctx.worldState.population >= 5
      );
    },
    execute: (ctx) => [
      talk('cook', 'slice_end_thanks'),
      { kind: 'playCutscene', id: 'slice_end' },
      reward('EVENT_SLICE_END', ctx),
    ],
  },
];
