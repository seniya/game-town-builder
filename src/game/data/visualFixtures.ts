// 브라우저 시각 검증용 고정 장면 (TASKS 2.7: TASK-006 / 007). 게임 콘텐츠가 아니다.
// 기존 블록만 쓰며 새 블록·가구를 만들지 않는다. main.ts 가 ?scene= 로 고른다.
import type { BlockPos } from '../types';
import { BlockId } from './blocks';

/** 블록 한 칸을 쓰는 콜백. 월드 초기화에서 주입한다. */
export type WriteBlock = (x: number, y: number, z: number, id: number) => void;

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
  /** 카메라 궤도 시점 */
  readonly view: {
    readonly target: BlockPos;
    readonly distance: number;
    readonly yaw: number;
    readonly pitch: number;
  };
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
  view: { target: { x: 16, y: 15, z: 16 }, distance: 34, yaw: 0.6, pitch: 0.55 },
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
 * TASK-007: 작은 집 하나. 판자 바닥·벽, 문, 창문, 돌벽돌 모서리 기둥, 계단식 판자 지붕,
 * 침대·테이블·의자·횃불, 물가와 나무. 크기 48 × 32 × 48.
 */
export const smallHouseFixture: VisualFixture = {
  size: { sizeX: 48, sizeY: 32, sizeZ: 48 },
  build(write) {
    const g = 10; // 지표면 y
    fill(write, 0, 0, 0, 47, 0, 47, BlockId.bedrock);
    fill(write, 0, 1, 0, 47, g - 3, 47, BlockId.stone);
    fill(write, 0, g - 2, 0, 47, g - 1, 47, BlockId.dirt);
    fill(write, 0, g, 0, 47, g, 47, BlockId.grass);
    // 물가: 모래 테두리의 연못
    fill(write, 30, g, 26, 40, g, 36, BlockId.sand);
    fill(write, 32, g - 1, 28, 38, g, 34, BlockId.water);
    // 집: 바닥 x 16~22, z 16~22 (내부 5 × 5)
    const x0 = 16;
    const z0 = 16;
    const x1 = 22;
    const z1 = 22;
    fill(write, x0, g, z0, x1, g, z1, BlockId.plank);
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
        write(x, y, z, BlockId.stone_brick);
      }
    }
    // 창문: 앞(z1)과 옆(x1) 벽
    write(18, g + 2, z1, BlockId.window);
    write(21, g + 2, z1, BlockId.window);
    write(x1, g + 2, 19, BlockId.window);
    // 문 자리 비우기 (앞벽 x = 19, 두 칸)
    write(19, g + 1, z1, BlockId.air);
    write(19, g + 2, z1, BlockId.air);
    // 계단식 지붕: 판자 층을 한 칸씩 좁힌다 (새 지붕 블록 없음)
    for (let k = 0; k < 4; k++) {
      fill(
        write,
        x0 - 1 + k,
        g + 4 + k,
        z0 - 1,
        x1 + 1 - k,
        g + 4 + k,
        z1 + 1,
        k % 2 === 0 ? BlockId.plank : BlockId.stone_brick,
      );
    }
    // 가구 (단일 칸)
    write(21, g + 1, 17, BlockId.table);
    write(20, g + 1, 17, BlockId.chair);
    write(17, g + 1, 21, BlockId.chest);
    write(21, g + 1, 21, BlockId.torch);
    // 나무 한 그루: log 4 + leaves
    const tx = 10;
    const tz = 30;
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
    // 밭 한 줄
    fill(write, 26, g, 16, 29, g, 16, BlockId.farmland);
    write(27, g + 1, 16, BlockId.crop);
  },
  objects: [
    { blockId: BlockId.door, anchor: { x: 19, y: 11, z: 22 }, facing: 'south' },
    { blockId: BlockId.bed, anchor: { x: 17, y: 11, z: 17 }, facing: 'south' },
  ],
  view: { target: { x: 20, y: 12, z: 22 }, distance: 22, yaw: 0.55, pitch: 0.42 },
};
