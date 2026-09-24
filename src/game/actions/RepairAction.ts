// 수리 (MVP_SPEC 25.2, ARCHITECTURE 13.2 / 19, TASK-048). 이동은 MoveAction 이 먼저 끝냈다(복합 Action 금지).
// 작업 칸에서 피해 칸을 보고 망치질하며, 점유 복셀당 게임 15 분이 지나면 RepairSystem.complete 로 복원을 확정한다.
// 도중에 플레이어가 채우면(미수리에서 빠지면) 곧바로 끝난다. 재료를 쓰지 않는다. 예약은 NPCSystem 이 잡고 푼다.
import { balance } from '../data/balance';
import { standStill } from '../nav/MovementController';
import type { ActionStatus, BlockPos, Vec3 } from '../types';
import type { Action, ActionContext } from './Action';

/** 피해 한 건을 복원한다. */
export class RepairAction implements Action {
  readonly kind = 'repair' as const;
  readonly label = '고치는 중';
  readonly key: string;
  readonly pose = 'work' as const;
  readonly lookAt: Vec3;
  /** 잡고 있는 수리 후보(NPCSystem 시설 예약 키) */
  readonly facilityClaim: string;
  private startedAt = 0;

  /** 피해 id·칸·예약 키. */
  constructor(
    readonly damageId: string,
    readonly cells: readonly BlockPos[],
    claimKey: string,
  ) {
    this.key = `repair:${damageId}`;
    this.facilityClaim = claimKey;
    const c = cells[0] ?? { x: 0, y: 0, z: 0 };
    this.lookAt = { x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 };
  }

  /** 시작 시각을 기록한다. */
  start(ctx: ActionContext): void {
    this.startedAt = ctx.clock.gameMinutes;
  }

  /** 칸 수 × 15 게임분 뒤 복원한다. 이미 채워졌으면 done, 복원에 실패하면 failed. */
  update(ctx: ActionContext, dt: number): ActionStatus {
    standStill(ctx.world, ctx.npc.body, dt);
    const repair = ctx.services.repair;
    if (!repair.isPending(this.damageId)) return 'done';
    const need = this.cells.length * balance.carpenter.repairMinutesPerBlock;
    if (ctx.clock.gameMinutes - this.startedAt < need) return 'running';
    return repair.complete(this.damageId) ? 'done' : 'failed';
  }

  /** 복원 전이면 아무것도 바뀌지 않았다. */
  cancel(): void {}
}
