# MVP_SPEC.md

# Small Village Restoration Game — MVP Specification

Version: 0.1
Status: Initial MVP
Target: Desktop Web Browser
Genre: 2D Top-down Village Restoration / Life Simulation

---

# 1. 문서 목적

이 문서는 `GAME_DESIGN.md`에서 정의한 게임 경험을 실제로 구현하기 위한 MVP 개발 명세이다.

AI 코딩 에이전트는 개발을 시작하기 전에 다음 문서를 순서대로 읽는다.

```text
GAME_DESIGN.md
    ↓
MVP_SPEC.md
    ↓
ARCHITECTURE.md
    ↓
TASKS.md
```

각 문서의 역할은 다음과 같다.

```text
GAME_DESIGN.md
왜 이 게임을 만드는가?
무엇이 재미여야 하는가?

MVP_SPEC.md
첫 버전에서 정확히 무엇을 만드는가?

ARCHITECTURE.md
각 시스템을 어떤 코드 구조로 구현하는가?

TASKS.md
무엇을 어떤 순서로 구현하는가?
```

이 문서에서 정의하지 않은 기능은 원칙적으로 MVP에 포함하지 않는다.

---

# 2. MVP의 최종 목표

플레이어가 약 20~30분 동안 플레이한 뒤 다음 감정을 느끼는 것을 목표로 한다.

> 내가 만든 것 때문에 이 사람들이 살아가기 시작했다.

그리고 이어서 다음 생각이 자연스럽게 발생해야 한다.

> 이 마을을 조금 더 키워보고 싶다.

MVP는 게임의 크기를 검증하지 않는다.

다음 핵심 루프가 재미있는지를 검증한다.

```text
문제 발생
    ↓
주민이 문제 표현
    ↓
탐험 / 자원 수집
    ↓
건설
    ↓
주민 행동 변화
    ↓
마을 모습 변화
    ↓
새로운 사건
```

핵심 루프:

```text
Problem
  ↓
Explore
  ↓
Build
  ↓
Life
  ↓
Change
```

---

# 3. 가장 중요한 개발 원칙

## 3.1 기능보다 반응을 먼저 만든다

새로운 기능을 추가하기 전에 기존 플레이어 행동에 대한 NPC와 월드의 반응을 먼저 만든다.

예:

잘못된 우선순위:

```text
건물 20개
아이템 100개
NPC 30명
```

올바른 우선순위:

```text
밭 1개
    ↓
농부가 발견
    ↓
밭으로 이동
    ↓
농사
    ↓
작물 생성
    ↓
요리사가 작물 사용
    ↓
주민이 음식 섭취
```

콘텐츠 개수보다 연결성이 중요하다.

---

# 4. 플랫폼

MVP 대상 플랫폼은 Desktop Web Browser이다.

우선 지원:

* Chrome
* Edge
* Chromium 기반 브라우저

게임패드를 지원하며, 키보드와 마우스를 기본 입력 장치로 사용한다.

모바일 지원은 MVP 범위에서 제외한다.

서버는 사용하지 않는다.

게임 전체가 클라이언트에서 실행되어야 한다.

---

# 5. 기술 스택

## Runtime

```text
Node.js 24 LTS
```

## Package Manager

```text
pnpm
```

프로젝트 생성 이후 `pnpm-lock.yaml`을 반드시 커밋한다.

패키지 버전을 임의로 올리지 않는다.

---

## Language

```text
TypeScript
```

TypeScript는 strict mode를 사용한다.

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

다음 사용을 원칙적으로 금지한다.

```text
any
@ts-ignore
@ts-nocheck
```

불가피한 경우 반드시 이유를 주석으로 남긴다.

---

# 6. Game Engine

게임 엔진:

```text
Phaser 3.90.0
```

MVP에서는 Phaser 4로 업그레이드하지 않는다.

게임의 다음 기능은 Phaser가 담당한다.

* Canvas Rendering
* Scene
* Sprite
* Animation
* Input
* Camera
* Tilemap
* Collision
* Audio
* Particle
* Game Loop

---

# 7. Build Tool

```text
Vite 8.x
```

프로젝트는 SPA 형태로 빌드한다.

Next.js를 사용하지 않는다.

React 역시 MVP에서는 사용하지 않는다.

게임 UI는 Phaser 또는 필요한 최소한의 HTML/CSS UI로 구현한다.

MVP 단계에서 React를 포함하지 않는 이유는 게임 상태와 React 상태를 이중으로 관리하는 복잡성을 만들지 않기 위해서다.

---

# 8. Map Editor

맵 제작 도구:

```text
Tiled 1.12.x
```

Tiled에서 제작한 맵을 JSON 형식으로 export하여 사용한다.

맵에서는 최소한 다음 Layer를 사용한다.

```text
Ground
GroundDecoration
Objects
Buildings
Collision
SpawnPoints
Interaction
```

---

# 9. 테스트

게임 로직 테스트:

```text
Vitest
```

특히 다음 로직은 Phaser Scene과 분리하여 테스트 가능하도록 작성한다.

* Inventory
* WorldState
* GameClock
* EventCondition
* BuildValidation
* NPC State 결정
* Resource 계산

렌더링 자체에 대한 자동 테스트는 MVP 필수 조건이 아니다.

---

# 10. MVP 게임 표현 방식

게임은 다음 형태의 2D Top-down 게임으로 구현한다.

```text
       북

        ↑

서 ← Player → 동

        ↓

       남
```

그래픽 스타일은 MVP 단계에서 Pixel Art Placeholder를 허용한다.

중요한 것은 그래픽 품질이 아니라 행동이 시각적으로 구분되는 것이다.

---

# 11. 기본 해상도

게임 논리 해상도:

```text
1280 × 720
```

브라우저 크기에 따라 비율을 유지하면서 Scale한다.

화면 비율:

```text
16:9
```

---

# 12. Tile 크기

기본 Tile:

```text
32 × 32 px
```

모든 주요 월드 좌표는 Tile Grid를 기준으로 한다.

예:

```text
Tile (10, 5)

↓

World Position

x = 320
y = 160
```

---

# 13. MVP 월드 크기

기본 테스트 맵:

```text
64 × 64 tiles
```

실제 월드 크기:

```text
2048 × 2048 px
```

MVP에서는 하나의 맵만 존재한다.

---

# 14. 월드 구성

맵은 크게 다섯 영역으로 구성한다.

```text
        숲

         │
         │

채석장 ─ 마을 ─ 물가

         │
         │

      위험 지역
```

## Village

핵심 플레이 공간.

포함:

* 폐허
* 기존 NPC
* 건설 가능 공간
* 광장
* 무너진 밭

---

## Forest

주요 획득 자원:

```text
Wood
Seed
```

---

## Quarry

주요 획득 자원:

```text
Stone
```

---

## Water Area

MVP에서는 탐험용 공간이다.

추후 낚시 등의 기능을 추가할 수 있지만 MVP에서는 구현하지 않는다.

---

## Dangerous Area

밤이 되면 몬스터가 접근하는 방향이다.

---

# 15. 플레이어

플레이어는 하나의 캐릭터를 조작한다.

필수 기능:

* 이동
* 자원 채집
* NPC 대화
* 건설
* 오브젝트 상호작용

---

# 16. 플레이어 이동

기본 키:

```text
W / ↑ = Up

S / ↓ = Down

A / ← = Left

D / → = Right
```

대각선 이동을 지원한다.

대각선 이동 속도가 직선보다 빨라지지 않도록 normalize한다.

---

# 17. 상호작용

기본 Interaction Key:

```text
E
```

사용 대상:

* NPC
* Resource
* Building
* Interactive Object

상호작용 가능한 대상 근처에서는 간단한 표시를 보여준다.

예:

```text
[E] 대화
```

또는

```text
[E] 채집
```

---

# 18. 건설 모드

건설 메뉴 키:

```text
B
```

건물을 선택하면 Build Mode에 진입한다.

Build Mode에서는 마우스를 사용하여 위치를 선택한다.

건물은 Tile Grid에 Snap된다.

---

# 19. 건설 Preview

배치 전 건물의 Ghost Preview를 표시한다.

배치 가능한 경우:

```text
Valid
```

배치 불가능한 경우:

```text
Invalid
```

판단 조건:

* 다른 건물과 충돌하지 않는가?
* Collision Tile이 아닌가?
* 플레이 가능 영역인가?
* 필요한 Resource가 있는가?

---

# 20. MVP에서는 자유 블록 건설을 구현하지 않는다

드래곤 퀘스트 빌더즈 스타일의 블록 단위 자유 건축은 MVP 범위에서 제외한다.

MVP에서는 다음 방식만 사용한다.

```text
Prefab Building Placement
```

예:

```text
Farm
Kitchen
House
Barrier
```

이유는 자유 건축 시스템이 핵심 재미 검증보다 훨씬 많은 개발 비용을 필요로 하기 때문이다.

MVP의 목적은

```text
건설 → 주민 행동 변화
```

가 재미있는지를 검증하는 것이다.

자유 건축은 MVP 성공 이후 검토한다.

---

# 21. Resource

초기 자원 종류는 다음과 같다.

```text
Wood
Stone
Seed
```

생산 결과물:

```text
Crop
Food
```

`Crop`, `Food`는 초기에는 플레이어 직접 자원과 분리할 수 있다.

---

# 22. 자원 채집

## Tree

획득:

```text
Wood
```

---

## Rock

획득:

```text
Stone
```

---

## Wild Plant

획득:

```text
Seed
```

채집 시 대상은 사라지고 일정 시간이 지나면 Respawn할 수 있다.

단, Respawn 시스템은 간단하게 구현한다.

---

# 23. Inventory

플레이어 Inventory는 수량 기반으로 구현한다.

