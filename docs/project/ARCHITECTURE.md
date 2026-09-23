# ARCHITECTURE.md

# Small Village Restoration Game — Architecture Guide

Version: 1.3
Status: Reviewed Specification — Implementation Pending
Date: 2026-09-22

---

# 1. 문서 목적

이 문서는 **어떤 구조로 만드는가** 를 정의한다.

**인터페이스와 책임 위치의 정본은 이 문서다.**

수치와 조건식은 `MVP_SPEC.md` 를 따른다.

## 1.1 이 문서는 전면 개정되었다

Version 0.2 는 Phaser 3 / 2D Tilemap / Prefab 건물을 전제로 한 구조였다.

ADR 011 ~ 015 로 전제가 전부 바뀌었다.

살아남은 구조 결정은 다음이다.

```text
ADR 003   React 를 쓰지 않는다. UI 는 상태를 소유하지 않는다
ADR 004   WorldState 는 파생 지표다
ADR 006   Entity 는 순수 데이터. 렌더링은 View 로 분리한다   (Phaser → three 로 보정)
ADR 007   진행 이벤트의 execute 는 커맨드를 반환한다
ADR 008   NPC 의 상태는 현재 Action 이다
ADR 010   대사 종료는 목표 문구만 바꾼다
```

---

# 2. 전체 구조

```text
                      main.ts
                         │
        ┌────────────────┼────────────────┐
        │                │                │
    GameWorld        Renderer            UI
   (순수 TS)         (three)           (DOM)
        │                │                │
        │  읽기 전용 참조   │   이벤트 구독    │
        └───────────────>─┴────────────────┘

    src/game/**  →  three 를 모른다
    src/render/** →  게임 상태를 읽는다. 렌더 전용 dirty 알림만 소비한다
    src/ui/**     →  이벤트를 구독한다. 상태를 소유하지 않는다
    src/workers/**→  three 도 게임 상태도 모른다. 순수 함수만 실행한다
```

## 2.1 의존성 방향

```text
data       ←  types와 같은 data 계층의 읽기 전용 설정만 참조한다
types      ←  아무것도 의존하지 않는다
voxel      ←  types, data
room       ←  types, data, voxel
nav        ←  types, data, voxel
entities   ←  types, data (Action 인터페이스는 types에 둔다)
actions    ←  types, entities, voxel, nav, room
systems    ←  위 전부
GameWorld  ←  systems
render     ←  GameWorld (읽기)
ui         ←  EventBus / 읽기 전용 조회 / 주입된 입력 명령
```

**역방향 의존을 만들지 않는다.**

`voxel` 이 `systems` 를 import 하면 순환이 생긴다.
알림이 필요하면 `EventBus` 로 발행한다.

## 2.2 엔진 격리를 lint 로 강제한다

```js
// eslint.config.js
{
  files: ['src/game/**', 'src/ui/**', 'src/workers/**'],
  rules: {
    'no-restricted-imports': ['error', { patterns: ['three', 'three/*'] }],
  },
}
```

이 규칙은 **선택이 아니다.** ADR 011의 설계상 엔진 변경으로 필요성을 확인했으며 실제 코드 이전은 아직 수행하지 않았다.

---

## 2.3 주민 100명과 대형 월드를 위한 확장 원칙

**MVP는 최대 5명과 128 × 64 × 128 섬을 구현하되, 아키텍처는 주민 100명과 대형
월드로 확장 가능해야 한다.** 이 수치는 콘텐츠 설정이며 구조의 고정 한계가 아니다.
ADR 017과 이를 구체화한 ADR 018을 따른다. 장기 콘텐츠 목표는 약 50~100명이며,
100명은 구조 검증 규모이지 하드코딩할 상한이 아니다. 설계 목표만으로 확장 규모의
성능을 달성했다고 판단하지 않는다.

### MVP부터 지키는 경계

- **주민 수와 식별자**: EntityRegistry·시설 배정·Action·저장은 NPC id 기반 가변
  컬렉션을 사용한다. 주민 5칸 배열이나 인원별 분기를 만들지 않는다. 현재 도착 규칙과
  레벨별 정원은 데이터로 유지하며 기술 검증용 주민 추가가 게임 해금을 우회하지 않는다.
- **월드와 청크**: 크기는 월드 데이터에서 주입하고 VoxelWorld의 범위 검사로 모은다.
  블록 저장·메싱·dirty 추적은 청크 좌표 단위다. 시스템이 월드 전체의 연속 배열이나
  모든 청크의 상시 상주를 직접 전제하지 않도록 VoxelWorld 조회를 경유한다.
  MVP는 고정 섬을 전부 로드해도 된다. 국소 편집마다 전체 월드를 순회하지 않는다.
- **조회와 실행 예산**: 방·시설·통행 후보 조회는 해당 소유 모듈에 모으고, 주민마다
  전체 복셀을 탐색하지 않는다. 기존 공간 인덱스·dirty 큐·A* continuation을 유지한다.
  작업 예산은 주민마다 새로 주지 않고 프레임 전체에 공유하며 대기 작업이 굶지 않도록
  순환 처리한다. NPC 판단 시점의 선택은 NPCDecisionSystem이, Action 실행은 NPCSystem이
  소유해 나중에 판단 빈도를 조절할 수 있게 한다. 4.1의 처리 순서는 유지한다.
- **생활 상태와 렌더**: Entity와 View 수명은 분리한다. 화면 밖 View를 생략하더라도
  주민의 상태·예약·생활을 삭제하지 않는다. 렌더 가시성과 시뮬레이션 활성 여부를
  같은 플래그로 묶지 않는다.
- **저장**: 주민 id와 청크 좌표로 저장하며 렌더 객체나 고정 주민 슬롯에 의존하지 않는다.
  저장 입출력은 SaveSystem에 모은다. 현재 SaveData의 일괄 스냅샷을 유지하되,
  향후 청크별 입출력으로 바뀌어도 NPC·방·진행 시스템을 다시 작성하지 않도록 한다.

### 확장 구현 전에 구체화할 계약

대형 월드의 크기·활성 영역, 청크 로드/언로드, 원거리 주민 갱신 주기, 계층 경로 탐색,
렌더 배치·LOD는 측정 결과에 따라 별도로 결정한다. 아직 사용하지 않는 구현을 미리 만들지 않는다.
현재 getBlock의 “경계 밖은 air”는 미로드 청크의 의미가 아니다. 스트리밍 도입 시
미로드·월드 밖·air를 구분하는 조회 계약과 청크 경계를 넘는 방·경로·예약 처리부터 정의한다.
월드 식별자·크기·청크별 저장 형식이 필요해지면 저장 버전과 마이그레이션 정책을 함께 정한다.

100명 시험은 전체 주민 수, 상세 시뮬레이션 중인 수, 화면에 보이는 수를 구분해 기록한다.
월드 크기와 상주 청크 수, 프레임 시간·메모리·경로 대기 시간·저장/로드 시간을 함께 측정한다.
MVP 성능 통과와 확장 성능 통과는 별개다. 초기 synthetic 시험은 TASK-PERF-001에서
재현 조건을 고정한다. 최종 확장 규모의 합격 예산은 별도 명세로 확정한다.

### 구현 단계의 구분

| 영역 | MVP에서 지킬 경계 | 장기 확장 시 구현·검증 |
| --- | --- | --- |
| 작업 선택 | 역할 시스템이 변경 기반 후보를 관리하고 NPC에 제공 | event-driven Job System / Job Queue / JobIndex |
| 갱신 | 판단·Action 실행·렌더를 분리하고 공유 예산 적용 | multi-rate scheduling과 거리별 Simulation LOD |
| 경로 | 예산형 A*, continuation, 국소 무효화 | Hierarchical Navigation과 경로 Worker |
| 조회 | RoomRegistry의 방·시설 결과와 소유자별 후보 조회 | 지역별 Room / Resource / Facility / Job 인덱스 |
| 월드 | 16³ Chunk, Uint16Array, Worker greedy meshing, dirty만 재메싱 | Chunk Streaming과 활성·상주·가시 영역 분리 |

표의 오른쪽 전체를 MVP에 구현하지 않는다. 아래 장기 계약은 그 기능을 도입할 때
유지해야 할 책임과 정합성 기준이며, 별도 승인된 확장 Task에서 구체 API를 확정한다.

## 2.4 Web-first, not Browser-only

TypeScript / Three.js / WebGL2 / Vite / Web Worker를 유지한다. 지금 Unity나 Godot로
전환하지 않는다. DQB2와 유사한 스타일의 복셀 그래픽·낮밤·조명·주민 50~100명을
웹 기술로 만드는 것을 현실적인 설계 목표로 삼되, 달성 여부는 실제 측정으로 판단한다.
이는 이번 개정에서 새로 검증한 성능 사실이 아니라 프로젝트의 기술 방향이다.

```text
공통 Game Core (순수 TypeScript 게임 규칙)
    → Browser build: 즉시 실행 / 데모 / 초기 플레이 / 필요한 에셋 팩 다운로드
    → Desktop build / Steam build: 설치 / 대형 에셋 / 로컬 파일 접근
```

MVP_SPEC 4장의 대상은 계속 Desktop Web Browser다. Desktop/Steam은 장기 배포 후보이며
wrapper는 지금 확정하지 않는다. Electron 등 특정 제품의 채택도 이 결정에 포함하지 않는다.
플랫폼 API는 부트스트랩에서 어댑터로 주입하고 게임 로직이 다운로드·캐시·filesystem을
직접 다루지 않도록 한다. 기존 SaveSystem 경계는 유지한다. 에셋 경계는 9.5, 결정은 ADR 019다.

### 측정 이후에만 기술을 추가한다

MVP는 WebGL2다. 실제 profiling에서 GPU 병목이 확인되고 현재 렌더의 배치·가시성·광원
예산 조정만으로 해결하기 어려울 때 WebGPU를 검토한다. 월드 크기나 드로우콜 수만으로
전환하지 않는다. WASM·추가 Worker·SharedArrayBuffer도 선행 도입하지 않는다.
이들은 GPU 병목 확인 뒤에도 CPU 계산·전송·동기화 중 어디에 비용이 있는지 구분하여
해당 병목에 유효한 경우에만 별도로 검토한다. GPU 병목이 CPU 기술 도입의 자동 근거는 아니다.
현재 메싱 Worker는 유지한다. 기술 변경 시 측정 근거와 별도 ADR을 남긴다.

---

# 3. 런타임 구성

```ts
// main.ts
const world = new GameWorld(islandData, balance);
const renderer = new Renderer(canvas, world);
const ui = new UiRoot(world.events, world);

let last = performance.now();
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1);   // 스파이크 클램프
  last = now;

  world.update(dt);      // 게임 규칙
  renderer.render(dt);   // 그리기
  requestAnimationFrame(frame);
}
```

`dt` 를 0.1 초로 클램프한다. 탭이 백그라운드에 갔다 오면
한 프레임에 수십 초가 흘러 캐릭터가 벽을 통과한다.

메뉴(일시정지, MVP_SPEC 29.0) 동안 main 은 `world.update` 를 부르지 않고 렌더만 한다.
모달 동안에는 `world.update` 를 계속 부르되 `InputSystem.setGameplayBlocked(true)` 로
플레이어 조작 입력만 비운다. 화면 상태(조작 중 / 모달 / 메뉴)는 UI 의 ModalController 가
소유하며 게임 상태가 아니다. 저장하지 않는다.

## 3.1 MVP는 단일 가변 dt로 시작한다

물리 엔진이 없고 결정적 시뮬레이션이 필요하지 않다.

다만 **충돌은 이동 거리를 나눠서 처리한다.**

```text
한 프레임의 이동 거리가 0.4 를 넘으면 0.4 이하로 분할해서 충돌을 푼다
```

그렇지 않으면 빠르게 낙하할 때 블록을 관통한다.

## 3.2 Multi-rate simulation — 장기 요구사항

`world.update(dt)`는 작업을 배분하는 진입점이다. 호출됐다고 모든 NPC와 시스템을
매번 완전 갱신해야 하는 계약은 아니다. MVP의 단일 주기 구현은 허용한다.

| 처리 | 장기 갱신 주기의 개념 예시 |
| --- | --- |
| Render / animation | 60fps 목표, 시뮬레이션 snapshot 보간 |
| Player movement | 입력·충돌에 필요한 높은 빈도 |
| 근거리 NPC movement | 약 15~30Hz |
| NPC decision | 약 2~5Hz, 긴급 사건은 우선 처리 |
| Needs / 장기 상태 | 약 1Hz 또는 이하 |
| Job assignment | 작업·가용 주민·시설의 변경에 따른 event-driven 처리 |
| 원거리 NPC | 훨씬 낮은 빈도 또는 완료 예정 시각 처리 |

위 값은 MVP 수치나 합격 기준이 아니다. MVP에는 허기 수치를 추가하지 않으며
현재 생리 판단은 식사·취침 구간이다. 주기는 측정 후 데이터로 정의한다.
NPCDecisionSystem은 판단 대상·시점을, NPCSystem은 실행 대상·경과 시간을 관리한다.
누적 시간으로 실행하고 큰 이동은 충돌 substep으로 나눈다. 예약 취소·경로 무효화·
위협 등 즉각 반응이 필요한 사건을 낮은 정기 판단 주기 뒤로 미루지 않는다.
시간표·작업 완료는 경계 시각 통과로 처리해 낮은 주기에서도 누락·중복되지 않게 한다.

