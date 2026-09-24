// 브라우저 시각 검증용 고정 장면 (TASKS 2.7: TASK-006 / 007). 게임 콘텐츠가 아니다.
// 기존 블록만 쓰며 새 블록·가구를 만들지 않는다. main.ts 가 ?scene= 로 고른다.
import type { BlockPos, NPCRole, WriteBlock } from '../types';
import { BlockId } from './blocks';

/** 고정 장면 정의. */
export interface VisualFixture {
  readonly size: { readonly sizeX: number; readonly sizeY: number; readonly sizeZ: number };
  /** 단일 칸 블록을 쓴다 */
  readonly build: (write: WriteBlock) => void;
  /** 다중 칸 객체(bed / door) 배치. 호출자가 editObject 로 놓는다 */
  readonly objects: readonly {
    readonly blockId: number;
    readonly anchor: BlockPos;
    readonly facing: 'north' | 'east' | 'south' | 'west';
  }[];
  /** 플레이어 시작 칸. 있으면 ?view= 없이 열 때 직접 걸어 다니는 조작 모드다 */
  readonly playerSpawn?: BlockPos;
  /** 채석장 재생 후보 (MVP_SPEC 14.2). 고정 섬만 있다 */
  readonly quarryCandidates?: readonly BlockPos[];
  /** 광장 중심(종 칸). 주민이 쉬고 모이는 칸의 기준이다 */
  readonly plazaCenter?: BlockPos;
  /** 새 주민이 나타나는 칸 (MVP_SPEC 19.6). 없으면 GameWorld 가 광장 남쪽에서 찾는다 */
  readonly arrivalCell?: BlockPos;
  /** 몬스터 스폰 칸(습격, MVP_SPEC 24.1). 없으면 습격하지 않는다 */
  readonly monsterSpawns?: readonly BlockPos[];
  /** 처음부터 사는 주민과 시작 칸 */
  readonly residents?: readonly { readonly role: NPCRole; readonly cell: BlockPos }[];
  /** 시작 저장소(관찰용). 없는 값은 게임 초기값이다. 조리·식사 관찰에서 수확을 기다리지 않게 한다 */
  readonly startStorage?: { readonly initialCrop?: number; readonly initialFood?: number };
  /** ?time= 이 없을 때의 시작 시각(시). 없으면 07:00 */
  readonly defaultStartHour?: number;
  /** 카메라 궤도 시점들. 첫 번째가 기본이며 ?view= 로 고른다 */
  readonly views: readonly {
    readonly target: BlockPos;
    readonly distance: number;
    readonly yaw: number;
    readonly pitch: number;
  }[];
}

/** 직육면체 범위를 한 블록으로 채운다. */
function fill(
  write: WriteBlock,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  id: number,
): void {
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) write(x, y, z, id);
}

/**
 * TASK-006: 청크 경계를 가로지르는 지면·벽. 편집 구동기가 경계 x = 15 / 16 과
 * 꼭짓점 (16, 16, 16) 주변을 연속으로 바꾼다. 크기 48 × 32 × 48 (3 × 2 × 3 청크).
 */
export const meshEditFixture: VisualFixture = {
  size: { sizeX: 48, sizeY: 32, sizeZ: 48 },
  build(write) {
    fill(write, 0, 0, 0, 47, 12, 47, BlockId.dirt);
    fill(write, 0, 13, 0, 47, 13, 47, BlockId.grass);
    fill(write, 14, 14, 8, 17, 18, 24, BlockId.stone_brick);
    fill(write, 20, 14, 20, 30, 14, 30, BlockId.plank);
  },
  objects: [],
  views: [{ target: { x: 16, y: 15, z: 16 }, distance: 34, yaw: 0.6, pitch: 0.55 }],
};

/** TASK-006: 편집 구동기가 순환하며 바꿀 칸. 청크 경계·모서리·꼭짓점을 포함한다. */
export function meshEditCells(): BlockPos[] {
  const cells: BlockPos[] = [];
  for (let y = 14; y <= 19; y++)
    for (let z = 26; z <= 34; z++) cells.push({ x: 15, y, z }, { x: 16, y, z });
  for (let y = 15; y <= 17; y++) for (let x = 15; x <= 17; x++) cells.push({ x, y, z: 16 });
  return cells;
}

