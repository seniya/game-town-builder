// 아이템 표시 이름 (UI 전용). 게임 규칙에 쓰지 않는다.
import { BLOCKS } from '../game/data/blocks';
import type { ItemRef } from '../game/types';

/** 블록 이름 → 한국어 표시 이름. 없으면 정의의 name 을 쓴다. */
const BLOCK_LABELS: Readonly<Record<string, string>> = {
  bedrock: '기반암',
  dirt: '흙',
  grass: '풀',
  stone: '돌',
  sand: '모래',
  log: '통나무',
  leaves: '잎',
  water: '물',
  plank: '판자',
  stone_brick: '돌벽돌',
  door: '문',
  window: '창문',
  torch: '횃불',
  bed: '침대',
  cooking_stove: '화덕',
  water_pot: '물통',
  table: '식탁',
  chair: '의자',
  chest: '상자',
  farmland: '밭흙',
  crop: '작물',
  bell: '종',
};

/** 재료 표시 이름. */
const MATERIAL_LABELS = { seed: '씨앗', crop: '수확물', food: '음식' } as const;

/** 아이템 표시 이름. */
export function itemLabel(item: ItemRef): string {
  if (item.kind === 'material') return MATERIAL_LABELS[item.material];
  const name = BLOCKS[item.blockId]?.name ?? '?';
  return BLOCK_LABELS[name] ?? name;
}
