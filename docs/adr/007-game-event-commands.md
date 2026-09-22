# ADR 007. 진행 이벤트의 execute 는 부작용 대신 커맨드 목록을 반환한다

Status: Accepted
Date: 2026-09-22

## 배경

초기 아키텍처 문서의 진행 이벤트 정의는 다음과 같았다.

```ts
interface GameEventDefinition {
  id: GameEventId;
  once: boolean;
  canTrigger(context: EventContext): boolean;
  execute(context: EventContext): void;
}

interface EventContext {
  worldState: WorldState;
  worldQuery: WorldQuery;
  gameTime: GameTime;
  triggeredEvents: ReadonlySet<GameEventId>;
}
```

같은 문서의 데이터 흐름 정의는 이벤트가 다음을 트리거해야 한다고 명시했다.

```text
Trigger
   ↓
Dialogue / Objective / Monster / NPC
```

그런데 `EventContext`에는 그 넷에 접근할 경로가 하나도 없다.

`execute(context): void`가 **아무것도 할 수 없는 구조**였다.

예를 들어 `EVENT_KITCHEN_REQUEST`는 요리사 대사를 띄우고, 목표를 바꾸고,
주방 건설을 해금해야 하는데 Context로는 그중 어느 것도 불가능했다.

## 결정

`execute` 가 **수행할 커맨드 목록을 반환**한다.

```ts
interface GameEventDefinition {
  id: GameEventId;
  once: boolean;
  canTrigger(context: EventContext): boolean;
  execute(context: EventContext): GameEventCommand[];
}
```

```ts
type GameEventCommand =
  | { kind: 'dialogue'; dialogueId: string }
  | { kind: 'markNpcHasDialogue'; role: NPCRole; dialogueId: string }
  | { kind: 'objective'; objective: Objective | null }
  | { kind: 'unlockBuilding'; type: BuildingType }
  | { kind: 'spawnMonsters'; count: number }
  | { kind: 'spawnResident'; role: NPCRole; at: GridPosition }
  | { kind: 'cameraFocus'; at: GridPosition; durationMs: number }
  | { kind: 'showMessage'; text: string };
```

`GameEventSystem`이 반환된 커맨드를 해당 시스템으로 전달한다.

`EventContext`는 전부 읽기 전용으로 만든다.
`WorldState` 인스턴스 대신 `compute()` 결과 스냅샷(`WorldStateView`)을 넣는다.

이벤트 정의 예시:

```ts
export const EVENT_KITCHEN_REQUEST: GameEventDefinition = {
  id: 'EVENT_KITCHEN_REQUEST',
  once: true,
  canTrigger: (ctx) => ctx.storage.crop >= 1,
  execute: () => [
    { kind: 'markNpcHasDialogue', role: 'cook', dialogueId: 'cook_wants_kitchen' },
    { kind: 'objective', objective: { id: 'build_kitchen', text: '요리사를 위해 주방을 지으세요.' } },
    { kind: 'unlockBuilding', type: 'kitchen' },
  ],
};
```

## 검토한 대안

**A. EventContext 에 시스템 참조를 추가한다**

```ts
interface EventContext {
  dialogueSystem: DialogueSystem;
  objectiveSystem: ObjectiveSystem;
  monsterSystem: MonsterSystem;
  npcFactory: NPCFactory;
  // ...
}
```

문제:

- 이벤트 정의가 순수 함수가 아니게 된다.
  테스트하려면 4개 이상의 시스템을 mock해야 한다.
- 이벤트 정의가 `DialogueSystem`을 직접 호출하면
  "UI와 Domain Logic을 직접 연결하지 않는다" 규칙에 접근한다.
  (`FarmSystem → DialogueBox` 금지와 같은 성질의 결합)
- 이벤트가 무엇을 하는지 알려면 `execute` 본문을 읽어야 한다.
- Context가 커질수록 새 이벤트를 만들 때 무엇을 넣어야 할지 불명확해진다.

**B. EventBus 로만 통신한다**

`execute`가 `eventBus.emit()`만 호출하고 각 시스템이 구독한다.

문제:

- 모든 진행 동작마다 이벤트 타입을 정의해야 한다.
  `OBJECTIVE_SET`, `BUILDING_UNLOCK_REQUESTED`, `MONSTERS_SPAWN_REQUESTED`...
- "EventBus는 도메인 사건에만 사용한다"는 원칙에 반한다.
  이것은 사건이 아니라 명령이다.
- 실행 순서를 보장할 수 없다. 대사를 띄운 뒤 목표를 바꾸고 싶을 때
  구독자의 등록 순서에 의존하게 된다.

**C. execute 가 커맨드 목록을 반환한다**

채택.

**D. 이벤트마다 전용 클래스를 만들고 의존성을 생성자로 주입한다**

```ts
class KitchenRequestEvent {
  constructor(private dialogue: DialogueSystem, private objective: ObjectiveSystem) {}
}
```

문제:

- 이벤트 6개에 각각 생성자 배선이 필요해진다.
- A안과 같은 테스트 비용 문제가 남는다.
- 데이터 파일(`data/events.ts`)에 선언적으로 둘 수 없다.

## 예상되는 결과

긍정적:

- **이벤트 정의가 순수 함수가 된다.** 테스트가 입출력 비교로 끝난다.

  ```ts
  expect(EVENT_KITCHEN_REQUEST.canTrigger(makeContext({ crop: 0 }))).toBe(false);
  expect(EVENT_KITCHEN_REQUEST.canTrigger(makeContext({ crop: 1 }))).toBe(true);
  ```

- **이벤트가 무엇을 하는지 정의만 읽고 알 수 있다.** 커맨드 목록이 곧 명세다.
- 커맨드 실행 순서가 배열 순서로 보장된다.
- `GameEventSystem` 한 곳에서만 시스템을 참조하므로 결합점이 하나로 모인다.
- 새 진행 동작이 필요하면 커맨드 종류를 하나 추가하면 된다.
  이벤트 정의의 시그니처는 바뀌지 않는다.

부정적 / 위험:

- 커맨드 종류와 그것을 실행하는 dispatch 코드가 추가된다.
  이벤트 6개 규모에서는 부담이 작다.
- 커맨드 실행 결과를 이벤트 정의가 알 수 없다.
  조건부 후속 동작이 필요하면 별도 이벤트로 분리해야 한다.
  MVP의 6개 이벤트에는 그런 경우가 없다.
- `GameEventCommand` 유니온이 커지면 dispatch의 switch문이 길어진다.
  커맨드가 10개를 넘으면 재검토한다.
