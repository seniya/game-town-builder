# TASKS.md

# Small Village Restoration Game — Task Breakdown

Version: 0.1
Status: MVP Task Baseline
Related Documents:

```text
docs/project/GAME_DESIGN.md
docs/project/MVP_SPEC.md
docs/project/ARCHITECTURE.md
docs/project/TASKS.md   (이 문서)
docs/adr/
docs/state/
```

---

# 1. 문서 목적

이 문서는 **Acceptance Criteria 의 정본**이다.

`GAME_DESIGN.md` 14장의 20단계를 AI 코딩 에이전트가 한 번에 완료하고 검증하고
커밋할 수 있는 크기로 분할한다.

## 1.1 Task 하나의 크기 기준

```text
한 Task 는 다음을 모두 만족한다.

1. Acceptance Criteria 가 기계적으로 판정 가능하다
2. 완료 후 브라우저에서 무언가를 확인할 수 있다 (또는 테스트가 통과한다)
3. 완료 후 커밋 가능한 상태가 된다
4. 다른 Task 가 진행 중이지 않아도 독립적으로 검증된다
```

한 Task가 여러 시스템을 동시에 건드려야 한다면 너무 큰 Task다.

## 1.2 Task 작업 절차

`ARCHITECTURE.md` 102장과 동일하다.

```text
1. TASKS.md 에서 Task 와 Acceptance Criteria 확인
2. MVP_SPEC.md 에서 수치와 조건 확인
3. ARCHITECTURE.md 에서 책임 위치와 인터페이스 확인
4. 필요하면 GAME_DESIGN.md 에서 의도 확인
5. 구현
6. 테스트 작성 및 통과
7. 브라우저에서 실행 확인
8. 주요 결정이 있었다면 docs/adr/ 에 ADR 추가
9. docs/state/ 에 완료 기록과 다음 할 일 작성
10. commit
```

## 1.3 표기

```text
[ ]  미착수
[~]  진행 중
[x]  완료

AC   Acceptance Criteria
```

## 1.4 Task 를 임의로 추가하지 않는다

`MVP_SPEC.md` 81장의 금지 사항이 그대로 적용된다.

새 NPC, 새 건물, 새 자원, 새 게임 메커닉을 임의로 추가하는 Task를 만들지 않는다.

---

# 2. 단계 개요

```text
Phase A  기반             TASK-001 ~ 006     6개
Phase B  플레이어 행동      TASK-007 ~ 016    10개
Phase C  건설과 주민 생활    TASK-017 ~ 032   16개   ★ 핵심 재미 검증
Phase D  세계 연출          TASK-033 ~ 036    4개
Phase E  진행과 위협        TASK-037 ~ 042    6개
Phase F  마무리            TASK-043 ~ 044    2개
                                            ─────
                                             44개
```

`GAME_DESIGN.md` 14장의 20단계와의 대응:

```text
단계                        Task              Phase
──────────────────────────────────────────────────────
 1 프로젝트 셋업             001 ~ 003          A
 2 작은 맵                  004 ~ 005          A
 3 플레이어 이동             006 ~ 008          A / B
 4 GameClock + DayPhase     009               B
 5 월드 골격                 010 ~ 012          B
 6 자원 채집 + Inventory     013 ~ 016          B
 7 건설                     017 ~ 020          C
 8 Pathfinding + Movement   021 ~ 022          C
 9 NPC 골격                 023 ~ 024          C
10 밭과 농부                 025 ~ 027          C   ★
11 주방과 요리사              028               C
12 식사 / 취침 / 집           029 ~ 032          C
13 낮·밤 시각 연출            033               D
14 World State              034               D
15 Dialogue + Objective     035 ~ 036          D
16 이벤트 시스템              037 ~ 038          E
17 몬스터                    039 ~ 040          E
18 방벽                     041               E
19 신규 주민 + 엔딩           042               E
20 저장 / 불러오기            044               F
   (Audio 는 단계 밖)         043               F
```

## 2.1 TASK-026 이 분기점이다

`TASK-026`(농부가 밭에서 일하기)이 MVP의 첫 번째 핵심 재미 검증 지점이다.

이 시점에는 아직 이벤트도 대사도 없다. 플레이어가 건설 메뉴에서 직접 밭을 짓는다.

그래도 그 장면이 만족스럽지 않으면 `TASK-027` 이후를 진행하지 않는다.

대사와 이벤트는 이 재미를 포장하는 것이지 만들어내는 것이 아니다.
(`GAME_DESIGN.md` 14.2)

## 2.2 Phase 경계에서 플레이 가능한 상태

```text
Phase A 완료   맵 위에서 아무것도 못 한다 (렌더만)
Phase B 완료   돌아다니며 자원을 채집할 수 있다
Phase C 완료   건설하면 주민이 농사·요리·식사·취침을 한다   ★ 핵심 루프 완성
Phase D 완료   낮과 밤이 구분되고 목표와 대사가 나온다
Phase E 완료   20~30분 MVP 시나리오가 처음부터 끝까지 진행된다
Phase F 완료   소리가 나고 저장된다
```

각 Phase 끝에서 브라우저로 실제 플레이해보고 `docs/state/`에 소감을 기록한다.

---

# Phase A. 기반

## TASK-001 프로젝트 생성

[ ]

작업:

```text
pnpm 프로젝트 생성
Vite + TypeScript SPA 구성
Phaser 3 설치 (3.90 이상)
Vitest 설치
tsconfig strict: true
pnpm-lock.yaml 커밋
```

