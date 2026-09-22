# ARCHITECTURE.md

# Small Village Restoration Game — Architecture Guide

Version: 0.1
Status: Initial MVP Architecture
Related Documents:

```text
GAME_DESIGN.md
MVP_SPEC.md
ARCHITECTURE.md
TASKS.md
```

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
┌──────────────────────────────┐
│          Presentation        │
│     Phaser Scene / UI        │
├──────────────────────────────┤
│           Entities           │
│ Player / NPC / Monster       │
├──────────────────────────────┤
│           Systems            │
│ AI / Building / Clock / etc  │
├──────────────────────────────┤
│          World Model         │
│ State / Query / Navigation   │
├──────────────────────────────┤
│            Data              │
│ Config / Balance / Content   │
└──────────────────────────────┘
```

각 계층은 아래 계층에 의존할 수 있다.

반대 방향의 의존성은 최소화한다.

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
  FARM_BUILT: {
    buildingId: string;
  };

  KITCHEN_BUILT: {
    buildingId: string;
  };

  HOUSE_BUILT: {
    buildingId: string;
  };

  BARRIER_BUILT: {
    buildingId: string;
  };

  CROP_HARVESTED: {
    amount: number;
  };

  FOOD_COOKED: {
    amount: number;
  };

  MONSTER_SPAWNED: {
    monsterId: string;
  };

  MONSTER_THREAT_STARTED: undefined;

  MONSTER_THREAT_ENDED: undefined;

  NEW_RESIDENT_ARRIVED: undefined;
}
```

권장 구현:

```ts
class EventBus<TEventMap> {
  on<K extends keyof TEventMap>(
    event: K,
    listener: (payload: TEventMap[K]) => void
  ): void;

  off<K extends keyof TEventMap>(
    event: K,
    listener: (payload: TEventMap[K]) => void
  ): void;

  emit<K extends keyof TEventMap>(
    event: K,
    payload: TEventMap[K]
  ): void;
}
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

즉, EventBus는 "도메인 사건"에만 사용한다.

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
- Position
- Sprite
- 현재 상태
- 간단한 데이터
```

Entity는 복잡한 판단을 하지 않는다.

예:

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

`WorldState`는 마을 전체의 추상적 상태를 저장한다.

위치:

```text
src/game/world/WorldState.ts
```

예:

```ts
export interface WorldStateData {
  foodLevel: number;
  safetyLevel: number;
  housingLevel: number;
  happinessLevel: number;
  population: number;
}
```

WorldState는 단순 데이터 객체보다 약간의 도메인 메서드를 제공할 수 있다.

예:

```ts
export class WorldState {
  private state: WorldStateData;

  increaseFood(amount: number): void {}
  increaseSafety(amount: number): void {}
  increaseHousing(amount: number): void {}
}
```

단, NPC AI나 Event 조건 로직까지 넣지 않는다.

---

# 13. WorldQuery

다른 시스템이 월드 정보를 직접 뒤지는 것을 방지하기 위해 `WorldQuery`를 둔다.

위치:

```text
src/game/world/WorldQuery.ts
```

예:

```ts
findNearestBuilding(
  position: GridPosition,
  type: BuildingType
): Building | null;

findNearestFood(
  position: GridPosition
): FoodSource | null;

findSafePosition(
  from: GridPosition
): GridPosition | null;

isMonsterNearby(
  position: GridPosition,
  radius: number
): boolean;
```

NPCSystem은 Registry 내부 구조를 직접 탐색하지 않고 가능하면 WorldQuery를 사용한다.

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
gridToWorld(position: GridPosition): WorldPosition;

worldToGrid(position: WorldPosition): GridPosition;
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
Walkable
Blocked
Building
Barrier
MapCollision
```

예:

```ts
isWalkable(position: GridPosition): boolean;

setBlocked(position: GridPosition): void;

setWalkable(position: GridPosition): void;
```

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

실제 Entity 이동은 별도의 MovementController 또는 MovementSystem이 담당한다.

예:

```ts
moveAlongPath(
  entity: MovableEntity,
  path: GridPosition[]
): void;
```

이렇게 하면 다음 책임이 분리된다.

```text
PathfindingSystem
= 어디로 갈지 경로 계산

