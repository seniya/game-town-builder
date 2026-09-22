# MVP_SPEC.md

# Small Village Restoration Game — Vertical Slice Specification

Version: 1.0
Status: DQB2 Redesign Baseline
Date: 2026-09-22

---

# 1. 문서 목적

이 문서는 **무엇을 만드는가** 를 정의한다.

**수치와 조건식의 정본은 이 문서다.**

## 1.1 문서 간 충돌 시 우선순위

```text
수치 / 조건식         →  MVP_SPEC.md      (이 문서)
인터페이스 / 구조      →  ARCHITECTURE.md
작업 순서 / 완료 조건  →  TASKS.md
의도 / 감정 목표      →  GAME_DESIGN.md
```

`GAME_DESIGN.md` 에 등장하는 수치는 의도를 설명하기 위한 예시이며 구현 기준이 아니다.

## 1.2 이 문서는 한 번 전면 개정되었다

Version 0.2 는 2D Top-down / Prefab 건물 4 종 / 20~30 분 MVP 를 정의했다.

Version 1.0 에서 목표가 **드래곤 퀘스트 빌더즈 2 형 게임** 으로 재정의되었다.

```text
ADR 011   Phaser 3 / 2D  →  Three.js / 3D 복셀
ADR 012   Prefab 배치     →  자유 건축 + 방 인식
ADR 013   감사 포인트 + 마을 레벨 도입
ADR 014   복셀 청크 16³ + 그리디 메싱
ADR 015   3D 통행 그래프 + 파괴 가능한 벽
```

폐기된 ADR: 001, 002, 005, 009.

---

# 2. 수직 슬라이스의 최종 목표

플레이어가 약 90~120 분 플레이한 뒤 다음을 느끼는 것을 목표로 한다.

> 내가 쌓은 벽 안에서, 내가 놓은 침대에 사람들이 누워 잔다.

그리고 이어서

> 이 마을을 조금 더 키워보고 싶다.

## 2.1 검증 대상

세 개의 루프가 전부 돌아가는지 검증한다.

```text
요청 루프    주민의 요청 → 건설 → 진행
인식 루프    자유 건축 → 게임이 방으로 인식 → 주민이 사용      ★ 최우선
성장 루프    감사 포인트 → 종 → 마을 레벨 → 해금
```

## 2.2 범위

```text
분량         90 ~ 120 분
월드         128 × 64 × 128 복셀 섬 1 개
블록         22 종 (air 제외)
방 레시피     5 종 (빈 방 / 창고 / 침실 / 주방 / 식당)
주민         3 명 시작 → 최대 5 명
마을 레벨     1 → 3
몬스터 습격    2 회
진행 이벤트    8 개
```

---

# 3. 가장 중요한 개발 원칙

## 3.1 기능보다 반응을 먼저 만든다

```text
잘못된 우선순위            올바른 우선순위

블록 100 종               침대 1 개
가구 50 종                    ↓
방 레시피 20 종            방이 인식된다
주민 30 명                     ↓
                          주민이 밤에 들어간다
                              ↓
                          침대에 눕는다
                              ↓
                          감사 포인트가 뜬다
```

콘텐츠 개수보다 연결성이 중요하다.

## 3.2 판정 실패는 반드시 설명한다

방이 인식되지 않았을 때 플레이어가 이유를 알 수 없으면 게임이 그 자리에서 끝난다.

**방 진단 UI 는 선택 기능이 아니다.** 방 인식 시스템과 같은 Task 에서 구현한다.

---

# 4. 플랫폼

```text
대상        Desktop Web Browser
입력        키보드 + 마우스
해상도      1280 × 720 기준. 창 크기에 맞춰 스케일
Gamepad     구현하지 않는다
모바일       구현하지 않는다
```

---

# 5. 기술 스택

```text
Runtime          Node.js 24 LTS
Package Manager  pnpm (lockfile 커밋)
Language         TypeScript 5.x (strict: true)
Renderer         three 0.18x 이상  —  WebGLRenderer (WebGL2)
Build            Vite 8.x  —  SPA
Test             Vitest 3.x
Worker           표준 Web Worker (Vite 의 ?worker import)
```

사용하지 않는다:

```text
Phaser          (ADR 011 로 폐기)
Tiled           (맵을 데이터로 생성한다)
React / Next.js (ADR 003 유지)
Redux / Zustand / MobX / RxJS
물리 엔진 (Rapier / Havok / cannon)
WebGPURenderer  (ADR 011 의 전환 조건 참조)
```

## 5.1 버전 정본은 lockfile 이다

`package.json` 과 `pnpm-lock.yaml` 이 정본이다.
문서는 메이저 버전 제약만 규정한다.

## 5.2 엔진 격리 규칙

```text
src/game/**     three 를 import 하지 않는다. 순수 TypeScript.
src/render/**   three 를 import 한다.
src/ui/**       DOM 만 쓴다. three 를 import 하지 않는다.
src/workers/**  three 를 import 하지 않는다.
```

ESLint 의 `no-restricted-imports` 로 강제한다.
이 규칙을 깨는 PR 은 병합하지 않는다.

---

# 6. 테스트

```text
Phaser 가 없던 것처럼, three 없이 실행 가능해야 한다
```

테스트 대상:

```text
그리디 메싱 함수          순수 함수. 입력 블록 배열 → 정점 배열
방 인식                  순수 함수. 블록 배열 + 시작점 → RoomDetectionResult
방 레시피 매칭            순수 함수. 가구 목록 → RoomType
통행 판정 / A*            순수 함수
World State 계산          순수 함수
감사 포인트 / 레벨 게이트   순수 함수
NPC Decision              Context → Action
진행 이벤트 조건           EventContext → boolean
인벤토리 / 저장소          상태 전이
```

`src/render/` 는 단위 테스트 대상이 아니다. 수동 확인한다.

---

# 7. 월드

## 7.1 크기

```text
x   128
y    64
z   128
```

```text
y = 0        bedrock. 파괴 불가
y = 1 ~ 23   돌
y = 24       해수면
y = 25 ~ 34  지표면 (섬의 기복)
y = 35 ~ 63  하늘
```

사방이 바다다. 절차적 생성을 쓰지 않는다.
섬 지형은 고정 데이터로 생성한다.

## 7.2 청크

```text
청크 크기     16 × 16 × 16
청크 개수     8 × 4 × 8 = 256
인덱스        index = x + z * 16 + y * 256
저장          Uint16Array(4096)
```

## 7.3 좌표계

```text
BlockPos       정수 복셀 좌표 { x, y, z }
Vec3           실수 월드 좌표 { x, y, z }
```

블록 한 변의 길이는 월드 좌표 1.0 이다.

```text
blockToWorldMin(p)     = { x: p.x,       y: p.y,       z: p.z       }
blockToWorldCenter(p)  = { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 }
worldToBlock(v)        = { x: floor(v.x), y: floor(v.y), z: floor(v.z) }
```

**변환 함수 이름에 기준점을 명시한다.** `blockToWorld` 라는 이름을 쓰지 않는다.
어느 지점인지 모르면 캐릭터가 블록 모서리에 서는 버그가 반복된다.

## 7.4 섬 구성

```text
영역          중심 좌표 (x, z)    내용
마을 터        (64, 64)           폐허. 부서진 판자벽과 기초. 마을의 종 1 개
숲            (40, 48)           나무 24 그루 (log + leaves)
채석장         (88, 52)           노출된 돌 지대
물가           (64, 96)           담수. 점토
어두운 외곽     (64, 24) / (24,64) 몬스터 스폰 지점 2 곳
바다           섬 바깥             y=24 까지 물
```

마을의 종은 `(64, 지표면, 64)` 에 고정 배치된다. 플레이어가 부술 수 없다.

## 7.5 스폰

```text
플레이어 시작   (64, 지표면+1, 70)
농부           (62, 지표면+1, 62)
요리사          (66, 지표면+1, 62)
목수           (64, 지표면+1, 60)
```

---

# 8. 블록

## 8.1 블록 목록

```text
id  name            kind       solid  opaque  terrain  breakSec  비고
 0  air             air        F      F       -        -
 1  bedrock         terrain    T      T       T        -         파괴 불가
 2  dirt            terrain    T      T       T        0.6
 3  grass           terrain    T      T       T        0.6
 4  stone           terrain    T      T       T        1.5
 5  sand            terrain    T      T       T        0.5
 6  log             terrain    T      T       T        1.0
 7  leaves          terrain    T      F       T        0.2
 8  water           fluid      F      F       T        -         파괴 불가
 9  plank           build      T      T       F        0.8       벽 / 바닥
10  stone_brick     build      T      T       F        2.0       벽. 더 단단하다
11  door            door       F*     F       F        0.8       * 아래 8.3
12  window          build      T      F       F        0.8       벽으로 인정된다
13  torch           light      F      F       F        0.1       조명
14  bed             furniture  T      T       F        0.8
15  cooking_stove   furniture  T      T       F        1.2
16  water_pot       furniture  T      T       F        0.8
17  table           furniture  T      T       F        0.8
18  chair           furniture  T      T       F        0.6
19  chest           furniture  T      T       F        0.8
20  farmland        build      T      T       F        0.5       밭흙
21  crop            crop       F      F       F        0.2       farmland 위에만
22  bell            special    T      T       F        -         파괴 불가. 1 개
```

