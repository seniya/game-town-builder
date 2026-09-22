# MVP_SPEC.md

# Small Village Restoration Game — MVP Specification

Version: 0.2
Status: MVP Spec Baseline (문서 정합성 정리 반영)
Target: Desktop Web Browser
Genre: 2D Top-down Village Restoration / Life Simulation

---

# 1. 문서 목적

이 문서는 `GAME_DESIGN.md`에서 정의한 게임 경험을 실제로 구현하기 위한 MVP 개발 명세이다.

AI 코딩 에이전트는 개발을 시작하기 전에 다음 문서를 순서대로 읽는다.

```text
docs/project/GAME_DESIGN.md
    ↓
docs/project/MVP_SPEC.md
    ↓
docs/project/ARCHITECTURE.md
    ↓
docs/project/TASKS.md
```

각 문서의 역할은 다음과 같다.

```text
GAME_DESIGN.md
왜 이 게임을 만드는가?
무엇이 재미여야 하는가?

MVP_SPEC.md
첫 버전에서 정확히 무엇을 만드는가?
수치와 조건식의 정본.

ARCHITECTURE.md
각 시스템을 어떤 코드 구조로 구현하는가?
인터페이스의 정본.

TASKS.md
무엇을 어떤 순서로 구현하는가?
Acceptance Criteria의 정본.
```

## 1.1 문서 간 충돌 시 우선순위

같은 내용이 여러 문서에 다르게 적혀 있으면 다음 순서로 따른다.

```text
수치 / 조건식      →  MVP_SPEC.md
인터페이스 / 구조   →  ARCHITECTURE.md
작업 순서 / 완료 조건 →  TASKS.md
의도 / 감정 목표    →  GAME_DESIGN.md
```

`GAME_DESIGN.md`에 등장하는 수치는 의도를 설명하기 위한 예시다.

구현 기준이 아니다.

## 1.2 부수 문서

```text
docs/adr/     구조적 결정 기록 (ADR)
docs/state/   작업 완료 기록과 다음 할 일
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

입력 장치는 **키보드와 마우스만** 사용한다.

게임패드는 MVP 범위에서 제외한다.

이유는 Build Mode가 마우스 커서 위치를 기준으로 동작하기 때문이다.

게임패드를 지원하려면 스틱으로 조작하는 별도의 가상 커서와 스냅 규칙이 필요하고,
이것은 핵심 재미 검증과 무관한 추가 작업이다.

모바일 지원도 MVP 범위에서 제외한다.

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

## 5.1 버전 정본은 lockfile이다

이 문서는 **메이저 버전 제약만** 규정한다.

정확한 버전의 정본은 `package.json`과 `pnpm-lock.yaml`이다.

```text
Node.js    24.x LTS
Phaser     3.x      (3.90 이상, 4.x 금지)
Vite       8.x
TypeScript 5.x
Vitest     3.x
Tiled      1.12 이상
```

프로젝트 셋업 시 다음을 확인한다.

```text
설치한 Vite 메이저 버전이 Node 24에서 지원되는가
설치한 Phaser 버전이 3.x 범위인가
```

메이저 버전을 올리는 것은 임의로 수행하지 않는다.

패치·마이너 버전은 lockfile로 고정하며, 갱신은 별도 작업으로 분리한다.

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

맵에서는 다음 Layer를 사용한다.

```text
Ground            지형 타일
GroundDecoration  풀, 흙, 자갈 등 장식 (충돌 없음)
Objects           정적 장식 오브젝트 (충돌 없음)
Ruins             폐허 — 건설 가능, 충돌 없음
Collision         이동 불가 타일
BuildableArea     건설 허용 영역
SpawnPoints       시작 위치 오브젝트
Interaction       상호작용 오브젝트 (자원 노드 등)
```

## 8.1 Buildings 레이어를 두지 않는다

플레이어가 짓는 건물은 **전부 런타임에 생성**된다.

Tiled 맵에 `Buildings` 레이어를 두면 "맵에 미리 그려진 건물"과
"플레이어가 지은 건물"이 같은 레이어에 섞여 건설 충돌 판정이 모호해진다.

맵에 미리 존재하는 것은 건물이 아니라 **폐허**이며, `Ruins` 레이어에 둔다.

## 8.2 Ruins 레이어

폐허는 다음 성질을 가진다.

```text
Collision 아님          플레이어와 NPC가 지나갈 수 있다
BuildableArea 안에 있음  그 위에 건물을 지을 수 있다
건설 시 제거됨          해당 타일의 폐허 타일이 사라지고 건물이 들어선다
```

각 폐허 타일에는 힌트 속성을 부여할 수 있다.

```text
hint = "farm" | "house" | "generic"
```

Ghost Preview는 이 힌트를 사용해 안내를 표시한다.

```text
여기에 밭을 복구할 수 있습니다.
```

이 규칙이 있어야 **"무너진 밭을 복구한다"는 서사**와
**"Prefab 건물을 배치한다"는 메커니즘**이 충돌하지 않는다.

폐허를 Collision으로 만들면 밭을 복구할 수 없게 되므로 반드시 통과 가능해야 한다.

## 8.3 SpawnPoints 오브젝트

`SpawnPoints` 레이어에는 다음 이름의 오브젝트를 배치한다.

```text
player           플레이어 시작 위치            1개
npc_farmer       농부 시작 위치               1개
npc_cook         요리사 시작 위치              1개
npc_carpenter    목수 시작 위치               1개
plaza            마을 광장 (식사 / 노숙 / 집합)  1개
village_gate     마을 입구 기준 타일            1개
monster_spawn    몬스터 스폰 위치              1개 이상
safe_spot        NPC 도피 지점                1개 이상
resource_tree    나무                        복수
resource_rock    돌                          복수
resource_plant   야생 식물                    복수
```

이름이 빠져 있으면 게임 시작 시 명확한 Error를 발생시킨다.

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

## 12.1 좌표 변환은 기준점을 명시한다

Tile 좌표를 World 좌표로 바꿀 때 **좌상단 기준**과 **중심 기준**을 반드시 구분한다.

```text
gridToWorldTopLeft(10, 5)  →  x = 320, y = 160
gridToWorldCenter(10, 5)   →  x = 336, y = 176
worldToGrid(336, 176)      →  (10, 5)
```

계산식:

```text
topLeft.x = tile.x * 32
topLeft.y = tile.y * 32

center.x  = tile.x * 32 + 16
center.y  = tile.y * 32 + 16

