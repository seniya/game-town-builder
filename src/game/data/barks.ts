// 주민의 한마디 문장 (MVP_SPEC 19.7, ARCHITECTURE 21.4, TASK-BARK-001, ADR 042).
// 정해 둔 문장을 상황으로 고를 뿐이다. 생성하지 않는다(MVP_SPEC 42). 말투는 진행 대사(dialogues.ts)와 같은 반말이다.
// 창립 주민은 역할별 문장이 있으면 그것을, 없으면 공통 문장을 쓴다. 간격·고르기는 BarkSystem 이 한다.
import type { BarkTopic, DayPhase, NPCRole, RoomType } from '../types';
import { balance } from './balance';

/** 한 상황의 문장. common 은 반드시 하나 이상이다. */
export interface BarkLines {
  readonly common: readonly string[];
  readonly farmer?: readonly string[];
  readonly cook?: readonly string[];
  readonly carpenter?: readonly string[];
  readonly villager?: readonly string[];
}

/** 상황별 간격 규칙. urgent 이면 주민별 공통 간격을 무시한다 (MVP_SPEC 19.7). */
export interface BarkRule {
  /** 같은 주민이 같은 상황을 다시 말하기까지 실초. 0 이면 공통 간격만 본다 */
  readonly cooldownSeconds: number;
  readonly urgent: boolean;
}

const B = balance.bark;

/** 상황 → 간격 규칙. */
export const BARK_RULES: Readonly<Record<BarkTopic, BarkRule>> = {
  greet: { cooldownSeconds: B.greetCooldownSeconds, urgent: false },
  poke: { cooldownSeconds: B.pokeCooldownSeconds, urgent: true },
  wake: { cooldownSeconds: 0, urgent: false },
  wakeFloor: { cooldownSeconds: 0, urgent: false },
  sleep: { cooldownSeconds: 0, urgent: false },
  noBed: { cooldownSeconds: 0, urgent: false },
  eatDining: { cooldownSeconds: 0, urgent: false },
  eatPlaza: { cooldownSeconds: 0, urgent: false },
  hungry: { cooldownSeconds: 0, urgent: false },
  harvest: { cooldownSeconds: B.workCooldownSeconds, urgent: false },
  plant: { cooldownSeconds: B.workCooldownSeconds, urgent: false },
  cook: { cooldownSeconds: B.workCooldownSeconds, urgent: false },
  repair: { cooldownSeconds: B.workCooldownSeconds, urgent: false },
  flee: { cooldownSeconds: B.fleeCooldownSeconds, urgent: true },
  hit: { cooldownSeconds: B.hitCooldownSeconds, urgent: true },
  stunned: { cooldownSeconds: B.hitCooldownSeconds, urgent: true },
  raidEnd: { cooldownSeconds: 0, urgent: false },
  newRoom: { cooldownSeconds: 0, urgent: false },
  levelUp: { cooldownSeconds: 0, urgent: false },
  arrived: { cooldownSeconds: 0, urgent: false },
  idle: { cooldownSeconds: 0, urgent: false },
};

/** 인사는 시간대 묶음마다 다르다. */
type GreetTime = 'morning' | 'day' | 'evening' | 'night';

const GREET: Readonly<Record<GreetTime, BarkLines>> = {
  morning: { common: ['좋은 아침!', '일찍 일어났네.', '오늘도 잘 부탁해.'] },
  day: { common: ['안녕!', '오늘 날씨 좋다.', '수고가 많아.'] },
  evening: { common: ['슬슬 해가 지네.', '오늘 하루 고생했어.', '저녁 먹었어?'] },
  night: { common: ['밤엔 위험해. 조심해.', '아직 안 자?', '늦었네. 푹 쉬어.'] },
};

/** 새 방은 방 타입마다 다르다. */
const NEW_ROOM: Readonly<Record<RoomType, BarkLines>> = {
  Kitchen: {
    common: ['주방이다! 뭘 만들지 기대돼.', '이제 요리할 수 있겠다.'],
    cook: ['내 주방이다! 고마워!', '화덕이 반짝반짝해.'],
  },
  Bedroom: {
    common: ['침실이다! 오늘 밤은 푹 자겠다.', '포근해 보여.'],
    carpenter: ['잘 지었네. 튼튼하다.', '오늘 밤은 여기서 자야지.'],
  },
  DiningRoom: { common: ['식당이야! 다 같이 밥 먹자.', '식탁에서 먹으면 더 맛있지.'] },
  Storeroom: { common: ['창고가 생겼네. 든든하다.', '이제 물건 둘 곳이 있어.'] },
  EmptyRoom: { common: ['새 방이네. 뭘 놓을까?', '아늑한 방이다.'] },
};

