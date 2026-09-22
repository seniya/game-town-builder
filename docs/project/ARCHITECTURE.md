# ARCHITECTURE.md

# Small Village Restoration Game — Architecture Guide

Version: 0.3
Status: MVP Architecture Baseline (2차 정합성 정리 반영)
Related Documents:

```text
docs/project/GAME_DESIGN.md
docs/project/MVP_SPEC.md
docs/project/ARCHITECTURE.md
docs/project/TASKS.md
docs/adr/
```

이 문서는 **인터페이스와 구조의 정본**이다.

수치와 조건식의 정본은 `MVP_SPEC.md`이다.

---

# 1. 문서 목적

이 문서는 `MVP_SPEC.md`에 정의된 기능을 실제 코드 구조로 구현하기 위한 아키텍처 기준을 정의한다.

이 문서의 목적은 다음과 같다.

```text
1. Scene에 모든 로직이 집중되는 것을 방지한다.
2. 시스템별 책임을 명확하게 분리한다.
3. NPC, 건설, 이벤트, 시간 시스템의 결합도를 낮춘다.
4. 게임 로직을 가능한 한 Phaser에서 분리한다.
5. AI 코딩 에이전트가 일관된 구조로 코드를 작성하도록 한다.
6. 향후 기능 확장 시 기존 코드를 대규모로 수정하지 않도록 한다.
```

MVP에서는 완벽한 범용 게임 프레임워크를 만드는 것이 목적이 아니다.

가장 중요한 목표는 다음이다.

> 현재 필요한 기능을 단순하고 명확하게 구현하면서도, 시스템 간 직접 결합을 최소화한다.

---

# 2. 전체 구조

게임 구조는 크게 다음 다섯 계층으로 나눈다.

```text
┌──────────────────────────────────────────┐
│  Presentation                            │
│  Phaser Scene / UI / EntityView          │
├──────────────────────────────────────────┤
│  Systems                                 │
│  AI / Building / Clock / Event / ...     │
├──────────────────────────────────────────┤
│  World Model                             │
│  State / Query / Navigation / Registry   │
├──────────────────────────────────────────┤
│  Entities (Pure Data)                    │
│  Player / NPC / Monster / Building       │
├──────────────────────────────────────────┤
│  Data                                    │
│  Config / Balance / Content              │
└──────────────────────────────────────────┘
```

각 계층은 **아래 계층에만** 의존한다.

반대 방향의 의존성을 만들지 않는다.

## 2.1 Entities 를 World Model 아래에 두는 이유

이전 판의 계층도는 `Entities`를 `Systems` 위에 두었다.

그 배치는 이 문서의 규칙을 스스로 위반한다.

```text
WorldQuery (World Model) 는 EntityRegistry 를 탐색한다
    ↓
World Model 이 위쪽 계층인 Entities 를 참조한다
    ↓
"아래 계층에만 의존한다" 위반
```

Entity를 **Phaser 의존성이 없는 순수 데이터**로 정의하면(9장)
Entity는 사실상 Data에 가까운 계층이 되고 배치 모순이 사라진다.

화면 표현은 Entity가 아니라 `EntityView`가 담당하며, 이는 Presentation 계층이다.

---

# 3. 핵심 의존성 방향

기본 의존성 방향은 다음과 같다.

```text
Scene
  ↓
Systems
  ↓
World
  ↓
Data
```

Entity는 Systems에 의해 제어된다.

```text
Systems
  ↓
Entities
```

Entity가 System을 직접 호출하는 구조는 지양한다.

예:

잘못된 구조:

```text
FarmerNPC
  ↓
FarmSystem
  ↓
KitchenSystem
  ↓
EventSystem
```

권장 구조:

```text
NPCSystem
   ↓
Farmer Entity

BuildingSystem
   ↓
EventBus

NPCSystem
   ↑
EventBus
```

---

# 4. 전체 런타임 구성

게임 실행 시 주요 객체 관계는 다음과 같다.

```text
WorldScene
│
├─ EventBus
├─ WorldState
├─ WorldQuery
├─ NavigationGrid
│
├─ GameClockSystem
├─ InventorySystem
├─ InteractionSystem
├─ BuildingSystem
├─ NPCSystem
├─ ResourceSystem
├─ MonsterSystem
├─ GameEventSystem
├─ SaveSystem
│
├─ Player
├─ NPC[]
├─ Monster[]
├─ ResourceNode[]
└─ Building[]
```

`WorldScene`은 이 객체들을 생성하고 연결한다.

구체적인 게임 판단은 각 System이 담당한다.

---

# 5. WorldScene 책임

`WorldScene`의 책임은 제한한다.

허용되는 책임:

```text
- Map 생성
- Entity 생성
- System 초기화
- Phaser Lifecycle 연결
- 각 System update 호출
- Camera 초기화
- Scene-level asset 연결
```

금지되는 책임:

```text
- NPC 행동 결정
- 건설 가능 여부 판단
- 이벤트 조건 판단
- 자원 계산
- WorldState 변경 규칙
- Pathfinding 알고리즘
- NPC 스케줄 판단
```

권장 형태:

```ts
export class WorldScene extends Phaser.Scene {
  private gameWorld!: GameWorld;

  create() {
    this.gameWorld = new GameWorld(this);
    this.gameWorld.initialize();
  }

  update(_time: number, delta: number) {
    this.gameWorld.update(delta);
  }
}
```

가능하면 `WorldScene`은 얇게 유지한다.

---

# 6. GameWorld

`GameWorld`는 WorldScene과 실제 게임 시스템 사이의 Coordinator 역할을 한다.

위치:

```text
src/game/world/GameWorld.ts
```

책임:

```text
- WorldState 생성
- EventBus 생성
- Entity Registry 생성
- System 초기화
- System 의존성 연결
- 시스템 update 순서 관리
```

예:

```ts
export class GameWorld {
  constructor(private readonly scene: Phaser.Scene) {}

  initialize(): void {
    // create shared services
    // create systems
    // create entities
  }

  update(delta: number): void {
    // update systems in fixed order
  }
}
```

`GameWorld` 역시 실제 Gameplay 규칙을 직접 구현하지 않는다.

---

# 7. EventBus

시스템 간 결합도를 낮추기 위해 EventBus를 사용한다.

위치:

```text
src/game/core/EventBus.ts
```

MVP에서는 자체적인 간단한 EventBus를 사용한다.

복잡한 외부 이벤트 라이브러리는 사용하지 않는다.

기본 Interface:

```ts
export interface GameEventMap {
  // ── 건설 ───────────────────────────────────────
  BUILDING_PLACED: { buildingId: EntityId; type: BuildingType };
  BUILDING_UNLOCKED: { type: BuildingType };
  NAVIGATION_CHANGED: { tiles: GridPosition[] };

  // ── 생산 ───────────────────────────────────────
  CROP_PLANTED: { farmId: EntityId };
  CROP_HARVESTED: { farmId: EntityId; amount: number };
  FOOD_COOKED: { amount: number };
  MEAL_EATEN: { npcId: EntityId; amount: number };

  // ── 위험 ───────────────────────────────────────
  MONSTER_SPAWNED: { monsterId: EntityId };
  MONSTER_THREAT_STARTED: void;
  MONSTER_THREAT_ENDED: void;
  VILLAGE_BREACHED: void;

  // ── 진행 ───────────────────────────────────────
  GAME_EVENT_TRIGGERED: { id: GameEventId };
  DIALOGUE_ENDED: { dialogueId: string };
  NEW_RESIDENT_ARRIVED: { npcId: EntityId };

  // ── 표시 갱신 (UI 전용) ─────────────────────────
  INVENTORY_CHANGED: { inventory: Readonly<InventoryState> };
  STORAGE_CHANGED: { storage: Readonly<VillageStorage> };
  WORLD_STATE_CHANGED: { state: WorldStateView };
  OBJECTIVE_CHANGED: { objective: Objective | null };
  GAME_HOUR_CHANGED: { time: GameTime; phase: DayPhase };
}
```

## 7.1 건물별 이벤트를 하나로 통합한다

이전 판에는 `FARM_BUILT` / `KITCHEN_BUILT` / `HOUSE_BUILT` / `BARRIER_BUILT`
4개가 별도로 있었다.

페이로드가 동일하므로 `BUILDING_PLACED { type }` 하나로 통합한다.

건물이 추가될 때마다 이벤트를 늘리지 않아도 된다.

## 7.2 payload 가 없는 이벤트

`void` 페이로드 이벤트는 `emit`에 두 번째 인자를 요구하지 않는다.

```ts
type VoidEventKey<M> = {
  [K in keyof M]: M[K] extends void ? K : never;
}[keyof M];

export class EventBus<TEventMap> {
  on<K extends keyof TEventMap>(
    event: K,
    listener: (payload: TEventMap[K]) => void
  ): void;

  off<K extends keyof TEventMap>(
    event: K,
    listener: (payload: TEventMap[K]) => void
  ): void;

  emit<K extends VoidEventKey<TEventMap>>(event: K): void;
  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void;
}
```

이전 판의 `MONSTER_THREAT_STARTED: undefined`와 필수 payload 시그니처는
호출할 때마다 다음을 쓰게 만들었다.

```ts
// 이전 판에서 강제되던 형태
eventBus.emit('MONSTER_THREAT_STARTED', undefined);
```

오버로드를 두면 다음처럼 쓸 수 있다.

```ts
eventBus.emit('MONSTER_THREAT_STARTED');
```

---

# 8. EventBus 사용 원칙

EventBus는 모든 것을 연결하는 전역 메시지 버스로 사용하지 않는다.

사용하기 좋은 경우:

```text
- 건물이 완성됨
- 주요 이벤트가 발생함
- 위험 상태가 시작됨
- 작물이 생산됨
- 음식이 완성됨
```

사용하지 않는 경우:

```text
- 매 프레임 Player Position 전달
- NPC의 모든 이동
- 시스템 내부 세부 동작
- 단순 함수 호출로 충분한 경우
```

## 8.1 표시 갱신 이벤트는 예외로 허용한다

`*_CHANGED` 이벤트는 도메인 사건이 아니지만 허용한다.

```text
INVENTORY_CHANGED
STORAGE_CHANGED
WORLD_STATE_CHANGED
OBJECTIVE_CHANGED
GAME_HOUR_CHANGED
```

이유는 UI가 매 프레임 Registry를 탐색하는 것을 막기 위해서다(58장).

규칙은 두 가지다.

```text
1. UI 는 구독만 한다. UI 는 emit 하지 않는다.
2. 값이 실제로 바뀐 프레임에만 emit 한다. 매 프레임 emit 하지 않는다.
```

`GAME_HOUR_CHANGED`는 이름 그대로 **시(hour)가 바뀔 때만** 발행한다.

분 단위로 발행하면 도메인 사건이 아니라 프레임 신호가 된다.

즉, EventBus는 "도메인 사건"과 "값 변경 통지"에만 사용한다.

---

# 9. Entity 구조

모든 Entity는 가능한 한 단순하게 유지한다.

주요 Entity:

```text
Player
NPC
Monster
ResourceNode
Building
Crop
```

Entity는 다음을 포함할 수 있다.

```text
- ID
- Tile Position
- 현재 Action
- 간단한 데이터
- EntityView 참조 (선택)
```

Entity는 복잡한 판단을 하지 않는다.

## 9.1 Entity 는 Phaser 를 import 하지 않는다

```ts
// src/game/entities/npc/NPC.ts
// Phaser import 없음

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

  /** 표시용 상태 라벨. 별도 state 필드를 두지 않는다. */
  get stateLabel(): NPCStateLabel {
    return this.currentAction.stateLabel;
  }
}
```

## 9.2 EntityView

화면 표현은 Entity가 아니라 `EntityView`가 담당한다.

위치:

```text
src/game/views/EntityView.ts
src/game/views/PhaserSpriteView.ts
```

```ts
export interface EntityView {
  setPosition(position: WorldPosition): void;
  playAnimation(name: string): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}
```

```ts
export class PhaserSpriteView implements EntityView {
  constructor(private readonly sprite: Phaser.GameObjects.Sprite) {}
  // ...
}
```

`Player`, `Monster`도 같은 패턴을 사용한다.

## 9.3 왜 분리하는가

이전 판의 `NPC`는 생성자에서 `Phaser.GameObjects.Sprite`를 필수로 요구했다.

그러면 다음이 불가능해진다.

```text
75장   "NPC Decision 을 Phaser 와 분리한다"
77장   "NPCDecisionSystem 을 우선 테스트한다"
```

`NPCDecisionSystem`을 테스트하려면 `NPC` 인스턴스가 필요하고,
`NPC`를 만들려면 Phaser Scene과 Sprite가 필요해진다.

Vitest에서 Phaser를 띄우는 것은 MVP 테스트 전략과 맞지 않다.

`view`를 선택적 필드로 분리하면 테스트에서는 다음으로 충분하다.

```ts
const npc = new NPC('npc_farmer_001', 'farmer', { x: 10, y: 10 });
// view 는 null. 판단 로직 테스트에 렌더링이 필요하지 않다.
```

## 9.4 위치 동기화

Entity의 `tile`이 진실의 원천이고, View는 그것을 따라간다.

```text
MovementController 가 entity.tile 과 보간 위치를 갱신
    ↓
같은 프레임에서 view.setPosition(gridToWorldCenter(...)) 호출
```

View가 위치를 소유하지 않는다.

Sprite 좌표를 읽어서 게임 로직을 판단하지 않는다.

---

# 10. Entity ID

모든 주요 Entity는 고유 ID를 가진다.

예:

```text
npc_farmer_001
npc_cook_001
building_farm_001
monster_001
```

ID는 저장, 이벤트, 조회에 사용한다.

가능하면 runtime object reference보다 ID를 장기 참조에 사용한다.

---

# 11. EntityRegistry

현재 World에 존재하는 Entity를 중앙에서 조회할 수 있도록 `EntityRegistry`를 둔다.

위치:

```text
src/game/world/EntityRegistry.ts
```

예:

```ts
interface EntityRegistry {
  players: Map<string, Player>;
  npcs: Map<string, NPC>;
  monsters: Map<string, Monster>;
  buildings: Map<string, Building>;
  resources: Map<string, ResourceNode>;
}
```

EntityRegistry는 Entity를 소유하는 거대한 Manager가 아니다.

