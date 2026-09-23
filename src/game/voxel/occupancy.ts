// 공통 순수 통행 판정 (MVP_SPEC 12.2, ARCHITECTURE 10.2 / 11.1). room 과 nav 가 같은 함수를 쓴다.
import { BlockId, isSolid } from '../data/blocks';
import type { ActorKind, BlockPos, BlockReader } from '../types';

/**
 * actor 의 몸이 이 블록 칸을 지나갈 수 있는가. 비고체면 통과한다.
 * door 는 NPC 에게만 비고체이고 몬스터에게는 막힌 칸이다 (MVP_SPEC 8.3).
 */
export function isPassableFor(blockId: number, actor: ActorKind): boolean {
  if (blockId === BlockId.door) return actor === 'npc';
  return !isSolid(blockId);
}

/**
 * 서 있을 수 있는 칸인가: 아래 칸 고체 + 발 칸·머리 칸 통과 가능 (MVP_SPEC 12.2).
 * 문 칸 자체도 NPC 에게는 서 있을 수 있는 칸이다(아래가 고체이고 두 칸이 문이면).
 */
export function isStandableCell(read: BlockReader, p: BlockPos, actor: ActorKind): boolean {
  return (
    isSolid(read.get(p.x, p.y - 1, p.z)) &&
    isPassableFor(read.get(p.x, p.y, p.z), actor) &&
    isPassableFor(read.get(p.x, p.y + 1, p.z), actor)
  );
}
