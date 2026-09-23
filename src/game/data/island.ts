// 고정 섬 지형 (MVP_SPEC 7.1 / 7.4 / 7.5, TASK-008). 난수·노이즈를 쓰지 않는다.
// 해안선 조화 계수·언덕·나무·폐허 좌표를 손으로 정한 고정 데이터로 두고, 그 식으로 매번 같은 섬을 만든다.
// data 계층이므로 voxel 을 import 하지 않고 WriteBlock 콜백으로 쓴다 (ARCHITECTURE 24.2).
import type { BlockPos, WriteBlock } from '../types';
import { balance } from './balance';
import { BlockId } from './blocks';

const W = balance.world;
const SEA = W.seaLevel;

/** 섬 중심. 마을 터와 같다. */
const CENTER = { x: W.bellPos.x, z: W.bellPos.z };

/** 해안선 반지름 r(θ) = base + Σ a·sin(kθ + φ). 고정 계수다. */
const COAST = {
  base: 52,
  harmonics: [
    { k: 2, a: 3, phase: 0.6 },
    { k: 3, a: 2, phase: 1.9 },
    { k: 5, a: 1.5, phase: 0.4 },
  ],
  /** 해안에서 안쪽으로 이 거리까지 모래 해변 경사 */
  beachWidth: 4,
} as const;

/** 평지 지표면 높이. 마을 광장이 이 높이다. */
const PLAINS_Y = 27;
const LAND_MIN_Y = 25;
const LAND_MAX_Y = 34;

/** MVP_SPEC 7.4 의 영역 중심 (x, z). */
export const ISLAND_REGIONS = {
  village: { x: 64, z: 64 },
  forest: { x: 40, z: 48 },
  quarry: { x: 88, z: 52 },
  waterside: { x: 64, z: 96 },
  outskirtsNorth: { x: 64, z: 24 },
  outskirtsWest: { x: 24, z: 64 },
} as const;

/** 언덕 (중심, 반지름, 높이). 코사인 감쇠로 더한다. */
const HILLS: readonly { x: number; z: number; r: number; h: number }[] = [
  { x: 88, z: 52, r: 14, h: 6 }, // 채석장 돌 언덕
  { x: 40, z: 48, r: 17, h: 2 }, // 숲의 완만한 둔덕
  { x: 64, z: 24, r: 10, h: 1 },
  { x: 24, z: 64, r: 10, h: 1 },
  { x: 92, z: 88, r: 11, h: 3 },
  { x: 38, z: 88, r: 9, h: 2 },
];

/** 채석장 노출 돌 반지름. 이 안의 지표는 풀·흙 없이 돌이다. */
const QUARRY_RADIUS = 10;
/** 재생 후보가 되는 채석장 돌의 최저 y. 평지보다 위의 언덕 몸체다. */
const QUARRY_CANDIDATE_MIN_Y = PLAINS_Y + 1;
/** 어두운 외곽의 흙 지표 반지름. */
const OUTSKIRTS_RADIUS = 7;
/** 연못: 반지름, 물 표면 y, 모래 테두리 바깥 반지름. */
const POND = { r: 6, deepR: 4, waterTopY: PLAINS_Y - 1, sandR: 8.5 } as const;

/** 나무 24 그루의 밑동 (x, z). 숲 (40, 48) 둘레의 손으로 흔든 격자다. 간격 ≥ 3 으로 수관이 겹치지 않는다. */
const TREE_XZ: readonly (readonly [number, number])[] = [
  [26, 38],
  [31, 39],
  [36, 37],
  [41, 38],
  [46, 39],
  [51, 38],
  [27, 43],
  [32, 44],
  [37, 42],
  [42, 44],
  [47, 43],
  [52, 44],
  [26, 48],
  [31, 49],
  [36, 47],
  [41, 49],
  [46, 48],
  [51, 49],
  [27, 53],
  [32, 54],
  [37, 52],
  [42, 54],
  [47, 53],
  [52, 52],
];