조회와 등록/삭제만 담당한다.

---

# 12. WorldState

`WorldState`는 마을 전체의 추상적 상태를 **계산해서 제공한다.**

위치:

```text
src/game/world/WorldState.ts
```

```ts
export interface WorldStateView {
  readonly foodLevel: number;       // 0 ~ 100
  readonly safetyLevel: number;     // 0 ~ 100
  readonly housingLevel: number;    // 0 ~ 100
  readonly happinessLevel: number;  // 0 ~ 100
  readonly population: number;
}
```

## 12.1 WorldState 는 상태를 저장하지 않는다

`WorldState`는 필드를 갖지 않는 **순수 계산기**다.

```ts
export class WorldState {
  constructor(
    private readonly registry: EntityRegistry,
    private readonly storage: VillageStorage,
    private readonly gate: VillageGate,
    private readonly balance: typeof GAME_BALANCE
  ) {}

  /** 현재 마을 상태로부터 지표를 계산한다. */
  compute(): WorldStateView;
}
```

변경 API를 제공하지 않는다.

```text
increaseFood()      없다
increaseSafety()    없다
increaseHousing()   없다
setPopulation()     없다
```

## 12.2 계산식

계산식과 수치의 정본은 `MVP_SPEC.md` 42장이다.

```text
foodLevel      storage.food / (population * mealsPerDay * foodPerMeal * targetDays)
safetyLevel    막힌 입구 타일 수 / balance.village.gateTiles
housingLevel   전체 침대 수 / population
happinessLevel foodLevel*0.4 + housingLevel*0.3 + safetyLevel*0.3
population     registry.npcs.size
```

전부 `Math.round` 후 `clamp(0, 100)`을 적용하며, `population`은 예외다.

`Math.round`는 0.5를 올림한다(half-up).

`happinessLevel`은 가중 평균이므로 `.5`가 자주 발생하므로
다른 반올림 방식을 쓰면 테스트가 환경에 따라 실패한다.
(`MVP_SPEC.md` 42.2.1)

`population == 0`이면 `foodLevel`과 `housingLevel`은 `0`을 반환한다.

0으로 나누지 않도록 반드시 가드를 둔다.

## 12.3 순수 함수로 분리한다

계산 본체는 클래스 밖의 순수 함수로 둔다.

```ts
export function computeWorldState(input: {
  population: number;
  food: number;
  bedCount: number;
  blockedGateTiles: number;
  gateTiles: number;
  balance: WorldStateBalance;
}): WorldStateView;
```

이렇게 하면 `EntityRegistry`나 Phaser 없이 테스트할 수 있다.

```text
Given population=3, food=12, bedCount=3, blockedGateTiles=5, gateTiles=5
Then foodLevel=67, housingLevel=100, safetyLevel=100, happinessLevel=87
```

## 12.4 왜 파생값으로 바꾸었는가

이전 판은 `WorldState`가 값을 저장하고 `increaseSafety()` 등으로 변경하는 구조였다.

세 가지 모순이 있었다.

**1. 건물 효과 키가 필드명과 일치하지 않았다**

```text
필드      foodLevel, safetyLevel, housingLevel, happinessLevel
건물 효과  foodProduction, foodEfficiency, happiness, housing, safety
```

`worldStateEffects: Partial<WorldStateData>`는 `WorldStateData`의 키만 허용하므로
`foodProduction`과 `foodEfficiency`를 표현할 수 없었다.

또한 `increaseHappiness()`가 정의되어 있지 않았다.

**2. 지표가 내려갈 수 없었다**

건설로만 증가하므로 값은 단조 증가한다.

`foodLevel < 20` 조건은 구조적으로 발생 불가능했다.

**3. population 이 두 곳에 존재했다**

`WorldState.population`과 `EntityRegistry.npcs.size`의 동기화 주체가 없었다.

105장의 `WorldState ≠ EntityRegistry` 경계를 스스로 위반했다.

파생값으로 만들면 세 문제가 동시에 사라진다.

관련 ADR:

```text
docs/adr/004-worldstate-as-derived-projection.md
```

## 12.5 캐싱

`compute()`는 매 프레임 호출해도 문제없을 만큼 가볍다.

그래도 UI 갱신을 위해 값이 바뀐 프레임만 감지해야 한다.

```text
GameWorld.update 끝에서 compute() 를 1회 호출
    ↓
이전 프레임 결과와 비교
    ↓
다르면 WORLD_STATE_CHANGED emit
```

시스템마다 `compute()`를 중복 호출하지 않는다.

---

# 13. WorldQuery

다른 시스템이 월드 정보를 직접 뒤지는 것을 방지하기 위해 `WorldQuery`를 둔다.

위치:

```text
src/game/world/WorldQuery.ts
```

```ts
export interface WorldQuery {
  // ── 건물 ────────────────────────────────────────
  findNearestBuilding(from: GridPosition, type: BuildingType): Building | null;
  countBuildings(type: BuildingType): number;

  // ── 침대 배정 ───────────────────────────────────
  /** 전체 침대 수. 집들의 residentCapacity 합계. */
  getBedCount(): number;
  /**
   * 이 NPC 에게 배정된 침대. 없으면 null. NPC id 순서로 결정적으로 배정.
   * door = house.origin + BUILDINGS.house.entranceOffset (24.2)
   */
  getAssignedBed(npcId: EntityId): { houseId: EntityId; door: GridPosition } | null;

  // ── 마을 입구 ───────────────────────────────────
  /** 입구 타일 목록. village_gate 기준 가로 gateTiles 칸. */
  getGateTiles(): readonly GridPosition[];
  /** 입구 타일 중 Barrier 로 막힌 수. safetyLevel 계산에 사용. */
  countBlockedGateTiles(): number;

  // ── 장소 ────────────────────────────────────────
  /** 마을 광장. 노숙 장소이자 몬스터의 목표인 마을 중심 타일 */
  getPlazaPosition(): GridPosition;
  findSafePosition(from: GridPosition): GridPosition | null;
  /** 주방이 있으면 주방 진입 타일, 없으면 plaza. null 을 반환하지 않는다 */
  findDiningSpot(): GridPosition;

  // ── 위험 ────────────────────────────────────────
  isThreatNear(position: GridPosition, radiusTiles: number): boolean;
}
```

## 13.1 findNearestFood 를 두지 않는다

이전 판에는 `findNearestFood(position): FoodSource | null`이 있었다.

MVP에서 음식은 월드에 놓인 오브젝트가 아니라 `VillageStorage.food` 숫자다.

따라서 위치를 검색할 대상이 없다.

음식 보유 여부는 `storage.food >= foodPerMeal`로 판정하고,
식사 장소는 `findDiningSpot()`이 제공한다.

```ts
findDiningSpot(): GridPosition {
  const kitchen = this.findNearestBuilding(plaza, 'kitchen');
  return kitchen ? entranceTileOf(kitchen) : this.getPlazaPosition();
}
```

주방이 있으면 주방의 진입 타일, 없으면 `plaza`를 반환한다.

`null`을 반환하지 않는다. `plaza`는 항상 존재하므로 반환할 값이 언제나 있고,
`null`을 허용하면 식사 판단에 의미 없는 분기가 하나 늘어난다.

규칙의 정본은 `MVP_SPEC.md` 39.2이다.

## 13.2 WorldQuery 는 조회만 한다

`getAssignedBed()`는 배정 결과를 **계산해서 반환**하며, 어떤 상태도 기록하지 않는다.

배정을 NPC id 순서로 결정적으로 수행하므로 호출할 때마다 같은 결과가 나온다.

같은 상황에서 매번 다른 NPC가 노숙하면 재현과 디버깅이 불가능해진다.

NPCSystem은 Registry 내부 구조를 직접 탐색하지 않고 WorldQuery를 사용한다.

---

# 14. GridPosition

Tile 기반 게임이므로 Tile 좌표와 World 좌표를 구분한다.

```ts
export interface GridPosition {
  x: number;
  y: number;
}
```

```ts
export interface WorldPosition {
  x: number;
  y: number;
}
```

공통 변환 Utility:

```ts
/** 타일의 좌상단 월드 좌표. x*32, y*32 */
gridToWorldTopLeft(position: GridPosition): WorldPosition;

/** 타일의 중심 월드 좌표. x*32+16, y*32+16 */
gridToWorldCenter(position: GridPosition): WorldPosition;

/** floor(x/32), floor(y/32) */
worldToGrid(position: WorldPosition): GridPosition;
```

## 14.1 gridToWorld 라는 이름을 쓰지 않는다

기준점이 드러나지 않는 이름은 사용하지 않는다.

```text
gridToWorld(10, 5)   →  (320, 160) 인가 (336, 176) 인가?
```

호출부에서 기준점을 알 수 없으면 Sprite 배치와 충돌 판정이
한 타일씩 어긋나는 문제가 반드시 발생한다.

## 14.2 사용 규칙

```text
Sprite 배치        gridToWorldCenter
Tilemap 인덱싱      gridToWorldTopLeft
건물 origin        항상 좌상단 타일
```

건물 Sprite는 점유 영역 전체의 중심에 배치한다.

```ts
const topLeft = gridToWorldTopLeft(building.origin);
const center = {
  x: topLeft.x + (config.width * TILE_SIZE) / 2,
  y: topLeft.y + (config.height * TILE_SIZE) / 2,
};
```

두 좌표계를 혼용하지 않는다.

---

# 15. NavigationGrid

NPC와 Monster Pathfinding을 위해 NavigationGrid를 유지한다.

위치:

```text
src/game/world/NavigationGrid.ts
```

NavigationGrid가 관리하는 정보:

```text
MapCollision   맵의 Collision 레이어
Building       건물이 점유한 타일 (방벽 제외)
Barrier        방벽 타일
```

## 15.1 통행 레이어는 두 개다

```ts
export type PathActor = 'ground' | 'monster';

export interface NavigationGrid {
  isWalkable(position: GridPosition, actor: PathActor): boolean;

  setBuildingBlocked(tiles: readonly GridPosition[]): void;
  setBarrier(tiles: readonly GridPosition[]): void;
  /** 불러오기 시 그리드를 다시 만들 때만 사용한다. MVP 에 철거는 없다. */
  clear(tiles: readonly GridPosition[]): void;

  /** 그리드가 변경될 때마다 증가한다. 경로 무효화 판정에 사용. */
  readonly version: number;
}
```

```text
actor = 'ground'    Player / NPC.  Barrier 를 통과 가능으로 취급한다.
actor = 'monster'   Monster.       Barrier 를 Blocked 로 취급한다.
```

방벽이 몬스터만 막는 이유는 `MVP_SPEC.md` 29.1에 있다.

관련 ADR:

```text
docs/adr/005-barrier-blocks-monsters-only.md
```

`isWalkable`을 인자 없이 호출할 수 없게 만든다.

기본값을 두면 호출부가 어느 레이어를 의도했는지 알 수 없게 된다.

## 15.2 version 이 필요한 이유

건설로 그리드가 바뀌면 **이미 이동 중인** NPC와 Monster의 경로가 낡는다.

`version`을 비교해 낡은 경로를 감지한다. (17.2 참조)

---

# 16. PathfindingSystem

위치:

```text
src/game/systems/pathfinding/PathfindingSystem.ts
```

MVP에서는 A* 알고리즘을 사용한다.

입력:

```text
start
goal
NavigationGrid
```

출력:

```text
GridPosition[]
```

Pathfinding은 Phaser Sprite를 직접 이동시키지 않는다.

경로만 계산한다.

---

# 17. MovementController

실제 Entity 이동은 별도의 MovementController가 담당한다.

```ts
export interface PathFollow {
  path: readonly GridPosition[];
  index: number;
  goal: GridPosition;
  actor: PathActor;
  /** 경로를 계산한 시점의 NavigationGrid.version */
  navigationVersion: number;
}

export interface MovementController {
  follow(entity: MovableEntity, follow: PathFollow): void;
  update(entity: MovableEntity, delta: number): MoveStatus;
  stop(entity: MovableEntity): void;
}

export type MoveStatus = 'moving' | 'arrived' | 'blocked';
```

이렇게 하면 다음 책임이 분리된다.

```text
PathfindingSystem
= 어디로 갈지 경로 계산

MovementController
= 실제 이동 처리
```

## 17.1 도착 판정

```text
현재 위치와 다음 타일 중심의 거리 < balance.npc.arriveThresholdPx
    ↓
index++
```

마지막 타일에 도달하면 `arrived`를 반환한다.

## 17.2 경로 무효화와 재계산

건설로 그리드가 바뀌면 이미 진행 중인 경로를 반드시 다시 계산한다.

```text
BuildingSystem 이 NavigationGrid 를 변경
    ↓
NavigationGrid.version++
    ↓
NAVIGATION_CHANGED emit
    ↓
MovementController.update 가 매번 확인한다
      follow.navigationVersion !== grid.version ?
    ↓
불일치 → 현재 타일에서 goal 까지 재계산
    ↓
경로 있음  → follow 갱신, 계속 이동
경로 없음  → MoveStatus 'blocked' 반환
    ↓
호출한 Action 이 'failed' 로 종료
    ↓
NPCDecisionSystem 이 다음 행동을 다시 결정
```

## 17.3 왜 이 규칙이 필요한가

이전 판에는 이 규칙이 없었다.

그런데 80장은 "Barrier 추가 후 경로 변경" 테스트를 요구한다.

규칙이 없으면 다음이 발생한다.

```text
몬스터가 마을로 가는 경로를 계산했다
    ↓
플레이어가 그 경로 위에 방벽을 세웠다
    ↓
몬스터는 낡은 경로를 그대로 따라가 방벽을 통과한다
```

즉 방벽이 작동하지 않는다.

Acceptance Test 6이 실패하는 가장 흔한 원인이 이것이다.

## 17.4 재계산 빈도 제한

`NAVIGATION_CHANGED`가 연속으로 발생할 수 있다.
(방벽을 5개 연속 설치하는 경우)

같은 프레임에 여러 번 재계산하지 않도록 `balance.npc.repathIntervalSeconds`
간격으로만 재계산을 시도한다.

단, `blocked`가 확정된 경우는 즉시 Action을 종료한다.

---

# 18. Player 구조

Player는 다음 구성으로 분리한다.

```text
Player Entity
PlayerInputController
PlayerMovementController
InteractionSystem
InventorySystem
```

