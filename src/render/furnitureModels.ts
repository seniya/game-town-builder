// 가구·소품 모형 지오메트리 (STYLE-003, MVP_SPEC 45.6, ADR 044·046). 기능이 한눈에 읽히는 둥근 모형이다.
// 좌표는 칸 로컬: 원점은 칸 바닥 가운데, x·z 는 −0.5~0.5, y 는 0~1(침대·문은 두 칸). 앞(기본 방향)은 −z 다.
// 부품마다 정점 색과 unlit 값(0 명암 / 1 제 색 / 2 스스로 빛남, 빛 번짐)을 넣고 한 지오메트리로 합친다. 게임 상태를 모른다.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BlockId } from '../game/data/blocks';
import { CHAIR_SEAT_HEIGHT } from '../game/data/blockShapes';
import { merge, paint, place } from './style/cuteFigure';

type V3 = [number, number, number];

/** 모형 하나: 본체와 외곽선(빛나는 부품을 뺀 것). */
export interface ModelGeometry {
  readonly body: THREE.BufferGeometry;
  readonly outline: THREE.BufferGeometry;
}

/** 부품 모음. 외곽선 없는 부품(불꽃 등)은 따로 둔다. 몬스터 모형(STYLE-007)도 쓴다. */
export class Parts {
  readonly shell: THREE.BufferGeometry[] = [];
  readonly glow: THREE.BufferGeometry[] = [];

  /** 부품 하나를 더한다. unlit 이 0 보다 크면 외곽선을 두르지 않는다. */
  add(g: THREE.BufferGeometry, color: number, unlit = 0): void {
    paint(g, color);
    const n = g.getAttribute('position').count;
    g.setAttribute('unlit', new THREE.BufferAttribute(new Float32Array(n).fill(unlit), 1));
    (unlit > 0 ? this.glow : this.shell).push(g);
  }

  /** 둥근 상자(가운데 pos). */
  box(size: V3, radius: number, color: number, pos: V3, rot: V3 = [0, 0, 0], unlit = 0): void {
    const r = Math.min(radius, Math.min(...size) / 2 - 0.001);
    this.add(
      place(new RoundedBoxGeometry(size[0], size[1], size[2], 2, r), pos, [1, 1, 1], rot),
      color,
      unlit,
    );
  }

  /** 원기둥(가운데 pos). */
  cylinder(rt: number, rb: number, h: number, color: number, pos: V3, rot: V3 = [0, 0, 0]): void {
    this.add(place(new THREE.CylinderGeometry(rt, rb, h, 14), pos, [1, 1, 1], rot), color);
  }

  /** 구(가운데 pos, 늘림). */
  ball(r: number, color: number, pos: V3, scale: V3 = [1, 1, 1], unlit = 0): void {
    this.add(place(new THREE.SphereGeometry(r, 16, 10), pos, scale), color, unlit);
  }

  /** 회전체(옆모습 [반지름, 높이], 바닥 pos). */
  lathe(profile: readonly [number, number][], color: number, pos: V3, segments = 20): void {
    const pts = profile.map(([x, y]) => new THREE.Vector2(x, y));
    this.add(place(new THREE.LatheGeometry(pts, segments), pos), color);
  }

  /** 합친 모형. */
  build(): ModelGeometry {
    const outline = merge(this.shell.map((g) => g.clone()));
    const body = merge([...this.shell, ...this.glow]);
    return { body, outline };
  }
}

const WOOD = 0xd09055;
const WOOD_LIGHT = 0xe2a86a;
const WOOD_DARK = 0x8f5a34;
const IRON = 0x55535c;
const GOLD = 0xf2c64e;
const STONE = 0xc9b49a;
const STONE_DARK = 0x9c8670;
const LINEN = 0xfbf6ec;
const FIRE = 0xff8a2a;
const FIRE_CORE = 0xffe07a;

/** 네 다리(원기둥). inset 은 가장자리에서 다리 가운데까지. */
function legs(p: Parts, inset: number, r: number, h: number, color: number): void {
  const a = 0.5 - inset;
  for (const [x, z] of [
    [-a, -a],
    [a, -a],
    [-a, a],
    [a, a],
  ] as const) {
    p.cylinder(r, r * 0.8, h, color, [x, h / 2, z]);
  }
}

/** 식탁: 둥근 상판에 식탁보(흰 바탕·붉은 띠), 네 다리. 윗면은 칸 윗면(1.0) 그대로다(음식 연출이 이 높이를 쓴다). */
function table(): ModelGeometry {
  const p = new Parts();
  legs(p, 0.12, 0.05, 0.9, WOOD_DARK);
  p.box([0.98, 0.1, 0.98], 0.04, WOOD, [0, 0.93, 0]);
  p.box([0.9, 0.025, 0.9], 0.01, LINEN, [0, 0.99, 0]);
  p.box([0.92, 0.012, 0.16], 0.005, 0xe0645a, [0, 1.0, 0]);
  return p.build();
}