/** 인사·새 방을 뺀 상황의 문장. poke 는 다른 상황의 문장을 빌려 쓰므로 없다. */
const LINES: Readonly<Record<Exclude<BarkTopic, 'greet' | 'newRoom' | 'poke'>, BarkLines>> = {
  wake: { common: ['잘 잤다!', '푹 잤더니 개운해.', '역시 침대가 최고야.'] },
  wakeFloor: { common: ['아이고, 허리야…', '바닥은 너무 딱딱해.', '침대에서 자 보고 싶다.'] },
  sleep: { common: ['잘 자.', '오늘도 고마웠어.', '내일 봐.'] },
  noBed: { common: ['잘 곳이 없네…', '침대가 있으면 좋겠다.', '오늘도 밖에서 자야 하나.'] },
  eatDining: { common: ['잘 먹겠습니다!', '식탁에서 먹으니 더 맛있어.', '따뜻한 밥이다.'] },
  eatPlaza: {
    common: ['앉아서 먹을 데가 있으면 좋겠다.', '식당이 생기면 좋겠어.', '그래도 맛있다.'],
  },
  hungry: {
    common: ['배고파…', '먹을 게 하나도 없어.', '뭐라도 먹고 싶다.'],
    cook: ['작물이 없어서 요리를 못 해.', '배고프지? 작물이 있어야 해.'],
    farmer: ['밭에서 작물이 자라야 먹을 텐데.', '배고파… 밭을 넓혀 볼까.'],
  },
  harvest: { common: ['잘 자랐다!', '올해는 풍년이야.', '수확이다!'] },
  plant: { common: ['쑥쑥 자라라.', '금방 싹이 틀 거야.', '씨앗을 심자.'] },
  cook: { common: ['오늘은 뭘 만들까.', '냄새 좋지?', '맛있게 만들어 줄게.'] },
  repair: { common: ['금방 고칠게.', '이 정도는 문제없어.', '뚝딱뚝딱.'] },
  flee: { common: ['몬스터다! 숨어!', '으악, 도망쳐!', '집 안으로!'] },
  hit: { common: ['아야!', '으악!', '저리 가!'] },
  stunned: { common: ['으윽…', '눈앞이 빙빙 돌아…'] },
  raidEnd: { common: ['휴, 다 갔나 봐.', '다들 무사해?', '무서웠다…'] },
  levelUp: { common: ['종소리 좋다!', '마을이 조금 커졌어!', '점점 마을다워진다.'] },
  arrived: { common: ['안녕! 오늘부터 여기서 지낼게.', '여기가 소문난 마을이구나.'] },
  idle: {
    common: ['여기 좋은 마을이야.', '오늘도 평화롭다.', '뭐 도와줄 거 없어?'],
    farmer: ['밭 상태는 괜찮아.', '흙 냄새가 좋아.', '작물은 정직해.'],
    cook: ['배고프면 말해.', '작물이 모이면 요리할게.', '간은 내가 잘 맞춰.'],
    carpenter: ['튼튼한 벽이 최고지.', '부서진 데 있으면 말해.', '나무 냄새가 좋아.'],
  },
};

/** 시간대 → 인사 묶음. */
function greetTime(phase: DayPhase): GreetTime {
  switch (phase) {
    case 'dawn':
    case 'morning':
      return 'morning';
    case 'noon':
    case 'afternoon':
      return 'day';
    case 'evening':
      return 'evening';
    case 'night':
      return 'night';
  }
}

/** 문장 묶음에서 이 역할의 문장을 고른다. 역할별 문장이 없으면 공통이다. */
function forRole(lines: BarkLines, role: NPCRole): readonly string[] {
  const own = lines[role];
  return own && own.length > 0 ? own : lines.common;
}

/**
 * 이 상황·역할의 문장 목록. greet 는 phase, newRoom 은 roomType 이 필요하다(없으면 빈 목록).
 * poke 는 문장이 없다(BarkSystem 이 다른 상황으로 바꿔 부른다).
 */
export function barkLines(
  topic: BarkTopic,
  role: NPCRole,
  extra: { readonly phase?: DayPhase; readonly roomType?: RoomType } = {},
): readonly string[] {
  if (topic === 'greet') return extra.phase ? forRole(GREET[greetTime(extra.phase)], role) : [];
  if (topic === 'newRoom') return extra.roomType ? forRole(NEW_ROOM[extra.roomType], role) : [];
  if (topic === 'poke') return [];
  return forRole(LINES[topic], role);
}