## 3.3 Simulation LOD — 장기 요구사항

근거리 주민은 실제 경로·이동·시설 접근·행동과 애니메이션으로 표현한다.
원거리 주민은 낮은 갱신 빈도와 추상 작업 진행, 예정 시각의 결과 반영으로 처리할 수 있다.
`08:00 광산 작업 시작 → 12:00 종료 → 광석 +4`는 원리 설명용 예시다.
광산 작업·광석·해당 생산량은 현재 MVP 콘텐츠가 아니다.

Simulation LOD의 선택은 게임 쪽 스케줄러가 소유하며 렌더의 화면 가림 여부만으로
바꾸지 않는다. 플레이어가 접근하면 같은 npcId와 지속 상태에서 실제 표현으로 복귀한다.
구체 거리와 전환 규칙을 도입할 때 다음을 먼저 정의한다.

- 상세/추상 실행 중 하나만 작업 진행을 소유한다. 전환 중 이중 생산·보상은 금지한다.
- Job claim·시설·재료 예약은 하나의 소유권으로 유지하고 무효화 시 취소·재배정한다.
- 시설 파괴, 경로 단절, 습격 등 추상 진행의 전제가 깨지면 완료를 그대로 확정하지 않는다.
- 접근 시 유효한 위치·접근 셀을 검증하고 화면 안의 순간이동이나 시간 역행을 방지한다.
- 미완료 추상 작업의 지속 사실·예정 시각·완료 키와 로드 복구는 저장 버전으로 정의한다.

현재 MVP는 모든 주민을 상세 처리한다. 23장의 Action 미저장 계약을 그대로 쓰며,
위 저장 확장은 LOD 도입 시 명세화한다. 렌더 LOD와 Simulation LOD는 별개의 기능이다.

---

# 4. GameWorld

`update` 순서를 소유하는 유일한 객체다.

```ts
export class GameWorld {
  readonly events: EventBus;
  readonly registry: EntityRegistry;
  readonly voxels: VoxelWorld;
  readonly rooms: RoomRegistry;
  readonly nav: NavigationGraph;
  readonly storage: VillageStorage;
  readonly clock: GameClockSystem;
  readonly input: InputSystem;
  readonly player: Player | null;   // 초기 데이터에 playerSpawn 이 없으면(관찰용 장면) null

  worldState: WorldStateData;   // 매 프레임 재계산. 저장하지 않는다

  update(dt: number): void;
}
```

## 4.1 update 순서

순서에 이유가 있다. 임의로 바꾸지 않는다.

아래 슬롯은 의존성과 커밋 순서다. 모든 시스템의 동일 갱신 빈도를 요구하지 않는다.
주기를 나눠도 해당 슬롯에서 기한이 된 작업을 처리하고, 즉시 무효화와 프레임 끝 저장
일관성을 유지한다. MVP의 WorldState는 14번에서 매 프레임 계산한다.

```text
 1  clock              시간을 먼저 진행시킨다. 모든 판단의 기준이다
 2  input              플레이어 입력을 읽는다
 3  playerMovement     이동 + 충돌
 4  blockEdit          파괴 / 설치, 이어서 채석장 재생(MVP_SPEC 14.3). 여기서 블록이 바뀐다
 5  room               ★ 블록 변경 이후. 방 재판정 큐를 예산 안에서 처리한다
 6  nav                무효화된 통행 캐시를 정리한다
 7  farm               작물 성장
 8  raid / arrival     습격 스케줄과 ResidentArrivalSystem의 도착 예약 처리
 9  monster            몬스터 AI. 블록 파괴 포함
10  npcDecision        식사 구간·침대 배정을 갱신한 뒤 읽기 전용 판단
11  npc                Action 실행. 조리·식사·취침·수리 서비스 호출
12  combat             공격 판정
13  gratitude          누적 이벤트를 소비해 포인트를 더한다
14  worldState         ★ 파생 지표를 계산한다. NPC 행동 이후여야 한다
15  gameEvent          진행 이벤트 조건을 평가한다
16  objective / save   목표 갱신 후 프레임 끝의 일관된 스냅샷을 저장한다
```

## 4.2 5 번이 4 번 뒤인 이유

방 판정은 블록 상태를 읽는다.

같은 프레임에 블록을 놓고 방이 인식되지 않으면
플레이어는 한 프레임 늦게 피드백을 받는다. 체감상 문제는 없지만,
순서를 뒤집으면 **항상 한 프레임 전의 블록 상태로 판정** 하게 되어
"막았는데 인식이 안 된다 → 다시 보니 됐다" 는 혼란이 생긴다.

## 4.3 14 번이 10 ~ 11 번 뒤인 이유

ADR 004 의 결정을 유지한다.

주민이 밥을 먹으면 `storage.food` 가 줄고 `foodLevel` 이 내려간다.
NPC 행동 전에 계산하면 지표가 항상 한 프레임 과거를 가리킨다.

## 4.4 9 번이 10 번 앞인 이유

몬스터가 블록을 부수면 NPC 의 경로가 무효화된다.
NPC가 먼저 판단하면 이미 사라진 블록 위로 경로를 잡는다.
모든 변경은 Nav 캐시·진행 중 경로·가구 예약을 즉시 무효화한다.
room 처리 이후 바뀐 방은 다음 프레임에 재판정하지만 dirty 시설을 사용하거나 보상하지 않는다.
07:00 도착과 05:00 습격 종료는 경계 시각을 넘었는지 검사하며 등호 비교를 쓰지 않는다.

---

# 5. EventBus

```ts
export type GameEventMap = {
  BLOCK_CHANGED:       { batchId: number; pos: BlockPos; from: number; to: number; by: BlockChangeSource; removedObject?: PlacedObjectSnapshot };
  ROOM_REGISTERED:     { roomId: string; type: RoomType };
  ROOM_FACILITIES_CHANGED: { roomId: string };
  ROOM_TYPE_CHANGED:   { roomId: string; from: RoomType; to: RoomType };
  ROOM_UNREGISTERED:   { roomId: string; reason: RoomFailure | { reason: 'MERGED' } };
  GRATITUDE_GAINED:    { amount: number; source: GratitudeSource; at: Vec3 };
  VILLAGE_LEVEL_UP:    { level: number; unlocked: number[] };
  STORAGE_CHANGED:     { seed: number; crop: number; food: number };
  INVENTORY_CHANGED:   void;
  NPC_ACTION_CHANGED:  { npcId: string; label: string };
  NPC_ARRIVED:         { npcId: string };
  RAID_STARTED:        { raidId: number; count: number };
  RAID_ENDED:          RaidResult;
  BLOCK_DAMAGED:       { pos: BlockPos; progress: number };
  DAMAGE_LOGGED:       DamageEntry;
  BLOCK_REPAIRED:      { pos: BlockPos };
  GAME_EVENT_FIRED:    { id: GameEventId };
  DIALOGUE_STARTED:    { npcId: string; dialogueId: string; lines: string[] };
  DIALOGUE_ENDED:      { npcId: string; dialogueId: string };
  OBJECTIVE_CHANGED:   { text: string; progress?: { current: number; total: number } };
  DAY_PHASE_CHANGED:   { phase: DayPhase };
  WORLD_STATE_CHANGED: WorldStateData;
};

export class EventBus {
  on<K extends keyof GameEventMap>(k: K, fn: (p: GameEventMap[K]) => void): () => void;
  emit<K extends keyof GameEventMap>(k: K, p: GameEventMap[K]): void;
}
```

`transaction(fn)`은 fn 안의 발행을 모아 fn이 끝난 뒤 순서대로 전달한다. 인벤토리와 블록을
함께 바꾸는 편집(6.1, 28.1)은 이 안에서 커밋해 구독자가 한쪽만 바뀐 상태를 읽지 않게 한다.
fn이 예외를 던지면 모은 발행을 버린다. 검증은 커밋 전에 끝낸다.

ROOM_UNREGISTERED의 `MERGED`는 두 방 이상의 내부가 하나로 이어져 이전 방들을 해제한 경우다
(10.4, ADR 023). 판정 실패가 아니므로 경고 연출·경고음을 내지 않는다.

## 5.1 사용 원칙

```text
쓴다      시스템 → UI / 렌더
쓴다      시스템 → 다른 시스템에게 "일어난 일" 을 알린다
안 쓴다    시스템 → 다른 시스템에게 "해라" 를 지시한다
안 쓴다    매 프레임 발행되는 위치 갱신
```

명령은 커맨드로 한다. ADR 007 을 참조한다.

## 5.2 BLOCK_CHANGED 의 by 필드

누가 바꿨는지가 필요하다.

```text
player    파괴 진행 UI 를 닫는다
monster   DamageLog 에 기록한다
npc       농사 또는 목수 수리. 피해 cells가 복구된 경우에만 해결한다
world     채석장 재생(MVP_SPEC 14.3). 드롭·DamageLog·수리 대상이 아니다
```

`world`도 방 재판정·통행 무효화는 다른 주체와 똑같이 거친다. 주체에 따라 방·경로 처리를 건너뛰지 않는다.

---

# 6. VoxelWorld

```ts
export class VoxelWorld {
  readonly sizeX: number; readonly sizeY: number; readonly sizeZ: number;

  getBlock(x: number, y: number, z: number): number;   // 경계 밖은 0 (air)
  setBlock(x: number, y: number, z: number, id: number, by: BlockChangeSource): boolean;

  getChunk(cx: number, cy: number, cz: number): Chunk | undefined;

  /** 이번 프레임에 변경된 청크 좌표. 렌더가 읽고 비운다. */
  takeDirtyChunks(): ChunkCoord[];

  /** 다중 칸 객체의 점유 배열과 메타데이터를 함께 커밋한다. */
  editObject(command: ObjectEditCommand, by: BlockChangeSource): boolean;
  readonly placements: PlacementIndex;   // 공개 타입은 읽기 조회 + allocateId 뿐이다

  /** 렌더 준비. 청크의 18³ padded 전용 복사본 (9.2). */
  copyPadded(coord: ChunkCoord): Uint16Array;
  getRevision(coord: ChunkCoord): number;

  /** 초기 생성·로드 전용. 이벤트·dirty 없이 쓰고, 끝나면 markAllDirty 로 첫 메싱을 요청한다. */
  writeInitial(x: number, y: number, z: number, id: number): void;
  markAllDirty(): void;
}
```

크기는 `{ sizeX, sizeY, sizeZ }`로 주입하며 16의 배수가 아니어도 된다(마지막 청크를 일부만 쓴다).
블록이 한 번도 쓰이지 않은 청크는 배열을 만들지 않는다. 청크 크기 16은 `Chunk.SIZE`가 소유한다.

## 6.1 setBlock 이 하는 일

```text
1  범위 검사. 밖이면 false
2  같은 id 면 false
3  Chunk 의 배열에 쓴다
4  해당 청크의 meshRevision을 증가시키고 dirty 표시
5  padded 18³에 변경점이 포함된 이웃도 dirty (면·모서리·꼭짓점 AO 포함)
6  Nav와 방 후보를 즉시 무효화
7  커밋 완료 뒤 BLOCK_CHANGED 발행
8  true 반환
```

5번을 빠뜨리면 청크 경계에 구멍이나 오래된 AO가 남는다.
setBlock은 단일 칸용이다. 기존 객체에 걸치거나 bed/door를 직접 쓰려 하면 거부하고
editObject를 사용한다. 이 둘은 VoxelWorld의 편집 진입점이며 인벤토리를 소유하지 않는다.
BlockEditSystem은 변경할 칸과 인벤토리 결과를 사전 검증하고, 같은 동기 커밋 구간에서
아이템·블록·메타데이터를 함께 반영한다. 그 구간에는 await나 이벤트 콜백을 실행하지 않는다.
실패 시 전부 원상태이며, 관련 알림은 전체 성공 뒤 발행한다. 기존 즉시 무효화도
NPC의 다음 판단·이동 전에 끝낸다. 구현용 내부 편집 포트가 필요해도 voxel이
InventorySystem을 import하거나 가변 배열을 외부에 공개하지 않는다.
초기 생성·로드도 PlacementIndex와 함께 복원한다.
여러 소비자가 비우는 changedBlocks 큐를 공유하지 않는다.

## 6.2 Chunk

```ts
export class Chunk {
  static readonly SIZE = 16;
  readonly coord: ChunkCoord;
  readonly blocks: Uint16Array;   // 4096

  static index(lx: number, ly: number, lz: number): number {
    return lx + lz * 16 + ly * 256;
  }
}
```

블록마다 JavaScript 객체를 만들지 않는다. 현재 약 100만, 장기에는 수천만 복셀이
될 수 있으므로 TypedArray와 청크 단위 데이터 소유권을 유지한다.

## 6.3 블록 부가 상태

```ts
export interface PlacedObjectSnapshot {
  readonly id: string;
  readonly blockId: number; // bed 또는 door
  readonly anchor: BlockPos;
  readonly facing: 'north' | 'east' | 'south' | 'west';
}
export type ObjectEditCommand =
  | { kind: 'place'; object: PlacedObjectSnapshot }
  | { kind: 'remove'; objectId: string };
```

