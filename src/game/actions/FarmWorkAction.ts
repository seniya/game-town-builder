// 심기·수확 (MVP_SPEC 15.3 / 15.4, ARCHITECTURE 13.2, TASK-030). 이동은 MoveAction 이 먼저 끝냈다(복합 Action 금지).
// 효과는 시작할 때 한 번 FarmSystem 포트로 확정한다(도착 즉시 완료). 그 뒤 workPoseSeconds 동안 작업 자세만 보인다.
import { balance } from '../data/balance';
import { standStill } from '../nav/MovementController';
import { posKey, type ActionStatus, type BlockPos, type Vec3 } from '../types';
import type { Action, ActionContext } from './Action';

/** 심기와 수확의 공통 틀. 두 Action 은 확정하는 서비스만 다르다. */
abstract class FarmWorkAction implements Action {
  abstract readonly kind: 'plant' | 'harvest';
  abstract readonly label: string;
  readonly key: string;
  readonly pose = 'work' as const;
  readonly lookAt: Vec3;
  private elapsed = 0;
  private ok = false;

  /** 작업할 farmland 칸. 주민은 이미 그 작업 칸에 서 있다(판단이 보장한다). */
  constructor(readonly farmTarget: BlockPos) {
    this.key = `${this.keyPrefix()}:${posKey(farmTarget)}`;
    this.lookAt = { x: farmTarget.x + 0.5, y: farmTarget.y + 1, z: farmTarget.z + 0.5 };
  }

  /** 판단 키 접두어. */
  protected abstract keyPrefix(): string;

  /** 결과를 확정한다. */
  protected abstract commit(ctx: ActionContext): boolean;

  /** 도착 즉시 결과를 확정한다 (MVP_SPEC 15.3). */
  start(ctx: ActionContext): void {
    this.ok = this.commit(ctx);
  }

  /** 확정에 실패했으면 failed, 아니면 작업 자세를 잠깐 보인 뒤 done. */
  update(ctx: ActionContext, dt: number): ActionStatus {
    standStill(ctx.world, ctx.npc.body, dt);
    if (!this.ok) return 'failed';
    this.elapsed += dt;
    return this.elapsed >= balance.farm.workPoseSeconds ? 'done' : 'running';
  }

  /** 결과는 이미 확정되었으므로 되돌릴 것이 없다. 예약은 NPCSystem 이 푼다. */
  cancel(): void {}
}

/** 빈 farmland 에 씨앗을 심는다: seed −1 (MVP_SPEC 15.3). */
export class PlantAction extends FarmWorkAction {
  readonly kind = 'plant' as const;
  readonly label = '씨앗을 심는 중';

  /** 키 접두어. */
  protected keyPrefix(): string {
    return 'plant';
  }

  /** FarmSystem.plant. */
  protected commit(ctx: ActionContext): boolean {
    return ctx.services.farm.plant(this.farmTarget);
  }
}

/** 성숙 작물을 수확한다: crop +1, seed +1 (MVP_SPEC 15.3). */
export class HarvestAction extends FarmWorkAction {
  readonly kind = 'harvest' as const;
  readonly label = '수확하는 중';

  /** 키 접두어. */
  protected keyPrefix(): string {
    return 'harvest';
  }

  /** FarmSystem.harvest. */
  protected commit(ctx: ActionContext): boolean {
    return ctx.services.farm.harvest(this.farmTarget);
  }
}
