// 화덕에서 요리한다 (MVP_SPEC 16, ARCHITECTURE 13.2 / 13.4, TASK-031). 이동은 MoveAction 이 먼저 끝냈다(복합 Action 금지).
// 시작할 때 CookingSystem 포트로 재료를 예약하고(소비하지 않는다), 게임 시간 1 시간 뒤 완료를 요청해 crop −2, food +3 을 확정한다.
// 주방이 해제되거나 화덕이 부서져 예약이 사라지면 failed 다. 취소·실패 때 예약 해제는 NPCSystem 이 한다.
import { balance } from '../data/balance';
import { standStill } from '../nav/MovementController';
import type { ActionStatus, Facility, FacilityUse, Vec3 } from '../types';
import type { Action, ActionContext } from './Action';

/** 조리 계획의 판단 키. */
export function cookKey(stoveObjectId: string): string {
  return `cook:${stoveObjectId}`;
}

/** Kitchen 의 화덕 하나에서 한 번 조리한다. */
export class CookAction implements Action {
  readonly kind = 'cook' as const;
  readonly label = '요리하는 중';
  readonly key: string;
  readonly pose = 'cook' as const;
  readonly lookAt: Vec3;
  readonly facilityUse: FacilityUse;
  /** 이 Action 이 잡고 있는 화덕. NPCSystem 이 바뀔 때 CookingSystem 예약을 잡고 푼다 */
  readonly cookStove: string;
  private startedAt = 0;
  private ok = false;

  /** 사용할 화덕 시설. 주민은 이미 그 접근 셀에 서 있다(판단이 보장한다). */
  constructor(readonly stove: Facility) {
    this.key = cookKey(stove.objectId);
    this.cookStove = stove.objectId;
    const a = stove.anchor;
    this.lookAt = { x: a.x + 0.5, y: a.y + 1, z: a.z + 0.5 };
    this.facilityUse = { objectId: stove.objectId, usePosition: stove.usePosition, pose: 'cook' };
  }

  /** 재료를 예약하고 시작 시각을 기록한다. 재료가 모자라거나 화덕을 쓸 수 없으면 다음 update 에서 failed. */
  start(ctx: ActionContext): void {
    this.startedAt = ctx.clock.gameMinutes;
    this.ok = ctx.services.cooking.begin(ctx.npc.id, this.stove.objectId);
  }

  /**
   * 화덕 앞에 서서 조리한다. 예약이 사라졌으면(주방 해제·화덕 파괴·재료 부족) failed,
   * 게임 시간 cookHours 가 지나면 완료를 요청해 성공하면 done 이다.
   */
  update(ctx: ActionContext, dt: number): ActionStatus {
    standStill(ctx.world, ctx.npc.body, dt);
    const cooking = ctx.services.cooking;
    if (!this.ok || !cooking.isCooking(ctx.npc.id, this.stove.objectId)) return 'failed';
    if (ctx.clock.gameMinutes - this.startedAt < balance.cooking.cookHours * 60) return 'running';
    return cooking.complete(ctx.npc.id, this.stove.objectId) ? 'done' : 'failed';
  }

  /** 재료는 아직 소비하지 않았으므로 되돌릴 것이 없다. 예약은 NPCSystem 이 푼다. */
  cancel(): void {}
}
