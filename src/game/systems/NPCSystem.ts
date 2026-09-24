// NPC 실행 (ARCHITECTURE 4.1 의 11 번, 13, 15). 판단이 넘긴 계획을 Action 으로 만들어 시작하고 매 프레임 진행한다.
// start / cancel 을 한 번씩 보장한다. Action 이 바뀌면 NPC_ACTION_CHANGED 를 발행한다.
// 임시 시설(화덕·의자) 예약의 소유자다: objectId 별로 한 명만 잡고 Action 이 바뀔 때 옮긴다 (MVP_SPEC 12.4, ARCHITECTURE 14.4).
// 아직 구현하지 않은 계획(수리 048·도피 047)은 그 사실을 적은 대기로 대신 선다.
import { balance } from '../data/balance';
import { CookAction } from '../actions/CookAction';
import { EatAction } from '../actions/EatAction';
import { HarvestAction, PlantAction } from '../actions/FarmWorkAction';
import { IdleAction } from '../actions/IdleAction';
import { MoveAction } from '../actions/MoveAction';
import { RestAction } from '../actions/RestAction';
import { SleepAction } from '../actions/SleepAction';
import { TalkAction } from '../actions/TalkAction';
import type { Action, ActionContext, ActionServices, RoomQuery } from '../actions/Action';
import type { NPC } from '../entities/NPC';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type { NavigationGraph } from '../nav/NavigationGraph';
import type { PathScheduler } from '../nav/PathScheduler';
import type { BlockPos, GameClockReader } from '../types';
import type { CollisionWorld } from '../voxel/collision';
import type { ActionPlan, MovePurpose } from './NPCDecisionSystem';

/** NPCSystem 이 Action 에 넘길 것들. */
export interface NPCSystemDeps {
  readonly npcs: () => Iterable<NPC<Action>>;
  readonly world: CollisionWorld;
  readonly nav: NavigationGraph;
  readonly paths: PathScheduler;
  readonly rooms: RoomQuery;
  readonly clock: GameClockReader;
  readonly events: EventBus;
  readonly services: ActionServices;
  /** 침대로 가는 이동이 경로를 찾지 못했을 때 (SleepSystem.reportUnreachable) */
  readonly onBedUnreachable: (npcId: string, bedObjectId: string) => void;
  /** 밭 칸 예약 (FarmSystem). 없으면 농사가 없는 월드다 */
  readonly farmClaims?: {
    claim(npcId: string, target: BlockPos): boolean;
    release(npcId: string, target: BlockPos): void;
  };
  /** 조리가 끝나거나 취소·실패했을 때 재료 예약을 푼다 (CookingSystem.release). 없으면 요리가 없는 월드다 */
  readonly releaseIngredients?: (npcId: string) => void;
}

/** 아직 구현하지 않은 계획의 대기 표시 이름. */
const NOT_YET: Record<'role' | 'flee', string> = {
  role: '역할 작업 대기 (TASK-048)',
  flee: '도피 대기 (TASK-047)',
};

/** 계획을 Action 으로 만든다. */
export function createAction(plan: ActionPlan): Action {
  switch (plan.kind) {
    case 'idle':
      return new IdleAction(plan.label, plan.key);
    case 'move':
      return new PlannedMove(plan.goal, plan.key, plan.label, plan.destination, plan.purpose);
    case 'sleep':
      return new SleepAction(plan.bed);
    case 'rest':
      return new RestAction(plan.spot);
    case 'plant':
      return new PlantAction(plan.target);
    case 'harvest':
      return new HarvestAction(plan.target);
    case 'cook':
      return new CookAction(plan.stove);
    case 'eat':
      return new EatAction(plan.seat);
    case 'talk':
      return new TalkAction(plan.toward ?? undefined);
    case 'role':
    case 'flee':
      return new IdleAction(NOT_YET[plan.kind], plan.key);
  }
}

/** 목적을 기억하는 이동. 실패하면 NPCSystem 이 목적에 따라 소유자에게 알린다. */
class PlannedMove extends MoveAction {
  /** MoveAction 인자에 목적을 더한다. */
  constructor(
    goal: ConstructorParameters<typeof MoveAction>[0],
    key: string,
    label: string,
    destination: ConstructorParameters<typeof MoveAction>[3],
    readonly purpose: MovePurpose,
  ) {
    super(goal, key, label, destination);
  }

  /** 밭으로 가는 이동이면 그 칸을 예약 대상으로 알린다. */
  get farmTarget(): BlockPos | undefined {
    return this.purpose.kind === 'farm' ? this.purpose.target : undefined;
  }

  /** 화덕·의자로 가는 이동이면 그 시설을 예약 대상으로 알린다. */
  get facilityClaim(): string | undefined {
    if (this.purpose.kind === 'cook') return this.purpose.stoveObjectId;
    if (this.purpose.kind === 'seat') return this.purpose.seatObjectId;
    return undefined;
  }
}

/** 주민들의 Action 을 실행한다. */
export class NPCSystem implements SlotSystem {
  private readonly planned = new Map<string, ActionPlan>();
  private readonly started = new WeakSet<Action>();
  /** 실패한 계획 키와 실패 시각(실행 누적 초). 같은 계획을 매 프레임 다시 시작하지 않게 한다 */
  private readonly failed = new Map<string, { key: string; at: number }>();
  /** 임시 시설 objectId → 예약한 npcId */
  private readonly facilityOwner = new Map<string, string>();
  private elapsed = 0;