AC:

```text
pnpm install 이 성공한다
pnpm dev 로 빈 페이지가 뜬다
pnpm build 가 성공한다
pnpm test 가 0개 테스트로 성공한다
tsconfig.json 에 strict: true 가 있다
설치된 Phaser 가 3.x 이고 Vite 가 Node 24 에서 동작한다
```

참조: `MVP_SPEC.md` 5 ~ 7장

주의: 버전 확인 결과를 `docs/state/`에 기록한다. 문서의 버전 표기와
실제 설치 버전이 다르면 `MVP_SPEC.md` 5.1을 갱신한다.

---

## TASK-002 폴더 구조 생성

[ ]

작업:

```text
ARCHITECTURE.md 91장의 폴더 구조를 빈 디렉터리로 생성
각 디렉터리에 .gitkeep 또는 index 파일
```

AC:

```text
src/game/{core,scenes,world,entities,views,systems,factories,data,types,ui} 가 존재한다
src/shared/utils 가 존재한다
tests/{world,inventory,building,events,farm,pathfinding,npc} 가 존재한다
src/shared/types 는 존재하지 않는다
```

참조: `ARCHITECTURE.md` 91장, 65장

---

## TASK-003 Phaser 부팅과 Scene 3개

[ ]

작업:

```text
createGame.ts        Phaser.Game 설정 (1280x720, 16:9, Scale 유지)
BootScene            최소 설정 후 Preload 로 전이
PreloadScene         에셋 로드 후 World 로 전이
WorldScene           빈 씬. GameWorld 를 생성하고 update 를 위임만 한다
```

AC:

```text
브라우저에 1280x720 캔버스가 뜬다
창 크기를 바꾸면 비율을 유지하며 스케일된다
Boot → Preload → World 전이가 콘솔 로그로 확인된다
WorldScene 의 코드가 30줄 이하다
```

참조: `ARCHITECTURE.md` 5장, `MVP_SPEC.md` 11장, 75장

---

## TASK-004 Tiled 맵 제작

[ ]

작업:

```text
64 × 64 타일, 32px 맵 작성
레이어: Ground, GroundDecoration, Objects, Ruins,
        Collision, BuildableArea, SpawnPoints, Interaction
영역: 마을(중앙) / 숲(북) / 채석장(서) / 물가(동) / 위험 지역(남)
마을 입구를 정확히 한 곳, 폭 5 타일로 만든다
SpawnPoints 오브젝트 전체 배치
Ruins 에 무너진 밭과 무너진 집 배치 (hint 속성 부여)
JSON export
```

AC:

```text
맵 크기가 64 × 64 이다
위험 지역에서 마을로 들어오는 통로가 정확히 한 곳이고 폭이 5 타일이다
village_gate 오브젝트가 그 통로 중앙에 있다
SpawnPoints 에 필수 이름 11종이 모두 있다
Ruins 타일이 Collision 레이어에 포함되지 않는다
Ruins 타일이 BuildableArea 안에 있다
Buildings 레이어가 존재하지 않는다
```

참조: `MVP_SPEC.md` 8장, 13장, 14장

주의: 입구 폭 5 타일 제약을 깨면 `safetyLevel` 계산과 엔딩 조건이 무의미해진다.

---

## TASK-005 맵 로드와 카메라

[ ]

작업:

```text
Tiled JSON 로드
Ground / GroundDecoration / Objects / Ruins 렌더
Collision 레이어를 NavigationGrid 초기값으로 변환
SpawnPoints 파싱 (누락 시 명확한 Error)
카메라를 맵 경계로 제한
```

AC:

```text
맵이 화면에 렌더된다
SpawnPoints 이름이 하나라도 빠지면 게임 시작 시 Error 가 발생한다
카메라가 맵 밖을 보여주지 않는다
```

참조: `MVP_SPEC.md` 8.3장, `ARCHITECTURE.md` 85장

---

## TASK-006 좌표 변환 유틸

[ ]

작업:

```text
gridToWorldTopLeft / gridToWorldCenter / worldToGrid
TILE_SIZE 상수
```

AC:

```text
테스트: gridToWorldTopLeft(10, 5) === { x: 320, y: 160 }
테스트: gridToWorldCenter(10, 5)  === { x: 336, y: 176 }
테스트: worldToGrid(336, 176)     === { x: 10, y: 5 }
테스트: worldToGrid(320, 160)     === { x: 10, y: 5 }
테스트: worldToGrid(351, 191)     === { x: 10, y: 5 }
gridToWorld 라는 이름의 함수가 존재하지 않는다
```

참조: `MVP_SPEC.md` 12장, `ARCHITECTURE.md` 14장

---

# Phase B. 플레이어 행동

## TASK-007 InputSystem

[ ]

작업:

```text
WASD / 방향키 → 이동 벡터
E → interact
B → build menu toggle
마우스 위치 → 화면 좌표
InputSystem 은 게임 상태를 직접 변경하지 않는다
```

AC:

```text
대각선 입력 시 벡터 길이가 1 로 normalize 된다
테스트: 상+우 입력의 벡터 길이가 1 이다
게임패드 코드가 존재하지 않는다
```

참조: `MVP_SPEC.md` 4장, 16장, `ARCHITECTURE.md` 19장

---

## TASK-008 플레이어 이동

[ ]

작업:

```text
Player Entity (순수 데이터, Phaser import 없음)
PhaserSpriteView
PlayerMovementController
Collision 레이어와 충돌 처리
```

