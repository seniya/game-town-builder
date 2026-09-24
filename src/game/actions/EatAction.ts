// 먹는다 (MVP_SPEC 17 / 17.1, ARCHITECTURE 13.2 / 13.4, TASK-032). 이동은 MoveAction 이 먼저 끝냈다(복합 Action 금지).
// 앉을 때 MealSystem 포트로 food 1 을 소비하고 이번 끼니를 먹었다고 기록한다. 그 뒤 eatGameMinutes 동안 앉아서 먹는 모습을 보인다.
// 식당 의자면 의자에 앉고(렌더가 facilityUse 로 옮긴다) 식탁 위에 음식 연출이 놓인다. 의자가 없으면 광장에 앉아 먹는다.
// 몸체는 접근 셀(또는 광장 칸)에 그대로 둔다 (ARCHITECTURE 12.3). 의자 예약은 NPCSystem 이 잡고 푼다.
import { balance } from '../data/balance';
import { standStill } from '../nav/MovementController';
import type { ActionStatus, DiningSeat, FacilityUse, Vec3 } from '../types';
import { aboveHead, type Action, type ActionContext } from './Action';

/** 식사 계획의 판단 키. 의자가 없으면 광장이다. */
export function eatKey(seatObjectId: string | null): string {
  return `eat:${seatObjectId ?? 'plaza'}`;
}

/** 이번 끼니를 한 번 먹는다. food 가 없으면 곧바로 failed(먹지 않고 넘어간다). */
export class EatAction implements Action {
  readonly kind = 'eat' as const;
  readonly label: string;
  readonly key: string;
  readonly pose = 'sit' as const;
  readonly facilityUse?: FacilityUse;
  readonly lookAt?: Vec3;
  /** 앉는 의자. NPCSystem 이 시설 예약으로 잡는다 */
  readonly facilityClaim?: string;
  private startedAt = 0;
  private ok = false;

  /** 앉을 식당 의자. null 이면 광장에서 먹는다. 주민은 이미 그 접근 셀(또는 광장 칸)에 서 있다. */
  constructor(readonly seat: DiningSeat | null) {
    this.key = eatKey(seat?.objectId ?? null);
    this.label = seat ? '식당에서 먹는 중' : '광장에서 먹는 중';
    if (seat) {
      this.facilityUse = { objectId: seat.objectId, usePosition: seat.usePosition, pose: 'sit' };
      this.lookAt = seat.tableTop;
      this.facilityClaim = seat.objectId;
    }
  }

  /** 음식을 먹는다(food −1). 구간 밖·food 부족·의자를 쓸 수 없으면 다음 update 에서 failed. */
  start(ctx: ActionContext): void {
    this.startedAt = ctx.clock.gameMinutes;
    // +2 는 식탁 위(의자에 앉은 머리 높이)에 띄운다. 몸체는 접근 셀이므로 의자 위치를 쓴다
    const at = this.seat
      ? { x: this.seat.usePosition.x, y: this.seat.usePosition.y + 1.6, z: this.seat.usePosition.z }
      : aboveHead(ctx);
    this.ok = ctx.services.meal.eat(ctx.npc.id, this.seat?.objectId ?? null, at);
  }

  /**
   * 앉아서 먹는 모습을 보인다. 먹는 시간이 지났거나 식사 구간이 끝났으면 done 이다.
   * 의자가 사라지면(식당 해제·파괴) 이미 먹었으므로 done 으로 일어선다.
   */
  update(ctx: ActionContext, dt: number): ActionStatus {
    standStill(ctx.world, ctx.npc.body, dt);
    if (!this.ok) return 'failed';
    const meal = ctx.services.meal;
    if (this.seat && !meal.isSeatUsable(this.seat.objectId)) return 'done';
    if (!meal.active()) return 'done';
    const eaten = ctx.clock.gameMinutes - this.startedAt >= balance.meal.eatGameMinutes;
    return eaten ? 'done' : 'running';
  }

  /** 음식은 앉을 때 이미 먹었다. 되돌릴 것이 없다. 의자 예약은 NPCSystem 이 푼다. */
  cancel(): void {}
}