PlacementIndex는 VoxelWorld 소유이며 id와 점유 좌표에서 대표 객체를 찾는다.
침대는 anchor와 facing의 수평 두 칸, 문은 anchor와 y+1 두 칸이다.
전체 cells를 검증하고 배열·인덱스를 커밋한 뒤 같은 batchId의 알림을 보낸다.
실패하면 아이템·블록·메타데이터 모두 바뀌지 않는다.

FarmSystem은 posKey → plantedAtGameMinutes를, SleepSystem은 bed objectId → npcId를 소유한다.
NPC는 assignedBed를 별도로 소유하지 않는다. Decision의 배정은 읽기 전용 snapshot이다.
단일 칸 가구 id는 posKey, 다중 칸 id는 저장되는 단조 증가 objectIdCounter로 발급한다.
키 함수와 공통 타입은 src/game/types/index.ts에만 정의한다.

---

# 7. 좌표 타입

```ts
export interface BlockPos { x: number; y: number; z: number; }   // 정수
export interface Vec3     { x: number; y: number; z: number; }   // 실수
export interface ChunkCoord { cx: number; cy: number; cz: number; }
```

## 7.1 변환 함수에 기준점을 명시한다

```ts
blockToWorldMin(p: BlockPos): Vec3       // 블록의 최소 모서리
blockToWorldCenter(p: BlockPos): Vec3    // 블록의 중심
standCellToWorldFeet(p: BlockPos): Vec3  // {x+0.5, y, z+0.5}, 발밑 중심
worldToBlock(v: Vec3): BlockPos          // floor
```

`blockToWorld` 라는 이름을 쓰지 않는다.
어느 지점인지 모르면 NPC 가 블록 모서리를 목적지로 삼는 버그가 반복된다.

## 7.2 사용 규칙

```text
게임 규칙 / 방 판정 / 통행 / 저장   →  BlockPos
이동 / 충돌 / 렌더 / 카메라        →  Vec3
NPC 의 이동 목적지                →  standCellToWorldFeet(approachCell)
```

---

# 8. Raycast 와 Collision

## 8.1 raycast.ts

```ts
export interface RaycastHit {
  pos: BlockPos;
  face: BlockPos;        // 단위 법선. -1 / 0 / 1
  distance: number;
}

/** 복셀 DDA. Amanatides & Woo. */
export function raycastVoxels(
  world: VoxelWorld,
  origin: Vec3,
  direction: Vec3,      // 정규화되어 있어야 한다
  maxDistance: number,
  isTarget: (id: number) => boolean,
): RaycastHit | null;
```

`isTarget` 을 주입받는 이유는 용도마다 대상이 다르기 때문이다.

```text
블록 파괴     id !== 0 (가장 앞 블록 선택 후 파괴 가능 여부 검사)
블록 설치     id !== 0                (설치는 hit.pos + hit.face 에 한다)
카메라 충돌   충돌용 고체 판정 (window도 카메라를 막는다)
```

## 8.2 collision.ts

```ts
export interface AabbBody {
  pos: Vec3;        // 발밑 중심
  velocity: Vec3;
  width: number;
  height: number;
  onGround: boolean;
}

/** 축 분리 스윕. world 를 읽기만 한다. */
export function moveWithCollision(
  world: VoxelWorld,
  body: AabbBody,
  dt: number,
  stepUpHeight: number,
): void;
```

순수 함수에 가깝게 유지한다. `body` 를 변형하지만 월드는 읽기만 한다.
테스트에서 가짜 `VoxelWorld` 를 넣어 검증한다.

`world` 인자는 `CollisionWorld = Pick<VoxelWorld, 'getBlock' | 'sizeX' | 'sizeY' | 'sizeZ'>`다.
충돌 고체는 `isSolid(id)`이며, 수평 범위 밖과 y < 0 은 고체, y ≥ sizeY 는 air 다 (MVP_SPEC 9.5).
한 번에 움직이는 거리가 0.4 를 넘으면 0.4 이하로 나눈다(3.1). step-up 은 해당 substep 시작에
onGround 일 때만 한다. `isAabbFree(world, feet, width, height)`로 겹침을 검사한다.

물 복귀·안전 지면·블록에 낀 경우의 해소(MVP_SPEC 9.5)는 collision.ts 가 아니라
PlayerMovementSystem(update 3 번)이 소유한다. 안전 지면 칸은 Player 엔티티의 상태다.

---

# 9. 렌더 — 청크 메싱

## 9.1 ChunkMeshManager

```ts
export class ChunkMeshManager {
  constructor(scene: THREE.Scene, world: VoxelWorld, workerCount: number);

  /** GameWorld.update 이후, render 이전에 호출한다. */
  update(): void;
}
```

대기·진행·업로드 순서의 규칙은 three 없는 `src/render/MeshJobQueue.ts`에 두고 단위 테스트한다.
청크당 진행 중 작업은 하나이며, 진행 중 다시 dirty가 되면 대기열에 남겨 결과 도착 뒤 보낸다.
버린 결과의 청크를 따로 재등록하지 않는다. revision이 오를 때 VoxelWorld가 dirty로 표시하기 때문이다.

```text
update()
  1  world.takeDirtyChunks() 를 받아 큐에 넣는다 (중복 제거)
  2  유휴 Worker 에게 청크를 하나씩 보낸다
  3  완료된 결과를 최대 chunkUploadsPerFrame 개까지 GPU 에 올린다
  4  나머지는 다음 프레임으로 미룬다
```

## 9.2 Worker 프로토콜

```ts
// 메인 → Worker
interface MeshRequest {
  coord: ChunkCoord;
  revision: number;
  /** 경계 1 칸을 포함한 18 × 18 × 18 뷰. 5832 개. */
  padded: Uint16Array;
}

// Worker → 메인
interface MeshResult {
  coord: ChunkCoord;
  revision: number;
  opaque:      { positions: Float32Array; normals: Float32Array; uvs: Float32Array; ao: Float32Array; tiles: Float32Array; indices: Uint32Array };
  transparent: { ... } | null;
  stats:       { visibleFaces: number; quads: number };   // 계측용
}
```

`uvs`는 병합 쿼드의 로컬 반복 좌표(0~w, 0~h)이고 `tiles`는 아틀라스 타일 인덱스
(`blockId * 3 + 면 종류` — 윗면 0 / 아랫면 1 / 옆면 2)다. 셰이더가 타일 안에서 `fract`로 반복한다.
공통 타입(MeshBuffers / MeshData / MeshRequest / MeshResult)은 `src/game/types/index.ts`에 둔다.

**경계 1 칸을 포함한 18³ 뷰를 넘기는 것이 규칙이다.**

Worker 가 인접 청크를 알 수 없으므로, 메인 스레드가 미리 잘라서 넘긴다.
이 규칙을 지키지 않으면 청크 경계의 면 컬링이 틀린다.

padded 전용 배열의 ArrayBuffer를 transferable로 보낸다. 월드 원본 배열은 보내지 않는다.
결과 revision이 현재 meshRevision과 같을 때만 GPU 업로드한다.
처리 중 변경이 오면 최신 revision의 작업 하나를 유지하고 이전 결과는 폐기한다.
이웃의 padded 내용 변경도 revision을 증가시킨다. 오래된 결과가 dirty를 해제하지 않는다.

## 9.3 greedyMesh.ts

```ts
/** 순수 함수. Worker 도 three 도 모른다. 테스트 대상이다. */
export function greedyMesh(
  padded: Uint16Array,       // 18³
  defs: readonly BlockDefinition[],
): MeshData;
```

Worker 파일에는 알고리즘을 두지 않는다. 메시지 배선만 한다.
그래야 Vitest 에서 Worker 없이 테스트할 수 있다.

병합은 같은 블록이면서 네 모서리 AO가 모두 같은 면끼리만 한다. AO가 다른 면을 합치면
보간으로 음영이 번지기 때문이다. 불투명 블록만 컬링·AO를 가리며, 같은 종류의 비불투명
블록끼리(water–water, window–window)는 맞닿은 면을 컬링한다. `BlockDefinition.translucent`
(water / window)는 반투명 메시로 분리한다. 계측용 옵션 `{ ao, greedy }`로 면 컬링·병합·AO의
감소량을 따로 측정한다.

## 9.4 materials.ts

**재질 생성은 이 파일 한 곳에만 있다.**

```ts
export function createOpaqueMaterial(atlas: THREE.Texture): THREE.Material;
export function createTransparentMaterial(atlas: THREE.Texture): THREE.Material;
export function createEntityMaterial(...): THREE.Material;
```

재질 집중은 전환 범위를 줄인다. 향후 Renderer와 GPU 업로드도 별도 검증해야 한다.
`ShaderMaterial` 을 다른 곳에서 만들지 않는다.

## 9.5 AssetManager와 AssetStore — 장기 경계

에셋이 수 GB 이상으로 성장해도 전부 한 번에 다운로드하거나 RAM/GPU에 올리지 않는다.
AssetManager는 필요한 에셋의 요청·수명·해제·메모리 예산을, AssetStore는 바이트의
획득·저장 위치를 담당하는 방향으로 분리한다. 현재는 MVP 아틀라스와 소수 에셋만 로드하며
사용하지 않는 플랫폼 구현체를 미리 만들지 않는다.

```text
Core Assets / Village Assets / Region Packs / Character Assets / Audio
    → AssetManager → AssetStore
                       ├ BrowserAssetStore: 필요 시 다운로드 + 버전별 캐시
                       └ DesktopAssetStore: 설치된 로컬 파일 / 추가 팩
```

Cache는 콘텐츠 팩이 아닌 저장 정책이다. 게임 로직은 에셋 id만 다루고 실제 저장 위치를
모른다. three 객체 생성·해제는 렌더 계층에 남긴다. AssetStore는 SaveSystem의 게임 저장과
별도 책임이다. 팩 manifest·버전·오류/재시도·다운로드 캐시 한도·상주 메모리 한도는
도입 시 정의한다. 텍스처 KTX2/Basis와 모델 glTF/GLB는 장기 배포 포맷 후보이며 지금
필수 도구로 추가하지 않는다. 긴 BGM은 전체 디코딩 버퍼 상주 대신 streaming을 고려한다.

## 9.6 Chunk Streaming — 장기 요구사항

필요한 청크만 활성화하고 플레이어 주변의 필요한 청크만 메싱한다. 먼 청크는 메시를
해제하고 데이터만 유지할 수 있으며, 더 먼 데이터의 상주·퇴거는 별도 예산으로 관리한다.
로드된 청크라도 dirty일 때만 다시 메싱하며 9.2의 revision 검증을 유지한다.
미로드 이웃을 air로 간주해 잘못된 면·경로·방을 확정하지 않는다. 언로드 시 미완료
Worker 결과, 청크 경계를 넘는 방·시설 예약·경로의 처리 계약을 먼저 정한다 (2.3).
MVP의 전체 섬 로드·초기 메싱·23.4의 로드 재구축은 그대로 허용한다.

**스트리밍은 상주 비용을 줄이지 보이는 청크 수를 줄이지 않는다.** 높은 곳에서 마을
전체를 내려다보는 장기 성공 장면에서는 시야 안의 메시 수가 그대로 드로우콜이 된다.
드로우 제출의 CPU 비용이 늘 수 있고 GPU 비용도 장면에 따라 달라지므로 각각 측정한다.
따라서 **원거리 청크 LOD**
(청크 병합 또는 수직 컬럼 단일 메시)를 스트리밍과 별개의 장기 후보로 둔다.
2.4의 순서대로 배치·가시성·광원 예산을 먼저 조정하며, 드로우콜 증가만으로 WebGPU를
검토하지 않는다. 렌더 청크 LOD는 3.3의 Simulation LOD와 다른 기능이다.
필요 여부는 TASK-PERF-001의 근경·원경 측정으로 판단한다.

---

# 10. 방 인식

## 10.1 detectRoom.ts — 순수 함수

공통 타입은 src/game/types/index.ts에 둔다. 아래 선언은 계약을 설명한다.

```ts
export interface RoomBlockReader {
  /** blockId를 읽는다. */
  get(x: number, y: number, z: number): number;
  /** 월드 밖 air와 내부 air를 구별한다. */
  contains(pos: BlockPos): boolean;
  /** 다중 칸 객체를 조회한다. */
  objectAt(pos: BlockPos): PlacedObjectSnapshot | undefined;
}
export type RoomFailure =
  | { reason: 'NOT_ENCLOSED'; at: BlockPos }
  | { reason: 'NO_FLOOR'; at: BlockPos }
  | { reason: 'NO_DOOR' }
  | { reason: 'WALL_TOO_LOW'; at: BlockPos }
  | { reason: 'TOO_LARGE' }
  | { reason: 'TOO_SMALL' };
export interface RoomShape {
  interior: BlockPos[]; // 가구 점유를 포함한 바닥 영역
  boundary: BlockPos[]; // 첫 층 경계. 둘째 층도 검증
  doors: BlockPos[];    // 문 아래 anchor
  floorY: number;
}
export type RoomDetection =
  | { ok: true; shape: RoomShape }
  | { ok: false; failure: RoomFailure };
export interface RoomDiagnostic {
  start: BlockPos;
  detection: RoomDetection;
  explored: BlockPos[];
  escapeTrace: BlockPos[]; // 실제 탐색 경로. 구멍의 정답이라는 뜻이 아니다
  failureDetail: 'outside' | 'notWall' | null; // NOT_ENCLOSED: 월드 밖 도달 / 벽이 아닌 블록
  roomType: RoomType | null;
  facilityIssues: { at: BlockPos; message: string }[];
}
/** MVP_SPEC 11.2~11.3의 형태를 판정한다. */
export function detectRoom(read: RoomBlockReader, start: BlockPos, limits: RoomLimits): RoomDetection;
```

