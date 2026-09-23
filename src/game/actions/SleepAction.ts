// 침대에서 잔다 (MVP_SPEC 18.2, ARCHITECTURE 13.3 / 28.3, TASK-033). RestAction 과 별개의 Action 이다.
// body.pos 는 접근 셀에 그대로 두고 렌더가 facilityUse 로 침대 위에 눕는 자세를 그린다 (ARCHITECTURE 12.3).
// 감사 포인트 +5 는 GratitudeSystem(TASK-035) 이 생기면 ctx.services 포트로 요청한다. 지금은 보상이 없다.
import { standStill } from '../nav/MovementController';
import type { ActionStatus, Facility, FacilityUse } from '../types';
import type { Action, ActionContext } from './Action';

/** 배정된 침대 하나에서 잔다. 취침 시간(night)이 끝나면 done, 배정이 풀리면 failed 다. */
export class SleepAction implements Action {
  readonly kind = 'sleep' as const;
  readonly label = '자는 중';
  readonly key: string;
  readonly facilityUse: FacilityUse;

  /** 사용할 침대 시설. 주민은 이미 그 접근 셀에 서 있어야 한다(판단이 보장한다). */
  constructor(readonly bed: Facility) {
    this.key = sleepKey(bed.objectId);
    this.facilityUse = { objectId: bed.objectId, usePosition: bed.usePosition, pose: 'lie' };
  }

  /** 시작할 때 할 일은 없다(보상은 TASK-035). */
  start(): void {}

  /**
   * 누워 있는다. 배정이 풀렸으면(침대 파괴·방 해제·타입 변경) 깨어나 failed,
   * 취침 시간이 끝났으면 done 이다. 몸체는 접근 셀에서 중력만 받는다.
   */
  update(ctx: ActionContext, dt: number): ActionStatus {
    standStill(ctx.world, ctx.npc.body, dt);
    if (!ctx.services.sleep.isAssigned(ctx.npc.id, this.bed.objectId)) return 'failed';
    if (ctx.clock.phase !== 'night') return 'done';
    return 'running';
  }

  /** 정리할 것이 없다. 몸체는 처음부터 접근 셀에 있다. */
  cancel(): void {}
}

/** 침대 취침 계획의 판단 키. */
export function sleepKey(bedObjectId: string): string {
  return `sleep:${bedObjectId}`;
}
