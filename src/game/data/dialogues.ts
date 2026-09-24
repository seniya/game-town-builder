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
    ],
    nextObjective: {
      id: 'objective_bell',
      sourceEventId: 'EVENT_BELL_REQUEST',
      text: '마을의 종을 쳐 주세요',
      progress: null,
    },
  },
];

/** id 로 대사를 찾는다. */
export function dialogueById(id: string): DialogueDefinition | undefined {
  return DIALOGUES.find((d) => d.id === id);
}