Player 클래스 안에 모든 입력 로직을 넣지 않는다.

---

# 19. InputSystem

위치:

```text
src/game/systems/input/InputSystem.ts
```

책임:

```text
- Keyboard 입력 읽기
- 이동 방향 계산
- Interaction 입력
- Build Mode 입력
```

InputSystem은 직접 게임 상태를 변경하지 않는다.

예:

```text
InputSystem
↓
PlayerMovement
```

또는

```text
InputSystem
↓
InteractionSystem
```

---

# 20. InteractionSystem

위치:

```text
src/game/systems/interaction/InteractionSystem.ts
```

책임:

```text
- 플레이어 주변 상호작용 대상 검색
- 가장 적절한 Interaction Target 선택
- E 입력 처리
- NPC 대화 시작
- Resource 채집 요청
```

InteractionSystem은 각각의 실제 행동을 해당 시스템에 위임한다.

예:

```text
InteractionSystem
    ↓
ResourceSystem.gather()

InteractionSystem
    ↓
DialogueSystem.start()
```

---

# 21. InventorySystem

위치:

```text
src/game/systems/inventory/InventorySystem.ts
```

Inventory는 수량 기반 Map으로 구현한다.

예:

```ts
type InventoryItemId =
  | 'wood'
  | 'stone'
  | 'seed';

type InventoryState = Record<InventoryItemId, number>;
```

주요 메서드:

```ts
add(item: InventoryItemId, amount: number): void;

remove(item: InventoryItemId, amount: number): boolean;

has(item: InventoryItemId, amount: number): boolean;

get(item: InventoryItemId): number;
```

UI가 Inventory 내부 데이터를 직접 수정해서는 안 된다.

---

# 22. ResourceSystem

위치:

```text
src/game/systems/resource/ResourceSystem.ts
```

책임:

```text
- Tree / Rock / Plant 채집
- 플레이어 Inventory 증가
- ResourceNode 상태 변경
- Respawn Timer 관리
```

ResourceNode는 자신이 직접 Respawn을 판단하지 않는다.

---

# 23. BuildingSystem

위치:

```text
src/game/systems/building/BuildingSystem.ts
```

책임:

```text
- Build Mode
- Ghost Preview
- 배치 위치 계산
- 자원 비용 확인
- 배치 가능 여부 판단
- 건물 생성
- NavigationGrid 갱신
- WorldState 반영
- Building Event 발생
```

---

# 24. BuildConfig

건물 관련 데이터는 `data/buildings.ts`에서 관리한다.

```ts
export interface BuildingConfig {
  type: BuildingType;
  width: number;
  height: number;
  cost: Partial<Record<InventoryItemId, number>>;

  /** NPC 가 서는 타일. origin 기준 상대 좌표. 점유 영역 바깥 */
  entranceOffset: GridPosition;

  /** 이 건물이 제공하는 침대 수. 집만 > 0 */
  residentCapacity: number;

  /** 이 건물이 몬스터의 통행을 막는가. 방벽만 true */
  blocksMonsters: boolean;
}
```

```ts
farm: {
  type: 'farm',
  width: 3,
  height: 3,
  cost: { wood: 6, stone: 2, seed: 3 },
  entranceOffset: { x: 1, y: 3 },
  residentCapacity: 0,
  blocksMonsters: false,
}
```

수치의 정본은 `MVP_SPEC.md` 77.2이다.

## 24.1 worldStateEffects 를 두지 않는다

이전 판에는 다음 필드가 있었다.

```ts
worldStateEffects: Partial<WorldStateData>;
```

이 필드는 사용하지 않는다.

`WorldState`가 파생값이므로 건물이 지표를 직접 올리지 않는다(12장).

건물은 **자신이 제공하는 기능**만 선언한다.

```text
residentCapacity    →  침대 수 →  housingLevel 이 계산된다
blocksMonsters      →  입구 커버리지 →  safetyLevel 이 계산된다
```

같은 숫자를 두 곳에서 관리하지 않으므로 어긋날 수 없다.

## 24.2 entranceOffset 이 필요한 이유

건물 타일은 두 통행 레이어 모두 Blocked 이므로 NPC 는 건물 위에 설 수 없다.

그런데 다음 네 곳이 모두 "건물의 어느 타일 앞" 을 필요로 한다.

```text
PlantAction / HarvestAction   농부가 서는 타일
CookAction                    요리사가 서는 타일
getAssignedBed().door         NPC 가 들어가 사라지는 타일
findDiningSpot()              주민이 모이는 타일
```

네 곳이 각자 다른 규칙으로 좌표를 계산하면 값이 어긋난다.

전부 한 식으로 계산한다.

```ts
const entrance = {
  x: building.origin.x + config.entranceOffset.x,
  y: building.origin.y + config.entranceOffset.y,
};
```

자세한 값은 `MVP_SPEC.md` 24.1에 있다.

---

# 25. Building Placement 흐름

건설 과정:

```text
Player presses B
↓
Build Menu
↓
Building 선택 (해금된 것만)
↓
Build Mode
↓
Mouse 위치 → worldToGrid → origin
↓
BuildValidator.validate({ config, origin, inventory })
↓
Valid / Invalid Preview  (Invalid 사유 표시)
↓
Click
↓
[Valid 인 경우에만 진행]
↓
BuildingFactory.createBuilding()
↓
Inventory 차감
↓
(Farm 인 경우) seed 비용을 VillageStorage.seed 로 이전
↓
Ruins 타일 제거
↓
EntityRegistry 등록
↓
NavigationGrid 갱신 (+ version++)
↓
NAVIGATION_CHANGED emit
↓
BUILDING_PLACED emit
↓
INVENTORY_CHANGED / STORAGE_CHANGED emit
```

## 25.1 클릭 이후 재검증하지 않는다

클릭 시점에는 Preview가 이미 Valid로 판정된 상태다.

자원 검사는 Preview 단계에서 끝났으므로 차감만 수행한다.

## 25.2 WorldState 를 직접 변경하지 않는다

이전 판의 흐름에는 `WorldState 변경` 단계가 있었다.

`WorldState`는 파생값이므로 건설이 직접 값을 바꾸지 않는다(12장).

`BUILDING_PLACED`와 `STORAGE_CHANGED` 이후 `GameWorld`가 `compute()`를 호출하면
지표가 자동으로 새 값을 반영한다.

---

# 26. BuildValidator

배치 판단은 BuildingSystem 내부에 길게 작성하지 않는다.

별도의 `BuildValidator`로 분리한다.

위치:

```text
src/game/systems/building/BuildValidator.ts
```

```ts
export interface BuildValidationInput {
  config: BuildingConfig;
  /** 점유 영역의 좌상단 타일 */
  origin: GridPosition;
  inventory: Readonly<InventoryState>;
  /** 마을 입구 타일. VillageGate.getGateTiles() */
  gateTiles: readonly GridPosition[];
}

export type BuildInvalidReason =
  | 'out_of_bounds'
  | 'map_collision'
  | 'overlaps_building'
  | 'outside_buildable_area'
  | 'blocks_village_gate'
  | 'insufficient_resources';

export interface BuildValidationResult {
  valid: boolean;
  reason?: BuildInvalidReason;
  /** insufficient_resources 인 경우 부족한 항목 */
  missing?: Partial<Record<InventoryItemId, number>>;
}

export function validate(input: BuildValidationInput): BuildValidationResult;
```

## 26.1 자원 검사는 Validator 안에서 한다

`inventory`를 입력으로 받는 이유는 자원 부족도 Invalid로 표시해야 하기 때문이다.

```text
MVP_SPEC 19장   Preview 판단 조건에 "필요한 Resource 가 있는가" 포함
81장            Build Validation 테스트에 "자원 부족 → Invalid" 포함
```

이전 판의 시그니처 `validate(config, position)`은 Inventory를 받지 않아
이 두 요구사항을 만족할 수 없었다.

또한 이전 판의 25장 흐름은 자원 확인을 클릭 **이후**에 두고 있었다.

그러면 다음이 발생한다.

```text
Ghost Preview 가 Valid (녹색) 로 표시된다
    ↓
플레이어가 클릭한다
    ↓
자원 부족으로 실패한다
```

Preview의 의미가 사라진다.

## 26.2 입구 타일은 방벽만 허용한다

```ts
const occupiesGate = occupiedTiles.some((t) =>
  gateTiles.some((g) => g.x === t.x && g.y === t.y)
);

if (occupiesGate && config.blocksMonsters !== true) {
  return { valid: false, reason: 'blocks_village_gate' };
}
```

입구 타일은 `BuildableArea` 안에 있어야 한다. 방벽을 세워야 하기 때문이다.

그런데 다른 건물까지 허용하면 두 가지 방식으로 게임이 진행 불능이 된다.

```text
집(4×4) 이 입구 4칸을 덮는다
    →  그 칸에 방벽을 세울 수 없다 (overlaps_building)
    →  safetyLevel 이 100 에 도달할 수 없다
    →  EVENT_NEW_RESIDENT 가 영원히 발생하지 않는다

밭(3×3) + 주방(2×2) 이 입구 5칸을 전부 덮는다
    →  건물 타일은 두 통행 레이어 모두 Blocked 다
    →  플레이어 · NPC · 새 주민 전원이 통과할 수 없다
```

둘 다 되돌릴 수 없다. MVP에는 철거가 없기 때문이다(`MVP_SPEC.md` 92장).

`blocksMonsters === true`인 건물은 방벽뿐이므로 조건 한 줄로 충분하다.

건물 종류나 입구 판정 규칙을 새로 만들지 않는다.

자세한 이유는 `MVP_SPEC.md` 19.2에 있다.

관련 ADR:

```text
docs/adr/009-village-gate-build-restriction.md
```

## 26.3 Ruins 는 막지 않는다

`Ruins` 레이어 타일은 어떤 Invalid 사유에도 해당하지 않는다.

폐허 위에 건설할 수 있어야 "무너진 밭을 복구한다"는 서사가 성립한다.
(`MVP_SPEC.md` 8.2)

## 26.4 순수 함수로 둔다

`validate`는 클래스가 아니라 순수 함수로 둔다.

Phaser, Scene, Registry에 의존하지 않고
`NavigationGrid`와 `BuildableArea`를 인자 또는 클로저로 받는다.

81장의 테스트를 Vitest에서 그대로 작성할 수 있어야 한다.

---

# 27. NPC 시스템 전체 구조

NPC 관련 구조:

```text
NPC Entity
     ↓
NPCSystem
     ↓
NPCDecisionSystem
     ↓
NPCSchedule
     ↓
NPCAction
     ↓
Pathfinding / Movement
```

NPC AI는 한 클래스 안에 전부 구현하지 않는다.

---

# 28. NPCSystem

위치:

```text
src/game/systems/npc/NPCSystem.ts
```

책임:

```text
- 전체 NPC update
- 현재 Action 진행
- Action 종료 확인
- 새로운 Decision 요청
- NPC 상태 변경
```

NPCSystem은 "무엇을 할 것인가"의 세부 판단을 직접 하지 않는다.

---

# 29. NPCDecisionSystem

위치:

```text
src/game/systems/npc/NPCDecisionSystem.ts
```

NPC의 다음 행동을 결정한다.

기본 우선순위는 **4단계**다. 자세한 내용과 이유는 30.3에 있다.

```text
1. 위험 회피    threatNearby
2. 필수 스케줄  식사 / 취침
3. 직업 행동    농사 / 요리 / 점검
4. 자유 행동    Idle / 광장 배회
```

```ts
decide(npc: NPC, context: NPCContext): NPCAction;
```

위에서 아래로 한 번만 평가한다. 위 단계가 성립하면 아래는 평가하지 않는다.

점수를 합산하지 않는다. Utility AI를 쓰지 않는다.

---

# 30. NPCContext

Decision이 필요한 정보는 Context 형태로 제공한다.

```ts
export interface NPCContext {
  readonly gameTime: GameTime;
  readonly dayPhase: DayPhase;
  /** Schedule 이 이 시각에 지정한 활동 */
  readonly scheduledActivity: ScheduledActivity;

  // ── 위험 ────────────────────────────────────────
  readonly threatNearby: boolean;

  // ── 마을 자원 ───────────────────────────────────
  readonly storage: Readonly<VillageStorageState>;

  // ── 이 NPC 가 쓸 수 있는 시설 ────────────────────
  readonly farm: { id: EntityId; phase: FarmPhase; tile: GridPosition } | null;
  readonly kitchen: { id: EntityId; tile: GridPosition } | null;
  readonly bed: { houseId: EntityId; door: GridPosition } | null;

  // ── 장소 ────────────────────────────────────────
  readonly plaza: GridPosition;
  readonly diningSpot: GridPosition;

  // ── 이 NPC 의 상태 ──────────────────────────────
  /** 이번 식사 시간대에 이미 먹었는가 */
  readonly hasEatenThisMeal: boolean;
}
```

## 30.1 이전 Context 로는 판단이 불가능했다

이전 판의 Context는 다음 5개였다.

```ts
gameTime, monsterNearby, foodAvailable,
assignedWorkplaceExists, houseExists
```

그런데 각 역할의 판단에는 다음이 필요하다.

```text
농부   밭의 phase           empty 면 심고, ready 면 수확하고, growing 이면 대기
       storage.seed         씨앗이 없으면 심을 수 없다
요리사  storage.crop         cropPerBatch 이상 있어야 조리한다
전원   bed                  침대가 배정되었는지 (집 존재 여부만으로는 부족)
       hasEatenThisMeal     같은 식사 시간에 반복 식사를 막는다
```

`assignedWorkplaceExists: boolean`으로는 "밭이 있는가"만 알 수 있고
"지금 밭에서 무엇을 해야 하는가"를 알 수 없다.

`houseExists: boolean`으로는 침대 부족 상황(집은 있지만 내 침대는 없음)을
표현할 수 없다.

## 30.2 Context 는 Decision 직전에 조립한다

```text
NPCSystem 이 NPC 별로 WorldQuery + VillageStorage + GameClock 에서 값을 모아
NPCContext 를 만든다
    ↓
NPCDecisionSystem.decide(npc, context) 는 Context 만 읽는다
```

`NPCDecisionSystem`은 `EntityRegistry`, `Scene`, `WorldQuery`를
직접 참조하지 않는다.