## 8.2 terrain 플래그의 의미

```text
terrain = true    몬스터가 파괴하지 않는다. 우회한다
terrain = false   몬스터가 파괴한다
```

플레이어가 `dirt` 를 캐서 다시 놓아도 `terrain` 이다.
"누가 놓았는가" 를 추적하지 않는다. 블록 종류만 본다.

이 규칙이 없으면 플레이어가 흙벽으로 무적 요새를 짓는다.
**방어용 벽은 반드시 `plank` / `stone_brick` / `window` / `door` 여야 한다.**

## 8.3 door 는 통행에서만 비고체다

```text
Player / NPC    통과할 수 있다  (통행 판정에서 비고체)
Monster         통과할 수 없다  (통행 판정에서 고체, 파괴 대상)
방 인식          벽으로 인정된다
충돌             플레이어는 통과한다
```

문의 열림 / 닫힘 상태를 두지 않는다. 항상 이 규칙으로 동작한다.

## 8.4 벽으로 인정되는 블록

방 인식에서 경계로 인정되는 블록은 다음뿐이다.

```text
plank / stone_brick / window / door
```

`dirt`, `stone`, `log` 같은 지형 블록은 **벽으로 인정되지 않는다.**

이유는 산비탈을 파고 들어가 "동굴이 방이다" 라고 주장하는 것을 막기 위해서다.
방은 플레이어가 지은 것이어야 한다.

## 8.5 제작

제작대를 두지 않는다. 인벤토리에서 바로 제작한다.

```text
plank         × 4   ←  log × 1
stone_brick   × 4   ←  stone × 2
door          × 1   ←  plank × 4
window        × 2   ←  plank × 2 + sand × 1
torch         × 4   ←  log × 1
bed           × 1   ←  plank × 4 + leaves × 4
cooking_stove × 1   ←  stone × 6
water_pot     × 1   ←  stone × 3
table         × 1   ←  plank × 4
chair         × 1   ←  plank × 2
chest         × 1   ←  plank × 6
farmland      × 1   ←  dirt × 1
```

점토(clay)를 도입하지 않는다. 제작 재료는 8.1 표에 있는 블록으로만 구성한다.
재료 종류를 늘리는 것은 38 장의 금지 사항이다.

---

# 9. 플레이어

## 9.1 제원

```text
높이         1.8 (블록 2 칸 공간 필요)
폭           0.6 × 0.6 (AABB)
이동 속도     4.5 / 초
달리기        7.0 / 초  (Shift)
점프 높이     1.25 (한 칸 오르기 가능)
중력         -22 / 초²
최대 낙하 속도 -30 / 초
체력         20
```

## 9.2 입력

```text
W A S D        이동
Shift          달리기
Space          점프
마우스 이동      카메라 회전
좌클릭          블록 파괴 / 몬스터 공격
우클릭          블록 설치
1 ~ 9          핫바 선택
휠             핫바 이동
E              인벤토리 / 제작 열기
F              상호작용 (NPC 대화 / 종 치기)
Tab            방 진단 모드 토글
Esc            메뉴
F3             디버그 패널
```

## 9.3 카메라

```text
3 인칭 고정 거리 카메라
거리        5.0
피치 제한    -80° ~ +60°
충돌        카메라가 블록을 관통하면 거리를 줄인다
```

1 인칭을 구현하지 않는다. 자기가 만든 마을을 보는 게임이다.

## 9.4 충돌

물리 엔진을 쓰지 않는다. 축 분리 AABB 스윕으로 직접 계산한다.

```text
1. x 축으로 이동시키고 겹치는 고체 블록을 찾아 밀어낸다
2. z 축으로 같은 과정
3. y 축으로 같은 과정. 지면에 닿으면 onGround = true
```

한 칸 자동 오르기(step-up)를 구현한다. 높이 1.0 이하의 턱은 자동으로 오른다.

---

# 10. 블록 파괴와 설치

## 10.1 대상 선택

시선 방향으로 레이캐스트한다.

```text
최대 거리        5.0
알고리즘         복셀 DDA (Amanatides & Woo)
결과            { blockPos, faceNormal } 또는 null
```

## 10.2 파괴

```text
좌클릭을 누르고 있는다
    ↓
진행도 += dt / blockDefinition.breakSeconds
    ↓
진행도 >= 1 이면 블록이 air 가 되고 drops 가 인벤토리에 들어간다
```

대상이 바뀌면 진행도는 0 으로 초기화된다.

`breakSeconds` 가 `-` 인 블록(bedrock / water / bell)은 파괴되지 않는다.

## 10.3 설치

```text
우클릭
    ↓
targetBlockPos + faceNormal 위치가 air 인가
    ↓
그 위치가 플레이어 AABB 와 겹치지 않는가
    ↓
핫바의 현재 아이템이 1 개 이상인가
    ↓
설치 규칙(10.4)을 만족하는가
    ↓
설치. 아이템 1 소모
```

## 10.4 블록별 설치 규칙

```text
crop          바로 아래가 farmland 여야 한다. 플레이어는 설치하지 않는다 (농부만)
farmland      바로 아래가 고체여야 한다
bed           수평으로 2 칸을 차지한다. 두 칸 모두 비어 있어야 한다
table/chair   바로 아래가 고체여야 한다
torch         바로 아래 또는 옆면이 고체여야 한다
door          바로 아래가 고체여야 한다
bell          플레이어가 설치할 수 없다
```

`bed` 가 2 칸을 차지하는 것은 방 판정에서 침대 접근성 조건을 의미 있게 만들기 위해서다.

## 10.5 변경 이후의 처리

블록이 바뀌면 다음이 순서대로 발생한다.

```text
1. VoxelWorld 가 블록을 쓴다
2. 해당 청크와 경계를 공유하는 인접 청크를 메싱 큐에 넣는다
3. 통행 그래프의 해당 좌표 주변 3 × 3 × 3 캐시를 무효화한다
4. 방 재판정 큐에 해당 좌표를 넣는다
5. BLOCK_CHANGED 이벤트를 발행한다
```

---

# 11. 방 인식

**이 장이 이 프로젝트의 핵심이다.**

## 11.1 파라미터

```text
roomMinFloorArea      4       2 × 2 미만은 방이 아니다
roomMaxFloorArea      100
roomMinWallHeight     2
roomDetectBudgetMs    3       프레임당 방 재판정 예산
```

## 11.2 빈 방 조건

다음을 모두 만족하면 `EmptyRoom` 이다.

```text
1  내부 셀이 전부 비고체다
2  내부 셀 바로 아래(y-1)가 전부 고체다
3  내부 셀 집합의 수평 경계가 전부 벽 블록이다 (8.4 참조)
4  경계 블록이 바닥 위 roomMinWallHeight 칸 이상 연속으로 존재한다
5  경계에 door 가 1 개 이상 있다
6  roomMinFloorArea <= 내부 셀 수 <= roomMaxFloorArea
```

천장은 요구하지 않는다.

## 11.3 알고리즘

```text
입력   변경된 블록 좌표 집합

1  좌표 주변에서 door 블록을 수집한다
2  각 door 의 수평 인접 4 셀 중 비고체이고 바로 아래가 고체인 셀을 시작점으로 잡는다
3  시작점의 y 를 고정하고 4 방향 flood fill 한다
     비고체 셀            → 확장한다
     벽 블록(8.4)         → 경계에 기록하고 멈춘다
     그 외 고체 / 지형 블록 → 실패: NOT_ENCLOSED
     바닥이 없는 셀        → 실패: NO_FLOOR
     월드 경계            → 실패: NOT_ENCLOSED
     방문 수 > 100        → 실패: TOO_LARGE
4  방문 수 < 4            → 실패: TOO_SMALL
5  경계 셀마다 y+1 이 벽 블록인지 검사      → 실패: WALL_TOO_LOW
6  경계에 door 가 없다                    → 실패: NO_DOOR
7  성공. RoomDetectionResult 를 만든다
```

**3 번의 "그 외 고체" 가 실패인 것이 중요하다.**

흙이나 돌을 벽으로 쓸 수 없다는 8.4 의 규칙이 여기서 강제된다.

## 11.4 실패 사유는 전부 좌표를 들고 있다