AC:

```text
WASD 로 플레이어가 움직인다
대각선 이동 속도가 직선과 같다
Collision 타일을 통과하지 못한다
src/game/entities/player/Player.ts 가 Phaser 를 import 하지 않는다
카메라가 플레이어를 따라간다
```

참조: `MVP_SPEC.md` 15 ~ 16장, `ARCHITECTURE.md` 9장, 18장

---

## TASK-009 GameClockSystem

[ ]

작업:

```text
totalGameMinutes 누적
day / hour / minute 변환
DayPhase 계산 (morning / day / evening / night)
시(hour)가 바뀔 때 GAME_HOUR_CHANGED emit
Phaser 의존 없음. delta 를 인자로 받는다
```

AC:

```text
테스트: totalGameMinutes 480 → day 1, hour 8, minute 0
테스트: totalGameMinutes 1440 → day 2, hour 0
테스트: hour 6 → 'morning', 8 → 'day', 18 → 'evening', 20 → 'night'
테스트: hour 5 → 'night'
realSecondsPerGameHour 20 에서 실시간 20초가 게임 1시간이다
GameClockSystem 이 Phaser 를 import 하지 않는다
```

참조: `MVP_SPEC.md` 40 ~ 41장, `ARCHITECTURE.md` 42 ~ 44장

---

## TASK-010 EventBus

[ ]

작업:

```text
GameEventMap 정의
on / off / emit (payload 없는 이벤트용 오버로드 포함)
GameWorld 단위 인스턴스
```

AC:

```text
테스트: emit('MONSTER_THREAT_STARTED') 가 두 번째 인자 없이 컴파일된다
테스트: emit('CROP_HARVESTED', { farmId, amount }) 가 동작한다
테스트: off 후 리스너가 호출되지 않는다
전역 싱글턴이 아니다
FARM_BUILT / KITCHEN_BUILT 등 건물별 이벤트가 없다
```

참조: `ARCHITECTURE.md` 7장, 74장

---

## TASK-011 EntityRegistry / VillageStorage / VillageGate

[ ]

작업:

```text
EntityRegistry   등록 / 삭제 / 조회만
VillageStorage   seed / crop / food, 변경 시 STORAGE_CHANGED emit
VillageGate      village_gate 기준 가로 5칸의 입구 타일 목록
```

AC:

```text
테스트: VillageStorage.remove 가 수량 부족 시 false 를 반환하고 값을 바꾸지 않는다
테스트: VillageGate.getGateTiles() 가 5개 타일을 반환한다
테스트: village_gate (32,40) → [(30,40)...(34,40)]
EntityRegistry 에 게임 규칙이 없다
```

참조: `ARCHITECTURE.md` 11장, 38장, `MVP_SPEC.md` 14.1장

---

## TASK-012 DebugSystem 과 DebugPanel

[ ]

작업:

```text
FPS / Game Time / Player Grid Position 표시
DEBUG_MODE = import.meta.env.DEV
Logger 유틸 (debug / info / warn / error)
```

AC:

```text
개발 빌드에서 Debug Panel 이 보인다
프로덕션 빌드에서 Debug Panel 이 보이지 않는다
console.log 직접 호출이 코드에 없다
```

참조: `ARCHITECTURE.md` 82 ~ 84장

주의: 이후 Task에서 이 패널에 항목을 계속 추가한다. 가장 먼저 만드는 이유다.

---

## TASK-013 InventorySystem

[ ]

작업:

```text
InventoryState = Record<'wood'|'stone'|'seed', number>
add / remove / has / get
변경 시 INVENTORY_CHANGED emit
```

AC:

```text
테스트: remove 가 수량 부족 시 false 를 반환하고 값을 바꾸지 않는다
테스트: has(item, 0) 이 true 다
무게 / 슬롯 / 내구도 / 희귀도 코드가 없다
UI 가 Inventory 를 직접 수정하지 않는다
```

참조: `MVP_SPEC.md` 23장, `ARCHITECTURE.md` 21장

---

## TASK-014 Resource HUD

[ ]

작업:

```text
wood / stone / seed 수량 표시
INVENTORY_CHANGED 구독
```

AC:

```text
자원 수량이 화면에 보인다
매 프레임 Registry 를 탐색하지 않는다 (이벤트 기반 갱신)
```

참조: `MVP_SPEC.md` 62 ~ 63장, `ARCHITECTURE.md` 58장

---

## TASK-015 InteractionSystem

[ ]

작업:

```text
플레이어 주변 상호작용 대상 검색 (interactRadiusTiles)
가장 가까운 대상 선택
[E] 프롬프트 표시
실제 행동은 해당 시스템에 위임
```

AC:

```text
자원 노드 근처에서 "[E] 채집" 이 표시된다
NPC 근처에서 "[E] 대화" 가 표시된다
대상이 여러 개면 가장 가까운 하나만 선택된다
InteractionSystem 이 채집이나 대화를 직접 구현하지 않는다
```

참조: `MVP_SPEC.md` 17장, `ARCHITECTURE.md` 20장

---

## TASK-016 ResourceSystem — 채집과 Respawn

[ ]

작업:

```text
tree / rock / plant 노드 생성 (SpawnPoints 기준)
채집 (gatherSeconds 1.2초, 진행 표시)
획득량: tree 3 wood / rock 3 stone / plant 1 seed
Respawn: respawnAtTotalGameMinutes 기준
ResourceNode 는 스스로 Respawn 을 판단하지 않는다
```