순수 탐색 kernel은 한 셀씩 진행하는 상태를 갖고 detectRoom은 테스트에서 끝까지 실행한다.
런타임은 같은 kernel을 프레임 예산 내에서 이어서 수행한다.
문·벽 검사는 비고체 검사보다 먼저다. 가구는 영역에 포함하지만 보행에서는 막는다.

구현(TASK-018, ADR 023): kernel은 `room/detectRoom.ts`의 `RoomSearch`다. `step(n)`으로 진행하고
`touches(pos)`로 읽은 범위(방문 xz 경계 +1, y는 바닥 y-1 ~ 벽 최소 높이)를 알려 준다.
NO_FLOOR의 `at`은 비어 있는 바닥 칸(y-1)이다. 시작 칸이 벽 블록이면 TOO_SMALL이다.
문은 아래 anchor가 이 평면에 있을 때만 문으로 센다. VoxelWorld 어댑터는 `room/roomReader.ts`다.

## 10.2 matchRecipe.ts — 순수 함수

```ts
export interface Facility {
  readonly objectId: string;
  readonly anchor: BlockPos;
  readonly approachCells: readonly BlockPos[];
  readonly usePosition: Vec3; // 렌더의 사용 자세용. body.pos나 A* 목적지가 아니다
}
export interface RoomFacilities {
  beds: Facility[];
  cookingSpots: Facility[];
  diningSeats: Facility[];
  chests: Facility[];
}
export interface RecipeMatch { type: RoomType; facilities: RoomFacilities; }
/** 가구 배치와 문까지의 국소 접근성을 검사한다. */
export function matchRecipe(read: RoomBlockReader, shape: RoomShape, recipes: readonly RoomRecipe[]): RecipeMatch;
```

room과 nav는 voxel/occupancy.ts의 isStandableCell을 공유한다.
바닥 고체 + 발·머리 비고체를 같은 actor 규칙으로 검사한다.
문 아래 셀과 방 내부에서 연결된 보행 셀에 닿는 가구만 접근 가능하다.
NavigationGraph 구현체를 주입하지 않고 공통 판정을 하위 voxel 계층에 둔다.

최종 타입에 해당하는 facilities만 활성화한다.
같은 Bedroom에서 침대 하나가 없어져도 ROOM_FACILITIES_CHANGED로 배정·예약을 해제한다.
타입 변경도 이전 시설과 차이를 비교한다. 실제 외부 NPC 경로 실패는 다른 접근 셀·시설을
찾은 뒤 없으면 MVP_SPEC 12.5의 대체 행동으로 처리한다.

## 10.3 RoomRegistry

```ts
export class RoomRegistry {
  /** 읽기 snapshot 목록을 반환한다. */
  getAll(): readonly DeepReadonly<Room>[];
  /** id로 조회한다. */
  getById(id: string): DeepReadonly<Room> | undefined;
  /** 타입별 유효한 방을 조회한다. dirty 시설은 제외한다. */
  getByType(type: RoomType): readonly DeepReadonly<Room>[];
  /** 내부 영역을 포함하는 방을 찾는다. */
  findContaining(pos: BlockPos): DeepReadonly<Room> | undefined;
  /** 기존 방과 문 공간 인덱스의 후보를 무효화한다. */
  markDirty(pos: BlockPos): void;
  /** 자동·진단 탐색이 공유하는 예산으로 처리한다. */
  processQueue(budgetMs: number): void;
  /** 자동 큐보다 먼저 진단을 시작한다. */
  beginDiagnosis(start: BlockPos): void;
  /** 진단 결과 또는 계산 중 상태를 조회한다. pending 중에는 이전 결과를 계속 준다. */
  getDiagnosis(): { pending: boolean; result: RoomDiagnostic | null };
  /** 진단을 끝낸다. */
  cancelDiagnosis(): void;
  /** BLOCK_CHANGED 하나를 반영한다: 문 인덱스 갱신 후 markDirty. RoomSystem이 부른다. */
  handleBlockChanged(change: GameEventMap['BLOCK_CHANGED']): void;
  /** F3 계측: 방 수·타입별·큐 길이·마지막 판정 ms·프레임 처리 ms. */
  readonly stats: RoomRegistryStats;
  /** 로드 직후 문 인덱스로 재구축한다. 보상 이벤트는 발행하지 않는다. */
  rebuildAll(): void;
}
```

## 10.4 Room 엔티티

```ts
export interface Room {
  readonly id: string;
  type: RoomType;
  shape: RoomShape;
  facilities: RoomFacilities;
  center: BlockPos;
  dirty: boolean;
}
```

같은 interior의 재판정에서 id를 유지한다. 합병·분할은 이전 방 해제 후 새 등록이다.
최초 타입 보상은 방 id와 무관하다.

구현 규칙(ADR 023): 성공한 interior가 **기존 방 하나와만** 겹치면 그 방의 id를 유지하고 형태·타입·
시설을 갱신한다(기둥·가구·벽 이동). 둘 이상과 겹치면 합병이다: 이전 방들을 `MERGED`로 해제하고
새로 등록한다. 분할은 먼저 확인된 쪽이 id를 잇고 나머지는 새 방이다. 그래서 침대 배정 등은
방 id가 아니라 objectId와 시설 목록으로 재검증한다(10.6).

## 10.5 재판정 큐

MVP_SPEC 11.6의 거리 상한과 y 범위로 문 인덱스를 조회한다.
기존 방의 영향 범위는 바닥·발·머리 셀과 두 층 벽이다.
문 삭제 전에 소속 방을 무효화하고 후보를 (door anchor, 시작 면)으로 중복 제거한다.
성공 결과는 interior 집합으로 합친다. 한 문 양쪽이 다른 방이면 두 결과를 유지한다.
한 면의 실패가 다른 면의 성공 방을 지우지 않는다.

진행 중 작업은 읽은 좌표와 revision을 기록하고 결과 발행 전에 최신인지 검사한다.
오래된 작업은 재시작한다. 진단과 자동 탐색을 합쳐 프레임당 3ms이며 셀 사이에서 양보한다.
큐가 비면 최신 상태와 일치해야 한다. 매 변경마다 월드 전체를 스캔하지 않는다.

구현(TASK-020, ADR 023): 작업은 문 작업 `(anchor, 면)`과 방 확인 작업 `room:(id)` 두 종류다.
영향 칸에 걸린 방은 dirty가 되고 확인 작업이 벽이 아닌 첫 내부 칸에서 다시 판정한다(문이 사라졌거나
문 앞 칸이 막힌 방도 해제되게). 문 작업은 시작 칸이 벽·월드 밖·유효한 방 안이면 건너뛴다.
두 키 모두 대기 중 중복을 넣지 않는다. 문 공간 인덱스는 32 × 32 xz 버킷이다. 예산 확인은
탐색 32 단계마다 한다. 방 이벤트의 표현 구독자(라벨·빛남·효과음)는 이벤트 안에서 기록만 하고
메시·DOM·오디오 작업은 렌더 단계에서 한다. 그렇지 않으면 그 비용이 방 예산 안에 섞인다.
로드·관찰 장면 초기화는 rebuildAll로 조용히 재구축한다.

대규모 마을에서도 `Block Changed → 영향 받은 Room/문 후보 dirty → Room Detection
Queue → frame budget 내 처리`를 유지한다. 방 수가 늘었다는 이유로 전역 flood fill로
바꾸지 않는다. 방 결과의 시설 목록은 주민 AI가 바로 조회하는 인덱스의 원천이다 (14.5).

## 10.6 방·시설 무효화의 연쇄

ROOM_UNREGISTERED / ROOM_TYPE_CHANGED / ROOM_FACILITIES_CHANGED에서
SleepSystem은 사라진 침대 배정을, NPCSystem은 사라진 시설 예약과 Action을 해제한다.
사용 중 침대·접근 셀이 파괴되면 위 이벤트를 기다리지 않고 즉시 깨어난다.
dirty 시설에서는 완료 보상도 확정하지 않는다. 다시 유효해지면 미배정 주민을 배정한다.
GratitudeSystem은 이미 지급한 포인트를 회수하지 않는다.

---

# 11. 통행과 경로

## 11.1 NavigationGraph

```ts
export class NavigationGraph {
  constructor(world: VoxelWorld);

  /** 공통 occupancy의 바닥·발·머리 조건. MVP_SPEC 12.2. */
  isStandable(pos: BlockPos, actor: ActorKind): boolean;

  /** from 에서 한 걸음에 갈 수 있는 이웃. 같은 높이 / +1 / -1. */
  neighbors(pos: BlockPos, actor: ActorKind, out: BlockPos[]): number;

  /** 변경점을 읽은 캐시·경로를 역참조로 무효화한다. */
  invalidate(pos: BlockPos): void;
}

export type ActorKind = 'npc' | 'monster';
```

## 11.2 ActorKind 가 남은 이유

ADR 015 는 통행 레이어 두 개를 없앴다.

그래도 `ActorKind` 는 남는다. **문 때문이다.**

```text
door 블록
  npc      비고체로 취급 → 통과
  monster  고체로 취급   → 통과 불가, 파괴 대상
```

기본값을 두지 않는다. 호출부가 항상 명시해야 한다.
기본값이 있으면 몬스터 경로를 NPC 규칙으로 계산하는 버그가 조용히 생긴다.

## 11.3 pathfind.ts

```ts
export interface PathResult {
  path: BlockPos[] | null;
  partialPath: BlockPos[]; // NODE_LIMIT에서 검증된 구간만
  reachableBoundary: { obstacle: BlockPos; approach: BlockPos; path: BlockPos[] }[];
  nodesExplored: number;
  reason?: 'NO_PATH' | 'NODE_LIMIT';
  continuation: PathSearchState | null; // NODE_LIMIT에서 다음 호출로 넘길 상태
}

export type PathGoal =
  | { kind: 'cell'; pos: BlockPos }
  | { kind: 'radius'; center: Vec3; radius: number };
export interface PathSearchState {
  readonly from: BlockPos;
  readonly goal: PathGoal;
  readonly actor: ActorKind;
  readonly revision: number;
  readonly open: readonly { pos: BlockPos; score: number }[];
  readonly closed: ReadonlySet<string>;
  readonly costs: ReadonlyMap<string, number>;
  readonly parents: ReadonlyMap<string, BlockPos>;
  readonly boundary: PathResult['reachableBoundary'];
}
/** 명시적 탐색 상태를 받아 결과와 다음 상태를 반환한다. 게임 상태는 바꾸지 않는다. */
export function findPath(
  graph: NavigationGraph,
  from: BlockPos,
  goal: PathGoal,
  actor: ActorKind,
  maxNodes: number,
  search?: PathSearchState,
): PathResult;
```

**`reason` 을 반드시 반환한다.**

```text
NO_PATH      경로가 진짜로 없다  →  몬스터는 벽을 부순다
NODE_LIMIT   너무 멀다          →  몬스터는 계속 시도한다. 부수지 않는다
```

둘을 구분하지 않으면 몬스터가 멀리 있다는 이유로 멀쩡한 벽을 부순다.
radius는 standCellToWorldFeet가 반경 안이면 성공한다. 고체 종은 cell 목적지가 아니다.
reachableBoundary에는 실제 접근 경로가 있는 장애물만 기록한다.
NODE_LIMIT의 경계 목록은 파괴 승인에 쓰지 않는다.
maxNodes는 실행 예산이다. 호출자는 결과 continuation을 다음 호출의 search로 넘긴다.
입력 search는 변경하지 않고 다음 상태를 반환한다. 탐색 상태는 저장 파일에 포함하지 않는다.
Nav 스케줄러가 NPC별 continuation을 소유하며 pathfind의 숨은 전역 상태는 없다.
모든 actor의 합계가 프레임당 4000 확장을 넘지 않게 Nav가 분배한다.
따라서 4000개보다 큰 막힌 영역도 여러 프레임 후 NO_PATH를 확정할 수 있다.
출발점·목표·읽은 월드가 바뀌면 세션을 취소한다. 예산 소진을 영구 재시작 루프로 만들지 않는다.
이웃 이동은 출발·도착·step-up 중 머리 여유까지 검사하고 읽은 셀을 캐시 의존에 기록한다.

## 11.4 MovementController

```ts
export class MovementController {
  setPath(path: BlockPos[]): void;
  update(dt: number, body: AabbBody, speed: number): 'moving' | 'arrived' | 'blocked';

  /** 경로 위의 블록이 바뀌었을 때 호출. 다음 update 에서 재계산을 요청한다. */
  invalidate(): void;
}
```

## 11.5 재계산 규칙

```text
언제 재계산하는가
  경로 위의 셀이 통행 불가가 되었다
  목적지가 통행 불가가 되었다
  'blocked' 가 연속 3 회 발생했다

재계산 최소 간격
  NPC 당 0.5 초 (balance.npc.repathMinIntervalSeconds)
```

