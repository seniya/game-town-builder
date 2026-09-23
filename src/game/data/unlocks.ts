// 마을 레벨별 제작 해금 (MVP_SPEC 23.2 가 정본). 정적 표이며 해금 적용은 VillageLevelSystem(TASK-037)이 한다.
import { BlockId } from './blocks';

const B = BlockId;

/** 레벨 → 그 레벨에서 새로 해금되는 블록. */
export const UNLOCKS_BY_LEVEL: Readonly<Record<number, readonly number[]>> = {
  1: [B.plank, B.door, B.torch, B.farmland, B.bed, B.table, B.chair, B.cooking_stove, B.water_pot],
  2: [B.window, B.chest],
  3: [B.stone_brick],
};

/** 블록 제작에 필요한 마을 레벨. 표에 없으면 null (제작 대상이 아니다). */
export function requiredLevel(blockId: number): number | null {
  for (const [level, ids] of Object.entries(UNLOCKS_BY_LEVEL)) {
    if (ids.includes(blockId)) return Number(level);
  }
  return null;
}
