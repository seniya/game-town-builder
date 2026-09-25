// 블록 타일 22 종 × 면 3 (STYLE-004, MVP_SPEC 45.5, ADR 044·046). 64 px 손그림풍: 넓은 색면, 부드러운 줄눈, 둥근 가장자리.
// STYLE-001 시안의 칠하기 도구(styleTiles)를 그대로 쓰고, 시안에 없던 블록을 같은 방식으로 더한다.
// 결정적 순수 계산이다(같은 입력은 같은 픽셀). 텍스처로 올리는 일은 atlas.ts 가 한다.
import { BlockId, type BlockName } from '../game/data/blocks';
import {
  blotch,
  Canvas,
  hash,
  paintDirt,
  paintGrassSide,
  paintGrassTop,
  paintLeaves,
  paintPlank,
  paintStoneBrick,
  rgb,
  shade,
  STYLE_TILE_PX,
  tones,
  valueNoise,
  type RGB,
} from './style/styleTiles';

/** 타일 한 변의 픽셀 수. */
export const BLOCK_TILE_PX = STYLE_TILE_PX;

/** 면 종류: 0 윗면 / 1 아랫면 / 2 옆면. */
export type TileFace = 0 | 1 | 2;

const N = STYLE_TILE_PX;

/** 모서리가 둥근 사각형 안인가(칸 로컬 픽셀, 반지름 r). */
function inRoundRect(
  x: number,
  y: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
): boolean {
  const cx = Math.min(Math.max(x + 0.5, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y + 0.5, y0 + r), y1 - r);
  return Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;
}

/** 돌: 세 단계 회색 얼룩, 둥근 금 몇 줄, 윗면 쪽 밝힘. */
function paintStone(c: Canvas, seed: number, base = 0xa7a9ad): void {
  const mid = rgb(base);
  c.each((x, y) => tones(blotch(x, y, seed), shade(mid, 0.9), mid, shade(mid, 1.08), 0.38, 0.66));
  for (let i = 0; i < 5; i++) {
    let x = hash(i, 1, seed) * N;
    let y = hash(i, 2, seed) * N;
    const len = 8 + hash(i, 3, seed) * 10;
    for (let k = 0; k < len; k++) {
      c.set(x, y, shade(mid, 0.74));
      c.set(x, y - 1, shade(mid, 1.14));
      x += 1;
      y += valueNoise(x, i * 7, 8, seed) > 0.5 ? 1 : 0;
    }
  }
}

/** 모래: 따뜻한 베이지 얼룩과 작은 알갱이. */
function paintSand(c: Canvas, seed: number): void {
  const mid = rgb(0xf0dca4);
  c.each((x, y) => tones(blotch(x, y, seed), shade(mid, 0.95), mid, shade(mid, 1.04), 0.4, 0.7));
  for (let i = 0; i < 40; i++) {
    const x = hash(i, 4, seed) * N;
    const y = hash(i, 5, seed) * N;
    c.set(x, y, hash(i, 6, seed) > 0.5 ? shade(mid, 0.86) : shade(mid, 1.08));
  }
}

/** 나무 껍질: 세로 결이 물결치며 흐르고, 굵은 골은 어둡다. */
function paintBark(c: Canvas, seed: number): void {
  const mid = rgb(0x8a5a36);
  c.each((x, y) => {
    const wave = x + Math.sin(y / 9 + hash(Math.floor(x / 8), 1, seed) * 6) * 2.2;
    const groove = Math.abs((wave % 11) - 5.5) < 1.1;
    const n = valueNoise(x, y, 16, seed);
    if (groove) return shade(mid, 0.68);
    return n < 0.42 ? shade(mid, 0.92) : n > 0.7 ? shade(mid, 1.1) : mid;
  });
}

