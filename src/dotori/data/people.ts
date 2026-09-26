// 주민을 만드는 데 쓰는 목록: 성격·직업·이름·겉모습 (SPEC 3.1). 로직은 없다.

/** 성격 10 종. 과장된 성격이 행동과 대화 빈도를 바꾼다. */
export const TRAIT_NAMES = [
  '수다쟁이',
  '게으름뱅이',
  '일벌레',
  '로맨티스트',
  '투덜이',
  '겁쟁이',
  '먹보',
  '호기심쟁이',
  '파티광',
  '외톨이',
] as const;
export type TraitName = (typeof TRAIT_NAMES)[number];

export interface TraitDef {
  /** 성격을 나타내는 이모지. */
  e: string;
  /** 한 줄 설명(주민 카드). */
  desc: string;
  /** 대화를 거는 빈도 배율. */
  talk: number;
  /** 어울림 욕구가 틱마다 줄어드는 양. */
  soc: number;
  /** 대화 화제로 자주 꺼내는 이모지. */
  topics: readonly string[];
}

/** 성격별 값(시험판에서 옮김). */
export const TRAITS: Record<TraitName, TraitDef> = {
  수다쟁이: {
    e: '🗣️',
    desc: '말을 안 하면 병이 난다',
    talk: 2.0,
    soc: 0.14,
    topics: ['🗣️', '😂', '👀'],
  },
  게으름뱅이: { e: '😴', desc: '어디서든 잘 수 있다', talk: 0.9, soc: 0.07, topics: ['😪', '🛌'] },
  일벌레: { e: '🔨', desc: '쉬는 법을 모른다', talk: 0.6, soc: 0.05, topics: ['📋', '💪'] },
  로맨티스트: {
    e: '💘',
    desc: '사랑에 너무 쉽게 빠진다',
    talk: 1.3,
    soc: 0.09,
    topics: ['🌹', '✨', '🌙'],
  },
  투덜이: { e: '😤', desc: '모든 게 마음에 안 든다', talk: 0.9, soc: 0.06, topics: ['😒', '🌧️'] },
  겁쟁이: { e: '😱', desc: '작은 소리에도 기겁한다', talk: 0.9, soc: 0.08, topics: ['😰', '👻'] },
  먹보: { e: '🍗', desc: '늘 배가 고프다', talk: 1.0, soc: 0.08, topics: ['🍗', '🍰', '🍞'] },
  호기심쟁이: {
    e: '🔍',
    desc: '안 가 본 곳이 궁금해 못 참는다',
    talk: 1.1,
    soc: 0.07,
    topics: ['🔍', '🗺️', '🍄'],
  },
  파티광: { e: '🎉', desc: '모이기만 하면 신난다', talk: 1.6, soc: 0.11, topics: ['🎉', '🎶'] },
  외톨이: { e: '🌙', desc: '혼자가 제일 편하다', talk: 0.35, soc: 0.03, topics: ['🌙', '📖'] },
};

/** 성격 궁합(시험판). 키는 '성격|성격', 순서는 상관없다. */
export const TRAIT_COMPAT: Readonly<Record<string, number>> = {
  '수다쟁이|외톨이': -4,
  '일벌레|게으름뱅이': -4,
  '파티광|외톨이': -3,
  '파티광|수다쟁이': 3,
  '호기심쟁이|겁쟁이': -2,
  '로맨티스트|파티광': 2,
  '게으름뱅이|먹보': 2,
};

export const JOB_NAMES = ['농부', '제빵사', '어부', '목수', '나무꾼', '주점 주인', '한량'] as const;
export type JobName = (typeof JOB_NAMES)[number];
export type JobPlace = 'farm' | 'bakery' | 'shore' | 'workshop' | 'forest' | 'tavern' | null;

export interface JobDef {
  e: string;
  /** 모자 색(render 가 쓴다). null 이면 모자 대신 꽃 장식. */
  hat: string | null;
  /** 일하는 시간 [시작, 끝) 시. null 이면 일하지 않는다. */
  hours: readonly [number, number] | null;
  place: JobPlace;
  /** 일하는 중 문구. */
  label: string;
}

/** 직업별 값(시험판). 목수의 일터는 청사진이 있으면 공사장이 된다(SPEC 4.3). */
export const JOBS: Record<JobName, JobDef> = {
  농부: { e: '🌱', hat: '#E9C46A', hours: [6, 15], place: 'farm', label: '밭을 가꾸는 중' },
  제빵사: { e: '🥖', hat: '#FFFFFF', hours: [5, 13], place: 'bakery', label: '빵을 굽는 중' },
  어부: { e: '🎣', hat: '#3D6FA8', hours: [6, 14], place: 'shore', label: '물고기를 낚는 중' },
  목수: { e: '🔨', hat: '#E07A3F', hours: [8, 17], place: 'workshop', label: '공방에서 뚝딱뚝딱' },
  나무꾼: { e: '🪓', hat: '#B83B32', hours: [8, 16], place: 'forest', label: '숲에서 나무하는 중' },
  '주점 주인': {
    e: '🍺',
    hat: '#7B4E9E',
    hours: [16, 24],
    place: 'tavern',
    label: '주점에서 손님 맞는 중',
  },
  한량: { e: '🌼', hat: null, hours: null, place: null, label: '' },
};