간격 제한이 없으면 문 앞에 두 NPC 가 겹쳤을 때 매 프레임 A* 가 돌아
프레임이 무너진다.

## 11.6 Hierarchical Navigation과 Worker — 장기 요구사항

큰 월드에서 주민마다 전체 복셀 공간 A*를 반복하지 않는다. 장기 계층은 다음과 같다.

```text
World Region → Village District → Local Nav → Facility Approach Cell
예: 광산 → 도로 → 마을 → 주택가 → 집 → 문 → 침대 접근 셀
```

지역 간 연결을 먼저 선택하고 필요한 국소 경로를 구한다. 시설 접근은 기존
approachCells 계약으로 끝나며 고체 침대 자체를 경로 목표로 삼지 않는다.
상위 연결도 블록 변경·청크 상태에 따라 무효화하고 실제 도달 가능성을 재검증한다.
지역 연결 그래프·캐시·미로드 지역 요청 규칙은 확장 시 정하며 MVP A*를 유지한다.

Pathfinding은 Web Worker로 분리 가능한 순수 계산 경계를 유지한다. Nav 스케줄러가
요청·공유 예산·취소·결과 적용을 소유하고, Action은 즉시 결과가 나온다는 가정 없이
대기할 수 있어야 한다. 향후 Worker에는 실제 NavigationGraph 클래스나 가변 GameWorld를
보내지 않고 필요한 지역의 읽기 snapshot과 requestId/revision을 전달한다.
오래된 응답은 폐기하며 `NO_PATH`와 예산 중단·미로드 대기를 혼동하지 않는다.
현재 PathResult는 유지하고 미로드 상태 표현은 스트리밍 도입 시 확장한다.

---

# 12. Entity 와 View

ADR 006 을 유지한다.

## 12.1 Entity 는 순수 데이터다

```ts
export interface NPC {
  readonly id: string;
  readonly role: NPCRole;
  body: AabbBody;
  health: number;
  action: Action;
  hasEatenThisMeal: boolean;
  stunUntilGameMinutes: number;
}
```

`three` 를 import 하지 않는다. 메서드를 최소화한다.

## 12.2 EntityView 는 렌더 쪽에 있다

```ts
// src/render/EntityView.ts
export class EntityView {
  readonly object3d: THREE.Object3D;
  syncFrom(npc: NPC): void;    // 위치 / 회전 / 애니메이션 상태
}
```

```text
Entity  →  진실의 원천
View    →  Entity 를 읽어서 그린다. Entity 를 고치지 않는다
```

## 12.3 위치 동기화

렌더는 매 프레임 `syncFrom` 을 호출한다.

MVP에서는 `GameWorld.update`와 `render`가 같은 프레임에 돌므로 직접 동기화해도 된다.
3.2의 다중 주기를 도입하면 이전/현재 시뮬레이션 snapshot과 시각으로 렌더 위치를
보간한다. 시각적 보간 결과를 게임 위치·충돌·시설 예약에 역으로 쓰지 않는다.

취침·식사 중에도 body.pos는 통행 가능한 접근 셀의 발밑 중심이다. Action이 제공하는
시설 id·usePosition·사용 자세를 EntityView가 읽어 침대에 눕거나 의자에 앉은 모습을
그린다. 사용 취소 후에는 접근 위치로 돌아오며, 그 위치가 파괴되었다면 충돌·이동
처리가 현재 월드를 다시 검사한다. SaveData에 렌더용 사용 위치를 NPC 위치로 쓰지 않는다.

---

# 13. Action

ADR 008 을 유지한다. **NPC 의 상태는 현재 Action 이다.**

```ts
export interface Action {
  readonly kind: ActionKind;
  readonly label: string;             // UI 표시용
  /** 실제 사용 중인 시설의 렌더 snapshot. 이동·대기 중에는 없다. */
  readonly facilityUse?: DeepReadonly<Pick<Facility, 'objectId' | 'usePosition'>>;

  start(ctx: ActionContext): void;
  update(ctx: ActionContext, dt: number): ActionStatus;
  cancel(ctx: ActionContext): void;   // 방이 사라지는 등 외부 사유
}

export type ActionStatus = 'running' | 'done' | 'failed';
```

## 13.1 별도의 state 필드를 두지 않는다

```text
없다      npc.state = 'sleeping'
있다      npc.action.kind === 'sleep'
```

두 곳에 상태를 두면 반드시 어긋난다.

## 13.2 복합 Action 을 만들지 않는다

```text
없다   FarmAction   (이동 + 심기 + 기다리기 + 수확)
있다   MoveAction → PlantAction
       MoveAction → HarvestAction
```

복합 Action 은 내부에 또 하나의 상태 기계를 만든다.
그 상태 기계는 디버그 패널에 보이지 않는다.

## 13.3 RestAction 과 SleepAction 은 다른 Action 이다

```text
SleepAction   침대가 있다. 감사 포인트 +5
RestAction    침대가 없다. 광장에 앉는다. 포인트 없음
```

하나의 Action 에 플래그로 처리하지 않는다.
플레이어에게는 완전히 다른 장면이고, 그것이 침실을 짓는 동기다.

## 13.4 ActionContext

```ts
export interface ActionContext {
  readonly npc: NPC;
  readonly world: VoxelWorld;
  readonly rooms: RoomRegistry;
  readonly nav: NavigationGraph;
  readonly storage: VillageStorage;
  readonly clock: GameClockReader;
  readonly events: EventBus;
  readonly services: ActionServices; // 아래의 좁은 변경 포트
}
```

ActionServices는 gratitude.gain, cooking.complete, meal.consume, repair.complete,
시설 예약 acquire/release의 계약이다. 전체 시스템 객체를 노출하지 않는다.
SleepAction도 이 포트로 보상을 요청한다. NPCSystem은 start/cancel과 예약 해제를 한 번씩 보장한다.

Action 은 `GameWorld` 전체를 받지 않는다. 필요한 것만 받는다.

---

# 14. NPCDecisionSystem

```ts
export interface NPCContext {
  readonly npc: NPCDecisionView; // id/role/위치/actionKind snapshot. 가변 Action 없음
  readonly assignedBed: DeepReadonly<Facility> | null;
  readonly phase: DayPhase;
  readonly gameMinutes: number;
  readonly threatNearby: DeepReadonly<MonsterDecisionView> | null;
  readonly dialogueRequested: boolean;
  readonly storage: Readonly<VillageStorageData>;
  readonly worldState: Readonly<WorldStateData>;
  /** 소유 시스템이 이 NPC 에게 좁혀서 넘긴 후보. 전체 목록을 넘기지 않는다. */
  readonly candidates: Readonly<NPCCandidates>;
}

/** 각 항목은 "지금 이 NPC 가 쓸 수 있는 하나"다. null 이면 MVP_SPEC 12.5 의 대체 행동. */
export interface NPCCandidates {
  readonly diningSeat: DeepReadonly<Facility> | null;   // RoomRegistry → MealSystem
  readonly farm: DeepReadonly<FarmCandidate> | null;    // FarmSystem
  readonly cooking: DeepReadonly<CookCandidate> | null; // CookingSystem
  readonly repair: DeepReadonly<RepairCandidate> | null;// RepairSystem
}

export interface FarmCandidate {
  readonly kind: 'plant' | 'harvest';
  readonly target: BlockPos;
  readonly approachCells: readonly BlockPos[];
}
export interface CookCandidate {
  readonly facility: Facility;   // Kitchen 의 cookingSpot
  readonly ingredientsReady: boolean;
}
export interface RepairCandidate {
  readonly damageId: string;
  readonly cells: readonly BlockPos[];
  readonly approachCells: readonly BlockPos[];
}

export function decideAction(ctx: NPCContext): Action | null;
```

방 목록 전체나 DamageLog 전체를 NPC 마다 넘기지 않는다. 14.4 / 14.5 의 원칙이며
주민 수가 늘어도 판단 입력의 크기가 주민 수 × 월드 규모로 자라지 않게 한다.
후보 선정의 비용은 소유 시스템이 변경 시점에 한 번 치른다.
`assignedBed` 도 같은 규칙의 예외가 아니라 SleepSystem 이 이미 좁혀 준 결과다.

## 14.1 우선순위는 5 단계. 위에서 아래로 한 번만

```text
1  위협      ctx.threatNearby !== null              → FleeAction
2  대화      ctx.dialogueRequested                  → TalkAction
3  생리      식사 시간 && !hasEatenThisMeal          → EatAction
           취침 시간                               → SleepAction / RestAction
4  역할      역할별 조건                             → 역할 Action
5  기본      아무것도 아니면                          → IdleAction
```

`null` 을 반환하면 현재 Action 을 유지한다.

## 14.2 Context 는 Decision 직전에 조립한다

미리 만들어 두고 재사용하지 않는다.
같은 프레임 안에서도 몬스터가 죽거나 방이 사라질 수 있다.

## 14.3 Context 는 전부 읽기 전용이다

`decideAction` 은 아무것도 바꾸지 않는다.
바꾸는 것은 반환된 Action 의 `start` / `update` 다.

## 14.4 Job System / Job Queue

장기 주민 AI는 **현재 욕구 + 스케줄 + 등록된 작업 + 사용할 수 있는 시설**로 판단한다.
MVP의 욕구는 기존 식사·취침 구간으로 표현한다. 매 NPC가 월드 전체를 검색해 할 일을
발견하는 구조를 금지하고 작업 후보의 발견은 해당 도메인 소유자에게 모은다.

```text
월드 사건 → 담당 시스템이 작업 후보 생성/갱신 → Job Queue → 적합한 NPC가 claim
작물 성숙 → HarvestJob
음식 부족 → CookingJob
건물 파괴 → RepairJob
운반 필요 → HaulJob
```

이는 장기 Job 종류의 예시다. MVP 요리 조건은 계속 MVP_SPEC 16장의 역할 시간·주방·
crop 조건이며 음식 부족 조건을 추가하지 않는다. HaulJob·운반 메커닉도 MVP에 추가하지 않는다.

MVP는 FarmSystem·CookingSystem·RepairSystem이 블록/작물/저장소/시설 변경과 예정 시각에서
갱신하는 후보 목록과 기존 예약으로 시작한다. 그 결과가 14 장 `NPCCandidates` 의 각 항목이다. 후보 발견을 NPC마다 중복 실행하지
않고 NPCDecisionSystem이 읽기 전용 후보를 조립한다. 14장의 Context는 MVP 계약이며
범용 Job 조회 포트로의 구체 확장은 도입 시 명세화한다. 방 전체·피해 전체를 주민마다
복사하지 말고 소유자 조회로 관련 후보를 좁힌다. 첫 취침에는 범용 큐가 필요 없다.

장기 JobSystem은 고유 작업 키, 중복 생성 방지, 역할·지역·우선순위별 조회, 단일 claim,
취소/재배정/완료를 소유한다. NPCSystem은 claim 이후 기존 Action을 실행한다.
시설 배정은 SleepSystem, 임시 시설 예약은 NPCSystem, 자원 소비·결과 확정은 각 도메인
서비스가 계속 소유한다. Job은 같은 상태를 복제해 별도의 NPC state를 만들지 않는다.
대상 파괴·방 dirty·경로 실패·위협 중단 시 claim과 예약을 해제하고, 같은 결과를
두 번 확정하지 않는다. Job 생성·배정도 예산과 기아 방지를 적용해 사건 폭주를 분산한다.

## 14.5 조회 인덱스와 소유권

| 조회 개념 | 원천 및 소유자 | 제공할 후보 |
| --- | --- | --- |
| RoomIndex | RoomRegistry | Bedroom / Kitchen / DiningRoom / Storeroom, 지역·타입별 유효 방 |
| FacilityIndex | RoomRegistry의 matchRecipe 결과 | objectId / approachCells / usePosition, 유효 시설 |
| ResourceIndex | 자원 담당 시스템; MVP 밭·작물은 FarmSystem | 종류·지역·가용 상태별 자원 |
| JobIndex | 장기 JobSystem | 종류·역할·지역·claim 상태별 작업 |
| spatial partition / region index | 각 원천 소유 모듈 | 인근 주민·자원·시설 후보 |

이 이름은 논리적 조회 책임이며 같은 이름의 클래스를 모두 미리 만들라는 요구가 아니다.
ResourceIndex의 장기 wood / stone / food / water 분류는 조회 예시이고 MVP의
VillageStorage(seed/crop/food) 필드나 수자원 시스템을 늘리지 않는다.
인덱스는 원천 상태에서 파생하며 변경·삭제·로드 때 갱신/재구축한다. 예약 가능 여부는
현재 소유자에게 재검증한다. RoomRegistry의 시설 결과를 이용하고 NPC가 가구 블록을
다시 훑지 않는다. 현재 방 인식과 주민 생활의 직접 연결을 대형 월드에서도 유지한다.

---

# 15. 시스템 책임표