/** 통나무 단면: 부드러운 나이테와 가장자리 껍질. */
function paintRings(c: Canvas, seed: number): void {
  const wood = rgb(0xe0b27a);
  c.each((x, y) => {
    const d = Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) + valueNoise(x, y, 16, seed) * 2.5;
    if (d > N * 0.47) return rgb(0x8a5a36);
    if (d > N * 0.43) return shade(rgb(0x8a5a36), 1.2);
    return Math.floor(d / 5) % 2 === 0 ? wood : shade(wood, 0.9);
  });
}

/** 물: 파란 얼룩 위 밝은 잔물결 줄. 반투명. */
function paintWater(c: Canvas, seed: number): void {
  const mid = rgb(0x4aa3d8);
  c.eachA((x, y) => {
    const n = blotch(x, y, seed);
    let col = tones(n, shade(mid, 0.9), mid, shade(mid, 1.08), 0.4, 0.7);
    const ripple = Math.sin(x / 6 + valueNoise(x, y, 16, seed + 3) * 6 + y / 11);
    if (ripple > 0.93) col = shade(mid, 1.35);
    return [col, 175];
  });
}

/** 창문: 둥근 나무 창틀과 십자 살, 옅은 하늘색 유리와 반짝이는 사선. */
function paintWindow(c: Canvas, seed: number): void {
  const frame = rgb(0xc98f55);
  const glass = rgb(0xd8f1fb);
  c.eachA((x, y) => {
    const border = x < 6 || y < 6 || x >= N - 6 || y >= N - 6;
    const cross = Math.abs(x + 0.5 - N / 2) < 2.5 || Math.abs(y + 0.5 - N / 2) < 2.5;
    if (border || cross) {
      const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1;
      const n = valueNoise(x, y, 8, seed);
      return [edge ? shade(frame, 0.7) : n > 0.6 ? shade(frame, 1.08) : frame, 255];
    }
    const lx = x % (N / 2);
    const ly = y % (N / 2);
    const shine = Math.abs(lx - ly - 4) < 2 || Math.abs(lx - ly + 6) < 1;
    return [shine ? rgb(0xffffff) : glass, shine ? 150 : 80];
  });
}

/** 문(옆면): 세로 판자, 위아래 가로대, 둥근 손잡이. 문은 모형으로 그리므로 아이콘·예비용이다. */
function paintDoor(c: Canvas, seed: number): void {
  const wood = rgb(0xb97a45);
  c.each((x, y) => {
    const boardEdge = x % 16 === 0 || x % 16 === 15;
    const rail = (y > 10 && y < 18) || (y > 44 && y < 52);
    const n = valueNoise(x, y, 16, seed);
    let col = n > 0.62 ? shade(wood, 1.06) : wood;
    if (boardEdge) col = shade(wood, 0.72);
    if (rail) col = shade(wood, 0.84);
    if (Math.hypot(x - 50, y - 34) < 3.2) col = rgb(0xf0c75a);
    return col;
  });
}

/** 횃불(옆면): 가운데 나무 막대와 위쪽 불꽃. 나머지는 투명하다. */
function paintTorchSide(c: Canvas): void {
  c.eachA((x, y) => {
    const dx = Math.abs(x + 0.5 - N / 2);
    if (y >= 24 && dx < 4) return [dx > 2.5 ? rgb(0x6e4526) : rgb(0x9a6538), 255];
    const flame = Math.hypot(dx * 1.3, (y - 16) * 0.9);
    if (y < 26 && flame < 11) return [flame < 5 ? rgb(0xfff2b0) : rgb(0xffb444), 255];
    return null;
  });
}

/** 횃불(윗면): 불꽃 가운데. */
function paintTorchTop(c: Canvas): void {
  c.eachA((x, y) => {
    const d = Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2);
    if (d < 5) return [rgb(0xfff2b0), 255];
    if (d < 8) return [rgb(0xffb444), 255];
    return null;
  });
}