/** 처음 20 명의 직업 배분(SPEC 3.1). */
export const START_JOBS: readonly JobName[] = [
  ...Array<JobName>(4).fill('농부'),
  ...Array<JobName>(2).fill('제빵사'),
  ...Array<JobName>(3).fill('어부'),
  ...Array<JobName>(3).fill('목수'),
  ...Array<JobName>(3).fill('나무꾼'),
  '주점 주인',
  ...Array<JobName>(4).fill('한량'),
];

/** 새 주민 직업을 고를 때의 목표 비율(SPEC 4.5). */
export const JOB_TARGET_SHARE: Record<JobName, number> = {
  농부: 0.2,
  제빵사: 0.1,
  어부: 0.15,
  목수: 0.15,
  나무꾼: 0.15,
  '주점 주인': 0.05,
  한량: 0.2,
};

/** 처음 이름 30 개(시험판). */
export const NAMES: readonly string[] = [
  '보리',
  '콩이',
  '다온',
  '하루',
  '모모',
  '두부',
  '솔이',
  '누리',
  '가을',
  '봄이',
  '별이',
  '치즈',
  '호두',
  '밤이',
  '토리',
  '단비',
  '새롬',
  '이슬',
  '구름',
  '마루',
  '초코',
  '라온',
  '해님',
  '달래',
  '여름',
  '겨울',
  '나래',
  '은이',
  '푸딩',
  '까미',
];

/** 이사 오는 주민을 위한 이름. 다 쓰면 숫자를 붙인다. */
export const MORE_NAMES: readonly string[] = [
  '감자',
  '고미',
  '꼬마',
  '나리',
  '노을',
  '다람',
  '딸기',
  '라니',
  '로이',
  '미루',
  '바다',
  '버들',
  '뽀미',
  '사랑',
  '산들',
  '소금',
  '수수',
  '아롱',
  '앵두',
  '연두',
  '오디',
  '우유',
  '유자',
  '잣송',
  '조이',
  '차돌',
  '참깨',
  '초롱',
  '코코',
  '탱이',
  '포도',
  '하늘',
  '한결',
  '호박',
  '홍시',
  '후추',
  '흰둥',
  '아리',
  '도담',
  '미소',
];

/** 이름 목록을 다 쓰면 두 음절을 이어 새 이름을 만든다(주민 100 명 이상, ADR 017). */
export const NAME_SYLLABLES_A: readonly string[] = [
  '다',
  '보',
  '소',
  '하',
  '나',
  '미',
  '루',
  '아',
  '예',
  '초',
  '토',
  '모',
  '라',
  '해',
  '새',
  '도',
  '가',
  '유',
];
export const NAME_SYLLABLES_B: readonly string[] = [
  '롱',
  '미',
  '리',
  '온',
  '솔',
  '빈',
  '람',
  '이',
  '울',
  '랑',
  '비',
  '윤',
  '담',
  '결',
  '별',
  '들',
  '실',
  '꽁',
];

export const SKINS: readonly string[] = ['#FFE3CC', '#FAD4B4', '#F2C29E', '#E2A882', '#C88E6A'];
export const PANTS: readonly string[] = [
  '#4F5D75',
  '#6B4F3A',
  '#3F6E5A',
  '#7A5C8E',
  '#5B6B8C',
  '#8C5B5B',
];
export const UMBRELLAS: readonly string[] = [
  '#FF8FA3',
  '#FFD166',
  '#7FD6FF',
  '#B7F07A',
  '#C9B6FF',
  '#FFA36C',
];

/** 일반 대화 화제와 맞장구(시험판). */
export const GENERIC_TOPICS: readonly string[] = [
  '🌤️',
  '🍞',
  '🐱',
  '🌻',
  '😂',
  '🍎',
  '🐟',
  '🌧️',
  '🐝',
  '🎵',
];
export const REACTS: readonly string[] = ['😄', '😆', '🤔', '😮', '👍', '🙂', '😂'];

export type FindKind = 'find' | 'treasure' | 'ghost';
/** 호기심쟁이가 주울 수 있는 것(시험판). */
export const FINDS: readonly { what: string; e: string; kind: FindKind }[] = [
  { what: '반짝이는 돌', e: '💎', kind: 'find' },
  { what: '네잎클로버', e: '🍀', kind: 'find' },
  { what: '오래된 보물 지도', e: '🗺️', kind: 'treasure' },
  { what: '엄청 큰 버섯', e: '🍄', kind: 'find' },
  { what: '정체 모를 커다란 발자국', e: '🐾', kind: 'ghost' },
];
