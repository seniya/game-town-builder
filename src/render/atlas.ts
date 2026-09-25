// 블록 텍스처 배열 (GAME_DESIGN 14, TASK-007, STYLE-004). 층 하나가 타일 하나다: 층 = 블록 id × 3 + 면 종류(0 윗면 / 1 아랫면 / 2 옆면).
// 타일은 blockTiles.ts 가 칠한 64 px 손그림풍 그림이다. 층마다 밉맵이 따로 있어 이웃 타일로 번지지 않는다(MVP_SPEC 45.5).
import * as THREE from 'three';
import { BLOCKS } from '../game/data/blocks';
import { BLOCK_TILE_PX, blockTilePixels, type TileFace } from './blockTiles';

export { blockTilePixels } from './blockTiles';

/** 타일 한 변의 픽셀 수. */
export const TILE_PX = BLOCK_TILE_PX;
/** 블록 하나의 면 종류 수. */
export const FACES_PER_BLOCK = 3;
/** 텍스처 배열의 층 수. */
export const ATLAS_LAYERS = BLOCKS.length * FACES_PER_BLOCK;

/**
 * 텍스처 배열을 만든다. sRGB, 선형 필터·밉맵(그림처럼 보이게), 이방성 4.
 * 그릴 것이 없는 층(air)은 투명하다.
 */
export function createBlockAtlas(): THREE.DataArrayTexture {
  const n = TILE_PX;
  const layerBytes = n * n * 4;
  const data = new Uint8Array(layerBytes * ATLAS_LAYERS);
  for (const def of BLOCKS) {
    for (const face of [0, 1, 2] as const satisfies readonly TileFace[]) {
      const pixels = blockTilePixels(def.id, face);
      if (!pixels) continue;
      const base = (def.id * FACES_PER_BLOCK + face) * layerBytes;
      // DataTexture 의 첫 행이 v = 0(아래)이다. 타일 위쪽(y = 0)을 v 가 큰 쪽에 둔다
      for (let y = 0; y < n; y++)
        data.set(pixels.subarray(y * n * 4, (y + 1) * n * 4), base + (n - 1 - y) * n * 4);
    }
  }
  const texture = new THREE.DataArrayTexture(data, n, n, ATLAS_LAYERS);
  texture.format = THREE.RGBAFormat;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