/** 침대 윗면: 붉은 이불과 흰 베개(위쪽). */
function paintBedTop(c: Canvas, seed: number): void {
  const blanket = rgb(0xe0645a);
  c.each((x, y) => {
    if (inRoundRect(x, y, 8, 4, 56, 20, 5)) return y < 7 ? rgb(0xfffcf4) : rgb(0xf7f1e6);
    const n = valueNoise(x, y, 16, seed);
    const stitch = y % 12 === 0 && y > 22;
    return stitch ? shade(blanket, 0.86) : n > 0.6 ? shade(blanket, 1.06) : blanket;
  });
}

/** 가구 옆면: 나무 바탕에 띠 하나. */
function paintBand(c: Canvas, seed: number, base: number, band: number): void {
  const wood = rgb(base);
  const b = rgb(band);
  c.each((x, y) => {
    if (y > 20 && y < 30) return y === 21 ? shade(b, 1.15) : b;
    const n = valueNoise(x, y, 16, seed);
    return n > 0.62 ? shade(wood, 1.06) : n < 0.35 ? shade(wood, 0.94) : wood;
  });
}

/** 화덕 옆면: 둥근 돌벽돌에 밝게 빛나는 아치 아궁이. */
function paintStoveSide(c: Canvas, seed: number): void {
  paintStoneBrick(c, seed);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - N / 2;
      const inArch = y > 30 && (y > 42 || Math.hypot(dx, y - 42) < 16) && Math.abs(dx) < 16;
      if (!inArch) continue;
      const rim = Math.abs(dx) > 13 || (y <= 42 && Math.hypot(dx, y - 42) > 13);
      c.set(x, y, rim ? rgb(0xe8d9c2) : y > 50 ? rgb(0xffb04a) : rgb(0x4a2a1c));
    }
}

/** 화덕 윗면: 쇠 격자판. */
function paintGrate(c: Canvas): void {
  c.each((x, y) => {
    const bar = x % 10 < 3 || y % 10 < 3;
    return bar ? rgb(0x5b5b62) : rgb(0x2f2d33);
  });
}

/** 물 항아리 옆면: 질그릇에 파란 띠. */
function paintPotSide(c: Canvas, seed: number): void {
  paintBand(c, seed, 0xd98a58, 0x4d8fd0);
}

/** 물 항아리 윗면: 둥근 입구 안의 물빛. */
function paintPotTop(c: Canvas, seed: number): void {
  const clay = rgb(0xd98a58);
  c.each((x, y) => {
    const d = Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2);
    if (d < 20) return valueNoise(x, y, 8, seed) > 0.65 ? rgb(0x8fd0f0) : rgb(0x4aa3d8);
    if (d < 24) return shade(clay, 0.8);
    return clay;
  });
}

/** 상자 옆면: 판자에 쇠 띠 둘과 가운데 자물쇠. */
function paintChestSide(c: Canvas, seed: number): void {
  paintPlank(c, seed);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (x < 6 || x >= N - 6) c.set(x, y, rgb(0x6d6a70));
      if (inRoundRect(x, y, 26, 18, 38, 34, 3)) c.set(x, y, rgb(0xf0c75a));
    }
}

/** 밭: 짙은 흙의 부드러운 고랑. */
function paintFarmland(c: Canvas, seed: number): void {
  const soil = rgb(0x7a4a2a);
  c.each((x, y) => {
    const row = Math.sin((y / N) * Math.PI * 8);
    const n = blotch(x, y, seed);
    const k = row > 0.3 ? 1.12 : row < -0.5 ? 0.8 : 0.95;
    return shade(soil, k * (n > 0.6 ? 1.04 : 1));
  });
}

/** 새싹(작물, 투명 바탕): 작물은 모형으로 그리므로 예비용이다. */
function paintSprout(c: Canvas): void {
  c.eachA((x, y) => {
    for (const sx of [14, 32, 50]) {
      if (Math.abs(x - sx) < 2 && y > 30) return [rgb(0x5f9a3a), 255];
      if (Math.hypot(x - sx - 5, y - 30) < 5) return [rgb(0x8fd05a), 255];
    }
    return null;
  });
}