Movement
= 실제 이동 처리
```

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

예:

```ts
export interface BuildingConfig {
  type: BuildingType;
  width: number;
  height: number;
  cost: Partial<Record<ItemId, number>>;
  worldStateEffects: Partial<WorldStateData>;
}
```

예:

```ts
farm: {
  width: 3,
  height: 3,
  cost: {
    wood: 6,
    stone: 2
  }
}
```

---

# 25. Building Placement 흐름

건설 과정:

```text
Player presses B
↓
Build Menu
↓
Building 선택
↓
Build Mode
↓
Mouse 위치 → Grid Position
↓
BuildValidator
↓
Valid / Invalid Preview
↓
Click
↓
Resource 확인
↓
Building 생성
↓
Inventory 감소
↓
NavigationGrid 갱신
↓
WorldState 변경
↓
Domain Event emit
```

---

# 26. BuildValidator

배치 판단은 BuildingSystem 내부에 길게 작성하지 않는다.

별도의 `BuildValidator`로 분리한다.

위치:

```text
src/game/systems/building/BuildValidator.ts
```

예:

```ts
validate(
  config: BuildingConfig,
  position: GridPosition
): BuildValidationResult;
```

결과:

```ts
interface BuildValidationResult {
  valid: boolean;
  reason?: BuildInvalidReason;
}
```

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

기본 우선순위:

```text
1. 위험
2. 생존
3. 필수 스케줄
4. 직업 행동
5. Idle / 자유 행동
```

예:

```ts
decide(npc: NPC, context: NPCContext): NPCAction;
```

---

# 30. NPCContext

Decision이 필요한 정보는 Context 형태로 제공한다.

예:

```ts
interface NPCContext {
  gameTime: GameTime;
  monsterNearby: boolean;
  foodAvailable: boolean;
  assignedWorkplaceExists: boolean;
  houseExists: boolean;
}
```

NPCDecisionSystem이 Scene이나 Registry를 무분별하게 직접 참조하지 않도록 한다.

---

# 31. NPC Action

NPC 행동은 Action 단위로 구현한다.

예:

```text
IdleAction
MoveToAction
FarmAction
HarvestAction
CollectCropAction
CookAction
EatAction
SleepAction
FleeAction
TalkAction
```

공통 Interface:

```ts
interface NPCAction {
  start(npc: NPC): void;

  update(
    npc: NPC,
    delta: number
  ): ActionStatus;

  cancel(npc: NPC): void;
}
```

상태:

```ts
type ActionStatus =
  | 'running'
  | 'success'
  | 'failed';
```

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

예:

```ts
interface ScheduleEntry {
  startHour: number;
  activity: ScheduledActivity;
}
```

예:

```text
06:00 wake
07:00 eat
08:00 work
12:00 eat
13:00 work
18:00 eat
20:00 free
22:00 sleep
```

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
Farm 존재 확인
↓
Farm으로 이동
↓
Farm 상태 확인
↓
Empty → Plant
Growing → Wait / other task
Ready → Harvest
↓
Crop 증가
```

농부는 Farm Entity 내부 상태를 직접 임의 수정하지 않는다.

가능하면 Farm 관련 도메인 메서드를 사용한다.

---

# 36. Farm 상태

Farm 상태는 Building 자체 또는 FarmComponent에 저장할 수 있다.

MVP 권장 구조:

```ts
interface FarmState {
  phase: 'empty' | 'planted' | 'growing' | 'ready';
  plantedAt?: number;
}
```

Farm 생산 로직은 `FarmSystem`으로 분리해도 된다.

MVP 초기에는 `BuildingSystem`과 분리된 작은 `FarmSystem`을 권장한다.

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

MVP에서 Crop과 Food는 월드에 실제 Item Entity로 대량 생성하지 않아도 된다.

단순 저장소 형태를 사용할 수 있다.

예:

```ts
interface VillageStorage {
  crop: number;
  food: number;
}
```

위치:

```text
src/game/world/VillageStorage.ts
```

이렇게 하면 MVP 구현이 단순해진다.

---

# 39. Cook 흐름

```text
Work Time
↓
Crop 존재 확인
↓
Kitchen 존재 확인
↓
Kitchen 이동
↓
Cooking Action
↓
Crop 감소
↓
Food 증가
↓
FOOD_COOKED emit
```

---

# 40. Eating 흐름

NPC가 식사 시간에 다음을 수행한다.

```text
Food 존재?
↓
YES
↓
식사 위치 이동
↓
EatAction
↓
Food 감소
↓
NPC 상태 정상화
```

MVP에서는 Hunger 수치를 복잡하게 구현하지 않는다.

일정 기반 식사를 우선한다.

---

# 41. Sleep 흐름

```text
22:00
↓
House 존재 확인
↓
House 이동
↓
Door Position 도착
↓
NPC Sprite 숨김
↓
Sleeping
↓
06:00
↓
NPC Sprite 표시
↓
House 출구에서 활동 시작
```

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