```text
InputSystem           키보드 / 마우스 입력 수집. update 2 번 자리. DOM 연결은 ui/domInput.ts
PlayerMovementSystem  플레이어 이동·점프·중력·충돌, 물 복귀·안전 지면(MVP_SPEC 9.5). update 3 번 자리
GameClockSystem       게임 시간 진행. DayPhase 전이 이벤트. update 1 번 자리
QuarryRespawnSystem   채석장 하루 8 칸 재생과 respawnedThroughDay (MVP_SPEC 14.3). update 4 번 자리의 BlockEditSystem 뒤
InventorySystem       플레이어 인벤토리 / 핫바. 핫바 선택은 update 2 번에서 InputSystem 뒤
CraftingSystem        제작 레시피 판정. 해금 확인
BlockEditSystem       레이캐스트 / 파괴 진행도 / 설치 규칙. 조준 광선은 systems/aim.ts 를 카메라와 공유
RoomSystem            RoomRegistry.processQueue 호출. 예산 관리
NPCDecisionSystem     Action 선택 (순수)
NPCSystem             Action 실행. NPC 이동
FarmSystem            crop 성장 단계. farmland 파괴 시 정리
CookingSystem         조리 진행. crop → food
MealSystem            식사 시간 판정. hasEatenThisMeal 리셋
SleepSystem           침대 배정 / 해제
GratitudeSystem       포인트 누적. 최초 인식 보너스 중복 방지
VillageLevelSystem    게이트 평가. 종 상호작용 처리. 해금 적용
ResidentArrivalSystem 레벨별 도착 예약과 실제 스폰의 유일한 소유자
RaidSystem            습격 스케줄. 몬스터 스폰 / 소멸
MonsterSystem         몬스터 AI. 블록 파괴
RepairSystem          DamageLog 관리. 목수 수리 할당
CombatSystem          플레이어 / 몬스터 공격 판정
WorldStateSystem      파생 지표 계산 (순수 함수 호출)
GameEventSystem       진행 이벤트 조건 평가 / 커맨드 실행
DialogueSystem        대사 재생
ObjectiveSystem       목표 문구
DebugSystem           F3 패널의 계측 수집과 디버그 명령 (26 장)
```

## 15.1 다른 소유자의 내부 상태를 직접 쓰지 않는다

GameWorld는 순서를 조정하고 생성자로 필요한 조회·변경 포트를 주입한다.
다른 시스템의 필드·Map을 직접 바꾸거나 GameWorld 전체를 전달하지 않는다.
다음의 명시적인 서비스 API는 허용한다.

- VillageLevelSystem → GratitudeSystem.spend: 비용 검사와 차감을 한 번에 처리.
- ActionServices → GratitudeSystem.gain, 조리·식사·수리 완료 API.
- BlockEditSystem / 역할 Action → VoxelWorld의 원자적 편집 API.
- GameEventSystem → 반환된 GameCommand를 해석해 소유자의 API 호출.

EventBus는 완료 사실을 알린다. data의 진행 정의는 순수 커맨드를 반환한다.
이것이 ADR 007의 적용 범위다.

---

# 16. GratitudeSystem

```ts
export class GratitudeSystem {
  get total(): number;

  /** 다른 시스템이 호출한다. */
  gain(source: GratitudeSource, amount: number, at: Vec3): void;

  /** VillageLevelSystem 만 호출한다. */
  spend(amount: number): boolean;
}

export type GratitudeSource =
  | { kind: 'sleep';  npcId: string }
  | { kind: 'cook';   npcId: string }
  | { kind: 'eat';    npcId: string }
  | { kind: 'firstRoom'; roomType: RoomType }
  | { kind: 'gameEvent';  id: GameEventId };
```

## 16.1 중복 방지

```text
firstRoom     타입별로 1 회. 이미 준 타입 집합을 저장한다
gameEvent     이벤트 id 별로 1 회
sleep         npcId + nightId로 1회 (20시 시작 구간, 자정 뒤에도 같은 키)
cook / eat    완료 트랜잭션당 1회. 식사는 mealId로 중복 소비를 막는다
```

이 집합들은 저장 대상이다. ROOM_REGISTERED / ROOM_TYPE_CHANGED 모두 firstRoom으로 처리한다.

## 16.2 gain 은 반드시 좌표를 받는다

`at` 은 `+N` 연출을 띄울 위치다.

좌표 없이 포인트가 오르면 플레이어는 이유를 모른다.
ADR 013 의 위험 항목이다. 인터페이스로 강제한다.

---

# 17. VillageLevelSystem

```ts
export interface LevelGateStatus {
  requirement: string;      // "인식된 방"
  current: number;
  required: number;
  met: boolean;
}

export class VillageLevelSystem {
  get level(): number;
  get residentCap(): number;

  /** 종 UI 가 매 프레임 호출한다. 전부 표시하기 위한 것이다. */
  evaluate(): { cost: number; gates: LevelGateStatus[]; canRing: boolean };

  /** 플레이어가 종을 쳤을 때만 호출된다. */
  ring(): boolean;

  isUnlocked(blockId: number): boolean;
}
```

## 17.1 evaluate 가 전부 반환하는 이유

MVP_SPEC 23.4 가 미충족 조건을 전부 표시하라고 요구한다.

`canRing: boolean` 만 반환하면 UI 가 다시 조건을 계산해야 한다.
계산이 두 곳에 생기면 반드시 어긋난다.

## 17.2 레벨은 내려가지 않는다

ring만이 level을 바꾼다. 감소 경로가 존재하지 않는다.
evaluate/ring은 같은 순수 게이트 평가를 쓰며 현재 유효한 방·저장소로 재계산한다.
이전 프레임 지표만 믿지 않는다. dirty 방은 게이트에서 제외한다.
비용·레벨·해금·예약 커밋 후 프레임 끝에 저장한다.
ResidentArrivalSystem은 레벨 2/3 고유 키로 예약하고 스폰·완료를 함께 커밋한다.
다음 07:00은 ring 시각보다 엄격히 뒤인 아침이다.
최고 레벨에서 evaluate는 cost=0, gates=[], canRing=false를 반환한다.
패널은 최고 레벨을 표시하며 ring은 비용·레벨·예약을 바꾸지 않고 false를 반환한다.

---

# 18. MonsterSystem

```ts
export type MonsterAction =
  | { kind: 'move';   path: BlockPos[] }
  | { kind: 'break';  target: BlockPos; progress: number }
  | { kind: 'attack'; targetId: string }
  | { kind: 'wander' };
```

## 18.1 판단 순서

1. findPath(goal: radius, 종 중심·반경 6)를 호출한다.
2. path가 있으면 이동한다.
3. NODE_LIMIT이면 정지한 채 continuation을 다음 프레임 탐색에 전달한다.
4. NO_PATH이면 reachableBoundary에서 파괴 가능한 후보를 고른다.
5. 후보·예산이 없으면 경로가 있는 NPC/플레이어를 추적하고 없으면 배회한다.
6. 05:00에는 모두 소멸한다.

## 18.2 파괴 가능 블록 탐색

```ts
/** 도달 가능한 경계에서 파괴 후보와 접근 경로를 고른다. */
export function findBreakableToward(
  read: RoomBlockReader,
  boundary: PathResult['reachableBoundary'],
  goalCenter: Vec3,
  remainingCells: number,
): { target: BlockPos; approachPath: BlockPos[] } | null;
```

조건은 terrain=false, air 아님, breakSeconds!=null이다.
현재 위치와 떨어져 있어도 실제 접근 경로 끝에서 공격 가능하면 후보가 된다.
목표 거리·접근 경로 길이·좌표 순으로 고른다.
다중 칸 전체 점유 수가 남은 예산 이하여야 한다.
RaidSystem이 습격당 maxDestroyedCellsPerRaid=16의 사용량을 소유한다.

## 18.3 블록을 부수면

전체 편집 커밋 후 RepairSystem이 batchId로 원본 배치를 한 번 기록한다.
Nav·시설은 즉시 무효화하고 RoomRegistry는 예산 내 재판정한다.
다음 이동에서 경로를 다시 찾는다. 부분 파괴 진행도는 저장하며,
로드 후 대상이 바뀌었으면 초기화한다.

---

# 19. RepairSystem

```ts
export interface DamageEntry {
  readonly id: string;
  readonly batchId: number;
  readonly blockId: number;
  readonly cells: readonly BlockPos[];
  readonly object: PlacedObjectSnapshot | null;
  readonly gameMinutes: number;
}
export class RepairSystem {
  /** 미수리 피해를 조회한다. */
  get pending(): readonly DamageEntry[];
  /** 커밋된 파괴를 기록한다. */
  log(entry: DamageEntry): void;
  /** 전체 복원이 가능하고 당일 예산 이내인 대상을 찾는다. */
  nextRepairTarget(): DamageEntry | null;
  /** 시간·예산·공간을 재검증하고 원자적으로 복원한다. */
  complete(damageId: string): boolean;
  /** 플레이어가 모든 피해 cells를 채웠으면 해결한다. */
  resolveCoveredCells(): void;
}
```

by=npc는 농사에도 쓰이므로 곧바로 수리 완료로 간주하지 않는다.
당일 day / repairedCells는 저장하며 완료 시에만 점유 복셀 수를 차감한다.
중단·로드 시 수리 시간은 다시 시작하지만 이미 완료한 당일 수리량은 유지한다.
원본 피해 이력과 보고한 아침은 별도 보관하여 수리 후에도 지난밤 피해 수를 알 수 있다.

---

# 20. GameEventSystem

ADR 007 을 유지한다. **execute 는 부작용 대신 커맨드를 반환한다.**

```ts
export interface EventContext {
  readonly clock: GameClockReader;
  readonly storage: Readonly<VillageStorageData>;
  readonly worldState: Readonly<WorldStateData>;
  readonly rooms: readonly DeepReadonly<Room>[];
  readonly gratitude: number;
  readonly bellWorldCenter: Vec3;
  readonly villageLevel: number;
  readonly raidResults: readonly Readonly<RaidResult>[]; // RaidSystem의 완료 이력 snapshot
  readonly completed: ReadonlySet<GameEventId>;
  readonly dialogueCompleted: ReadonlySet<string>;
}

export type GameCommand =
  | { kind: 'setObjective'; objective: ObjectiveDefinition }
  | { kind: 'markDialogueAvailable'; npcId: string; dialogueId: string }
  | { kind: 'gainGratitude'; amount: number; source: GratitudeSource; at: Vec3 }
  | { kind: 'playCutscene'; id: string };

export interface GameEventDefinition {
  id: GameEventId;
  canTrigger(ctx: EventContext): boolean;
  execute(ctx: EventContext): GameCommand[];
}
```

`lastRaid` 하나로는 1차 습격 종료와 2차 습격 종료를 따로 확인할 수 없다.
WALL_REQUEST는 raidId=1의 결과 존재, SLICE_END는 raidId=2의 종료 뒤 첫 07:00에
도달했는지를 완료 이력에서 계산한다. 안전 지표는 계속 가장 최근 결과 한 건을 쓴다.
이력의 소유자는 RaidSystem 하나이며 이벤트용 별도 습격 상태를 만들지 않는다.
각 이벤트 평가 직전에 snapshot을 조립하여 같은 프레임에 앞선 이벤트의 완료를 반영한다.

## 20.1 왜 커맨드인가

```text
execute 안에서 직접 호출하면
  이벤트 정의가 모든 시스템을 알아야 한다
  테스트에 모든 시스템의 가짜 객체가 필요하다

커맨드를 반환하면
  이벤트 정의는 순수 함수다
  테스트가 반환 배열만 비교하면 된다
  GameEventSystem 한 곳에서만 커맨드를 해석한다
```

## 20.2 완료는 비가역이다

```ts
if (!completed.has(def.id) && def.canTrigger(ctx)) {
  completed.add(def.id);                 // 먼저 기록한다
  const commands = def.execute(ctx);
  dispatch(commands);
}
```

`completed` 에서 제거하는 경로를 만들지 않는다. MVP_SPEC 27.3 이다.

## 20.3 이벤트 정의 예

```ts
{
  id: 'EVENT_BELL_REQUEST',
  canTrigger: (ctx) =>
    ctx.completed.has('EVENT_BEDROOM_REQUEST') &&
    ctx.rooms.filter(r => !r.dirty).length >= balance.village.levels[1].gate.minRooms,
  execute: (ctx) => [
    { kind: 'markDialogueAvailable', npcId: 'carpenter', dialogueId: 'bell_intro' },
    { kind: 'gainGratitude', amount: balance.gratitude.onGameEvent,
      source: { kind: 'gameEvent', id: 'EVENT_BELL_REQUEST' }, at: ctx.bellWorldCenter },
  ],
}
```

목표 문구를 여기서 바꾸지 않는다. ADR 010 이다.
DialogueSystem은 완료 dialogueId와 DIALOGUE_ENDED를 발행하고,
ObjectiveSystem이 해당 데이터의 nextObjective를 검증·적용한다 (21장).
GameCommand의 setObjective는 ARRIVAL의 초기 목표처럼 이벤트가 직접 설정하는 경우에 쓴다.

---

# 21. DialogueSystem 과 ObjectiveSystem

## 21.1 대사 데이터가 다음 목표를 들고 있다

```ts
export type ObjectiveProgressKind = 'farmland';
export interface ObjectiveDefinition {
  readonly id: string;
  readonly sourceEventId: GameEventId; // MVP_SPEC 27.1의 진행 순서
  readonly text: string;
  readonly progress: { kind: ObjectiveProgressKind; total: number } | null;
}
export interface DialogueDefinition {
  id: string;
  npcId: string;
  lines: string[];
  nextObjective?: ObjectiveDefinition;
}
```

