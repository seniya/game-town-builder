// 기존 블록의 비정육면체 모양 표 (ADR 028 보완, TASK-SHAPE-001). 렌더 표현 데이터이며 게임 규칙에는 영향이 없다.
// 충돌·통행·방 판정·설치·조준은 blocks 의 기존 필드(1 칸 규칙)를 그대로 쓴다. three 를 모르는 순수 데이터다.
// 좌표는 1/16 단위의 칸 로컬 [0, 16] 이다. 메셔(workers/greedyMesh)가 상자마다 면을 내 청크 메시에 넣는다.
import { BlockId } from './blocks';

/** 상자 하나. min < max, 칸 로컬 1/16 단위. */
export interface ShapeBox {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  /** 이 상자가 빌려 쓰는 타일의 블록 id. 없으면 자기 블록 */
  readonly tileFrom?: number;
}

/**
 * 모양 하나. orient 는 방향 정보가 없는 단일 칸 블록의 방향 규칙이다(ADR 028 보완 2).
 *   pane     판유리를 x 방향으로 정의한다. ±x 이웃이 벽이 아니면 z 방향으로 돌린다
 *   backrest 등받이를 북쪽(−z)에 정의한다. 맞닿은 식탁의 반대쪽으로 돌린다
 */
export interface BlockShape {
  readonly boxes: readonly ShapeBox[];
  readonly orient?: 'pane' | 'backrest';
}

/** 의자 앉는 높이(칸 바닥 기준, 블록 단위). 앉는 자세의 usePosition 이 쓴다 (ADR 028 보완 7). */
export const CHAIR_SEAT_HEIGHT = 9 / 16;

/** 1/16 단위 상자. */
function box(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  tileFrom?: number,
): ShapeBox {
  return tileFrom === undefined
    ? { min: [x0, y0, z0], max: [x1, y1, z1] }
    : { min: [x0, y0, z0], max: [x1, y1, z1], tileFrom };
}

/** blockId → 모양. 없는 블록은 정육면체다. */
export const BLOCK_SHAPES: ReadonlyMap<number, BlockShape> = new Map<number, BlockShape>([
  // 벽 가운데 평면의 판유리. 타일의 나무 테두리가 창틀이 된다.
  // 식탁·의자·상자·화덕·물 항아리·종·횃불은 STYLE-003 부터 청크 메시가 아니라 렌더 모형(blocks.prop, render/furnitureModels)이다
  [BlockId.window, { boxes: [box(0, 0, 7, 16, 16, 9)], orient: 'pane' }],
]);

/** 이 블록이 모양 블록인가. */
export function isShaped(id: number): boolean {
  return BLOCK_SHAPES.has(id);
}
