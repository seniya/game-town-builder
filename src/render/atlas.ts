// 텍스처 아틀라스 1 장 (GAME_DESIGN 14, TASK-007). 코드로 결정적으로 그린 저해상도 픽셀 타일이다.
// 배치: 열 = 면 종류(0 윗면 / 1 아랫면 / 2 옆면), 행 = 블록 id. 타일 인덱스 = id * 3 + 면 종류.
import * as THREE from 'three';
import { BLOCKS } from '../game/data/blocks';
import { blockStyle, type TileStyle } from './palette';

/** 타일 한 변의 픽셀 수. */
export const TILE_PX = 16;
/** 아틀라스 열 수 (면 종류). */
export const ATLAS_COLUMNS = 3;
/** 아틀라스 행 수 (블록 종류). */
export const ATLAS_ROWS = BLOCKS.length;

/** 좌표 기반 결정적 해시 (0~1). 같은 입력은 항상 같은 값이다. */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** 16 진 색 → [r, g, b] (0~255). */
function rgb(color: number): [number, number, number] {
  return [(color >> 16) & 255, (color >> 8) & 255, color & 255];
}

/** 타일 한 픽셀의 [r, g, b, a]. 무늬별 규칙으로 기본색과 강조색을 섞는다. */
function tilePixel(
  style: TileStyle,
  x: number,
  y: number,
  seed: number,
): [number, number, number, number] {
  const base = rgb(style.color);
  const accent = rgb(style.accent ?? style.color);
  let useAccent = false;
  let alpha = style.alpha ?? 1;
  let shade = 1;
  const edge = x === 0 || y === 0 || x === TILE_PX - 1 || y === TILE_PX - 1;
  switch (style.pattern) {
    case 'plain':
    case 'noise':
      break;
    case 'planks':
      // 가로 판자 4 장. 이음매와 엇갈린 세로 틈
      useAccent = y % 4 === 3 || (x === (Math.floor(y / 4) * 7) % TILE_PX && y % 4 !== 3);
      break;
    case 'bricks': {
      const row = Math.floor(y / 4);
      const offset = row % 2 === 0 ? 0 : 4;
      useAccent = y % 4 === 3 || (x + offset) % 8 === 7;
      break;
    }
    case 'bark':
      useAccent = hash(x, 0, seed) > 0.62;
      shade = 0.92 + 0.16 * hash(x, Math.floor(y / 3), seed);
      break;
    case 'rings': {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      useAccent = Math.floor(d) % 3 === 0 || edge;
      break;
    }
    case 'grassSide':
      // 윗줄 3 픽셀과 불규칙한 풀 끝
      useAccent = y < 3 || (y < 5 && hash(x, 1, seed) > 0.5);
      break;
    case 'door':
      useAccent = edge || x === 7 || y === 7;
      if (x === 12 && y === 8) return [230, 200, 90, 255];
      break;
    case 'window':
      if (edge || x === 7 || y === 7) {
        const [r, g, b] = accent;
        return [r, g, b, 255];
      }
      break;
    case 'furrows':
      useAccent = y % 4 < 2;
      break;
    case 'blanket':
      // 위쪽 1/3 은 베개(강조색)
      useAccent = y < 5;
      break;
    case 'grate':
      useAccent = x % 4 === 0 || y % 4 === 0;
      break;
    case 'band':
      useAccent = edge || y === 5;
      break;
    case 'torch':
      useAccent = x < 6 || x > 9 || y > 9;
      if (useAccent) alpha = 1;
      break;
  }
  const c = useAccent ? accent : base;
  const n = style.noise ?? 0;
  const jitter = 1 + (hash(x, y, seed + 17) - 0.5) * 2 * n;
  const k = shade * jitter;
  return [
    Math.min(255, Math.round(c[0] * k)),
    Math.min(255, Math.round(c[1] * k)),
    Math.min(255, Math.round(c[2] * k)),
    Math.round(alpha * 255),
  ];
}

/** 아틀라스 텍스처를 만든다. sRGB 색공간, 최근접 필터, 밉맵 없음(타일 경계 번짐 방지). */
export function createBlockAtlas(): THREE.DataTexture {
  const width = ATLAS_COLUMNS * TILE_PX;
  const height = ATLAS_ROWS * TILE_PX;
  const data = new Uint8Array(width * height * 4);
  for (const def of BLOCKS) {
    const style = blockStyle(def.id);
    if (!style) continue;
    const faces = [style.top, style.bottom, style.side];
    faces.forEach((tile, column) => {
      for (let y = 0; y < TILE_PX; y++) {
        for (let x = 0; x < TILE_PX; x++) {
          const px = tilePixel(tile, x, y, def.id * 3 + column);
          // DataTexture 의 첫 행이 v = 0(아래)이다. 타일 위쪽(y = 0)을 v 가 큰 쪽에 둔다
          const gx = column * TILE_PX + x;
          const gy = def.id * TILE_PX + (TILE_PX - 1 - y);
          data.set(px, (gy * width + gx) * 4);
        }
      }
    });
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