/** 의자: 앉는 판·네 다리·등받이(북쪽 −z). 식탁 반대쪽으로 돌리는 것은 뷰가 한다. */
function chair(): ModelGeometry {
  const p = new Parts();
  const seat = CHAIR_SEAT_HEIGHT;
  legs(p, 0.2, 0.04, seat - 0.06, WOOD_DARK);
  p.box([0.74, 0.08, 0.74], 0.03, WOOD, [0, seat - 0.04, 0]);
  p.box([0.6, 0.03, 0.56], 0.015, 0xe0645a, [0, seat + 0.01, 0.03]);
  for (const x of [-0.3, 0.3]) p.cylinder(0.035, 0.035, 0.46, WOOD_DARK, [x, seat + 0.2, -0.33]);
  p.box([0.68, 0.2, 0.06], 0.03, WOOD_LIGHT, [0, seat + 0.33, -0.33]);
  return p.build();
}

/** 상자: 나무 몸통, 둥근 뚜껑, 쇠 띠 둘, 앞뒤 금 자물쇠. */
function chest(): ModelGeometry {
  const p = new Parts();
  p.box([0.86, 0.5, 0.7], 0.05, WOOD, [0, 0.27, 0]);
  p.add(
    place(
      new THREE.CylinderGeometry(0.35, 0.35, 0.86, 18, 1, false, 0, Math.PI),
      [0, 0.52, 0],
      [1, 0.55, 1],
      [0, 0, Math.PI / 2],
    ),
    WOOD_LIGHT,
  );
  for (const x of [-0.3, 0.3]) {
    p.box([0.07, 0.52, 0.74], 0.02, IRON, [x, 0.27, 0]);
    p.add(
      place(
        new THREE.CylinderGeometry(0.365, 0.365, 0.07, 18, 1, false, 0, Math.PI),
        [x, 0.52, 0],
        [1, 0.57, 1],
        [0, 0, Math.PI / 2],
      ),
      IRON,
    );
  }
  for (const z of [-0.36, 0.36]) p.box([0.14, 0.16, 0.05], 0.03, GOLD, [0, 0.45, z]);
  return p.build();
}

/** 화덕: 둥근 돌 몸통(돌 무늬), 네 면의 밝은 아치 아궁이와 불, 윗판, 쇠 냄비와 국. 어느 쪽에서 봐도 불이 보인다. */
function stove(): ModelGeometry {
  const p = new Parts();
  p.box([0.92, 0.7, 0.92], 0.14, STONE, [0, 0.35, 0]);
  p.box([0.98, 0.08, 0.98], 0.04, STONE_DARK, [0, 0.72, 0]);
  // 몸통에 박힌 둥근 돌 몇 개(돌 화덕으로 읽히게)
  for (const [x, y, z] of [
    [-0.47, 0.55, 0.28],
    [0.47, 0.5, -0.3],
    [0.3, 0.58, 0.47],
    [-0.28, 0.52, -0.47],
  ] as const) {
    p.ball(0.07, STONE_DARK, [x, y, z], [1.4, 0.8, 1.4]);
  }
  for (let side = 0; side < 4; side++) {
    const a = (side * Math.PI) / 2;
    const at = (d: number, y: number): V3 => [Math.sin(a) * d, y, -Math.cos(a) * d];
    const rot: V3 = [0, -a, 0];
    // 아치: 밝은 테두리, 어두운 속, 장작, 불
    p.box([0.42, 0.34, 0.06], 0.12, 0xf1e4cc, at(0.45, 0.26), rot);
    p.box([0.32, 0.28, 0.07], 0.11, 0x3a2218, at(0.455, 0.24), rot);
    p.box([0.28, 0.05, 0.08], 0.02, WOOD_DARK, at(0.46, 0.12), rot);
    p.ball(0.08, FIRE, at(0.47, 0.19), [1.2, 1.1, 1.2], 2);
    p.ball(0.045, FIRE_CORE, at(0.48, 0.18), [1.1, 1.2, 1.1], 2);
  }
  // 냄비와 손잡이, 국
  p.lathe(
    [
      [0, 0],
      [0.2, 0.01],
      [0.25, 0.08],
      [0.26, 0.2],
      [0.24, 0.22],
    ],
    IRON,
    [0, 0.76, 0],
  );
  p.cylinder(0.22, 0.22, 0.02, 0xf0a040, [0, 0.96, 0]);
  for (const x of [-0.27, 0.27]) p.ball(0.04, IRON, [x, 0.94, 0], [1, 0.6, 1.6]);
  return p.build();
}