예:

```ts
{
  wood: 12,
  stone: 8,
  seed: 4
}
```

MVP에서는 다음 기능을 구현하지 않는다.

* 무게
* Inventory slot
* Item durability
* Item rarity
* 장비
* 아이템 정렬

---

# 24. MVP 건물

건물은 정확히 네 종류만 구현한다.

```text
Farm
Kitchen
House
Barrier
```

---

# 25. Farm

기본 크기:

```text
3 × 3 Tiles
```

Farm 활성화 조건:

```text
Farm Built
AND
Farmer Alive
```

Farm 완성 후 농부가 농사를 시작한다.

---

# 26. Farm Life Cycle

Farm은 다음 상태를 가진다.

```text
Empty
↓
Planted
↓
Growing
↓
Ready
↓
Harvested
↓
Empty
```

NPC가 다음 과정을 반복한다.

```text
밭으로 이동
↓
씨앗 심기
↓
대기
↓
작물 확인
↓
수확
```

---

# 27. Kitchen

기본 크기:

```text
2 × 2 Tiles
```

Kitchen이 만들어지면 Cook NPC 행동이 활성화된다.

```text
Crop 존재 확인
↓
Crop 가져오기
↓
Kitchen 이동
↓
Cooking
↓
Food 생성
```

조리 과정은 애니메이션 또는 Timer로 표현한다.

---

# 28. House

기본 크기:

```text
4 × 4 Tiles
```

House에는 침대 기능을 내장한다.

MVP에서는 건물 내부를 별도 Scene으로 만들지 않는다.

밤이 되면 NPC가 House에 접근하고 취침 상태로 변경된다.

시각적으로는 다음 중 하나를 사용한다.

```text
NPC가 문으로 들어간 뒤 숨김
```

또는

```text
건물 내부가 보이는 형태
```

첫 구현에서는 전자를 사용한다.

---

# 29. Barrier

크기:

```text
1 × 1 Tile
```

Barrier는 여러 개를 연속해서 설치할 수 있다.

Barrier Tile은 Monster에게 이동 불가능한 Tile이다.

플레이어와 주민에게는 설정에 따라 이동 가능 여부를 결정한다.

MVP 기본값은 모든 Entity에게 Collision이다.

---

# 30. NPC

초기 NPC는 정확히 세 명이다.

```text
Farmer
Cook
Carpenter
```

NPC 추가는 MVP 완료 이전에 금지한다.

---

# 31. Farmer

역할:

```text
농업
```

주요 행동:

```text
Idle
Move
Farm
Eat
Sleep
Flee
Talk
```

---

# 32. Cook

역할:

```text
요리
```

주요 행동:

```text
Idle
Move
CollectCrop
Cook
Eat
Sleep
Flee
Talk
```

---

# 33. Carpenter

역할:

```text
마을 관리 / 방어 이벤트
```

주요 행동:

```text
Idle
Move
Inspect
Eat
Sleep
Flee
Talk
```

향후 자동 건설이나 수리 기능으로 확장할 수 있으나 MVP에는 포함하지 않는다.

---

# 34. NPC AI 목표

NPC가 실제 인간처럼 생각하는 시스템을 만들지 않는다.

목표는 다음 하나이다.

> 플레이어가 보기에는 주민이 자신의 목적을 가지고 살아가는 것처럼 보여야 한다.

---

# 35. NPC State

기본 State:

```ts
type NPCState =
  | 'idle'
  | 'moving'
  | 'working'
  | 'eating'
  | 'sleeping'
  | 'fleeing'
  | 'talking';
```

직업별 State를 추가할 수 있다.

예:

```text
planting
harvesting
cooking
```

---

# 36. NPC AI 방식

MVP에서는 다음 방식을 조합한다.

```text
Schedule
+
Finite State Machine
+
Priority Decision
```

LLM은 사용하지 않는다.

복잡한 Behavior Tree도 MVP에서는 사용하지 않는다.

---

# 37. NPC Priority

NPC 행동은 우선순위에 의해 결정한다.

예:

```text
1. 위험 회피
2. 생존 행동
3. 일정 행동
4. 직업 행동
5. 자유 행동
```

예:

```text
Monster Nearby

→ Farm 작업 취소

→ Flee
```

---

# 38. NPC 이동

NPC는 Tile 기반 Pathfinding을 사용한다.

기본 알고리즘:

```text
A*
```

Pathfinding은 Grid 기반으로 작성한다.

MVP에서는 별도 Pathfinding Dependency를 필수로 사용하지 않는다.

가능하면 프로젝트 내부의 단순 A* 구현으로 시작한다.

Navigation Grid는 다음 정보를 고려한다.

```text
Map Collision
Buildings
Barrier
Temporary Obstacle
```

---

# 39. NPC 생활 시간표

주민에게 기본 생활 패턴을 제공한다.

예:

