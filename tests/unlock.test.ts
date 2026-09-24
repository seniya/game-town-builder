import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/game/data/blocks';
import { RECIPES } from '../src/game/data/recipes';
import type { GameWorld } from '../src/game/GameWorld';
import { blockItem } from '../src/game/systems/InventorySystem';
import { at, bed, run, village } from './helpers/village';

/** 출력 블록의 레시피 상태. */
function status(w: GameWorld, blockId: number) {
  const s = w.crafting.statuses().find((x) => x.recipe.output.blockId === blockId);
  if (!s) throw new Error(`레시피 없음 ${blockId}`);
  return s;
}

/** 레시피 재료를 넉넉히 넣는다. */
function stock(w: GameWorld, blockId: number): string {
  const r = RECIPES.find((x) => x.output.blockId === blockId);
  if (!r) throw new Error('레시피 없음');
  w.inventory.add(r.inputs.map((i) => ({ item: blockItem(i.blockId), count: i.count * 2 })));
  return r.id;
}

/** 레벨 2 조건을 실제 상태로 만든다: 침실(최초 +20)과 빈 방 하나(방 2), 주민 1 명(주거 100), 포인트 60 을 더해 80. */
function reachLevel2(w: GameWorld): void {
  bed(w, 10, 10);
  for (let x = 26; x <= 32; x++)
    for (let z = 9; z <= 15; z++) {
      const edge = x === 26 || x === 32 || z === 9 || z === 15;
      if (!edge || (x === 29 && z === 15)) continue;
      w.voxels.setBlock(x, 2, z, BlockId.plank, 'player');
      w.voxels.setBlock(x, 3, z, BlockId.plank, 'player');
    }
  const id = w.voxels.placements.allocateId();
  w.voxels.editObject(
    {
      kind: 'place',
      object: { id, blockId: BlockId.door, anchor: { x: 29, y: 2, z: 15 }, facing: 'south' },
    },
    'player',
  );
  w.spawnResident('farmer', { x: 20, y: 2, z: 20 });
  run(w, 0.5);
  w.gratitude.gain({ kind: 'gameEvent', id: 't' }, 60, { x: 0, y: 0, z: 0 });
}

describe('해금 (TASK-037, MVP_SPEC 23.2)', () => {
  it('레벨 1 에서 window / chest 는 회색(잠김)이고 필요 레벨 2 가 붙는다. 화덕·물통은 레벨 1 부터 된다', () => {
    const w = village(at(9));
    for (const id of [BlockId.window, BlockId.chest]) {
      expect(status(w, id)).toMatchObject({ unlocked: false, requiredLevel: 2 });
    }
    expect(status(w, BlockId.stone_brick)).toMatchObject({ unlocked: false, requiredLevel: 3 });
    for (const id of [BlockId.cooking_stove, BlockId.water_pot]) {
      const r = stock(w, id);
      expect(status(w, id).unlocked).toBe(true);
      expect(w.crafting.craft(r)).toEqual({ ok: true });
    }
  });

  it('잠긴 블록은 재료가 있어도, 디버그 무제한 모드에서도 제작되지 않는다', () => {
    const w = village(at(9));
    const r = stock(w, BlockId.window);
    w.debug.setUnlimitedBlocks(true);
    expect(w.crafting.craft(r)).toEqual({ ok: false, reason: 'locked' });
    expect(w.inventory.count(blockItem(BlockId.window))).toBe(0);
  });

  it('레벨 2 를 달성하면 즉시 활성화되고, 조건이 다시 거짓이 되어도 잠기지 않는다', () => {
    const w = village(at(9));
    reachLevel2(w);
    expect(w.village.evaluate().canRing).toBe(true);
    expect(w.village.ring()).toBe(true);
    expect(status(w, BlockId.window).unlocked).toBe(true);
    expect(status(w, BlockId.chest).unlocked).toBe(true);
    const r = stock(w, BlockId.window);
    expect(w.crafting.craft(r)).toEqual({ ok: true });
    // 침대를 부숴 조건을 깨도 해금은 유지된다
    for (const o of w.voxels.placements.all().filter((o) => o.blockId === BlockId.bed)) {
      w.voxels.editObject({ kind: 'remove', objectId: o.id }, 'player');
    }
    run(w, 0.5);
    expect(w.village.level).toBe(2);
    expect(status(w, BlockId.window).unlocked).toBe(true);
    expect(w.village.isUnlocked(BlockId.chest)).toBe(true);
  });
});