이것이 78장의 테스트를 객체 리터럴 하나로 작성할 수 있게 만든다.

## 30.3 우선순위는 4단계다

```text
1. 위험 회피      threatNearby
2. 필수 스케줄    식사 / 취침
3. 직업 행동      농사 / 요리 / 점검
4. 자유 행동      Idle
```

이전 판의 "2. 생존 행동"은 Hunger 수치를 전제했으나
MVP는 Hunger를 구현하지 않고 일정 기반 식사를 사용한다(40장).

비어 있는 단계이므로 삭제했다.

---

# 31. NPC Action

NPC 행동은 Action 단위로 구현한다.

MVP의 Action 목록:

```text
IdleAction       제자리 대기 / 가벼운 배회
MoveToAction     목표 타일까지 이동
PlantAction      씨앗 심기          (seed -1)
HarvestAction    수확               (crop +4, seed +1)
CookAction       조리               (crop -2, food +3)
InspectAction    목수의 시설 점검 연출
EatAction        식사               (food -1)
SleepAction      배정된 침대에서 취침  (Sprite 숨김)
RestAction       광장에서 밤 보내기   (Sprite 보임)
FleeAction       safe_spot 으로 도피
TalkAction       대화 중 정지
```

`FarmAction`을 `PlantAction`과 `HarvestAction`으로 나눈 이유는
두 행동의 조건과 결과가 완전히 다르기 때문이다.

`CollectCropAction`은 두지 않는다.

작물이 `VillageStorage`의 숫자이므로 "가져오는" 단계에 상태 변화가 없다(39.1).

공통 Interface:

```ts
export interface NPCAction {
  readonly kind: NPCActionKind;

  /** 애니메이션과 Debug Panel 이 사용하는 표시 상태 */
  readonly stateLabel: NPCStateLabel;

  start(npc: NPC, context: NPCContext): void;

  update(npc: NPC, delta: number): ActionStatus;

  cancel(npc: NPC): void;
}
```

상태:

```ts
export type ActionStatus = 'running' | 'success' | 'failed';
```

## 31.1 Action 이 NPC 상태의 유일한 원천이다

`npc.state` 필드를 따로 두지 않는다.

```ts
export class NPC {
  currentAction: NPCAction;

  get stateLabel(): NPCStateLabel {
    return this.currentAction.stateLabel;
  }
}
```

이전 판은 `MVP_SPEC.md`의 `NPCState` 유니온과 이 Action 목록을
동시에 유지하려 했다.

그러면 진실의 원천이 두 개가 된다.

```text
npc.state = 'working'
npc.currentAction = HarvestAction
```

둘을 일치시키는 코드가 모든 전이마다 필요해지고, 한쪽만 갱신하는 버그가 생긴다.

Action 구조를 도입한 목적이 거대한 switch문 제거였는데,
State 필드를 남기면 `Action → State` 매핑 switch문이 새로 생긴다.

관련 ADR:

```text
docs/adr/008-action-as-single-npc-state.md
```

## 31.2 RestAction 과 SleepAction 은 다른 Action 이다

```text
SleepAction   침대가 배정된 NPC. 문으로 들어가 Sprite 가 숨겨진다.
RestAction    침대가 없는 NPC. 광장에 앉아 화면에 계속 보인다.
```

집을 짓기 전 밤에 주민들이 광장에 앉아 있는 모습이 보여야
플레이어가 집이 필요하다는 것을 인식할 수 있다.

두 Action을 하나로 합치면 이 차이가 사라진다.

## 31.3 복합 Action 은 만들지 않는다

`MoveToAndPlantAction`처럼 여러 단계를 묶은 Action을 만들지 않는다.

이동은 `MoveToAction`이 끝낸 뒤 Decision을 다시 수행한다.

```text
MoveToAction (밭으로) → success
    ↓
Decision 재평가 → PlantAction
```

이렇게 하면 이동 중에 위협이 발생했을 때 중단 처리가 단순해진다.

---

# 32. Action 기반 구조를 사용하는 이유

다음과 같은 거대한 switch문을 방지한다.

```ts
switch (npc.state) {
  case 'idle':
  case 'moving':
  case 'working':
  case 'eating':
  case 'sleeping':
  ...
}
```

Action 기반 구조는 역할별 행동을 분리하기 쉽다.

다만 과도한 Generic Action Framework를 만들지 않는다.

---

# 33. NPC Schedule

위치:

```text
src/game/systems/npc/NPCSchedule.ts
```

Schedule은 시간에 따른 기본 목적을 제공한다.

```ts
export type ScheduledActivity = 'eat' | 'work' | 'free' | 'sleep';

export interface ScheduleEntry {
  startHour: number;
  activity: ScheduledActivity;
}
```

```text
06:00 free
07:00 eat
08:00 work
12:00 eat
13:00 work
18:00 eat
20:00 free
22:00 sleep
```

`wake`를 두지 않는다.

기상은 `sleep` 시간대가 끝나는 것으로 표현되고,
06:00 이후의 행동은 `free`와 구별할 규칙이 없다.

값을 하나 늘려도 대응하는 판단 규칙이 없으면 `decide()`에 비어 있는 분기가 생긴다.

우선순위(30.3)와의 대응은 다음과 같다.

```text
eat / sleep   →  2단계 필수 스케줄
work          →  3단계 직업 행동
free          →  4단계 자유 행동
```

즉 `ScheduledActivity` 는 4단계 우선순위를 전부 덮으며, 남는 값이 없다.

시간표의 정본은 `MVP_SPEC.md` 39장이다.

Schedule은 절대 규칙이 아니다.

위험 상황이 Schedule보다 우선한다.

---

# 34. NPC Role

NPC 역할:

```ts
type NPCRole =
  | 'farmer'
  | 'cook'
  | 'carpenter';
```

Role별 직업 행동은 Strategy 형태로 분리한다.

예:

```text
FarmerBehavior
CookBehavior
CarpenterBehavior
```

---

# 35. Farmer 흐름

농부의 주요 행동 흐름:

```text
Work Time
↓
context.farm 존재 확인      없으면 Idle
↓
Farm 으로 이동
↓
context.farm.phase 확인
↓
empty    → storage.seed >= 1 ?
             YES → PlantAction   (seed -1)
             NO  → Idle (씨앗 대기)
growing  → Idle 또는 광장 배회
ready    → HarvestAction        (crop +4, seed +1)
```

## 35.1 씨앗이 없으면 심지 못한다

`storage.seed`가 0이면 농부는 밭 앞에서 기다린다.

플레이어가 밭에 `[E]`로 씨앗을 기부하면 다시 심기 시작한다.

수확 시 `seed +1`이 나오므로 정상 운영 중에는 씨앗이 고갈되지 않는다.
(`MVP_SPEC.md` 77.5)

## 35.2 성장은 농부와 무관하게 진행된다

`FarmSystem`이 `totalGameMinutes`만으로 `growing → ready`를 판정한다.

농부가 밭 앞에 서 있어야 자라는 구조가 아니다.

농부는 `growing` 중에 다른 일을 하거나 광장을 배회할 수 있다.

농부는 Farm 상태를 직접 수정하지 않는다.

`FarmSystem.plant()` / `FarmSystem.harvest()`만 호출한다.

---

# 36. Farm 상태

Farm 상태는 `FarmSystem`이 `buildingId`별로 보관한다.

```ts
export type FarmPhase = 'empty' | 'growing' | 'ready';

export interface FarmState {
  phase: FarmPhase;
  /** growing 진입 시각. empty 면 의미 없음. */
  plantedAtTotalGameMinutes: number;
}
```

```text
empty    ──plant()────────────▶  growing
growing  ──growMinutes 경과───▶  ready
ready    ──harvest()──────────▶  empty
```

## 36.1 상태를 3개로 줄였다

이전 판은 `'empty' | 'planted' | 'growing' | 'ready'` 4개였고,
`MVP_SPEC.md`의 Life Cycle은 `Harvested`를 포함한 6개였다.

두 문서가 달랐고, 두 가지 문제가 있었다.

```text
planted 와 growing 의 전이 기준이 정의되지 않았다
  심은 직후가 planted 라면 언제 growing 이 되는가?

Harvested 는 상태가 아니라 사건이다
  harvest() 직후 곧바로 empty 가 되므로 머무르는 시간이 0 이다
```

`planted`를 `growing`에 흡수하고 `Harvested`를 삭제했다.

"수확했다"는 `CROP_HARVESTED` 이벤트로 표현한다.

## 36.2 시간 단위를 이름에 넣었다

이전 판의 `plantedAt?: number`는 단위가 명시되지 않아
실시간 ms인지 게임분인지 알 수 없었다.

실시간을 쓰면 저장·불러오기와 Time Scale 변경에서 성장 타이머가 깨진다.

`FarmSystem`은 `BuildingSystem`과 분리된 작은 System으로 둔다.

---

# 37. FarmSystem

위치:

```text
src/game/systems/farm/FarmSystem.ts
```

책임:

```text
- Farm 상태
- Crop 성장 Timer
- Plant
- Harvest
```

NPC는 다음 API를 사용한다.

```ts
plant(farmId: string): boolean;

harvest(farmId: string): number;

getStatus(farmId: string): FarmStatus;
```

---

# 38. Food Storage 모델

MVP에서 Seed, Crop, Food는 월드에 실제 Item Entity로 생성하지 않는다.

마을 공유 저장소의 숫자로 관리한다.

```ts
export interface VillageStorageState {
  seed: number;
  crop: number;
  food: number;
}

export class VillageStorage {
  add(item: keyof VillageStorageState, amount: number): void;
  remove(item: keyof VillageStorageState, amount: number): boolean;
  has(item: keyof VillageStorageState, amount: number): boolean;
  get(item: keyof VillageStorageState): number;
  snapshot(): Readonly<VillageStorageState>;
}
```

위치:

```text
src/game/world/VillageStorage.ts
```

## 38.1 seed 를 저장소에 두는 이유

이전 판의 `VillageStorage`에는 `crop`과 `food`만 있었다.

그러면 농부가 심을 씨앗의 출처가 정의되지 않는다.

```text
seed 는 플레이어 Inventory 에만 존재했다
그런데 씨앗을 심는 주체는 NPC 다
NPC 가 플레이어 Inventory 를 직접 읽어야 하는가?
```

NPC가 플레이어 Inventory를 읽는 구조는 만들지 않는다.

`seed`를 마을 저장소에 두고, 플레이어가 저장소로 옮겨주는 경로를 둔다.

```text
1. 밭 건설 비용의 seed 3 이 VillageStorage.seed 로 이전된다
2. 밭에 [E] 로 상호작용하여 seed 를 1개씩 기부한다
```

## 38.2 Inventory 와 VillageStorage 는 별개다

```text
InventoryState        wood / stone / seed    플레이어 소유
VillageStorageState   seed / crop / food     마을 공유
```

`seed`만 양쪽에 존재하며, 위 두 경로로만 이동한다.

`InventorySystem`과 `VillageStorage`는 서로를 직접 참조하지 않는다.

이전은 `BuildingSystem`과 `InteractionSystem`이 중개한다.

## 38.3 변경 시 이벤트

`VillageStorage`가 변경되면 `STORAGE_CHANGED`를 발행한다.

UI와 `GameEventSystem`이 이를 구독한다.

이렇게 하면 MVP 구현이 단순해진다.

---

# 39. Cook 흐름

```text
Work Time
↓
context.kitchen 존재 확인                없으면 Idle
↓
context.storage.crop >= cropPerBatch ?   아니면 Idle (작물 대기)
↓
Kitchen 으로 이동
↓
CookAction (cookSeconds 실시간 6초)
↓
storage.crop -= 2
storage.food += 3
↓
STORAGE_CHANGED emit
FOOD_COOKED emit
```

## 39.1 작물을 들고 오는 연출과 수량 이동을 분리한다

요리사가 밭에서 작물을 들고 주방으로 가는 장면은 **스프라이트 연출**이다.

실제 수량은 `VillageStorage`에서 이동하며, 월드에 작물 Entity를 만들지 않는다.

`CollectCropAction`을 별도로 두지 않는다.

작물이 저장소의 숫자이므로 "가져오는" 단계에 상태 변화가 없고,
Action을 하나 늘리는 만큼의 이득이 없다.

이동 연출이 필요하면 `MoveToAction`으로 밭을 경유하게 만든다.

---

# 40. Eating 흐름

NPC가 식사 시간에 다음을 수행한다.

```text
scheduledActivity == 'eat'
AND context.hasEatenThisMeal == false
↓
context.storage.food >= foodPerMeal ?
↓
YES                                   NO
↓                                     ↓
diningSpot 으로 이동 (39.2)             Idle (식사 건너뜀)
↓
EatAction (eatSeconds 실시간 4초)
↓
storage.food -= 1
hasEatenThisMeal = true
↓
MEAL_EATEN / STORAGE_CHANGED emit
```

## 40.1 Hunger 수치를 만들지 않는다

MVP는 `hunger: number` 같은 누적 수치를 구현하지 않는다.

식사는 **일정 기반**이다.

```text
07:00 / 12:00 / 18:00 의 식사 시간대에 1회 먹는다
```

## 40.2 hasEatenThisMeal 이 필요한 이유

식사 시간대는 여러 프레임에 걸쳐 지속된다.

플래그가 없으면 같은 시간대에 음식을 계속 먹어 저장소가 순식간에 비워진다.

플래그는 식사 시간대가 바뀔 때 초기화한다.

```text
GameClockSystem 이 GAME_HOUR_CHANGED 를 emit
    ↓
NPCSystem 이 구독한다
    ↓
새 식사 시간대(07 / 12 / 18 시)에 진입했으면
    ↓
모든 NPC 의 hasEatenThisMeal = false
```

초기화 주체는 `GameClockSystem`이 아니라 `NPCSystem`이다.

`GameClockSystem`이 NPC 목록을 직접 건드리면 71장의 허용 참조 목록에 없는
의존이 생기고, 시계가 NPC를 아는 구조가 된다.

플래그의 소유자는 NPC이므로 `NPCSystem`이 갱신한다(87.2).

식사 시간대의 정의는 `MVP_SPEC.md` 39.1에 있다.

## 40.3 음식이 없으면 그냥 넘어간다

MVP에서는 굶주림에 따른 페널티를 구현하지 않는다.