/**
 * TASK-007: 작은 집 하나. 돌벽돌 기초, 판자 바닥·벽, 통나무 모서리 기둥, 문, 창문,
 * 기존 블록(돌벽돌)으로 쌓은 박공지붕, 침대·테이블·의자·상자·횃불, 물가·나무·밭. 크기 48 × 32 × 48.
 * 지붕은 선택적 건축이며 새 블록이나 천장 조건을 뜻하지 않는다 (GAME_DESIGN 14).
 */
export const smallHouseFixture: VisualFixture = {
  size: { sizeX: 48, sizeY: 32, sizeZ: 48 },
  // 문(19, 11, 22) 앞 풀밭
  playerSpawn: { x: 19, y: 11, z: 26 },
  build(write) {
    const g = 10; // 지표면 y
    fill(write, 0, 0, 0, 47, 0, 47, BlockId.bedrock);
    fill(write, 0, 1, 0, 47, g - 3, 47, BlockId.stone);
    fill(write, 0, g - 2, 0, 47, g - 1, 47, BlockId.dirt);
    fill(write, 0, g, 0, 47, g, 47, BlockId.grass);
    // 물가: 모래 테두리의 연못 (깊이 2)
    fill(write, 29, g, 25, 41, g, 37, BlockId.sand);
    fill(write, 31, g - 1, 27, 39, g, 35, BlockId.water);
    fill(write, 31, g - 2, 27, 39, g - 2, 35, BlockId.sand);
    // 집: 외곽 x 16~22, z 16~22 (내부 5 × 5), 앞면은 +z
    const x0 = 16;
    const z0 = 16;
    const x1 = 22;
    const z1 = 22;
    fill(write, x0, g, z0, x1, g, z1, BlockId.stone_brick);
    fill(write, x0 + 1, g, z0 + 1, x1 - 1, g, z1 - 1, BlockId.plank);
    for (let y = g + 1; y <= g + 3; y++) {
      for (let x = x0; x <= x1; x++) {
        write(x, y, z0, BlockId.plank);
        write(x, y, z1, BlockId.plank);
      }
      for (let z = z0; z <= z1; z++) {
        write(x0, y, z, BlockId.plank);
        write(x1, y, z, BlockId.plank);
      }
      for (const [x, z] of [
        [x0, z0],
        [x1, z0],
        [x0, z1],
        [x1, z1],
      ] as const) {
        write(x, y, z, BlockId.log);
      }
    }
    // 창문: 앞(z1) 두 개와 옆(x1) 한 개
    write(17, g + 2, z1, BlockId.window);
    write(21, g + 2, z1, BlockId.window);
    write(x1, g + 2, 19, BlockId.window);
    // 문 자리 비우기 (앞벽 x = 19, 두 칸). 문은 objects 로 놓는다
    write(19, g + 1, z1, BlockId.air);
    write(19, g + 2, z1, BlockId.air);
    // 박공지붕: 용마루가 z 방향. 층마다 x 로 한 칸씩 좁히고 앞뒤로 한 칸 내민다.
    // 지붕면은 판자, 처마 끝줄과 용마루는 통나무다(HR-001: 돌벽돌 지붕이 돌처럼 보여 어색했다)
    for (let k = 0; k < 4; k++) {
      const y = g + 4 + k;
      for (let z = z0 - 1; z <= z1 + 1; z++) {
        const eave = k === 0 ? BlockId.log : BlockId.plank;
        write(x0 - 1 + k, y, z, eave);
        write(x1 + 1 - k, y, z, eave);
      }
      // 박공벽: 앞뒤 삼각형을 판자로 채운다
      for (let x = x0 + k; x <= x1 - k; x++) {
        write(x, y, z0, BlockId.plank);
        write(x, y, z1, BlockId.plank);
      }
    }
    fill(write, x0 + 3, g + 7, z0 - 1, x0 + 3, g + 7, z1 + 1, BlockId.log);
    // 가구 (단일 칸)
    write(21, g + 1, 17, BlockId.table);
    write(20, g + 1, 17, BlockId.chair);
    write(17, g + 1, 21, BlockId.chest);
    write(21, g + 1, 21, BlockId.torch);
    write(20, g + 1, z1 + 1, BlockId.torch);
    // 나무 한 그루: log 4 + leaves
    const tx = 9;
    const tz = 28;
    for (let y = g + 1; y <= g + 4; y++) write(tx, y, tz, BlockId.log);
    for (let y = g + 3; y <= g + 5; y++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const r = Math.abs(dx) + Math.abs(dz) + (y - g - 3);
          if (r > 3 || (dx === 0 && dz === 0 && y <= g + 4)) continue;
          write(tx + dx, y, tz + dz, BlockId.leaves);
        }
      }
    }
    // 밭 네 칸과 작물
    fill(write, 25, g, 17, 28, g, 17, BlockId.farmland);
    write(26, g + 1, 17, BlockId.crop);
    write(27, g + 1, 17, BlockId.crop);
  },
  objects: [
    { blockId: BlockId.door, anchor: { x: 19, y: 11, z: 22 }, facing: 'south' },
    { blockId: BlockId.bed, anchor: { x: 17, y: 11, z: 17 }, facing: 'south' },
  ],
  views: [
    { target: { x: 19, y: 13, z: 20 }, distance: 24, yaw: 0.55, pitch: 0.38 },
    // 창문 너머 실내와 물속 모래가 비쳐 보이는지
    { target: { x: 20, y: 12, z: 24 }, distance: 9, yaw: 0.35, pitch: 0.2 },
    // 벽·바닥 모서리의 정점 AO
    { target: { x: 23, y: 11, z: 20 }, distance: 7, yaw: 1.2, pitch: 0.35 },
  ],
};

