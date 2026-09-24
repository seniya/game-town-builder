// 기본 행동 (MVP_SPEC 19.4 의 5 단계). 제자리에 서 있고 중력만 받는다.
import { standStill } from '../nav/MovementController';
import type { ActionStatus, UsePose } from '../types';
import type { Action, ActionContext } from './Action';

/**
 * 대기. 끝나지 않는다(판단이 다른 계획을 줄 때까지 running).
 * 아직 구현하지 않은 Action 의 계획(식사·역할·도피·대화)도 key 와 label 을 받아 이 Action 으로 대신 선다.
 * 그 경우 label 이 무엇을 기다리는지 알려 준다(디버그 패널).
 */
export class IdleAction implements Action {
  readonly kind = 'idle' as const;

  /** 표시 이름·판단 키·자세(기절은 주저앉는다). 기본은 순수한 대기다. */
  constructor(
    readonly label = '대기',
    readonly key = 'idle',
    readonly pose?: UsePose,
  ) {}

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