```text
06:00 Wake Up

07:00 Breakfast

08:00 Work

12:00 Lunch

13:00 Work

18:00 Dinner

20:00 Free Time

22:00 Sleep
```

정확한 시간은 향후 플레이 테스트로 조정한다.

---

# 40. Game Clock

게임 내부 시간을 구현한다.

기본 속도:

```text
1 Game Hour = 20 Real Seconds
```

따라서 한 게임 하루는 약:

```text
8 Real Minutes
```

게임 시작 시간:

```text
08:00
```

Time Scale은 설정값으로 분리한다.

하드코딩하지 않는다.

---

# 41. Day / Night

시간에 따라 화면 환경이 변화한다.

```text
06:00 Morning

08:00 Day

18:00 Evening

20:00 Night
```

최소한 다음 차이를 표현한다.

* 밝기
* 하늘/화면 Tint
* 집 조명
* NPC 행동
* Monster Spawn

---

# 42. World State

게임 전체 상태를 표현하는 World State 시스템을 구현한다.

최소 상태:

```ts
interface WorldState {
  foodLevel: number;
  safetyLevel: number;
  housingLevel: number;
  happinessLevel: number;
  population: number;
}
```

값의 기본 범위:

```text
0 ~ 100
```

population 제외.

---

# 43. 건물과 World State

예:

```text
Farm

foodProduction 증가
```

```text
Kitchen

foodEfficiency 증가
happiness 증가
```

```text
House

housing 증가
happiness 증가
```

```text
Barrier

safety 증가
```

수치는 `data` 설정 파일에서 조정 가능하도록 한다.

---

# 44. Event System

Event는 특정 조건이 충족되면 발생한다.

구조 예:

```ts
interface GameEvent {
  id: string;
  condition: () => boolean;
  trigger: () => void;
  once: boolean;
}
```

실제 구현 구조는 `ARCHITECTURE.md`에서 정의한다.

---

# 45. MVP 필수 이벤트

MVP에서는 다음 주요 이벤트만 구현한다.

```text
EVENT_FARM_REQUEST
EVENT_KITCHEN_REQUEST
EVENT_HOUSE_REQUEST
EVENT_FIRST_MONSTER
EVENT_BARRIER_REQUEST
EVENT_NEW_RESIDENT
```

---

# 46. 첫 플레이 시나리오

게임 시작 시 플레이어가 폐허 마을에 도착한다.

마을에는 세 주민이 존재한다.

```text
Farmer
Cook
Carpenter
```

마을은 조용하고 일부 시설이 파괴되어 있다.

---

# 47. Phase 1 — Farm

Farmer가 플레이어에게 문제를 이야기한다.

```text
"밭이 망가져서 먹을 것을 만들 수 없어."
```

목표 표시:

```text
밭을 복구하세요.
```

플레이어가 주변에서 자원을 수집한다.

Farm을 건설한다.

---

# 48. Farm 완료 연출

Farm이 완성되는 즉시 Farmer가 반응해야 한다.

Farmer가 Farm을 발견한다.

```text
Farm 확인
↓
Farm으로 이동
↓
작업 시작
```

플레이어가 아무 행동을 하지 않아도 NPC가 직접 움직여야 한다.

이 장면은 MVP의 가장 중요한 장면 중 하나이다.

---

# 49. Phase 2 — Kitchen

작물이 처음 수확되면 Kitchen Event가 시작된다.

Cook:

```text
"이걸 요리할 곳이 있으면 좋겠어."
```

플레이어가 Kitchen을 건설한다.

---

# 50. Kitchen 완료 연출

Cook가 다음 행동을 수행한다.

```text
Crop 확인
↓
Crop 획득
↓
Kitchen 이동
↓
Cooking
↓
Food 생성
```

저녁 시간이 되면 주민 세 명이 모여 식사를 한다.

---

# 51. 첫 번째 저녁

첫 저녁은 중요한 감정적 보상 장면이다.

반드시 다음 연출 중 일부를 포함한다.

* Kitchen 조명
* 연기
* 음식
* 주민 이동
* 주민 식사
* 짧은 대화 또는 감정 표시

플레이어는 이 장면을 보면서

```text
마을이 살아나기 시작했다.
```

는 느낌을 받아야 한다.

---

# 52. Phase 3 — House

주민이 제대로 잠들 공간이 필요하다는 이벤트가 발생한다.

플레이어가 House를 건설한다.

밤이 되면 주민이 House로 이동한다.

---

# 53. House 완료 연출

NPC:

```text
House 이동
↓
Door 접근
↓
Sleep 상태
```

집 내부에는 조명이 켜진다.

---

# 54. Phase 4 — Monster

첫 번째 밤 또는 두 번째 밤에 Monster Event를 발생시킨다.

외곽 지역에서 Monster가 나타난다.

초기 숫자:

```text
2 ~ 3
```

---

# 55. Monster

MVP에서는 Monster 종류를 하나만 구현한다.

기본 상태:

```text
Spawn
MoveToVillage
AttackObstacle
Leave / Despawn
```

복잡한 전투 AI는 구현하지 않는다.

---

# 56. Player Combat

MVP에서는 본격적인 전투 시스템을 구현하지 않는다.

다음은 제외한다.

* Weapon
* Skill
* Level
* Damage Build
* Equipment
* Combat Combo

Monster의 목적은 전투 재미가 아니라

```text
방벽을 만들어야 하는 이유
```

를 제공하는 것이다.

---

# 57. Monster 공격 시 NPC 행동

Monster가 일정 거리 안으로 접근하면 NPC는 작업을 중단한다.

```text
Current Task Cancel
↓
Flee
↓
Safe Position 이동
```

위험이 사라지면 원래 행동으로 복귀한다.

---

# 58. Phase 5 — Barrier

Monster Event 이후 Carpenter가 말한다.

```text
"다음에는 마을 입구를 막아야 해."
```

Barrier 건설이 해금된다.

플레이어가 마을 입구에 Barrier를 설치한다.

---

# 59. Barrier 효과

다음 Monster Event에서 Monster 이동이 Barrier에 의해 차단되어야 한다.

Player가 직접 싸우지 않아도

```text
내가 만든 구조물이 마을을 보호했다.
```

는 것을 확인할 수 있어야 한다.

---

# 60. MVP Ending Event

다음날 아침 새로운 NPC 하나가 마을 입구에 등장한다.

해당 NPC는 MVP에서는 실제 생활 AI를 구현할 필요가 없다.

대사:

```text
"멀리서 불빛이 보여서 와봤어."

"여기 다시 사람들이 살기 시작한 거야?"
```

카메라가 마을을 잠시 보여준다.

다음 메시지를 표시한다.

```text
Village Population

3 → 4
```

이 지점이 MVP 플레이의 종료 지점이다.

---

# 61. MVP 완료 후 플레이 유지

Ending 이후 게임을 종료시키지 않는다.

플레이어가 계속 다음 행동을 할 수 있도록 유지한다.

* 이동
* 자원 채집
* 건설
* NPC 관찰

새로운 콘텐츠는 발생하지 않아도 된다.

---

# 62. UI

MVP에서 필요한 UI만 구현한다.

필수:

```text
Resource HUD

Current Objective

Interaction Prompt

Build Menu

Game Time

Dialogue

World State Debug Panel
```

---

# 63. Resource HUD

화면 예:

```text
Wood   12
Stone   8
Seed    3
```

---

# 64. Objective UI

현재 주요 목표 하나만 표시한다.

예:

```text
현재 목표

농부를 위해 밭을 복구하세요.
```

Quest Log 시스템은 만들지 않는다.

---

# 65. Dialogue UI

NPC 이름과 대사를 표시한다.

예:

```text
[Farmer]

밭이 망가져서
먹을 것을 만들 수 없어.

              [계속]
```

복잡한 대화 선택지는 MVP에서 구현하지 않는다.

---

# 66. Build Menu

Build Menu:

```text
Farm
Kitchen
House
Barrier
```

아직 해금되지 않은 건물은 Locked 상태로 표시할 수 있다.

---

# 67. Debug UI

개발 중에는 다음 정보를 표시할 수 있어야 한다.

```text
FPS

Player Tile

Game Time

NPC State

Current NPC Target

World State

Current Event

Pathfinding Grid
```

Production Build에서는 Debug Panel을 끌 수 있도록 한다.

---

# 68. Audio

MVP 최소 오디오:

* Footstep
* Resource Gather
* Building Complete
* Cooking
* Night Ambience
* Monster Alert

BGM은 선택 사항이다.

사운드 에셋이 준비되지 않은 경우 Placeholder를 사용할 수 있다.

---

# 69. Visual Feedback

다음 행동에는 반드시 시각적 Feedback이 있어야 한다.

```text
Resource 획득

Building 완료

Crop 성장

Cooking

Eating

Sleeping

Monster 등장

New Resident 등장
```

숫자만 변경되는 시스템을 만들지 않는다.

---

# 70. Asset 원칙

첫 개발 단계에서는 Placeholder Asset 사용을 허용한다.

Placeholder라도 다음은 서로 시각적으로 구분되어야 한다.

```text
Player
Farmer
Cook
Carpenter
Monster

Tree
Rock
Plant

Farm
Kitchen
House
Barrier
```

---

# 71. 저장

MVP 저장 방식:

```text
localStorage
```

최소 저장 정보:

```text
Player position

Inventory

Buildings

WorldState

Game Time

Triggered Events
```

Auto Save:

```text
Building 완료
Major Event 완료
```

MVP 초기 구현에서는 저장을 후순위로 둘 수 있다.

---

# 72. Backend

Backend는 구현하지 않는다.

MVP에서는 다음을 사용하지 않는다.

```text
Database
REST API
WebSocket
Authentication
Cloud Save
Multiplayer Server
```