/** 방 실험장의 시작 인벤토리(TASK-022 관찰용). 기존 블록만이며 게임 초기값이 아니다. */
export const ROOM_LAB_KIT: readonly { readonly blockId: number; readonly count: number }[] = [
  { blockId: BlockId.plank, count: 64 },
  { blockId: BlockId.door, count: 4 },
  { blockId: BlockId.bed, count: 3 },
  { blockId: BlockId.window, count: 16 },
  { blockId: BlockId.table, count: 2 },
  { blockId: BlockId.chair, count: 6 },
  { blockId: BlockId.torch, count: 16 },
  { blockId: BlockId.cooking_stove, count: 2 },
  { blockId: BlockId.water_pot, count: 2 },
  { blockId: BlockId.chest, count: 2 },
  { blockId: BlockId.plank, count: 64 },
  { blockId: BlockId.plank, count: 64 },
  { blockId: BlockId.stone_brick, count: 64 },
  { blockId: BlockId.dirt, count: 32 },
];

/** 판자 두 층 사각 벽. 내부는 x0+1..x0+w, z0+1..z0+d. skip 칸(x,z)은 두 층 모두 비운다. */
function ringWall(
  write: WriteBlock,
  x0: number,
  z0: number,
  w: number,
  d: number,
  y: number,
  id: number,
  height = 2,
  skip: readonly (readonly [number, number])[] = [],
): void {
  const skipped = new Set(skip.map(([x, z]) => `${x},${z}`));
  for (let x = x0; x <= x0 + w + 1; x++) {
    for (let z = z0; z <= z0 + d + 1; z++) {
      const edge = x === x0 || z === z0 || x === x0 + w + 1 || z === z0 + d + 1;
      if (!edge || skipped.has(`${x},${z}`)) continue;
      for (let k = 0; k < height; k++) write(x, y + k, z, id);
    }
  }
}

/**
 * TASK-022 관찰 장면: 넓은 풀밭과 방 판정 사례 일곱 개. 플레이어가 직접 5 × 5 방을 지을 빈 땅이 가운데 있다.
 * 사례는 모두 문 쪽(+z)에서 다가간다. 표지판이 없으므로 관찰 질문지(HUMAN_REVIEW)에 배치를 적는다.
 *   북쪽 줄(z 8~14): A 완성된 빈 방 / B 문 없는 방 / C 벽 한 칸 빠진 방 / D 흙벽 공간
 *   남쪽 줄(z 42~48): E 침대 + 화덕·물통(주방 우선) / F 벽 한 칸이 1 층 / G 방 안의 1 칸 단(같은 높이 제한)
 */
