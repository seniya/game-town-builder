// 주민 엔티티 (ARCHITECTURE 12.1, 27, TASK-028). 순수 데이터이며 three 를 import 하지 않는다.
// 상태는 현재 Action 이다. state 같은 별도 필드를 두지 않는다 (ADR 008, MVP_SPEC 19.3).
// entities 는 types / data 만 의존한다. Action 은 읽기 view 타입(ActionView)으로만 안다 (ARCHITECTURE 2.1).
import { balance } from '../data/balance';
import type { AabbBody, ActionView, BlockPos, NPCRole } from '../types';

/** 주민 한 명. A 는 실행 가능한 Action 타입이다(systems / actions 가 채운다). */
export interface NPC<A extends ActionView = ActionView> {
  readonly id: string;
  readonly role: NPCRole;
  body: AabbBody;
  health: number;
  action: A;
  /** 현재 식사 구간에 먹었는가 (MealSystem 이 리셋한다, TASK-032) */
  hasEatenThisMeal: boolean;
  /** 기절이 끝나는 gameMinutes. 0 이면 기절하지 않았다 (MVP_SPEC 19.2) */
  stunUntilGameMinutes: number;
}

/**
 * NPCFactory. 시작 칸(발이 놓이는 칸)에 선 주민을 만든다.
 * 주민 수는 호출자가 정한다. 이 함수는 인원을 제한하지 않는다 (ARCHITECTURE 2.3).
 */
export function createNPC<A extends ActionView>(
  id: string,
  role: NPCRole,
  cell: BlockPos,
  initialAction: A,
): NPC<A> {
  return {
    id,
    role,
    body: {
      pos: { x: cell.x + 0.5, y: cell.y, z: cell.z + 0.5 },
      velocity: { x: 0, y: 0, z: 0 },
      width: balance.npc.width,
      height: balance.npc.height,
      onGround: false,
    },
    health: balance.npc.maxHealth,
    action: initialAction,
    hasEatenThisMeal: false,
    stunUntilGameMinutes: 0,
  };
}
