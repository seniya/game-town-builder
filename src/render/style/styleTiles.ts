// 시안 블록 타일 (STYLE-001, MVP_SPEC 45.1, ADR 045). 64 px 손그림풍: 넓은 색면, 부드러운 줄눈, 물결 가장자리.
// 지금 아틀라스(16 px 픽셀 노이즈)와 나란히 비교하려는 시안이다. 픽셀 칠하기는 결정적 순수 계산이고,
// 텍스처로 올리는 함수만 three 를 쓴다. 타일은 가로·세로로 이어 붙여도 이음새가 보이지 않게 감싼다.
import * as THREE from 'three';

/** 타일 한 변의 픽셀 수. */
export const STYLE_TILE_PX = 64;

/** 시안 타일 종류. 풀은 윗면·옆면·아랫면(흙)이 다르다. */
export type StyleTileKind = 'grassTop' | 'grassSide' | 'dirt' | 'plank' | 'stoneBrick' | 'leaves';

type RGB = readonly [number, number, number];

/** 16 진 색 → [r, g, b]. */
function rgb(color: number): RGB {
  return [(color >> 16) & 255, (color >> 8) & 255, color & 255];
}

/** 색에 밝기 배율을 곱한다. */
function shade(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** 좌표 기반 결정적 해시(0~1). */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** 부드러운 보간 곡선. */
function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 감싸는 값 잡음(0~1). cell 픽셀 간격의 격자 값을 부드럽게 잇는다. 타일 경계에서 이어진다. */
function valueNoise(x: number, y: number, cell: number, seed: number): number {
  const n = STYLE_TILE_PX / cell;
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = fade(gx - x0);
  const ty = fade(gy - y0);
  const at = (ix: number, iy: number) => hash(((ix % n) + n) % n, ((iy % n) + n) % n, seed);
  const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
  const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
  return a + (b - a) * ty;
}

/** 두 겹 잡음(큰 얼룩 + 작은 얼룩, 0~1). */
function blotch(x: number, y: number, seed: number): number {
  return valueNoise(x, y, 16, seed) * 0.68 + valueNoise(x, y, 8, seed + 7) * 0.32;
}

/** 칠하는 판. 위쪽 행부터 RGBA. */
class Canvas {
  readonly data = new Uint8ClampedArray(STYLE_TILE_PX * STYLE_TILE_PX * 4);

  /** 픽셀 하나를 칠한다. 범위 밖 좌표는 타일을 감싸서 칠한다. */
  set(x: number, y: number, c: RGB): void {
    const px = ((Math.round(x) % STYLE_TILE_PX) + STYLE_TILE_PX) % STYLE_TILE_PX;
    const py = ((Math.round(y) % STYLE_TILE_PX) + STYLE_TILE_PX) % STYLE_TILE_PX;
    this.data.set([c[0], c[1], c[2], 255], (py * STYLE_TILE_PX + px) * 4);
  }

  /** 픽셀 하나의 [r, g, b]. */
  get(x: number, y: number): RGB {
    const i = (y * STYLE_TILE_PX + x) * 4;
    return [this.data[i] ?? 0, this.data[i + 1] ?? 0, this.data[i + 2] ?? 0];
  }

  /** 판 전체를 칠한다. */
  each(f: (x: number, y: number) => RGB): void {
    for (let y = 0; y < STYLE_TILE_PX; y++)
      for (let x = 0; x < STYLE_TILE_PX; x++) this.set(x, y, f(x, y));
  }
}

/** 잡음을 세 단계 색으로 끊는다(넓은 색면). */
function tones(n: number, dark: RGB, mid: RGB, light: RGB, lo = 0.4, hi = 0.64): RGB {
  return n < lo ? dark : n < hi ? mid : light;
}

const GRASS_DARK = rgb(0x74bf4f);
const GRASS_MID = rgb(0x80c957);
const GRASS_LIGHT = rgb(0x91d565);
const DIRT_DARK = rgb(0xa06a3c);
const DIRT_MID = rgb(0xb47d4c);
const DIRT_LIGHT = rgb(0xc4905e);

/** 흙: 두 단계 얼룩과 작은 밝은 돌. */
function paintDirt(c: Canvas, seed: number): void {
  c.each((x, y) => tones(blotch(x, y, seed), DIRT_DARK, DIRT_MID, DIRT_MID, 0.42, 0.9));
  for (let i = 0; i < 9; i++) {
    const cx = Math.floor(hash(i, 1, seed) * STYLE_TILE_PX);
    const cy = Math.floor(hash(i, 2, seed) * STYLE_TILE_PX);
    const w = 2 + Math.floor(hash(i, 3, seed) * 2);
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < w; dx++) c.set(cx + dx, cy + dy, DIRT_LIGHT);
  }
}

