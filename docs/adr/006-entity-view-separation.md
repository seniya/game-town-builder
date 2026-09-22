# ADR 006. Entity 를 순수 데이터로 만들고 렌더링을 EntityView 로 분리한다

Status: Accepted
Date: 2026-09-22

## 배경

초기 아키텍처 문서의 `NPC` 정의는 다음과 같았다.

```ts
export class NPC {
  readonly id: string;
  state: NPCState = 'idle';

  constructor(
    public readonly sprite: Phaser.GameObjects.Sprite,
    public readonly role: NPCRole
  ) {}
}
```

같은 문서가 다음 두 가지를 요구했다.

```text
75장   Inventory, WorldState, GameClock, BuildValidation, A*,
       NPC Decision, Farm 상태를 Phaser 와 분리한다
77장   NPCDecisionSystem 을 우선 테스트 대상으로 한다
```

그런데 `NPCDecisionSystem`을 테스트하려면 `NPC` 인스턴스가 필요하고,
`NPC`를 만들려면 `Phaser.GameObjects.Sprite`가 필요하다.

Sprite를 만들려면 Phaser Scene이, Scene을 만들려면 Canvas와 WebGL 컨텍스트가
필요하다.

즉 **Vitest 에서 NPC 판단 로직을 테스트할 수 없는 구조**였다.

문서가 요구하는 테스트 전략 전체가 이 한 줄의 생성자 때문에 성립하지 않았다.

## 결정

Entity를 **Phaser 를 import 하지 않는 순수 데이터**로 정의한다.

```ts
// src/game/entities/npc/NPC.ts — Phaser import 없음
export class NPC {
  currentAction: NPCAction;
  view: EntityView | null = null;

  constructor(
    readonly id: EntityId,
    readonly role: NPCRole,
    public tile: GridPosition
  ) {
    this.currentAction = new IdleAction();
  }

  get stateLabel(): NPCStateLabel {
    return this.currentAction.stateLabel;
  }
}
```

렌더링은 `EntityView` 인터페이스가 담당한다.

```ts
export interface EntityView {
  setPosition(position: WorldPosition): void;
  playAnimation(name: string): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}
```

Phaser 구현체는 `PhaserSpriteView`이며 `src/game/views/`에 둔다.

`Player`, `Monster`도 같은 패턴을 사용한다.

Entity의 `tile`이 위치의 진실의 원천이고, View가 그것을 따라간다.
Sprite 좌표를 읽어서 게임 로직을 판단하지 않는다.

계층도에서 `Entities`를 `World Model` 아래로 내린다.
Entity가 순수 데이터이므로 `WorldQuery`가 Entity를 참조해도
"아래 계층에만 의존한다" 규칙을 위반하지 않는다.

## 검토한 대안

**A. 테스트에서 Phaser Sprite 를 mock 한다**

```ts
const fakeSprite = { x: 0, y: 0, play: () => {} } as unknown as Phaser.GameObjects.Sprite;
```

문제:

- `as unknown as`는 문서가 금지한 타입 우회에 해당한다.
- Sprite의 어떤 필드를 쓰는지 알아야 mock을 만들 수 있어
  테스트가 구현 세부에 결합된다.
- Phaser 버전이 바뀌면 mock이 깨진다.

**B. 테스트에서 Phaser Headless 모드를 띄운다**

Phaser는 `Phaser.HEADLESS` 렌더 타입을 제공한다.

문제:

- 테스트마다 Game 인스턴스 생성·파괴 비용이 발생한다.
- jsdom 환경 설정이 필요해지고 Vitest 실행이 느려진다.
- 순수 계산 함수를 테스트하는 데 게임 엔진을 띄우는 것은 과하다.

**C. Entity 에서 sprite 를 선택적 필드로 분리한다**

채택.

**D. ECS 를 도입한다**

Component를 분리하면 자연히 데이터와 렌더가 나뉜다.

문제:

- 문서가 명시적으로 ECS 도입을 금지한다.
- NPC 3~4명 규모에서 ECS의 이득이 없고 코드 탐색 비용만 늘어난다.

## 예상되는 결과

긍정적:

- `NPCDecisionSystem` 테스트를 객체 리터럴 하나로 작성할 수 있다.

  ```ts
  const npc = new NPC('npc_farmer_001', 'farmer', { x: 10, y: 10 });
  ```

- 계층도의 의존성 모순이 해소된다.
- Phaser 4 이전이나 렌더러 교체 시 Entity 코드를 수정하지 않는다.
- Entity를 직렬화하기 쉬워 `SaveData` 변환이 단순해진다.

부정적 / 위험:

- `Entity.tile` 변경 후 `view.setPosition()` 호출을 잊으면
  화면과 논리 위치가 어긋난다.
  `MovementController`가 같은 프레임에 둘을 함께 갱신하는 규칙을 둔다.
- Factory가 Entity와 View를 조립하는 단계가 추가된다.
- `view`가 `null`일 수 있어 렌더 호출 시 null 체크가 필요하다.
  대신 이것이 테스트에서 View 없이 동작 가능한 이유이기도 하다.