/** 폐허 한 곳: 돌벽돌 기초 사각형과 남아 있는 판자벽 조각 (높이 1~2). 닫힌 방을 만들지 않는다. */
interface Ruin {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  /** [x, z, 높이] 판자벽 조각 */
  readonly walls: readonly (readonly [number, number, number])[];
}

/** 마을 터 (64, 64) 둘레의 폐허 세 곳. 광장 반지름 안과 시작 위치는 비워 둔다. */
const RUINS: readonly Ruin[] = [
  {
    x0: 50,
    z0: 57,
    x1: 56,
    z1: 62,
    walls: [
      [50, 57, 2],
      [51, 57, 2],
      [52, 57, 1],
      [50, 58, 2],
      [50, 59, 1],
      [56, 57, 1],
      [55, 62, 1],
      [56, 62, 2],
      [56, 61, 1],
    ],
  },
  {
    x0: 72,
    z0: 71,
    x1: 78,
    z1: 77,
    walls: [
      [72, 71, 1],
      [73, 71, 2],
      [74, 71, 2],
      [78, 71, 1],
      [78, 72, 2],
      [78, 73, 1],
      [72, 77, 2],
      [72, 76, 1],
    ],
  },
  {
    x0: 69,
    z0: 47,
    x1: 74,
    z1: 52,
    walls: [
      [69, 47, 2],
      [70, 47, 1],
      [69, 48, 1],
      [74, 52, 2],
      [73, 52, 2],
      [74, 51, 1],
    ],
  },
];

/** 생성 결과의 좌표 정보. 블록은 WriteBlock 으로 이미 쓰였다. */
export interface IslandData {
  /** 종 블록 칸 = (64, 지표면 + 1, 64). 광장 지면 위에 서 있다 */
  readonly bellPos: BlockPos;
  /** MVP_SPEC 7.5 의 시작 위치. 발이 놓일 칸(지표면 + 1)이다 */
  readonly playerSpawn: BlockPos;
  readonly npcSpawns: {
    readonly farmer: BlockPos;
    readonly cook: BlockPos;
    readonly carpenter: BlockPos;
  };
  /** 어두운 외곽의 몬스터 스폰 칸 2 곳 */
  readonly monsterSpawns: readonly BlockPos[];
  /** 나무 밑동(첫 log 칸) 24 개 */
  readonly treeBases: readonly BlockPos[];
  /** 채석장 재생 후보. 원래 돌이던 칸이며 y → z → x 오름차순이다 (MVP_SPEC 14.2) */
  readonly quarryRespawnCandidates: readonly BlockPos[];
}

/** 두 점의 수평 거리. */
function dist(x: number, z: number, cx: number, cz: number): number {
  return Math.hypot(x - cx, z - cz);
}

/** 방향 θ 의 해안선 반지름. */
function coastRadius(theta: number): number {
  let r = COAST.base;
  for (const h of COAST.harmonics) r += h.a * Math.sin(h.k * theta + h.phase);
  return r;
}

/** 열 (x, z) 의 지형 종류와 지표면 높이. */
interface Column {
  readonly kind: 'land' | 'sea' | 'pond';
  /** land: 최상단 지형 블록 y. sea / pond: 바닥(모래) 최상단 y */
  readonly top: number;
  readonly beach: boolean;
}

