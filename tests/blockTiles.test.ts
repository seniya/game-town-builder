import { describe, expect, it } from 'vitest';
import { BLOCKS, BlockId } from '../src/game/data/blocks';
import { ATLAS_LAYERS, createBlockAtlas, FACES_PER_BLOCK } from '../src/render/atlas';
import { BLOCK_TILE_PX, blockTilePixels, type TileFace } from '../src/render/blockTiles';

const FACES: readonly TileFace[] = [0, 1, 2];

/** 알파가 기준보다 작은 픽셀 수. */
function transparentCount(px: Uint8ClampedArray, below = 255): number {
  let n = 0;
  for (let i = 3; i < px.length; i += 4) if ((px[i] ?? 0) < below) n++;
  return n;
}

describe('블록 타일 (STYLE-004, MVP_SPEC 45.5)', () => {
  it('air 를 뺀 22 종 × 면 3 이 모두 64 × 64 타일을 갖는다', () => {
    expect(BLOCK_TILE_PX).toBe(64);
    for (const def of BLOCKS) {
      for (const face of FACES) {
        const px = blockTilePixels(def.id, face);
        if (def.id === BlockId.air) {
          expect(px).toBeNull();
          continue;
        }
        expect(px?.length).toBe(64 * 64 * 4);
      }
    }
  });

  it('결정적이다(같은 입력은 같은 픽셀)', () => {
    for (const def of BLOCKS.slice(1)) {
      expect(blockTilePixels(def.id, 2)).toEqual(blockTilePixels(def.id, 2));
    }
  });

  it('불투명 블록은 구멍이 없고, 물·창문은 반투명, 횃불·작물은 오려 낸 모양이다', () => {
    for (const id of [BlockId.grass, BlockId.plank, BlockId.stone_brick, BlockId.leaves]) {
      for (const face of FACES)
        expect(transparentCount(blockTilePixels(id, face) ?? new Uint8ClampedArray())).toBe(0);
    }
    expect(transparentCount(blockTilePixels(BlockId.water, 0) ?? new Uint8ClampedArray())).toBe(
      64 * 64,
    );
    const glass = transparentCount(blockTilePixels(BlockId.window, 2) ?? new Uint8ClampedArray());
    expect(glass).toBeGreaterThan(64 * 64 * 0.4);
    expect(glass).toBeLessThan(64 * 64 * 0.9);
    const torch = transparentCount(blockTilePixels(BlockId.torch, 2) ?? new Uint8ClampedArray(), 1);
    expect(torch).toBeGreaterThan(64 * 64 * 0.5);
  });

  it('윗면·옆면이 다른 블록(풀·통나무)은 면마다 그림이 다르다', () => {
    for (const id of [BlockId.grass, BlockId.log]) {
      expect(blockTilePixels(id, 0)).not.toEqual(blockTilePixels(id, 2));
    }
  });

  it('텍스처 배열은 층 = 블록 id × 3 + 면이고 밉맵을 만든다', () => {
    const atlas = createBlockAtlas();
    expect(ATLAS_LAYERS).toBe(BLOCKS.length * FACES_PER_BLOCK);
    expect(atlas.image.depth).toBe(ATLAS_LAYERS);
    expect(atlas.image.width).toBe(64);
    expect(atlas.generateMipmaps).toBe(true);
  });
});
