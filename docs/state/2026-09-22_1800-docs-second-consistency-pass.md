# 2026-09-22 18:00 — 2차 문서 정합성 정리 완료

## 1. 이번 작업의 범위

코드는 여전히 한 줄도 없다.

1차 정합성 패스(`2026-09-22_1600`) 이후의 문서를 다시 전수 검토했다.

이번에 나온 문제는 대부분 **1차에서 새로 도입한 구조가 아직 닿지 않은 주변부**였다.

```text
커맨드 반환 (ADR 007)      →  대사 종료를 목표에 연결할 수단이 없었다
파생 지표 (ADR 004)        →  진행 수치를 표시할 타입이 없었다
두 통행 레이어 (ADR 005)   →  입구에 건물을 지으면 진행이 막혔다
Entity 순수 데이터 (ADR 006) →  NPC 가 설 타일이 정의되지 않았다
```

총 19건을 수정했다. ADR 2건을 추가했다.

## 2. 구현을 막던 정의 누락 (6건)

### 2.1 대사 종료 → Farm 해금의 연결 수단이 없었다 (ADR 010)

`MVP_SPEC` 47.1의 흐름은 `Dialogue 종료 → Farm 해금`이었으나,
`GameEventCommand`에 "대사가 끝나면 ~한다"를 표현할 수단이 없었다.

같은 문서 47.2는 "대화하지 않고 바로 밭을 지어도 진행된다"고 명시하는데,
해금이 대사에 걸려 있으면 애초에 건설 메뉴에 밭이 없다.

해결:

```text
unlockBuilding / markNpcHasDialogue   이벤트 발생 즉시
목표 문구                              DIALOGUE_ENDED → objectiveOnEnd
```

`GameEventMap`에 `DIALOGUE_ENDED`를 추가하고,
`DialogueDefinition`에 `objectiveOnEnd?: Objective`를 두었다.

`DIALOGUE_ENDED`는 어떤 이벤트의 조건도 되지 않는다. 표시만 바꾼다.

### 2.2 Objective 가 진행 수치를 표현할 수 없었다

`{ id, text }`는 고정 문자열이라 `마을 입구를 막으세요 (3 / 5)`가 갱신되지 않는다.

`progress?: 'blockedGateTiles'`를 추가하고,
`ObjectiveSystem`이 `BUILDING_PLACED`에 반응해 재계산하도록 했다.

MVP에서 진행 수치를 쓰는 목표가 하나뿐이므로 열거형 하나로 두었다.

### 2.3 건물의 진입 타일이 정의되지 않았다

건물 타일은 두 통행 레이어 모두 Blocked 인데, 다음 네 곳이 모두
"건물의 어느 타일 앞"을 필요로 했다.

```text
PlantAction / HarvestAction   농부가 서는 타일
CookAction                    요리사가 서는 타일
getAssignedBed().door         NPC 가 들어가 사라지는 타일   ← 특히 미정의였다
findDiningSpot()              주민이 모이는 타일
```

`BuildingConfig.entranceOffset`을 추가하고 한 식으로 통일했다.

```text
entranceTile = building.origin + config.entranceOffset

farm (1,3)  kitchen (0,2)  house (1,4)
```

### 2.4 findDiningSpot() 의 출처가 없었다

`SpawnPoints` 11종에 식사 장소가 없었다.

`주방이 있으면 주방 진입 타일, 없으면 plaza`로 확정하고 `null` 반환을 없앴다.

### 2.5 몬스터의 "마을 중심 타일" 이 정의되지 않았다

`VILLAGE_BREACHED`의 판정 기준인데 맵에 대응 오브젝트가 없었다.

`plaza`로 확정했다. 도달 판정은 맨해튼 거리 1 이하다.

광장 타일에 NPC가 서 있어 경로가 닿지 않는 경우를 피하기 위해서다.

### 2.6 ScheduledActivity 가 한 번도 열거되지 않았다

`'eat' | 'work' | 'free' | 'sleep'` 4종으로 확정했다.

`wake`를 삭제했다. 기상은 `sleep`이 끝나는 것으로 표현되고,
06:00 이후의 행동을 `free`와 구별할 규칙이 없어 비어 있는 분기가 된다.

4종이 우선순위 4단계를 정확히 덮는다.

## 3. 문서 간·문서 내 충돌 (7건)