AC:

```text
나무 채집 시 wood 가 3 증가한다
채집한 노드가 사라진다
게임 시간 240분 후 나무가 같은 위치에 다시 나타난다
테스트: respawnAt 판정이 totalGameMinutes 기준이다
Date.now() 나 performance.now() 를 사용하지 않는다
```

참조: `MVP_SPEC.md` 22장, `ARCHITECTURE.md` 22장

---

# Phase C. 건설과 주민 생활

## TASK-017 NavigationGrid — 두 통행 레이어

[ ]

작업:

```text
MapCollision / Building / Barrier 비트 관리
isWalkable(position, actor: 'ground' | 'monster')
setBuildingBlocked / setBarrier / clear
version 카운터
```

AC:

```text
테스트: Barrier 타일에서 isWalkable(p, 'ground') === true
테스트: Barrier 타일에서 isWalkable(p, 'monster') === false
테스트: Building 타일에서 두 actor 모두 false
테스트: setBarrier 호출 시 version 이 증가한다
isWalkable 의 actor 인자에 기본값이 없다
```

참조: `MVP_SPEC.md` 29.2장, 38.1장, `ARCHITECTURE.md` 15장, ADR 005

---

## TASK-018 BuildValidator

[ ]

작업:

```text
validate({ config, origin, inventory }): BuildValidationResult
5가지 Invalid 사유 판정
순수 함수. Phaser / Scene / Registry 의존 없음
```

AC:

```text
테스트: 빈 공간 + 충분한 자원 → valid
테스트: 맵 밖 → 'out_of_bounds'
테스트: Collision 타일 포함 → 'map_collision'
테스트: 기존 건물과 겹침 → 'overlaps_building'
테스트: BuildableArea 밖 → 'outside_buildable_area'
테스트: 자원 부족 → 'insufficient_resources' + missing 내용
테스트: Ruins 타일 위 → valid  (폐허는 막지 않는다)
validate 가 Phaser 를 import 하지 않는다
```

참조: `MVP_SPEC.md` 19장, `ARCHITECTURE.md` 26장, 81장

---

## TASK-019 Build Menu 와 Ghost Preview

[ ]

작업:

```text
B 키로 Build Menu 열기
건물 4종 표시. 미해금은 Locked 표시
선택 시 Build Mode 진입
마우스 위치 → worldToGrid → origin
Ghost Preview (Valid 녹색 / Invalid 빨강 + 사유 표시)
Ruins hint 가 있으면 안내 문구 표시
```

AC:

```text
B 키로 메뉴가 열린다
Farm 선택 후 마우스를 움직이면 3x3 Ghost 가 타일에 스냅된다
자원이 부족하면 Ghost 가 Invalid 로 표시되고 "나무가 부족합니다 (6 / 4)" 가 보인다
무너진 밭 위에서 "여기에 밭을 복구할 수 있습니다" 가 보인다
미해금 건물은 선택할 수 없다
```

참조: `MVP_SPEC.md` 18 ~ 19장, 66장, 8.2장

---

## TASK-020 BuildingSystem — 배치 확정

[ ]

작업:

```text
클릭 시 건물 생성 (재검증 없이 차감만)
BuildingFactory
Farm 이면 seed 비용을 VillageStorage.seed 로 이전
Ruins 타일 제거
EntityRegistry 등록
NavigationGrid 갱신 + version++
NAVIGATION_CHANGED / BUILDING_PLACED / INVENTORY_CHANGED emit
```

AC:

```text
자원을 모아 밭을 지으면 화면에 3x3 건물이 나타난다
wood 6 / stone 2 가 차감된다
VillageStorage.seed 가 3 증가한다
밭이 점유한 Ruins 타일이 사라진다
NavigationGrid 에서 건물 타일이 Blocked 가 된다
방벽을 지으면 setBarrier 가 호출된다 (setBuildingBlocked 가 아니다)
```

참조: `ARCHITECTURE.md` 23장, 25장, 92장

---

## TASK-021 A* Pathfinding

[ ]

작업:

```text
Grid 기반 A*
입력: start, goal, NavigationGrid, actor
출력: GridPosition[] 또는 null
Sprite 를 직접 움직이지 않는다
외부 Pathfinding 의존성 없음
```

AC:

```text
테스트: 장애물 없는 직선 경로
테스트: 장애물 우회 경로
테스트: 목적지가 완전히 차단되면 null
테스트: 같은 그리드에서 actor 'ground' 는 경로가 있고 'monster' 는 null 이다
        (방벽으로만 막힌 경우)
테스트: start === goal 이면 길이 1 또는 0 의 경로
Pathfinding 이 Phaser 를 import 하지 않는다
```

참조: `MVP_SPEC.md` 38장, `ARCHITECTURE.md` 16장, 80장

---

## TASK-022 MovementController 와 경로 무효화

[ ]

작업:

```text
PathFollow (path, index, goal, actor, navigationVersion)
follow / update / stop
도착 판정 (arriveThresholdPx)
navigationVersion 불일치 시 재계산
재계산 실패 시 'blocked' 반환
repathIntervalSeconds 로 재계산 빈도 제한
```

AC:

```text
NPC 또는 테스트용 Entity 가 경로를 따라 이동한다
이동 중 경로 위에 방벽을 세우면 경로가 재계산된다
경로가 완전히 막히면 'blocked' 를 반환한다
테스트: navigationVersion 이 바뀌면 재계산이 시도된다
```

