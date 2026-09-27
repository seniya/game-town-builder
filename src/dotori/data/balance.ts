// 도토리 마을 수치 (SPEC 1·3·4·7). 로직 안에 수치를 직접 쓰지 않고 여기서 가져간다.

/** 시간 (SPEC 1). */
export const TIME = {
  /** 1× 에서 실제 1 초에 흐르는 게임 분(= 틱). 넓어진 지도에서 걷는 시간을 줄이려고 시험판 8 에서 6 으로 늦췄다. */
  minPerSec: 6,
  /** 한 프레임에 돌릴 수 있는 최대 틱. */
  maxTicksPerFrame: 200,
  /** 새 마을의 시작 시각(분). */
  startMinute: 7 * 60,
  /** 아침 갱신 시각(하루 안의 분). */
  morningMinute: 6 * 60,
  /** 새 주민 이사 확인 시각(하루 안의 분). */
  arrivalMinutes: [9 * 60, 15 * 60] as readonly number[],
} as const;

/** 욕구 (SPEC 3.2). */
export const NEEDS = {
  hungerDecay: 0.07,
  hungerDecayGlutton: 0.11,
  energyDecay: 0.055,
  funDecay: 0.045,
  eatGain: 3.2,
  sleepGain: 0.24,
  sleepHungerGain: 0.035,
  napGain: 0.16,
  restEnergy: 0.05,
  restFun: 0.06,
  funGain: 0.32,
  partyFun: 0.3,
  partySocial: 0.12,
  raindanceFun: 0.5,
  socialFun: 0.03,
  talkSocial: 24,
  talkSocialLoner: 12,
  /** 플레이어가 지은 장식에서 놀 때 더하는 즐거움(SPEC 3.2). */
  decorFunBonus: 0.1,
} as const;

/** 관계·대화 (SPEC 3.4). */
export const SOCIAL = {
  talkDist2: 2.9,
  baseChat: 0.02,
  friendAff: 52,
  crushAff: 60,
  crushAffRomantic: 38,
  lineTicks: 3,
  welcomeAff: 8,
  sameHomeAffMin: 22,
  sameHomeAffSpan: 12,
} as const;

/** 날씨 (SPEC 3.4). */
export const WEATHER = {
  rainChancePerHour: 0.035,
  rainMin: 60,
  rainMax: 180,
} as const;

/** 빵집 여는 시간(시험판). 빵 굽기는 PRODUCE. */
export const BAKERY = {
  openFrom: 6,
  openTo: 20,
} as const;

/** 생산 사슬 (SPEC 9, ADR 050). */
export const PRODUCE = {
  /** 작물이 한 단계 자라는 틱(1~3 단계). */
  stageTicks: 420,
  /** 비 올 때 자람 배율. */
  rainGrowth: 1.5,
  /** 익은 단계. */
  ripe: 4,
  /** 자람을 모아서 처리하는 간격(틱). */
  growEvery: 10,
  harvestTicks: 12,
  plantTicks: 8,
  tendTicks: 20,
  tendBoost: 120,
  /** 농부 밀 등짐이 이만큼이면 방앗간으로 간다. */
  wheatPack: 6,
  /** 이만큼 이상이면 손수레를 민다(화면). */
  cartFrom: 4,
  /** 한 번 나가 이어서 일하는 밭 칸 수. */
  fieldChain: 10,
  /** 빈 밭이 있을 때 밭일을 심기부터 시작할 확률. */
  plantChance: 0.35,
  /** 익은 칸이 있을 때 농부 일 점수 배율. */
  farmUrge: 1.3,
  millEvery: 20,
  millWheatCap: 60,
  /** 방앗간 밀가루 창고 용량. 가득 차면 빻지 않는다. */
  millFlourCap: 60,
  /** 빵집 밀가루가 이보다 적으면 가지러 간다(V2.5: 3 → 8). */
  flourLow: 8,
  /** 한 번에 가져오는 밀가루(V2.5: 8 → 30, 제빵사 일 시간의 절반 넘게 방앗간 오가기였다). 손수레로 민다. */
  flourCarry: 30,
  /** 제빵사 한 명이 빵 1 을 굽는 틱(V2.5: 10 → 6, 제빵사가 하루 약 10 개만 구워 밀가루가 방앗간에 쌓였다). */
  bakeEvery: 6,
  /** 빵 1 에 드는 밀가루(V2.5: 0.5 → 1, 밀이 남아돌아 밭과 빵이 이어지지 않았다). */
  flourPerBread: 1,
  breadCap: 40,
  fishEvery: 15,
  fishChance: 0.2,
  fishPack: 4,
  fishCap: 30,
  supperFrom: 17,
  supperTo: 23,
  supperMaxHunger: 70,
  supperDur: 40,
  tavernMaxDist: 30,
  start: { bread: 24, bakeryFlour: 6, millFlour: 4, millWheat: 0 },
} as const;