음식 부족의 결과는 `foodLevel` 하락으로 나타나고,
그것이 플레이어에게 보이는 신호다.

체력 감소나 사망은 구현하지 않는다.

---

# 41. Sleep 흐름

```text
22:00 (scheduledActivity == 'sleep')
↓
context.bed 확인  (WorldQuery.getAssignedBed)
↓
있음                              없음
↓                                 ↓
bed.door 로 이동                   plaza 로 이동
↓                                 ↓
SleepAction                       RestAction
  view.setVisible(false)            화면에 계속 보인다
  stateLabel = 'sleeping'           stateLabel = 'resting'
  집 조명 ON
↓                                 ↓
06:00                             06:00
↓                                 ↓
view.setVisible(true)             기상
door 위치에서 활동 시작
```

## 41.1 SleepAction 과 RestAction 을 분리한다

침대가 없는 NPC는 잠들지 않고 광장에 앉아 밤을 보낸다.

두 Action을 하나로 합치면 집이 있을 때와 없을 때의 차이가 화면에 보이지 않는다.

플레이어가 집을 지어야 한다는 것을 인식하는 유일한 단서가
"밤에 주민들이 광장에 앉아 있다"는 장면이다.

## 41.2 침대 배정

`WorldQuery.getAssignedBed(npcId)`가 배정을 계산한다.

```text
전체 침대 수 = 집들의 residentCapacity 합계
배정 순서   = NPC id 순서 (결정적)
door        = house.origin + config.entranceOffset   (24.2)
```

침대마다 좌표를 두지 않는다.

MVP는 건물 내부를 Scene으로 만들지 않으므로,
같은 집에 배정된 세 NPC는 모두 같은 문으로 들어가 숨겨진다.

주민 4명 + 집 1채(침대 3)이면 마지막 NPC가 `RestAction`을 수행한다.

같은 상황에서 매번 다른 NPC가 노숙하면 재현과 디버깅이 불가능하다.

MVP에서는 실제 Interior Scene을 구현하지 않는다.

---

# 42. GameClockSystem

위치:

```text
src/game/systems/clock/GameClockSystem.ts
```

책임:

```text
- 게임 시간 증가
- Day 계산
- Hour / Minute 계산
- Day Phase 계산
- 시간 이벤트 발행
```

예:

```ts
interface GameTime {
  day: number;
  hour: number;
  minute: number;
}
```

---

# 43. 시간 표현

시간은 내부적으로 누적 Game Minute 형태로 관리하는 것을 권장한다.

예:

```ts
private totalGameMinutes: number;
```

변환:

```text
totalGameMinutes
↓
day
hour
minute
```

이 방식이 저장과 시간 비교를 단순화한다.

---

# 44. DayPhase

```ts
type DayPhase =
  | 'morning'
  | 'day'
  | 'evening'
  | 'night';
```

DayNight UI 및 Monster Spawn이 이 값을 사용할 수 있다.

---

# 45. DayNightVisualSystem

GameClock과 시각 효과를 분리한다.

```text
GameClockSystem
= 현재 시간

DayNightVisualSystem
= 화면 밝기 / Tint / Light
```

시간 계산과 화면 표현을 하나의 시스템에 넣지 않는다.

---

# 46. MonsterSystem

위치:

```text
src/game/systems/monster/MonsterSystem.ts
```

책임:

```text
- Monster Spawn (GameEventSystem 의 spawnMonsters 커맨드로 호출)
- Village Target 설정 (WorldQuery.getPlazaPosition)
- Pathfinding ('monster' 통행 레이어 사용)
- 이동
- 경로 차단 시 AttackObstacle 전이
- Threat 상태 제공 (isThreatActive / isThreatNear)
- Despawn
- aliveMonsterCount 제공 (EventContext 용)
```

Monster 종류는 MVP에서 하나만 사용한다.

Monster는 항상 `actor = 'monster'` 레이어로 경로를 계산한다(15.1).

이 레이어에서만 Barrier가 Blocked로 취급된다.

## 46.1 목표 지점은 plaza 다

몬스터의 목표인 "마을 중심 타일"은 `WorldQuery.getPlazaPosition()`이다.

몬스터 전용 목표 오브젝트를 맵에 따로 두지 않는다.

광장은 주민이 밤을 보내고 식사하는 곳이므로,
몬스터가 거기 도달했다는 것이 곧 "마을이 뚫렸다"는 뜻이 된다.

도달 판정은 광장 타일과의 맨해튼 거리가 1 이하일 때 성립한다.

광장 타일 자체에 NPC가 서 있어 경로가 닿지 않는 경우를 피하기 위해서다.

정의의 정본은 `MVP_SPEC.md` 55.2이다.

---

# 47. Monster AI

Monster AI는 단순하다.

```ts
export type MonsterState = 'spawn' | 'moveToVillage' | 'attackObstacle' | 'leave';
```

```text
spawn
↓
moveToVillage          목표: 마을 중심 타일
↓
A* ('monster' 레이어) 결과에 따라 분기
↓
경로 있음                        경로 없음
↓                                ↓
이동                              입구 방향에서 가장 가까운
↓                                Barrier 앞 타일로 이동
마을 중심 도달                      ↓
↓                                attackObstacle
VILLAGE_BREACHED emit             (attackObstacleSeconds)
↓                                ↓
leave                            leave
↓
맵 밖 도달 또는 despawnHour 경과
↓
Despawn → MONSTER_THREAT_ENDED
```

## 47.1 Barrier 는 파괴되지 않는다

`attackObstacle`은 **연출 전용 상태**다.

Barrier에 HP가 없고 피해를 받지 않는다.

이유는 `MVP_SPEC.md` 29.3에 있다.

관련 ADR:

```text
docs/adr/005-barrier-blocks-monsters-only.md
```

## 47.2 경로 없음 상태를 반드시 정의한다

이전 판에는 "Path blocked? → Barrier 공격 또는 정지"만 있었다.

"정지"의 종료 조건이 없으면 몬스터가 제자리에서 멈춘 채 사라지지 않는다.

그러면 `aliveMonsterCount`가 0이 되지 않아
`EVENT_BARRIER_REQUEST`가 영구히 발생하지 않는다.

즉 게임 진행이 막힌다.

`attackObstacleSeconds` 경과 후 반드시 `leave`로 전이하고,
`despawnHour`(05:00)를 지나면 상태와 무관하게 강제 Despawn한다.

## 47.3 이미 이동 중인 몬스터

플레이어가 몬스터의 경로 위에 방벽을 세우면
`NavigationGrid.version`이 올라가고 경로가 무효화된다(17.2).

이 재계산이 없으면 몬스터가 낡은 경로로 방벽을 통과한다.

플레이어 전투는 고려하지 않는다.

---

# 48. ThreatSystem

위험 여부를 NPC가 직접 Monster 목록에서 계산하지 않도록 한다.

MonsterSystem 또는 별도의 ThreatSystem이 다음 정보를 제공한다.

```ts
isThreatActive(): boolean;

isThreatNear(position: GridPosition, radiusTiles: number): boolean;

aliveMonsterCount(): number;
```

`NPCSystem`이 `isThreatNear(npc.tile, balance.monster.threatRadiusTiles)`를
호출해 `NPCContext.threatNearby`를 채운다.

`NPCDecisionSystem`은 Context의 boolean만 읽고 몬스터 목록을 보지 않는다.

`aliveMonsterCount()`는 `EventContext`에 들어가
`EVENT_BARRIER_REQUEST`의 조건 판정에 사용된다.

MVP에서는 별도의 `ThreatSystem` 파일을 만들지 않고 `MonsterSystem`이 제공한다.

104장의 기준(별도 상태를 갖는가 / 독립적인 규칙을 갖는가)에 비추어
위협 판정은 Monster 목록의 조회에 불과하므로 System을 분리할 가치가 없다.

---

# 49. FleeAction

NPC가 Monster를 감지하면:

```text
context.threatNearby == true
↓
현재 Action.cancel()
↓
WorldQuery.findSafePosition(npc.tile)
↓
Pathfinding ('ground' 레이어)
↓
FleeAction
↓
safe_spot 도착 후 대기
↓
MONSTER_THREAT_ENDED
↓
Decision 재평가
```

## 49.1 도피 지점은 맵이 정의한다

`safe_spot` 오브젝트가 마을 안쪽, 입구에서 가장 먼 곳에 배치된다
(`MVP_SPEC.md` 14.3).

`findSafePosition()`은 그중 현재 위협에서 가장 먼 곳을 반환한다.

임의의 빈 타일을 계산해서 도망치게 만들지 않는다.

그러면 NPC가 몬스터 쪽으로 도망치는 경우가 발생한다.

## 49.2 방벽은 NPC 의 도피를 막지 않는다

NPC는 `'ground'` 레이어로 경로를 계산하므로 방벽을 통과할 수 있다(15.1).

방벽이 모든 Entity를 막으면 NPC가 마을에 갇혀 도피가 불가능해진다.

## 49.3 이전 작업을 이어가지 않는다

`FleeAction`이 끝나면 Decision을 처음부터 다시 수행한다.

중단된 Action을 저장하고 복원하지 않는다.

농부가 밭으로 다시 걸어가는 것은 자연스러운 동작이며,
복원 로직을 추가할 이득이 없다.

---

# 50. GameEventSystem

여기서 말하는 `GameEvent`는 EventBus 메시지와 다르다.

EventBus:

```text
시스템 간 발생한 사건 전달
```

GameEventSystem:

```text
게임 진행 조건을 확인하여 스토리/진행 이벤트 발생
```

위치:

```text
src/game/systems/events/GameEventSystem.ts
```

---

# 51. GameEventDefinition

```ts
export interface GameEventDefinition {
  id: GameEventId;
  once: boolean;

  canTrigger(context: EventContext): boolean;

  /** 부작용을 직접 일으키지 않고 수행할 커맨드를 반환한다. */
  execute(context: EventContext): GameEventCommand[];
}
```

## 51.1 execute 는 커맨드를 반환한다

```ts
export type GameEventCommand =
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

```text
dialogue / markNpcHasDialogue  →  DialogueSystem
objective                      →  ObjectiveSystem
unlockBuilding                 →  BuildingSystem
spawnMonsters                  →  MonsterSystem
spawnResident                  →  NPCFactory + EntityRegistry
cameraFocus / showMessage      →  Presentation
```

## 51.2 왜 커맨드 반환인가

이전 판의 `execute(context): void`는 실행할 수 없는 구조였다.

97장은 이벤트가 Dialogue / Objective / Monster / NPC를 트리거해야 한다고 정의한다.

그런데 `EventContext`에는 그 넷에 접근할 경로가 없었다.

```ts
// 이전 판
interface EventContext {
  worldState: WorldState;
  worldQuery: WorldQuery;
  gameTime: GameTime;
  triggeredEvents: ReadonlySet<GameEventId>;
}
```

`execute`가 아무것도 할 수 없다.

해결 방법은 두 가지였다.

```text
A. Context 에 dialogueSystem, monsterSystem 등을 넣는다
B. execute 가 커맨드 목록을 반환하고 System 이 그것을 실행한다
```

B를 선택한 이유:

```text
이벤트 정의가 순수 함수가 된다  →  Vitest 에서 조건과 결과를 그대로 검증한다
71장의 "UI 와 Domain Logic 을 직접 연결하지 않는다" 를 지킨다
    GameEventSystem → DialogueBox 직접 호출이 발생하지 않는다
이벤트가 무엇을 하는지 정의만 읽고 알 수 있다
```

관련 ADR:

```text
docs/adr/007-game-event-commands.md
```

## 51.3 이벤트 정의 예시

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

테스트:

```ts
expect(EVENT_KITCHEN_REQUEST.canTrigger(makeContext({ crop: 0 }))).toBe(false);
expect(EVENT_KITCHEN_REQUEST.canTrigger(makeContext({ crop: 1 }))).toBe(true);
```

---

# 52. EventContext

```ts
export interface EventContext {
  readonly gameTime: GameTime;
  readonly dayPhase: DayPhase;

  /** 계산된 지표 스냅샷. WorldState 인스턴스가 아니다. */
  readonly worldState: WorldStateView;

  /** 마을 저장소 스냅샷 */
  readonly storage: Readonly<VillageStorageState>;

  /** 건물 수 조회 등 읽기 전용 질의 */
  readonly worldQuery: WorldQuery;

  /** 살아있는 몬스터 수 */
  readonly aliveMonsterCount: number;

  readonly triggeredEvents: ReadonlySet<GameEventId>;
}
```

## 52.1 Context 는 전부 읽기 전용이다

`WorldState` 인스턴스가 아니라 `compute()` 결과 스냅샷을 넣는다.

이벤트 정의가 실수로 상태를 변경할 수 없게 만든다.

## 52.2 45장의 조건을 이 Context 로 모두 평가할 수 있다

```text
EVENT_FARM_REQUEST      항상 참
EVENT_KITCHEN_REQUEST   storage.crop >= 1
EVENT_HOUSE_REQUEST     storage.food >= 1
EVENT_FIRST_MONSTER     triggeredEvents.has('EVENT_HOUSE_REQUEST')
                        && worldQuery.countBuildings('house') >= 1
                        && dayPhase === 'night'
EVENT_BARRIER_REQUEST   triggeredEvents.has('EVENT_FIRST_MONSTER')
                        && aliveMonsterCount === 0
EVENT_NEW_RESIDENT      triggeredEvents.has('EVENT_BARRIER_REQUEST')
                        && worldState.safetyLevel === 100
                        && dayPhase === 'morning'