```text
ARCHITECTURE 29장   우선순위가 5단계 ("2. 생존" 잔존)
                    → 30.3 / MVP_SPEC 37장과 같은 4단계로 통일

MVP_SPEC 32장       Cook 행동에 CollectCrop
                    → ARCH 31 / 39.1 / TASK-028 AC 가 "존재하지 않는다" 라고 명시
                    → 삭제하고 이유를 적었다

MVP_SPEC 31장       Farmer 행동에 'Farm' (NPCActionKind 에 없는 값)
                    → Plant / Harvest 로 교체. 세 역할에 Rest 도 추가

MVP_SPEC 44장       낡은 인터페이스 { condition, trigger, once } 게시
                    → canTrigger / execute → GameEventCommand[] 로 교체

MVP_SPEC 37.1       "(40장)" 상호참조가 Game Clock 을 가리킴
                    → 39장 / ARCHITECTURE 40장으로 수정

ARCHITECTURE 86장   예시가 존재하지 않는 findNearestFarm()
                    → findNearestBuilding(from, type)

ARCHITECTURE 40.2   hasEatenThisMeal 초기화 주체가 GameClockSystem
                    → NPCSystem 이 GAME_HOUR_CHANGED 를 구독하도록 변경
                       (71장 허용 참조 목록에 없는 의존이었다)
```

추가로 `NavigationGrid.clear()`와 17.2의 "건설이나 철거로" 표현이
존재하지 않는 철거 기능을 암시하고 있었다.

`MVP_SPEC` 92장 제외 목록에 `Building Demolish`를 명시하고,
`clear()`는 불러오기 전용임을 주석으로 못박았다.

## 4. 게임플레이 구멍 (3건)

### 4.1 마을 입구에 건물을 지으면 진행이 영구히 막혔다 (ADR 009)

입구 타일은 방벽을 세워야 하므로 `BuildableArea` 안에 있어야 한다.

그런데 건물 종류 제약이 없어 두 가지 회복 불가능한 상태가 가능했다.

```text
집(4×4)이 입구 4칸을 덮는다
  → 그 칸에 방벽을 세울 수 없다 (overlaps_building)
  → safetyLevel 이 100 에 도달하지 못한다
  → EVENT_NEW_RESIDENT 가 영원히 발생하지 않는다

밭(3×3) + 주방(2×2)이 입구 5칸을 전부 덮는다
  → 건물은 두 레이어 모두 Blocked 다
  → 플레이어 · NPC · 새 주민 전원이 통과 불가
```

MVP에 철거가 없으므로 되돌릴 수 없다.

여섯 번째 Invalid 사유 `blocks_village_gate`를 추가했다.

```text
점유 타일이 입구를 포함하고 config.blocksMonsters !== true  →  Invalid
```

`blocksMonsters === true`인 건물은 방벽뿐이므로 새 개념 없이 한 줄로 끝난다.

`BuildValidationInput`에 `gateTiles`가 추가되었다.

### 4.2 엔딩 직전에 최대 7분의 무안내 대기가 있었다

`EVENT_NEW_RESIDENT`는 `dayPhase == 'morning'`(06:00~08:00, 실시간 40초)을
조건으로 가진다.

방벽을 낮에 완성하면 다음 아침까지 실시간 약 7분을 기다린다.

조건은 그대로 두었다. 새 주민이 아침에 오는 것은 의도된 연출이다.

대신 대기 중임을 목표로 알린다.

```text
방벽 미완성   "마을 입구를 막으세요"  + (3 / 5)
방벽 완성     "마을을 지켰다. 아침을 기다리세요."
```

이 문구가 없으면 완료된 목표를 보며 진행이 막혔다고 판단한다.

첫 플레이테스트의 2순위 확인 항목으로 `MVP_SPEC` 40.4에 기록했다.

### 4.3 자원 노드 개수가 "복수" 로만 적혀 있었다

첫 사이클에 나무 12회 / 돌 6회 / 야생 식물 3회 채집이 필요한데(77.3),
노드 수가 그보다 적으면 Respawn(실시간 80초)을 기다려야 한다.

첫 저녁까지의 3분 20초 안에 첫 사이클을 끝낼 수 없게 된다.

최소 개수를 **tree 12 / rock 8 / plant 4**로 확정했다.
첫 사이클을 Respawn 없이 충당할 수 있는 양이다.

`TASK-004` / `TASK-016`의 AC 로 검사한다.

사용하지 않던 Tiled `Interaction` 레이어도 삭제했다.
자원 노드는 `SpawnPoints`로 일원화한다.

## 5. 저장소 위생 (3건)

