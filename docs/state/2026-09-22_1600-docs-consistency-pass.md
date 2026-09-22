# 2026-09-22 16:00 — 문서 정합성 정리 완료

## 1. 이번 작업의 범위

코드는 아직 한 줄도 없다.

`GAME_DESIGN.md`, `MVP_SPEC.md`, `ARCHITECTURE.md` 세 문서를 전수 검토하여
논리 오류와 문서 간 충돌을 찾고 수정했다.

발견한 문제는 총 30여 건이며, 그중 구현을 시작하면 즉시 막히는 것이 6건,
문서 간 정면 충돌이 6건이었다.

## 2. 수정한 치명적 문제

### 2.1 WorldState 의 세 가지 모순 (ADR 004)

```text
건물 효과 키(foodProduction 등)가 WorldState 필드명과 달라 타입으로 표현 불가능
지표가 단조 증가만 하여 foodLevel < 20 조건이 발생 불가능
population 이 WorldState 와 EntityRegistry 에 이중 존재
```

`WorldState`를 **아무것도 저장하지 않는 파생 지표**로 재정의했다.

```text
foodLevel      storage.food / 목표 비축량
safetyLevel    막힌 입구 타일 수 / 5
housingLevel   침대 수 / 주민 수
happinessLevel 위 셋의 가중 평균 (0.4 / 0.3 / 0.3)
population     registry.npcs.size
```

변경 API(`increaseFood` 등)를 전부 삭제했고 `SaveData`에서도 제외했다.

### 2.2 농부가 심을 씨앗의 출처가 없었다

`seed`가 플레이어 Inventory에만 존재했는데 심는 주체는 NPC였다.

`VillageStorage`에 `seed`를 추가하고 이동 경로를 두 개로 한정했다.

```text
1. 밭 건설 비용의 seed 3 이 VillageStorage 로 이전
2. 밭에 [E] 로 씨앗 1개씩 기부
```

수확 시 `seed +1`이 나오도록 하여 밭 하나가 씨앗을 자급하게 만들었다.

### 2.3 BuildValidator 가 자원 부족을 판정할 수 없었다

시그니처에 Inventory가 없는데 테스트는 "자원 부족 → Invalid"를 요구했다.

`validate({ config, origin, inventory })`로 바꾸고 자원 검사를 Preview 단계로 옮겼다.

### 2.4 GameEvent 의 execute 가 아무것도 할 수 없었다 (ADR 007)

`EventContext`에 Dialogue / Objective / Monster / NPC 접근 경로가 없었다.

`execute`가 `GameEventCommand[]`를 반환하고 `GameEventSystem`이 전달하는 구조로 바꿨다.

이벤트 정의가 순수 함수가 되어 테스트가 입출력 비교로 끝난다.

### 2.5 TASKS.md 가 없었다

세 문서 모두가 읽으라고 지시하고 작업 절차의 필수 단계로 지정한 문서가 없었다.

44개 Task로 작성했다.

### 2.6 NPC Entity 가 Phaser Sprite 를 필수로 요구했다 (ADR 006)

`NPCDecisionSystem`을 테스트하려면 Phaser Scene을 띄워야 하는 구조였다.

Entity를 순수 데이터로 만들고 렌더링을 `EntityView`로 분리했다.

## 3. 수정한 문서 간 충돌

```text
이벤트 인과 순서가 반대였다
  GD: population >= 4 → 몬스터
  MVP: 몬스터 → 방벽 → population 4
  → MVP 순서를 정본으로 하고 GD 를 수정. 반대 구조는 확장 후보로 이관

GD 시나리오에 집 페이즈가 없었다 (3문제) 
  MVP 는 5페이즈이고 House 완료를 엔딩 조건으로 요구
  → GD 에 집 페이즈 추가 (4문제 + 엔딩)

몬스터 이벤트 조건이 "첫 번째 밤 또는 두 번째 밤" 이었다
  → "집 건설 후 첫 night" 로 결정적 조건화

Farm 상태 머신이 6개 vs 4개였다
  → 3개로 통일 (empty / growing / ready)

폴더 구조가 두 문서에서 달랐다
  → ARCHITECTURE 91장을 정본으로 하고 MVP_SPEC 73장을 요약으로 재작성

문서 경로가 docs/ 였으나 실제는 docs/project/
  → 전부 수정하고 docs/adr/, docs/state/ 추가
```