대사·커맨드·저장은 같은 ObjectiveDefinition을 참조한다. 표시용 current는 저장하거나
대사 데이터에 고정하지 않는다. 밭 목표의 total은 balance.farm.tutorialPlotCount를 쓴다.
ObjectiveSystem은 progress.kind로 원천 집계를 조회하고 OBJECTIVE_CHANGED의 표시용
current/total을 만든다. GameEventSystem의 setObjective도 같은 적용 API를 사용한다.

DialogueSystem은 NPC별 미완료 dialogueId 목록과 완료 id 집합을 소유한다. 표시 등록은
id로 중복 제거하며 새 대사가 이전 미완료 대사를 덮어쓰지 않는다. 대화 종료 때 완료를
기록한 뒤 id를 포함한 DIALOGUE_ENDED를 발행한다. 같은 NPC의 목록은 등록 순서대로 읽는다.
ObjectiveSystem은 sourceEventId의 정본 순서를 비교해 현재보다 이른 목표 적용을 무시한다.
같은 목표의 재적용도 진행 수치를 초기화하지 않는다. 이는 조건·보상 롤백과 별개로
늦은 대화 때문에 표시가 뒤로 돌아가는 문제를 막는다 (ADR 020).
첫 Farmer 대사의 nextObjective는 FARM_REQUEST의 밭 목표를 가리킨다.
FARM_REQUEST 자체는 완료 확인·보상을 담당하고 같은 요청 대사를 재등록하지 않는다.

## 21.2 해금은 대사에 걸지 않는다

ADR 010 을 유지한다.

```text
이벤트 발생   →  일회성 보상 + 대화 표시 (해금은 레벨 전이만)
대사 종료     →  목표 문구만 바뀐다
```

제작 해금은 대사와 무관하다. 첫 Farmer 대화 완료 조건은 MVP_SPEC 27.1의 예외로 유지한다.

## 21.3 진행 수치가 있는 목표

```text
"밭흙을 4 칸 만들어 주세요"      (2 / 4)
```

MVP의 `ObjectiveSystem`은 매 프레임 원천 소유자의 인덱스/집계에서 현재 수치를 조회한다.
목표 표시를 위해 전체 복셀을 다시 스캔하지 않는다. 장기에는 원천 변경에 따라 갱신할 수 있다.

**"마을을 벽으로 둘러싸 주세요" 에는 수치를 붙이지 않는다.**
벽을 채점하지 않는다는 ADR 015 의 결정 때문이다.

---

# 22. WorldStateSystem

ADR 004 를 유지한다.

```ts
export interface WorldStateData {
  readonly foodLevel: number;
  readonly safetyLevel: number;
  readonly housingLevel: number;
  readonly happinessLevel: number;
  readonly population: number;
}

/** 순수 함수. 테스트 대상. */
export function computeWorldState(input: {
  population: number;
  food: number;
  accessibleBeds: number;
  lastRaid: RaidResult | null;
  balance: typeof balance;
}): WorldStateData;
```

## 22.1 저장하지 않는다

`SaveData` 에 포함하지 않는다. 로드 후 계산한다.

## 22.2 변경 API 가 없다

```text
increaseFood()      없다
setPopulation()     없다
```

## 22.3 accessibleBeds 는 RoomRegistry 가 센다

```ts
rooms.getByType('Bedroom')
     .reduce((n, r) => n + r.facilities.beds.length, 0)
```

facilities.beds는 문까지 국소 접근 가능한 Bedroom 침대만 담는다.
외부 NPC 전체의 경로를 보장하는 지표는 아니다. dirty 방과 다른 타입 침대는 제외한다.

---

# 23. SaveSystem

## 23.1 저장 계약

```ts
export interface RaidResult {
  readonly raidId: number;
  readonly total: number;
  readonly reached: number;
  readonly endedAtGameMinutes: number;
}
export interface SaveData {
  version: number;
  gameMinutes: number;
  chunks: { coord: ChunkCoord; blocks: Uint16Array }[]; // 원본 섬과 다른 청크 전체
  placedObjects: PlacedObjectSnapshot[];
  objectIdCounter: number;
  editBatchCounter: number; // 로드 후 DamageLog 중복 키 충돌 방지
  player: { pos: Vec3; health: number; inventory: ItemStack[]; hotbarIndex: number };
  storage: VillageStorageData;
  npcs: {
    id: string; role: NPCRole; pos: Vec3; health: number;
    stunUntilGameMinutes: number; mealId: string | null; hasEatenThisMeal: boolean;
  }[];
  bedAssignments: { objectId: string; npcId: string }[];
  gratitude: number;
  gratitudeOnce: {
    roomTypes: RoomType[]; eventIds: string[];
    sleepKeys: { npcId: string; nightId: number }[];
  };
  villageLevel: number;
  unlocked: number[];
  residentArrivals: { level: number; dueAtGameMinutes: number; npcId: string; arrived: boolean }[];
  completedEvents: GameEventId[];
  completedDialogues: string[];
  availableDialogues: { npcId: string; dialogueId: string }[]; // NPC별 등록 순서를 유지
  objective: ObjectiveDefinition;
  raids: {
    firedIds: number[];
    scheduled: { raidId: number; dueAtGameMinutes: number }[];
    results: RaidResult[];
    active: {
      raidId: number; total: number; despawnAtGameMinutes: number;
      reachedIds: string[]; destroyedCells: number;
      monsters: {
        id: string; pos: Vec3; health: number; attackCooldownSeconds: number;
        breakTarget: BlockPos | null; breakProgress: number;
      }[];
    } | null;
  };
  damage: {
    history: DamageEntry[]; pendingIds: string[];
    reportedThroughGameMinutes: number; repairDay: number; repairedCells: number;
  };
  crops: { pos: BlockPos; plantedAtGameMinutes: number }[];
  quarry: { respawnedThroughDay: number }; // MVP_SPEC 14.3. 없으면 gameMinutes 의 최근 05:00 경계 day
  ending: { pending: boolean; played: boolean };
}
```

저장 대상은 Action 객체가 아니라 지속되어야 하는 게임 사실이다.
시각은 gameMinutes다. 쿨다운은 벽시계 시각이 아닌 남은 시뮬레이션 초다.

## 23.2 저장하지 않는 것

WorldState, 방 결과, Nav 캐시, 메시, NPC Action·임시 시설 예약은 저장하지 않는다.
저장 자체는 실행 중 Action·예약을 변경하지 않는다.
작물 단계·성숙은 심은 시각으로 재계산한다.
조리는 완료 때 재료를 소비하므로 취소해도 손실·중복 생산이 없다.
수리는 시간을 다시 채우되 당일 완료량을 복원한다.
침대 배정은 SleepSystem에서 저장하고 로드 시 유효성만 확인한다.

## 23.3 스냅샷과 저장소

IndexedDB의 슬롯 하나를 트랜잭션으로 교체한다.
07:00 / 종 직후 저장은 요청을 큐에 넣고 프레임 끝 커밋된 상태에서 실행한다.
진행 중 습격의 소멸시각·총수·도달 집합·살아 있는 몬스터를 함께 저장한다.
주민 스폰과 예약 완료, 비용과 레벨 전이를 서로 다른 스냅샷으로 나누지 않는다.
저장용 modifiedChunks는 세션 전체의 변경을 유지하며 렌더의 takeDirtyChunks와 별개다.
메시 업로드가 끝났어도 저장 대상에서 빠지지 않는다.
스냅샷 배열·Map·TypedArray는 살아 있는 게임 데이터와 분리해 비동기 쓰기 중 변하지 않게 한다.
같은 슬롯의 저장은 순서대로 처리하고 오래된 요청이 최신 저장을 덮어쓰지 못하게 한다.
대기 중 요청은 최신의 완전한 스냅샷으로 합칠 수 있다. 저장 실패 시 이전 슬롯을 유지하고
UI에 실패를 알린다. 성공 전에는 저장 완료로 표시하지 않는다.
로드할 때만 기존 Action·예약을 폐기하고, 복원한 지속 사실에서 새로 판단한다.
비동기 저장 대기 중 편집/종 치기와 실패 재시도를 TASK-051에서 검증한다.
원시 복셀은 약 2MiB다. localStorage 초과를 단정하지 않는다.
문자열 인코딩 회피와 원자적 구조화 저장이 IndexedDB 선택 이유다.

## 23.4 로드 순서

1. version 검증·마이그레이션 후 입력과 시간을 멈춘다.
2. 고정 섬 위에 변경 청크와 PlacementIndex를 함께 복원·검증한다.
3. Nav 캐시를 비우고 문 인덱스로 전체 방을 재판정한다. 보상 이벤트는 발행하지 않는다.
4. 주민·자원·침대 배정·감사 키·목표·대화·도착 예약·수리량·습격·엔딩을 복원한다.
5. 사라진 침대 배정만 해제한다. NPC Action은 Idle에서 다시 판단한다.
6. WorldState·UI를 재계산하고 메시를 준비한 뒤 시간을 재개한다.

로드 중 완료 이벤트를 재실행하지 않는다.
dueAt을 지났으나 미완료인 예약은 고유 키로 한 번 처리한다.
NPC 기절은 Action 재판단보다 우선한다.

## 23.5 Save Version

다른 version은 migrate.ts를 거친다. 안전한 변환이 없으면 이유를 알리고 거부한다.
습격 중·자정 전후·당일 여덟 칸 수리 뒤에도 진행과 중복 방지가 유지되는지 검증한다.

---

# 24. Data Layer

```text
src/game/data/
  balance.ts       모든 밸런스 수치. MVP_SPEC 34 장이 정본
  blocks.ts        BlockDefinition[] . MVP_SPEC 8.1 이 정본
  recipes.ts       제작 레시피. MVP_SPEC 8.5 가 정본
  roomRecipes.ts   방 레시피. MVP_SPEC 12.1 이 정본
  unlocks.ts       레벨별 해금. MVP_SPEC 23.2 가 정본
  dialogues.ts     대사
  gameEvents.ts    진행 이벤트 정의 8 개
  island.ts        섬 지형 생성 데이터
```

`BlockDefinition`은 MVP_SPEC 8.1의 열에 다음 두 필드를 더한다. 게임 규칙이 아니라 구조 정보다.

```text
cells        다중 칸 객체의 점유 칸 수. bed / door = 2, 나머지 1. setBlock 거부 판정에 쓴다
translucent  반투명 메시 분리. water / window 만 true
```

`drops`의 항목은 `ItemRef`(블록 또는 재료 seed / crop / food)를 가리킨다. seed는 블록이 아니다.

### island.ts 계약 (TASK-008)

`buildIsland(write: WriteBlock): IslandData`는 고정 섬을 콜백으로 쓰고 좌표 정보를 반환한다.
data 계층이므로 VoxelWorld를 import하지 않는다. 난수·노이즈 없이 손으로 정한 해안 조화 계수·
언덕·나무·폐허 좌표로 계산하며 두 번 호출해도 같다(MVP_SPEC 7.1의 "고정 데이터").

```ts
interface IslandData {
  bellPos: BlockPos;                    // (64, surfaceY + 1, 64)
  playerSpawn: BlockPos;                // MVP_SPEC 7.5, 발이 놓이는 칸
  npcSpawns: { farmer; cook; carpenter };
  monsterSpawns: BlockPos[];            // 어두운 외곽 2 곳
  treeBases: BlockPos[];                // 24 그루
  quarryRespawnCandidates: BlockPos[];  // MVP_SPEC 14.2, y → z → x 고정 순서
}
```

채석장 재생 칸 선택은 순수 함수 `src/game/voxel/quarryRespawn.ts`의
`selectQuarryRespawnCells(candidates, { getBlock, isOccupiedByCharacter }, limit)`다.
호출은 `QuarryRespawnSystem`이 매일 05:00 경계 통과 때 한 번 하고, 고른 칸을
`setBlock(…, stone, 'world')`로 쓴다. 처리 키·저장은 MVP_SPEC 14.3(READY-04)이다.

## 24.1 로직에 상수를 쓰지 않는다

```text
금지   if (npc.pos.distanceTo(monster.pos) < 12)
허용   if (npc.pos.distanceTo(monster.pos) < balance.npc.threatRadius)
```

## 24.2 data는 상위 런타임 모듈을 import하지 않는다

`types`와 같은 data 계층의 읽기 전용 설정 참조는 허용한다.
예를 들어 gameEvents/dialogues가 balance를 읽어 보상·목표 수치를 재사용할 수 있다.
같은 계층에서도 순환 의존은 만들지 않는다.

`data` 가 시스템을 import 하면 순환이 생기고, 테스트에서 데이터만
불러오는 것이 불가능해진다.

---

# 25. 테스트 대상

```text
반드시 테스트한다 (three 없이 실행된다)

  greedyMesh          블록 배열 → 정점 수 / 면 방향
  detectRoom          ★ 가장 많은 케이스. 아래 25.1 참조
  matchRecipe         가구 배치 → RoomType + facilities
  isStandable         3D 통행 조건
  findPath            경로 존재 / NO_PATH / NODE_LIMIT 구분
  moveWithCollision   블록 관통 / step-up
  raycastVoxels       DDA 정확도
  computeWorldState   경계값 (population 0, food 0)
  decideAction        우선순위 5 단계
  GameEventDefinition canTrigger / execute 반환 커맨드
  VillageLevelSystem  게이트 평가 / 레벨 비감소
  GratitudeSystem     중복 방지
  CraftingSystem      해금 확인
  SaveData            직렬화 / 역직렬화 왕복
```