/** 열 하나의 형태를 계산한다. 같은 입력은 항상 같은 결과다. */
function columnAt(x: number, z: number): Column {
  const d = dist(x + 0.5, z + 0.5, CENTER.x, CENTER.z);
  const r = coastRadius(Math.atan2(z + 0.5 - CENTER.z, x + 0.5 - CENTER.x));
  if (d > r) {
    // 바다: 해안에서 멀어질수록 깊어진다
    const floor = Math.max(SEA - 8, SEA - 1 - Math.floor((d - r) / 2));
    return { kind: 'sea', top: floor, beach: false };
  }
  const p = dist(x + 0.5, z + 0.5, ISLAND_REGIONS.waterside.x, ISLAND_REGIONS.waterside.z);
  if (p < POND.r) {
    return {
      kind: 'pond',
      top: p < POND.deepR ? POND.waterTopY - 2 : POND.waterTopY - 1,
      beach: false,
    };
  }
  let h = PLAINS_Y;
  for (const hill of HILLS) {
    const hd = dist(x + 0.5, z + 0.5, hill.x, hill.z);
    if (hd < hill.r) h += hill.h * (0.5 + 0.5 * Math.cos((Math.PI * hd) / hill.r));
  }
  // 마을 광장은 평평하게, 그 바깥 4 칸은 부드럽게 잇는다
  const vd = dist(x + 0.5, z + 0.5, CENTER.x, CENTER.z);
  const plaza = balance.world.plazaRadius;
  if (vd <= plaza) h = PLAINS_Y;
  else if (vd < plaza + 4) h = PLAINS_Y + (h - PLAINS_Y) * ((vd - plaza) / 4);
  // 해변 경사
  const inland = r - d;
  let beach = false;
  if (inland < COAST.beachWidth) {
    h = LAND_MIN_Y + (h - LAND_MIN_Y) * (inland / COAST.beachWidth);
    beach = inland < COAST.beachWidth * 0.75;
  }
  if (p < POND.sandR) beach = true;
  const top = Math.min(LAND_MAX_Y, Math.max(LAND_MIN_Y, Math.round(h)));
  return { kind: 'land', top, beach: beach || top <= LAND_MIN_Y };
}

/** 열의 최상단 지형 블록 y (지표면). 바다·연못은 바닥 y 다. */
export function surfaceY(x: number, z: number): number {
  return columnAt(x, z).top;
}

/** (x, z) 가 채석장 노출 돌 지대인가. */
function inQuarry(x: number, z: number): boolean {
  return dist(x + 0.5, z + 0.5, ISLAND_REGIONS.quarry.x, ISLAND_REGIONS.quarry.z) < QUARRY_RADIUS;
}

/** (x, z) 가 어두운 외곽의 흙 지대인가. */
function inOutskirts(x: number, z: number): boolean {
  return (
    dist(x + 0.5, z + 0.5, ISLAND_REGIONS.outskirtsNorth.x, ISLAND_REGIONS.outskirtsNorth.z) <
      OUTSKIRTS_RADIUS ||
    dist(x + 0.5, z + 0.5, ISLAND_REGIONS.outskirtsWest.x, ISLAND_REGIONS.outskirtsWest.z) <
      OUTSKIRTS_RADIUS
  );
}

/** 지형 열 하나를 쓴다: bedrock / 돌 / 흙 / 지표 / 물. */
function writeColumn(write: WriteBlock, x: number, z: number, col: Column): void {
  write(x, 0, z, BlockId.bedrock);
  if (col.kind === 'sea') {
    for (let y = 1; y < col.top - 1; y++) write(x, y, z, BlockId.stone);
    write(x, col.top - 1, z, BlockId.sand);
    write(x, col.top, z, BlockId.sand);
    for (let y = col.top + 1; y <= SEA; y++) write(x, y, z, BlockId.water);
    return;
  }
  if (col.kind === 'pond') {
    for (let y = 1; y < col.top - 1; y++) write(x, y, z, BlockId.stone);
    write(x, col.top - 1, z, BlockId.sand);
    write(x, col.top, z, BlockId.sand);
    for (let y = col.top + 1; y <= POND.waterTopY; y++) write(x, y, z, BlockId.water);
    return;
  }
  const top = col.top;
  const quarry = inQuarry(x, z);
  for (let y = 1; y <= top - 4; y++) write(x, y, z, BlockId.stone);
  for (let y = top - 3; y < top; y++) {
    write(x, y, z, quarry ? BlockId.stone : col.beach ? BlockId.sand : BlockId.dirt);
  }
  const surface = quarry
    ? BlockId.stone
    : col.beach
      ? BlockId.sand
      : inOutskirts(x, z)
        ? BlockId.dirt
        : BlockId.grass;
  write(x, top, z, surface);
}