## 4. 수정한 게임플레이 논리 구멍

```text
방벽이 모든 Entity 를 막아 플레이어가 마을에 갇혔다 (ADR 005)
  → 몬스터에게만 Collision. NavigationGrid 에 두 통행 레이어

"방벽 완료" 의 정의가 없어 엔딩 조건 판정 불가
  → 마을 입구를 정확히 한 곳, 폭 5 타일로 고정
     safetyLevel = 막힌 입구 타일 수 / 5

AttackObstacle 의 결과가 미정의 (파괴되는가?)
  → 방벽은 파괴되지 않는다. 연출 전용 상태
     경로 없음 → 8초 후 leave → despawn 규칙 추가

"무너진 밭 복구" 서사와 "빈 땅에 Prefab 배치" 메커니즘이 충돌
  → Tiled 에 Ruins 레이어 신설. Collision 아님, 건설 시 제거
     Buildings 레이어는 삭제

집이 없는 밤의 NPC 행동이 미정의
  → RestAction 신설. 광장에서 밤을 보내며 화면에 계속 보인다
     이것이 플레이어가 집의 필요를 인식하는 유일한 단서

새 주민이 입구에 영구 정지할 예정이었다
  → farmer 역할을 재사용하여 즉시 생활 시작
     housingLevel 100 → 75 하락이 다음 건설 동기를 만든다

Farmer Alive 조건이 정의되지 않은 사망 시스템을 암시
  → 조건 삭제. MVP 에 NPC 사망 없음을 명시

밸런스 수치가 대부분 비어 있었다
  → balance.ts 전체 + buildings.ts 4종 + 수급 검산 작성
```

## 5. 수정한 아키텍처 정합성

```text
계층도가 스스로의 의존성 규칙을 위반 (World → Entities)
  → Entities 를 World Model 아래로 이동

NPCState 와 Action 이 이중 진실 원천 (ADR 008)
  → npc.state 필드 삭제. Action 이 유일한 원천, stateLabel 은 getter

NPCContext 에 판단에 필요한 정보가 없었다
  → farm.phase, storage, bed, hasEatenThisMeal 등 추가
     우선순위를 5단계 → 4단계로 축소 (Hunger 없는 "생존" 단계 삭제)

경로 재계산 트리거가 없었다
  → NavigationGrid.version + PathFollow.navigationVersion 비교
     이것이 없으면 Acceptance Test 6 이 실패한다

update 순서에서 BuildingSystem 이 NPCSystem 뒤에 있었다
  → 3번으로 이동. WorldState compute 를 9번에 추가

EventBus 결함 2건
  → 건물별 이벤트 4개를 BUILDING_PLACED 하나로 통합
     void payload 오버로드 추가
     *_CHANGED 이벤트 5종을 GameEventMap 에 정의

SaveData 에 3가지가 빠져 실제 버그를 유발
  → Farm phase/심은 시각, ResourceNode 상태, NPC 목록 추가
     모든 시간값을 totalGameMinutes 기준으로 통일 (필드명에 단위 명시)

gridToWorld 의 기준점 미정의
  → gridToWorldTopLeft / gridToWorldCenter 로 분리
     기준점이 드러나지 않는 이름은 사용 금지
```

## 6. 기타

```text
MVP_SPEC 말미의 생성 과정 부산물(대화체 문단) 삭제
게임패드를 MVP 범위에서 제외 (Build Mode 가 마우스 기반)
버전 정책 정리 — lockfile 이 정본, 문서는 메이저 제약만
DayNightSystem / DayNightVisualSystem 이름 통일
src/shared/types 삭제, src/game/types 로 일원화
반올림 규칙 명시 (Math.round, half-up) — 72.5 → 73
GAME_DESIGN 개발 우선순위를 의존성 순서로 재배열 (13 → 20단계)
  WorldState 와 이벤트 시스템이 몬스터보다 앞으로 이동
```