```ts
type RoomFailure =
  | { reason: 'NOT_ENCLOSED'; at: BlockPos }
  | { reason: 'NO_FLOOR';     at: BlockPos }
  | { reason: 'NO_DOOR' }
  | { reason: 'WALL_TOO_LOW'; at: BlockPos }
  | { reason: 'TOO_LARGE' }
  | { reason: 'TOO_SMALL' };
```

`at` 이 있는 실패는 진단 모드에서 그 좌표를 빨갛게 표시한다.

## 11.5 진단 모드 (Tab)

```text
인식된 방        초록 경계 + 방 이름
판정 실패한 공간   빨간 표시 + 실패 사유 문구 + 원인 좌표 하이라이트
```

판정 실패한 공간을 찾는 방법:

```text
플레이어가 서 있는 위치에서 11.3 의 flood fill 을 시도한다
(door 가 없어도 플레이어 위치를 시작점으로 강제한다)
```

이렇게 하면 "문을 아직 안 달았다" 도 진단할 수 있다.

## 11.6 재판정 범위

블록 하나가 바뀌면 다음만 재판정한다.

```text
1  그 좌표를 내부 셀 또는 경계로 포함하는 기존 방
2  그 좌표가 door 이거나 door 에 인접하면, 그 door 기준 새 판정
```

월드 전체를 스캔하지 않는다.

재판정은 큐에 쌓이고 프레임당 `roomDetectBudgetMs` 안에서 처리한다.
같은 방이 큐에 중복으로 들어가면 합친다.

## 11.7 방이 해제될 때

인식되어 있던 방이 조건을 잃으면:

```text
ROOM_UNREGISTERED 이벤트 발행
그 방에 배정된 침대 사용자는 배정을 잃는다
그 방을 목적지로 이동 중이던 NPC 는 현재 Action 을 취소한다
자고 있던 NPC 는 깨어난다
경고음과 함께 방 이름이 사라진다
```

**감사 포인트는 회수하지 않는다.** ADR 013 의 비가역 원칙이다.

---

# 12. 방 레시피

## 12.1 목록

```text
priority  type         조건
   40     DiningRoom   table >= 1
                       그 table 에 수평 인접한 chair >= 2
   30     Kitchen      cooking_stove >= 1 AND water_pot >= 1
                       cooking_stove 에 수평 인접한 비고체 셀 >= 1
   20     Bedroom      접근 가능한 bed >= 1
   10     Storeroom    chest >= 1
                       chest 에 수평 인접한 비고체 셀 >= 1
    0     EmptyRoom    조건 없음
```

`priority` 내림차순으로 검사하여 최초로 만족하는 타입을 부여한다.
한 방은 하나의 타입만 가진다.

## 12.2 접근 가능한 bed 의 정의

```text
bed 가 차지한 2 칸 중 적어도 한 칸이,
그 방의 내부 셀과 수평으로 인접해 있고,
그 인접 셀이 통행 가능하다
```

이 조건이 없으면 벽 틈에 낀 침대가 방 판정을 통과한다.
주민이 도달할 수 없으므로 게임이 멈춘다.

## 12.3 식당에 음식을 요구하지 않는다

DQB2 는 식탁 위의 음식을 요구한다.

이 프로젝트는 요구하지 않는다.

```text
음식을 요구한다   →  식당이 있어야 요리사가 배식한다
                    요리사가 배식해야 식당이 인식된다
                    → 순환 조건. 게임이 시작되지 않는다
```

음식은 요리사가 식사 시간에 식탁 위에 올리는 **연출** 이다. 판정 조건이 아니다.

## 12.4 방 타입이 주민에게 주는 것

```text
Bedroom      bed 위치 목록            SleepAction 목적지
Kitchen      cooking_stove 인접 셀     CookAction 목적지
DiningRoom   chair 위치 목록          EatAction 목적지
Storeroom    chest 위치               VillageStorage 의 물리적 위치
EmptyRoom    없음
```

`RoomDetectionResult` 는 이 지점 목록을 반드시 포함한다.

`findNearestRoom(type)` 이 Version 0.2 의 `findNearestBuilding(type)` 을 대체한다.

## 12.5 방이 없을 때의 대체 동작

```text
Bedroom 없음     광장(종 주변)에서 RestAction. 잠들지 않는다
Kitchen 없음     요리를 하지 않는다. crop 이 쌓인다
DiningRoom 없음  광장에서 식사한다. 감사 포인트가 발생하지 않는다
Storeroom 없음   종의 위치가 기본 저장소다
```

**대체 동작이 존재하는 것이 중요하다.**
아무 방도 없는 상태에서 게임이 멈추면 안 된다.
그리고 대체 동작은 항상 감사 포인트를 주지 않는다. 그것이 방을 지을 동기가 된다.

---

# 13. 자원과 저장소

## 13.1 플레이어 인벤토리

```text
핫바      9 칸
가방      27 칸
스택      64
```

블록과 아이템을 구분하지 않는다. 모든 것이 블록이거나 재료다.

## 13.2 마을 저장소 (VillageStorage)

```text
seed    밭에 심을 씨앗
crop    수확한 작물
food    조리된 음식
```

NPC 는 **플레이어 인벤토리를 읽거나 쓰지 않는다.**

플레이어 → 마을 저장소 이동 경로는 하나다.

```text
chest 에 F 로 상호작용하여 seed / crop / food 를 기부한다
```

`chest` 가 없으면 종에 F 로 상호작용해도 같은 UI 가 열린다.

## 13.3 초기값

```text
VillageStorage.seed   3
VillageStorage.crop   0
VillageStorage.food   0
플레이어 인벤토리        비어 있다
```

---

# 14. 채집

```text
블록            drops              respawn
log             log × 1            나무는 재생하지 않는다 (24 그루 고정)
leaves          seed × 1 (25%)     -
stone           stone × 1          채석장 노출면은 게임일마다 8 블록 복구
dirt / grass    dirt × 1           -
sand            sand × 1           -
```

`leaves` 에서 `seed` 가 25% 확률로 나오는 것이 씨앗의 유일한 신규 공급원이다.

나무 24 그루 × 잎 약 20 개 = 약 480 회 파괴 → 기대 seed 약 120 개.
수직 슬라이스 분량에 충분하다.

## 14.1 결정적이지 않은 유일한 값

`leaves` 의 25% 만 난수를 쓴다.

다른 모든 판정은 결정적이다. 테스트 가능성을 위해서다.

---

# 15. 농사

## 15.1 밭

```text
farmland 블록 위에 crop 블록이 있으면 재배 중이다
```

플레이어는 `farmland` 를 깐다. `crop` 은 농부가 심는다.

## 15.2 성장

```text
단계          0 (심은 직후) → 1 → 2 (수확 가능)
단계당 시간    게임 시간 4 시간
```

성장은 농부와 무관하게 진행된다. 게임 시계만 본다.

`farmland` 가 파괴되면 위의 `crop` 도 사라진다.

## 15.3 농부의 반복 행동

```text
VillageStorage.seed >= 1 이고 빈 farmland 가 있다
    ↓  PlantAction
그 farmland 로 이동 → crop 을 심는다 → seed -1
    ↓
성장 단계 2 인 crop 이 있다
    ↓  HarvestAction
그 위치로 이동 → 수확 → crop 블록 제거
    ↓
VillageStorage.crop +1, VillageStorage.seed +1
```

수확에서 `seed` 가 1 개 돌아오므로 씨앗이 고갈되지 않는다.

---

# 16. 요리

```text
장소        Kitchen 의 cooking_stove 인접 셀
입력        VillageStorage.crop 2
출력        VillageStorage.food 3
소요        게임 시간 1 시간
조건        요리사가 배고프지 않고, Kitchen 이 인식되어 있다
```

**작물보다 음식이 많아지는 것** 이 주방을 짓는 이유다. DQB2 와 같은 구조다.

요리가 끝나면 감사 포인트 +3 이 발생한다.

---

# 17. 식사

```text
식사 시각    12:00 ~ 13:00 (점심)
            18:00 ~ 19:00 (저녁)
1 회 소비    VillageStorage.food 1
```

허기 수치를 만들지 않는다. `hasEatenThisMeal` 플래그만 둔다.

```text
DiningRoom 이 있다   chair 로 이동 → 앉는다 → 먹는다 → 감사 포인트 +2
DiningRoom 이 없다   광장으로 이동 → 먹는다 → 감사 포인트 없음
food 가 0 이다       먹지 않고 넘어간다. happinessLevel 이 내려간다
```

식사 시간에 요리사는 식탁 위에 `food` 오브젝트를 시각적으로 올린다.
블록을 설치하지 않는다. 연출 전용 오브젝트다.

---

# 18. 취침

```text
취침 시각    20:00 ~ 05:00
```

## 18.1 침대 배정

```text
1 침대 = 1 주민. 고정 배정이다
새 주민이 오면 비어 있는 침대 중 가장 가까운 것을 배정한다
배정된 침대가 사라지면 배정이 해제되고 재배정을 시도한다
```

