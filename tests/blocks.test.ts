import { describe, expect, it } from 'vitest';
import {
  BLOCKS,
  BlockId,
  getBlockDef,
  isFurniture,
  isMultiCell,
  isOpaque,
  isSolid,
  isTerrain,
  isWallBlock,
} from '../src/game/data/blocks';
import { balance } from '../src/game/data/balance';

describe('블록 정의 (MVP_SPEC 8.1)', () => {
  it('공기 제외 22종, 공기 포함 23개가 id 0~22로 연속이다', () => {
    expect(BLOCKS).toHaveLength(23);
    BLOCKS.forEach((b, i) => expect(b.id).toBe(i));
    expect(BLOCKS.filter((b) => b.kind !== 'air')).toHaveLength(22);
    expect(Object.values(BlockId)).toEqual([...Array(23).keys()]);
  });

  it('isWallBlock 은 plank / stone_brick / window / door 만 true', () => {
    const walls = BLOCKS.filter((b) => isWallBlock(b.id)).map((b) => b.name);
    expect(walls.sort()).toEqual(['door', 'plank', 'stone_brick', 'window']);
  });

  it('isWallBlock(dirt) 는 false — MVP_SPEC 8.4', () => {
    expect(isWallBlock(BlockId.dirt)).toBe(false);
    expect(isWallBlock(BlockId.stone)).toBe(false);
    expect(isWallBlock(BlockId.log)).toBe(false);
  });

  it('bedrock / water / bell 의 breakSeconds 가 null 이다', () => {
    for (const id of [BlockId.bedrock, BlockId.water, BlockId.bell]) {
      expect(getBlockDef(id).breakSeconds).toBeNull();
    }
  });

  it('표의 solid / opaque / terrain / breakSeconds 를 그대로 옮겼다', () => {
    // id, solid, opaque, terrain, breakSec — MVP_SPEC 8.1 의 표
    const table: [number, boolean, boolean, boolean, number | null][] = [
      [0, false, false, false, null],
      [1, true, true, true, null],
      [2, true, true, true, 0.6],
      [3, true, true, true, 0.6],
      [4, true, true, true, 1.5],
      [5, true, true, true, 0.5],
      [6, true, true, true, 1.0],
      [7, true, false, true, 0.2],
      [8, false, false, true, null],
      [9, true, true, false, 0.8],
      [10, true, true, false, 2.0],
      [11, false, false, false, 0.8],
      [12, true, false, false, 0.8],
      [13, false, false, false, 0.1],
      [14, true, true, false, 0.8],
      [15, true, true, false, 1.2],
      [16, true, true, false, 0.8],
      [17, true, true, false, 0.8],
      [18, true, true, false, 0.6],
      [19, true, true, false, 0.8],
      [20, true, true, false, 0.5],
      [21, false, false, false, 0.2],
      [22, true, true, false, null],
    ];
    for (const [id, solid, opaque, terrain, sec] of table) {
      expect([isSolid(id), isOpaque(id), isTerrain(id), getBlockDef(id).breakSeconds]).toEqual([
        solid,
        opaque,
        terrain,
        sec,
      ]);
    }
  });

  it('leaves 는 leaves 1개와 seed 25% 추가 드롭이다', () => {
    const drops = getBlockDef(BlockId.leaves).drops;
    expect(drops).toEqual([
      { item: { kind: 'block', blockId: BlockId.leaves }, count: 1 },
      {
        item: { kind: 'material', material: 'seed' },
        count: 1,
        chance: balance.resource.seedDropChanceFromLeaves,
      },
    ]);
    expect(balance.resource.seedDropChanceFromLeaves).toBe(0.25);
  });

  it('다중 칸 객체(bed / door)는 2칸이며 아이템 한 개만 드롭한다', () => {
    for (const id of [BlockId.bed, BlockId.door]) {
      expect(isMultiCell(id)).toBe(true);
      expect(getBlockDef(id).drops).toEqual([{ item: { kind: 'block', blockId: id }, count: 1 }]);
    }
    expect(BLOCKS.filter((b) => isMultiCell(b.id)).map((b) => b.name)).toEqual(['door', 'bed']);
  });

  it('14 장의 채집 드롭: grass→dirt, crop 은 드롭 없음, 파괴 불가는 빈 배열', () => {
    expect(getBlockDef(BlockId.grass).drops[0]?.item).toEqual({
      kind: 'block',
      blockId: BlockId.dirt,
    });
    expect(getBlockDef(BlockId.crop).drops).toEqual([]);
    expect(getBlockDef(BlockId.bell).drops).toEqual([]);
  });

  it('isFurniture 는 가구 6종만 true', () => {
    expect(BLOCKS.filter((b) => isFurniture(b.id)).map((b) => b.name)).toEqual([
      'bed',
      'cooking_stove',
      'water_pot',
      'table',
      'chair',
      'chest',
    ]);
  });

  it('범위 밖 id 는 air 로 취급한다', () => {
    expect(getBlockDef(999).id).toBe(0);
  });
});