/** 풀 윗면: 세 단계 초록 얼룩, 작은 풀 포기, 드문 밝은 점. */
function paintGrassTop(c: Canvas, seed: number): void {
  c.each((x, y) => tones(blotch(x, y, seed), GRASS_DARK, GRASS_MID, GRASS_LIGHT));
  const tuft = shade(GRASS_DARK, 0.9);
  for (let i = 0; i < 12; i++) {
    const cx = Math.floor(hash(i, 5, seed) * STYLE_TILE_PX);
    const cy = Math.floor(hash(i, 6, seed) * STYLE_TILE_PX);
    // 작은 "v" 모양 풀 포기
    for (let k = 0; k < 3; k++) {
      c.set(cx - k, cy - k, tuft);
      c.set(cx + k, cy - k, tuft);
    }
  }
  for (let i = 0; i < 6; i++) {
    const cx = Math.floor(hash(i, 8, seed) * STYLE_TILE_PX);
    const cy = Math.floor(hash(i, 9, seed) * STYLE_TILE_PX);
    c.set(cx, cy, rgb(0xc4ec95));
    c.set(cx + 1, cy, rgb(0xc4ec95));
  }
}

/** 풀 옆면: 흙 위로 윗면의 풀이 물결 모양으로 흘러내린다. */
function paintGrassSide(c: Canvas, seed: number): void {
  paintDirt(c, seed);
  const scallop = 16;
  for (let x = 0; x < STYLE_TILE_PX; x++) {
    const k = Math.floor(x / scallop);
    const local = (x % scallop) / scallop;
    const amp = 5 + hash(k, 11, seed) * 5;
    const edge = Math.round(9 + amp * Math.sin(local * Math.PI));
    for (let y = 0; y < edge; y++) {
      const top = y < 3 ? GRASS_LIGHT : y >= edge - 2 ? shade(GRASS_DARK, 0.92) : GRASS_MID;
      c.set(x, y, top);
    }
    // 풀 끝 아래의 옅은 그림자
    c.set(x, edge, shade(c.get(x, Math.min(STYLE_TILE_PX - 1, edge)), 0.82));
  }
}

/** 판자: 가로 판 세 장, 판마다 다른 결 색, 둥근 이음새, 엇갈린 세로 이음과 못. */
function paintPlank(c: Canvas, seed: number): void {
  const boards = [0, 21, 42, 64];
  const bases = [rgb(0xd9a066), rgb(0xcf955b), rgb(0xdcaa70)];
  for (let b = 0; b < 3; b++) {
    const y0 = boards[b] ?? 0;
    const y1 = boards[b + 1] ?? STYLE_TILE_PX;
    const base = bases[b] ?? bases[0] ?? rgb(0xd9a066);
    const joint = Math.floor(hash(b, 1, seed) * 40) + 12;
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < STYLE_TILE_PX; x++) {
        let col = base;
        // 결: 판 안에서 몇 줄만 살짝 어둡게, 잡음으로 끊긴다
        const row = y - y0;
        if (hash(row, b, seed + 3) > 0.78 && valueNoise(x, y, 16, seed + b) > 0.45)
          col = shade(base, 0.92);
        if (y === y0) col = shade(base, 1.1);
        if (y >= y1 - 2) col = shade(base, 0.66);
        const dx = (x - joint + STYLE_TILE_PX) % STYLE_TILE_PX;
        if (dx === 0 || dx === 1) col = shade(base, 0.7);
        if (dx === 2) col = shade(base, 1.08);
        c.set(x, y, col);
      }
    }
    const ny = Math.floor((y0 + y1) / 2) - 1;
    for (const nx of [joint - 4, joint + 5]) {
      for (let k = 0; k < 4; k++) c.set(nx + (k % 2), ny + Math.floor(k / 2), rgb(0x7a4c2c));
    }
  }
}

