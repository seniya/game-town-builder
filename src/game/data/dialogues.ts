// 대사 데이터 (MVP_SPEC 27.4 / 28, ARCHITECTURE 21.1, TASK-040). 대사는 목표 문구만 바꾸고 해금을 하지 않는다 (ADR 010).
// 등록(대화 표시)은 진행 이벤트(TASK-042)가 한다. 여기에는 정적 문장만 둔다. 목표 적용은 ObjectiveSystem(TASK-041)이 한다.
import type { DialogueDefinition } from '../types';
import { balance } from './balance';

/** 대사 id → 정의. */
export const DIALOGUES: readonly DialogueDefinition[] = [
  {
    id: 'farmer_first',
    npcId: 'farmer',
    lines: [
      '어서 와. 여기는 한때 작은 마을이었어.',
      '밭이 망가져서 먹을 것을 만들 수 없어.',
      '흙을 캐서 밭흙을 만들고 네 칸만 깔아 줄래? 씨앗은 내가 심을게.',
    ],
    nextObjective: {
      id: 'objective_farmland',
      sourceEventId: 'EVENT_FARM_REQUEST',
      text: `밭흙을 ${balance.farm.tutorialPlotCount} 칸 만들어 주세요`,
      progress: { kind: 'farmland', total: balance.farm.tutorialPlotCount },
    },
  },
  {
    id: 'cook_first',
    npcId: 'cook',
    lines: ['반가워. 나는 요리를 해.', '작물이 모이면 맛있는 걸 만들어 줄게.'],
  },
  {
    id: 'carpenter_first',
    npcId: 'carpenter',
    lines: ['나는 목수야. 부서진 곳은 내가 고칠게.', '지낼 곳이 생기면 좋겠다.'],
  },
  {
    id: 'kitchen_request',
    npcId: 'cook',
    lines: [
      '작물은 생겼는데, 요리할 곳이 없어.',
      '벽으로 둘러싸고, 문을 하나 달고, 화덕과 물통을 놓아 줘.',
      '벽은 두 칸 높이는 되어야 해.',
    ],
    nextObjective: {
      id: 'objective_kitchen',
      sourceEventId: 'EVENT_KITCHEN_REQUEST',
      text: '주방을 만들어 주세요',
      progress: null,
    },
  },
  {
    id: 'bedroom_request',
    npcId: 'carpenter',
    lines: ['밥은 먹었지만, 잘 곳이 없어.', '방 안에 침대를 놓아 주면 밤에 거기서 잘게.'],
    nextObjective: {
      id: 'objective_bedroom',
      sourceEventId: 'EVENT_BEDROOM_REQUEST',
      text: '침실을 만들어 주세요',
      progress: null,
    },
  },
  {
    id: 'bell_intro',
    npcId: 'carpenter',
    lines: [
      '마을에 종이 있어. 마을이 커졌을 때 치는 거야.',
      '종에 가서 F 를 눌러 봐. 무엇이 모자란지 다 보여 줄 거야.',
      '종을 치면 주민이 늘어요. 밭을 8 칸으로 넓히고 씨앗과 침대도 준비해 주세요.',
      '다음 종은 방 4 개, housingLevel 100, foodLevel 50 이 필요해. 상자로 창고를, 식탁과 의자로 식당을 만들 수 있어.',
    ],
    nextObjective: {
      id: 'objective_bell',
      sourceEventId: 'EVENT_BELL_REQUEST',
      text: '마을의 종을 쳐 주세요',
      progress: null,
    },
  },
  {
    id: 'wall_request',
    npcId: 'carpenter',
    lines: [
      '어젯밤에 몬스터가 벽을 부수고 들어왔어.',
      '부서진 곳은 내가 고칠게. 마을을 벽으로 둘러싸 주면 훨씬 안전할 거야.',
    ],
    nextObjective: {
      id: 'objective_wall',
      sourceEventId: 'EVENT_WALL_REQUEST',
      text: '마을을 벽으로 둘러싸 주세요',
      progress: null,
    },
  },
  {
    id: 'new_resident_welcome',
    npcId: 'farmer',
    lines: ['식구가 다섯이 됐어.', '처음 왔을 때는 아무것도 없었는데, 이제 정말 마을 같아.'],
    nextObjective: {
      id: 'objective_protect',
      sourceEventId: 'EVENT_NEW_RESIDENT',
      text: '마을을 지키며 함께 지내 주세요',
      progress: null,
    },
  },
  {
    id: 'slice_end_thanks',
    npcId: 'cook',
    lines: ['긴 밤이 또 지나갔네.', '고마워. 네가 만든 방에서 우리는 오늘도 밥을 먹고 잠을 자.'],
  },
];

/** id 로 대사를 찾는다. */
export function dialogueById(id: string): DialogueDefinition | undefined {
  return DIALOGUES.find((d) => d.id === id);
}