export const roomLabFixture: VisualFixture = {
  size: { sizeX: 64, sizeY: 24, sizeZ: 64 },
  playerSpawn: { x: 32, y: 11, z: 30 },
  build(write) {
    const g = 10;
    fill(write, 0, 0, 0, 63, 0, 63, BlockId.bedrock);
    fill(write, 0, 1, 0, 63, g - 3, 63, BlockId.stone);
    fill(write, 0, g - 2, 0, 63, g - 1, 63, BlockId.dirt);
    fill(write, 0, g, 0, 63, g, 63, BlockId.grass);
    const y = g + 1;
    // A 완성된 빈 방 (내부 5 × 5, 판자 바닥). 문은 objects 로 (8, y, 14)
    fill(write, 6, g, 8, 10, g, 12, BlockId.plank);
    ringWall(write, 5, 7, 5, 5, y, BlockId.plank, 2, [[8, 13]]);
    // B 문 없는 방
    fill(write, 18, g, 8, 22, g, 12, BlockId.plank);
    ringWall(write, 17, 7, 5, 5, y, BlockId.plank);
    // C 벽 한 칸(두 층)이 빠진 방. 문 (32, y, 13)
    fill(write, 30, g, 8, 34, g, 12, BlockId.plank);
    ringWall(write, 29, 7, 5, 5, y, BlockId.plank, 2, [
      [32, 13],
      [29, 9],
    ]);
    // D 흙으로만 둘러싼 공간
    ringWall(write, 41, 7, 5, 5, y, BlockId.dirt);
    // E 침대와 화덕·물통이 함께 있는 방(주방이 우선한다). 문 (8, y, 48)
    fill(write, 6, g, 42, 10, g, 46, BlockId.plank);
    ringWall(write, 5, 41, 5, 5, y, BlockId.stone_brick, 2, [[8, 47]]);
    write(9, y, 42, BlockId.cooking_stove);
    write(10, y, 42, BlockId.water_pot);
    write(10, y, 45, BlockId.torch);
    // F 벽 한 칸의 둘째 층이 빠진 방. 문 (20, y, 48)
    fill(write, 18, g, 42, 22, g, 46, BlockId.plank);
    ringWall(write, 17, 41, 5, 5, y, BlockId.plank, 2, [[20, 47]]);
    write(23, y + 1, 44, BlockId.air);
    // G 방 안에 1 칸 높이 판자 단: 단의 윗칸이 비어 경계 높이가 모자란다(같은 높이 평면 제한). 문 (32, y, 48)
    fill(write, 30, g, 42, 34, g, 46, BlockId.plank);
    ringWall(write, 29, 41, 5, 5, y, BlockId.plank, 2, [[32, 47]]);
    fill(write, 30, y, 42, 31, y, 43, BlockId.plank);
    // 빈 땅 가장자리의 나무 두 그루(풍경)
    for (const [tx, tz] of [
      [52, 30],
      [12, 30],
    ] as const) {
      for (let k = 1; k <= 4; k++) write(tx, g + k, tz, BlockId.log);
      for (let yy = g + 3; yy <= g + 5; yy++)
        for (let dz = -2; dz <= 2; dz++)
          for (let dx = -2; dx <= 2; dx++) {
            if (Math.abs(dx) + Math.abs(dz) + (yy - g - 3) > 3) continue;
            if (dx === 0 && dz === 0 && yy <= g + 4) continue;
            write(tx + dx, yy, tz + dz, BlockId.leaves);
          }
    }
  },
  objects: [
    { blockId: BlockId.door, anchor: { x: 8, y: 11, z: 13 }, facing: 'south' },
    { blockId: BlockId.door, anchor: { x: 32, y: 11, z: 13 }, facing: 'south' },
    { blockId: BlockId.door, anchor: { x: 8, y: 11, z: 47 }, facing: 'south' },
    { blockId: BlockId.door, anchor: { x: 20, y: 11, z: 47 }, facing: 'south' },
    { blockId: BlockId.door, anchor: { x: 32, y: 11, z: 47 }, facing: 'south' },
    { blockId: BlockId.bed, anchor: { x: 6, y: 11, z: 44 }, facing: 'south' },
  ],
  views: [
    { target: { x: 26, y: 12, z: 28 }, distance: 46, yaw: 0.35, pitch: 0.75 },
    { target: { x: 20, y: 12, z: 11 }, distance: 26, yaw: 0.2, pitch: 0.6 },
    { target: { x: 20, y: 12, z: 45 }, distance: 26, yaw: 0.2, pitch: 0.6 },
  ],
};

/** 취침 실험장의 시작 인벤토리(TASK-033 관찰용). 기존 블록만이며 게임 초기값이 아니다. */
export const SLEEP_LAB_KIT: readonly { readonly blockId: number; readonly count: number }[] = [
  { blockId: BlockId.plank, count: 64 },
  { blockId: BlockId.bed, count: 4 },
  { blockId: BlockId.door, count: 3 },
  { blockId: BlockId.torch, count: 16 },
  { blockId: BlockId.window, count: 16 },
  { blockId: BlockId.plank, count: 64 },
  { blockId: BlockId.stone_brick, count: 64 },
  { blockId: BlockId.plank, count: 64 },
  { blockId: BlockId.table, count: 2 },
  { blockId: BlockId.chair, count: 4 },
  { blockId: BlockId.farmland, count: 8 },
];