참조: `ARCHITECTURE.md` 17장

주의: 이 Task가 없으면 Acceptance Test 6(방벽)이 실패한다. `ARCHITECTURE.md` 17.3 참조.

---

## TASK-023 NPC Entity / Factory / Action 골격

[ ]

작업:

```text
NPC Entity (순수 데이터. currentAction, view, stateLabel getter)
NPCAction 인터페이스 (kind, stateLabel, start, update, cancel)
IdleAction / MoveToAction
NPCFactory (Entity + PhaserSpriteView 조립)
NPCSystem.setAction (cancel → 대입 → start)
NPC 3명 생성 (farmer / cook / carpenter)
```

AC:

```text
NPC 3명이 SpawnPoints 위치에 나타나고 시각적으로 구분된다
src/game/entities/npc/NPC.ts 가 Phaser 를 import 하지 않는다
npc.state 필드가 존재하지 않는다
테스트: new NPC('npc_farmer_001', 'farmer', {x:10,y:10}) 가 Phaser 없이 생성된다
테스트: setAction 이 이전 Action 의 cancel 을 호출한다
Debug Panel 에 NPC 별 stateLabel 이 표시된다
```

참조: `ARCHITECTURE.md` 9장, 31장, `MVP_SPEC.md` 35장, ADR 006, ADR 008

---

## TASK-024 NPCSchedule 과 NPCDecisionSystem

[ ]

작업:

```text
NPCSchedule    시각 → ScheduledActivity
NPCContext     조립 (NPCSystem 이 담당)
NPCDecisionSystem.decide(npc, context): NPCAction
우선순위 4단계
```

AC:

```text
테스트: Farmer, 09:00, farm null, threat false → IdleAction
테스트: Farmer, 09:00, farm phase 'empty', seed 1, threat false → 밭으로 MoveTo
테스트: Farmer, 09:00, threat true → FleeAction  (직업 행동보다 우선)
테스트: 12:00, hasEatenThisMeal false, food 1 → 식사 장소로 MoveTo
테스트: 22:00, bed 있음 → 침대로 MoveTo
테스트: 22:00, bed 없음 → plaza 로 MoveTo
NPCDecisionSystem 이 EntityRegistry / Scene / WorldQuery 를 직접 참조하지 않는다
NPCContext 리터럴만으로 테스트가 작성된다
```

참조: `ARCHITECTURE.md` 29 ~ 30장, 78장, `MVP_SPEC.md` 37장

---

## TASK-025 FarmSystem ★

[ ]

작업:

```text
FarmState (phase, plantedAtTotalGameMinutes)
plant(farmId): boolean     seed -1
harvest(farmId): number    crop +4, seed +1
getStatus(farmId)
성장 판정 (growMinutes, totalGameMinutes 기준)
CROP_PLANTED / CROP_HARVESTED emit
```

AC:

```text
테스트: empty + seed 1 → plant 성공, phase 'growing', seed 0
테스트: empty + seed 0 → plant 실패, 상태 변화 없음
테스트: growing + growMinutes 경과 → phase 'ready'
테스트: growing + growMinutes 미경과 → phase 'growing' 유지
테스트: ready → harvest 시 crop +4, seed +1, phase 'empty'
테스트: 심기 -1 / 수확 +1 이므로 seed 수지가 0 이다
FarmPhase 에 'planted' 와 'harvested' 가 없다
plantedAt 필드명에 TotalGameMinutes 가 포함된다
```

참조: `MVP_SPEC.md` 26장, `ARCHITECTURE.md` 36 ~ 37장

---

## TASK-026 FarmerBehavior — PlantAction / HarvestAction ★

[ ]

작업:

```text
PlantAction   (plantSeconds 2초, 작업 애니메이션)
HarvestAction (harvestSeconds 2초)
FarmerBehavior 결정 로직
작물 성장 시각 표현 (최소 3단계)
```

AC:

```text
밭을 지으면 플레이어의 추가 명령 없이 농부가 밭으로 걸어간다
농부가 씨앗을 심는다
작물이 시각적으로 자란다
growMinutes 후 농부가 수확한다
crop 이 4 증가한다
seed 가 0 이면 농부가 밭 앞에서 기다린다
성장은 농부가 밭 앞에 없어도 진행된다
```

참조: `MVP_SPEC.md` 25장, 48장, 83장, `ARCHITECTURE.md` 35장

**이 Task 가 MVP 의 첫 번째 핵심 재미 검증 지점이다.**

완료 후 다음을 판단한다.

```text
밭을 만든 뒤 농부가 스스로 움직이기 시작하는 장면이 만족스러운가?
```

만족스럽지 않다면 이후 Task를 진행하기 전에 이 장면을 먼저 고친다.
연출, 이동 속도, 반응 지연, 애니메이션을 조정한다.

콘텐츠를 추가하지 않는다. (`GAME_DESIGN.md` 14.2, 16장)

---

## TASK-027 밭 씨앗 보충 상호작용

[ ]

작업:

```text
밭에 [E] → seed 1 기부 (Inventory → VillageStorage)
Inventory 에 seed 가 없으면 프롬프트를 표시하지 않는다
```

AC:

```text
밭 근처에서 "[E] 씨앗 보충" 이 표시된다
E 를 누르면 Inventory.seed 가 1 감소하고 VillageStorage.seed 가 1 증가한다
Inventory.seed 가 0 이면 프롬프트가 보이지 않는다
NPC 가 플레이어 Inventory 를 직접 읽는 코드가 없다
```