# 45. DayNightSystem

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
- Monster Spawn
- Village Target 설정
- Pathfinding
- 이동
- Barrier 충돌
- Threat 상태
- Despawn
```

Monster 종류는 MVP에서 하나만 사용한다.

---

# 47. Monster AI

Monster AI는 단순하다.

```text
Spawn
↓
Village Entry 방향 이동
↓
Path blocked?
↓
Barrier 공격 또는 정지
↓
시간 종료
↓
Despawn
```

플레이어 전투는 고려하지 않는다.

---

# 48. ThreatSystem

위험 여부를 NPC가 직접 Monster 목록에서 계산하지 않도록 한다.

MonsterSystem 또는 별도의 ThreatSystem이 다음 정보를 제공한다.

```ts
isThreatActive(): boolean;

isThreatNear(
  position: GridPosition,
  radius: number
): boolean;
```

NPCDecisionSystem은 이를 통해 Flee 판단을 한다.

---

# 49. FleeAction

NPC가 Monster를 감지하면:

```text
현재 Action cancel
↓
SafePosition 검색
↓
Pathfinding
↓
Flee
↓
Threat 종료
↓
Decision 재평가
```

이전 작업을 정확히 이어갈 필요는 없다.

다시 Decision을 수행하면 된다.

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

예:

```ts
interface GameEventDefinition {
  id: GameEventId;
  once: boolean;

  canTrigger(context: EventContext): boolean;

  execute(context: EventContext): void;
}
```

---

# 52. EventContext

```ts
interface EventContext {
  worldState: WorldState;
  worldQuery: WorldQuery;
  gameTime: GameTime;
  triggeredEvents: ReadonlySet<GameEventId>;
}
```

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
- 대화 종료
```

스토리 조건을 직접 결정하지 않는다.

GameEventSystem에서 Dialogue 요청을 보낸다.

---

# 56. ObjectiveSystem

현재 주요 목표 하나만 관리한다.

위치:

```text
src/game/systems/objective/ObjectiveSystem.ts
```

예:

```ts
interface Objective {
  id: string;
  text: string;
}
```

GameEventSystem이 Objective를 변경할 수 있다.

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

예:

```ts
interface SaveData {
  version: number;

  player: {
    position: GridPosition;
  };

  inventory: InventoryState;

  buildings: SavedBuilding[];

  worldState: WorldStateData;

  gameClock: {
    totalGameMinutes: number;
  };

  triggeredEvents: string[];

  villageStorage: {
    crop: number;
    food: number;
  };
}
```

NPC runtime path나 현재 animation frame 등은 저장할 필요가 없다.

---

# 61. Load 전략

Load 시:

```text
SaveData 읽기
↓
Map 기본 생성
↓
Building 복원
↓
NavigationGrid 재생성
↓
WorldState 복원
↓
NPC 기본 생성
↓
현재 시간 복원
↓
NPC Decision 재실행
```

NPC의 현재 행동을 완전히 복원할 필요는 없다.

---

# 62. Data Layer

위치:

```text
src/game/data/
```

파일 예:

```text
buildings.ts
resources.ts
npcs.ts
events.ts
balance.ts
dialogues.ts
```

게임 밸런스 값은 가능한 한 이곳에 둔다.

---

# 63. balance.ts 예

```ts
export const GAME_BALANCE = {
  gameClock: {
    realSecondsPerGameHour: 20
  },

  player: {
    moveSpeed: 160
  },

  npc: {
    moveSpeed: 90
  },

  monster: {
    moveSpeed: 70,
    threatRadius: 6
  },

  farm: {
    growMinutes: 120
  }
} as const;
```

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
if (distance < GAME_BALANCE.monster.threatRadiusPx) {
}
```

모든 값을 무조건 config로 만들 필요는 없지만 Gameplay 수치는 config로 분리한다.

---

# 65. 공통 Type

위치:

```text
src/shared/types/
```

또는 게임 전용 타입은:

```text
src/game/types/
```

다음 타입을 명확하게 정의한다.

```text
GridPosition
WorldPosition
EntityId
BuildingType
NPCRole
NPCState
NPCAction
GameTime
GameEventId
ItemId
```

string을 아무 곳에서나 직접 사용하지 않는다.

---

# 66. 시스템 Update 순서

GameWorld의 update 순서는 고정한다.

권장:

```text
1. InputSystem
2. GameClockSystem
3. ResourceSystem
4. FarmSystem
5. MonsterSystem
6. NPCSystem
7. BuildingSystem
8. GameEventSystem
9. Visual Systems
10. DebugSystem
```

BuildingSystem은 대부분 Input Event 기반이라 매 프레임 처리량은 작다.

정확한 순서는 구현 과정에서 조정 가능하지만 명시적으로 관리한다.

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
NPCSystem → PathfindingSystem
BuildingSystem → InventorySystem
BuildingSystem → NavigationGrid
GameEventSystem → WorldState
```

