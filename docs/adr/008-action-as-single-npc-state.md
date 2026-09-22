# ADR 008. NPC 의 상태는 현재 Action 이며 별도의 state 필드를 두지 않는다

Status: Accepted
Date: 2026-09-22

## 배경

초기 문서에는 두 개의 상태 표현이 동시에 존재했다.

`MVP_SPEC.md`:

```ts
type NPCState =
  | 'idle' | 'moving' | 'working' | 'eating'
  | 'sleeping' | 'fleeing' | 'talking';
```

`ARCHITECTURE.md`:

```text
IdleAction / MoveToAction / FarmAction / HarvestAction /
CollectCropAction / CookAction / EatAction / SleepAction /
FleeAction / TalkAction
```

그리고 다음 규칙이 있었다.

```text
88장   NPC 상태도 가능하면 NPCSystem 을 통해 변경한다
       npcSystem.setState(npc, 'fleeing');
```

Action과 State의 매핑 규칙은 어디에도 정의되지 않았다.

`HarvestAction`이 실행 중일 때 `npc.state`가 `'working'`인지
`'moving'`인지 문서만으로는 알 수 없었다.

Action 구조를 도입한 이유는 다음 switch문을 없애는 것이었다.

```ts
switch (npc.state) {
  case 'idle': ...
  case 'moving': ...
  case 'working': ...
}
```

그런데 State 필드를 남기면 **`Action → State` 매핑 switch문이 새로 생긴다.**
문제를 옮긴 것에 불과하다.

## 결정

`npc.state` 필드를 **두지 않는다.**

NPC의 상태는 현재 실행 중인 Action이다.

```ts
export class NPC {
  currentAction: NPCAction;

  get stateLabel(): NPCStateLabel {
    return this.currentAction.stateLabel;
  }
}
```

각 Action이 표시용 라벨을 스스로 제공한다.

```ts
export interface NPCAction {
  readonly kind: NPCActionKind;
  readonly stateLabel: NPCStateLabel;

  start(npc: NPC, context: NPCContext): void;
  update(npc: NPC, delta: number): ActionStatus;
  cancel(npc: NPC): void;
}
```

`setState`는 존재하지 않는다. 상태를 바꾸려면 Action을 교체한다.

```ts
npcSystem.setAction(npc, new FleeAction(safePosition));
```

`setAction`은 `cancel → 대입 → start` 순서를 보장한다.

`types/npc.ts`에 `NPCState`를 정의하지 않고 `NPCStateLabel`만 둔다.

관련 결정:

- `FarmAction`을 `PlantAction`과 `HarvestAction`으로 분리한다.
  두 행동의 조건과 결과가 완전히 다르다.
- `CollectCropAction`을 두지 않는다.
  작물이 `VillageStorage`의 숫자이므로 "가져오는" 단계에 상태 변화가 없다.
- `SleepAction`과 `RestAction`을 분리한다.
  침대가 없는 NPC는 잠들지 않고 광장에 앉아 있으며, 화면에 계속 보여야 한다.
- 복합 Action(`MoveToAndPlantAction` 등)을 만들지 않는다.
  이동이 끝나면 Decision을 다시 수행한다.

## 검토한 대안

**A. State 를 유지하고 Action 이 진입 시 설정한다**

```ts
class HarvestAction {
  start(npc: NPC) {
    npc.state = 'working';
  }
}
```

문제:

- 진실의 원천이 두 개다. `cancel`에서 되돌리는 것을 잊으면 어긋난다.
- Action을 추가할 때마다 State 설정을 잊지 않아야 한다.
  컴파일러가 잡아주지 않는다.
- 어느 쪽을 읽어야 하는지 규칙이 필요하다.

**B. State 만 유지하고 Action 을 없앤다**

거대한 switch문으로 돌아간다. Action 구조를 도입한 이유가 사라진다.

**C. Action 이 유일한 원천이고 State 는 getter 다**

채택.

**D. State 를 Action 의 kind 로 직접 사용한다**

`stateLabel`을 두지 않고 `currentAction.kind`를 애니메이션에 그대로 쓴다.

문제:

- `PlantAction`과 `HarvestAction`이 같은 작업 애니메이션을 쓰는데
  `kind`가 다르므로 애니메이션 매핑에 다시 switch문이 필요하다.
- `stateLabel`을 두면 여러 Action이 같은 라벨을 공유할 수 있다.

## 예상되는 결과

긍정적:

- 상태 불일치 버그가 구조적으로 발생하지 않는다.
- Action을 추가할 때 `stateLabel`이 필수 필드이므로 컴파일러가 누락을 잡는다.
- Debug Panel과 애니메이션이 같은 값을 읽으므로 화면과 디버그 표시가 항상 일치한다.
- Action 교체 지점이 `setAction` 한 곳이므로 전이 로그를 한 군데서 찍을 수 있다.

부정적 / 위험:

- `npc.stateLabel`이 getter이므로 값을 캐시하려는 코드가 생길 수 있다.
  Action 교체 후 캐시를 갱신하지 않으면 어긋난다. 캐시하지 않는 것을 규칙으로 한다.
- Action 객체를 매번 새로 생성하므로 할당이 발생한다.
  NPC 3~4명 규모에서는 무시할 수 있다. 문제가 확인되면 재사용을 검토한다.
- `SaveData`에 Action을 저장하지 않으므로 불러온 직후 행동이 처음부터 시작된다.
  농부가 밭으로 다시 걸어가는 것은 자연스러우므로 문제가 되지 않는다.
