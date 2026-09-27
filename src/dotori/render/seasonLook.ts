// 계절별 겉모습: 땅 색·나뭇잎 색·반사광·날리는 입자 (SPEC 12.4). 값만 있고 로직은 쓰는 쪽에 있다.
import type { SeasonId } from '../data/seasons';

/** 지면 텍스처를 칠할 때 쓰는 색. */
export interface GroundLook {
  grass: string;
  /** 풀 칸 얼룩 두 가지(밝은·어두운). */
  mottle: [string, string];
  forest: string;
  /** 풀포기 선(없으면 그리지 않는다). */
  tuft: string | null;
  road: string;
  roadDot: string;
  /** 들꽃(낙엽) 색과 칸당 확률. */
  flowers: readonly string[];
  flowerChance: number;
  /** 밭 위에 덮는 색(서리·눈). */
  farmCover: string | null;
}

/** 나뭇잎 색 바꾸기: 초록 부분만 섞는다. tints 는 나무마다 고르는 후보, amt 는 섞는 정도. */
export interface FoliageLook {
  tints: readonly [string, string, string];
  /** 둘째·셋째 색을 고르는 문턱(나무마다 0~1 난수). */
  split: [number, number];
  amt: number;
}

export interface SeasonLook {
  ground: GroundLook;
  foliage: FoliageLook;
  /** 상록수: 꽃·단풍 없이 초록 짙기와 눈. */
  evergreen: { tint: string; amt: number };
  /** 반구광의 땅 쪽 색(낮). 눈이 오면 밝게 되비친다. */
  hemiGround: string;
  /** 지도 바깥 둘레 땅 색. */
  skirt: string;
  /** 낮에 드문드문 날리는 입자. */
  drift: 'petal' | 'leaf' | null;
}

export const SEASON_LOOK: Record<SeasonId, SeasonLook> = {
  spring: {
    ground: {
      grass: '#9fd47f',
      mottle: ['rgba(255,255,210,0.12)', 'rgba(40,90,30,0.06)'],
      forest: 'rgba(40,90,30,0.16)',
      tuft: 'rgba(70,135,55,0.35)',
      road: '#e6cf9c',
      roadDot: 'rgba(150,120,70,0.25)',
      flowers: ['#f7a1c4', '#ffe08a', '#ffffff', '#c9b6ff', '#ffb3d1'],
      flowerChance: 0.13,
      farmCover: null,
    },
    foliage: { tints: ['#a6dc6c', '#ff98c6', '#ffc0dc'], split: [0.62, 0.84], amt: 0.8 },
    evergreen: { tint: '#7cc25a', amt: 0.3 },
    hemiGround: '#7a9a55',
    skirt: '#8cc46d',
    drift: 'petal',
  },
  summer: {
    ground: {
      grass: '#89c46b',
      mottle: ['rgba(255,255,210,0.10)', 'rgba(40,90,30,0.08)'],
      forest: 'rgba(40,80,30,0.2)',
      tuft: 'rgba(55,115,45,0.38)',
      road: '#e6cf9c',
      roadDot: 'rgba(150,120,70,0.25)',
      flowers: ['#ffe08a', '#ffffff', '#f7a1c4', '#8fc8ff'],
      flowerChance: 0.06,
      farmCover: null,
    },
    foliage: { tints: ['#5fae4a', '#5fae4a', '#5fae4a'], split: [1, 1], amt: 0 },
    evergreen: { tint: '#4f8f4a', amt: 0 },
    hemiGround: '#6f8f4f',
    skirt: '#7fb466',
    drift: null,
  },
  autumn: {
    ground: {
      grass: '#b8bd6c',
      mottle: ['rgba(255,230,160,0.14)', 'rgba(120,80,30,0.08)'],
      forest: 'rgba(120,70,30,0.16)',
      tuft: 'rgba(140,115,55,0.35)',
      road: '#e3c795',
      roadDot: 'rgba(150,110,60,0.28)',
      flowers: ['#e0893a', '#c9582f', '#e8c24a', '#a8643a'],
      flowerChance: 0.1,
      farmCover: null,
    },
    foliage: { tints: ['#e8893a', '#d4523a', '#e9c04a'], split: [0.4, 0.72], amt: 0.86 },
    evergreen: { tint: '#4c8a4c', amt: 0.25 },
    hemiGround: '#8f8048',
    skirt: '#a9ad63',
    drift: 'leaf',
  },
  winter: {
    ground: {
      grass: '#e8eef3',
      mottle: ['rgba(255,255,255,0.35)', 'rgba(150,170,195,0.10)'],
      forest: 'rgba(130,150,170,0.18)',
      tuft: null,
      road: '#d9cdb6',
      roadDot: 'rgba(255,255,255,0.45)',
      flowers: [],
      flowerChance: 0,
      farmCover: 'rgba(245,248,252,0.45)',
    },
    foliage: { tints: ['#eef3f6', '#dfe9e4', '#9fb9a4'], split: [0.55, 0.82], amt: 0.74 },
    evergreen: { tint: '#e6eef2', amt: 0.55 },
    hemiGround: '#c7d0da',
    skirt: '#dfe6ed',
    drift: null,
  },
};