## 18.2 침대가 있는 주민

```text
20:00
  ↓  SleepAction
배정된 침대로 이동 → 눕는다 → 감사 포인트 +5 (밤당 1 회)
  ↓
05:00 기상 → 방에서 나온다
```

## 18.3 침대가 없는 주민

```text
20:00
  ↓  RestAction
광장(종 주변)으로 이동 → 앉는다
  ↓
05:00 기상
```

`RestAction` 은 감사 포인트를 주지 않는다. `SleepAction` 과 별개의 Action 이다.

---

# 19. NPC

## 19.1 역할

```text
Farmer      PlantAction / HarvestAction
Cook        CookAction / ServeAction
Carpenter   RepairAction / InspectAction
Villager    (레벨업으로 도착하는 주민) 역할 없음. 생활만 한다
```

## 19.2 공통 제원

```text
높이         1.8
이동 속도     3.2 / 초
도피 속도     5.0 / 초
체력         10
```

NPC 는 죽지 않는다. 체력이 0 이 되면 기절 상태로 30 게임분 동안 행동하지 않는다.

## 19.3 상태는 현재 Action 이다

별도의 `state` 필드를 두지 않는다. ADR 008 을 그대로 유지한다.

```text
IdleAction / MoveAction / PlantAction / HarvestAction / CookAction
ServeAction / EatAction / SleepAction / RestAction / RepairAction
InspectAction / FleeAction / TalkAction
```

표시용 라벨은 Action 이 제공한다.

## 19.4 판단 우선순위

위에서 아래로 한 번만 평가한다.

```text
1  위협      반경 12 안에 몬스터가 있다        → FleeAction
2  대화      플레이어가 대화를 걸었다           → TalkAction
3  생리      식사 시간 / 취침 시간             → EatAction / SleepAction / RestAction
4  역할      역할별 작업 조건을 만족한다         → 역할 Action
5  기본      아무것도 아니면                   → IdleAction
```

## 19.5 생활 시간표

```text
05:00 ~ 07:00   기상. 방에서 나온다
07:00 ~ 12:00   역할 작업
12:00 ~ 13:00   점심
13:00 ~ 18:00   역할 작업
18:00 ~ 19:00   저녁
19:00 ~ 20:00   자유 행동 (광장 / 모닥불 주변)
20:00 ~ 05:00   취침
```

---

# 20. Game Clock

```text
secondsPerGameHour   25 실초
1 게임일              600 실초 = 10 분
시작 시각             07:00, Day 1
```

90~120 분 플레이 = 약 9 ~ 12 게임일.

## 20.1 DayPhase

```text
05:00 ~ 07:00   dawn
07:00 ~ 12:00   morning
12:00 ~ 13:00   noon
13:00 ~ 18:00   afternoon
18:00 ~ 20:00   evening
20:00 ~ 05:00   night
```

## 20.2 시간 배속

디버그 모드에서만 1× / 4× / 16× 를 지원한다.

---

# 21. World State

ADR 004 를 유지한다. **아무것도 저장하지 않는 순수 계산기다.**

## 21.1 계산식

```text
population     = registry.npcs.size

foodLevel      = clamp(round(100 * storage.food
                             / (population * mealsPerDay * targetDays)), 0, 100)
                 mealsPerDay = 2, targetDays = 2
                 population == 0 이면 100

housingLevel   = clamp(round(100 * 접근 가능한 침대 수 / population), 0, 100)
                 population == 0 이면 100

safetyLevel    = 습격이 한 번도 없었으면 100
                 아니면 round(100 * (직전 습격에서 마을 중심에 도달하지 못한 몬스터 수)
                                  / (직전 습격의 총 몬스터 수))

happinessLevel = round(foodLevel * 0.4 + housingLevel * 0.3 + safetyLevel * 0.3)
```

## 21.2 반올림 규칙

모든 지표는 `Math.round` 를 마지막에 한 번만 적용한다.
중간 계산에서 반올림하지 않는다.

## 21.3 변경 API 를 제공하지 않는다

```text
increaseFood()    없다
setPopulation()   없다
```

지표를 바꾸려면 원인이 되는 실제 상태를 바꾼다.

## 21.4 safetyLevel 이 Version 0.2 와 다른 이유

Version 0.2 는 `막힌 입구 타일 수 / 5` 였다.

자유 건축에는 정해진 입구가 없다. 벽을 사전에 채점하면
플레이어가 미학이 아니라 점수를 위해 벽을 쌓는다.

**결과로만 판정한다.** 근거는 ADR 015 다.

## 21.5 계산 시점

`GameWorld.update` 의 마지막에 1 회 계산하고 프레임 내내 그 값을 공유한다.
저장하지 않는다.

---

# 22. 감사 포인트

## 22.1 획득

```text
주민이 침대에서 잠들었다          +5   밤당 주민 1 명 1 회
주민이 조리를 완료했다             +3   조리 1 회당
주민이 식당에서 식사했다           +2   식사 1 회당
새 방 타입이 처음 인식되었다        +20  타입당 최초 1 회
진행 이벤트를 완료했다             +15  이벤트당 1 회
```

**건설하는 순간에는 주지 않는다.** 주민이 쓰는 순간에만 준다.
`EmptyRoom` 은 최초 인식 보너스를 주지 않는다.

## 22.2 표시

포인트가 발생하면 해당 주민(또는 방) 위에 `+N` 이 떠올라 사라진다.

**이 연출은 필수다.** 포인트가 어디서 나왔는지 모르면 인과가 끊어진다.

## 22.3 회수하지 않는다

방이 해제되어도, 몬스터가 벽을 부숴도 이미 얻은 포인트는 줄지 않는다.

---

# 23. 마을 레벨과 종

## 23.1 레벨표

```text
레벨  누적 비용   게이트 조건                                     주민 정원
 1     -         시작 상태                                        3
 2     80        인식된 방 >= 2
                 housingLevel >= 50                               4
 3     200       인식된 방 >= 4
                 foodLevel >= 50
                 housingLevel >= 100                              5
```

레벨 4 이상은 수직 슬라이스 범위 밖이다.

## 23.2 해금표

```text
레벨 1   plank / door / torch / farmland / bed / table / chair
레벨 2   window / chest / cooking_stove / water_pot
레벨 3   stone_brick
```

해금되지 않은 블록은 제작 UI 에 회색으로 보이고, 필요 레벨이 표시된다.

**보이지 않게 숨기지 않는다.** 다음에 무엇이 오는지 알아야 계속할 이유가 생긴다.

## 23.3 종을 치는 절차

```text
종에 F 로 상호작용
    ↓
종 UI 가 열린다. 감사 포인트와 게이트 조건이 전부 표시된다
    ↓
모든 조건을 만족하면 [종을 친다] 버튼이 활성화된다
    ↓
gratitude -= cost
villageLevel += 1
해금 적용
주민 정원이 늘면 다음 아침에 새 주민이 도착한다
```

## 23.4 미충족 조건을 반드시 표시한다

```text
감사 포인트    120 / 80     OK
인식된 방       1 / 2        부족
housingLevel  33 / 50      부족
```

"칠 수 없음" 만 표시하면 안 된다.

## 23.5 레벨은 내려가지 않는다

게이트 조건이 다시 거짓이 되어도 이미 올린 레벨과 해금은 유지된다.

근거는 ADR 013 이다.

---

# 24. 몬스터

## 24.1 습격

```text
1 차 습격    villageLevel >= 2 를 달성한 뒤 첫 21:00     몬스터 3
2 차 습격    villageLevel >= 3 을 달성한 뒤 첫 21:00     몬스터 5
```

그 외의 밤에는 몬스터가 나오지 않는다.

**상시 스폰을 하지 않는다.** 습격은 사건이어야 하며, 배경 소음이 되면 안 된다.

## 24.2 제원

```text
체력          3
이동 속도      2.6 / 초
공격력         2 (NPC / 플레이어에게)
공격 간격      1.5 초
파괴 속도      blockDefinition.breakSeconds × 2.0
강제 소멸      05:00
```

## 24.3 AI

```text
목표 = 마을의 종 위치

1  종까지의 경로를 찾는다
2  경로가 있으면 이동한다
3  경로가 없으면
     목표 방향으로 가장 가까운 "파괴 가능한 블록"(terrain = false)을 고른다
     그 앞 통행 가능 셀로 이동한다
     파괴 행동을 시작한다
     블록이 사라지면 통행 그래프가 갱신되고 1 로 돌아간다
4  파괴 가능한 블록도 없으면 (완전히 지형에 막힘)
     가장 가까운 NPC 또는 플레이어를 향한다
     그것도 불가능하면 제자리에서 배회하다 05:00 에 소멸한다
```

## 24.4 마을 중심 도달 판정

```text
몬스터가 종으로부터 반경 6 안에 들어오면 "도달" 로 기록한다
```

