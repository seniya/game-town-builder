# ADR 010. 대사 종료는 목표 문구만 바꾸고, 건물 해금은 이벤트 시점에 한다

Status: Accepted
Date: 2026-09-22


> v1.1 적용 범위 (ADR 016): 대사 종료가 목표만 바꾼다는 원칙은 유지한다. 해금은 이벤트가 아니라 VillageLevelSystem의 레벨 전이에서 적용한다. 아래 unlockBuilding 예시는 현재 구현 기준이 아니다.

## 배경

`MVP_SPEC.md` 47.1의 첫 페이즈 흐름은 다음과 같았다.

```text
게임 시작
↓
EVENT_FARM_REQUEST 발생
↓
Objective     "마을을 둘러보세요."
Farmer 머리 위  대화 가능 표시 (!)
↓
플레이어가 Farmer 에게 접근하여 [E]
↓
Dialogue      "밭이 망가져서 먹을 것을 만들 수 없어."
↓
Dialogue 종료
↓
Objective     "농부를 위해 밭을 복구하세요."
Build Menu    Farm 해금            ← 여기
```

이 흐름은 구현할 수단이 없었다.

```text
GameEventCommand 에 "대사가 끝나면 ~한다" 를 표현할 수단이 없다   (ADR 007)
GameEventMap 에 대사 종료를 알리는 이벤트가 없다
ARCHITECTURE 54장은 "이벤트 조건이 Dialogue 에 의존해선 안 된다" 고 금지한다
```

`GameEventSystem`은 `canTrigger`가 참이 된 프레임에 `execute()`의 커맨드를
한 번 실행하고 끝난다. 대사가 끝나는 시점을 다시 붙잡을 곳이 없다.

더 근본적인 문제는 같은 문서 안의 충돌이었다.

```text
47.1   대사가 끝나야 Farm 이 해금된다
47.2   대화하지 않고 건설 메뉴에서 바로 밭을 지어도 진행된다
```

해금이 대사에 걸려 있으면 47.2는 애초에 성립할 수 없다.
건설 메뉴에 밭이 없기 때문이다.

## 결정

**해금과 목표를 분리한다.**

```text
unlockBuilding       이벤트 발생 즉시   (GameEventCommand)
markNpcHasDialogue   이벤트 발생 즉시   (GameEventCommand)
목표 문구 변경        대사 종료 후
```

목표 문구만 대사 이후에 바뀌는 이유는 **정보의 순서** 때문이다.

플레이어가 이유를 듣기 전에 "밭을 복구하세요"라고 지시하면
`Problem → Build` 순서가 `Build → Problem` 으로 뒤집힌다.

게임의 핵심 루프는 "건설해야 하는 이유가 먼저 있다"는 것이다.

대사 종료를 목표에 연결하는 경로는 다음 하나다.

```text
DialogueSystem 이 마지막 줄을 닫는다
    ↓
DIALOGUE_ENDED { dialogueId } emit
    ↓
ObjectiveSystem 이 구독한다
    ↓
DIALOGUES[dialogueId].objectiveOnEnd 가 있으면 적용한다
```

```ts
export interface DialogueDefinition {
  id: string;
  speaker: NPCRole;
  lines: string[];
  /** 대사가 끝났을 때 설정할 목표. 없으면 목표를 바꾸지 않는다. */
  objectiveOnEnd?: Objective;
}
```

`DIALOGUE_ENDED`는 **목표 표시만** 바꾼다.

어떤 `GameEventDefinition`의 `canTrigger`도 이 이벤트를 참조하지 않는다.
진행 조건은 여전히 게임 상태(`storage`, `worldState`, `triggeredEvents`)로만
판정된다.

## 검토한 대안

**A. GameEventCommand 에 대사 종료 콜백을 넣는다**

```ts
{ kind: 'dialogue', dialogueId: string, onEnd: GameEventCommand[] }
```

문제:

- 커맨드가 커맨드를 품는 중첩 구조가 된다.
- ADR 007이 커맨드를 도입한 이유가 "이벤트 정의가 무엇을 하는지 정의만 읽고
  알 수 있게" 하는 것이었는데, 중첩이 생기면 그 이점이 줄어든다.
- 대사 종료 이후에도 `execute` 결과를 붙들고 있어야 하므로
  `GameEventSystem`이 상태를 갖게 된다.

**B. GameEventSystem 이 대사 종료를 기다렸다가 다음 커맨드를 실행한다**

`execute`의 커맨드 배열을 대사 종료 지점에서 분할한다.

문제:

- `GameEventSystem`이 "지금 대사 중인가"를 추적해야 한다.
- 커맨드 배열의 순서에 암묵적 의미(대사 앞 / 대사 뒤)가 생긴다.
- 대사 도중 다른 이벤트가 발생하면 동작이 정의되지 않는다.

**C. DialogueSystem 이 ObjectiveSystem 을 직접 호출한다**

가장 짧지만 `DialogueSystem`이 목표 내용을 알게 된다.

문제:

- 대사와 목표가 코드에서 결합되어, 목표 문구를 바꾸려면
  `DialogueSystem`을 수정해야 한다.
- 71장의 "UI 와 Domain Logic 을 직접 연결하지 않는다"에서 멀어진다.

**D. 이벤트 커맨드로 목표까지 즉시 설정한다 (대사 무시)**

가장 단순하다. 대사 종료 개념 자체가 없어진다.

문제:

- 플레이어가 농부를 만나기도 전에 "농부를 위해 밭을 복구하세요"가 뜬다.
- 발견 → 필요 → 해결의 감정 순서가 무너진다. 이것이 `GAME_DESIGN.md` 3장의
  핵심이므로 포기할 수 없다.

**E. DIALOGUE_ENDED 이벤트 + 데이터에 objectiveOnEnd**

채택.

`DialogueSystem`은 자신이 무슨 목표를 세울지 모르고,
`ObjectiveSystem`은 대사 내용을 모른다. 둘을 잇는 것은 `data/dialogues.ts`다.

데이터 계층은 모든 계층이 읽어도 되는 가장 아래 계층이다.

## 예상되는 결과

긍정적:

- `MVP_SPEC.md` 47.1과 47.2가 동시에 성립한다.
- 이벤트 정의가 순수 함수로 남는다 (ADR 007 유지).
- 진행 조건이 UI 상태에 의존하지 않는다 (ARCHITECTURE 54장 유지).
- 대사를 건너뛰는 플레이어도 막히지 않는다. 목표 문구만 이전 것으로 남는다.
- 목표 문구를 바꾸는 데 코드 수정이 필요 없다. 데이터만 고친다.

부정적 / 위험:

- 대사를 보지 않은 플레이어는 "마을을 둘러보세요" 목표를 계속 본다.
  밭을 지으면 다음 이벤트가 목표를 덮어쓰므로 영구히 남지는 않는다.
- `ObjectiveSystem`이 구독하는 이벤트가 셋(`DIALOGUE_ENDED`,
  `BUILDING_PLACED`, `WORLD_STATE_CHANGED`)으로 늘어난다.
  전부 "표시를 갱신한다"는 하나의 책임 안에 있다.
- `objectiveOnEnd`가 있는 대사를 두 번 볼 수 있으면 목표가 되돌아간다.
  MVP의 진행 대사는 전부 1회성이므로 현재는 발생하지 않는다.
