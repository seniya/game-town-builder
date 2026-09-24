// 엔딩 연출의 장면 구성 (MVP_SPEC 28 Phase 6 / 27.1 EVENT_SLICE_END, TASK-052). 연출 표현 데이터이며 밸런스 수치가 아니다.
// 아침 → 수리하는 목수 → 각자의 일로 흩어지는 주민 5 명 → 마을 전경과 마지막 문장.

/** 엔딩 연출 id. 이벤트의 playCutscene 커맨드가 이 id 로 요청한다 */
export const ENDING_CUTSCENE_ID = 'slice_end';

/** 샷의 카메라 종류. */
export type EndingShotKind = 'wideOrbit' | 'carpenter' | 'residents' | 'rise';

/** 샷 하나. seconds 는 실시간(초)이다. */
export interface EndingShot {
  readonly kind: EndingShotKind;
  readonly seconds: number;
  readonly text: string;
}

/** 샷 순서. 합이 연출 길이다 */
export const ENDING_SHOTS: readonly EndingShot[] = [
  { kind: 'wideOrbit', seconds: 6, text: '아침.' },
  { kind: 'carpenter', seconds: 6, text: '목수가 부서진 곳을 고치기 시작한다.' },
  { kind: 'residents', seconds: 6, text: '주민 다섯이 각자의 일로 흩어진다.' },
  { kind: 'rise', seconds: 7, text: '이 마을을 조금 더 키워보고 싶다.' },
];

/** 카메라 배치(블록 단위). 연출 표현값이다 */
export const ENDING_CAMERA = {
  /** 전경 궤도 반지름·높이·회전(라디안) */
  orbitRadius: 22,
  orbitHeight: 13,
  orbitSweep: 0.55,
  /** 목수 뒤·위 거리 */
  carpenterBack: 6,
  carpenterUp: 4.5,
  /** 주민 중심 위 높이·뒤 거리 */
  residentsUp: 16,
  residentsBack: 14,
  /** 마지막 샷: 이 높이까지 오르며 궤도를 돈다 */
  riseFromHeight: 10,
  riseToHeight: 26,
  riseRadius: 26,
  /** 이 시간(초)이 지나야 건너뛸 수 있다(시작 키 입력이 바로 건너뛰지 않게) */
  skipAfterSeconds: 1,
} as const;