이 기록이 `safetyLevel` 계산의 분자를 만든다.

## 24.5 습격 종료

```text
모든 몬스터가 처치되었거나 소멸했다
    ↓
RAID_ENDED 이벤트 발행
safetyLevel 계산에 쓰일 (도달 수 / 총 수) 를 기록한다
```

---

# 25. 파괴와 수리

## 25.1 DamageLog

몬스터가 블록을 파괴하면 기록한다.

```ts
interface DamageEntry {
  pos: BlockPos;
  blockId: number;      // 파괴되기 전의 블록
  gameTime: number;
}
```

## 25.2 목수의 수리

```text
낮 시간(07:00 ~ 18:00)에만 수행한다
하루 최대 repairPerDay = 8 블록
수리 1 블록당 게임 시간 15 분
재료를 소비하지 않는다
```

재료를 소비하지 않는 이유는 창고 관리가 새 밸런스 축이 되기 때문이다.
대신 **하루 8 블록** 이라는 상한이 플레이어의 개입 여지를 남긴다.

## 25.3 플레이어의 수리

플레이어는 그냥 블록을 다시 놓으면 된다. 특별한 규칙이 없다.

## 25.4 아침 피해 보고

```text
07:00 에 지난밤 DamageLog 가 비어 있지 않으면
    피해 요약 패널을 띄운다
    "지난밤 블록 12 개가 파괴되었습니다"
    파괴 좌표를 월드에 반투명 붉은 표시로 나타낸다 (수리될 때까지)
```

---

# 26. 플레이어 전투

```text
공격          좌클릭 (블록이 아닌 몬스터를 조준했을 때)
공격력         1
공격 간격      0.5 초
사거리         2.5
넉백          약하게
```

무기 / 장비 / 스킬을 구현하지 않는다.

플레이어 체력이 0 이 되면 종 옆에서 부활하고, 인벤토리를 잃지 않는다.
게임 오버를 두지 않는다.

---

# 27. 진행 이벤트

## 27.1 목록

```text
id                      조건                                      보상 / 결과
EVENT_ARRIVAL           게임 시작                                  목표: "섬을 둘러보세요"
EVENT_FARM_REQUEST      Farmer 와의 첫 대화를 마쳤다                 목표: 밭을 만든다
EVENT_KITCHEN_REQUEST   VillageStorage.crop >= 3                   목표: 주방을 만든다
EVENT_BEDROOM_REQUEST   VillageStorage.food >= 3                   목표: 침실을 만든다
EVENT_BELL_REQUEST      인식된 방 >= 2                             목표: 종을 친다
EVENT_WALL_REQUEST      1 차 습격이 끝났다                          목표: 마을을 벽으로 막는다
EVENT_NEW_RESIDENT      villageLevel >= 3                          새 주민 도착
EVENT_SLICE_END         2 차 습격이 끝난 뒤 첫 07:00                엔딩 연출
```

8 개다.

## 27.2 모든 조건은 결정적이다

게임 상태만으로 참 / 거짓을 판정할 수 있다.
"첫 번째 밤 또는 두 번째 밤" 같은 모호한 조건을 쓰지 않는다.

## 27.3 완료된 이벤트는 롤백되지 않는다

조건이 다시 거짓이 되어도 완료 상태를 유지한다.

몬스터가 벽을 부술 수 있게 되었으므로(ADR 015) 이 규칙이 필수다.

## 27.4 이벤트와 대사를 분리한다

ADR 010 을 유지한다.

```text
이벤트 발생          →  해금이 적용되고, NPC 머리 위에 대화 표시가 뜬다
플레이어가 대화한다    →  목표 문구가 바뀐다
```

해금을 대사에 걸지 않는다. 플레이어가 대화를 건너뛰어도 진행이 막히지 않는다.

---

# 28. 플레이 시나리오

## Phase 0 — 도착 (0 ~ 10 분)

```text
EVENT_ARRIVAL
목표          "섬을 둘러보세요"
```

플레이어가 폐허 마을에 도착한다. 주민 3 명의 머리 위에 대화 표시가 있다.

대사가 먼저 시작되지 않는다. 플레이어가 다가가는 것이 첫 행동이다.

이 구간에서 플레이어가 배워야 하는 것:

```text
움직인다 / 나무를 벤다 / 흙을 판다 / 블록을 놓는다
```

**방도 주민 행동도 아직 없다. 블록을 만지는 것 자체가 기분 좋아야 한다.**

## Phase 1 — 밭 (10 ~ 25 분)

```text
EVENT_FARM_REQUEST   Farmer 와 첫 대화를 마쳤다
```

농부:

> 밭이 망가져서 먹을 것을 만들 수 없어.

```text
목표          "밭흙을 4 칸 만들어 주세요"
```

플레이어가 `dirt` 를 캐서 `farmland` 로 제작하고 깐다.

농부가 밭으로 걸어가 씨앗을 심는다. 작물이 자란다. 수확한다.

## Phase 2 — 주방 (25 ~ 45 분)

```text
EVENT_KITCHEN_REQUEST   VillageStorage.crop >= 3
```

요리사:

> 작물은 생겼는데, 요리할 곳이 없어.

```text
목표          "주방을 만들어 주세요"
```

**여기가 플레이어가 처음으로 방을 만드는 지점이다.**

대사에서 조건을 명시한다.

> 벽으로 둘러싸고, 문을 하나 달고, 화덕과 물통을 놓아 줘.
> 벽은 두 칸 높이는 되어야 해.

플레이어가 만든다. 십중팔구 처음에는 인식되지 않는다.

`Tab` 으로 진단 모드를 열면 원인이 보인다.

```text
   벽이 뚫려 있습니다  (64, 31, 58)
```

막는다. 방 이름이 뜬다.

```text
   주방
```

감사 포인트 +20.

요리사가 주방으로 걸어간다. 조리한다. 감사 포인트 +3.

## Phase 3 — 침실 (45 ~ 60 분)

```text
EVENT_BEDROOM_REQUEST   VillageStorage.food >= 3
```

목수:

> 밥은 먹었지만, 잘 곳이 없어.

```text
목표          "침실을 만들어 주세요"
```

밤이 온다. 주민이 걸어 들어가 침대에 눕는다.

감사 포인트 +5 × 주민 수.

**이 장면이 이 게임의 핵심 검증 지점이다.**

## Phase 4 — 첫 번째 종 (60 ~ 75 분)

```text
EVENT_BELL_REQUEST   인식된 방 >= 2
```

목수:

> 마을에 종이 있어. 마을이 커졌을 때 치는 거야.

```text
목표          "마을의 종을 쳐 주세요"
```

플레이어가 종을 친다.

```text
마을 레벨 2
해금          window / chest / cooking_stove / water_pot
주민 정원      4
```

다음 아침, 새 주민이 도착한다.

## Phase 5 — 첫 번째 습격 (75 ~ 90 분)

`villageLevel >= 2` 를 달성한 뒤 첫 21:00.

몬스터 3 마리가 나타난다. 마을에 벽이 없으므로 그대로 들어온다.

주민들이 도망친다. 플레이어가 싸운다.

```text
EVENT_WALL_REQUEST   1 차 습격이 끝났다
```

목수:

> 이대로는 안 돼. 마을을 막아야 해.

```text
목표          "마을을 벽으로 둘러싸 주세요"
```

이 목표에는 진행 수치를 붙이지 않는다.
어디를 어떻게 막을지는 플레이어가 정한다.

## Phase 6 — 두 번째 습격과 엔딩 (90 ~ 120 분)

플레이어가 방 4 개를 채우고 종을 다시 친다.

```text
마을 레벨 3
해금          stone_brick
주민 정원      5
EVENT_NEW_RESIDENT
```

그날 밤 21:00, 몬스터 5 마리.

몬스터가 벽 앞에서 멈추고 부수기 시작한다.
플레이어가 막아선다. 판자벽 몇 칸이 부서지지만 마을은 지켜진다.

```text
EVENT_SLICE_END   2 차 습격이 끝난 뒤 첫 07:00
```

아침. 목수가 부서진 곳을 고치기 시작한다.

주민 5 명이 각자의 일로 흩어진다.

```text
   이 마을을 조금 더 키워보고 싶다.
```

---

# 29. UI

```text
핫바             화면 하단. 9 칸. 현재 선택 강조
체력             좌측 하단
감사 포인트        우측 상단. 누적값 + 다음 레벨까지의 게이지
마을 레벨          우측 상단. 감사 포인트 옆
목표 (Objective)  좌측 상단. 한 줄
게임 시간          우측 상단. Day N / HH:MM
상호작용 프롬프트    화면 중앙 하단. "[F] 대화하기"
조준점            화면 중앙. 대상이 있으면 강조
```

모달 UI:

