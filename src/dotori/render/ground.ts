// 지면 텍스처와 수면. 풀·길·광장·밭·모래·물가를 한 장의 캔버스에 칠한다. 건물·나무는 모델로 따로 놓는다.
import * as THREE from 'three';
import { FARM, PLAZA, TERRACE } from '../data/villageMap';
import { getT } from '../sim/map';
import { hash01 } from '../sim/rng';
import type { World } from '../sim/types';
import { TILE } from '../sim/types';

const TS = 32;

/** 지면 텍스처를 칠한다. 지형이 바뀌면 다시 부른다. */
export function paintGround(w: World, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const c = canvas ?? document.createElement('canvas');
  c.width = w.W * TS;
  c.height = w.H * TS;
  const g = c.getContext('2d');
  if (!g) return c;
  const W = w.W;
  const H = w.H;
  g.fillStyle = '#93c979';
  g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = hash01(x * 131 + y * 7);
      g.fillStyle =
        k < 0.33 ? 'rgba(255,255,210,0.10)' : k < 0.66 ? 'rgba(40,90,30,0.07)' : 'rgba(0,0,0,0)';
      g.fillRect(x * TS, y * TS, TS, TS);
      const t = getT(w, x, y);
      if (t === TILE.FOREST) {
        g.fillStyle = 'rgba(40,80,30,0.18)';
        g.fillRect(x * TS, y * TS, TS, TS);
      }
      if (t === TILE.GRASS && hash01(x * 17 + y * 91) < 0.3) {
        g.strokeStyle = 'rgba(60,120,50,0.35)';
        g.lineWidth = 2;
        const cx = x * TS + hash01(x + y * 3) * TS;
        const cy = y * TS + hash01(x * 5 + y) * TS;
        g.beginPath();
        g.moveTo(cx - 4, cy - 5);
        g.lineTo(cx, cy);
        g.lineTo(cx + 4, cy - 5);
        g.stroke();
      }
      if (t === TILE.SITE) {
        g.fillStyle = '#b89468';
        g.fillRect(x * TS, y * TS, TS, TS);
      }
    }
  for (let y = FARM.y; y < FARM.y + FARM.h; y++)
    for (let x = FARM.x; x < FARM.x + FARM.w; x++) {
      if (getT(w, x, y) !== TILE.FARM) continue;
      g.fillStyle = '#a8784c';
      g.fillRect(x * TS, y * TS, TS, TS);
      g.fillStyle = '#946740';
      g.fillRect(x * TS, y * TS + TS * 0.55, TS, TS * 0.25);
    }
  const circ = (x: number, y: number, r: number, col: string): void => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, r, 0, 7);
    g.fill();
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = getT(w, x, y);
      if (t === TILE.SAND || t === TILE.WATER)
        circ((x + 0.5) * TS, (y + 0.5) * TS, TS * 0.85, '#efd9a4');
    }
  for (const p of w.L.water) circ((p.x + 0.5) * TS, (p.y + 0.5) * TS, TS * 0.78, '#3f8fb8');
  const isRoad = (x: number, y: number): boolean => {
    const t = getT(w, x, y);
    return t === TILE.PATH || t === TILE.DOOR;
  };
  g.fillStyle = '#e6cf9c';
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!isRoad(x, y)) continue;
      const cx = (x + 0.5) * TS;
      const cy = (y + 0.5) * TS;
      g.beginPath();
      g.arc(cx, cy, TS * 0.5, 0, 7);
      g.fill();
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ] as const) {
        const t = getT(w, x + dx, y + dy);
        if (isRoad(x + dx, y + dy) || t === TILE.PLAZA) {
          if (dx) g.fillRect(cx, cy - TS * 0.5, TS, TS);
          else g.fillRect(cx - TS * 0.5, cy, TS, TS);
        }
      }
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (isRoad(x, y) && hash01(x * 7 + y * 29) < 0.5) {
        g.fillStyle = 'rgba(150,120,70,0.25)';
        g.beginPath();
        g.arc(x * TS + hash01(x + y) * TS, y * TS + hash01(y * 3 + x) * TS, 2.2, 0, 7);
        g.fill();
      }
  // 광장 돌바닥과 테라스 나무 바닥
  g.fillStyle = '#e9dcc2';
  g.beginPath();
  g.roundRect(PLAZA.x * TS + 3, PLAZA.y * TS + 3, PLAZA.w * TS - 6, PLAZA.h * TS - 6, TS * 0.8);
  g.fill();
  g.strokeStyle = '#cdb994';
  g.lineWidth = 4;
  g.stroke();
  g.strokeStyle = 'rgba(120,90,50,0.12)';
  g.lineWidth = 1.5;
  for (let y = PLAZA.y; y < PLAZA.y + PLAZA.h; y++)
    for (let x = PLAZA.x; x < PLAZA.x + PLAZA.w; x++) {
      const o = ((y % 2) * TS) / 2;
      g.strokeRect(x * TS + o + 4, y * TS + 4, TS - 8, TS - 8);
    }
  g.fillStyle = '#c9a57a';
  g.beginPath();
  g.roundRect(TERRACE.x * TS, TERRACE.y * TS + 3, TERRACE.w * TS, TS - 6, 6);
  g.fill();
  g.strokeStyle = 'rgba(90,60,30,0.3)';
  for (let x = TERRACE.x; x < TERRACE.x + TERRACE.w; x++) {
    g.beginPath();
    g.moveTo(x * TS + TS / 2, TERRACE.y * TS + 4);
    g.lineTo(x * TS + TS / 2, (TERRACE.y + 1) * TS - 4);
    g.stroke();
  }
  // 들꽃
  const cols = ['#f7a1c4', '#ffe08a', '#ffffff', '#c9b6ff'];
  for (const p of w.L.grass)
    if (hash01(p.x * 3 + p.y * 57) < 0.08)
      for (let i = 0; i < 3; i++)
        circ(
          p.x * TS + hash01(p.x + i) * TS,
          p.y * TS + hash01(p.y + i * 7) * TS,
          3,
          cols[(p.x + i) % 4] ?? '#fff',
        );
  // 꽃밭 흙
  for (const d of w.decor)
    if (d.kind === 'flowerbed') {
      g.fillStyle = '#8f6a45';
      g.beginPath();
      g.roundRect(d.x * TS + 3, d.y * TS + 3, d.w * TS - 6, d.h * TS - 6, 10);
      g.fill();
    }
  return c;
}

/** 캔버스를 지면 텍스처로. */
export function groundTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** 물 타일 위 수면 기하. */
export function waterGeometry(w: World): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const p of w.L.water) {
    const x = p.x;
    const z = p.y;
    pos.push(x, 0, z, x, 0, z + 1, x + 1, 0, z, x + 1, 0, z, x, 0, z + 1, x + 1, 0, z + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}
