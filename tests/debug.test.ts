import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { GameWorld } from '../src/game/GameWorld';

/** 평지와 플레이어가 있는 작은 GameWorld. */
function world(): GameWorld {
  const w = new GameWorld({
    storage: balance.storage,
    worldSize: { sizeX: 32, sizeY: 16, sizeZ: 32 },
    playerSpawn: { x: 5, y: 5, z: 5 },
  });
  for (let x = 0; x < 32; x++)
    for (let z = 0; z < 32; z++)
      for (let y = 0; y <= 4; y++) w.voxels.writeInitial(x, y, z, BlockId.stone);
  return w;
}

describe('DebugSystem (TASK-016)', () => {
  it('블록 무제한 모드에서는 재료 없이 설치되고 아이템이 줄지 않는다', () => {
    const w = world();
    const edit = w.blockEdit;
    if (!edit) throw new Error('플레이어가 있어야 한다');
    expect(edit.placeAt({ x: 9, y: 5, z: 9 }, 'north')).toEqual({ ok: false, reason: 'no-item' });
    w.debug.setUnlimitedBlocks(true);
    w.debug.setUnlimitedBlockId(BlockId.stone_brick);
    expect(edit.placeAt({ x: 9, y: 5, z: 9 }, 'north').ok).toBe(true);
    expect(w.voxels.getBlock(9, 5, 9)).toBe(BlockId.stone_brick);
    w.inventory.add([{ item: { kind: 'block', blockId: BlockId.plank }, count: 1 }]);
    expect(edit.placeAt({ x: 10, y: 5, z: 9 }, 'north').ok).toBe(true);
    expect(w.voxels.getBlock(10, 5, 9)).toBe(BlockId.plank);
    expect(w.inventory.selectedStack()?.count).toBe(1);
    // 무제한이어도 설치 규칙은 그대로다
    expect(edit.placeAt({ x: 5, y: 5, z: 5 }, 'north')).toEqual({ ok: false, reason: 'character' });
    w.debug.setUnlimitedBlocks(false);
    expect(edit.placeAt({ x: 11, y: 5, z: 9 }, 'north').ok).toBe(true);
    expect(w.inventory.selectedStack()).toBeNull();
  });

  it('게임 쪽 표시값에 플레이어·조준·편집 상태가 들어 있다', () => {
    const w = world();
    w.update(1 / 60);
    const s = w.debug.snapshot();
    expect(s.playerPos).toEqual({ x: 5.5, y: 5, z: 5.5 });
    expect(s.timeScaleAvailable).toBe(false);
    expect(s.unlimitedBlocks).toBe(false);
  });
});