/** 물 항아리: 질그릇 몸통, 파란 띠, 넓은 입구의 물빛, 국자. */
function waterPot(): ModelGeometry {
  const p = new Parts();
  p.lathe(
    [
      [0, 0],
      [0.22, 0.01],
      [0.34, 0.14],
      [0.38, 0.34],
      [0.32, 0.56],
      [0.24, 0.66],
      [0.27, 0.72],
      [0.25, 0.74],
    ],
    0xde8b58,
    [0, 0, 0],
  );
  p.add(
    place(
      new THREE.TorusGeometry(0.375, 0.03, 6, 24),
      [0, 0.34, 0],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    ),
    0x4d8fd0,
  );
  p.cylinder(0.235, 0.235, 0.02, 0x6ec4ee, [0, 0.7, 0]);
  p.cylinder(0.02, 0.02, 0.42, WOOD_DARK, [0.1, 0.82, 0.05], [0.2, 0, -0.5]);
  p.ball(0.06, WOOD_DARK, [0.02, 0.66, 0.02], [1, 0.5, 1]);
  return p.build();
}

/** 종: 돌 받침, 나무 기둥 둘과 들보, 매달린 금빛 종과 추. */
function bell(): ModelGeometry {
  const p = new Parts();
  p.cylinder(0.42, 0.46, 0.1, STONE, [0, 0.05, 0]);
  for (const x of [-0.36, 0.36]) p.cylinder(0.045, 0.05, 0.9, WOOD_DARK, [x, 0.55, 0]);
  p.box([0.9, 0.08, 0.12], 0.03, WOOD, [0, 0.98, 0]);
  p.lathe(
    [
      [0, 0.52],
      [0.08, 0.5],
      [0.14, 0.42],
      [0.17, 0.3],
      [0.23, 0.2],
      [0.26, 0.17],
      [0, 0.17],
    ],
    GOLD,
    [0, 0.2, 0],
  );
  p.ball(0.05, 0xc99a33, [0, 0.39, 0]);
  p.cylinder(0.015, 0.015, 0.25, WOOD_DARK, [0, 0.83, 0]);
  return p.build();
}

/** 횃불: 나무 막대, 감은 천, 스스로 빛나는 두 겹 불꽃. */
function torch(): ModelGeometry {
  const p = new Parts();
  p.cylinder(0.05, 0.04, 0.6, WOOD_DARK, [0, 0.3, 0]);
  p.cylinder(0.065, 0.06, 0.1, 0xb8804a, [0, 0.58, 0]);
  p.ball(0.11, FIRE, [0, 0.72, 0], [1, 1.35, 1], 2);
  p.ball(0.065, FIRE_CORE, [0, 0.7, 0], [1, 1.3, 1], 2);
  return p.build();
}

/**
 * 침대(두 칸): 로컬 −z 끝이 머리(anchor 칸), +z 가 발이다. anchor 칸 가운데가 원점이다.
 * 둥근 나무 틀, 흰 매트리스, 붉은 이불과 접은 흰 끝, 둥근 베개, 하트 무늬 없는 둥근 머리판.
 */
function bedModel(): ModelGeometry {
  const p = new Parts();
  p.box([0.98, 0.24, 1.96], 0.06, WOOD, [0, 0.14, 0.5]);
  p.box([0.9, 0.18, 1.86], 0.08, LINEN, [0, 0.33, 0.52]);
  p.box([0.94, 0.1, 1.24], 0.05, 0xe0645a, [0, 0.42, 0.86]);
  p.box([0.95, 0.11, 0.16], 0.05, LINEN, [0, 0.43, 0.24]);
  p.box([0.6, 0.12, 0.32], 0.06, 0xffffff, [0, 0.47, -0.2]);
  p.box([1.0, 0.86, 0.1], 0.05, WOOD_DARK, [0, 0.43, -0.46]);
  p.box([0.84, 0.1, 0.12], 0.04, WOOD_LIGHT, [0, 0.8, -0.46]);
  p.box([1.0, 0.46, 0.08], 0.04, WOOD_DARK, [0, 0.23, 1.46]);
  return p.build();
}

/** 문 한 짝(두 칸 높이): 경첩 피벗에서 +x 로 1 칸 뻗는다. 둥근 판, 가로대 둘, 창문, 금 손잡이. */
function doorLeaf(): ModelGeometry {
  const p = new Parts();
  p.box([0.96, 1.96, 0.1], 0.04, WOOD, [0.5, 1.0, 0]);
  for (const y of [0.55, 1.45]) p.box([0.92, 0.09, 0.13], 0.03, WOOD_DARK, [0.5, y, 0]);
  p.box([0.36, 0.3, 0.12], 0.06, 0xbfe6f5, [0.5, 1.68, 0]);
  p.ball(0.05, GOLD, [0.84, 1.0, -0.07]);
  p.ball(0.05, GOLD, [0.84, 1.0, 0.07]);
  return p.build();
}