---

# 73. 프로젝트 폴더 구조

초기 프로젝트 구조는 다음을 기준으로 한다.

```text
project-root/
│
├─ docs/
│  ├─ GAME_DESIGN.md
│  ├─ MVP_SPEC.md
│  ├─ ARCHITECTURE.md
│  └─ TASKS.md
│
├─ public/
│  └─ assets/
│     ├─ maps/
│     ├─ tiles/
│     ├─ sprites/
│     │  ├─ player/
│     │  ├─ npc/
│     │  ├─ monster/
│     │  └─ objects/
│     ├─ buildings/
│     ├─ effects/
│     ├─ audio/
│     └─ ui/
│
├─ src/
│  ├─ main.ts
│  │
│  ├─ game/
│  │  ├─ createGame.ts
│  │  ├─ config.ts
│  │  │
│  │  ├─ scenes/
│  │  │  ├─ BootScene.ts
│  │  │  ├─ PreloadScene.ts
│  │  │  └─ WorldScene.ts
│  │  │
│  │  ├─ entities/
│  │  │  ├─ player/
│  │  │  ├─ npc/
│  │  │  ├─ monster/
│  │  │  └─ resource/
│  │  │
│  │  ├─ systems/
│  │  │  ├─ input/
│  │  │  ├─ interaction/
│  │  │  ├─ inventory/
│  │  │  ├─ building/
│  │  │  ├─ pathfinding/
│  │  │  ├─ npc/
│  │  │  ├─ clock/
│  │  │  ├─ events/
│  │  │  ├─ world/
│  │  │  └─ save/
│  │  │
│  │  ├─ world/
│  │  │  ├─ WorldState.ts
│  │  │  ├─ NavigationGrid.ts
│  │  │  └─ WorldQuery.ts
│  │  │
│  │  ├─ ui/
│  │  │  ├─ Hud.ts
│  │  │  ├─ DialogueBox.ts
│  │  │  ├─ BuildMenu.ts
│  │  │  └─ DebugPanel.ts
│  │  │
│  │  └─ data/
│  │     ├─ buildings.ts
│  │     ├─ resources.ts
│  │     ├─ npcs.ts
│  │     ├─ events.ts
│  │     └─ balance.ts
│  │
│  ├─ shared/
│  │  ├─ constants/
│  │  ├─ types/
│  │  └─ utils/
│  │
│  └─ styles/
│
├─ tests/
│  ├─ world/
│  ├─ inventory/
│  ├─ building/
│  ├─ events/
│  └─ npc/
│
├─ index.html
├─ package.json
├─ pnpm-lock.yaml
├─ tsconfig.json
└─ vite.config.ts
```

---

# 74. Folder 책임

## entities

화면에 존재하는 개별 Entity.

예:

```text
Player
NPC
Monster
Tree
```

---

## systems

게임 규칙을 처리한다.

예:

```text
NPC가 무엇을 할 것인가
건물을 어디에 놓을 수 있는가
Event가 발생해야 하는가
```

Entity 자체에 복잡한 게임 규칙을 넣지 않는다.

---

## world

현재 월드의 상태와 조회 기능을 제공한다.

예:

```text
현재 식량은 얼마인가?
가장 가까운 Farm은 어디인가?
이 Tile을 지나갈 수 있는가?
```

---

## data

밸런스 값과 콘텐츠 데이터를 보관한다.

예:

```ts
export const FARM_CONFIG = {
  width: 3,
  height: 3,
  woodCost: 6,
  stoneCost: 2
};
```

밸런스 수치를 Game Logic 내부에 직접 작성하지 않는다.

---

# 75. Scene 구조

MVP에서 Scene 수를 최소화한다.

```text
BootScene

↓

PreloadScene

↓

WorldScene
```

게임 플레이 전체는 하나의 `WorldScene`에서 진행한다.

마을, 숲, 채석장 등을 각각 Scene으로 분리하지 않는다.

---

# 76. Scene에 모든 코드를 넣지 않는다

다음 형태를 금지한다.

```ts
class WorldScene extends Phaser.Scene {

  update() {

    // 플레이어
    // NPC AI
    // Farm
    // Event
    // Monster
    // DayNight
    // Building
    // Save

  }

}
```

`WorldScene`은 각 System을 연결하는 역할만 담당한다.

구체적인 구조는 `ARCHITECTURE.md`에서 정의한다.

---

# 77. 데이터 기반 구현

게임 밸런스 값은 가능한 한 데이터 파일에서 관리한다.

예:

```text
Crop Grow Time
Resource Respawn Time
Building Cost
NPC Speed
Monster Speed
Game Clock Speed
WorldState Modifier
```

코드 변경 없이 숫자를 조절할 수 있는 구조를 우선한다.

---

# 78. Event Coupling 방지

다음처럼 시스템끼리 직접 깊게 호출하지 않는다.

잘못된 예:

```text
Farm
→ Farmer
→ Cook
→ Kitchen
→ WorldState
→ UI
```

가능한 경우 Event를 사용한다.

예:

```text
FARM_BUILT
```

다른 시스템이 해당 Event에 반응한다.

상세 Event 구조는 `ARCHITECTURE.md`에서 정의한다.

---

# 79. 성능 목표

일반적인 Desktop Browser에서:

```text
Target FPS: 60
```

MVP NPC 수:

```text
3 ~ 4
```

따라서 초기에는 복잡한 최적화를 하지 않는다.

다음 작업을 미리 구현하지 않는다.

* Object Pool 남용
* ECS
* Worker 기반 AI
* WASM
* Spatial Database

실제 성능 문제가 발견된 이후 도입한다.

---

# 80. 코드 품질 원칙

AI 코딩 에이전트는 다음 원칙을 따른다.

### 한 파일에 너무 많은 책임을 넣지 않는다.

### TypeScript 타입을 명확히 작성한다.

### 시스템 간 순환 의존성을 만들지 않는다.

### 사용하지 않는 추상화를 미리 만들지 않는다.

### 미래 기능을 예상해 복잡한 Generic 시스템을 만들지 않는다.

### 현재 MVP에 필요한 가장 단순한 구현을 선택한다.

---

# 81. AI 코딩 에이전트 금지 사항

AI Agent는 명시적인 요청 없이 다음 작업을 수행하지 않는다.

```text
Phaser 버전 변경

React 추가

Redux 추가

Zustand 추가

Backend 추가

Database 추가

Multiplayer 추가

LLM 추가

ECS 도입

3D Engine 도입

새로운 NPC 추가

새로운 Building 추가

새로운 Resource 추가

새로운 Game Mechanic 추가
```

좋아 보이는 아이디어라도 임의로 Scope를 확대하지 않는다.

---

# 82. 구현 중 의사결정 기준

두 가지 구현 방법 중 선택해야 할 경우 다음 순서대로 판단한다.

```text
1. 플레이 경험을 더 빨리 확인할 수 있는가?

2. 코드가 단순한가?

3. AI Agent가 유지보수하기 쉬운가?

4. 테스트하기 쉬운가?

5. 나중에 교체할 수 있는가?
```

MVP에서는 미래 확장성보다 검증 속도를 조금 더 중요하게 본다.

---

# 83. 핵심 Acceptance Test 1

## Farm

Given:

```text
Farm이 없는 상태
```

When:

```text
Player가 Farm을 건설
```

Then:

```text
Farmer가 Farm을 인식

Farmer가 Farm으로 이동

Farmer가 농사를 시작

Crop이 생성
```

이 과정에 Player의 추가 명령이 필요해서는 안 된다.

---

# 84. 핵심 Acceptance Test 2

## Kitchen

Given:

```text
Crop이 존재
Kitchen이 존재
```

When:

```text
Cook의 작업 시간이 됨
```

Then:

```text
Cook가 Crop을 가져감

Kitchen으로 이동

Cooking 실행

Food 생성
```

---

# 85. 핵심 Acceptance Test 3

## Dinner

Given:

```text
Food가 존재
저녁 시간
```

Then:

```text
NPC들이 식사 장소로 이동

Food 소비

Eating 행동 실행

이후 기존 일정으로 복귀
```

---

# 86. 핵심 Acceptance Test 4

## Sleep

Given:

```text
House 존재
밤 시간
```

Then:

```text
NPC가 House로 이동

Sleeping 상태 진입

아침이 되면 다시 활동
```

---

# 87. 핵심 Acceptance Test 5

## Monster

Given:

```text
Night
```

When:

```text
Monster Event 발생
```

Then:

```text
Monster Spawn

Village 방향 이동

NPC 위험 감지

NPC Flee
```

---

# 88. 핵심 Acceptance Test 6

## Barrier

Given:

```text
Barrier가 설치되어 있음
```

When:

```text
Monster가 Village로 이동
```

Then:

```text
Monster가 Barrier를 통과할 수 없음
```

Player가 만든 구조물이 실제 Gameplay 결과를 바꾸어야 한다.

---

# 89. 핵심 Acceptance Test 7

## New Resident

Given:

```text
Farm 완료

Kitchen 완료

House 완료

Barrier 완료

첫 Monster Event 완료
```

Then:

```text
다음날 New Resident Event 발생
```

새 주민이 마을 입구에 등장한다.

---

# 90. MVP 핵심 검증 질문

개발 완료 후 기능 개수가 아니라 다음 질문으로 MVP를 평가한다.

## Q1

밭을 만든 뒤 농부가 스스로 움직이기 시작하는 장면이 만족스러운가?

## Q2

주민이 내가 만든 시설을 사용하는 모습을 관찰하는 것이 재미있는가?

## Q3

저녁에 주민이 모여 식사하는 장면에서 마을이 살아 있다는 느낌이 드는가?

## Q4

