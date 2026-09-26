// 마을 카드의 작은 목표와 마을 이름 등급 (SPEC 5). 강제하지 않는 길잡이다.

export interface GoalDef {
  id: string;
  label: string;
  /** 목표 값(통계와 비교). */
  target: number;
  stat: 'playerHouses' | 'arrivals' | 'flowerbeds' | 'benches' | 'pop' | 'charm' | 'couples';
}

export const GOALS: readonly GoalDef[] = [
  { id: 'bench', label: '🪑 벤치를 하나 놓아 주민이 앉는 모습 보기', target: 1, stat: 'benches' },
  { id: 'house', label: '🏠 새 집 한 채 짓기', target: 1, stat: 'playerHouses' },
  { id: 'arrive', label: '🧳 새 주민 맞이하기', target: 1, stat: 'arrivals' },
  { id: 'flower', label: '🌷 꽃밭 두 곳 가꾸기', target: 2, stat: 'flowerbeds' },
  { id: 'couple', label: '💑 커플 세 쌍', target: 3, stat: 'couples' },
  { id: 'pop30', label: '👥 주민 30 명', target: 30, stat: 'pop' },
  { id: 'charm30', label: '✨ 마을 매력 30', target: 30, stat: 'charm' },
  { id: 'pop50', label: '👥 주민 50 명', target: 50, stat: 'pop' },
];

/** 인구에 따른 마을 이름 [이 인구 미만, 이름]. */
export const RANKS: readonly (readonly [number, string])[] = [
  [25, '작은 마을'],
  [40, '도토리 마을'],
  [60, '떡갈나무 마을'],
  [100, '큰 숲 마을'],
  [Infinity, '숲속 고을'],
];
