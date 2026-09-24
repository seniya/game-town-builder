// 몬스터 엔티티 (MVP_SPEC 24, ARCHITECTURE 12 / 18, TASK-044). 순수 데이터이며 three 를 import 하지 않는다.
// 판단·이동·파괴는 MonsterSystem(TASK-045)이 한다. 습격 소속과 소멸은 RaidSystem 이 소유한다.
import { balance } from '../data/balance';
import type { AabbBody, BlockPos } from '../types';

/** 몬스터의 현재 행동 (ARCHITECTURE 18). 이동 경로·파괴 대상은 MonsterSystem 이 채운다. */
export type MonsterAction =
  | { readonly kind: 'idle' }
  | { readonly kind: 'move'; readonly path: readonly BlockPos[] }
  | { readonly kind: 'break'; readonly target: BlockPos; readonly progress: number }
  | { readonly kind: 'attack'; readonly targetId: string }
  | { readonly kind: 'wander' };

/** 몬스터 한 마리. */
export interface Monster {
  readonly id: string;
  /** 소속 습격 */
  readonly raidId: number;
  body: AabbBody;
  health: number;
  action: MonsterAction;
}

/** 시작 칸(발 칸)에 선 몬스터를 만든다. */
export function createMonster(id: string, raidId: number, cell: BlockPos): Monster {
  return {
    id,
    raidId,
    body: {
      pos: { x: cell.x + 0.5, y: cell.y, z: cell.z + 0.5 },
      velocity: { x: 0, y: 0, z: 0 },
      width: balance.npc.width,
      height: balance.npc.height,
      onGround: false,
    },
    health: balance.monster.maxHealth,
    action: { kind: 'idle' },
  };
}
