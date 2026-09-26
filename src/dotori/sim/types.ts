// 도토리 마을 시뮬레이션 상태의 형 (ARCHITECTURE 2·3). 사람·건물은 id 로 서로를 가리킨다.
import type { BuildKind } from '../data/buildables';
import type { JobName, TraitName } from '../data/people';
import type { Side } from '../data/villageMap';
import type { Affinity } from './affinity';
import type { Rng } from './rng';

export interface Pt {
  x: number;
  y: number;
}

/** 타일 종류. 값은 저장에 그대로 들어가므로 바꾸지 않는다. */
export const TILE = {
  GRASS: 0,
  PATH: 1,
  WATER: 2,
  FOREST: 3,
  BLD: 4,
  DOOR: 5,
  FARM: 6,
  PLAZA: 7,
  SAND: 8,
  FOUNT: 9,
  /** 짓는 중인 집 자리. 지나갈 수 없다. */
  SITE: 10,
} as const;
export type Tile = (typeof TILE)[keyof typeof TILE];

export type BuildingKind = 'house' | 'bakery' | 'tavern' | 'workshop' | 'yard' | 'mill';

export interface Building {
  id: number;
  kind: BuildingKind;
  x: number;
  y: number;
  w: number;
  h: number;
  side: Side;
  door: Pt;
  name: string;
  residents: number[];
  /** 빵집의 빵 수(다른 건물은 0). */
  bread: number;
  /** 겉모습 변형 번호(render 가 모델·지붕 색을 고른다). */
  variant: number;
  playerBuilt: boolean;
  /** 지어진 시각(분). 처음 건물은 0. */
  builtAt: number;
}

export type DecorKind = 'bench' | 'lamp' | 'flowerbed';

/** 길을 막지 않는 장식. 나무는 숲 타일이 되므로 여기 없다. */
export interface Decor {
  id: number;
  kind: DecorKind;
  x: number;
  y: number;
  w: number;
  h: number;
  playerBuilt: boolean;
  builtAt: number;
  /** 누군가 처음 쓴 시각. 첫 사용 소식을 한 번만 남긴다. */
  firstUse: number | null;
}

export interface Blueprint {
  id: number;
  kind: BuildKind;
  x: number;
  y: number;
  w: number;
  h: number;
  side: Side;
  /** 필요한 목재와 받은 목재. 나르는 중인 목재는 주민 등짐(pack.site)에서 센다. */
  need: number;
  got: number;
  /** 남은 짓는 일과 전체 짓는 일. */
  workLeft: number;
  workTotal: number;
  /** 집 완성 때 길이 될 칸(문 앞부터). */
  road: Pt[];
  placedAt: number;
  /** 첫 망치질 시각(공사 시작 소식용). */
  startedAt: number | null;
}

export type ActType =
  | 'sleep'
  | 'rest'
  | 'eat'
  | 'work'
  | 'social'
  | 'fun'
  | 'wander'
  | 'visit'
  | 'nap'
  | 'hunt'
  | 'raindance'
  | 'party'
  | 'flee'
  | 'idle'
  | 'haul'
  | 'fetch'
  | 'deliver'
  | 'build'
  | 'movein';

export type ConvKind = 'chat' | 'invite' | 'date' | 'confess' | 'welcome';
export type FunWhere = 'shore' | 'plaza' | 'grass' | 'forest' | 'bench' | 'flower';
export type ActWhere = FunWhere | 'bakery' | 'home' | 'terrace' | 'lamp';

export interface Act {
  type: ActType;
  phase: 'go' | 'do';
  dest: Pt | null;
  bld: number | null;
  dur: number;
  target: number | null;
  started: number;
  until: number;
  where: ActWhere | null;
  kind: ConvKind | null;
  face: Pt | null;
  repath: number;
  /** 경로 예산이 모자라 아직 경로를 못 구했다. */
  needPath: boolean;
  /** 가꾸기 관련 행동의 청사진 id. */
  site: number | null;
  /** 쓰고 있는 장식 id. */
  decor: number | null;
}

export type CarryItem = 'bread' | 'flower' | 'book' | 'mug';