  /** 의존 포트를 받는다. */
  constructor(private readonly deps: NPCSystemDeps) {}

  /** 이 시설을 다른 주민이 예약했는가. 후보를 좁히는 소유 시스템(Cooking / Meal)이 읽는다. */
  facilityTaken(objectId: string, npcId: string): boolean {
    const owner = this.facilityOwner.get(objectId);
    return owner !== undefined && owner !== npcId;
  }

  /** 예약된 임시 시설 수 (F3·테스트). */
  get facilityClaims(): number {
    return this.facilityOwner.size;
  }

  /** 판단이 준 계획. 같은 프레임의 실행 슬롯에서 적용한다. */
  assign(npcId: string, plan: ActionPlan): void {
    this.planned.set(npcId, plan);
  }

  /** 계획을 적용하고 Action 을 한 프레임 진행한다. 끝났거나 실패하면 대기로 돌아간다. */
  update(dt: number): void {
    this.elapsed += dt;
    for (const npc of this.deps.npcs()) {
      const ctx = this.contextFor(npc);
      const plan = this.planned.get(npc.id);
      if (plan) this.planned.delete(npc.id);
      if (plan && !this.recentlyFailed(npc.id, plan.key)) {
        this.switchTo(ctx, createAction(plan), true);
      } else if (!this.started.has(npc.action)) {
        this.switchTo(ctx, npc.action, false);
      }
      const status = npc.action.update(ctx, dt);
      if (status === 'running') continue;
      if (status === 'failed') {
        this.failed.set(npc.id, { key: npc.action.key, at: this.elapsed });
        this.reportFailure(npc.id, npc.action);
      }
      this.switchTo(ctx, new IdleAction(), false);
    }
  }

  /** Action 컨텍스트를 조립한다. GameWorld 전체를 넘기지 않는다. */
  private contextFor(npc: NPC<Action>): ActionContext {
    const d = this.deps;
    return {
      npc,
      world: d.world,
      nav: d.nav,
      paths: d.paths,
      rooms: d.rooms,
      clock: d.clock,
      events: d.events,
      services: d.services,
    };
  }

  /**
   * 현재 Action 을 next 로 바꾸고 시작한다. cancelCurrent 이면 진행 중이던 Action 의 cancel 을 한 번 부른다.
   * done / failed 로 끝난 Action 은 cancel 하지 않는다. 바뀔 때마다 NPC_ACTION_CHANGED 를 발행한다.
   */
  private switchTo(ctx: ActionContext, next: Action, cancelCurrent: boolean): void {
    const npc = ctx.npc;
    const current = npc.action;
    if (cancelCurrent && current !== next && this.started.has(current)) current.cancel(ctx);
    this.moveFarmClaim(npc.id, current, next);
    this.moveFacilityClaim(npc.id, current, next);
    if (current instanceof CookAction && current !== next) this.deps.releaseIngredients?.(npc.id);
    npc.action = next;
    this.started.add(next);
    next.start(ctx);
    this.deps.events.emit('NPC_ACTION_CHANGED', { npcId: npc.id, label: next.label });
  }

  /** 밭 예약을 옮긴다: 이전 Action 의 칸을 풀고 새 Action 의 칸을 잡는다(같은 칸이면 유지). */
  private moveFarmClaim(npcId: string, prev: Action, next: Action): void {
    const claims = this.deps.farmClaims;
    if (!claims) return;
    const a = prev.farmTarget;
    const b = next.farmTarget;
    const same = a !== undefined && b !== undefined && a.x === b.x && a.y === b.y && a.z === b.z;
    if (a && !same) claims.release(npcId, a);
    if (b && !same) claims.claim(npcId, b);
  }

  /**
   * 시설 예약을 옮긴다: 다른 시설(또는 시설 없음)로 바뀌면 이전 예약을 풀고 새 시설을 잡는다.
   * 같은 시설로 가는 이동 → 사용은 예약을 유지한다. 다른 주민이 잡은 시설은 잡지 않는다(사용 Action 이 시작에서 실패한다).
   */
  private moveFacilityClaim(npcId: string, prev: Action, next: Action): void {
    const a = prev.facilityClaim;
    const b = next.facilityClaim;
    if (a === b) return;
    if (a !== undefined && this.facilityOwner.get(a) === npcId) this.facilityOwner.delete(a);
    if (b !== undefined && !this.facilityOwner.has(b)) this.facilityOwner.set(b, npcId);
  }

  /**
   * 같은 계획이 방금 실패했는가. 재계산 최소 간격(balance.npc.repathMinIntervalSeconds) 동안은
   * 같은 키의 계획을 다시 시작하지 않는다. 도달할 수 없는 목적지로 매 프레임 탐색하지 않게 한다.
   */
  private recentlyFailed(npcId: string, key: string): boolean {
    const f = this.failed.get(npcId);
    if (!f || f.key !== key) return false;
    return this.elapsed - f.at < balance.npc.repathMinIntervalSeconds;
  }

  /** 실패한 Action 의 목적에 따라 소유자에게 알린다. */
  private reportFailure(npcId: string, action: Action): void {
    if (action instanceof PlannedMove && action.purpose.kind === 'bed' && action.failure) {
      this.deps.onBedUnreachable(npcId, action.purpose.bedObjectId);
    }
  }
}
