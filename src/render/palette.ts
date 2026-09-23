// 블록 플레이스홀더 팔레트 (GAME_DESIGN 14). 렌더 전용 색이며 게임 규칙과 무관하다.
// 따뜻한 나무·흙과 부드러운 녹색·회색을 중심으로, 작은 집의 벽·바닥·문·창문이 서로 구분되도록 고른다.
import { BlockId, type BlockName } from '../game/data/blocks';

/** 타일 무늬 종류. atlas.ts 가 해석한다. */
export type TilePattern =
  | 'plain'
  | 'noise'
  | 'planks'
  | 'bricks'
  | 'bark'
  | 'rings'
  | 'grassSide'
  | 'door'
  | 'window'
  | 'furrows'
  | 'blanket'
  | 'grate'
  | 'band'
  | 'torch'
  | 'torchTop'
  | 'sprout';

/** 한 면의 타일 설명. color 는 sRGB 16 진수, alpha 는 0~1. */
export interface TileStyle {
  readonly color: number;
  readonly accent?: number;
  readonly pattern: TilePattern;
  readonly alpha?: number;
  /** 밝기 흔들림 폭 (0~1). 저해상도 픽셀 질감을 만든다 */
  readonly noise?: number;
}

/** 블록 한 종의 윗면 / 아랫면 / 옆면. */
export interface BlockStyle {
  readonly top: TileStyle;
  readonly bottom: TileStyle;
  readonly side: TileStyle;
}

/** 모든 면이 같은 블록 스타일. */
function uniform(tile: TileStyle): BlockStyle {
  return { top: tile, bottom: tile, side: tile };
}

const WOOD = 0xc49a5e;
const WOOD_DARK = 0x8f6a3e;
const DIRT = 0x8a5f3c;

/** 블록 이름 → 스타일. air 는 그리지 않는다. */
const STYLES: Partial<Record<BlockName, BlockStyle>> = {
  bedrock: uniform({ color: 0x3b3a40, pattern: 'noise', noise: 0.25 }),
  dirt: uniform({ color: DIRT, pattern: 'noise', noise: 0.18 }),
  grass: {
    top: { color: 0x7fb24c, pattern: 'noise', noise: 0.14 },
    bottom: { color: DIRT, pattern: 'noise', noise: 0.18 },
    side: { color: DIRT, accent: 0x7fb24c, pattern: 'grassSide', noise: 0.15 },
  },
  stone: uniform({ color: 0x8e9197, pattern: 'noise', noise: 0.16 }),
  sand: uniform({ color: 0xe2d29c, pattern: 'noise', noise: 0.08 }),
  log: {
    top: { color: 0xc09a66, accent: 0x8a653d, pattern: 'rings' },
    bottom: { color: 0xc09a66, accent: 0x8a653d, pattern: 'rings' },
    side: { color: 0x7a5534, accent: 0x5c3f26, pattern: 'bark', noise: 0.1 },
  },
  leaves: uniform({ color: 0x4f8d3b, accent: 0x3b6e2c, pattern: 'noise', noise: 0.3 }),
  water: uniform({ color: 0x3f87c7, pattern: 'noise', noise: 0.06, alpha: 0.62 }),
  plank: uniform({ color: WOOD, accent: WOOD_DARK, pattern: 'planks', noise: 0.06 }),
  stone_brick: uniform({ color: 0xa3a6ab, accent: 0x6f7277, pattern: 'bricks', noise: 0.06 }),
  door: {
    top: { color: WOOD_DARK, pattern: 'plain' },
    bottom: { color: WOOD_DARK, pattern: 'plain' },
    side: { color: 0x9c6c40, accent: 0x5e3f24, pattern: 'door' },
  },
  window: uniform({ color: 0xcfeaf3, accent: WOOD, pattern: 'window', alpha: 0.32 }),
  torch: {
    top: { color: 0xffd466, pattern: 'torchTop' },
    bottom: { color: 0x7a5534, pattern: 'torchTop' },
    side: { color: 0xffc94d, accent: 0x7a5534, pattern: 'torch' },
  },
  bed: {
    top: { color: 0xc8574d, accent: 0xf2ece0, pattern: 'blanket' },
    bottom: { color: WOOD_DARK, pattern: 'plain' },
    side: { color: 0xb65048, accent: WOOD_DARK, pattern: 'band' },
  },
  cooking_stove: {
    top: { color: 0x55575d, accent: 0x2f3034, pattern: 'grate' },
    bottom: { color: 0x6d6f75, pattern: 'noise', noise: 0.08 },
    side: { color: 0x6d6f75, accent: 0xe07a35, pattern: 'band' },
  },
  water_pot: {
    top: { color: 0x4d8fc4, accent: 0x8e9aa6, pattern: 'band' },
    bottom: { color: 0x8e9aa6, pattern: 'plain' },
    side: { color: 0x8e9aa6, accent: 0x6c7682, pattern: 'band' },
  },
  table: {
    top: { color: 0xb8864f, accent: 0x8f6a3e, pattern: 'planks' },
    bottom: { color: WOOD_DARK, pattern: 'plain' },
    side: { color: 0xa87a45, accent: 0x6e4f2d, pattern: 'band' },
  },
  chair: uniform({ color: 0xa8773f, accent: 0x6e4f2d, pattern: 'band' }),
  chest: {
    top: { color: 0xb8863b, accent: 0x6e4f2d, pattern: 'planks' },
    bottom: { color: 0x8f6a3e, pattern: 'plain' },
    side: { color: 0xb8863b, accent: 0x4c3a24, pattern: 'band' },
  },
  farmland: {
    top: { color: 0x5e3c22, accent: 0x4a2f1a, pattern: 'furrows' },
    bottom: { color: DIRT, pattern: 'noise', noise: 0.18 },
    side: { color: DIRT, pattern: 'noise', noise: 0.18 },
  },
  crop: {
    top: { color: 0x9ccf4f, accent: 0x6d9a33, pattern: 'sprout' },
    bottom: { color: 0x9ccf4f, pattern: 'sprout' },
    side: { color: 0x9ccf4f, accent: 0x6d9a33, pattern: 'sprout', noise: 0.1 },
  },
  bell: uniform({ color: 0xdcb448, accent: 0xa27f25, pattern: 'band' }),
};

/** 블록 id 의 스타일. 정의가 없으면 undefined (air). */
export function blockStyle(id: number): BlockStyle | undefined {
  const name = (Object.keys(BlockId) as BlockName[]).find((n) => BlockId[n] === id);
  return name ? STYLES[name] : undefined;
}