/** 한 칸 가구 모형을 그리는 블록과 모형(청크 메시 대신, blocks.prop). */
export const FURNITURE_BLOCKS = [
  BlockId.table,
  BlockId.chair,
  BlockId.chest,
  BlockId.cooking_stove,
  BlockId.water_pot,
  BlockId.bell,
  BlockId.torch,
] as const;

/** 모형 이름. 두 칸 모형(침대·문)을 포함한다. */
export type ModelName =
  'table' | 'chair' | 'chest' | 'stove' | 'waterPot' | 'bell' | 'torch' | 'bed' | 'door';

const BUILDERS: Record<ModelName, () => ModelGeometry> = {
  table,
  chair,
  chest,
  stove,
  waterPot,
  bell,
  torch,
  bed: bedModel,
  door: doorLeaf,
};

/** 블록 id → 모형 이름. */
export const BLOCK_MODEL: ReadonlyMap<number, ModelName> = new Map<number, ModelName>([
  [BlockId.table, 'table'],
  [BlockId.chair, 'chair'],
  [BlockId.chest, 'chest'],
  [BlockId.cooking_stove, 'stove'],
  [BlockId.water_pot, 'waterPot'],
  [BlockId.bell, 'bell'],
  [BlockId.torch, 'torch'],
  [BlockId.bed, 'bed'],
  [BlockId.door, 'door'],
]);

const cache = new Map<ModelName, ModelGeometry>();

/** 모형 지오메트리(이름마다 한 번 만들어 공유한다). */
export function modelGeometry(name: ModelName): ModelGeometry {
  let g = cache.get(name);
  if (!g) {
    g = BUILDERS[name]();
    cache.set(name, g);
  }
  return g;
}

/**
 * 몬스터(STYLE-007, MVP_SPEC 45.7): 무섭기보다 "혼내 주고 싶은" 둥근 꼬마 악당. 특정 DQ 몬스터를 닮게 하지 않는다.
 * 보라 몸통 방울, 밝은 배, 작은 뿔 둘, 찡그린 눈썹과 스스로 빛나는 노란 눈, 작은 송곳니, 짧은 팔·발, 말린 꼬리. 앞은 −z.
 */
function monster(): ModelGeometry {
  const p = new Parts();
  const body = 0x6a4a9a;
  const dark = 0x3e2a5e;
  p.ball(0.46, body, [0, 0.5, 0], [1.05, 0.95, 1]);
  p.ball(0.3, 0xa58ad0, [0, 0.42, -0.24], [1, 1, 0.55]);
  for (const s of [-1, 1]) {
    p.add(
      place(
        new THREE.ConeGeometry(0.08, 0.26, 10),
        [s * 0.22, 0.98, 0.02],
        [1, 1, 1],
        [0, 0, -s * 0.35],
      ),
      0xf2e2c0,
    );
    p.ball(0.1, dark, [s * 0.14, 0.05, -0.08], [1.2, 0.6, 1.5]);
    p.ball(0.09, body, [s * 0.46, 0.44, -0.05], [0.8, 1.2, 0.8]);
    // 찡그린 눈썹(안쪽이 내려간다)
    p.box([0.16, 0.035, 0.04], 0.015, dark, [s * 0.14, 0.78, -0.42], [0, 0, s * 0.35]);
    p.ball(0.07, 0xffe05a, [s * 0.14, 0.66, -0.41], [1, 1.1, 0.5], 2);
    p.ball(0.028, 0x2a1d38, [s * 0.13, 0.65, -0.44], [1, 1.2, 0.5], 1);
    p.add(
      place(
        new THREE.ConeGeometry(0.03, 0.07, 6),
        [s * 0.08, 0.43, -0.43],
        [1, 1, 1],
        [Math.PI, 0, 0],
      ),
      0xffffff,
    );
  }
  // 입(찡그린 선)과 말린 꼬리
  p.box([0.2, 0.03, 0.03], 0.012, dark, [0, 0.47, -0.43]);
  p.add(
    place(
      new THREE.TorusGeometry(0.1, 0.035, 6, 12, Math.PI * 1.4),
      [0, 0.35, 0.5],
      [1, 1, 1],
      [0, Math.PI / 2, 0],
    ),
    dark,
  );
  return p.build();
}

let monsterCache: ModelGeometry | null = null;

/** 몬스터 모형 지오메트리(한 번 만들어 공유한다). */
export function monsterGeometry(): ModelGeometry {
  monsterCache ??= monster();
  return monsterCache;
}