/**
 * TASK-033 관찰 장면: 풀밭 가운데 종(광장)과 주민 세 명, 불 켜진 작은 침실 한 채.
 * 침실은 내부 5 × 5, 판자 바닥·벽 세 층·지붕, 창문 둘, 남쪽 문, 침대 하나, 바닥 torch 하나다.
 * 플레이어는 빈 땅(서쪽)에 직접 침실을 짓고 침대를 더 놓을 수 있다. 기본 시작 시각은 19:00 이다.
 */
export const sleepLabFixture: VisualFixture = {
  size: { sizeX: 64, sizeY: 28, sizeZ: 64 },
  playerSpawn: { x: 32, y: 11, z: 41 },
  plazaCenter: { x: 32, y: 11, z: 32 },
  arrivalCell: { x: 32, y: 11, z: 61 },
  monsterSpawns: [
    { x: 3, y: 11, z: 3 },
    { x: 60, y: 11, z: 4 },
  ],
  residents: [
    { role: 'farmer', cell: { x: 30, y: 11, z: 35 } },
    { role: 'cook', cell: { x: 35, y: 11, z: 34 } },
    { role: 'carpenter', cell: { x: 32, y: 11, z: 29 } },
  ],
  defaultStartHour: 19,
  build(write) {
    const g = 10;
    const y = g + 1;
    fill(write, 0, 0, 0, 63, 0, 63, BlockId.bedrock);
    fill(write, 0, 1, 0, 63, g - 3, 63, BlockId.stone);
    fill(write, 0, g - 2, 0, 63, g - 1, 63, BlockId.dirt);
    fill(write, 0, g, 0, 63, g, 63, BlockId.grass);
    // 광장: 종과 네 귀퉁이의 torch
    write(32, y, 32, BlockId.bell);
    for (const [tx, tz] of [
      [28, 28],
      [36, 28],
      [28, 36],
      [36, 36],
    ] as const) {
      write(tx, y, tz, BlockId.torch);
    }
    // 침실 한 채: 내부 x 38~42, z 22~26. 벽 세 층, 지붕, 동쪽 창문 둘. 문은 objects 로 (40, y, 27)
    fill(write, 38, g, 22, 42, g, 26, BlockId.plank);
    ringWall(write, 37, 21, 5, 5, y, BlockId.plank, 3, [[40, 27]]);
    write(40, y + 2, 27, BlockId.plank);
    write(43, y + 1, 23, BlockId.window);
    write(43, y + 1, 25, BlockId.window);
    write(37, y + 1, 24, BlockId.window);
    fill(write, 36, y + 3, 20, 44, y + 3, 28, BlockId.plank);
    fill(write, 37, y + 4, 21, 43, y + 4, 27, BlockId.plank);
    write(42, y, 26, BlockId.torch);
    // 침실 앞 torch 하나(밤에 문을 찾을 수 있게)
    write(42, y, 29, BlockId.torch);
    // 빈 땅 가장자리의 나무 두 그루(풍경)
    for (const [tx, tz] of [
      [50, 44],
      [14, 20],
    ] as const) {
      for (let k = 1; k <= 4; k++) write(tx, g + k, tz, BlockId.log);
      for (let yy = g + 3; yy <= g + 5; yy++)
        for (let dz = -2; dz <= 2; dz++)
          for (let dx = -2; dx <= 2; dx++) {
            if (Math.abs(dx) + Math.abs(dz) + (yy - g - 3) > 3) continue;
            if (dx === 0 && dz === 0 && yy <= g + 4) continue;
            write(tx + dx, yy, tz + dz, BlockId.leaves);
          }
    }
  },
  objects: [
    { blockId: BlockId.door, anchor: { x: 40, y: 11, z: 27 }, facing: 'south' },
    { blockId: BlockId.bed, anchor: { x: 38, y: 11, z: 23 }, facing: 'south' },
  ],
  views: [
    { target: { x: 36, y: 12, z: 30 }, distance: 26, yaw: 0.35, pitch: 0.5 },
    // 침실 문 앞: 주민이 걸어 들어가는 장면
    { target: { x: 40, y: 12, z: 26 }, distance: 9, yaw: 0.25, pitch: 0.35 },
    // 창문 너머 침대
    { target: { x: 39, y: 12, z: 24 }, distance: 7, yaw: 1.45, pitch: 0.3 },
    // 방 안: 침대에 누운 주민
    { target: { x: 38.5, y: 12, z: 24 }, distance: 3, yaw: 0.6, pitch: 0.5 },
    // 광장: 종 둘레에 앉은 주민
    { target: { x: 32, y: 11.5, z: 32 }, distance: 9, yaw: 0.4, pitch: 0.6 },
  ],
};