/** 나무 한 그루: log 4 + leaves 20. index 로 빠질 모서리 잎 하나를 정한다. */
function writeTree(write: WriteBlock, base: BlockPos, index: number): void {
  for (let i = 0; i < 4; i++) write(base.x, base.y + i, base.z, BlockId.log);
  const ring: [number, number][] = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
  ];
  const corners = [0, 2, 4, 6];
  const skip = corners[index % corners.length];
  ring.forEach(([dx, dz], i) => {
    if (i !== skip) write(base.x + dx, base.y + 2, base.z + dz, BlockId.leaves); // 7
    write(base.x + dx, base.y + 3, base.z + dz, BlockId.leaves); // 8
  });
  for (const [dx, dz] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    write(base.x + dx, base.y + 4, base.z + dz, BlockId.leaves); // 5
  }
}

/** 폐허 하나: 기초를 지표에 깔고 판자벽 조각을 올린다. */
function writeRuin(write: WriteBlock, ruin: Ruin): void {
  for (let x = ruin.x0; x <= ruin.x1; x++) {
    for (let z = ruin.z0; z <= ruin.z1; z++) {
      const edge = x === ruin.x0 || x === ruin.x1 || z === ruin.z0 || z === ruin.z1;
      if (edge) write(x, surfaceY(x, z), z, BlockId.stone_brick);
    }
  }
  for (const [x, z, height] of ruin.walls) {
    const y0 = surfaceY(x, z) + 1;
    for (let i = 0; i < height; i++) write(x, y0 + i, z, BlockId.plank);
  }
}

/** 지표면 위 한 칸(발이 놓이는 칸). */
function standOn(x: number, z: number): BlockPos {
  return { x, y: surfaceY(x, z) + 1, z };
}

/**
 * 섬 전체를 쓴다. 두 번 호출해도 같은 블록을 쓰고 같은 IslandData 를 반환한다.
 * 쓰기 순서: 지형 → 나무 → 폐허 → 종. 공기는 쓰지 않는다(월드 기본값).
 */
export function buildIsland(write: WriteBlock): IslandData {
  if (W.sizeX !== 128 || W.sizeZ !== 128 || W.sizeY !== 64) {
    throw new Error('고정 섬은 balance.world 의 128 × 64 × 128 을 전제로 한다');
  }
  const candidates: BlockPos[] = [];
  for (let z = 0; z < W.sizeZ; z++) {
    for (let x = 0; x < W.sizeX; x++) {
      const col = columnAt(x, z);
      writeColumn(write, x, z, col);
      if (col.kind === 'land' && inQuarry(x, z)) {
        for (let y = QUARRY_CANDIDATE_MIN_Y; y <= col.top; y++) candidates.push({ x, y, z });
      }
    }
  }
  candidates.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

  const treeBases = TREE_XZ.map(([x, z]) => standOn(x, z));
  treeBases.forEach((base, i) => writeTree(write, base, i));
  for (const ruin of RUINS) writeRuin(write, ruin);

  const bellPos = standOn(W.bellPos.x, W.bellPos.z);
  write(bellPos.x, bellPos.y, bellPos.z, BlockId.bell);

  return {
    bellPos,
    playerSpawn: standOn(64, 70),
    npcSpawns: { farmer: standOn(62, 62), cook: standOn(66, 62), carpenter: standOn(64, 60) },
    monsterSpawns: [
      standOn(ISLAND_REGIONS.outskirtsNorth.x, ISLAND_REGIONS.outskirtsNorth.z),
      standOn(ISLAND_REGIONS.outskirtsWest.x, ISLAND_REGIONS.outskirtsWest.z),
    ],
    treeBases,
    quarryRespawnCandidates: candidates,
  };
}
