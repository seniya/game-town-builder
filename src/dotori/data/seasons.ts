// 계절과 축제의 수치 (SPEC 12.4·12.5, ADR 053). 한 해는 생일과 같은 28 일 달력이다(BIRTHDAY.yearDays).
import type { JobName, TraitName } from './people';

export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonDef {
  id: SeasonId;
  label: string;
  e: string;
  /** 계절 첫날 06:00 소식. */
  arrive: string;
}

/** 봄부터 차례로. 한 계절은 SEASON.days 일. */
export const SEASONS: readonly SeasonDef[] = [
  { id: 'spring', label: '봄', e: '🌸', arrive: '🌸 봄이 왔다. 꽃봉오리가 하나둘 벌어진다.' },
  { id: 'summer', label: '여름', e: '☀️', arrive: '☀️ 여름이 왔다. 나뭇잎이 짙어지고 해가 길다.' },
  { id: 'autumn', label: '가을', e: '🍁', arrive: '🍁 가을이 왔다. 숲이 붉게 물들기 시작한다.' },
  { id: 'winter', label: '겨울', e: '❄️', arrive: '❄️ 겨울이 왔다. 입김이 하얗게 피어오른다.' },
];

export const SEASON = {
  /** 한 계절의 날 수(28 일 ÷ 4). */
  days: 7,
} as const;

export interface FestivalDef {
  id: string;
  season: SeasonId;
  /** 계절 안에서 몇째 날(1~7). */
  day: number;
  name: string;
  e: string;
  /** 주최를 고르는 기준: 성격 또는 직업. */
  host: { trait?: TraitName; job?: JobName };
  /** 준비 소식(주최 이름 뒤에 붙는다). */
  prep: string;
  /** 참석자 일기. */
  diary: string;
}

/** 계절마다 한 번 (SPEC 12.5). */
export const FESTIVALS: readonly FestivalDef[] = [
  {
    id: 'flower',
    season: 'spring',
    day: 4,
    name: '꽃잔치',
    e: '🌸',
    host: { trait: '로맨티스트' },
    prep: '광장 둘레에 꽃 화분을 늘어놓는다',
    diary: '꽃잔치에 갔다. 꽃향기에 마음이 간질간질 🌸',
  },
  {
    id: 'stars',
    season: 'summer',
    day: 4,
    name: '별밤 잔치',
    e: '🌟',
    host: { trait: '호기심쟁이' },
    prep: '광장에 돗자리를 깔고 별자리 지도를 편다',
    diary: '별밤 잔치에서 별똥별을 봤다. 소원을 빌었다 🌟',
  },
  {
    id: 'harvest',
    season: 'autumn',
    day: 4,
    name: '수확제',
    e: '🌾',
    host: { job: '농부' },
    prep: '광장에 밀단과 호박을 쌓아 올린다',
    diary: '수확제에서 실컷 먹고 춤췄다. 올해도 고마웠어, 밭아 🌾',
  },
  {
    id: 'lantern',
    season: 'winter',
    day: 4,
    name: '등불잔치',
    e: '🏮',
    host: { job: '제빵사' },
    prep: '광장에 등불을 달고 따끈한 빵을 굽는다',
    diary: '등불잔치에서 따끈한 빵을 나눠 먹었다. 손이 녹았다 🏮',
  },
];

export const FESTIVAL = {
  /** 시작 시각(하루 안의 분)과 길이(틱). */
  startMinute: 17 * 60,
  duration: 240,
  /** 참석 점수 배율(파티 대비). */
  attendFactor: 1.3,
  /** 끝난 뒤 참석자 즐거움. */
  fun: 15,
} as const;
