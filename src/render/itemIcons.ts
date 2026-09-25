// 아이템 아이콘 (TASK-014, STYLE-004). 블록은 텍스처 배열과 같은 64 px 타일로 작은 입방체를 그린다.
// 재료(seed / crop / food)는 둥근 벡터 그림, 가구는 모형 그림이다(STYLE-003). UI 는 이 모듈을 모르며 main.ts 가 함수로 주입한다.
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

/** 씨앗: 둥근 갈색 씨앗 셋(밝은 윤기). */
function drawSeeds(ctx: CanvasRenderingContext2D): void {
  const seeds: [number, number, number][] = [
    [17, 28, -0.5],
    [30, 22, 0.3],
    [28, 34, 1.1],
  ];
  for (const [x, y, a] of seeds) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = '#b8844a';
    ctx.strokeStyle = '#5e3a22';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 4.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,200,0.7)';
    ctx.beginPath();
    ctx.ellipse(-2, -1.5, 2.6, 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** 작물: 둥근 낟알이 달린 금빛 이삭과 초록 잎. */
function drawCrop(ctx: CanvasRenderingContext2D): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#6f9a3a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(24, 44);
  ctx.quadraticCurveTo(22, 30, 25, 14);
  ctx.stroke();
  ctx.fillStyle = '#86cc52';
  ctx.strokeStyle = '#4c7a2a';
  ctx.lineWidth = 1.5;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(24 + s * 8, 34, 9, 3.4, s * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#f2c84f';
  ctx.strokeStyle = '#a07a24';
  for (let i = 0; i < 5; i++) {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(25 + s * 4, 8 + i * 4.6, 3.6, 2.6, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** 음식: 김이 오르는 둥근 그릇의 국. */
function drawFood(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (const x of [18, 26, 34]) {
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.bezierCurveTo(x - 4, 15, x + 4, 11, x, 5);
    ctx.stroke();
  }
  ctx.fillStyle = '#f0a040';
  ctx.beginPath();
  ctx.ellipse(24, 25, 17, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c47a45';
  ctx.strokeStyle = '#6a3e22';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(6, 25);
  ctx.quadraticCurveTo(8, 44, 24, 44);
  ctx.quadraticCurveTo(40, 44, 42, 25);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f7f1e6';
  ctx.beginPath();
  ctx.ellipse(16, 31, 3, 2, 0, 0, Math.PI * 2);
  ctx.ellipse(31, 33, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 아이템 → 아이콘 data URL. 같은 아이템은 한 번만 그린다.
 * modelIcon 이 있으면 가구·소품 블록은 게임 모형에서 그린 그림을 쓴다(STYLE-003). 나머지 블록은 타일 입방체다.
 */
export function createItemIconProvider(
  modelIcon?: (blockId: number) => string | null,
): (item: ItemRef) => string {
  const cache = new Map<string, string>();
  return (item) => {
    const key = item.kind === 'block' ? `b${item.blockId}` : `m${item.material}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const model = item.kind === 'block' ? (modelIcon?.(item.blockId) ?? null) : null;
    if (model) {
      cache.set(key, model);
      return model;
    }
    const canvas = document.createElement('canvas');
    canvas.width = ICON_PX;
    canvas.height = ICON_PX;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (item.kind === 'block') drawBlock(ctx, item.blockId);
      else if (item.material === 'seed') drawSeeds(ctx);
      else if (item.material === 'crop') drawCrop(ctx);
      else drawFood(ctx);
    }
    const url = canvas.toDataURL();
    cache.set(key, url);
    return url;
  };
}
