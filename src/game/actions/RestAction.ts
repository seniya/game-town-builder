// 침대가 없는 주민이 광장에서 쉰다 (MVP_SPEC 18.3 / 12.5, ARCHITECTURE 13.3, TASK-033).
// SleepAction 과 별개의 Action 이다. 감사 포인트를 주지 않는다. 잠들지 않고 앉아 있는다.
import { standStill } from '../nav/MovementController';
import type { ActionStatus, BlockPos } from '../types';
import { posKey } from '../types';
import type { Action, ActionContext } from './Action';

/** 광장의 한 칸에 앉아 취침 시간을 보낸다. 취침 시간이 끝나면 done 이다. */
export class RestAction implements Action {
  readonly kind = 'rest' as const;
  readonly label = '광장에서 쉬는 중';
  readonly pose = 'sit' as const;
  readonly key: string;

  /** 쉬는 칸. 주민은 이미 그 칸에 서 있어야 한다(판단이 보장한다). */
  constructor(readonly spot: BlockPos) {
    this.key = restKey(spot);
  }

  /** 시작할 때 할 일은 없다. 보상이 없다. */
  start(): void {}

  /** 앉아 있는다. 취침 시간이 끝나면 done. */
  update(ctx: ActionContext, dt: number): ActionStatus {
    standStill(ctx.world, ctx.npc.body, dt);
    return ctx.clock.phase === 'night' ? 'running' : 'done';
  }

  /** 정리할 것이 없다. */
  cancel(): void {}
}

/** 광장 휴식 계획의 판단 키. */
export function restKey(spot: BlockPos): string {
  return `rest:${posKey(spot)}`;
}
