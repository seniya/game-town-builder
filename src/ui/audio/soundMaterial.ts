// 블록 → 소리 재질 4 종 (MVP_SPEC 30 "재질별 4 종", TASK-050). 순수 함수다.
import { BlockId } from '../../game/data/blocks';

/** 소리 재질. */
export type SoundMaterial = 'wood' | 'stone' | 'soil' | 'glass';

const B = BlockId;
const WOOD: ReadonlySet<number> = new Set([
  B.plank,
  B.log,
  B.door,
  B.bed,
  B.table,
  B.chair,
  B.chest,
  B.torch,
]);
const STONE: ReadonlySet<number> = new Set([
  B.stone,
  B.stone_brick,
  B.cooking_stove,
  B.bell,
  B.bedrock,
]);
const GLASS: ReadonlySet<number> = new Set([B.window, B.water_pot, B.water]);

/** 블록의 소리 재질. 나머지(흙·풀·모래·밭·작물·잎)는 흙이다. */
export function soundMaterial(blockId: number): SoundMaterial {
  if (WOOD.has(blockId)) return 'wood';
  if (STONE.has(blockId)) return 'stone';
  if (GLASS.has(blockId)) return 'glass';
  return 'soil';
}