## 25.1 detectRoom 테스트가 가장 중요하다

이 프로젝트에서 가장 많이 작성될 테스트다.

테스트는 3 차원 배열 리터럴로 방을 그린다.

```ts
const room = buildTestWorld(`
  y=0:  # # # # #
        # # # # #
        # # # # #
        # # # # #
        # # # # #
  y=1:  # # # # #        # = plank
        # . . . #        . = air
        # . . . #        D = door
        # . . . #
        # # D # #
  y=2:  # # # # #
        # . . . #
        # . . . #
        # . . . #
        # # D # #
`);

expect(detectRoom(room, { x: 2, y: 1, z: 2 }, limits).ok).toBe(true);
```

`buildTestWorld` 헬퍼를 가장 먼저 만든다.
이 헬퍼가 없으면 방 테스트를 아무도 쓰지 않게 된다.

## 25.2 반드시 테스트해야 하는 실패 케이스

```text
평지에서 벽 한 칸이 빠졌다      → TOO_LARGE/NOT_ENCLOSED + 탐색 영역·경로
문이 없다                     → NO_DOOR
벽이 한 칸 높이뿐이다          → WALL_TOO_LOW + 좌표
바닥에 구멍이 있다             → NO_FLOOR + 좌표
2 × 2 미만 (내부 셀 3 개 이하)  → TOO_SMALL    minFloorArea 4
10 × 10 초과 (내부 셀 101 개)  → TOO_LARGE    maxFloorArea 100
dirt 로만 둘러싸였다          → NOT_ENCLOSED   ★ 지형은 벽이 아니다
침대가 벽에 끼어 있다          → Bedroom 이 아니라 EmptyRoom
의자가 식탁에서 떨어져 있다     → DiningRoom 이 아니다
```

## 25.3 렌더는 테스트하지 않는다

`src/render/` 는 수동 확인한다.
그래서 `greedyMesh` 를 `render` 가 아니라 `workers/` 에 순수 함수로 둔다.

---

# 26. DebugSystem

`F3` 로 여는 패널에 상시 표시한다.

```text
FPS / 프레임 시간 / 드로우콜
청크: 총 / dirty / 메싱 중 / 이번 프레임 업로드
방: 인식 수 / 타입별 / 재판정 큐 길이 / 마지막 판정 소요 ms
NPC: id / 현재 Action label / 목적지 / 경로 길이
몬스터: 수 / 현재 행동 / 파괴 대상 좌표
감사 포인트 / 마을 레벨 / 다음 게이트 상태
WorldState 4 개 지표
게임 시간 / DayPhase
```

디버그 명령:

```text
시간 배속 1× / 4× / 16×
시각 강제 설정
습격 즉시 발생
감사 포인트 부여
블록 무제한 모드
방 경계 상시 표시
통행 가능 셀 표시
```

TASK-016 구현 범위: FPS / 프레임 시간 / 드로우콜 / 청크 상태, 플레이어·안전 지면·조준·파괴 진행,
블록 무제한 모드(설치해도 아이템을 쓰지 않고 빈 칸이면 패널에서 고른 블록을 놓는다. 설치 규칙은 그대로).
나머지 항목과 명령은 해당 시스템의 Task 에서 더한다. 패널은 모달이 아니며 메뉴 위에 떠서
커서가 있을 때 조작할 수 있다. `?debug=1` 로 열린 채 시작하고 `?unlimited=1` 로 무제한 모드를 켠다.

TASK-020 / 022 구현 범위: 방 줄(인식 수 / 타입별 / 재판정 큐 길이 / 마지막 판정 ms / 이번·최대
프레임 처리 ms / 재시작 수 / 진단 중 표시)과 "방 경계 상시 표시" 체크박스(`?bounds=1`로 켠 채 시작).
"통행 가능 셀 표시"는 NavigationGraph(TASK-024)에서 더한다.

**"방 경계 상시 표시" 와 "통행 가능 셀 표시" 는 필수다.**
이 둘 없이 방 인식과 경로 버그를 잡는 것은 불가능하다.

---

# 27. 상태 소유권

같은 값을 두 곳에서 관리하지 않는다.

```text
값                        소유자
블록                      VoxelWorld
방                        RoomRegistry
crop 성장 단계             FarmSystem
채석장 재생 처리 키          QuarryRespawnSystem (respawnedThroughDay)
침대 배정                  SleepSystem (NPC에는 조회 snapshot만)
NPC 위치 / 체력 / Action   NPC 엔티티
플레이어 위치 / 시선 / 안전 지면  Player 엔티티 (GameWorld.player)
population                EntityRegistry.npcs.size    ★ WorldState 가 아니다
감사 포인트                GratitudeSystem
마을 레벨 / 해금            VillageLevelSystem
주민 도착 예약 / 스폰         ResidentArrivalSystem
진행 중 습격 / 파괴 예산       RaidSystem
다중 칸 점유                 VoxelWorld.PlacementIndex
완료된 이벤트               GameEventSystem
DamageLog                 RepairSystem
플레이어 인벤토리            InventorySystem
마을 저장소                VillageStorage
파생 지표                  누구도 소유하지 않는다. 매 프레임 계산한다
```

---

# 28. 핵심 데이터 흐름

## 28.1 블록 설치

```text
우클릭
  → BlockEditSystem.raycast
  → 설치 규칙 검사 (MVP_SPEC 10.4)
  → BlockEditSystem이 아이템 1개와 전체 점유 변경을 사전 검증
  → 동기 커밋: 인벤토리 + VoxelWorld의 단일 칸/객체 편집 (실패하면 전체 미변경)
      ├→ Chunk dirty + 인접 청크 dirty
      └→ 전체 커밋 후 INVENTORY_CHANGED / BLOCK_CHANGED 발행
  → (다음 update 순서에서)
      RoomSystem      : 즉시 markDirty한 후보를 예산 안에서 처리
      NavigationGraph : 변경 알림에서 즉시 invalidate(pos)
      ChunkMeshManager: takeDirtyChunks → Worker
```

## 28.2 방 인식 ★

```text
RoomSystem.update
  → rooms.processQueue(3ms)
      → 큐에서 door 를 꺼낸다
      → detectRoom(read, start, limits)
          ok: false → 기존 Room 이 있으면 ROOM_UNREGISTERED
          ok: true  → matchRecipe(read, shape, roomRecipes)
                      → Room 생성 또는 갱신
                      → ROOM_REGISTERED / ROOM_TYPE_CHANGED
  → GratitudeSystem이 ROOM_REGISTERED / ROOM_TYPE_CHANGED를 구독
      → 그 타입이 처음이면 gain({ kind: 'firstRoom', roomType }, 20, blockToWorldCenter(room.center))
  → UI 가 라벨을 띄우고 효과음을 낸다
```

## 28.3 주민이 잠든다

```text
NPCDecisionSystem
  → 취침 시간이고 SleepSystem의 배정 snapshot이 있다
  → new MoveAction(approachCell) → new SleepAction(facility)

SleepAction.start
  → body.pos는 접근 셀에 유지하고 View가 usePosition에서 취침 자세를 표시한다
  → events.emit('GRATITUDE_GAINED', ...) 이 아니라
    ctx.services.gratitude.gain({ kind: 'sleep', npcId }, 5, bedWorldPos)

GratitudeSystem
  → 같은 nightId에 이미 잤으면 무시한다
  → total += 5
  → GRATITUDE_GAINED 발행

UI
  → 침대 위치에 +5 를 띄운다
```

## 28.4 몬스터가 벽을 부순다

```text
MonsterSystem
  → findPath(monster, { kind: 'radius', center: bellCenter, radius: 6 }, 'monster')
  → reason === 'NO_PATH'
  → findBreakableToward(...)  (도달 가능한 경계 + 실제 파괴 가능 + 남은 예산)
  → MonsterAction 'break'
  → progress += dt / (breakSeconds * 2.0)
  → progress >= 1
      → 단일/다중 칸 편집 API로 원자적 제거
      → BLOCK_CHANGED (by: 'monster')
          ├→ RepairSystem.log(originalSnapshot)
          ├→ NavigationGraph.invalidate(pos)
          └→ RoomRegistry.markDirty(pos)
  → 다음 프레임에 경로 재탐색 → 통과
```

## 28.5 종을 친다

```text
F (종 조준)
  → VillageLevelSystem.evaluate()
  → UI 가 게이트 상태를 전부 표시
  → canRing 이면 [종을 친다] 활성
  → VillageLevelSystem.ring()
      → GratitudeSystem.spend(cost)
      → level += 1
      → unlocked 갱신
      → VILLAGE_LEVEL_UP 발행
  → RaidSystem이 구독 → 레벨·선행 습격 종료 조건이 모두 충족된 뒤 첫 21:00 예약
    (2차는 레벨 3 도달만으로 예약하지 않는다)
  → ResidentArrivalSystem이 레벨별 고유 키로 다음 07:00을 예약
  → 프레임 끝 자동 저장
  → 예약 처리 뒤 GameEventSystem이 레벨 3·주민 5명 도착 사실을 평가
  → EVENT_NEW_RESIDENT는 대화/연출만 반환
```

---

# 29. 이번 범위에서 쓰지 않는 아키텍처

```text
ECS 프레임워크
Service Locator
전역 싱글턴 (balance / blockDefinitions 같은 읽기 전용 데이터는 예외)
DI 컨테이너
상태 관리 라이브러리
물리 엔진
전역 Fixed timestep 시뮬레이션 (MVP; 3.2의 장기 다중 주기 확장을 막지 않는다)
클라이언트-서버 분리
옥트리 / 스파스 복셀
복셀 광원 전파
```

의존성 주입은 생성자 인자로만 한다.

---

# 30. 아키텍처 변경 규칙

## 30.1 문서가 서로 다르면

```text
수치 / 조건식         →  MVP_SPEC.md
인터페이스 / 구조      →  ARCHITECTURE.md (이 문서)
작업 순서 / 완료 조건  →  TASKS.md
의도 / 감정 목표      →  GAME_DESIGN.md
```

## 30.2 문서와 코드가 다르면

**문서를 먼저 고친다.**

코드만 고치고 문서를 남겨두면 다음 작업에서 같은 모순을 다시 만난다.

이 프로젝트는 그 모순을 두 번의 정합성 정리로 걷어냈고,
이번 전면 개정에서 다시 한 번 걷어냈다.

## 30.3 구조를 바꾸려면 ADR 을 쓴다

배경 / 결정 / 검토한 대안 / 예상되는 결과를 포함한다.

기존 결정을 뒤집으면 원본 ADR 의 `Status` 를 `Superseded by ADR NNN` 으로
바꾸고, 왜 뒤집혔는지 상단에 인용문으로 남긴다.

**원본을 삭제하지 않는다.** 그 결정이 왜 옳았고 언제부터 틀렸는지가 기록이다.

---

# 31. ADR 목록

```text
001  Phaser 3 / Vite SPA                    Superseded by 011
002  Prefab 건물 배치                        Superseded by 012
003  React 를 쓰지 않는다                     Accepted
004  WorldState 는 파생 지표다                Accepted
005  방벽은 몬스터만 막고 파괴되지 않는다        Superseded by 015
006  Entity / View 분리                     Accepted (011 로 보정)
007  진행 이벤트는 커맨드를 반환한다             Accepted
008  NPC 의 상태는 현재 Action 이다            Accepted
009  마을 입구에는 방벽만                      Superseded by 015
010  대사 종료는 목표 문구만 바꾼다              Accepted
011  3D 복셀 / Three.js                     Accepted
012  자유 건축 + 방 인식                      Accepted
013  감사 포인트 + 마을 레벨                   Accepted
014  복셀 청크 16³ + 그리디 메싱               Accepted
015  3D 통행 그래프 + 파괴 가능한 벽            Accepted (016으로 보완)
016  설계 검토 반영: 공간·진행·저장 계약          Accepted
017  MVP 5명과 100명·대형 월드 확장 경계          Accepted (018로 구체화)
018  사건 기반 작업·다중 주기·LOD·계층 경로       Accepted (장기 계약)
019  Web-first, not Browser-only / 에셋 경계    Accepted (장기 계약)
020  진행 안내·블록 편집·저장 실행 계약          Accepted
021  Phase A 복셀 렌더·메싱·고정 섬 구현 방식      Accepted
022  Phase B 플레이어 이동·편집 원자성·화면 상태     Accepted
023  Phase C 방 판정 kernel·재판정 큐·방 식별·진단    Accepted
024  채석장 재생 시각·소유자·당일 처리 키 (READY-04)  Accepted
```

---

# 32. 최종 아키텍처 목표

```text
게임 규칙은 렌더 엔진을 모른다
    엔진이 한 번 바뀌었고, 또 바뀔 수 있다

방 인식은 순수 함수다
    이 게임의 심장이며, 가장 많이 테스트된다

상태의 소유자는 언제나 한 곳이다
    파생값은 누구도 소유하지 않는다

이벤트는 알림이고, 커맨드는 명령이다
    둘을 섞지 않는다
```