tile.x    = floor(world.x / 32)
tile.y    = floor(world.y / 32)
```

## 12.2 사용 규칙

```text
Sprite 배치        gridToWorldCenter
Tilemap 인덱싱      gridToWorldTopLeft
건물의 origin       항상 좌상단 타일
```

건물의 `origin`은 **점유 영역의 좌상단 타일**이다.

3 × 3 밭의 `origin`이 `(10, 5)`이면 점유 타일은 다음과 같다.

```text
(10,5) (11,5) (12,5)
(10,6) (11,6) (12,6)
(10,7) (11,7) (12,7)
```

건물 Sprite는 점유 영역 전체의 중심에 배치한다.

```text
3 × 3 건물의 Sprite 중심 = gridToWorldTopLeft(origin) + (3 * 32 / 2)
```

기준점을 문서화하지 않으면 Ghost Preview와 BuildValidator가
한 타일씩 어긋나는 문제가 반드시 발생한다.

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

## 14.1 마을 입구는 정확히 한 곳이다

맵은 다음 제약을 반드시 만족해야 한다.

```text
위험 지역에서 마을로 들어오는 통로는 한 곳이다.
그 통로의 폭은 정확히 5 타일이다.
```

이 통로를 **마을 입구(Village Gate)** 라고 부른다.

입구 타일은 `SpawnPoints` 레이어의 `village_gate` 오브젝트를 기준으로
가로 5칸으로 결정한다.

```text
village_gate = (32, 40)

→ 입구 타일 = (30,40) (31,40) (32,40) (33,40) (34,40)
```

## 14.2 왜 이 제약이 필요한가

`EVENT_NEW_RESIDENT`의 조건은 "방벽으로 입구를 막았다"이다.

"막았다"를 판정하려면 **막아야 하는 타일 집합이 확정**되어 있어야 한다.

입구가 여러 곳이거나 폭이 가변이면 다음을 판정할 수 없다.

```text
safetyLevel 은 몇인가?
"방벽 완료"는 언제인가?
Acceptance Test 6 (몬스터가 통과하지 못함)은 통과했는가?
```

숲 / 채석장 / 물가는 마을과 자유롭게 연결되어도 된다.

몬스터는 위험 지역에서만 스폰하고 입구를 통해서만 진입하므로,
막아야 하는 곳은 입구 한 곳이다.

## 14.3 NPC 도피 지점

`safe_spot` 오브젝트는 입구에서 가장 먼 마을 안쪽에 배치한다.

`WorldQuery.findSafePosition()`은 이 지점들 중
현재 위협에서 가장 먼 곳을 반환한다.

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

판단 조건은 다음 5개이며, 전부 `BuildValidator` **한 곳에서** 판정한다.

```text
out_of_bounds             점유 타일이 맵 밖으로 나가는가
map_collision             Collision 레이어 타일을 포함하는가
overlaps_building         기존 건물과 겹치는가
outside_buildable_area    BuildableArea 밖인가
insufficient_resources    비용만큼의 자원이 Inventory에 있는가
```

`Ruins` 레이어 타일은 **막지 않는다.**

폐허 위에는 건설할 수 있어야 한다. (8.2 참조)

## 19.1 자원 검사는 Preview 단계에서 수행한다

자원 부족도 Ghost Preview에서 Invalid로 표시한다.

따라서 `BuildValidator`는 Inventory를 입력으로 받는다.

```ts
validate(input: {
  config: BuildingConfig;
  origin: GridPosition;
  inventory: InventoryState;
}): BuildValidationResult;
```

클릭 이후에는 재검증 없이 **차감만** 수행한다.

자원 검사를 클릭 이후로 미루면
"배치 가능하다고 표시됐는데 클릭하니 실패"하는 상태가 발생한다.

Invalid 사유는 화면에 표시한다.

```text
나무가 부족합니다 (6 / 4)
```

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

## 21.1 플레이어 자원 (Player Inventory)

플레이어가 직접 들고 다니는 자원은 3종이다.

```text
wood
stone
seed
```

## 21.2 마을 자원 (Village Storage)

마을이 공유하는 자원은 3종이다.

```text
seed    밭에 심을 씨앗
crop    수확한 작물
food    조리된 음식
```

## 21.3 두 저장소는 분리한다

```text
Player Inventory   플레이어가 채집하고 건설에 사용한다
Village Storage    NPC가 생산하고 소비한다
```

NPC는 **플레이어 Inventory를 절대 직접 읽거나 쓰지 않는다.**

플레이어 Inventory에서 Village Storage로 자원이 이동하는 경로는 두 개뿐이다.

```text
1. 밭 건설        건설 비용의 seed 3개가 Village Storage.seed 로 이전된다
2. 씨앗 보충       밭에 [E] 로 상호작용하여 seed 를 1개씩 기부한다
```

이 규칙이 없으면 "농부가 심을 씨앗이 어디서 오는가"가 정의되지 않는다.

---

# 22. 자원 채집

## 22.1 자원 노드와 획득량

```text
노드          획득          1회 획득량   Respawn (게임분)
tree         wood              3           240
rock         stone             3           240
plant        seed              1           180
```

채집 소요 시간은 실시간 1.2초이며 진행 표시를 보여준다.

## 22.2 Respawn은 필수 구현이다

채집한 노드는 사라지고 `respawnMinutes` 후 같은 위치에 다시 나타난다.

Respawn을 선택 기능으로 두지 않는다.

이유는 `seed`가 야생 식물에서만 나오기 때문이다.

Respawn이 없으면 씨앗이 고갈되어 게임이 진행 불가능한 상태에 빠질 수 있다.

## 22.3 Respawn 구현 방식

`ResourceSystem`이 다음을 관리한다.

```text
harvested = true
respawnAtTotalGameMinutes = 현재 totalGameMinutes + respawnMinutes
```

매 update에서 `현재 totalGameMinutes >= respawnAtTotalGameMinutes`인 노드를 되살린다.

`ResourceNode` 자신은 Respawn 여부를 판단하지 않는다.

시간 기준은 실시간이 아니라 **게임 시간(`totalGameMinutes`)** 이다.

이렇게 해야 저장·불러오기와 Time Scale 변경에서 일관성이 유지된다.

---

# 23. Inventory

플레이어 Inventory는 수량 기반으로 구현한다.

```ts
type InventoryItemId = 'wood' | 'stone' | 'seed';

