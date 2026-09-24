// 대화 (MVP_SPEC 19.3 / 19.4 의 2 단계, TASK-040). 플레이어와 대화하는 동안 제자리에 서서 플레이어를 본다.
// 대화의 진행·완료는 DialogueSystem 이 소유한다. 이 Action 은 판단이 대화 계획을 주는 동안 유지된다.
import { standStill } from '../nav/MovementController';
import type { ActionStatus, Vec3 } from '../types';
import type { Action, ActionContext } from './Action';

/** 대화 중. 끝나지 않는다(대화가 끝나면 판단이 다른 계획을 준다). */
export class TalkAction implements Action {
  readonly kind = 'talk' as const;
  readonly label = '대화 중';
  readonly key = 'talk';

  /** 바라볼 곳(플레이어 위치). 렌더 전용이다. */
  constructor(readonly lookAt: Vec3 | undefined) {}

  /** 시작할 때 할 일은 없다. */
  start(): void {}

  /** 제자리에 선다. */
  update(ctx: ActionContext, dt: number): ActionStatus {
    standStill(ctx.world, ctx.npc.body, dt);
    return 'running';
  }

  /** 정리할 것이 없다. */
  cancel(): void {}
}
