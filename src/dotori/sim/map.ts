// 타일 격자: 읽기·쓰기, 통과와 이동 비용, 처음 지도 만들기, 장소 목록 다시 계산 (SPEC 2).
import {
  FARM,
  FOREST_BLOBS,
  FOREST_JITTER,
  FOUNTAIN,
  LAKE,
  PLAZA,
  ROADS,
  SCATTER_TREE_CHANCE,
  TERRACE,
} from '../data/villageMap';
import type { Locations, Pt, World } from './types';
import { TILE } from './types';

const N4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 지도 안인가. */
export function inb(w: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < w.W && y < w.H;
}

/** 타일 종류. 지도 밖은 물로 본다. */
export function getT(w: World, x: number, y: number): number {
  return inb(w, x, y) ? (w.tiles[y * w.W + x] ?? TILE.WATER) : TILE.WATER;
}

/** 타일을 바꾼다(지도 밖이면 무시). */
export function setT(w: World, x: number, y: number, v: number): void {
  if (inb(w, x, y)) w.tiles[y * w.W + x] = v;
}

/** 이 타일 종류를 걸어서 지나갈 수 있는가. */
export function passableTile(t: number): boolean {
  return t !== TILE.WATER && t !== TILE.BLD && t !== TILE.FOUNT && t !== TILE.SITE;
}

/** (x, y) 를 지나갈 수 있는가. */
export function passable(w: World, x: number, y: number): boolean {
  return passableTile(getT(w, x, y));
}

/** 타일 이동 비용(시험판). 지나갈 수 없는 타일은 99. */
export function tileCost(t: number): number {
  switch (t) {
    case TILE.PATH:
    case TILE.PLAZA:
    case TILE.DOOR:
      return 1;
    case TILE.SAND:
      return 1.3;
    case TILE.GRASS:
      return 1.8;
    case TILE.FARM:
      return 2;
    case TILE.FOREST:
      return 5;
    default:
      return 99;
  }
}

/** 직사각형을 한 타일 종류로 칠한다. */
export function fillRect(
  w: World,
  x0: number,
  y0: number,
  rw: number,
  rh: number,
  t: number,
): void {
  for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) setT(w, x, y, t);
}

/** 처음 지형(숲·호수·길·밭·광장·분수)을 칠한다. 건물은 world.ts 가 놓는다. */
export function paintTerrain(w: World): void {
  w.tiles.fill(TILE.GRASS);
  const R = (): number => w.rng.next();
  for (let y = 0; y < w.H; y++)
    for (let x = 0; x < w.W; x++) {
      for (const [bx, by, r] of FOREST_BLOBS) {
        const d = Math.hypot(x - bx, y - by) / r + (R() - 0.5) * FOREST_JITTER;
        if (d < 1) setT(w, x, y, TILE.FOREST);
      }
      const e = ((x - LAKE.cx) / LAKE.rx) ** 2 + ((y - LAKE.cy) / LAKE.ry) ** 2;
      if (e < 1) setT(w, x, y, TILE.WATER);
      else if (e < LAKE.shore) setT(w, x, y, TILE.SAND);
    }
  for (const [x0, y0, x1, y1] of ROADS) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
        if (getT(w, x, y) !== TILE.WATER) setT(w, x, y, TILE.PATH);
  }
  fillRect(w, FARM.x, FARM.y, FARM.w, FARM.h, TILE.FARM);
  fillRect(w, PLAZA.x, PLAZA.y, PLAZA.w, PLAZA.h, TILE.PLAZA);
  fillRect(w, TERRACE.x, TERRACE.y, TERRACE.w, TERRACE.h, TILE.PLAZA);
  setT(w, FOUNTAIN.x, FOUNTAIN.y, TILE.FOUNT);
}

/** 풀밭에 흩어진 나무를 심는다(건물을 놓은 뒤에 부른다). */
export function scatterTrees(w: World): void {
  for (let y = 1; y < w.H - 1; y++)
    for (let x = 1; x < w.W - 1; x++) {
      if (getT(w, x, y) !== TILE.GRASS || w.rng.next() > SCATTER_TREE_CHANCE) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const t = getT(w, x + dx, y + dy);
          if (t !== TILE.GRASS && t !== TILE.FOREST) near = true;
        }
      if (!near) setT(w, x, y, TILE.FOREST);
    }
}

/** 네 이웃 중 조건을 만족하는 칸이 있는가. */
export function hasNeighbor(w: World, x: number, y: number, pred: (t: number) => boolean): boolean {
  return N4.some(([dx, dy]) => pred(getT(w, x + dx, y + dy)));
}

/** 네 이웃 중 조건을 만족하는 첫 방향. */
export function neighborDir(
  w: World,
  x: number,
  y: number,
  pred: (t: number) => boolean,
): Pt | null {
  for (const [dx, dy] of N4) if (pred(getT(w, x + dx, y + dy))) return { x: dx, y: dy };
  return null;
}

/** 장소 목록과 숲까지의 거리를 다시 계산한다. 지형이 바뀔 때마다 부른다. */
export function recomputeLocations(w: World): void {
  const L: Locations = {
    farm: [],
    forest: [],
    forestEdge: [],
    shore: [],
    plaza: [],
    terrace: [],
    grass: [],
    water: [],
  };
  for (let y = 0; y < w.H; y++)
    for (let x = 0; x < w.W; x++) {
      const t = getT(w, x, y);
      if (t === TILE.FARM) L.farm.push({ x, y });
      else if (t === TILE.FOREST) L.forest.push({ x, y });
      else if (t === TILE.GRASS) L.grass.push({ x, y });
      else if (t === TILE.WATER) L.water.push({ x, y });
      else if (t === TILE.PLAZA) {
        const inTerrace =
          y >= TERRACE.y &&
          y < TERRACE.y + TERRACE.h &&
          x >= TERRACE.x &&
          x < TERRACE.x + TERRACE.w;
        if (inTerrace) L.terrace.push({ x, y });
        else if (Math.max(Math.abs(x - FOUNTAIN.x), Math.abs(y - FOUNTAIN.y)) > 1)
          L.plaza.push({ x, y });
      } else if (t === TILE.SAND && hasNeighbor(w, x, y, (n) => n === TILE.WATER))
        L.shore.push({ x, y });
      if (
        t !== TILE.FOREST &&
        t !== TILE.DOOR &&
        passableTile(t) &&
        hasNeighbor(w, x, y, (n) => n === TILE.FOREST)
      )
        L.forestEdge.push({ x, y });
    }
  w.L = L;
  const fd = new Uint8Array(w.W * w.H).fill(255);
  const q: number[] = [];
  for (const f of L.forest) {
    fd[f.y * w.W + f.x] = 0;
    q.push(f.y * w.W + f.x);
  }
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi] as number;
    const cx = c % w.W;
    const cy = (c / w.W) | 0;
    const cd = fd[c] as number;
    for (const [dx, dy] of N4) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inb(w, nx, ny)) continue;
      const ni = ny * w.W + nx;
      if ((fd[ni] as number) > cd + 1) {
        fd[ni] = cd + 1;
        q.push(ni);
      }
    }
  }
  w.forestDist = fd;
}