참조: `MVP_SPEC.md` 21.3장, `ARCHITECTURE.md` 38.1장

---

## TASK-028 CookAction

[ ]

작업:

```text
CookAction (cookSeconds 6초)
crop 2 → food 3
CookBehavior 결정 로직
조리 연출 (연기, 애니메이션)
FOOD_COOKED emit
```

AC:

```text
crop 이 2 이상이고 주방이 있으면 요리사가 주방으로 이동한다
조리 중 연기가 올라온다
crop 이 2 감소하고 food 가 3 증가한다
crop 이 2 미만이면 요리사가 대기한다
CollectCropAction 이 존재하지 않는다
```

참조: `MVP_SPEC.md` 27장, 49 ~ 50장, 84장, `ARCHITECTURE.md` 39장

---

## TASK-029 EatAction 과 첫 번째 저녁

[ ]

작업:

```text
EatAction (eatSeconds 4초)
hasEatenThisMeal 플래그 (식사 시간대 전환 시 초기화)
diningSpot 이동
food -1
MEAL_EATEN emit
```

AC:

```text
18:00 에 주민 3명이 식사 장소로 모인다
각자 food 를 1 소비한다
food 가 3 감소한다
같은 식사 시간대에 반복 식사하지 않는다
food 가 0 이면 식사를 건너뛰고 페널티가 없다
식사 후 원래 일정으로 복귀한다
```

참조: `MVP_SPEC.md` 51장, 85장, `ARCHITECTURE.md` 40장

---

## TASK-030 House 와 침대 배정

[ ]

작업:

```text
House 건물 (4x4, residentCapacity 3)
WorldQuery.getBedCount / getAssignedBed (NPC id 순서, 결정적)
```

AC:

```text
테스트: 집 1채 + NPC 3명 → 전원 침대 배정
테스트: 집 1채 + NPC 4명 → 3명 배정, 1명 null
테스트: getAssignedBed 를 여러 번 호출해도 같은 결과
테스트: 집 0채 → 전원 null
```

참조: `MVP_SPEC.md` 28장, `ARCHITECTURE.md` 13장, 41.2장

---

## TASK-031 SleepAction 과 RestAction

[ ]

작업:

```text
SleepAction  bed.door 이동 → view.setVisible(false) → stateLabel 'sleeping'
RestAction   plaza 이동 → 화면에 계속 보임 → stateLabel 'resting'
06:00 기상
집 조명 연출
```

AC:

```text
집이 있으면 22:00 에 주민이 집으로 걸어간다
문에 도착하면 스프라이트가 사라진다
집에 불이 켜진다
06:00 에 문 위치에서 다시 나타난다
집이 없으면 주민이 광장에 앉아 있고 화면에 계속 보인다
집 1채 + 주민 4명이면 1명이 광장에 남는다
SleepAction 과 RestAction 이 별도 Action 이다
```

참조: `MVP_SPEC.md` 28.3장, 52 ~ 53장, 86장, `ARCHITECTURE.md` 41장

---

## TASK-032 카펜터 InspectAction

[ ]

작업:

```text
InspectAction  마을 시설을 순회하며 점검 연출
CarpenterBehavior
```

AC:

```text
목수가 낮에 건물들을 순회한다
점검 중 작업 애니메이션이 재생된다
할 일이 없으면 Idle 이 된다
자동 건설이나 수리 기능이 없다
```

참조: `MVP_SPEC.md` 33장

---

# Phase D. 세계 연출

## TASK-033 DayNightVisualSystem

[ ]

작업:

```text
DayPhase 에 따른 화면 Tint / 밝기
건물 조명 on/off
GameClock 과 분리된 별도 시스템
```

AC:

```text
아침 / 낮 / 저녁 / 밤의 화면 밝기가 다르다
밤에 집에 불이 켜진다
GameClockSystem 이 렌더링 코드를 포함하지 않는다
```

참조: `MVP_SPEC.md` 41장, `ARCHITECTURE.md` 45장

---

## TASK-034 WorldState — 파생 지표

[ ]

작업:

```text
computeWorldState() 순수 함수
WorldState 클래스 (compute 만 제공, 변경 API 없음)
GameWorld.update 끝에서 1회 호출 + 변경 시 WORLD_STATE_CHANGED emit
Debug Panel 에 지표 표시
```

AC:

```text
테스트: population 3, food 12, bed 3, blockedGate 5, gateTiles 5
        → foodLevel 67, safetyLevel 100, housingLevel 100, happinessLevel 87
테스트: population 4, food 12, bed 3 → foodLevel 50, housingLevel 75, happinessLevel 73
테스트: population 0 → foodLevel 0, housingLevel 0 (0 division 없음)
테스트: 모든 지표가 0~100 범위로 clamp 된다
테스트: happinessLevel 이 72.5 인 입력에서 73 이 나온다 (half-up 반올림)
WorldState 에 increaseFood / increaseSafety / setPopulation 이 없다
WorldState 가 필드를 저장하지 않는다
BuildingConfig 에 worldStateEffects 가 없다
주민이 식사하면 foodLevel 이 내려간다
```

참조: `MVP_SPEC.md` 42 ~ 43장, `ARCHITECTURE.md` 12장, ADR 004

---

## TASK-035 DialogueSystem 과 DialogueBox

[ ]

작업:

```text
data/dialogues.ts
DialogueBox (NPC 이름 + 대사 + [계속])
대화 중 플레이어 입력 제한
NPC 머리 위 대화 가능 표시
스토리 조건을 직접 결정하지 않는다
```

