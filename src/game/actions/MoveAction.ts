// 지정한 목적지까지 걷는다 (ARCHITECTURE 11 / 13, TASK-028). 경로는 PathScheduler 에 요청하고 결과를 기다린다.
// 동기 응답을 전제하지 않는다: 요청 중에는 제자리에 서 있고, 끝나면 경로를 따른다.
// 경로 위 칸이 바뀌면(감시) 또는 연속으로 막히면 0.5 초 간격 제한 안에서 현재 칸부터 다시 요청한다.
import { balance } from '../data/balance';
import { MovementController, standStill } from '../nav/MovementController';
import { pathWatchCells } from '../nav/NavigationGraph';
import type { PathGoal } from '../nav/pathfind';
import type { PathRequest } from '../nav/PathScheduler';
import type { ActionStatus, BlockPos } from '../types';
import type { Action, ActionContext } from './Action';

/** 실패 사유. NO_PATH 는 목적지까지 실제 경로가 없다는 뜻이다. */
export type MoveFailure = 'NO_PATH' | 'NO_START';

/**
 * 발밑 칸에서 경로 출발 칸을 고른다. 발 칸이 서 있을 수 없는 칸(오르는 중·문턱·끼임)이면
 * 위·아래 한 칸과 수평 이웃에서 가장 가까운 설 수 있는 칸을 쓴다. 없으면 null.
 */
export function startCellOf(ctx: ActionContext): BlockPos | null {
  const p = ctx.npc.body.pos;
  const base = { x: Math.floor(p.x), y: Math.floor(p.y + 0.01), z: Math.floor(p.z) };
  const candidates: BlockPos[] = [base, { ...base, y: base.y + 1 }, { ...base, y: base.y - 1 }];
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    for (const dy of [0, 1, -1])
      candidates.push({ x: base.x + dx, y: base.y + dy, z: base.z + dz });
  }
  return candidates.find((c) => ctx.nav.isStandable(c, 'npc')) ?? null;
}

/** 경로를 요청하고 따라 걷는 Action. */
export class MoveAction implements Action {
  readonly kind = 'move' as const;
  private request: PathRequest | null = null;
  private controller: MovementController | null = null;
  private unwatch: (() => void) | null = null;
  private following = false;
  /** 실패했을 때의 사유. NPCSystem 이 실패 보고에 쓴다 */
  failure: MoveFailure | null = null;

  /** 목적지·판단 키·표시 이름. destination 은 디버그 표시용 대표 칸이다. */
  constructor(
    readonly goal: PathGoal,
    readonly key: string,
    readonly label: string,
    readonly destination: BlockPos | null,
  ) {}

  /** 남은 경로(디버그). */
  get remainingPath(): readonly BlockPos[] {
    return this.following && this.controller ? this.controller.remaining : [];
  }

  /** 첫 경로를 요청한다. */
  start(ctx: ActionContext): void {
    this.controller = new MovementController(ctx.world);
    this.requestFromHere(ctx);
  }

  /** 요청을 기다리거나 경로를 따른다. */
  update(ctx: ActionContext, dt: number): ActionStatus {
    const controller = this.controller;
    if (!controller) return 'failed';
    const body = ctx.npc.body;
    if (this.failure) return 'failed';
    const req = this.request;
    if (req) {
      if (req.status === 'pending') {
        // 요청 중에는 제자리에 선다. 새 경로의 출발 칸이 몸체 위치와 어긋나지 않게 한다(보통 한 프레임)
        standStill(ctx.world, body, dt);
        return 'running';
      }
      this.request = null;
      const path = req.result?.path;
      if (!path) {
        this.failure = 'NO_PATH';
        return 'failed';
      }
      this.follow(ctx, path);
    }
    const status = controller.update(dt, body, balance.npc.moveSpeed);
    if (status === 'arrived') {
      this.stopWatching();
      return 'done';
    }
    if (controller.takeRepath()) this.requestFromHere(ctx);
    return 'running';
  }

  /** 요청과 경로 감시를 정리한다. */
  cancel(ctx: ActionContext): void {
    if (this.request) ctx.paths.cancel(this.request);
    this.request = null;
    this.stopWatching();
  }

  /** 지금 서 있는 칸에서 경로를 요청한다. 출발 칸이 없으면 실패로 둔다. */
  private requestFromHere(ctx: ActionContext): void {
    if (this.request) ctx.paths.cancel(this.request);
    const from = startCellOf(ctx);
    if (!from) {
      this.failure = 'NO_START';
      return;
    }
    this.request = ctx.paths.request(from, this.goal, 'npc');
  }

  /** 경로를 따르기 시작하고 경로 칸을 감시한다. 경로가 바뀌면 컨트롤러에 알린다. */
  private follow(ctx: ActionContext, path: readonly BlockPos[]): void {
    const controller = this.controller;
    if (!controller) return;
    this.stopWatching();
    controller.setPath(path);
    this.following = true;
    this.unwatch = ctx.nav.watch(pathWatchCells(path), () => controller.invalidate());
  }

  /** 경로 감시를 해제한다. */
  private stopWatching(): void {
    this.unwatch?.();
    this.unwatch = null;
  }
}
