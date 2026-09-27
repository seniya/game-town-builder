// 이야기가 쌓이는 마을의 수치 (SPEC 11, ADR 052). 문장은 lines.ts.

/** 기억 (SPEC 11.1). */
export const MEMORY = {
  /** 주민 한 명이 가진 최대 기억 수. 넘치면 오래된 것부터 버린다. */
  max: 12,
  /** 대화에서 기억을 꺼낼 확률과, 꺼낼 수 있는 기억의 최소 나이(틱). */
  recallChance: 0.3,
  recallMinAge: 1440,
  recallAff: 3,
  /** 아침에 문득 떠올릴 확률과 최소 나이. */
  morningChance: 0.08,
  morningMinAge: 1440 * 2,
  /** 기념일 간격(일)과 즐거움. */
  anniversaryDays: 7,
  anniversaryFun: 10,
  /** 주민 카드에 보이는 기억 수. */
  shown: 3,
} as const;

/** 결혼 (SPEC 11.2). */
export const MARRIAGE = {
  /** 사귄 지 이만큼(틱) 넘어야 한다. */
  minTogether: 1440 * 7,
  minAff: 90,
  proposeChance: 0.2,
  /** 마을의 결혼식 사이 최소 간격(틱). 21 일 측정에서 5~7 쌍이 거의 날마다 결혼해 귀한 느낌이 없었다. */
  gap: 1440 * 4,
  /** 결혼식 시각(하루 안의 분)과 길이. */
  startMinute: 17 * 60,
  duration: 120,
  guestAff: 6,
  /** 부부의 이별 호감 문턱 배율(시험판 15 × 0.5). */
  breakupFactor: 0.5,
} as const;

/** 생일 (SPEC 11.3). */
export const BIRTHDAY = {
  /** 한 해의 날 수. */
  yearDays: 28,
  /** 생일 날짜를 정하는 곱수(난수를 쓰지 않는다). */
  hashMul: 7919,
  friendAff: 40,
  maxGuests: 5,
  visitAff: 6,
  fun: 8,
  /** 축하 요약 소식 시각(하루 안의 분). */
  summaryMinute: 20 * 60,
  /** 기억으로 남기는 최소 축하 인원. */
  memoryFrom: 3,
  visitScore: 3,
} as const;

/** 도토리 신문 (SPEC 11.4). */
export const PAPER = {
  everyDays: 7,
  minute: 20 * 60,
  keep: 8,
  bigPartyFrom: 6,
  breadOutDays: 2,
  arrivalsHeadline: 3,
  /** 월척 확률과 더 얻는 생선 수. */
  bigFishChance: 0.03,
  bigFishBonus: 2,
} as const;

/** 문장 고르기 (SPEC 11.5): 최근 몇 줄과 겹치지 않게 고른다. */
export const LINES = {
  avoidRecent: 3,
} as const;