type InventoryState = Record<InventoryItemId, number>;
```

예:

```ts
{
  wood: 12,
  stone: 8,
  seed: 4
}
```

Village Storage는 Inventory와 **별개의 타입**이다.

```ts
interface VillageStorage {
  seed: number;
  crop: number;
  food: number;
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

건설 비용:

```text
wood 6
stone 2
seed 3
```

건설 시 `seed 3`은 소멸하지 않고 `VillageStorage.seed`로 이전된다.

## 25.1 Farm 활성화 조건

```text
Farm이 건설되어 있다
```

조건은 이것 하나다.

이전 판에는 `Farmer Alive` 조건이 있었으나 삭제했다.

MVP에는 **NPC 사망이 존재하지 않는다.**

전투 시스템이 없고 몬스터는 방벽만 공격하므로 이 조건은 항상 참이며,
정의되지 않은 사망 규칙을 암시해 구현자를 혼란스럽게 만든다.

Farm 완성 후 농부가 농사를 시작한다.

## 25.2 밭 하나는 작물 한 단위를 기른다

3 × 3 타일이지만 내부를 9칸으로 나누지 않는다.

밭 전체가 하나의 상태를 가지고, 한 번 수확할 때 정해진 수량이 나온다.

```text
심기   seed 1 소비
수확   crop 4 + seed 1 획득
```

수확 시 `seed 1`이 함께 나오므로 밭 하나는 **씨앗을 자급한다.**

야생 식물 채집은 밭을 새로 짓거나 늘릴 때만 필요하다.

이 규칙이 없으면 씨앗이 고갈되어 진행이 막힌다.

---

# 26. Farm Life Cycle

Farm은 다음 3개 상태를 가진다.

```ts
type FarmPhase = 'empty' | 'growing' | 'ready';
```

```text
empty     ──plant()──▶  growing
growing   ──성장 완료──▶  ready
ready     ──harvest()─▶  empty
```

## 26.1 상태를 3개로 줄인 이유

이전 판에는 `Empty → Planted → Growing → Ready → Harvested → Empty` 6개 상태가 있었다.

두 가지 문제가 있었다.

```text
Planted 와 Growing 의 전이 기준이 정의되지 않았다
  심은 직후가 planted 라면, 언제 growing 이 되는가?

Harvested 는 상태가 아니라 사건이다
  harvest() 직후 곧바로 empty 가 되므로 머무르는 시간이 0이다
```

따라서 `planted`를 `growing`에 흡수하고 `harvested`를 삭제했다.

"수확했다"는 `CROP_HARVESTED` 이벤트로 표현한다.

## 26.2 성장 판정

`growing` 진입 시 심은 시각을 기록한다.

```ts
interface FarmState {
  phase: FarmPhase;
  plantedAtTotalGameMinutes: number;
}
```

```text
현재 totalGameMinutes - plantedAtTotalGameMinutes >= farm.growMinutes
    ↓
phase = 'ready'
```

시간 기준은 **게임 시간(`totalGameMinutes`)** 이다.

실시간 ms를 쓰면 저장·불러오기와 Time Scale 변경에서 성장 타이머가 깨진다.

## 26.3 농부의 반복 행동

```text
밭으로 이동
↓
phase 확인
↓
empty   → 씨앗 심기 (seed 1 필요, 없으면 대기)
growing → 다른 일 / Idle
ready   → 수확 (crop 4 + seed 1)
```

작물 성장은 농부가 밭 앞에 서 있지 않아도 진행된다.

`FarmSystem`이 시간만으로 판정한다.

---

# 27. Kitchen

기본 크기:

```text
2 × 2 Tiles
```

건설 비용:

```text
wood 8
stone 4
```

Kitchen이 만들어지면 Cook NPC 행동이 활성화된다.

```text
VillageStorage.crop >= 2 확인
↓
Kitchen 이동
↓
Cooking (실시간 6초)
↓
crop 2 감소
food 3 증가
```

## 27.1 주방은 작물을 늘려서 음식으로 바꾼다

```text
crop 2  →  food 3
```

변환비가 1:1보다 유리한 이유는 주방의 가치를 수치로 드러내기 위해서다.

작물을 그대로 먹을 수는 없다.

`food`만 식사에 소비할 수 있다.

## 27.2 Crop 을 월드 아이템으로 만들지 않는다

작물과 음식은 화면 위의 개별 Entity가 아니라 `VillageStorage`의 숫자다.

요리사가 밭에서 작물을 들고 오는 연출은 스프라이트 연출로만 표현하고,
실제 수량 이동은 `VillageStorage`에서 처리한다.

조리 과정은 애니메이션 또는 Timer로 표현한다.

---

# 28. House

기본 크기:

```text
4 × 4 Tiles
```

건설 비용:

```text
wood 12
stone 6
```

## 28.1 수용 인원

```text
residentCapacity = 3
```

집 한 채가 침대 3개를 제공한다.

초기 주민이 3명이므로 집 한 채로 전원이 잠들 수 있다.

엔딩에서 주민이 4명이 되면 한 명은 침대를 배정받지 못한다.

```text
주민 3명 + 집 1채  →  housingLevel 100
주민 4명 + 집 1채  →  housingLevel 75
```

이 하락이 "집을 하나 더 지어주고 싶다"는 다음 동기를 만든다.

## 28.2 침대 배정

`WorldQuery`가 침대를 배정한다.

```text
집들의 residentCapacity 합계 = 전체 침대 수
NPC 는 배정된 침대가 있을 때만 취침한다
```

배정은 NPC id 순서로 결정적으로 수행한다.

같은 상황에서 매번 다른 NPC가 노숙하면 디버깅이 어렵다.

## 28.3 집이 없거나 침대가 부족한 NPC

```text
22:00
↓
배정된 침대 없음
↓
plaza 로 이동
↓
RestAction (앉아서 밤을 보냄)
↓
06:00 기상
```

`RestAction`은 `SleepAction`과 다르다.

```text
SleepAction   문으로 들어가 숨겨진다. 취침 상태.
RestAction    광장에 앉아 있다. 화면에 계속 보인다.
```

집을 짓기 전 밤에 주민들이 광장에 앉아 있는 모습이 화면에 보여야
플레이어가 집이 필요하다는 것을 인식할 수 있다.

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

건설 비용:

```text
wood 2
stone 1
```

Barrier는 여러 개를 설치할 수 있고 개수 제한은 없다.

## 29.1 Barrier는 몬스터만 막는다

```text
Monster            통과 불가
Player             통과 가능
NPC                통과 가능
New Resident       통과 가능
```

이전 판의 기본값은 "모든 Entity에게 Collision"이었다.

그 값으로는 게임이 성립하지 않는다.

```text
입구를 막는다
    ↓
플레이어가 숲과 채석장으로 나갈 수 없다  →  자원 채집 불가
NPC 의 도피 경로가 제한된다
새 주민이 마을 입구로 들어올 수 없다     →  엔딩 발생 불가
```

문이나 게이트 개념을 추가하면 해결되지만,
그것은 개폐 상태·NPC의 문 통과 로직·몬스터의 문 인식을 모두 추가해야 한다.

"몬스터에게만 Collision"은 한 줄로 같은 목적을 달성한다.

플레이어가 얻어야 하는 감정은 다음이다.

> 내가 만든 구조물이 마을을 보호했다.

이 감정에는 플레이어 자신이 갇히는 것이 필요하지 않다.

## 29.2 NavigationGrid는 두 개의 통행 레이어를 가진다

```ts
isWalkable(p: GridPosition, actor: 'ground' | 'monster'): boolean;
```

```text
actor = 'ground'    Player / NPC 용. Barrier 를 무시한다.
actor = 'monster'   Monster 용. Barrier 를 Blocked 로 취급한다.
```

Pathfinding 호출 시 어느 레이어를 쓸지 명시한다.

## 29.3 Barrier는 파괴되지 않는다

Barrier에는 HP가 없다.

몬스터가 Barrier를 파괴하는 기능은 MVP에서 구현하지 않는다.

이유는 Acceptance Test 6이 "몬스터가 Barrier를 통과할 수 없음"을 요구하기 때문이다.

파괴 가능하면 이 테스트가 시간에 따라 실패할 수 있고,
플레이어가 얻어야 하는 "내 구조물이 마을을 지켰다"는 확신이 흔들린다.

몬스터의 `AttackObstacle` 상태는 **연출 전용**이다.

```text
Barrier 를 때리는 애니메이션을 재생한다
Barrier 는 아무 피해도 받지 않는다
attackObstacleSeconds 경과 후 Leave 로 전이한다
```

## 29.4 경로가 완전히 막힌 몬스터

```text
Monster Pathfinding 실패 (목표까지 경로 없음)
    ↓
입구 방향에서 가장 가까운 Barrier 앞 타일로 이동
    ↓
AttackObstacle (attackObstacleSeconds)
    ↓
Leave → Despawn
```

경로를 찾지 못했을 때의 동작을 정의하지 않으면
몬스터가 제자리에서 멈춘 채 사라지지 않는 상태가 발생한다.

## 29.5 safetyLevel 과 "방벽 완료"

```text
safetyLevel = round(100 * 방벽으로 막힌 입구 타일 수 / 5)
```

입구는 5 타일이므로(14.1 참조) 다음과 같다.

```text
방벽 0개  →  safetyLevel 0
방벽 3개  →  safetyLevel 60
방벽 5개  →  safetyLevel 100   ← "방벽 완료"
```

입구 밖에 설치한 방벽은 `safetyLevel`에 반영되지 않는다.

플레이어가 엉뚱한 곳에 방벽을 쌓아도 엔딩이 열려서는 안 되기 때문이다.

목표 UI는 진행 상황을 숫자로 보여준다.

```text
마을 입구를 막으세요  (3 / 5)
```

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

## 35.1 Action이 NPC 상태의 유일한 원천이다

NPC의 상태는 **현재 실행 중인 Action**이다.

`npc.state`라는 별도의 필드를 따로 두고 관리하지 않는다.

```ts
type NPCActionKind =
  | 'idle'
  | 'moveTo'
  | 'plant'
  | 'harvest'
  | 'cook'
  | 'inspect'
  | 'eat'
  | 'sleep'
  | 'rest'
  | 'flee'
  | 'talk';
```

## 35.2 표시용 상태 라벨

애니메이션과 Debug Panel에 필요한 표시 상태는 Action이 제공한다.

```ts
type NPCStateLabel =
  | 'idle'
  | 'moving'
  | 'working'
  | 'eating'
  | 'sleeping'
  | 'resting'
  | 'fleeing'
  | 'talking';
```

```text
Action              stateLabel
────────────────────────────────
idle                idle
moveTo              moving
plant / harvest     working
cook                working
inspect             working
eat                 eating
sleep               sleeping
rest                resting
flee                fleeing
talk                talking
```

`npc.state`가 필요하면 `npc.currentAction.stateLabel`을 읽는다.

## 35.3 왜 State 필드를 없애는가

State 필드와 Action을 동시에 두면 진실의 원천이 두 개가 된다.

```text
npc.state = 'working'
npc.currentAction = HarvestAction
```

둘을 일치시키는 코드가 모든 전이마다 필요해지고,
한쪽만 갱신하는 버그가 반드시 발생한다.

Action 구조를 도입한 목적이 거대한 switch문 제거였는데,
State 필드를 남기면 `Action ↔ State` 동기화 switch문이 새로 생긴다.

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

```text
1. 위험 회피      threatNearby 이면 Flee
2. 필수 스케줄    식사 시간 / 취침 시간
3. 직업 행동      농사 / 요리 / 점검
4. 자유 행동      Idle / 광장 배회
```

## 37.1 우선순위는 4단계다

이전 판에는 1번과 3번 사이에 "생존 행동"이 있었다.

`생존 행동`은 Hunger 수치를 전제한다.

그러나 MVP는 Hunger 수치를 구현하지 않고 **일정 기반 식사**를 사용한다(40장).

따라서 그 단계는 비어 있는 단계이며 삭제했다.

배고픔에 해당하는 판단은 2번 "필수 스케줄"이 담당한다.

## 37.2 판정은 위에서 아래로 한 번만

```text
Monster Nearby

→ 현재 Action cancel

→ Flee
```

위 단계가 성립하면 아래 단계는 평가하지 않는다.

여러 단계를 점수로 합산하지 않는다. (Utility AI를 쓰지 않는다)

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

## 38.1 통행 레이어는 두 개다

NavigationGrid는 다음 정보를 관리한다.

```text
Map Collision   Collision 레이어 타일
Building        건물이 점유한 타일 (방벽 제외)
Barrier         방벽 타일
```

그리고 두 개의 통행 레이어를 제공한다.

```text
actor = 'ground'    Player / NPC.  Barrier 를 통과 가능으로 취급
actor = 'monster'   Monster.       Barrier 를 Blocked 로 취급
```

Pathfinding을 호출할 때 어느 레이어를 쓸지 반드시 명시한다.

```text
NPC 이동 / 도피   'ground'
Monster 이동      'monster'
```

이유는 29.1에 있다.

## 38.2 Temporary Obstacle 을 두지 않는다

이전 판에는 `Temporary Obstacle`이 고려 대상에 있었으나 삭제했다.

MVP에는 일시적으로 통행을 막는 오브젝트가 존재하지 않는다.

자원 노드는 통행을 막지 않고, 건물과 방벽은 영구적이다.

사용하지 않을 개념을 그리드에 미리 넣지 않는다.

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
Day 1  08:00
```

내부적으로는 누적 게임분으로 관리한다.

```text
startTotalGameMinutes = 8 * 60 = 480
```

Time Scale은 설정값으로 분리한다.

하드코딩하지 않는다.

## 40.1 페이싱 주의사항

하루가 실시간 8분이라는 것은 다음을 뜻한다.

```text
08:00 → 18:00 (첫 저녁까지)     10 게임시간  =  3분 20초
22:00 → 06:00 (밤)              8 게임시간  =  2분 40초
20~30분 세션                    2.5 ~ 3.75 게임일
```

첫 저녁까지 3분 20초 안에 다음을 전부 끝내야 한다.

```text
농부와 대화  →  나무·돌 채집  →  밭 건설  →  작물 성장(2게임시간)
→  수확  →  주방 건설  →  조리
```

여유가 거의 없다.

## 40.2 그래서 진행을 시간에 걸지 않는다

페이즈 진행 조건을 게임 시간이 아니라 **플레이어 행동 완료**에 두었다(45장).

작물이 자라기 전에 저녁이 되어도 페이즈가 유실되지 않는다.

늦어지면 그 다음 저녁에 식사 장면이 발생한다.

## 40.3 첫 플레이테스트 1순위 튜닝 항목

```text
balance.gameClock.realSecondsPerGameHour
```

이 값이 MVP에서 가장 먼저 조정될 수치다.

20초가 너무 빠르면 30~40초로 올린다.

밤이 지루하면 취침 시각을 늦추기 전에 이 값을 먼저 검토한다.

밤에도 플레이어는 자원 채집과 건설을 계속할 수 있어야 한다.
NPC가 전원 취침 중이라고 해서 플레이어의 조작을 막지 않는다.

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

World State는 마을 전체 상태를 0~100 지표로 표현한다.

```ts
interface WorldStateView {
  foodLevel: number;       // 0 ~ 100
  safetyLevel: number;     // 0 ~ 100
  housingLevel: number;    // 0 ~ 100
  happinessLevel: number;  // 0 ~ 100
  population: number;      // 정수
}
```

## 42.1 World State는 아무것도 저장하지 않는다

모든 값은 **매 조회 시 계산되는 파생값**이다.

`WorldState`는 변경 API를 제공하지 않는다.

```text
increaseFood()      없다
increaseSafety()    없다
increaseHousing()   없다
```

지표를 바꾸려면 **원인이 되는 실제 상태를 바꾼다.**

```text
foodLevel 을 올리고 싶다      →  음식을 만든다 (VillageStorage.food++)
safetyLevel 을 올리고 싶다     →  입구에 방벽을 세운다
housingLevel 을 올리고 싶다    →  집을 짓는다
```

## 42.2 계산식

```text
foodLevel =
  clamp(0, 100, round(100 * storage.food / foodTarget))