/** 먹는 곳에 따라 식사를 시작할 때 한 번 더하는 즐거움·어울림 (SPEC 10.1, V2.5). 집밥은 배만 채운다. */
export const MEALS = {
  home: { fun: 0, social: 0 },
  /** 갓 구운 빵. */
  bakery: { fun: 8, social: 4 },
  /** 주점 생선구이 저녁상(여럿이 모여 먹는다). */
  tavern: { fun: 12, social: 10 },
  /** 빵이 있고 가까울 때 빵집에서 먹을 확률(먹보는 늘). 시험판 0.6. */
  bakeryChance: 0.7,
} as const;

/** 먹거리 여유 (SPEC 10.2, V2.5). 여유 = (빵집 빵 + 주점 생선) ÷ 인구. */
export const FOOD = {
  /** 이보다 적으면 "빠듯": 새 주민이 이사를 망설인다. */
  tightBelow: 0.25,
  /** 이 이상이면 "넉넉": 이사 확인을 한 번 더 하고 하루 최대 이사 수가 는다. */
  plentyFrom: 0.8,
  /** 넉넉할 때 더하는 이사 확인 시각(하루 안의 분). */
  plentyMinute: 12 * 60,
  plentyMaxPerDay: 3,
  /** 넉넉하지 않을 때 새 주민 직업: 방앗간 밀가루가 이 이상이면 제빵사(굽는 손이 모자람), 아니면 농부. */
  flourPiled: 30,
  /** 그 직업이 인구 ÷ 이 값보다 적을 때만 (제빵사 5, 농부 4). */
  bakerPer: 5,
  farmerPer: 4,
} as const;

/** 처음 마을 (SPEC 3.1·4.3). */
export const START = {
  residents: 20,
  lumber: 30,
} as const;

/** 목재와 짓기 (SPEC 4.3). */
export const LUMBER = {
  /** 나무꾼이 목재 1 을 얻는 일 시간(틱). */
  chopEvery: 8,
  /** 등짐이 이만큼 차면 야적장으로 간다. */
  packFull: 5,
  /** 야적장 용량. 이만큼 쌓이면 나무꾼이 나무하러 가지 않는다(쌓아 둔 짐은 내려놓는다). */
  yardCap: 80,
  /** 목수가 한 번에 나르는 최대 목재. */
  carryMax: 20,
  /** 목수 한 명이 1 분에 줄이는 짓는 일. */
  workRate: 1,
  workRateWorkaholic: 1.3,
  workRateLazy: 0.7,
} as const;

/** 걷는 속도(타일/틱, 길 위 기준). 화면 속도 = 값 × minPerSec ≈ 2 타일/초(시험판 1.6). */
export const WALK = {
  base: 0.33,
  /** 누군가를 찾아가는 중(방문·초대·고백). */
  visit: 0.45,
  flee: 0.6,
  /** 등짐이 무거울 때(목재 6 개 이상·이삿짐). */
  heavy: 0.26,
} as const;

/** 목적지 고르기 (SPEC 3.3): 후보를 몇 개 뽑아 가장 가까운 곳으로 간다. */
export const DESTINATION = {
  /** 나무꾼: 야적장에서 가까운 숲 가장자리. */
  woodSamples: 10,
  /** 놀기(숲·들판)·보물찾기: 지금 자리에서 가까운 곳. */
  funSamples: 5,
  wanderSamples: 3,
  /** 빵집이 이보다 멀면(타일) 집에서 먹는다. */
  bakeryMaxDist: 30,
  /** 플레이어가 지은 장식을 고르는 가중치(처음 장식은 1). */
  playerDecorWeight: 3,
} as const;

/** 새 주민 이사 (SPEC 4.4). */
export const ARRIVAL = {
  perHouse: 2,
  minHappiness: 40,
  charmPerResident: 0.5,
  maxPerDay: 2,
  /** 인사하러 가는 이웃 수 [최소, 최대]. */
  welcomers: [1, 2] as readonly [number, number],
} as const;

/** 처음 있는 것의 매력 (SPEC 4.1). */
export const BASE_CHARM = {
  fountain: 4,
} as const;

/** 성능 예산 (SPEC 7). */
export const PERF = {
  pathsPerTick: 16,
  spatialCell: 4,
  feedMax: 120,
  diaryMax: 14,
  rumorsMax: 30,
  /** 경로 캐시 칸 수(시작·도착 칸 쌍). 지도가 바뀌면 비운다(SPEC 7). */
  pathCache: 2048,
} as const;

/** 주민 그림 단순화(LOD, SPEC 7). 화면 밖 주민은 그리지 않고 동작을 멈춘다. 먼 주민은 그림자·입자를 끄고 동작을 띄엄띄엄 갱신한다. */
export const LOD = {
  /** 카메라에서 이 거리(타일) 넘게 떨어진 주민은 먼 주민이다. */
  far: 38,
  /** 먼 주민은 이 프레임마다 한 번 동작을 갱신한다(그사이 시간은 모아 둔다). */
  farEvery: 3,
  /** 화면 안 판정 구의 반지름(타일). 주민 키·우산·도구를 덮는다. */
  radius: 1.3,
  /** 화면 밖에 있던 동안 모아 두는 동작 시간의 상한(초). */
  maxHold: 4,
} as const;