```

조건식의 정본은 `MVP_SPEC.md` 45장이다.

---

# 53. 주요 GameEvent 흐름

```text
GAME START
↓
EVENT_FARM_REQUEST
↓
Farm Built
↓
Crop Harvest
↓
EVENT_KITCHEN_REQUEST
↓
Kitchen Built
↓
EVENT_HOUSE_REQUEST
↓
House Built
↓
Night
↓
EVENT_FIRST_MONSTER
↓
EVENT_BARRIER_REQUEST
↓
Barrier Built
↓
Next Morning
↓
EVENT_NEW_RESIDENT
```

---

# 54. GameEvent 조건

이벤트 조건은 UI나 Dialogue에 의존해서는 안 된다.

예:

잘못된 예:

```text
DialogueBox가 닫히면 다음 Event
```

올바른 예:

```text
Farm 존재
AND
FarmCompletedEventTriggered
```

진행 조건은 게임 상태를 기준으로 한다.

---

# 55. DialogueSystem

위치:

```text
src/game/systems/dialogue/DialogueSystem.ts
```

DialogueSystem 책임:

```text
- 대사 표시
- 대화 중 Player 입력 제한
- 대사 진행
- 대화 종료 시 DIALOGUE_ENDED emit
```

스토리 조건을 직접 결정하지 않는다.

GameEventSystem에서 Dialogue 요청을 보낸다.

## 55.1 대사 데이터가 다음 목표를 들고 있다

```ts
export interface DialogueDefinition {
  id: string;
  speaker: NPCRole;
  lines: string[];
  /** 대사가 끝났을 때 설정할 목표. 없으면 목표를 바꾸지 않는다. */
  objectiveOnEnd?: Objective;
}
```

`data/dialogues.ts`에 둔다.

```text
DialogueSystem 이 마지막 줄을 닫는다
    ↓
DIALOGUE_ENDED { dialogueId } emit
    ↓
ObjectiveSystem 이 구독한다
    ↓
DIALOGUES[dialogueId].objectiveOnEnd 가 있으면 적용
```

`DialogueSystem`은 자신이 무슨 목표를 세울지 알지 못하고,
`ObjectiveSystem`은 대사 내용을 알지 못한다. 둘을 잇는 것은 데이터다.

## 55.2 건물 해금은 대사에 걸지 않는다

건물 해금과 대화 가능 표시는 **이벤트 발생 즉시** 일어난다.

목표 문구만 대사 종료 후에 바뀐다.

```text
unlockBuilding       이벤트 발생 즉시
markNpcHasDialogue   이벤트 발생 즉시
objectiveOnEnd       대사 종료 후
```

해금을 대사에 걸면 `MVP_SPEC.md` 47.2의
"대화하지 않고 바로 밭을 지어도 진행된다"가 성립하지 않는다.

또한 54장의 "이벤트 조건은 Dialogue 에 의존하지 않는다"와도 충돌한다.

`DIALOGUE_ENDED`는 목표 **표시**만 바꾸며, 어떤 이벤트의 조건도 되지 않는다.

자세한 근거는 `MVP_SPEC.md` 47.1.1에 있다.

---

# 56. ObjectiveSystem

현재 주요 목표 하나만 관리한다.

위치:

```text
src/game/systems/objective/ObjectiveSystem.ts
```

```ts
export type ObjectiveProgressKind = 'blockedGateTiles';

export interface Objective {
  id: string;
  text: string;
  /** 있으면 text 뒤에 " (current / total)" 를 붙여 표시한다 */
  progress?: ObjectiveProgressKind;
}
```

Objective를 바꾸는 경로는 세 개다.

```text
1. GameEventSystem 의 objective 커맨드          (51.1)
2. DIALOGUE_ENDED  →  objectiveOnEnd            (55.1)
3. BUILDING_PLACED →  progress 값 재계산         (56.1)
```

## 56.1 진행 수치

```text
progress            current                              total
──────────────────────────────────────────────────────────────────────
blockedGateTiles    worldQuery.countBlockedGateTiles()   balance.village.gateTiles
```

`BUILDING_PLACED`를 구독하여 다시 계산하고, 값이 바뀌었으면
`OBJECTIVE_CHANGED`를 발행한다.

매 프레임 계산하지 않는다. 입구 타일이 막히는 사건은 건설뿐이다.

MVP에서 진행 수치를 쓰는 목표는 방벽 하나뿐이므로
범용 진행도 시스템을 만들지 않고 종류를 열거형 하나로 둔다.

## 56.2 방벽 완성 후의 대기 목표

`EVENT_BARRIER_REQUEST`가 완료되고 `safetyLevel == 100`이 되었지만
아직 `morning`이 아닌 동안, 목표를 대기 문구로 바꾼다.

```text
방벽 미완성   "마을 입구를 막으세요"  + progress
방벽 완성     "마을을 지켰다. 아침을 기다리세요."
```

플레이어는 최대 실시간 약 7분을 기다린다(`MVP_SPEC.md` 40.4).

문구가 없으면 완료된 목표를 보며 진행이 막혔다고 판단한다.

이 전환은 `ObjectiveSystem`이 `WORLD_STATE_CHANGED`를 구독해 수행한다.

`EVENT_NEW_RESIDENT`의 조건은 45장 그대로이며 목표와 무관하다.

---

# 57. UI 구조

게임 UI는 Gameplay Logic을 소유하지 않는다.

UI는 시스템 상태를 표시한다.

```text
HUD
BuildMenu
DialogueBox
ObjectivePanel
DebugPanel
```

UI → Gameplay State 직접 수정은 최소화한다.

---

# 58. HUD Update

HUD가 매 프레임 Registry를 탐색해서는 안 된다.

간단한 상태 조회 또는 이벤트 기반 갱신을 사용한다.

예:

```text
INVENTORY_CHANGED
WORLD_STATE_CHANGED
OBJECTIVE_CHANGED
```

UI는 해당 이벤트에 반응한다.

---

# 59. SaveSystem

위치:

```text
src/game/systems/save/SaveSystem.ts
```

책임:

```text
- 현재 저장 상태 생성
- localStorage 저장
- Load
- Save Version 관리
```

게임 시스템별 내부 객체 전체를 serialize하지 않는다.

저장 전용 DTO를 사용한다.

---

# 60. SaveData

**원인이 되는 실제 상태만 저장한다.**

```ts
export interface SaveData {
  version: 1;
  savedAt: string;                  // ISO 8601

  /** 게임 시간의 유일한 원천 */
  gameClock: { totalGameMinutes: number };

  player: { tile: GridPosition };

  inventory: InventoryState;

  villageStorage: VillageStorageState;   // seed / crop / food

  buildings: SavedBuilding[];
  resourceNodes: SavedResourceNode[];
  npcs: SavedNPC[];

  triggeredEvents: GameEventId[];
  unlockedBuildings: BuildingType[];
  objectiveId: string | null;
}

export interface SavedBuilding {
  id: EntityId;
  type: BuildingType;
  /** 점유 영역의 좌상단 타일 */
  origin: GridPosition;
  /** Farm 인 경우에만 존재 */
  farm?: {
    phase: FarmPhase;
    plantedAtTotalGameMinutes: number;
  };
}

export interface SavedResourceNode {
  id: EntityId;
  type: ResourceNodeType;
  tile: GridPosition;
  harvested: boolean;
  respawnAtTotalGameMinutes: number | null;
}

export interface SavedNPC {
  id: EntityId;
  role: NPCRole;
  tile: GridPosition;
}
```

## 60.1 저장하지 않는 것

```text
WorldState 지표      파생값이므로 불러오기 후 재계산한다
NPC 의 현재 Action   불러오기 후 Decision 을 다시 실행한다
NPC 의 현재 경로
Animation frame
Monster             밤 이벤트가 다시 발생하므로 저장하지 않는다
```

## 60.2 이전 판에서 빠져 있던 것

이전 판의 저장 목록은 다음과 같았다.

```text
player.position, inventory, buildings, worldState,
gameClock, triggeredEvents, villageStorage
```

세 가지가 빠져 있었고, 각각 실제 버그를 만든다.

**1. Farm 의 phase 와 심은 시각**

`SavedBuilding`에 밭 상태가 포함되는지 정의되지 않았다.

빠지면 불러오기 후 자라던 작물이 사라진다.
(61장의 Load 전략은 "Building 복원"만 명시했다)

**2. ResourceNode 의 채집 / Respawn 상태**

빠지면 불러오기 시 모든 나무와 돌이 부활한다.

플레이어가 저장·불러오기로 자원을 무한히 얻을 수 있다.

**3. NPC 목록**

가장 심각하다.

`population`은 `EntityRegistry`에서 파생되므로 NPC를 복원하지 않으면
엔딩 후 저장했을 때 4번째 주민이 사라진다.

```text
엔딩 도달 (주민 4명) → 저장 → 불러오기
    ↓
61장의 "NPC 기본 생성" 은 초기 3명을 의미한다
    ↓
주민이 3명으로 되돌아간다
    ↓
새 주민 이벤트는 이미 triggeredEvents 에 있어 다시 발생하지 않는다
    ↓
4번째 주민이 영구히 소실된다
```

## 60.3 모든 시간값은 게임 시간 기준이다

```text
gameClock.totalGameMinutes
farm.plantedAtTotalGameMinutes
resourceNode.respawnAtTotalGameMinutes
```

실시간 ms(`Date.now()`, `performance.now()`)를 저장하지 않는다.

이전 판의 `plantedAt?: number`는 단위가 명시되지 않아 다음이 발생할 수 있었다.

```text
실시간 ms 로 저장 → 하루 뒤에 불러오면 모든 타이머가 만료 상태
Time Scale 변경  → 성장 시간이 의도와 달라진다
```

필드 이름에 `TotalGameMinutes`를 명시하여 단위 혼동을 차단한다.

`savedAt`만 실시간이며, 이것은 표시 전용이고 게임 로직에 사용하지 않는다.

## 60.4 Save Version

`version`이 현재 버전과 다르면 마이그레이션 없이 **명확한 Error를 발생시킨다**(85장).

MVP에서는 version 1만 존재하므로 마이그레이션 코드를 미리 작성하지 않는다.

---

# 61. Load 전략

Load 시:

```text
SaveData 읽기
↓
version 검증        불일치 → Error
↓
Map 기본 생성
↓
GameClock 복원      totalGameMinutes
↓
Inventory 복원
↓
VillageStorage 복원  seed / crop / food
↓
Building 복원        origin, type, 그리고 Farm 이면 phase + plantedAt
↓
Ruins 타일 제거      건물이 점유한 타일
↓
NavigationGrid 재생성
↓
ResourceNode 복원    harvested, respawnAt
↓
NPC 복원            저장된 npcs[] 그대로. 초기 3명을 가정하지 않는다.
↓
triggeredEvents / unlockedBuildings / objective 복원
↓
WorldState compute() 재계산
↓
NPC Decision 재실행
```

## 61.1 NPC 는 저장된 목록으로 복원한다

"NPC 기본 생성"을 하지 않는다.

초기 3명을 하드코딩해서 만들면 4번째 주민이 사라진다(60.2).

## 61.2 NPC 의 현재 행동은 복원하지 않는다

위치와 역할만 복원하고 Decision을 다시 수행한다.

불러온 직후 농부가 밭으로 다시 걸어가는 것은 자연스러운 동작이다.

## 61.3 WorldState 는 복원하지 않고 계산한다

`VillageStorage`, `Buildings`, `npcs`가 복원된 뒤 `compute()`를 호출한다.

지표를 저장하고 복원하면 저장된 지표와 실제 상태가 어긋날 수 있다.

---

# 62. Data Layer

위치:

```text
src/game/data/
```

파일 예:

```text
buildings.ts   BuildingConfig 4종 (크기 / 비용 / entranceOffset / 침대 / 방벽 여부)
resources.ts   ResourceNode 종류별 획득량과 Respawn
npcs.ts        NPCRole 별 기본값
events.ts      GameEventDefinition 6개
balance.ts     전체 밸런스 수치
dialogues.ts   DialogueDefinition. objectiveOnEnd 포함 (55.1)
```

게임 밸런스 값은 가능한 한 이곳에 둔다.

---

# 63. balance.ts 예

**밸런스 초기값의 정본은 `MVP_SPEC.md` 77.1이다.**

이 장은 구조만 보여준다.

```ts
export const GAME_BALANCE = {
  gameClock: { realSecondsPerGameHour: 20, startTotalGameMinutes: 480 },
  player:    { moveSpeed: 160, gatherSeconds: 1.2, interactRadiusTiles: 1.5 },
  npc:       { moveSpeed: 90, repathIntervalSeconds: 0.5, arriveThresholdPx: 4 },
  monster:   { moveSpeed: 70, threatRadiusTiles: 6, spawnCount: 3,
               attackObstacleSeconds: 8, despawnHour: 5 },
  resource:  { yield: { tree: 3, rock: 3, plant: 1 },
               respawnMinutes: { tree: 240, rock: 240, plant: 180 } },
  farm:      { growMinutes: 120, seedPerPlant: 1, cropPerHarvest: 4,
               seedPerHarvest: 1, plantSeconds: 2, harvestSeconds: 2 },
  kitchen:   { cropPerBatch: 2, foodPerBatch: 3, cookSeconds: 6 },
  meal:      { foodPerMeal: 1, mealsPerDay: 3, eatSeconds: 4 },
  worldState:{ foodLevelTargetDays: 2,
               happinessWeights: { food: 0.4, housing: 0.3, safety: 0.3 } },
  village:   { gateTiles: 5 },
} as const;
```

## 63.1 단위를 이름에 넣는다

```text
...Seconds       실시간 초
...Minutes       게임분
...Tiles         타일 수
...Px            픽셀
moveSpeed        px/s
```

이전 판의 `threatRadius: 6`은 타일인지 픽셀인지 알 수 없었다.

64장이 `GAME_BALANCE.monster.threatRadiusPx`를 예시로 쓰는데
실제 정의는 `threatRadius`여서 이름도 일치하지 않았다.

`growMinutes`가 게임분이라는 것도 이름만으로는 알 수 없었다.

단위를 이름에 넣으면 이런 혼동이 구조적으로 발생하지 않는다.

---

# 64. Configuration 원칙

숫자를 System 내부에 직접 쓰지 않는다.

잘못된 예:

```ts
if (distance < 192) {
}
```

권장:

```ts
const radiusPx = GAME_BALANCE.monster.threatRadiusTiles * TILE_SIZE;

if (distance < radiusPx) {
}
```

모든 값을 무조건 config로 만들 필요는 없지만 Gameplay 수치는 config로 분리한다.

---

# 65. 공통 Type

위치:

```text
src/game/types/
```

`src/shared/types/`는 **두지 않는다.**

같은 타입이 두 위치에 생기는 것을 막기 위해 게임 도메인 타입은 한 곳에만 둔다.

`src/shared/`에는 게임과 무관한 범용 유틸만 둔다.

```text
src/game/types/     게임 도메인 타입 (정본)
src/shared/utils/   clamp, 배열 헬퍼 등 범용 함수
```

다음 타입을 명확하게 정의한다.

```text
entity.ts    EntityId, EntityView, MovableEntity
world.ts     GridPosition, WorldPosition, GameTime, DayPhase,
             WorldStateView, VillageStorageState, PathActor