/** 돌벽돌: 엇갈린 둥근 벽돌, 밝은 줄눈, 벽돌마다 다른 돌 색과 윗면 밝힘·아랫면 그늘. */
function paintStoneBrick(c: Canvas, seed: number): void {
  const grout = rgb(0xd6ccbc);
  const stones = [rgb(0x9ea3a8), rgb(0xaaa69f), rgb(0x959aa1), rgb(0xb1aca3)];
  const rowH = 16;
  const brickW = 32;
  const radius = 4.5;
  c.each((x, y) => {
    const row = Math.floor(y / rowH);
    const shift = row % 2 === 0 ? 0 : brickW / 2;
    const bx = Math.floor((x + shift) / brickW);
    const lx = ((x + shift) % brickW) + 0.5;
    const ly = (y % rowH) + 0.5;
    // 둥근 모서리 사각형 안쪽까지의 거리(줄눈 1.5 px)
    const hx = brickW / 2 - 1.5;
    const hy = rowH / 2 - 1.5;
    const qx = Math.max(0, Math.abs(lx - brickW / 2) - (hx - radius));
    const qy = Math.max(0, Math.abs(ly - rowH / 2) - (hy - radius));
    if (Math.hypot(qx, qy) > radius) return grout;
    const base =
      stones[Math.floor(hash(bx % (STYLE_TILE_PX / brickW), row, seed) * stones.length)] ?? grout;
    const n = valueNoise(x, y, 8, seed + 4);
    let k = n < 0.35 ? 0.95 : 1;
    if (ly < 3.5) k *= 1.1;
    if (ly > rowH - 4) k *= 0.86;
    return shade(base, k);
  });
}

/** 잎: 어두운 바탕 위에 둥근 잎 덩어리들, 덩어리마다 왼쪽 위 밝힘. */
function paintLeaves(c: Canvas, seed: number): void {
  const deep = rgb(0x3f8a3d);
  const mid = rgb(0x58a84b);
  const light = rgb(0x7cc766);
  c.each(() => deep);
  const blobs = Array.from({ length: 18 }, (_, i) => ({
    x: hash(i, 1, seed) * STYLE_TILE_PX,
    y: hash(i, 2, seed) * STYLE_TILE_PX,
    r: 7 + hash(i, 3, seed) * 5,
  })).sort((a, b) => a.y - b.y);
  for (const b of blobs) {
    const r = b.r;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const hl = Math.hypot(dx + r * 0.32, dy + r * 0.32) < r * 0.5;
        const rim = d > r - 1.2;
        c.set(b.x + dx, b.y + dy, rim ? shade(deep, 0.9) : hl ? light : mid);
      }
    }
  }
}

/** 시안 타일 한 장의 픽셀(STYLE_TILE_PX², RGBA, 위쪽 행부터). 같은 입력은 같은 픽셀이다. */
export function paintStyleTile(kind: StyleTileKind, seed = 1): Uint8ClampedArray {
  const c = new Canvas();
  if (kind === 'grassTop') paintGrassTop(c, seed);
  else if (kind === 'grassSide') paintGrassSide(c, seed);
  else if (kind === 'dirt') paintDirt(c, seed);
  else if (kind === 'plank') paintPlank(c, seed);
  else if (kind === 'stoneBrick') paintStoneBrick(c, seed);
  else paintLeaves(c, seed);
  return c.data;
}

/** 시안 타일을 텍스처로 올린다. 선형 필터·밉맵(픽셀이 아니라 그림처럼 보이게), sRGB. */
export function createStyleTileTexture(kind: StyleTileKind, seed = 1): THREE.DataTexture {
  const pixels = paintStyleTile(kind, seed);
  const n = STYLE_TILE_PX;
  const data = new Uint8Array(n * n * 4);
  // DataTexture 의 첫 행은 v = 0(아래)이다. 위쪽 행을 위로 두도록 뒤집는다
  for (let y = 0; y < n; y++)
    data.set(pixels.subarray(y * n * 4, (y + 1) * n * 4), (n - 1 - y) * n * 4);
  const texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}