직접 참조를 피해야 하는 경우:

```text
FarmSystem → DialogueBox
NPC → EventSystem
Monster → HUD
Kitchen → ObjectivePanel
```

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
InventorySystem
BuildValidator
WorldState
GameClockSystem
Pathfinding
NPCDecisionSystem
FarmSystem
GameEventSystem
```

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

Map Collision → Invalid

기존 Building 겹침 → Invalid

자원 부족 → Invalid

맵 밖 → Invalid
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
findNearestFarm(): Building | null;
```

undefined와 null을 혼용하지 않는다.

프로젝트 전체에서 하나의 기준을 사용한다.

권장: "검색 결과 없음"은 `null`.

---

# 87. State Mutation 원칙

여러 시스템이 같은 데이터를 직접 수정하지 않는다.

예:

WorldState는 WorldState API를 통해 변경한다.

```text
BuildingSystem
↓
worldState.increaseSafety()
```

다음 형태를 피한다.

```ts
worldState.data.safetyLevel += 10;
```

---

# 88. NPC State 변경

NPC 상태도 가능하면 NPCSystem을 통해 변경한다.

예:

```ts
npcSystem.setState(npc, 'fleeing');
```

또는 Action 전환 과정에서 내부적으로 변경한다.

UI나 다른 System이 NPC State를 직접 수정하지 않는다.

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
│  │  ├─ WorldQuery.ts
│  │  ├─ EntityRegistry.ts
│  │  ├─ NavigationGrid.ts
│  │  └─ VillageStorage.ts
│  │
│  ├─ entities/
│  │  ├─ player/
│  │  ├─ npc/
│  │  ├─ monster/
│  │  ├─ building/
│  │  └─ resource/
│  │
│  ├─ systems/
│  │  ├─ input/
│  │  ├─ interaction/
│  │  ├─ inventory/
│  │  ├─ resource/
│  │  ├─ building/
│  │  ├─ pathfinding/
│  │  ├─ movement/
│  │  ├─ npc/
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
│  │  └─ events.ts
│  │
│  └─ ui/
│     ├─ Hud.ts
│     ├─ DialogueBox.ts
│     ├─ BuildMenu.ts
│     ├─ ObjectivePanel.ts
│     └─ DebugPanel.ts
│
├─ shared/
│  └─ utils/
│
└─ styles/
```

---

# 92. 핵심 데이터 흐름 — 건설

```text
Input
↓
BuildMenu
↓
BuildingSystem
↓
BuildValidator
↓
InventorySystem
↓
BuildingFactory
↓
EntityRegistry
↓
NavigationGrid
↓
WorldState
↓
EventBus
↓
NPC / Event / UI 반응
```

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
Farm Built
↓
EventBus
↓
NPC가 Farm 인식
↓
Farmer Work Decision
↓
MoveTo Farm
↓
FarmSystem.plant()
↓
GameClock
↓
FarmSystem Growing
↓
Ready
↓
Farmer Harvest
↓
VillageStorage.crop++
```

---

# 95. 핵심 데이터 흐름 — 요리

```text
VillageStorage.crop > 0
↓
Cook Decision
↓
Kitchen 검색
↓
Kitchen 이동
↓
CookAction
↓
VillageStorage.crop--
↓
VillageStorage.food++
↓
FOOD_COOKED
```

---

# 96. 핵심 데이터 흐름 — 위험

```text
GameClock = Night
↓
GameEventSystem
↓
MonsterSystem.spawn()
↓
MONSTER_THREAT_STARTED
↓
NPCDecisionSystem
↓
FleeAction
↓
SafePosition
```

---

# 97. 핵심 데이터 흐름 — 진행 이벤트

```text
World State / Building / Time
            ↓
      GameEventSystem
            ↓
      Condition Check
            ↓
          Trigger
            ↓
Dialogue / Objective / Monster / NPC
```

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

예:

```text
docs/
└─ adr/
   ├─ 001-use-phaser-3.md
   ├─ 002-use-prefab-building.md
   └─ 003-no-react-for-mvp.md
```

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
1. GAME_DESIGN.md 확인
2. MVP_SPEC.md 해당 기능 확인
3. ARCHITECTURE.md 책임 위치 확인
4. TASKS.md Acceptance Criteria 확인
5. 구현
6. 테스트
7. 실행 확인
8. Task 완료 기록
```

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
