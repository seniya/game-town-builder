// 처음 마을의 고정 배치 (SPEC 2). 시험판 64 × 40 배치를 그대로 두고 동쪽·남쪽에 빈 들판을 더했다.
// 좌표는 타일 단위(x: 서→동, y: 북→남).

export const MAP_W = 80;
export const MAP_H = 52;

/** 숲 덩어리 [중심 x, 중심 y, 반지름]. 가장자리는 시드 난수로 조금 흔든다. */
export const FOREST_BLOBS: readonly (readonly [number, number, number])[] = [
  [7, 6, 9],
  [61, 4, 6],
  [1, 21, 3.5],
  [19, 38, 4],
  [63, 17, 4],
  [46, 1, 3],
  [77, 7, 5],
  [74, 48, 6],
  [44, 51, 4],
  [3, 47, 5],
];
export const FOREST_JITTER = 0.35;

/** 호수(타원) 중심·반지름. 반지름 배율 1.45 안쪽은 모래 물가. */
export const LAKE = { cx: 53, cy: 31, rx: 9, ry: 5.5, shore: 1.45 } as const;

/** 길 [x0, y0, x1, y1] — 가로 또는 세로 한 줄. */
export const ROADS: readonly (readonly [number, number, number, number])[] = [
  [2, 20, 78, 20],
  [31, 2, 31, 49],
  [15, 9, 50, 9],
  [17, 31, 43, 31],
  [24, 42, 66, 42],
  [66, 20, 66, 42],
];

export const FARM = { x: 4, y: 25, w: 13, h: 11 } as const;
export const PLAZA = { x: 26, y: 13, w: 11, h: 7 } as const;
/** 주점 앞 테라스(밤 어울리기 장소). */
export const TERRACE = { x: 21, y: 21, w: 7, h: 1 } as const;
export const FOUNTAIN = { x: 31, y: 16 } as const;

export type Side = 's' | 'n' | 'e' | 'w';
export type StartBuildingKind = 'house' | 'bakery' | 'tavern' | 'workshop' | 'yard' | 'mill';

export interface StartBuilding {
  kind: StartBuildingKind;
  x: number;
  y: number;
  w: number;
  h: number;
  side: Side;
  name?: string;
}

/** 처음 건물. 집 10 채(3 × 3), 빵집·주점·공방·목재 야적장·풍차. */
export const START_BUILDINGS: readonly StartBuilding[] = [
  ...[16, 21, 26, 35, 40, 45].map((x): StartBuilding => ({
    kind: 'house',
    x,
    y: 5,
    w: 3,
    h: 3,
    side: 's',
  })),
  ...[4, 9, 14, 19].map((x): StartBuilding => ({ kind: 'house', x, y: 16, w: 3, h: 3, side: 's' })),
  { kind: 'bakery', x: 38, y: 15, w: 4, h: 4, side: 's', name: '빵집' },
  { kind: 'tavern', x: 21, y: 22, w: 5, h: 3, side: 'n', name: '주점' },
  { kind: 'workshop', x: 34, y: 22, w: 4, h: 3, side: 'n', name: '공방' },
  { kind: 'yard', x: 39, y: 22, w: 3, h: 2, side: 'n', name: '목재 야적장' },
  { kind: 'mill', x: 19, y: 26, w: 2, h: 2, side: 's', name: '풍차' },
];

/** 처음 벤치(광장). */
export const START_BENCHES: readonly (readonly [number, number])[] = [
  [27, 14],
  [35, 14],
  [27, 18],
  [35, 18],
];

/** 처음 등불. */
export const START_LAMPS: readonly (readonly [number, number])[] = [
  [26, 13],
  [36, 13],
  [26, 19],
  [36, 19],
  [21, 21],
  [27, 21],
  [30, 9],
  [32, 31],
  [18, 19],
  [44, 19],
  [30, 4],
];

/** 마을 입구: 새 주민이 나타나는 칸(동쪽 큰길 끝). */
export const ENTRANCE = { x: 78, y: 20 } as const;

/** 흩어진 나무가 생길 확률(주변이 모두 풀·숲인 풀 칸). */
export const SCATTER_TREE_CHANCE = 0.035;

/** 집 지붕 색(render 참고용 변형 번호와 함께 쓴다). */
export const ROOF_COLORS: readonly string[] = [
  '#E98A7B',
  '#7FA8D6',
  '#E2B85A',
  '#8FBF9A',
  '#B39DDB',
  '#F2A65A',
  '#6FB3B8',
  '#D78FB3',
];
