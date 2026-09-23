// 방 레시피 5 종 (MVP_SPEC 12.1 이 정본). 새 방 타입·조건을 임의로 추가하지 않는다 (MVP_SPEC 38).
import type { RoomRecipe, RoomType } from '../types';
import { BlockId } from './blocks';

/** priority 내림차순. matchRecipe 는 이 순서대로 처음 만족하는 타입을 고른다. */
export const ROOM_RECIPES: readonly RoomRecipe[] = [
  {
    type: 'DiningRoom',
    priority: 40,
    rule: { kind: 'dining', minTables: 1, minChairsPerTable: 2 },
    displayName: '식당',
  },
  {
    type: 'Kitchen',
    priority: 30,
    rule: { kind: 'kitchen', minStoves: 1, minWaterPots: 1 },
    displayName: '주방',
  },
  { type: 'Bedroom', priority: 20, rule: { kind: 'bedroom', minBeds: 1 }, displayName: '침실' },
  {
    type: 'Storeroom',
    priority: 10,
    rule: { kind: 'storeroom', minChests: 1 },
    displayName: '창고',
  },
  { type: 'EmptyRoom', priority: 0, rule: { kind: 'none' }, displayName: '빈 방' },
];

/** 방 타입의 표시 이름. */
export function roomDisplayName(type: RoomType): string {
  return ROOM_RECIPES.find((r) => r.type === type)?.displayName ?? type;
}

/** 진단 문구에 쓰는 가구 이름. */
export const FURNITURE_NAMES: Readonly<Record<number, string>> = {
  [BlockId.bed]: '침대',
  [BlockId.cooking_stove]: '화덕',
  [BlockId.water_pot]: '물통',
  [BlockId.table]: '식탁',
  [BlockId.chair]: '의자',
  [BlockId.chest]: '상자',
};