npc.ts       NPCRole, NPCActionKind, NPCStateLabel, NPCAction,
             ActionStatus, NPCContext, ScheduledActivity, ScheduleEntry
building.ts  BuildingType, BuildingConfig, FarmPhase,
             BuildInvalidReason, BuildValidationInput, BuildValidationResult
events.ts    GameEventId, GameEventMap, GameEventCommand,
             EventContext, GameEventDefinition,
             Objective, ObjectiveProgressKind, DialogueDefinition
item.ts      InventoryItemId, InventoryState, ResourceNodeType
```

`NPCState`는 정의하지 않는다.

Action이 상태의 유일한 원천이므로 표시용 `NPCStateLabel`만 둔다(31.1).

string을 아무 곳에서나 직접 사용하지 않는다.

---

# 66. 시스템 Update 순서

GameWorld의 update 순서는 고정한다.

```text
 1. InputSystem          입력 수집
 2. GameClockSystem       시간 진행
 3. BuildingSystem        건설 확정 / NavigationGrid 갱신
 4. ResourceSystem        채집 / Respawn
 5. FarmSystem            작물 성장
 6. MonsterSystem         스폰 / 이동 / Threat 갱신
 7. NPCSystem             Decision / Action / Movement
 8. GameEventSystem       조건 확인 / 커맨드 실행
 9. WorldState compute    지표 계산 + 변경 시 emit
10. Visual Systems        DayNightVisualSystem / UI 갱신
11. DebugSystem
```

## 66.1 BuildingSystem 을 NPCSystem 앞에 둔다

이전 판은 `BuildingSystem`을 7번(`NPCSystem` 뒤)에 두었다.

그러면 건설된 프레임에 NPC가 **낡은 NavigationGrid**를 보고 경로를 계산한다.

```text
프레임 N
  6. NPCSystem     → 아직 방벽이 없는 그리드로 경로 계산
  7. BuildingSystem → 방벽 설치, 그리드 갱신
```

건설은 입력 기반이므로 처리량이 작고, 앞으로 옮기는 비용이 거의 없다.

`MonsterSystem`(6)도 `BuildingSystem`(3) 뒤에 있으므로
방벽을 세운 즉시 몬스터 경로 판정에 반영된다.

단, 이 순서만으로 경로 문제가 완전히 해결되지는 않는다.

**이미 이동 중인** Entity의 경로는 17.2의 `version` 비교로 무효화해야 한다.

## 66.2 WorldState compute 를 NPCSystem 뒤에 둔다

지표는 같은 프레임의 모든 상태 변경(수확, 조리, 식사, 건설)이 끝난 뒤 계산한다.

`GameEventSystem`(8)은 `compute()` 전에 실행되므로
**이전 프레임의 지표 스냅샷**을 본다.

1프레임 지연은 무해하며, 같은 프레임 안에서 지표가 두 번 바뀌는 것을 막는다.

정확한 순서는 구현 과정에서 조정 가능하지만 명시적으로 관리한다.

순서를 바꿀 때는 이 장을 함께 수정한다.

---

# 67. Fixed Update는 MVP에서 사용하지 않는다

MVP에서는 Phaser의 delta 기반 update로 충분하다.

Physics Simulation 정밀도가 핵심이 아니므로 별도의 Fixed Timestep 시스템을 처음부터 만들지 않는다.

필요성이 확인될 경우 이후 검토한다.

---

# 68. 객체 생성 책임

Entity 생성은 가능하면 Factory로 분리한다.

예:

```text
PlayerFactory
NPCFactory
MonsterFactory
BuildingFactory
ResourceFactory
```

단, 한 줄짜리 단순 객체까지 Factory로 만들 필요는 없다.

---

# 69. NPCFactory 예

```ts
createNPC(
  role: NPCRole,
  position: GridPosition
): NPC;
```

Factory는 Phaser Sprite 생성과 Entity 초기화를 담당할 수 있다.

---

# 70. BuildingFactory

Building Type에 따른 Texture, Size, Collision 정보를 생성한다.

```ts
createBuilding(
  type: BuildingType,
  position: GridPosition
): Building;
```

Building 비용이나 배치 조건 판단은 Factory의 책임이 아니다.

---

# 71. 시스템 간 직접 참조 기준

직접 참조가 허용되는 경우:

```text
NPCSystem        → PathfindingSystem / MovementController / WorldQuery
BuildingSystem   → InventorySystem / NavigationGrid / BuildingFactory
MonsterSystem    → PathfindingSystem / NavigationGrid
FarmSystem       → GameClockSystem / VillageStorage
GameEventSystem  → WorldState / WorldQuery
GameWorld        → 모든 System (조립 담당)
```

## 71.1 GameEventSystem 은 커맨드로 전달한다

`GameEventSystem`이 `DialogueSystem`, `MonsterSystem`, `ObjectiveSystem`을
직접 호출하는 것도 피한다.

이벤트 정의는 커맨드를 반환하고(51.1),
`GameEventSystem`이 그 커맨드를 해당 시스템에 전달한다.

```text
허용   GameEventSystem → MonsterSystem.spawn()     커맨드 실행 지점에서 1회
금지   EVENT_FIRST_MONSTER.execute() 안에서 monsterSystem.spawn() 호출
```

차이는 **이벤트 정의 자체가 순수 함수로 남는지**다.

## 71.2 직접 참조를 피해야 하는 경우

```text
FarmSystem      → DialogueBox
NPC (Entity)    → 모든 System
Monster         → HUD
KitchenSystem   → ObjectivePanel
UI              → 모든 System 의 상태 변경 메서드
EventBus        → (UI 가 emit 하는 것)
```

Entity는 System을 호출하지 않는다.

Entity가 순수 데이터이므로(9.1) 구조적으로 호출할 수 없다.

UI와 Domain Logic이 직접 연결되지 않도록 한다.

---

# 72. 의존성 주입

MVP에서는 별도의 DI Framework를 사용하지 않는다.

Constructor Injection을 사용한다.

예:

```ts
new NPCSystem({
  worldQuery,
  pathfinding,
  gameClock,
  eventBus
});
```

외부 DI Container는 사용하지 않는다.

---

# 73. Service Locator 금지

다음 형태를 만들지 않는다.

```ts
GameServices.get('npcSystem');
GameServices.get('inventory');
```

전역 Service Locator는 의존성을 숨기므로 사용하지 않는다.

---

# 74. Singleton 최소화

전역 Singleton을 기본 패턴으로 사용하지 않는다.

GameWorld가 게임 인스턴스의 객체 수명을 관리한다.

EventBus도 GameWorld 단위 인스턴스로 생성한다.

---

# 75. Phaser 의존성 분리

다음 로직은 Phaser와 분리하는 것을 우선한다.

```text
Inventory
WorldState
GameClock
GameEvent 조건
Build Validation
A*
NPC Decision
Farm 상태
```

이렇게 해야 Vitest에서 쉽게 테스트할 수 있다.

---

# 76. Phaser를 사용해도 되는 영역

```text
Sprite
Animation
Input
Camera
Tilemap
Audio
Particle
Tween
Rendering
```

게임 규칙은 가능하면 순수 TypeScript로 유지한다.

---

# 77. 테스트 대상

우선 테스트 대상:

```text
대상                    테스트 형태
──────────────────────────────────────────────────────────
InventorySystem         add / remove / has 경계값
BuildValidator          순수 함수. 81장의 6가지 Invalid 사유
computeWorldState       순수 함수. 42.3 의 계산 예시
GameClockSystem         totalGameMinutes → day/hour/minute/dayPhase
A* Pathfinding          80장의 4가지 케이스 + 두 통행 레이어
NPCDecisionSystem       NPCContext 리터럴 → 기대 Action
NPCSchedule             시각 → ScheduledActivity 4종
FarmSystem              plant / 성장 판정 / harvest 수지
GameEventDefinition     canTrigger 조건표 (45장) 전체
VillageStorage          seed 수지 (심기 -1, 수확 +1)
WorldQuery              침대 배정 결정성 / findDiningSpot 분기 / entrance 계산
ObjectiveSystem         progress 재계산과 대기 문구 전환
SaveSystem              직렬화 → 역직렬화 왕복
```

## 77.1 전부 Phaser 없이 테스트 가능해야 한다

위 목록은 모두 Phaser를 import하지 않는다.

이것이 가능한 이유는 다음 두 가지 결정 때문이다.

```text
Entity 가 Phaser Sprite 를 요구하지 않는다        (9.1)
이벤트 정의가 커맨드를 반환하고 직접 호출하지 않는다  (51.1)
```

이 두 결정 중 하나라도 무너지면 테스트에서 Phaser Scene을 띄워야 하고,
MVP 테스트 전략 전체가 성립하지 않는다.

Scene 전체 테스트는 MVP 필수 조건이 아니다.

---

# 78. NPC Decision 테스트 예

```text
Given:
NPC = Farmer
Time = 09:00
Farm Exists = true
Threat = false

Then:
Decision = Work
```

```text
Given:
NPC = Farmer
Time = 09:00
Threat = true

Then:
Decision = Flee
```

위험이 직업 행동보다 우선한다.

---

# 79. Event 테스트 예

```text
Given:
Farm Built = true
Kitchen Built = false
Crop > 0
EVENT_KITCHEN_REQUEST not triggered

Then:
EVENT_KITCHEN_REQUEST should trigger
```

---

# 80. Pathfinding 테스트

다음 케이스를 최소 테스트한다.

```text
직선 이동
장애물 우회
목적지 차단
Barrier 추가 후 경로 변경
```

---

# 81. Build Validation 테스트

```text
빈 공간 → Valid

Map Collision → Invalid  'map_collision'

기존 Building 겹침 → Invalid  'overlaps_building'

BuildableArea 밖 → Invalid  'outside_buildable_area'

입구 타일에 집 → Invalid  'blocks_village_gate'

입구 타일에 방벽 → Valid

자원 부족 → Invalid  'insufficient_resources' + missing

맵 밖 → Invalid  'out_of_bounds'

Ruins 타일 위 → Valid
```

---

# 82. DebugSystem

개발 중에는 DebugSystem을 별도로 둔다.

위치:

```text
src/game/systems/debug/DebugSystem.ts
```

표시 가능한 내용:

```text
FPS
Game Time
Player Grid Position
NPC State
NPC Current Action
NPC Target
Current Event
WorldState
Navigation Grid
```

---

# 83. Debug Mode

환경 변수 또는 설정으로 Debug 기능을 켠다.

예:

```ts
export const DEBUG_MODE = import.meta.env.DEV;
```

Production에서 Debug UI가 자동으로 숨겨져야 한다.

---

# 84. Logging

`console.log()`를 곳곳에 직접 쓰지 않는다.

간단한 Logger Utility를 둔다.

예:

```ts
Logger.debug();
Logger.info();
Logger.warn();
Logger.error();
```

Production에서는 debug 로그를 끌 수 있다.

---

# 85. Error 처리

MVP에서 치명적 오류는 조용히 무시하지 않는다.

예:

```text
Building Config 없음
NPC Role 없음
Map Object 없음
Save Version 불일치
```

이 경우 개발 단계에서는 명확한 Error를 발생시킨다.

---

# 86. Null 처리

존재하지 않을 수 있는 대상은 명시적으로 `null`을 반환한다.

예:

```ts
findNearestBuilding(from: GridPosition, type: BuildingType): Building | null;
```

undefined와 null을 혼용하지 않는다.

프로젝트 전체에서 하나의 기준을 사용한다.

권장: "검색 결과 없음"은 `null`.

---

# 87. State Mutation 원칙

여러 시스템이 같은 데이터를 직접 수정하지 않는다.

## 87.1 WorldState 는 변경하지 않는다

`WorldState`에는 변경 API가 없다(12.1).

```ts
// 둘 다 존재하지 않는다
worldState.increaseSafety(10);
worldState.data.safetyLevel += 10;
```

지표를 바꾸려면 **원인이 되는 실제 상태**를 바꾼다.

```text
safetyLevel 을 올린다    →  BuildingSystem 이 입구에 Barrier 를 세운다
foodLevel 을 올린다      →  CookAction 이 VillageStorage.food 를 늘린다
housingLevel 을 올린다   →  BuildingSystem 이 House 를 세운다
population 을 늘린다     →  EntityRegistry 에 NPC 를 등록한다
```

다음 프레임의 `compute()`가 자동으로 새 값을 반영한다.

## 87.2 각 상태의 소유자

```text
상태                     변경 권한을 가진 곳
──────────────────────────────────────────────────
InventoryState           InventorySystem
VillageStorageState      VillageStorage (FarmSystem / CookAction / EatAction 경유)
NavigationGrid           BuildingSystem
EntityRegistry           Factory + GameEventSystem (spawnResident)
FarmState                FarmSystem
NPC.currentAction        NPCSystem
Monster.state            MonsterSystem
triggeredEvents          GameEventSystem
Objective                ObjectiveSystem
```

이 표에 없는 곳에서 해당 상태를 쓰면 안 된다.

## 87.3 population 을 두 곳에서 관리하지 않는다

이전 판은 `WorldState.population`과 `EntityRegistry.npcs.size`를
동시에 유지하려 했고 동기화 주체가 정의되지 않았다.

105장의 `WorldState ≠ EntityRegistry` 경계를 스스로 위반하는 구조였다.

이제 `population`은 `registry.npcs.size`의 파생값이며 저장되지 않는다.

---

# 88. NPC State 변경

NPC 상태는 **Action 전환으로만** 바뀐다.

```ts
// 존재하지 않는다
npcSystem.setState(npc, 'fleeing');
```

`npc.state` 필드가 없으므로 설정할 대상이 없다(31.1).

상태를 바꾸려면 Action을 교체한다.

```ts
npcSystem.setAction(npc, new FleeAction(safePosition));
```

`setAction`은 다음을 수행한다.

```text
현재 Action.cancel(npc)
    ↓
새 Action 을 currentAction 에 대입
    ↓
