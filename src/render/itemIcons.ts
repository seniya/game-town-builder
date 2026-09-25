// 아이템 아이콘 (TASK-014, STYLE-004). 블록은 텍스처 배열과 같은 64 px 타일로 작은 입방체를 그린다.
// 재료(seed / crop / food)는 픽셀 그림이다. UI 는 이 모듈을 모르며 main.ts 가 함수로 주입한다.
import type { ItemRef } from '../game/types';
import { blockTilePixels, TILE_PX } from './atlas';

/** 아이콘 한 변의 픽셀 수. */
const ICON_PX = 48;

/** 타일 픽셀을 캔버스로 만든다. */
function tileCanvas(pixels: Uint8ClampedArray, shade: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TILE_PX;
  c.height = TILE_PX;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const img = ctx.createImageData(TILE_PX, TILE_PX);
  for (let i = 0; i < pixels.length; i += 4) {
    img.data[i] = (pixels[i] ?? 0) * shade;
    img.data[i + 1] = (pixels[i + 1] ?? 0) * shade;
    img.data[i + 2] = (pixels[i + 2] ?? 0) * shade;
    img.data[i + 3] = pixels[i + 3] ?? 0;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** 블록을 윗면·왼쪽면·오른쪽면이 보이는 작은 입방체로 그린다. */
function drawBlock(ctx: CanvasRenderingContext2D, blockId: number): void {
  const top = blockTilePixels(blockId, 0);
  const side = blockTilePixels(blockId, 2);
  if (!top || !side) return;
  const s = ICON_PX / 2 / TILE_PX; // 한 면 폭 = 아이콘 절반
  const cx = ICON_PX / 2;
  const q = ICON_PX / 4;
  // 64 px 손그림풍 타일을 줄여 그리므로 부드럽게 보간한다 (STYLE-004)
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // 윗면: 마름모
  ctx.setTransform(s, s / 2, -s, s / 2, cx, 0);
  ctx.drawImage(tileCanvas(top, 1), 0, 0);
  // 왼쪽 옆면
  ctx.setTransform(s, s / 2, 0, s, 0, q);
  ctx.drawImage(tileCanvas(side, 0.8), 0, 0);
  // 오른쪽 옆면
  ctx.setTransform(s, -s / 2, 0, s, cx, q * 2);
  ctx.drawImage(tileCanvas(side, 0.62), 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** 픽셀 그림 한 장. 문자 하나가 한 칸이며 '.' 은 비운다. */
function drawPixels(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  palette: Readonly<Record<string, string>>,
): void {
  const n = rows.length;
  const px = ICON_PX / n;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = palette[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(Math.floor(x * px), Math.floor(y * px), Math.ceil(px), Math.ceil(px));
    });
  });
}

const SEED = [
  '........',
  '..a..b..',
  '.aa..bb.',
  '.a....b.',
  '....c...',
  '...cc...',
  '...c....',
  '........',
];
const CROP = [
  '..a.a.a.',
  '..aaaaa.',
  '...aaa..',
  '...bab..',
  '....b...',
  '....b...',
  '...b.b..',
  '........',
];
const FOOD = [
  '........',
  '..c.c...',
  '.aaaaaa.',
  'addddda.',
  '.bbbbbb.',
  '..bbbb..',
  '........',
  '........',
];

/** 아이템 → 아이콘 data URL. 같은 아이템은 한 번만 그린다. */
export function createItemIconProvider(): (item: ItemRef) => string {
  const cache = new Map<string, string>();
  return (item) => {
    const key = item.kind === 'block' ? `b${item.blockId}` : `m${item.material}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const canvas = document.createElement('canvas');
    canvas.width = ICON_PX;
    canvas.height = ICON_PX;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (item.kind === 'block') drawBlock(ctx, item.blockId);
      else if (item.material === 'seed')
        drawPixels(ctx, SEED, { a: '#b88a4a', b: '#a06f35', c: '#8c5f2c' });
      else if (item.material === 'crop') drawPixels(ctx, CROP, { a: '#e8c35a', b: '#8aa04a' });
      else drawPixels(ctx, FOOD, { a: '#9a6a3c', b: '#7a5230', c: '#f2f2f2', d: '#e39b4f' });
    }
    const url = canvas.toDataURL();
    cache.set(key, url);
    return url;
  };
}