```text
인벤토리 / 제작   E
종 UI            종에 F
저장소 UI         chest 에 F
대사              NPC 에 F
방 진단           Tab (모달이 아니라 오버레이)
피해 보고         아침에 자동. 아무 키로 닫는다
디버그 패널        F3
```

## 29.1 UI 는 게임 상태를 소유하지 않는다

ADR 003 을 유지한다. UI 는 `*_CHANGED` 이벤트를 구독해서 표시만 한다.

DOM 오버레이로 구현한다. three 를 import 하지 않는다.

## 29.2 방 이름 표시

인식된 방의 중심 위에 월드 공간 라벨을 띄운다.

```text
평소            반투명. 거리에 따라 페이드
진단 모드(Tab)   불투명 + 경계선
```

---

# 30. Audio

```text
블록 파괴 / 설치    재질별 4 종
발소리             재질별
방 인식 성공        ★ 전용 효과음. 이 게임에서 가장 중요한 소리
방 인식 해제        경고음
감사 포인트 획득     짧은 벨
종                 긴 종소리 + 리버브
몬스터 등장         밤 습격 시작 스팅어
블록이 부서지는 소리   몬스터가 벽을 칠 때
낮 BGM / 밤 BGM
```

---

# 31. Visual Feedback

```text
블록 파괴 진행      블록 표면에 균열 텍스처 8 단계
블록 파괴 완료      파티클 + 드롭 아이템
방 인식 성공        방 경계가 한 번 빛난다 + 이름이 떠오른다
방 인식 해제        경계가 붉게 깜빡이고 이름이 사라진다
감사 포인트         주민 머리 위에 +N 이 떠올라 사라진다
종                 빛 확산 + 카메라 살짝 뒤로
밤                 하늘색 / 광원 색 보간. torch 주변만 밝다
몬스터 파괴 행동     대상 블록이 흔들리고 균열이 간다
목수 수리          비계 오브젝트 + 망치 파티클
피해 좌표          수리될 때까지 반투명 붉은 큐브
```

---

# 32. 저장

**저장은 이번 범위에서 필수다.** 90~120 분은 한 번에 플레이하기 어렵다.

## 32.1 저장 대상

```text
버전
게임 시간 (day, hour, minute)
월드 블록 데이터    청크별로, 변경된 청크만
플레이어           위치 / 체력 / 인벤토리 / 핫바 선택
VillageStorage    seed / crop / food
NPC 목록          id / role / 위치 / 배정된 침대 / hasEatenThisMeal
gratitude
villageLevel
해금 목록
완료된 이벤트 id 목록
습격 기록          (마지막 습격의 도달 수 / 총 수)
DamageLog
crop 성장 상태     좌표 → 단계 / 심은 시각
```

## 32.2 저장하지 않는 것

```text
WorldState 지표     계산한다 (ADR 004)
방 인식 결과         블록에서 다시 판정한다
NPC 의 현재 Action  IdleAction 으로 시작한다
통행 그래프 캐시
청크 메시
```

## 32.3 로드 후 재구축 순서

```text
1  블록 데이터를 복원한다
2  청크를 전부 메싱 큐에 넣는다
3  통행 그래프 캐시를 비운다
4  월드 전체 방 판정을 1 회 수행한다 (로드 시에만 허용되는 전역 스캔)
5  NPC 를 복원하고 침대를 재배정한다
6  WorldState 를 계산한다
```

4 번이 로딩 시간의 대부분을 차지한다.
`door` 블록의 좌표 목록을 저장해 두어 door 후보 탐색을 건너뛴다.

## 32.4 시간값은 전부 게임 시간 기준이다

실시간 `Date.now()` 를 저장하지 않는다.

## 32.5 Auto Save

```text
매일 07:00 에 자동 저장
종을 친 직후 자동 저장
```

저장소는 `localStorage` 가 아니라 `IndexedDB` 를 쓴다.
블록 데이터가 `localStorage` 의 용량 한도를 넘는다.

---

# 33. 프로젝트 폴더 구조

```text
src/
  main.ts                    부트스트랩. 여기서만 game 과 render 를 함께 안다

  game/                      ★ three 를 import 하지 않는다
    GameWorld.ts             update 순서를 소유한다
    EventBus.ts
    EntityRegistry.ts

    voxel/
      Chunk.ts
      VoxelWorld.ts          getBlock / setBlock / 변경 통지
      raycast.ts             복셀 DDA
      collision.ts           AABB 스윕

    room/
      detectRoom.ts          ★ 순수 함수. 방 판정
      matchRecipe.ts         ★ 순수 함수. 방 타입 결정
      RoomRegistry.ts        인식된 방 목록 + 재판정 큐

    nav/
      NavigationGraph.ts     통행 판정 + 국소 캐시
      pathfind.ts            A*

    entities/
      Player.ts  NPC.ts  Monster.ts  Room.ts

    actions/
      Action.ts  MoveAction.ts  PlantAction.ts  HarvestAction.ts
      CookAction.ts  EatAction.ts  SleepAction.ts  RestAction.ts
      RepairAction.ts  FleeAction.ts  TalkAction.ts  IdleAction.ts

    systems/
      GameClockSystem.ts     InventorySystem.ts    CraftingSystem.ts
      BlockEditSystem.ts     RoomSystem.ts         NPCSystem.ts
      NPCDecisionSystem.ts   FarmSystem.ts         CookingSystem.ts
      MealSystem.ts          SleepSystem.ts        GratitudeSystem.ts
      VillageLevelSystem.ts  RaidSystem.ts         MonsterSystem.ts
      RepairSystem.ts        CombatSystem.ts       GameEventSystem.ts
      DialogueSystem.ts      ObjectiveSystem.ts    WorldStateSystem.ts

    data/                    ★ 모든 밸런스 수치가 여기에만 있다
      balance.ts  blocks.ts  recipes.ts  roomRecipes.ts
      unlocks.ts  dialogues.ts  gameEvents.ts  island.ts

    types/
      index.ts               공통 타입. BlockPos / Vec3 / RoomType ...

  render/                    ★ three 를 import 한다
    Renderer.ts
    ChunkMeshManager.ts      메싱 큐 / GPU 업로드 예산
    materials.ts             ★ 재질 생성은 여기 한 곳에만 (WebGPU 전환 대비)
    EntityView.ts
    RoomLabelView.ts
    DayNightVisual.ts
    CameraController.ts
    Highlight.ts             조준 블록 / 진단 표시

  workers/
    mesher.worker.ts         ★ three 를 import 하지 않는다
    greedyMesh.ts            순수 함수. 테스트 대상

  ui/                        ★ DOM 만. three 를 import 하지 않는다
    Hotbar.ts  InventoryPanel.ts  BellPanel.ts  StoragePanel.ts
    DialogueBox.ts  ObjectivePanel.ts  GratitudeHud.ts
    RoomDiagnosticPanel.ts  DamageReportPanel.ts  DebugPanel.ts

  save/
    SaveSystem.ts  SaveData.ts  migrate.ts

tests/
```

## 33.1 타입은 한 곳에만 둔다

`src/game/types/index.ts` 가 공통 타입의 유일한 위치다.
같은 개념을 두 파일에서 각각 정의하지 않는다.

## 33.2 greedyMesh 가 workers/ 아래에 있는 이유

Worker 에서만 쓰이지만 **순수 함수이며 테스트 대상** 이다.

`mesher.worker.ts` 는 메시지 배선만 하고, 실제 알고리즘은 `greedyMesh.ts` 에 둔다.
테스트는 Worker 없이 `greedyMesh.ts` 를 직접 호출한다.

---

# 34. balance.ts — 전체 초기값