AC:

```text
NPC 에게 [E] 로 말을 걸면 대사가 표시된다
대화 중 플레이어가 움직이지 않는다
[계속] 으로 진행하고 종료된다
대화 선택지가 없다
DialogueSystem 이 이벤트 조건을 판정하지 않는다
```

참조: `MVP_SPEC.md` 65장, `ARCHITECTURE.md` 55장

---

## TASK-036 ObjectiveSystem 과 ObjectivePanel

[ ]

작업:

```text
현재 목표 하나만 관리
OBJECTIVE_CHANGED emit
진행 수치 표시 지원 ("마을 입구를 막으세요 (3 / 5)")
```

AC:

```text
화면에 현재 목표 하나가 표시된다
목표가 바뀌면 화면이 갱신된다
Quest Log 가 없다
```

참조: `MVP_SPEC.md` 64장, `ARCHITECTURE.md` 56장

---

# Phase E. 진행과 위협

## TASK-037 GameEventSystem 골격

[ ]

작업:

```text
GameEventDefinition (canTrigger / execute → GameEventCommand[])
EventContext 조립 (전부 읽기 전용)
GameEventCommand dispatch
triggeredEvents 관리 + GAME_EVENT_TRIGGERED emit
```

AC:

```text
테스트: once true 인 이벤트가 두 번 발생하지 않는다
테스트: canTrigger 가 false 면 execute 가 호출되지 않는다
테스트: dispatch 가 커맨드를 배열 순서대로 실행한다
이벤트 정의가 시스템을 직접 호출하지 않는다
EventContext 의 모든 필드가 readonly 다
```

참조: `ARCHITECTURE.md` 50 ~ 52장, ADR 007

---

## TASK-038 진행 이벤트 6개

[ ]

작업:

```text
EVENT_FARM_REQUEST / KITCHEN_REQUEST / HOUSE_REQUEST
EVENT_FIRST_MONSTER / BARRIER_REQUEST / NEW_RESIDENT
data/events.ts 에 선언적으로 정의
```

AC (조건표 전체를 테스트한다):

```text
FARM_REQUEST      항상 true
KITCHEN_REQUEST   crop 0 → false / crop 1 → true
HOUSE_REQUEST     food 0 → false / food 1 → true
FIRST_MONSTER     HOUSE_REQUEST 미완료 → false
                  집 0채 → false
                  dayPhase 'day' → false
                  세 조건 모두 충족 → true
BARRIER_REQUEST   FIRST_MONSTER 미완료 → false
                  aliveMonsterCount 1 → false
                  aliveMonsterCount 0 + FIRST_MONSTER 완료 → true
NEW_RESIDENT      safetyLevel 60 → false
                  dayPhase 'night' → false
                  safetyLevel 100 + morning + BARRIER_REQUEST 완료 → true
```

추가 AC:

```text
게임 시작 시 목표 "마을을 둘러보세요" 가 표시된다
농부와 대화하면 목표가 "밭을 복구하세요" 로 바뀌고 Farm 이 해금된다
농부와 대화하지 않고 밭을 지어도 이후 진행이 막히지 않는다
조건에 "또는" 이 없다
```

참조: `MVP_SPEC.md` 45장, 47장, `ARCHITECTURE.md` 52.2장

---

## TASK-039 MonsterSystem

[ ]

작업:

```text
Monster Entity (순수 데이터) + View
MonsterState (spawn / moveToVillage / attackObstacle / leave)
spawn (spawnCount 3, monster_spawn 위치)
'monster' 통행 레이어로 경로 계산
경로 없음 → attackObstacle (attackObstacleSeconds 8초) → leave
despawnHour 05:00 강제 despawn
VILLAGE_BREACHED / MONSTER_THREAT_STARTED / ENDED emit
isThreatNear / aliveMonsterCount 제공
```

AC:

```text
집을 지은 그날 밤에 몬스터 3마리가 나타난다
몬스터가 마을 방향으로 이동한다
방벽이 없으면 마을 중심에 도달하고 VILLAGE_BREACHED 가 발생한다
경로가 막히면 8초 후 leave 로 전이한다
05:00 이 지나면 반드시 despawn 한다
몬스터가 제자리에 영구히 멈추는 상태가 없다
aliveMonsterCount 가 0 이 된다
Barrier 에 HP 가 없다
```

참조: `MVP_SPEC.md` 54 ~ 56장, `ARCHITECTURE.md` 46 ~ 48장, ADR 005

주의: `aliveMonsterCount`가 0이 되지 않으면 `EVENT_BARRIER_REQUEST`가 발생하지 않아
게임 진행이 막힌다.

---

## TASK-040 FleeAction

[ ]

작업:

```text
threatNearby → 현재 Action cancel → FleeAction
WorldQuery.findSafePosition (safe_spot 중 위협에서 가장 먼 곳)
'ground' 레이어로 경로 계산
위협 종료 후 Decision 재평가
```

AC:

```text
몬스터가 접근하면 주민이 작업을 중단하고 도망친다
주민이 safe_spot 으로 이동한다
주민이 몬스터 쪽으로 도망치지 않는다
위협이 사라지면 원래 일정으로 복귀한다
중단된 Action 을 저장하고 복원하지 않는다
방벽이 있어도 주민이 도피할 수 있다
```

참조: `MVP_SPEC.md` 57장, `ARCHITECTURE.md` 49장

