// 제작 레시피 (MVP_SPEC 8.5 가 정본). 제작대 없이 인벤토리에서 바로 만든다.
// 재료는 blocks.ts 의 블록으로만 구성한다. 새 재료·레시피를 임의로 추가하지 않는다 (MVP_SPEC 38).
import { BlockId } from './blocks';

/** 레시피 한 개. 재료는 모두 블록이다. */
export interface Recipe {
  /** 결과 블록 이름과 같다 */
  readonly id: string;
  readonly output: { readonly blockId: number; readonly count: number };
  readonly inputs: readonly { readonly blockId: number; readonly count: number }[];
}

const B = BlockId;

/** 결과 블록 → 레시피. 표시 순서는 이 배열 순서다. */
export const RECIPES: readonly Recipe[] = [
  { id: 'plank', output: { blockId: B.plank, count: 4 }, inputs: [{ blockId: B.log, count: 1 }] },
  {
    id: 'stone_brick',
    output: { blockId: B.stone_brick, count: 4 },
    inputs: [{ blockId: B.stone, count: 2 }],
  },
  { id: 'door', output: { blockId: B.door, count: 1 }, inputs: [{ blockId: B.plank, count: 4 }] },
  {
    id: 'window',
    output: { blockId: B.window, count: 2 },
    inputs: [
      { blockId: B.plank, count: 2 },
      { blockId: B.sand, count: 1 },
    ],
  },
  { id: 'torch', output: { blockId: B.torch, count: 4 }, inputs: [{ blockId: B.log, count: 1 }] },
  {
    id: 'bed',
    output: { blockId: B.bed, count: 1 },
    inputs: [
      { blockId: B.plank, count: 4 },
      { blockId: B.leaves, count: 4 },
    ],
  },
  {
    id: 'cooking_stove',
    output: { blockId: B.cooking_stove, count: 1 },
    inputs: [{ blockId: B.stone, count: 6 }],
  },
  {
    id: 'water_pot',
    output: { blockId: B.water_pot, count: 1 },
    inputs: [{ blockId: B.stone, count: 3 }],
  },
  { id: 'table', output: { blockId: B.table, count: 1 }, inputs: [{ blockId: B.plank, count: 4 }] },
  { id: 'chair', output: { blockId: B.chair, count: 1 }, inputs: [{ blockId: B.plank, count: 2 }] },
  { id: 'chest', output: { blockId: B.chest, count: 1 }, inputs: [{ blockId: B.plank, count: 6 }] },
  {
    id: 'farmland',
    output: { blockId: B.farmland, count: 1 },
    inputs: [{ blockId: B.dirt, count: 1 }],
  },
];