밤에 주민들이 집으로 돌아가는 모습에서 집을 만들어준 의미가 느껴지는가?

## Q5

방벽이 Monster를 막았을 때 건설이 실제 세계를 변화시켰다고 느껴지는가?

## Q6

새 주민이 찾아왔을 때 반가운가?

## Q7

MVP 종료 이후에도 다른 건물을 만들어주고 싶다는 생각이 드는가?

---

# 91. 실패 판단

다음 상황이면 MVP는 성공한 것으로 판단하지 않는다.

```text
건설은 가능하지만 NPC 반응이 재미없음

NPC가 움직이지만 목적이 보이지 않음

World State 숫자만 바뀜

시설을 만들어도 생활 모습이 달라지지 않음

새로운 콘텐츠가 없으면 할 것이 없다고 느껴짐

NPC보다 자원 채집 시간이 더 기억에 남음
```

이 경우 콘텐츠를 추가하지 않는다.

핵심 Loop를 다시 조정한다.

---

# 92. MVP에서 구현하지 않는 기능

명시적으로 제외한다.

```text
Free Block Building

Procedural Map

Open World

Multiple Maps

Character Creation

Skill Tree

Player Level

Equipment

Weapon System

Complex Combat

Boss

Quest Log

Crafting Tree

Trading

Economy

Fishing

Weather

Relationship

NPC Friendship

NPC Marriage

Dynamic Dialogue Generation

LLM NPC

Online Features

Multiplayer

Backend

Cloud Save
```

---

# 93. 이후 확장 후보

MVP가 성공한 경우에만 다음을 검토한다.

```text
자유 건축

주민 증가

직업 증가

주민 Personality

욕구 시스템

관계 시스템

상점

생산 Chain

농업 확장

동물

날씨

탐험 지역 확장

던전

전투

마을 규모 확장

자동 건설

주민 Memory
```

이 목록은 개발 예정 목록이 아니다.

MVP 성공 이후 검토할 후보 목록이다.

---

# 94. Definition of Done

MVP는 다음 조건을 모두 만족해야 완료된 것으로 판단한다.

### Player

* 이동 가능
* 상호작용 가능
* 자원 채집 가능
* 건설 가능

### World

* 하나의 완성된 작은 맵
* 낮/밤 존재
* Collision 존재

### Building

* Farm
* Kitchen
* House
* Barrier

모두 실제 게임 상태에 영향을 준다.

### NPC

Farmer, Cook, Carpenter가 존재한다.

각 NPC는:

* 이동
* 직업 행동
* 식사
* 취침
* 위험 회피

중 필요한 행동을 수행한다.

### Village Life

다음 Chain이 실제로 실행된다.

```text
Farm

↓

Farmer

↓

Crop

↓

Cook

↓

Food

↓

Villagers Eat
```

### Defense

다음 Chain이 실행된다.

```text
Night

↓

Monster

↓

NPC Flee

↓

Barrier

↓

Village Protected
```

### Progress

다음 Chain이 실행된다.

```text
Village Restoration

↓

World State 변화

↓

New Resident
```

---

# 95. MVP의 최종 장면

아침.

새로운 주민이 마을에 도착한다.

플레이어 뒤로 다음 모습이 보이는 것이 이상적이다.

```text
농부가 밭으로 이동한다.

요리사가 주방을 준비한다.

집에서 주민이 나온다.

마을에는 불빛과 연기가 보인다.

어제 만든 방벽이 입구를 지키고 있다.
```

새 주민이 말한다.

```text
"멀리서 불빛이 보여서 와봤어."

"여기 다시 사람들이 살기 시작한 거야?"
```

이 장면에서 MVP가 전달해야 하는 감정은 하나다.

> 이곳은 처음에 폐허였지만, 이제 마을이 되었다.

그리고 플레이어가 다음 생각을 한다면 MVP의 핵심 목표가 달성된 것이다.

> 다음에는 무엇을 만들어주면 좋을까?

```

여기서 중요한 결정은 **React를 빼고 Phaser + TypeScript로 MVP를 단순화한 것**, 그리고 **DQB식 자유 블록 건설을 당장 구현하지 않고 Prefab 건설로 감정 루프부터 검증하는 것**입니다. 이 두 결정만으로도 AI 에이전트가 엉뚱하게 거대한 게임 엔진부터 만들 가능성을 상당히 줄일 수 있습니다.

다음 `ARCHITECTURE.md`에서는 이 명세를 바탕으로 **`WorldScene → Systems → Entities → WorldState → EventBus`의 실제 의존성**, NPC 상태 머신, A* Pathfinding, GameClock, Event 흐름과 클래스/interface 수준까지 정의하는 것이 적절합니다. 그 다음 `TASKS.md`에서는 이를 `TASK-001 프로젝트 생성`부터 **한 작업당 AI 에이전트가 완료·검증·커밋할 수 있는 크기**로 쪼개면 바로 구현을 시작할 수 있습니다.
```