---

## TASK-041 Barrier 와 방어 검증

[ ]

작업:

```text
Barrier 건물 (1x1, blocksMonsters true)
EVENT_BARRIER_REQUEST 후 해금
safetyLevel 계산 연동
목표 UI 진행 표시 "(3 / 5)"
```

AC — Acceptance Test 6 전체:

```text
입구 5칸을 모두 막으면 safetyLevel 이 100 이 된다
입구 3칸만 막으면 safetyLevel 이 60 이다
입구 밖에 방벽 5개를 세우면 safetyLevel 이 0 이다
방벽 완성 후 몬스터가 마을에 들어오지 못한다
방벽 완성 후 VILLAGE_BREACHED 가 발생하지 않는다
방벽 없을 때는 몬스터가 마을에 들어온다   (대조 조건)
방벽이 파괴되지 않는다
플레이어가 방벽 타일을 통과할 수 있다
NPC 가 방벽 타일을 통과할 수 있다
이동 중인 몬스터의 경로 위에 방벽을 세우면 경로가 재계산된다
```

참조: `MVP_SPEC.md` 29장, 58 ~ 59장, 88장, ADR 005

---

## TASK-042 EVENT_NEW_RESIDENT 와 엔딩

[ ]

작업:

```text
spawnResident 커맨드 처리 (role 'farmer', village_gate 위치)
새 주민이 기존 농부와 동일한 AI 로 즉시 생활 시작
엔딩 대사 2줄
카메라가 마을을 잠시 보여준다
"Village Population 3 → 4" 표시
엔딩 후에도 게임 계속 진행
```

AC — Acceptance Test 7 전체:

```text
방벽 완성 후 아침에 새 주민이 입구에 등장한다
이벤트가 1회만 발생한다
population 이 4 가 된다
housingLevel 이 100 → 75 로 내려간다
foodLevel 이 내려간다
새 주민이 낮에 밭 또는 광장으로 이동한다
새 주민이 식사 시간에 food 를 소비한다
새 주민이 밤에 광장에서 RestAction 을 수행한다
새 주민이 입구에 멈춰 서 있지 않다
엔딩 후에도 이동 / 채집 / 건설 / 관찰이 가능하다
새로운 NPC role 이 추가되지 않았다
```

참조: `MVP_SPEC.md` 60 ~ 61장, 89장, 95장

---

# Phase F. 마무리

## TASK-043 Audio

[ ]

작업:

```text
Footstep / Resource Gather / Building Complete /
Cooking / Night Ambience / Monster Alert
에셋이 없으면 Placeholder
```

AC:

```text
6종 효과음이 해당 상황에서 재생된다
에셋 누락 시 게임이 중단되지 않는다
```

참조: `MVP_SPEC.md` 68장

---

## TASK-044 SaveSystem

[ ]

작업:

```text
SaveData 직렬화 / localStorage 저장 / Load
Auto Save (Building 완료, Major Event 완료)
version 불일치 시 명확한 Error
저장 전용 DTO 사용
```

AC:

```text
테스트: 직렬화 → 역직렬화 왕복에서 데이터가 보존된다
저장 후 새로고침하면 다음이 복원된다
  플레이어 위치 / Inventory / VillageStorage(seed,crop,food)
  건물 / 밭의 phase 와 심은 시각
  자원 노드의 채집 여부와 Respawn 예정 시각
  NPC 목록 (역할과 위치)
  게임 시간 / triggeredEvents / 해금 건물 / 현재 목표
자라던 작물이 불러오기 후에도 자라고 있다
불러오기 시 모든 자원 노드가 부활하지 않는다
엔딩 후 저장 → 불러오기에서 주민이 4명으로 유지된다
WorldState 지표를 저장하지 않고 재계산한다
저장된 시간값이 전부 totalGameMinutes 기준이다
Date.now() 가 savedAt 외에 사용되지 않는다
version 불일치 시 Error 가 발생한다
```

참조: `MVP_SPEC.md` 71장, `ARCHITECTURE.md` 59 ~ 61장

주의: `npcs[]`를 복원하지 않고 "NPC 기본 생성"을 하면 4번째 주민이 사라진다.

---

# 3. Definition of Done

`MVP_SPEC.md` 94장의 조건에 다음을 추가한다.

## 3.1 코드

```text
pnpm build 가 경고 없이 성공한다
pnpm test 가 전부 통과한다
any / @ts-ignore / @ts-nocheck 가 없다 (불가피한 경우 이유 주석)
entities/ 의 어느 파일도 Phaser 를 import 하지 않는다
전역 Service Locator 와 Singleton 이 없다
```

## 3.2 체인 검증

다음 세 체인이 실제로 실행된다.

```text
Farm → Farmer → Crop → Cook → Food → Villagers Eat
Night → Monster → NPC Flee → Barrier → Village Protected
Village Restoration → World State 변화 → New Resident
```

## 3.3 감정 검증

`MVP_SPEC.md` 90장의 Q1 ~ Q7 중 대부분이 긍정적이어야 한다.

부정적이면 **콘텐츠를 추가하지 않고 기존 루프를 조정한다.**

---

# 4. Task 진행 기록

각 Task 완료 시 `docs/state/날짜_시간.md`에 다음을 기록한다.

```text
완료한 Task 번호와 이름
실제로 구현한 것
문서와 달라진 점 (있으면 문서를 먼저 수정한다)
확인한 AC 와 확인하지 못한 AC
다음 할 일
```