  foodTarget = population
             * balance.meal.mealsPerDay
             * balance.meal.foodPerMeal
             * balance.worldState.foodLevelTargetDays
```

```text
safetyLevel =
  round(100 * 방벽으로 막힌 입구 타일 수 / balance.village.gateTiles)
```

```text
housingLevel =
  clamp(0, 100, round(100 * 전체 침대 수 / population))
```

```text
happinessLevel =
  round( foodLevel    * 0.4
       + housingLevel * 0.3
       + safetyLevel  * 0.3 )
```

```text
population = EntityRegistry 의 NPC 수
```

## 42.2.1 반올림 규칙

모든 지표는 **`Math.round` (0.5 는 올림)** 를 사용한다.

```text
72.4  →  72
72.5  →  73
72.6  →  73
```

언어와 라이브러리에 따라 0.5의 처리가 다르므로 반드시 명시한다.

```text
JavaScript Math.round(72.5)   →  73   (half-up)
Python     round(72.5)        →  72   (banker's rounding)
```

`happinessLevel`은 가중 평균이므로 `.5`가 자주 발생한다.

예: `foodLevel 50, housingLevel 75, safetyLevel 100`
→ `50*0.4 + 75*0.3 + 100*0.3 = 72.5` → **73**

이 규칙을 정하지 않으면 같은 입력에 대해 테스트가 환경에 따라 실패한다.

`clamp`은 반올림 **후** 적용한다.

## 42.3 계산 예시

초기 상태 (주민 3명, 건물 없음, food 0):

```text
foodTarget    = 3 * 3 * 1 * 2 = 18
foodLevel     = 0
safetyLevel   = 0
housingLevel  = 0
happinessLevel= 0
population    = 3
```

첫 사이클 완료 (주민 3명, food 12, 집 1채, 방벽 5개):

```text
foodLevel     = round(100 * 12 / 18) = 67
safetyLevel   = 100
housingLevel  = round(100 * 3 / 3)   = 100
happinessLevel= round(67*0.4 + 100*0.3 + 100*0.3) = 87
population    = 3
```

새 주민 도착 직후 (주민 4명):

```text
foodTarget    = 4 * 3 * 1 * 2 = 24
foodLevel     = round(100 * 12 / 24) = 50
housingLevel  = round(100 * 3 / 4)   = 75
happinessLevel= round(50*0.4 + 75*0.3 + 100*0.3) = 73
```

주민이 한 명 늘어난 것만으로 세 지표가 동시에 내려간다.

이것이 다음 건설 동기가 된다.

## 42.4 왜 파생값으로 만드는가

이전 판은 `WorldState`가 값을 저장하고 건물이 그 값을 직접 올리는 구조였다.

세 가지 문제가 있었다.

**1. 건물 효과의 키가 WorldState 필드와 일치하지 않았다**

```text
WorldState 필드   foodLevel, safetyLevel, housingLevel, happinessLevel
건물 효과         foodProduction, foodEfficiency, happiness, housing, safety
```

`worldStateEffects: Partial<WorldStateData>`로는
`foodProduction`과 `foodEfficiency`를 표현할 수 없었다.

**2. 지표가 절대 내려가지 않았다**

건물을 지어야 올라가고 내려가는 규칙이 없으므로 값은 단조 증가한다.

`foodLevel < 20` 같은 조건은 **구조적으로 발생할 수 없었다.**

**3. population 이 이중으로 존재했다**

`WorldState.population`과 `EntityRegistry.npcs.size`가 별도로 존재하고
동기화 주체가 정의되지 않았다.

`ARCHITECTURE.md`의 `WorldState ≠ EntityRegistry` 경계를 스스로 위반했다.

파생값으로 만들면 세 문제가 동시에 사라진다.

지표와 실제 마을 모습이 어긋날 수 없고,
소비가 있으므로 내려가고, 진실의 원천이 하나다.

## 42.5 저장하지 않는다

`WorldState`는 `SaveData`에 포함되지 않는다.

저장하는 것은 원인이 되는 실제 상태다.

```text
VillageStorage
Buildings
NPC 목록
```

불러오기 후 이 셋으로부터 지표가 다시 계산된다.

---

# 43. 건물과 World State

건물은 World State 필드를 직접 올리지 않는다.

건물은 마을이 무언가를 **할 수 있게** 만들고, 그 결과가 지표에 나타난다.

```text
건물     직접 효과                       지표에 나타나는 경로
──────────────────────────────────────────────────────────────
Farm     농부가 crop 을 생산할 수 있다      crop → food → foodLevel
Kitchen  crop 2 를 food 3 으로 바꾼다       food → foodLevel
House    침대 3 개가 생긴다                침대 수 → housingLevel
Barrier  입구 타일 1 칸을 막는다            커버리지 → safetyLevel
```

## 43.1 BuildingConfig 에 worldStateEffects 를 두지 않는다

```ts
// 사용하지 않는다
interface BuildingConfig {
  worldStateEffects: Partial<WorldStateData>;
}
```

대신 건물의 기능을 기술한다.

```ts
interface BuildingConfig {
  type: BuildingType;
  width: number;
  height: number;
  cost: Partial<Record<InventoryItemId, number>>;

  /** 이 건물이 제공하는 침대 수. 집만 > 0 */
  residentCapacity: number;

  /** 이 건물이 입구 타일을 막는가. 방벽만 true */
  blocksMonsters: boolean;
}
```

숫자를 두 곳에서 관리하지 않으므로 어긋날 수 없다.

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

MVP에서는 다음 6개 이벤트만 구현한다.

**이 표가 이벤트 조건의 정본이다.**

```text
id                      canTrigger 조건                              once
──────────────────────────────────────────────────────────────────────────
EVENT_FARM_REQUEST      항상 참 (게임 시작 시 즉시)                     true
EVENT_KITCHEN_REQUEST   storage.crop >= 1                            true
EVENT_HOUSE_REQUEST     storage.food >= 1                            true
EVENT_FIRST_MONSTER     EVENT_HOUSE_REQUEST 완료
                        AND 집이 1채 이상 존재
                        AND dayPhase == 'night'                      true
EVENT_BARRIER_REQUEST   EVENT_FIRST_MONSTER 완료
                        AND 살아있는 몬스터 수 == 0                     true
EVENT_NEW_RESIDENT      EVENT_BARRIER_REQUEST 완료
                        AND safetyLevel == 100
                        AND dayPhase == 'morning'                    true
```

## 45.1 모든 조건은 결정적이다

이전 판에는 "첫 번째 밤 **또는** 두 번째 밤"이라는 조건이 있었다.

`canTrigger(context): boolean`은 `또는`을 표현할 수 없다.

같은 게임 상태에서 항상 같은 결과가 나와야 한다.

## 45.2 진행은 플레이어 행동이 이끈다

6개 중 4개는 **플레이어 행동의 결과**를 조건으로 한다.

```text
EVENT_KITCHEN_REQUEST   플레이어가 밭을 지어줬으므로 작물이 나왔다
EVENT_HOUSE_REQUEST     플레이어가 주방을 지어줬으므로 음식이 나왔다
EVENT_BARRIER_REQUEST   몬스터가 왔고 플레이어가 그것을 목격했다
EVENT_NEW_RESIDENT      플레이어가 입구를 다 막았다
```

시간 조건(`dayPhase`)은 **타이밍을 다듬는 용도로만** 붙는다.

단독 조건으로는 사용하지 않는다.

```text
나쁜 조건    dayPhase == 'night'                      가만히 있어도 발생
좋은 조건    집을 지었다 AND dayPhase == 'night'        플레이어 행동이 먼저
```

## 45.3 이벤트 완료 시점

`EVENT_FIRST_MONSTER`의 조건에 있는 "`EVENT_HOUSE_REQUEST` 완료"는
**대사 창이 닫힌 것이 아니라** 해당 이벤트가 `triggeredEvents`에 들어간 것을 뜻한다.

이벤트 조건은 UI 상태에 의존하지 않는다.

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

## 47.1 이벤트는 자동 발생하지만 대사는 플레이어가 연다

`EVENT_FARM_REQUEST`는 게임 시작 시 즉시 `canTrigger`가 참이 된다.

그러나 대사 창이 플레이어를 붙잡고 먼저 뜨지는 않는다.

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
Build Menu    Farm 해금
```

## 47.2 이벤트 조건과 대사는 분리한다

위 흐름에서 **다음 이벤트의 조건은 대사와 무관하다.**

`EVENT_KITCHEN_REQUEST`의 조건은 `storage.crop >= 1`이다.

플레이어가 농부와 대화하지 않고 건설 메뉴에서 바로 밭을 지어도 진행된다.

대사는 이벤트의 **결과로 실행되는 커맨드**이지, 다음 이벤트의 조건이 아니다.

이것이 `ARCHITECTURE.md`의 "진행 조건은 게임 상태를 기준으로 한다"를 만족하는 방식이다.

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

`EVENT_FIRST_MONSTER`의 조건은 다음이다.

```text
EVENT_HOUSE_REQUEST 완료
AND 집이 1채 이상 존재
AND dayPhase == 'night'
```

즉 **집을 지은 그날 밤**에 발생한다.

"첫 번째 밤 또는 두 번째 밤"이라는 비결정적 표현은 사용하지 않는다.

외곽 위험 지역의 `monster_spawn` 위치에서 Monster가 나타난다.

스폰 수:

```text
3
```

`balance.monster.spawnCount`로 조정한다.

## 54.1 집을 지은 밤에 몬스터가 오는 이유

주민들이 처음으로 집에 들어가 잠든 밤에 위협이 온다.

지켜야 할 것이 생긴 직후에 그것을 잃을 수 있다는 상황을 만든다.

집이 없는 상태에서 몬스터가 오면 주민들은 광장에 앉아 있다가 도망치고,
플레이어는 무엇을 지키는지 느끼기 어렵다.

---

# 55. Monster

MVP에서는 Monster 종류를 하나만 구현한다.

기본 상태:

```ts
type MonsterState =
  | 'spawn'
  | 'moveToVillage'
  | 'attackObstacle'
  | 'leave';
```

```text
spawn           ──▶  moveToVillage
moveToVillage   ──경로 없음──▶  attackObstacle
moveToVillage   ──마을 도달──▶  (VILLAGE_BREACHED) leave
attackObstacle  ──attackObstacleSeconds 경과──▶  leave
leave           ──맵 밖 도달 또는 despawnHour──▶  Despawn
```

## 55.1 AttackObstacle 은 연출 전용이다

```text
Barrier 에 HP 가 없다
Barrier 는 파괴되지 않는다
attackObstacle 은 때리는 애니메이션만 재생한다
```

자세한 이유는 29.3에 있다.

## 55.2 마을 진입에 성공한 경우

방벽이 없거나 불완전하면 몬스터가 마을에 들어온다.

```text
마을 중심 타일 도달
↓
VILLAGE_BREACHED emit
↓
leave
```

`VILLAGE_BREACHED`는 MVP에서 다음 용도로만 쓴다.

```text
화면 흔들림 / 경고음 연출
Debug Panel 표시
```

주민이나 건물에 실제 피해를 주지 않는다.

피해 시스템을 넣으면 전투·수리·사망 규칙이 따라와야 하고, 이는 MVP 범위 밖이다.

플레이어가 얻어야 하는 것은 **방벽이 있을 때와 없을 때의 차이**이며,
그 차이는 "몬스터가 마을 안까지 들어왔다 / 입구에서 막혔다"로 충분히 전달된다.

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

방벽을 완성한 다음 아침(`dayPhase == 'morning'`), 새로운 NPC 하나가 마을 입구에 등장한다.

## 60.1 새 주민은 진짜로 살아간다

새 주민은 **기존 `farmer` 역할을 재사용한다.**

```ts
npcFactory.createNPC('farmer', villageGateTile);
```

새 직업을 추가하지 않으므로 "새로운 NPC 추가 금지" 원칙과 충돌하지 않는다.

새 주민은 등장 즉시 기존 농부와 **동일한 AI로 생활을 시작한다.**

```text
아침    밭으로 이동 (기존 밭이 growing 이면 대기 / Idle)
식사    광장으로 이동하여 food 소비
밤      침대가 없으므로 광장에서 RestAction
```

## 60.2 생활 AI를 구현하지 않으면 안 되는 이유

이전 판에는 "새 NPC는 실제 생활 AI를 구현할 필요가 없다"고 되어 있었다.

그러면 4번째 주민이 마을 입구에 영구히 멈춰 서 있게 된다.

이것은 이 게임의 최우선 원칙과 정면으로 충돌한다.

```text
69장   "숫자만 변경되는 시스템을 만들지 않는다"
GAME_DESIGN   "주민이 살아 있는 것처럼 느껴져야 한다"
```

엔딩 장면의 핵심 감정은 "반가움"이다.

인구 카운터가 3에서 4로 바뀌는 것으로는 반가움이 생기지 않는다.

역할을 재사용하면 추가 구현 비용은 거의 0이면서 새 주민이 실제로 살아간다.

## 60.3 엔딩 직후 지표가 내려간다

주민이 4명이 되면 다음이 발생한다.

```text
housingLevel   100 → 75   (침대 3개 / 주민 4명)
foodLevel       67 → 50   (foodTarget 18 → 24)
happinessLevel  87 → 73
```

새 주민은 밤에 광장에서 자게 된다.

플레이어는 이것을 보고 다음을 생각한다.

> 집을 하나 더 지어줘야겠다.

이것이 MVP 종료 지점에서 만들어야 하는 마지막 감정이다.

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

## 71.1 저장 대상

**원인이 되는 실제 상태만 저장한다.**

```text
gameClock.totalGameMinutes      게임 시간의 유일한 원천
player.tile                     플레이어 위치
inventory                       wood / stone / seed
villageStorage                  seed / crop / food
buildings[]                     type, origin, 그리고 밭이면 farm 상태
resourceNodes[]                 채집 여부와 Respawn 예정 시각
npcs[]                          id, role, tile
triggeredEvents[]
unlockedBuildings[]
objectiveId
```

## 71.2 저장하지 않는 것

```text
WorldState 지표      파생값이므로 불러오기 후 재계산한다
NPC 의 현재 Action   불러오기 후 Decision 을 다시 실행한다
NPC 의 현재 경로
Animation frame
Monster             밤 이벤트는 다시 발생하므로 저장하지 않는다
```

## 71.3 반드시 저장해야 하는 세 가지

이전 판의 저장 목록에는 다음이 빠져 있었고, 각각 실제 버그를 만든다.

```text
VillageStorage
  빠지면 불러오기 후 작물과 음식이 사라진다

Farm 의 phase 와 심은 시각
  빠지면 자라던 작물이 사라진다

NPC 목록
  빠지면 엔딩 후 저장했을 때 4번째 주민이 사라진다
  (population 은 파생값이므로 NPC 를 복원하지 않으면 3으로 되돌아간다)
```

## 71.4 모든 시간값은 게임 시간 기준이다

저장되는 시간값은 전부 `totalGameMinutes` 단위다.

```text
farm.plantedAtTotalGameMinutes
resourceNode.respawnAtTotalGameMinutes
```

실시간 ms(`Date.now()`)를 저장하지 않는다.

실시간을 쓰면 다음이 깨진다.

```text
저장 후 하루 뒤에 불러오면 모든 타이머가 만료된 상태가 된다
Time Scale 을 바꾸면 성장 시간이 의도와 달라진다
```

## 71.5 Auto Save

```text
Building 완료
Major Event 완료 (triggeredEvents 변경)
```

## 71.6 구현 시점

저장은 개발 우선순위의 **마지막 단계**다.

다른 시스템의 상태 구조가 확정된 뒤에 구현한다.

중간에 만들면 시스템이 바뀔 때마다 저장 형식을 계속 고쳐야 한다.

MVP는 한 번에 20~30분 플레이하는 것이 목표이므로 저장 없이도 검증할 수 있다.

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

**폴더 구조의 정본은 `ARCHITECTURE.md` 91장이다.**

이 장은 요약이며, 두 문서가 다르면 `ARCHITECTURE.md`를 따른다.

```text
project-root/
│
├─ docs/
│  ├─ project/
│  │  ├─ GAME_DESIGN.md
│  │  ├─ MVP_SPEC.md
│  │  ├─ ARCHITECTURE.md
│  │  └─ TASKS.md
│  ├─ adr/                       구조적 결정 기록
│  └─ state/                     작업 완료 기록 (날짜_시간.md)
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
│  │  ├─ core/                   EventBus, Logger
│  │  │
│  │  ├─ scenes/                 Boot / Preload / World
│  │  │
│  │  ├─ world/                  GameWorld, WorldState, WorldQuery,
│  │  │                          EntityRegistry, NavigationGrid, VillageStorage
│  │  │
│  │  ├─ entities/               player / npc / monster / building / resource
│  │  │                          (순수 데이터. Phaser 의존 없음)
│  │  │
│  │  ├─ views/                  EntityView, PhaserSpriteView
│  │  │
│  │  ├─ systems/                input, interaction, inventory, resource,
│  │  │                          building, pathfinding, movement, npc, farm,
│  │  │                          clock, daynight, monster, events, dialogue,
│  │  │                          objective, save, debug
│  │  │
│  │  ├─ factories/              Player / NPC / Monster / Building
│  │  │
│  │  ├─ data/                   balance, buildings, npcs, resources,
│  │  │                          events, dialogues
│  │  │
│  │  ├─ types/                  게임 전용 타입 (정본)
│  │  │
│  │  └─ ui/                     Hud, DialogueBox, BuildMenu,
│  │                             ObjectivePanel, DebugPanel
│  │
│  ├─ shared/
│  │  └─ utils/                  게임과 무관한 범용 유틸만
│  │
│  └─ styles/
│
├─ tests/
│  ├─ world/
│  ├─ inventory/
│  ├─ building/
│  ├─ events/
│  ├─ farm/
│  ├─ pathfinding/
│  └─ npc/
│
├─ index.html
├─ package.json
├─ pnpm-lock.yaml
├─ tsconfig.json
└─ vite.config.ts
```

## 73.1 타입은 한 곳에만 둔다

```text
src/game/types/    게임 도메인 타입 (GridPosition, NPCRole, BuildingType ...)
src/shared/utils/  게임과 무관한 범용 유틸 (clamp, 배열 헬퍼 ...)
```

`src/shared/types/`는 두지 않는다.

같은 타입이 두 위치에 생기는 것을 막기 위해 게임 타입은 `src/game/types/`에만 둔다.

## 73.2 entities 와 views 를 분리한다

`entities/`의 클래스는 **Phaser를 import하지 않는다.**

렌더링은 `views/`의 `EntityView`가 담당한다.

자세한 이유는 `ARCHITECTURE.md`의 Entity 구조 장에 있다.

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

게임 밸런스 값은 전부 `src/game/data/`에서 관리한다.

코드 변경 없이 숫자를 조절할 수 있는 구조를 우선한다.

## 77.1 balance.ts — 전체 초기값

**이 표가 초기 밸런스 수치의 정본이다.**

```ts
export const GAME_BALANCE = {
  gameClock: {
    realSecondsPerGameHour: 20,
    startTotalGameMinutes: 480,      // Day 1 08:00
  },

  player: {
    moveSpeed: 160,                  // px/s
    gatherSeconds: 1.2,
    interactRadiusTiles: 1.5,
  },

  npc: {
    moveSpeed: 90,                   // px/s
    repathIntervalSeconds: 0.5,
    arriveThresholdPx: 4,
  },

  monster: {
    moveSpeed: 70,                   // px/s
    threatRadiusTiles: 6,
    spawnCount: 3,
    attackObstacleSeconds: 8,
    despawnHour: 5,                  // 05:00 이후 남아 있으면 강제 despawn
  },

  resource: {
    yield:          { tree: 3,   rock: 3,   plant: 1   },
    respawnMinutes: { tree: 240, rock: 240, plant: 180 },  // 게임분
  },

  farm: {
    growMinutes: 120,                // 게임분 = 2 게임시간
    seedPerPlant: 1,
    cropPerHarvest: 4,
    seedPerHarvest: 1,
    plantSeconds: 2,
    harvestSeconds: 2,
  },

  kitchen: {
    cropPerBatch: 2,
    foodPerBatch: 3,
    cookSeconds: 6,
  },

  meal: {
    foodPerMeal: 1,
    mealsPerDay: 3,                  // 07:00 / 12:00 / 18:00
    eatSeconds: 4,
  },

  worldState: {
    foodLevelTargetDays: 2,
    happinessWeights: { food: 0.4, housing: 0.3, safety: 0.3 },
  },

  village: {
    gateTiles: 5,
  },
} as const;
```

## 77.2 buildings.ts — 건물 4종

```ts
export const BUILDINGS = {
  farm: {
    type: 'farm',
    width: 3, height: 3,
    cost: { wood: 6, stone: 2, seed: 3 },
    residentCapacity: 0,
    blocksMonsters: false,
  },
  kitchen: {
    type: 'kitchen',
    width: 2, height: 2,
    cost: { wood: 8, stone: 4 },
    residentCapacity: 0,
    blocksMonsters: false,
  },
  house: {
    type: 'house',
    width: 4, height: 4,
    cost: { wood: 12, stone: 6 },
    residentCapacity: 3,
    blocksMonsters: false,
  },
  barrier: {
    type: 'barrier',
    width: 1, height: 1,
    cost: { wood: 2, stone: 1 },
    residentCapacity: 0,
    blocksMonsters: true,
  },
} as const;
```

## 77.3 첫 사이클 총 비용 검산

```text
건물              wood   stone   seed
─────────────────────────────────────
Farm      × 1        6       2      3
Kitchen   × 1        8       4      -
House     × 1       12       6      -
Barrier   × 5       10       5      -
─────────────────────────────────────
합계                36      17      3
```

필요한 채집 횟수:

```text
wood  36 / 3 = 나무 12 회
stone 17 / 3 = 돌   6 회
seed   3 / 1 = 야생 식물 3 회
```

총 21회 채집 × 1.2초 = 약 25초의 채집 시간.

이동 시간을 포함하면 20~30분 세션에서 합리적인 분량이다.

## 77.4 식량 수급 검산

주민 3명이 하루에 필요한 음식:

```text
3명 × 3식 × 1 = food 9 / 일
```

밭 1개의 하루 생산:

```text
작업 시간(08:00~18:00, 식사 제외) 약 8 게임시간
성장 2 게임시간 → 하루 최대 4회, 현실적으로 2~3회 수확

수확 2회  →  crop 8  →  4 batch  →  food 12
수확 3회  →  crop 12 →  6 batch  →  food 18
```

필요 9에 대해 12~18이므로 밭 1개로 자급된다.

주민이 4명이 되면 필요량이 12로 올라가 여유가 사라진다.

밭을 하나 더 짓고 싶어지는 지점이 여기다.

## 77.5 씨앗 수급 검산

```text
심기   seed -1
수확   seed +1
```

수지가 0이므로 밭 1개는 영구히 돌아간다.

밭을 새로 지을 때만 seed 3이 필요하고, 이는 야생 식물 3회 채집으로 얻는다.

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
BUILDING_PLACED { buildingId, type }
```

다른 시스템이 해당 Event에 반응한다.

건물별로 `FARM_BUILT` / `KITCHEN_BUILT` 같은 이벤트를 따로 만들지 않는다.

페이로드가 동일하므로 `type`으로 구분한다.

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
House 1채 존재 (침대 3개)
주민 3명
22:00
```

Then:

```text
NPC 3명 전원이 House 로 이동한다
Door 위치에 도착하면 Sprite 가 숨겨진다
stateLabel = 'sleeping'
집에 조명이 켜진다
housingLevel == 100
06:00 에 Sprite 가 다시 표시되고 활동을 시작한다
```

## 86.1 집이 없는 경우

Given:

```text
House 없음
22:00
```

Then:

```text
NPC 3명이 plaza 로 이동한다
stateLabel = 'resting'
Sprite 가 화면에 계속 보인다
housingLevel == 0
```

주민들이 밤에 광장에 앉아 있는 모습이 **화면에 보여야** 한다.

이것이 플레이어가 집이 필요하다는 것을 인식하는 유일한 단서다.

## 86.2 침대가 부족한 경우

Given:

```text
House 1채 (침대 3개)
주민 4명
22:00
```

Then:

```text
3명은 House 에서 취침한다
1명은 plaza 에서 RestAction 을 수행한다
housingLevel == 75
침대 배정은 NPC id 순서로 매번 동일하게 결정된다
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
마을 입구 5 타일이 모두 Barrier 로 막혀 있음
safetyLevel == 100
```

When:

```text
Monster Event 가 발생하고 Monster 가 Village 로 이동
```

Then:

```text
Monster 가 Barrier 타일을 통과하지 못한다
Monster 가 마을 안으로 들어오지 못한다
VILLAGE_BREACHED 가 발생하지 않는다
Monster 가 AttackObstacle 을 거쳐 Despawn 한다
Barrier 는 파괴되지 않는다
```

대조 조건 (방벽이 없을 때):

```text
Monster 가 마을 중심까지 도달한다
VILLAGE_BREACHED 가 발생한다
```

두 결과가 달라야 Player가 만든 구조물이 Gameplay를 바꾼 것이다.

한쪽만 확인하면 방벽이 실제로 작동했는지 알 수 없다.

## 88.1 통행 레이어 검증

같은 상황에서 다음도 함께 확인한다.

```text
Player 는 Barrier 타일을 통과할 수 있다
NPC 는 Barrier 타일을 통과할 수 있다
```

방벽이 플레이어를 가두면 자원 채집이 불가능해진다. (29.1 참조)

---

# 89. 핵심 Acceptance Test 7

## New Resident

Given:

```text
EVENT_BARRIER_REQUEST 완료
safetyLevel == 100         (입구 5 타일이 모두 막혀 있음)
```

When:

```text
dayPhase 가 'morning' 이 된다
```

Then:

```text
EVENT_NEW_RESIDENT 가 1회만 발생한다
새 주민이 village_gate 타일에 등장한다
population 이 3 → 4 로 변한다
housingLevel 이 100 → 75 로 내려간다
foodLevel 이 내려간다   (foodTarget 18 → 24)
```

그리고 **새 주민이 실제로 생활을 시작한다.**

```text
낮     밭 또는 광장으로 이동한다
식사   광장에서 food 를 소비한다
밤     침대가 없으므로 광장에서 RestAction 을 수행한다
```

새 주민이 입구에 멈춰 서 있으면 이 테스트는 실패다. (60.2 참조)

## 89.1 음성 케이스

```text
입구 3 타일만 막힌 상태  →  safetyLevel 60  →  이벤트 발생하지 않음
입구 밖에 방벽 5개 설치   →  safetyLevel 0   →  이벤트 발생하지 않음
```

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
Gamepad Input

Barrier Durability / Destruction

NPC Death

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