## 7. 현재 문서 상태

```text
docs/project/GAME_DESIGN.md    953 줄   v0.2
docs/project/MVP_SPEC.md      3880 줄   v0.2
docs/project/ARCHITECTURE.md  4136 줄   v0.2
docs/project/TASKS.md         1465 줄   v0.1
docs/adr/                        8 건
docs/state/                      1 건
```

## 8. 검증한 것

```text
밸런스 수치 검산
  총 건설 비용 wood 36 / stone 17 / seed 3
  채집 횟수 나무 12 / 돌 6 / 야생식물 3 = 21회 (약 25초)
  씨앗 수지 0 (심기 -1, 수확 +1) → 밭 1개 영구 순환
  하루 필요 food 9 vs 밭 1개 생산 12~18 → 자급 가능
  주민 4명 시 필요 12 → 여유 감소 → 밭 추가 동기

지표 계산 예시
  pop 3, food 12, bed 3, gate 5/5 → 67 / 100 / 100 / 87
  pop 4, food 12, bed 3, gate 5/5 → 50 / 75 / 100 / 73

Task 번호 001 ~ 044 연속, 누락 없음
ADR 참조 4건이 실제 파일과 일치
문서 간 이벤트 6종이 네 문서에 모두 존재
```

## 9. 다음 할 일

### 9.1 즉시

```text
TASK-001 프로젝트 생성
```

이때 **버전을 실제로 확인**해야 한다.

문서에는 `Node 24 LTS`, `Phaser 3.90 이상`, `Vite 8.x`, `Vitest 3.x`,
`Tiled 1.12 이상`으로 적혀 있으나 실제 설치 가능한 버전과
Vite 메이저 버전의 Node 24 호환성을 확인하지 않았다.

다르면 `MVP_SPEC.md` 5.1을 먼저 갱신하고 진행한다.

### 9.2 Phase A 완료까지

```text
TASK-001  프로젝트 생성
TASK-002  폴더 구조
TASK-003  Phaser 부팅과 Scene 3개
TASK-004  Tiled 맵 제작       ← 입구 5타일 제약 주의
TASK-005  맵 로드와 카메라
TASK-006  좌표 변환 유틸
```

`TASK-004`가 병목이 될 가능성이 높다.

맵 제작은 Tiled 수작업이 필요하고, 입구 폭 5타일과 SpawnPoints 11종 배치
제약을 만족해야 한다. 이 제약을 깨면 `safetyLevel` 계산과 엔딩 조건이
무의미해진다.

### 9.3 가장 중요한 지점

```text
TASK-026  FarmerBehavior
```

밭을 지으면 농부가 스스로 걸어가 일을 시작하는 장면이다.

이 장면이 만족스럽지 않으면 `TASK-027` 이후를 진행하지 않고
연출·이동속도·반응지연을 먼저 조정한다.

콘텐츠를 추가해서 해결하려 하지 않는다.

### 9.4 문서 관련 주의

```text
구현 중 문서와 다른 결정을 하면 문서를 먼저 고친다
구조적 결정은 docs/adr/ 에 ADR 로 남긴다
각 Task 완료 시 docs/state/ 에 기록한다
```

### 9.5 아직 검증되지 않은 것

```text
realSecondsPerGameHour 20 의 페이싱
  첫 저녁까지 실시간 3분 20초는 빡빡하다
  첫 플레이테스트의 1순위 튜닝 항목

밤 2분 40초 동안 NPC 전원 취침의 지루함
  플레이어는 채집과 건설을 계속할 수 있게 해두었으나 실제 체감은 미확인

Prefab 건설의 표현 자유도 부족
  주민 행동의 풍부함으로 보완해야 하며 이것이 MVP 의 검증 대상
```
