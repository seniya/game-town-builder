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

/** 네 귀퉁이 다리. inset 은 가장자리에서 띄운 거리, size 는 굵기, height 는 높이. */
function legs(inset: number, size: number, height: number): ShapeBox[] {
  const a = inset;
  const b = 16 - inset - size;
  return [
    box(a, 0, a, a + size, height, a + size),
    box(b, 0, a, b + size, height, a + size),
    box(a, 0, b, a + size, height, b + size),
    box(b, 0, b, b + size, height, b + size),
  ];
}

const SEAT = CHAIR_SEAT_HEIGHT * 16;

/** blockId → 모양. 없는 블록은 정육면체다. */
export const BLOCK_SHAPES: ReadonlyMap<number, BlockShape> = new Map<number, BlockShape>([
  // 막대와 불꽃. 불꽃은 윗면 타일(torchTop)이 보이는 작은 상자다
  [
    BlockId.torch,
    {
      boxes: [box(7, 0, 7, 9, 10, 9), box(6.5, 10, 6.5, 9.5, 13, 9.5)],
    },
  ],
  // 벽 가운데 평면의 판유리. 타일의 나무 테두리가 창틀이 된다
  [BlockId.window, { boxes: [box(0, 0, 7, 16, 16, 9)], orient: 'pane' }],
  // 상판과 다리 넷. 윗면은 칸 윗면(1.0) 그대로다(식탁 위 음식 연출이 이 높이를 쓴다)
  [BlockId.table, { boxes: [box(0, 13, 0, 16, 16, 16), ...legs(1.5, 2, 13)] }],
  // 앉는 판·다리 넷·등받이(북쪽에 정의, 식탁 반대쪽으로 돌린다)
  [
    BlockId.chair,
    {
      boxes: [
        box(2, SEAT - 2, 2, 14, SEAT, 14),
        ...legs(2.5, 2, SEAT - 2),
        box(2, SEAT, 2, 14, 16, 4),
      ],
      orient: 'backrest',
    },
  ],
  // 몸통과 뚜껑. 칸보다 조금 작다
  [BlockId.chest, { boxes: [box(1, 0, 2, 15, 10, 14), box(0.5, 10, 1.5, 15.5, 13, 14.5)] }],
  // 돌 화덕 몸통(옆면 띠가 불구멍), 윗면 판, 위에 얹은 냄비
  [
    BlockId.cooking_stove,
    {
      boxes: [
        box(1, 0, 1, 15, 12, 15),
        box(0.5, 12, 0.5, 15.5, 13, 15.5),
        box(5, 13, 5, 11, 16, 11, BlockId.water_pot),
      ],
    },
  ],
  // 물 항아리: 몸통과 테두리
  [BlockId.water_pot, { boxes: [box(3, 0, 3, 13, 12, 13), box(2.5, 12, 2.5, 13.5, 14, 13.5)] }],
  // 종: 받침·기둥·종 몸통·꼭지
  [
    BlockId.bell,
    {
      boxes: [
        box(2, 0, 2, 14, 2, 14),
        box(7, 2, 7, 9, 4, 9),
        box(4, 4, 4, 12, 12, 12),
        box(5, 12, 5, 11, 14, 11),
        box(7, 14, 7, 9, 16, 9),
      ],
    },
  ],
]);

/** 이 블록이 모양 블록인가. */
export function isShaped(id: number): boolean {
  return BLOCK_SHAPES.has(id);
}
