// Action 실행 인터페이스와 ActionContext (ARCHITECTURE 13, ADR 008). NPC 의 상태는 현재 Action 이다.
// 복합 Action 을 만들지 않는다: 이동과 사용은 MoveAction → SleepAction 처럼 따로 둔다 (13.2).
import type { NPC } from '../entities/NPC';
import type { EventBus } from '../EventBus';
import type { NavigationGraph } from '../nav/NavigationGraph';
import type { PathScheduler } from '../nav/PathScheduler';
import type { ActionStatus, ActionView, BlockPos, GameClockReader, Room } from '../types';
import type { CollisionWorld } from '../voxel/collision';

/**
 * Action 이 결과를 확정하거나 소유자 상태를 확인하는 좁은 변경 포트 (ARCHITECTURE 13.4).
 * 전체 시스템 객체를 노출하지 않는다. 감사·수리 포트는 해당 Task(035·048)에서 더한다.
 */
export interface ActionServices {
  readonly sleep: {
    /** 이 침대가 지금도 이 주민에게 배정되어 있는가. 침대 배정은 SleepSystem 만 소유한다 */
    isAssigned(npcId: string, bedObjectId: string): boolean;
  };
  /** 농사 결과 확정 (FarmSystem, TASK-030). 조건이 맞지 않으면 아무것도 바꾸지 않고 false */
  readonly farm: {
    plant(target: BlockPos): boolean;
    harvest(target: BlockPos): boolean;
  };
  /** 조리 재료 예약·결과 확정 (CookingSystem, TASK-031). 시작 때 예약하고 완료 때 소비한다 */
  readonly cooking: {
    /** 화덕을 잡고 crop 을 예약한다. 소비하지 않는다. 쓸 수 없거나 모자라면 false */
    begin(npcId: string, stoveId: string): boolean;
    /** 예약이 살아 있는가(주방 해제·화덕 파괴·재료 부족이면 false) */
    isCooking(npcId: string, stoveId: string): boolean;
    /** crop −2, food +3 을 한 번에 확정한다. 조리 중이 아니거나 모자라면 false */
    complete(npcId: string, stoveId: string): boolean;
  };
  /** 식사 확정 (MealSystem, TASK-032) */
  readonly meal: {
    /** food 1 을 소비하고 이번 끼니를 먹었다고 기록한다. seatId 가 null 이면 광장. 못 먹으면 false */
    eat(npcId: string, seatId: string | null): boolean;
    /** 이 의자가 아직 DiningRoom 의 의자인가 */
    isSeatUsable(seatId: string): boolean;
    /** 지금 식사 구간인가 */
    active(): boolean;
  };
}

/** 방 조회 포트. 방 전체 목록이 아니라 필요한 조회만 연다. */
export interface RoomQuery {
  findContaining(pos: BlockPos): Room | undefined;
}

/** Action 이 받는 것. GameWorld 전체를 받지 않는다 (ARCHITECTURE 13.4). */
export interface ActionContext {
  readonly npc: NPC<Action>;
  /** 충돌·중력용 복셀 조회 */
  readonly world: CollisionWorld;
  readonly nav: NavigationGraph;
  /** 경로 요청. 결과는 비동기(다음 nav 슬롯 뒤)다 */
  readonly paths: PathScheduler;
  readonly rooms: RoomQuery;
  readonly clock: GameClockReader;
  readonly events: EventBus;
  readonly services: ActionServices;
}

/** 실행 가능한 Action. NPCSystem 이 start / cancel 을 한 번씩 보장한다. */
export interface Action extends ActionView {
  /** 이 Action 이 잡고 있는 밭 칸(farmland). NPCSystem 이 바뀔 때 FarmSystem 예약을 잡고 푼다 */
  readonly farmTarget?: BlockPos;
  /**
   * 이 Action 이 쓰는(또는 향해 가는) 임시 시설(화덕·의자)의 objectId.
   * NPCSystem 이 objectId 별로 한 명만 예약하고, Action 이 바뀔 때 잡고 푼다 (MVP_SPEC 12.4, ARCHITECTURE 14.4)
   */
  readonly facilityClaim?: string;
  /** 시작. 이 Action 이 NPC 의 현재 Action 이 된 직후 한 번 */
  start(ctx: ActionContext): void;
  /** 한 프레임 진행 */
  update(ctx: ActionContext, dt: number): ActionStatus;
  /** 외부 사유(판단 변경·방 해제 등)로 끝낼 때 한 번. done / failed 뒤에는 부르지 않는다 */
  cancel(ctx: ActionContext): void;
}