/** 종: 금빛 몸통, 둥근 띠. */
function paintBell(c: Canvas, seed: number): void {
  paintBand(c, seed, 0xf0c75a, 0xc99a33);
}

/** 기반암: 어두운 돌. */
function paintBedrock(c: Canvas, seed: number): void {
  paintStone(c, seed, 0x55535c);
}

/** 한 면을 칠한다. 칠할 수 없는 블록(air)은 false. */
function paintFace(c: Canvas, name: BlockName, face: TileFace, seed: number): boolean {
  const top = face === 0;
  const bottom = face === 1;
  switch (name) {
    case 'air':
      return false;
    case 'bedrock':
      paintBedrock(c, seed);
      return true;
    case 'dirt':
      paintDirt(c, seed);
      return true;
    case 'grass':
      if (top) paintGrassTop(c, seed);
      else if (bottom) paintDirt(c, seed);
      else paintGrassSide(c, seed);
      return true;
    case 'stone':
      paintStone(c, seed);
      return true;
    case 'sand':
      paintSand(c, seed);
      return true;
    case 'log':
      if (top || bottom) paintRings(c, seed);
      else paintBark(c, seed);
      return true;
    case 'leaves':
      paintLeaves(c, seed);
      return true;
    case 'water':
      paintWater(c, seed);
      return true;
    case 'plank':
      paintPlank(c, seed);
      return true;
    case 'stone_brick':
      paintStoneBrick(c, seed);
      return true;
    case 'door':
      if (top || bottom) paintBand(c, seed, 0x9a6a3c, 0x9a6a3c);
      else paintDoor(c, seed);
      return true;
    case 'window':
      paintWindow(c, seed);
      return true;
    case 'torch':
      if (top || bottom) paintTorchTop(c);
      else paintTorchSide(c);
      return true;
    case 'bed':
      if (top) paintBedTop(c, seed);
      else paintBand(c, seed, 0xb8804a, 0xe0645a);
      return true;
    case 'cooking_stove':
      if (top) paintGrate(c);
      else if (bottom) paintStoneBrick(c, seed);
      else paintStoveSide(c, seed);
      return true;
    case 'water_pot':
      if (top) paintPotTop(c, seed);
      else paintPotSide(c, seed);
      return true;
    case 'table':
      if (top) paintPlank(c, seed);
      else paintBand(c, seed, 0xc98f55, 0x9a6a3c);
      return true;
    case 'chair':
      paintBand(c, seed, 0xc98f55, 0x9a6a3c);
      return true;
    case 'chest':
      if (top) paintPlank(c, seed);
      else paintChestSide(c, seed);
      return true;
    case 'farmland':
      if (top) paintFarmland(c, seed);
      else paintDirt(c, seed);
      return true;
    case 'crop':
      paintSprout(c);
      return true;
    case 'bell':
      paintBell(c, seed);
      return true;
  }
}

/** id → 이름. */
const NAMES = new Map<number, BlockName>(
  (Object.keys(BlockId) as BlockName[]).map((n) => [BlockId[n], n] as const),
);

/**
 * 블록 한 면의 타일 픽셀(BLOCK_TILE_PX², RGBA, 위쪽 행부터). 그릴 것이 없으면 null.
 * 아틀라스와 아이템 아이콘이 같은 픽셀을 쓴다.
 */
export function blockTilePixels(blockId: number, face: TileFace): Uint8ClampedArray | null {
  const name = NAMES.get(blockId);
  if (!name) return null;
  const c = new Canvas();
  // 면마다 씨앗을 달리해 윗면·옆면 무늬가 똑같이 반복되지 않게 한다
  if (!paintFace(c, name, face, blockId * 3 + face + 1)) return null;
  return c.data;
}

/** 색 하나를 RGB 로(시험·아이콘 보조). */
export function tileColorAt(pixels: Uint8ClampedArray, x: number, y: number): RGB {
  const i = (y * N + x) * 4;
  return [pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0];
}