새 Action.start(npc, context)
```

`npc.stateLabel`은 `currentAction.stateLabel`을 읽는 getter이므로
별도 갱신이 필요하지 않다.

UI나 다른 System이 NPC Action을 직접 교체하지 않는다.

---

# 89. 건물 상태 변경

Farm과 같은 특수 건물은 별도 System을 통해 상태를 변경한다.

예:

```text
FarmSystem.plant()
FarmSystem.harvest()
```

다른 시스템이 `farm.phase = 'ready'`를 직접 수행하지 않는다.

---

# 90. World Query와 Command 구분

가능하면 개념적으로 다음을 구분한다.

Query:

```text
현재 가장 가까운 Farm은?
음식이 있는가?
이 Tile은 걸을 수 있는가?
```

Command:

```text
밭에 씨앗을 심는다.
건물을 만든다.
음식을 소비한다.
```

WorldQuery는 조회만 담당한다.

상태 변경은 해당 System이 담당한다.

---

# 91. 폴더 구조 최종안

**이 장이 폴더 구조의 정본이다.**

```text
src/
├─ main.ts
│
├─ game/
│  ├─ createGame.ts
│  ├─ config.ts
│  │
│  ├─ core/
│  │  ├─ EventBus.ts
│  │  └─ Logger.ts
│  │
│  ├─ scenes/
│  │  ├─ BootScene.ts
│  │  ├─ PreloadScene.ts
│  │  └─ WorldScene.ts
│  │
│  ├─ world/
│  │  ├─ GameWorld.ts
│  │  ├─ WorldState.ts
│  │  ├─ computeWorldState.ts
│  │  ├─ WorldQuery.ts
│  │  ├─ EntityRegistry.ts
│  │  ├─ NavigationGrid.ts
│  │  ├─ VillageGate.ts
│  │  └─ VillageStorage.ts
│  │
│  ├─ entities/              ← Phaser 를 import 하지 않는다
│  │  ├─ player/
│  │  ├─ npc/
│  │  ├─ monster/
│  │  ├─ building/
│  │  └─ resource/
│  │
│  ├─ views/                 ← Phaser 렌더 어댑터
│  │  ├─ EntityView.ts
│  │  └─ PhaserSpriteView.ts
│  │
│  ├─ systems/
│  │  ├─ input/
│  │  ├─ interaction/
│  │  ├─ inventory/
│  │  ├─ resource/
│  │  ├─ building/
│  │  │  ├─ BuildingSystem.ts
│  │  │  └─ BuildValidator.ts
│  │  ├─ pathfinding/
│  │  ├─ movement/
│  │  ├─ npc/
│  │  │  ├─ NPCSystem.ts
│  │  │  ├─ NPCDecisionSystem.ts
│  │  │  ├─ NPCSchedule.ts
│  │  │  ├─ actions/
│  │  │  └─ behaviors/
│  │  ├─ farm/
│  │  ├─ clock/
│  │  ├─ daynight/
│  │  ├─ monster/
│  │  ├─ events/
│  │  ├─ dialogue/
│  │  ├─ objective/
│  │  ├─ save/
│  │  └─ debug/
│  │
│  ├─ factories/
│  │  ├─ PlayerFactory.ts
│  │  ├─ NPCFactory.ts
│  │  ├─ MonsterFactory.ts
│  │  └─ BuildingFactory.ts
│  │
│  ├─ data/
│  │  ├─ balance.ts
│  │  ├─ buildings.ts
│  │  ├─ npcs.ts
│  │  ├─ resources.ts
│  │  ├─ events.ts
│  │  └─ dialogues.ts
│  │
│  ├─ types/
│  │  ├─ entity.ts
│  │  ├─ world.ts
│  │  ├─ npc.ts
│  │  ├─ building.ts
│  │  ├─ events.ts
│  │  └─ item.ts
│  │
│  └─ ui/
│     ├─ Hud.ts
│     ├─ DialogueBox.ts
│     ├─ BuildMenu.ts
│     ├─ ObjectivePanel.ts
│     └─ DebugPanel.ts
│
├─ shared/
│  └─ utils/                 ← 게임과 무관한 범용 유틸만
│
└─ styles/
```

## 91.1 이전 판과 달라진 점

```text
+ views/                     Entity 와 Phaser 를 분리하기 위해 추가 (9.2)
+ world/computeWorldState.ts  순수 함수로 분리 (12.3)
+ world/VillageGate.ts        입구 타일 정의 (MVP_SPEC 14.1)
- shared/types/              src/game/types/ 로 통합 (65장)
- shared/constants/          data/ 와 types/ 로 흡수
```

`MVP_SPEC.md` 73장의 폴더 구조는 이 장의 요약이다.

두 문서가 다르면 이 장을 따른다.

---

# 92. 핵심 데이터 흐름 — 건설

```text
Input
↓
BuildMenu
↓
BuildingSystem
↓
BuildValidator          (config + origin + inventory)
↓
InventorySystem         차감
↓
VillageStorage          (Farm 이면 seed 이전)
↓
BuildingFactory
↓
EntityRegistry
↓
NavigationGrid          (+ version++)
↓
EventBus                NAVIGATION_CHANGED / BUILDING_PLACED
↓
NPC / GameEvent / UI 반응
↓
WorldState.compute()    지표 재계산 (프레임 끝)
```

`WorldState`는 흐름의 **끝**에 있다.

건설이 지표를 직접 바꾸는 단계는 존재하지 않는다(87.1).

---

# 93. 핵심 데이터 흐름 — NPC

```text
GameClock
     ↓
NPCSystem
     ↓
NPCDecisionSystem
     ↓
NPCAction
     ↓
WorldQuery
     ↓
Pathfinding
     ↓
Movement
     ↓
Entity Position
```

---

# 94. 핵심 데이터 흐름 — 농업

```text
Farm 건설
↓
BUILDING_PLACED
↓
VillageStorage.seed += 3     (건설 비용의 seed)
↓
NPCContext.farm 이 채워진다
↓
Farmer Work Decision
↓
MoveToAction (밭)
↓
FarmSystem.plant()           seed -1, phase = growing
↓
GameClockSystem              totalGameMinutes 진행
↓
FarmSystem 성장 판정          growMinutes 경과 → phase = ready
↓
Farmer Decision 재평가
↓
HarvestAction
↓
FarmSystem.harvest()         crop +4, seed +1, phase = empty
↓
CROP_HARVESTED / STORAGE_CHANGED
↓
(EVENT_KITCHEN_REQUEST 조건 충족)
```

`seed`의 수지가 0이므로 밭 하나는 영구히 순환한다.

---

# 95. 핵심 데이터 흐름 — 요리

```text
VillageStorage.crop >= 2
↓
Cook Decision
↓
NPCContext.kitchen 확인
↓
MoveToAction (주방)
↓
CookAction (6초)
↓
VillageStorage.crop -= 2
VillageStorage.food += 3
↓
STORAGE_CHANGED / FOOD_COOKED
↓
(EVENT_HOUSE_REQUEST 조건 충족)
↓
WorldState.compute() → foodLevel 상승
```

---

# 96. 핵심 데이터 흐름 — 위험

```text
집 건설 완료 + dayPhase == 'night'
↓
GameEventSystem            EVENT_FIRST_MONSTER.canTrigger
↓
execute() → [{ kind: 'spawnMonsters', count: 3 }]
↓
MonsterSystem.spawn()
↓
MONSTER_SPAWNED / MONSTER_THREAT_STARTED
↓
NPCContext.threatNearby = true
↓
NPCDecisionSystem          우선순위 1단계
↓
현재 Action.cancel()
↓
FleeAction
↓
WorldQuery.findSafePosition()
↓
(몬스터 전원 Despawn)
↓
MONSTER_THREAT_ENDED       aliveMonsterCount == 0
↓
Decision 재평가 → 원래 일정으로 복귀
↓
(EVENT_BARRIER_REQUEST 조건 충족)
```

몬스터 스폰은 `GameEventSystem`이 커맨드로 요청한다.

이벤트 정의가 `MonsterSystem`을 직접 호출하지 않는다(71.1).

---

# 97. 핵심 데이터 흐름 — 진행 이벤트

```text
WorldStateView / VillageStorage / Buildings / GameTime / aliveMonsterCount
                            ↓
                      EventContext 조립
                            ↓
              GameEventDefinition.canTrigger()
                            ↓
                         true
                            ↓
              GameEventDefinition.execute()
                            ↓
                  GameEventCommand[]
                            ↓
                     GameEventSystem
                            ↓
        ┌───────────┬────────────┬──────────────┬──────────────┐
        ▼           ▼            ▼              ▼              ▼
  DialogueSystem  Objective   BuildingSystem  MonsterSystem  NPCFactory
                  System      (unlock)        (spawn)        (resident)
                            ↓
                  triggeredEvents 에 추가
                            ↓
                  GAME_EVENT_TRIGGERED emit
```

이벤트 정의는 순수 함수다.

조건을 읽고 커맨드를 반환하는 것 외에 아무 일도 하지 않는다.

---

# 98. MVP에서 사용하지 않는 아키텍처

다음 구조는 현재 프로젝트에서 사용하지 않는다.

```text
ECS Framework
Redux
Zustand
MobX
RxJS
Dependency Injection Framework
Microservice
Backend API
GraphQL
WebSocket Architecture
LLM Agent Architecture
Plugin Framework
Generic Workflow Engine
```

필요성이 확인되지 않은 복잡성은 추가하지 않는다.

---

# 99. 아키텍처 변경 규칙

AI 코딩 에이전트는 다음과 같은 변경을 임의로 수행하지 않는다.

```text
EventBus 제거
ECS 도입
Scene 구조 대폭 변경
React 도입
전역 Store 도입
Backend 추가
새 Framework 추가
```

아키텍처 변경이 필요하다면 먼저 문서에 이유를 남겨야 한다.

---

# 100. ADR

구조적으로 중요한 결정은 `docs/adr/`에 기록할 수 있다.

현재 기록된 ADR:

```text
docs/adr/
├─ 001-use-phaser-3-and-vite-spa.md
├─ 002-prefab-building-placement.md
├─ 003-no-react-for-mvp.md
├─ 004-worldstate-as-derived-projection.md
├─ 005-barrier-blocks-monsters-only.md
├─ 006-entity-view-separation.md
├─ 007-game-event-commands.md
├─ 008-action-as-single-npc-state.md
├─ 009-village-gate-build-restriction.md
└─ 010-dialogue-ends-only-updates-objective.md
```

각 ADR은 배경 / 결정 / 검토한 대안 / 예상되는 결과를 포함한다.

모든 사소한 결정에 ADR을 만들 필요는 없다.

다음 정도의 변경에만 사용한다.

```text
Game Engine 변경
State Architecture 변경
Save 구조 변경
NPC AI 방식 변경
Rendering 방식 변경
```

---

# 101. 구현 우선 원칙

코드를 작성할 때 다음 우선순위를 따른다.

```text
1. 동작한다.
2. 플레이 경험을 확인할 수 있다.
3. 테스트 가능하다.
4. 책임이 명확하다.
5. 확장 가능하다.
```

5번을 위해 1~4번을 희생하지 않는다.

---

# 102. AI 코딩 에이전트 개발 규칙

각 Task를 시작할 때 다음 과정을 따른다.

```text
1. docs/project/TASKS.md 에서 Task 와 Acceptance Criteria 확인
2. docs/project/MVP_SPEC.md 에서 수치와 조건 확인
3. docs/project/ARCHITECTURE.md 에서 책임 위치와 인터페이스 확인
4. 필요하면 docs/project/GAME_DESIGN.md 에서 의도 확인
5. 구현
6. 테스트 작성 및 통과
7. 브라우저에서 실행 확인
8. 주요 결정이 있었다면 docs/adr/ 에 ADR 추가
9. docs/state/ 에 완료 기록과 다음 할 일 작성
10. commit
```

## 102.1 문서가 서로 다르면

```text
수치 / 조건식       →  MVP_SPEC.md
인터페이스 / 구조    →  ARCHITECTURE.md
작업 순서 / 완료 조건 →  TASKS.md
의도 / 감정 목표     →  GAME_DESIGN.md
```

## 102.2 문서와 코드가 다르면

문서를 먼저 고친다.

코드만 고치고 문서를 남겨두면 다음 Task에서 같은 모순을 다시 만난다.

---

# 103. 파일 생성 규칙

새 파일을 만들기 전에 확인한다.

```text
이 책임을 이미 담당하는 파일이 있는가?
```

있다면 기존 파일을 확장한다.

없다면 새 파일을 만든다.

단순히 코드를 나누기 위한 목적으로 지나치게 많은 파일을 만들지 않는다.

---

# 104. 시스템 분리 판단 기준

새로운 System을 만들기 전에 다음을 확인한다.

```text
별도의 상태를 가지는가?

독립적인 Gameplay 규칙을 가지는가?

다른 기능에서도 사용되는가?

테스트 단위로 분리할 가치가 있는가?
```

대부분 `아니오`라면 기존 System 내부에 두는 것을 우선한다.

---

# 105. 현재 MVP에서 특히 중요한 경계

다음 경계는 반드시 유지한다.

```text
Scene ≠ Gameplay Logic

Entity ≠ AI Logic

UI ≠ Game State

Pathfinding ≠ Movement

GameClock ≠ Day/Night Rendering

EventBus ≠ Story Event System

WorldState ≠ Entity Registry

WorldQuery ≠ State Mutation
```

이 경계가 무너지면 프로젝트 구조가 빠르게 복잡해진다.

---

# 106. 최종 아키텍처 목표

MVP의 핵심 플레이가 다음과 같이 자연스럽게 연결되어야 한다.

```text
PLAYER
  │
  │ Build
  ▼
BUILDING SYSTEM
  │
  ├──────► WORLD STATE
  │
  ├──────► NAVIGATION
  │
  └──────► EVENT BUS
                 │
                 ▼
            NPC SYSTEM
                 │
                 ▼
            NPC ACTION
                 │
                 ▼
              WORLD
                 │
                 ▼
        PLAYER SEES CHANGE
```

가장 중요한 결과는 코드 구조 그 자체가 아니다.

아키텍처는 결국 다음 경험을 가능하게 하기 위한 수단이다.

> 플레이어가 무언가를 만들면, 그 결과로 주민들의 삶이 달라지고, 그 변화가 눈앞에서 보인다.

이 연결이 단순하고 안정적으로 구현될 수 있도록 모든 시스템을 설계한다.