/**
 * TASK-031 / 032 관찰 장면: 취침 실험장에 주방과 식당을 한 채씩 더했다. 시작 09:00, crop 4(조리 두 번 분량), food 3.
 * 주방은 내부 x 20~24, z 22~26, 돌벽돌 벽 세 층·판자 바닥·지붕, 북쪽 벽에 붙은 화덕과 물통, 서쪽 창문, 남쪽 문이다.
 * 식당은 내부 x 20~24, z 36~40, 판자 벽 세 층·지붕, 가운데 식탁 하나와 의자 셋, 동쪽 창문, 북쪽 문(광장 쪽)이다.
 * 요리사가 오전에 조리하고, 12:00 과 18:00 에 주민 셋이 식당 의자에 앉아 먹는다. 기존 블록만 쓴다.
 */
export const kitchenLabFixture: VisualFixture = {
  ...sleepLabFixture,
  defaultStartHour: 9,
  startStorage: { initialCrop: 4, initialFood: 3 },
  build(write) {
    sleepLabFixture.build(write);
    const g = 10;
    const y = g + 1;
    fill(write, 20, g, 22, 24, g, 26, BlockId.plank);
    ringWall(write, 19, 21, 5, 5, y, BlockId.stone_brick, 3, [[22, 27]]);
    write(22, y + 2, 27, BlockId.stone_brick);
    write(19, y + 1, 23, BlockId.window);
    write(19, y + 1, 25, BlockId.window);
    write(25, y + 1, 24, BlockId.window);
    fill(write, 18, y + 3, 20, 26, y + 3, 28, BlockId.plank);
    fill(write, 19, y + 4, 21, 25, y + 4, 27, BlockId.plank);
    write(22, y, 22, BlockId.cooking_stove);
    write(23, y, 22, BlockId.water_pot);
    write(24, y, 26, BlockId.torch);
    write(24, y, 29, BlockId.torch);
    // 식당: 문은 objects 로 (22, y, 35) 북쪽
    fill(write, 20, g, 36, 24, g, 40, BlockId.plank);
    ringWall(write, 19, 35, 5, 5, y, BlockId.plank, 3, [[22, 35]]);
    write(22, y + 2, 35, BlockId.plank);
    write(25, y + 1, 37, BlockId.window);
    write(25, y + 1, 39, BlockId.window);
    write(19, y + 1, 38, BlockId.window);
    fill(write, 18, y + 3, 34, 26, y + 3, 42, BlockId.plank);
    fill(write, 19, y + 4, 35, 25, y + 4, 41, BlockId.plank);
    write(22, y, 38, BlockId.table);
    write(21, y, 38, BlockId.chair);
    write(23, y, 38, BlockId.chair);
    write(22, y, 39, BlockId.chair);
    write(20, y, 40, BlockId.torch);
    write(24, y, 36, BlockId.torch);
  },
  objects: [
    ...sleepLabFixture.objects,
    { blockId: BlockId.door, anchor: { x: 22, y: 11, z: 27 }, facing: 'south' },
    { blockId: BlockId.door, anchor: { x: 22, y: 11, z: 35 }, facing: 'north' },
  ],
  views: [
    { target: { x: 27, y: 12, z: 29 }, distance: 24, yaw: -0.35, pitch: 0.5 },
    // 주방 문 앞: 요리사가 걸어 들어가는 장면
    { target: { x: 22, y: 12, z: 26 }, distance: 9, yaw: -0.25, pitch: 0.35 },
    // 창문 너머 화덕
    { target: { x: 22, y: 12, z: 23 }, distance: 7, yaw: -1.45, pitch: 0.3 },
    // 방 안: 화덕 앞에서 조리하는 요리사
    { target: { x: 22.5, y: 12, z: 23 }, distance: 3, yaw: -0.6, pitch: 0.45 },
    // 식당 안: 식탁에 둘러앉아 먹는 주민
    { target: { x: 22.5, y: 12.2, z: 38.5 }, distance: 4.5, yaw: 0.7, pitch: 0.55 },
  ],
};
