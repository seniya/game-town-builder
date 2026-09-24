// 제작 레시피 판정·해금 확인 (MVP_SPEC 8.5 / 23.2, ARCHITECTURE 15). 인벤토리에서 바로 만든다.
// 재료 차감과 결과 추가는 InventorySystem.exchange 로 한 번에 확정한다.
import { RECIPES, type Recipe } from '../data/recipes';
import { requiredLevel } from '../data/unlocks';
import { blockItem, type InventorySystem, type ItemAmount } from './InventorySystem';

/** 레시피 하나의 현재 상태. UI 가 표시에 쓴다. */
export interface RecipeStatus {
  readonly recipe: Recipe;
  /** 제작에 필요한 마을 레벨 */
  readonly requiredLevel: number;
  readonly unlocked: boolean;
  /** 재료가 충분한가 */
  readonly hasMaterials: boolean;
  /** 결과를 넣을 공간까지 있어 지금 만들 수 있는가 */
  readonly craftable: boolean;
}

/** 제작 실패 사유. */
export type CraftFailure = 'unknown-recipe' | 'locked' | 'materials' | 'inventory-full';

/** 레시피의 재료 목록. */
function inputsOf(recipe: Recipe): ItemAmount[] {
  return recipe.inputs.map((i) => ({ item: blockItem(i.blockId), count: i.count }));
}

/** 레시피의 결과. */
function outputOf(recipe: Recipe): ItemAmount[] {
  return [{ item: blockItem(recipe.output.blockId), count: recipe.output.count }];
}

/** 제작. 마을 레벨은 주입된 조회(GameWorld 에서는 VillageLevelSystem.level)로 읽는다 (TASK-037). */
export class CraftingSystem {
  /** 인벤토리와 현재 마을 레벨 조회를 받는다. */
  constructor(
    private readonly inventory: InventorySystem,
    private readonly villageLevel: () => number,
  ) {}

  /** 모든 레시피의 상태. 해금되지 않은 레시피도 숨기지 않는다 (MVP_SPEC 23.2). */
  statuses(): RecipeStatus[] {
    const level = this.villageLevel();
    return RECIPES.map((recipe) => {
      const need = requiredLevel(recipe.output.blockId) ?? Infinity;
      const unlocked = level >= need;
      const hasMaterials = this.inventory.canRemove(inputsOf(recipe));
      const craftable =
        unlocked && hasMaterials && this.inventory.canExchange(inputsOf(recipe), outputOf(recipe));
      return { recipe, requiredLevel: need, unlocked, hasMaterials, craftable };
    });
  }

  /** 레시피 id 로 한 번 만든다. 실패하면 인벤토리가 바뀌지 않는다. */
  craft(recipeId: string): { ok: true } | { ok: false; reason: CraftFailure } {
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return { ok: false, reason: 'unknown-recipe' };
    const need = requiredLevel(recipe.output.blockId);
    if (need === null || this.villageLevel() < need) return { ok: false, reason: 'locked' };
    if (!this.inventory.canRemove(inputsOf(recipe))) return { ok: false, reason: 'materials' };
    if (!this.inventory.exchange(inputsOf(recipe), outputOf(recipe))) {
      return { ok: false, reason: 'inventory-full' };
    }
    return { ok: true };
  }
}