```ts
export const balance = {
  world: {
    sizeX: 128, sizeY: 64, sizeZ: 128,
    chunkSize: 16,
    seaLevel: 24,
    bellPos: { x: 64, y: 0, z: 64 },   // y 는 생성 시 지표면으로 결정
    plazaRadius: 6,
  },

  player: {
    height: 1.8, width: 0.6,
    walkSpeed: 4.5, runSpeed: 7.0,
    jumpHeight: 1.25, gravity: -22, maxFallSpeed: -30,
    maxHealth: 20,
    reachDistance: 5.0,
    attackDamage: 1, attackIntervalSeconds: 0.5, attackRange: 2.5,
    cameraDistance: 5.0,
  },

  inventory: { hotbarSlots: 9, bagSlots: 27, stackSize: 64 },

  room: {
    minFloorArea: 4,
    maxFloorArea: 100,
    minWallHeight: 2,
    detectBudgetMs: 3,
  },

  clock: {
    secondsPerGameHour: 25,
    startDay: 1, startHour: 7,
    lunchStartHour: 12, lunchEndHour: 13,
    dinnerStartHour: 18, dinnerEndHour: 19,
    sleepStartHour: 20, wakeHour: 5,
  },

  farm: {
    growthStages: 3,
    hoursPerStage: 4,
    seedReturnedPerHarvest: 1,
  },

  cooking: {
    cropPerCook: 2,
    foodPerCook: 3,
    cookHours: 1,
  },

  meal: {
    mealsPerDay: 2,
    foodPerMeal: 1,
  },

  worldState: {
    foodTargetDays: 2,
    happinessWeights: { food: 0.4, housing: 0.3, safety: 0.3 },
  },

  gratitude: {
    onSleep: 5,
    onCook: 3,
    onEatInDiningRoom: 2,
    onFirstRoomOfType: 20,
    onGameEvent: 15,
  },

  village: {
    levels: [
      { level: 1, cost: 0,   residentCap: 3, gate: {} },
      { level: 2, cost: 80,  residentCap: 4,
        gate: { minRooms: 2, minHousingLevel: 50 } },
      { level: 3, cost: 200, residentCap: 5,
        gate: { minRooms: 4, minFoodLevel: 50, minHousingLevel: 100 } },
    ],
  },

  npc: {
    height: 1.8,
    moveSpeed: 3.2,
    fleeSpeed: 5.0,
    maxHealth: 10,
    stunMinutes: 30,
    threatRadius: 12,
    repathMinIntervalSeconds: 0.5,
  },

  carpenter: {
    repairPerDay: 8,
    repairMinutesPerBlock: 15,
    repairStartHour: 7, repairEndHour: 18,
  },

  monster: {
    maxHealth: 3,
    moveSpeed: 2.6,
    attackDamage: 2,
    attackIntervalSeconds: 1.5,
    breakSpeedMultiplier: 2.0,
    spawnHour: 21,
    despawnHour: 5,
    reachedRadius: 6,
  },

  raids: [
    { afterVillageLevel: 2, monsterCount: 3 },
    { afterVillageLevel: 3, monsterCount: 5 },
  ],

  resource: {
    seedDropChanceFromLeaves: 0.25,
    stoneRespawnPerDay: 8,
    treeCount: 24,
  },

  storage: { initialSeed: 3, initialCrop: 0, initialFood: 0 },

  performance: {
    chunkUploadsPerFrame: 2,
    pathfindMaxNodes: 4000,
    maxPointLights: 16,
  },
} as const;
```

---

# 35. 검산

## 35.1 식량 수급

```text
주민 3 명   필요 food = 3 × 2 = 6 / 일
주민 5 명   필요 food = 5 × 2 = 10 / 일

요리 1 회    crop 2 → food 3
주민 5 명에 필요한 요리 횟수 = 10 / 3 = 3.33 회 / 일
필요 crop = 3.33 × 2 = 6.67 / 일

작물 성장 = 3 단계 × 4 시간 = 12 게임시간
밭 1 칸당 수확 = 24 / 12 = 2 회 / 일

필요 밭 = 6.67 / 2 = 3.33  →  4 칸
```

**Phase 1 의 목표 "밭흙을 4 칸" 은 주민 5 명까지 감당한다.**

## 35.2 씨앗 수급

```text
심을 때   seed -1
수확할 때 seed +1
```

순환한다. 밭 4 칸이면 초기 `seed 3` 으로 시작해 부족분 1 만 채우면 된다.

`leaves` 에서 25% 로 나오므로 나무 한 그루만 베어도 해결된다.

## 35.3 감사 포인트 수급 — 레벨 2 (누적 80)

```text
EVENT_ARRIVAL / FARM / KITCHEN / BEDROOM   4 × 15 = 60
Kitchen 최초 인식                                  20
Bedroom 최초 인식                                  20
                                            합계   100
```

**진행 이벤트만 따라가도 레벨 2 에 도달한다.** 막히지 않는다.

## 35.4 감사 포인트 수급 — 레벨 3 (누적 200)

레벨 2 직후 잔액 = 100 - 80 = 20. 추가로 180 이 필요하다.

```text
DiningRoom / Storeroom 최초 인식        2 × 20 =  40
EVENT_BELL_REQUEST / WALL_REQUEST       2 × 15 =  30
취침 (주민 4 명 × 5)                     20 / 밤
요리 (하루 3 회 × 3)                      9 / 일
식당 식사 (4 명 × 2 끼 × 2)               16 / 일
                                        일당 약 45
```

```text
40 + 30 + 45 × 3 일 = 205
```

**약 3 게임일(30 분) 이면 레벨 3 에 도달한다.**

Phase 5 ~ 6 의 분량과 일치한다.

## 35.5 초기 자원 채집량

```text
Phase 1 (밭 4 칸)         dirt 4
Phase 2 (주방 5×5)        plank 약 40 → log 10
                         cooking_stove stone 6 / water_pot stone 3
                         door plank 4
Phase 3 (침실 5×5)        plank 약 40 → log 10
                         bed plank 4 + leaves 4
                         door plank 4
```

나무 24 그루로 충분하다.

---

# 36. 성능 목표

```text
프레임            60 FPS 목표 / 30 FPS 최소
드로우콜           600 미만
청크 GPU 업로드    프레임당 2 개 이하
방 재판정          프레임당 3 ms 이하
A* 노드            탐색 1 회당 4000 개 이하
NPC 경로 재계산     NPC 당 0.5 초 이상 간격
동적 광원          16 개 이하
로드 시간          5 초 이하 (전역 방 판정 포함)
```

측정은 `F3` 디버그 패널에 상시 표시한다.

---

# 37. 코드 품질 원칙

```text
한 파일에 너무 많은 책임을 넣지 않는다
any / @ts-ignore / @ts-nocheck 를 쓰지 않는다. 불가피하면 이유를 주석으로 남긴다
모든 함수에 주석을 작성한다
밸런스 수치를 로직에 직접 쓰지 않는다. src/game/data/ 에 둔다
시스템 간 순환 의존성을 만들지 않는다
사용하지 않는 추상화를 미리 만들지 않는다
현재 범위에 필요한 가장 단순한 구현을 선택한다
```

---

# 38. AI 코딩 에이전트 금지 사항

임의로 하지 않는다.

```text
새 블록 / 새 가구 / 새 방 레시피 추가
새 NPC 역할 추가
새 자원 종류 추가
새 게임 메커닉 추가
새 프레임워크 / 라이브러리 추가
물리 엔진 도입
WebGPURenderer 로 전환
React 도입
절차적 지형 생성
방 판정 조건 완화 / 강화
밸런스 수치 변경 (balance.ts 를 고치는 것은 허용. 로직에 상수를 박는 것은 금지)
```

좋아 보이는 아이디어라도 39 장의 Acceptance Test 2 와 6 을 통과하기 전에는
범위를 넓히지 않는다.

---

# 39. 핵심 Acceptance Test

## Test 1 — 블록

```text
1  나무를 좌클릭으로 계속 눌러 파괴한다
2  log 가 인벤토리에 들어간다
3  E 로 제작 UI 를 열고 plank 를 만든다
4  우클릭으로 plank 를 놓는다
5  놓은 블록을 다시 부순다
6  플레이어 위치에는 블록이 놓이지 않는다
```

## Test 2 — 방 인식 ★

```text
1  5 × 5 바닥을 깔고 둘레에 plank 를 2 칸 높이로 쌓는다
2  아직 방이 아니다. 문이 없다
3  Tab 을 누르면 "문이 없습니다" 가 표시된다
4  door 를 하나 놓는다
5  "빈 방" 이 인식된다. 효과음과 라벨이 뜬다
6  bed 를 놓는다
7  "침실" 로 바뀐다. 감사 포인트 +20
8  벽을 한 칸 부순다
9  방 인식이 해제된다. 경고음. 라벨이 사라진다
10 감사 포인트는 20 그대로다
11 부순 곳을 다시 막으면 "침실" 로 복귀한다
12 이때 감사 포인트는 추가되지 않는다 (타입당 최초 1 회)
```

## Test 3 — 진단

```text
1  벽을 한 칸 뚫린 채로 방을 만든다
2  그 공간 안에 서서 Tab 을 누른다
3  "벽이 뚫려 있습니다" 와 함께 정확한 좌표가 붉게 표시된다
4  그 좌표를 막으면 즉시 인식된다
```

```text
5  dirt 로만 둘러싼 공간 안에서 Tab 을 누른다
6  "벽이 뚫려 있습니다" 가 표시된다 (지형 블록은 벽이 아니다)
```

## Test 4 — 농사

```text
1  farmland 를 4 칸 깐다
2  농부가 밭으로 이동한다
3  씨앗을 심는다. VillageStorage.seed 가 1 줄어든다
4  게임 시간 12 시간 뒤 작물이 수확 가능해진다
5  농부가 수확한다. crop +1, seed +1
```

## Test 5 — 요리와 식사