export interface Villager {
  id: number;
  name: string;
  trait: TraitName;
  job: JobName;
  home: number;
  x: number;
  y: number;
  px: number;
  py: number;
  path: Pt[];
  pi: number;
  act: Act | null;
  inside: number | null;
  dir: Pt;
  hunger: number;
  energy: number;
  social: number;
  fun: number;
  crush: number | null;
  partner: number | null;
  confess: number | null;
  /** 인사하러 갈 새 주민 id. */
  welcome: number | null;
  fearGhost: boolean;
  hunting: boolean;
  diary: { t: number; text: string }[];
  talk: number | null;
  nextTalk: number;
  bubble: { e: string; until: number } | null;
  offx: number;
  offy: number;
  walk: number;
  sleepH: number;
  wakeH: number;
  daily: Record<string, boolean>;
  /** 손에 든 것. */
  carry: { item: CarryItem; until: number } | null;
  /** 등에 진 것: 목재 n 개 또는 이삿짐. */
  pack: { kind: 'lumber' | 'bag'; n: number; site: number | null } | null;
  look: { skin: string; pants: string; umb: string; model: number };
  arrivedAt: number;
}

export interface Rumor {
  id: number;
  kind: 'party' | 'treasure' | 'ghost' | 'find' | 'bread' | 'love' | 'reject' | 'breakup';
  short: string;
  e: string;
  juicy: number;
  about: number[];
  knowers: Set<number>;
  born: number;
  active: boolean;
  half: boolean;
  all: boolean;
}

export interface Conversation {
  id: number;
  a: number;
  b: number;
  kind: ConvKind;
  start: number;
  until: number;
  lines: [number, string][];
  argue: boolean;
  success: boolean;
  r1: number | null;
  r2: number | null;
  topic: string;
  speaker: number;
}

export interface Party {
  host: number;
  start: number;
  end: number;
  rumor: number;
  att: Set<number>;
  prepLogged: boolean;
  startLogged: boolean;
}

export type FeedKind =
  | ''
  | 'day'
  | 'love'
  | 'fight'
  | 'party'
  | 'rumor'
  | 'funny'
  | 'find'
  | 'weather'
  | 'plant'
  | 'build'
  | 'arrive';

export interface FeedEntry {
  t: number;
  html: string;
  ids: number[];
  kind: FeedKind;
}

export type FxKind =
  'heart' | 'steam' | 'sweat' | 'sparkle' | 'catch' | 'confetti' | 'build' | 'done';

/** sim 이 바깥(ui·render)에 알리는 것. main 이 프레임마다 비운다. */
export type OutEvent =
  | { type: 'log'; entry: FeedEntry }
  | { type: 'fx'; vid: number; fx: FxKind }
  | { type: 'siteFx'; x: number; y: number; fx: FxKind };

/** 지도에서 뽑은 장소 목록. 지도가 바뀔 때 다시 계산한다(저장하지 않는다). */
export interface Locations {
  farm: Pt[];
  forest: Pt[];
  forestEdge: Pt[];
  shore: Pt[];
  plaza: Pt[];
  terrace: Pt[];
  grass: Pt[];
  water: Pt[];
}

export interface Stats {
  pop: number;
  beds: number;
  happy: number;
  charm: number;
  lumber: number;
  sites: number;
}

export interface World {
  seed: number;
  rng: Rng;
  t: number;
  W: number;
  H: number;
  tiles: Uint8Array;
  buildings: Building[];
  decor: Decor[];
  blueprints: Blueprint[];
  nextId: number;
  vs: Villager[];
  aff: Affinity;
  rumors: Rumor[];
  rid: number;
  convs: Conversation[];
  cid: number;
  feed: FeedEntry[];
  flags: Set<string>;
  weather: { rain: boolean; until: number };
  party: Party | null;
  /** 지난 파티에 온 사람 수(시험·통계용). */
  lastPartyCame: number | null;
  daily: Record<string, boolean>;
  lumber: number;
  /** 새 주민 이름을 고를 때 쓴 이름 수. */
  namesUsed: number;
  /** 오늘 이사 온 수. */
  arrivalsToday: number;
  /** 플레이어가 심은 나무 수(매력). */
  treesPlanted: number;
  /** 건물·장식·청사진·지형이 바뀔 때마다 1 씩 는다(render 가 다시 짓는다). */
  staticVersion: number;
  stats: Stats;
  // 저장하지 않는 파생 상태
  L: Locations;
  forestDist: Uint8Array;
  /** 건물 id → 건물. 건물이 바뀔 때 다시 만든다. */
  bmap: Map<number, Building>;
  out: OutEvent[];
  pathBudget: number;
}
