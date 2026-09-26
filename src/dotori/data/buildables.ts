// 가꾸기로 놓을 수 있는 것 (SPEC 4.1). 로직은 sim/build.ts 에 있다.

export type BuildKind = 'house' | 'flowerbed' | 'bench' | 'lamp' | 'tree' | 'road';

export interface BuildableDef {
  kind: BuildKind;
  /** 도구 막대 이름. */
  label: string;
  e: string;
  w: number;
  h: number;
  /** 필요한 목재. */
  lumber: number;
  /** 짓는 일(목수·분). 0 이면 놓는 즉시 생긴다. */
  work: number;
  /** 다 지었을 때의 마을 매력. */
  charm: number;
  /** 놓을 수 있는 바닥. */
  ground: readonly ('grass' | 'sand' | 'forest')[];
  /** 한 공사장에 붙을 수 있는 목수 수. */
  maxWorkers: number;
  /** 도구 막대 설명. */
  hint: string;
}

export const BUILDABLES: Record<BuildKind, BuildableDef> = {
  house: {
    kind: 'house',
    label: '집',
    e: '🏠',
    w: 3,
    h: 3,
    lumber: 20,
    work: 240,
    charm: 0,
    ground: ['grass'],
    maxWorkers: 2,
    hint: '두 명이 살 수 있어요. 빈 집이 있으면 새 주민이 이사 와요. R 로 문 방향',
  },
  flowerbed: {
    kind: 'flowerbed',
    label: '꽃밭',
    e: '🌷',
    w: 2,
    h: 2,
    lumber: 4,
    work: 60,
    charm: 3,
    ground: ['grass'],
    maxWorkers: 1,
    hint: '주민이 거닐고 꽃을 따요. 매력 +3',
  },
  bench: {
    kind: 'bench',
    label: '벤치',
    e: '🪑',
    w: 1,
    h: 1,
    lumber: 3,
    work: 40,
    charm: 1,
    ground: ['grass'],
    maxWorkers: 1,
    hint: '앉아 쉬고 책을 읽어요. 매력 +1',
  },
  lamp: {
    kind: 'lamp',
    label: '등불',
    e: '🏮',
    w: 1,
    h: 1,
    lumber: 2,
    work: 30,
    charm: 0.5,
    ground: ['grass'],
    maxWorkers: 1,
    hint: '밤에 불을 밝히고 주민이 모여요. 매력 +0.5',
  },
  tree: {
    kind: 'tree',
    label: '나무',
    e: '🌳',
    w: 1,
    h: 1,
    lumber: 0,
    work: 20,
    charm: 0.3,
    ground: ['grass', 'sand'],
    maxWorkers: 1,
    hint: '숲이 넓어져요. 나무꾼의 일터. 매력 +0.3',
  },
  road: {
    kind: 'road',
    label: '길',
    e: '🟫',
    w: 1,
    h: 1,
    lumber: 0,
    work: 0,
    charm: 0,
    ground: ['grass', 'sand', 'forest'],
    maxWorkers: 0,
    hint: '빨리 걸을 수 있어요. 끌어서 이어 놓기',
  },
};

/** 도구 막대 순서(단축키 1~6). 치우기는 7. */
export const BUILD_ORDER: readonly BuildKind[] = [
  'house',
  'flowerbed',
  'bench',
  'lamp',
  'tree',
  'road',
];

/** 집 문 앞에서 길까지 이을 수 있는 최대 칸 수 (SPEC 4.2). */
export const HOUSE_ROAD_MAX = 12;

/** 다 지은 것을 치울 때 돌려받는 목재 비율 (SPEC 4.1). */
export const REFUND_DONE = 0.5;