```text
1  Kitchen 이 인식되어 있고 crop >= 2 다
2  요리사가 cooking_stove 앞으로 이동한다
3  게임 시간 1 시간 뒤 crop -2, food +3. 감사 포인트 +3
4  12:00 이 되면 주민들이 DiningRoom 의 chair 로 이동한다
5  각자 food 1 을 소비하고 감사 포인트 +2 를 받는다
6  DiningRoom 이 없으면 광장에서 먹고 포인트는 없다
7  food 가 0 이면 먹지 않고 넘어간다. 게임이 멈추지 않는다
```

## Test 6 — 취침 ★

```text
1  Bedroom 이 인식되어 있고 bed 가 3 개다
2  20:00 이 되면 주민 3 명이 각자의 침대로 걸어간다
3  눕는다. 각각 감사 포인트 +5
4  05:00 에 일어나 방에서 나온다
5  bed 가 2 개뿐이면 남는 1 명은 광장에서 RestAction 을 한다
6  RestAction 은 감사 포인트를 주지 않는다
7  자고 있는 주민의 침대를 부수면 깨어나고 배정이 해제된다
```

## Test 7 — 종

```text
1  감사 포인트 80 미만이면 종 UI 의 버튼이 비활성이다
2  UI 에 부족한 항목이 전부 표시된다
3  조건을 전부 만족하면 버튼이 활성화된다
4  종을 치면 포인트가 80 줄고 레벨이 2 가 된다
5  window / chest / cooking_stove / water_pot 이 제작 UI 에서 활성화된다
6  다음 07:00 에 새 주민이 섬에 도착한다
7  이후 벽을 부숴 방 수가 줄어도 레벨은 2 를 유지한다
```

## Test 8 — 습격 ★

```text
1  villageLevel 2 달성 후 첫 21:00 에 몬스터 3 마리가 스폰된다
2  마을이 열려 있으면 그대로 들어와 종 반경 6 안에 도달한다
3  주민들이 FleeAction 으로 도망친다
4  플레이어가 좌클릭 3 회로 몬스터를 처치한다
5  05:00 에 남은 몬스터가 소멸한다
6  safetyLevel 이 (막은 수 / 총 수) 로 계산된다
```

```text
7  마을을 plank 로 완전히 둘러싼 뒤 2 차 습격을 맞는다
8  몬스터가 벽 앞에서 멈추고 파괴 행동을 시작한다
9  plank 가 breakSeconds 0.8 × 2.0 = 1.6 초 뒤 파괴된다
10 DamageLog 에 좌표가 기록된다
11 통행 그래프가 갱신되어 몬스터가 뚫린 곳으로 들어온다
```

```text
12 마을을 dirt 로만 둘러싼다
13 몬스터가 dirt 를 부수지 않는다. 우회로를 찾는다
14 우회로가 전혀 없으면 배회하다 05:00 에 소멸한다
15 이 경우 safetyLevel 은 100 이 된다
```

13 ~ 15 는 의도된 동작이다. 흙벽은 파괴되지 않지만
플레이어가 흙만으로 마을 전체를 두르는 것은 노동량이 크고,
`plank` / `stone_brick` 이 더 빠르고 아름답다는 것으로 균형을 맞춘다.
이 균형이 무너지면 8.2 를 재검토한다.

## Test 9 — 수리

```text
1  습격 다음 07:00 에 피해 보고 패널이 뜬다
2  파괴 좌표가 붉은 반투명 큐브로 표시된다
3  목수가 파괴 좌표로 이동해 원래 블록을 복구한다
4  하루 8 블록까지만 복구한다
5  9 번째부터는 다음 날로 넘어간다
6  플레이어가 직접 놓아도 붉은 표시가 사라진다
```

## Test 10 — 엔딩

```text
1  villageLevel 3, 주민 5 명 상태다
2  2 차 습격이 끝난다
3  다음 07:00 에 EVENT_SLICE_END 가 발생한다
4  엔딩 연출이 재생된다
5  연출이 끝나도 게임은 계속 플레이 가능하다
```

---

# 40. 실패 판단

다음이면 이 설계가 실패한 것이다.

```text
Test 2 는 통과하는데 방을 만드는 것이 즐겁지 않다
    → 방 조건이 너무 까다롭다. 11.2 를 완화한다

플레이어가 왜 인식되지 않는지 알 수 없다
    → 11.5 진단이 부족하다. 다른 기능보다 먼저 고친다

주민이 방을 쓰는 모습이 지루하다
    → 31 장 연출이 부족하다. 콘텐츠를 늘리지 말고 연출을 고친다

감사 포인트가 어디서 나왔는지 모른다
    → 22.2 표시가 없거나 약하다

종을 치는 것이 그냥 버튼 같다
    → 23 장의 연출과 31 장의 종 연출을 강화한다

몬스터가 귀찮기만 하다
    → 24.1 의 "습격은 사건이다" 가 지켜지지 않았다. 빈도를 줄인다
```

**콘텐츠를 추가해서 해결하려 하지 않는다.**

---

# 41. Definition of Done

## Voxel

```text
128 × 64 × 128 섬이 생성되고 렌더링된다
블록을 부수고 놓을 수 있다
변경이 즉시 메시에 반영된다
60 FPS 를 유지한다
```

## Player

```text
WASD 이동 / 점프 / 한 칸 자동 오르기
3 인칭 카메라. 블록 관통 시 거리 조정
복셀 AABB 충돌. 블록에 끼지 않는다
레이캐스트로 대상 블록이 하이라이트된다
```

## Building

```text
제작 UI 에서 블록을 만들 수 있다
해금되지 않은 블록은 회색으로 보이고 필요 레벨이 표시된다
핫바에서 블록을 선택해 설치한다
```

## Room

```text
빈 방이 인식된다
5 종의 방 레시피가 동작한다
인식 / 해제 시 시각과 청각 피드백이 있다
Tab 진단 모드가 실패 사유와 좌표를 보여준다
방 재판정이 프레임 예산을 넘지 않는다
```

## NPC

```text
3 명이 통행 그래프 위를 걷는다. 벽에 끼지 않는다
시간표에 따라 행동이 바뀐다
농사 / 요리 / 식사 / 취침 / 수리를 수행한다
방이 없을 때의 대체 행동이 전부 동작한다
몬스터가 나타나면 도망친다
```

## Growth

```text
감사 포인트가 주민의 사용에서 발생한다
획득이 시각적으로 표시된다
종 UI 가 미충족 조건을 전부 보여준다
레벨업으로 해금과 새 주민이 발생한다
레벨이 내려가지 않는다
```

## Defense

```text
습격이 2 회 발생한다
몬스터가 종을 향해 이동한다
막히면 플레이어 블록을 부순다
지형 블록은 부수지 않는다
플레이어가 몬스터를 처치할 수 있다
safetyLevel 이 습격 결과로 계산된다
목수가 하루 8 블록까지 수리한다
아침에 피해 보고가 뜬다
```

## Progress

```text
진행 이벤트 8 개가 순서대로 발생한다
조건이 전부 결정적이다
완료된 이벤트가 롤백되지 않는다
대사와 목표가 동작한다
엔딩이 재생된다
```

## Save

```text
IndexedDB 에 저장된다
로드하면 블록 / 방 / 주민 / 진행이 복원된다
로드 시간이 5 초 이하다
```

---

# 42. 이번 범위에서 구현하지 않는 기능

```text
Gamepad / 모바일
여러 챕터 / 여러 섬
보스
장비 / 무기 / 방어구 / 스킬 트리 / 플레이어 레벨
주민 자동 건설 (청사진)
주민 직업 확장 (광부 / 상인 / 가수 / 병사)
탈것 / 비행
절차적 지형 생성
복셀 광원 전파
물 흐름 시뮬레이션
날씨
NPC 사망
주민 관계 / 호감도 / 결혼
동적 대사 생성 / LLM NPC
감사 포인트의 화폐화 (상점)
멀티플레이 / 백엔드 / 클라우드 저장
WebGPU
```

---

# 43. 이후 확장 후보

수직 슬라이스가 성공한 경우에만 검토한다.

```text
1  방 레시피 확장 (여관 / 대장간 / 목욕탕 / 정원 / 작업실)
   가구 확장. 새 방 = 새 주민 행동
2  주민 직업 확장. 주민 10 명 규모
3  주민 자동 건설 (청사진)
4  두 번째 섬 → 챕터 구조 → 영구 거점
5  보스 습격 / 장비
6  주민 Personality / Relationship / Memory
7  복셀 광원 전파 / WebGPU
```

이 목록은 개발 예정 목록이 아니다.

---

# 44. 최종 장면

밤이다.

플레이어가 직접 벤 나무로 만든 판자벽이 마을을 두르고 있다.
군데군데 몬스터가 부순 자국을 목수가 낮에 고쳐 놓았다.

플레이어가 직접 쌓은 방 안에서, 플레이어가 직접 놓은 침대에

주민 다섯 명이 누워 자고 있다.

머리 위로 `+5` 가 다섯 번 떠올랐다 사라진다.

마을의 종이 광장 가운데 서 있다.