```text
.gitignore    node_modules / dist / coverage / .env 등이 없었다
              TASK-001 에서 즉시 문제가 된다. 전면 재작성

AGENTS.md     문서 읽기 순서와 충돌 우선순위가 없었다
              에이전트가 처음 읽는 파일인데 문서 체계를 알 수 없었다
              4장 → 7장 구조로 재작성

README.md     없었다. 신규 작성
```

## 6. 추가한 ADR

```text
docs/adr/009-village-gate-build-restriction.md
docs/adr/010-dialogue-ends-only-updates-objective.md
```

## 7. 현재 문서 상태

```text
docs/project/GAME_DESIGN.md    957 줄   v0.2
docs/project/MVP_SPEC.md      4223 줄   v0.3
docs/project/ARCHITECTURE.md  4387 줄   v0.3
docs/project/TASKS.md         1516 줄   v0.2
docs/adr/                       10 건
docs/state/                      2 건
README.md / AGENTS.md          신규 / 재작성
```

## 8. 검증한 것

```text
장 번호 연속성
  MVP_SPEC     1 ~ 95    누락 없음
  ARCHITECTURE 1 ~ 106   누락 없음

절 번호 역순    4개 문서 전부 없음 (19.2 / 24.2 삽입 위치 교정 후)

상호참조        `문서.md N장` 형태 전부 실제 장으로 해석됨
ADR 참조        파일 경로 / "ADR NNN" 표기 전부 실재

용어 일관성
  CollectCrop   "두지 않는다" 서술로만 남음
  findNearestFarm / Interaction 레이어 / 낡은 GameEvent 인터페이스  전부 제거
  ScheduledActivity  두 문서에서 동일한 4종 유니온
```

## 9. 다음 할 일

### 9.1 즉시

```text
TASK-001 프로젝트 생성
```

1차 패스에서 남긴 주의사항이 그대로 유효하다.

문서의 `Node 24 LTS` / `Phaser 3.90 이상` / `Vite 8.x` / `Vitest 3.x` /
`Tiled 1.12 이상`은 **실제 설치 가능한 버전으로 확인되지 않았다.**

다르면 `MVP_SPEC.md` 5.1을 먼저 갱신하고 진행한다.

### 9.2 Phase A 완료까지

```text
TASK-001  프로젝트 생성
TASK-002  폴더 구조
TASK-003  Phaser 부팅과 Scene 3개
TASK-004  Tiled 맵 제작       ← 제약이 늘어났다. 아래 참조
TASK-005  맵 로드와 카메라
TASK-006  좌표 변환 유틸
```

`TASK-004`의 제약이 이번 패스로 늘어났다.

```text
입구 폭 5 타일, 한 곳
입구 5 타일이 BuildableArea 안에 있을 것        ← 추가
SpawnPoints 필수 이름 11종
resource_tree 12 / rock 8 / plant 4 이상        ← 추가
plaza 가 마을 한가운데 (노숙·식사·몬스터 목표 겸용)  ← 추가
건물 후보 위치의 진입 타일이 통행 가능할 것        ← 추가
Interaction 레이어 없음                          ← 추가
```

맵을 한 번 만들고 나면 이 제약을 나중에 고치기 어렵다.
`TASK-004`를 시작하기 전에 `MVP_SPEC` 8장 / 13장 / 14장을 다시 읽는다.

### 9.3 가장 중요한 지점

변함없이 `TASK-026` FarmerBehavior 다.

밭을 지으면 농부가 스스로 걸어가 일을 시작하는 장면이 만족스럽지 않으면
`TASK-027` 이후를 진행하지 않는다.

### 9.4 아직 검증되지 않은 것

1차 패스의 세 항목에 하나가 추가되었다.

```text
realSecondsPerGameHour 20 의 페이싱      (1순위 튜닝 항목)
밤 2분 40초 동안 NPC 전원 취침의 지루함
Prefab 건설의 표현 자유도 부족

엔딩 직전 아침 대기 최대 7분             (2순위 확인 항목)   ← 신규
  대기 목표 문구로 완화했으나 실제 체감은 미확인
  realSecondsPerGameHour 를 올리면 대기도 함께 길어진다
```

### 9.5 문서 관련 주의

```text
구현 중 문서와 다른 결정을 하면 문서를 먼저 고친다
구조적 결정은 docs/adr/ 에 ADR 로 남긴다
각 Task 완료 시 docs/state/ 에 기록한다
```
