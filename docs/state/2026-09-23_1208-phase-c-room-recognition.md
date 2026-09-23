# Phase C 방 인식 구현 — TASK-017~022

Date: 2026-09-23
Status: TASK-017~021 완료. TASK-022 구현 완료·재미 검증 대기(작성 당시). → 2026-09-23 G1 통과, [기록](2026-09-23_1400-task-022-gate-g1-passed.md)
구현 기준 커밋: e67d759 (시작) → 이 기록과 같은 push 의 커밋들
관련 정본: MVP_SPEC 8.4 / 11 / 12 / 29 / 29.2 / 30 / 31 / 39 Test 2·3, ARCHITECTURE 4.1 / 5 / 10 / 25 / 26, TASKS 2.1 / 4.1
해결한 READY: 없음 (Phase C 에 선행 READY 없음)
결정 기록: [ADR 023](../adr/023-phase-c-room-detection-queue-and-diagnosis.md)

## 판단

TASKS 2.3 의 순서 017 → 018 → 019 → 020 → 021 → 022 로 진행했다. 017~021 의 AC 를 모두 통과했다.
022 는 진단 모드 구현 AC 를 통과했지만, **분기점 1 의 재미 검증은 사람이 실제로 플레이해 보기 전에는
통과가 아니다**(AGENTS 8, TASKS 4). 관찰용 장면(`?scene=room-lab`)·절차·질문지를
[HUMAN_REVIEW 4장 G1](../project/HUMAN_REVIEW.md#4-재미-검증-게이트--이-목록으로-미루지-않는다)에 준비했다.
관찰 결과를 받을 때까지 TASK-023 이후(Phase D)를 시작하지 않는다.

방 판정 조건(MVP_SPEC 11.2 / 12.1 / 12.2)은 바꾸지 않았다. 새 블록·가구·방 타입·자원·메커닉·프레임워크를
추가하지 않았다. 관찰 장면과 시작 인벤토리는 기존 블록만 쓰는 시험용 fixture 다.

자동 테스트 241 개(Phase C 신규 71), lint·typecheck·format·build 통과. 브라우저 확인은 Phase A·B 와 같은
headless Chrome 148 + CDP 방식이다. 포인터 락은 headless 에서 걸리지 않아 상태 기계(`__gtbScreen.lockAcquired`)로
조작 상태를 만들었고, 문·침대 설치는 실제 InputSystem → BlockEditSystem 경로(우클릭)로 했다.

## Task별 결과

| Task | 상태 | 변경한 것 | AC |
| --- | --- | --- | --- |
| 017 | 완료 | `tests/helpers/buildTestWorld.ts`(문자열 레이어 → VoxelWorld + RoomBlockReader, D 수직 쌍·B 선언 검증), `tests/helpers/roomFixtures.ts`, `room/roomReader.ts` | 전부 통과 (6 테스트) |
| 018 | 완료 | `room/detectRoom.ts` 의 `RoomSearch` kernel + `detectRoom`, `voxel/occupancy.ts`(`isPassableFor` / `isStandableCell`), 공통 방 타입 | 전부 통과 (23 테스트) |
| 019 | 완료 | `data/roomRecipes.ts` 5 종, `room/matchRecipe.ts`(보행 셀·접근 셀·사용 위치·우선순위·가구 문제 문구) | 전부 통과 (17 테스트) |
| 020 | 완료 | `room/RoomRegistry.ts`(문 버킷 인덱스·문/방 확인 작업·중복 없는 큐·예산·재시작·id 유지·합병·rebuildAll), `systems/RoomSystem.ts`(5 번 슬롯), 방 이벤트 4 종, F3 방 줄 | 전부 통과 (16 테스트 + 브라우저 계측) |
| 021 | 완료 | `render/RoomLabelView.ts`(DOM 라벨·거리 페이드·떠오름·겹침 회피), `render/RoomOverlayView.ts`(인식 빛남·해제 깜빡임), `ui/RoomSound.ts`(합성 인식음·경고음) | 통과. 소리·연출의 체감은 HR-007 |
| 022 | 구현 완료 · 게이트 대기 | `ui/RoomDiagnosticPanel.ts`(Tab 문구), 진단 하이라이트(RoomOverlayView), `RoomRegistry.beginDiagnosis`, F3 "방 경계 상시 표시", `?scene=room-lab` | 구현 AC 7 개 통과 (9 테스트). "플레이어가 이해하는지 기록" AC 와 5 개 질문은 **미검증** |

### 결정 (ADR 023, 정본 반영)

- 탐색 kernel `RoomSearch`(`step` / `touches`), NO_FLOOR 좌표 = 빈 바닥 칸(y-1), 벽 칸 시작 = TOO_SMALL,
  반쪽 문은 문이 아니다 → MVP_SPEC 11.4, ARCHITECTURE 10.1.
- 큐 작업 두 종류(문 `(anchor, 면)` + 방 확인 `room:id`), 표현 구독자는 방 예산 밖에서 작업 → ARCHITECTURE 10.5.
- 방 id: 겹치는 기존 방 하나면 갱신·유지, 둘 이상이면 `MERGED` 해제 후 새 등록 → ARCHITECTURE 5 / 10.4.
- "벽 틈에 낀 침대" = 문과 이어진 보행 셀이 옆에 없는 침대(12.2 그대로 해석, 조건 추가 없음).
- 진단: 자동 큐보다 먼저·같은 예산·이전 결과 유지, `RoomDiagnostic` 에 start / failureDetail / roomType.
- 폴더 구조에 `roomReader.ts` / `RoomOverlayView.ts` / `RoomSound.ts` 추가 → MVP_SPEC 33.

## 검증

### 명령

```text
pnpm test        241 passed (24 files)
pnpm lint        통과
pnpm typecheck   통과
prettier --check 통과
pnpm build       통과 (three 포함 번들 >500kB 경고만)
```

실제 시계 예산 테스트(`roomRegistry.test.ts`)는 단독 실행 시 중앙값 3.05 / 최대 3.15 ms 였으나, 24 개
테스트 파일을 병렬로 돌리면 OS 선점으로 한 묶음이 수 ms 늘어나 불안정했다. 그 테스트는 느슨한 상한
(중앙값 < 9 ms)만 보고, 예산 논리는 가짜 시계 테스트 2 개가, 실제 상한은 브라우저 F3 계측이 확인한다.

### 브라우저 관찰 (headless Chrome 148, ANGLE Vulkan, 1280 × 720)

- `?scene=room-lab` 로드 시 A(빈 방)·E(주방) 두 방이 조용히 인식된다(rebuildAll, 연출·이벤트 없음).
- 사례별 Tab 진단(플레이어를 방 안으로 옮겨 확인):
  B 문 없음 → "문이 없습니다" / C 벽 구멍 → "공간이 열려 있거나 너무 큽니다"(TOO_LARGE, 탐색 101 칸,
  경로 14 칸의 노란 점이 서쪽 구멍으로 나간다) / D 흙벽 → "이 블록은 방의 벽으로 인정되지 않습니다"
  + 흙 좌표 붉은 상자 / E → "주방 — 방으로 인정됩니다" + "주방이 침실보다 우선이라 침대는 쓰이지 않습니다",
  침대에 주황 표시, 경계 초록 / F → WALL_TOO_LOW (23, 12, 44) / G → WALL_TOO_LOW (31, 12, 43, 단 윗칸).
- **MVP_SPEC 39 Test 2 (1~11)**: 5 × 5 판자방 → 인식 없음 → Tab "문이 없습니다" → 벽 두 칸 비우고
  우클릭으로 문 설치(두 칸 객체, south) → "빈 방" 인식(ROOM_REGISTERED) → 우클릭으로 침대 설치 →
  "침실"(ROOM_TYPE_CHANGED, beds 1) → 벽 한 칸 파괴 → 해제(TOO_LARGE) → 복구 → "침실" 재인식.
  7·10·12 의 감사 포인트(+20, 중복 없음)는 TASK-035 이후 확인한다(TASKS 2.6).
- **Test 3 (1~6)**: 구멍 방에서 탐색 범위·경로와 문구 표시, 구멍을 막으면 진단이 즉시 다시 돌아
  "빈 방 — 방으로 인정됩니다"로 바뀌고 방이 등록된다(단위 테스트 + 브라우저 C 사례). 흙벽 문구·좌표 확인.
- 인식 빛남(옅은 금색, 1.3 s)·해제 붉은 깜빡임(3 회, 1.2 s)·라벨 떠오름/붉게 사라짐을 스크린샷으로 확인했다.
  로드로 인식된 방의 해제 깜빡임이 처음엔 나오지 않던 결함(형태 캐시 누락)을 찾아 고쳤다.
- 효과음: AudioContext 에 인식 시 사인파 4 음 × 3 배음(523~1047 Hz 아르페지오), 해제 시 삼각파 2 음이
  예약되는 것을 확인했다. **소리를 들어 본 것은 아니다**(HR-007).
- 라벨 겹침: 8 개 방 줄을 비스듬히 보면 가까운 라벨이 자리를 잡고 겹치는 라벨은 위로 비키며 먼 라벨은 흐려진다.
- 기본 섬(`/`)에서 광장 진단은 종(64, 28, 64)을 "벽으로 인정되지 않는 블록"으로 가리킨다. 회귀 없음.

### 측정 (방 재판정 예산, TASK-020 AC)

| 조건 (headless, room-lab, 방 10 개) | 3 ms 초과 프레임 | 중앙값 | 최대 |
| --- | --- | --- | --- |
| 첫 인식(차가운 JIT) | — | — | 1.6~2.0 ms (표현 작업을 예산 밖으로 옮기기 전 5.2 ms) |
| 8 방 동시 완성(버스트) | 0 | — | 3.0 ms |
| 20 편집/s, 8 방에 5 s | 0 / 300 (2 회) | 0 ms | 3.0 ms |
| 500 편집/s(사람의 약 25 배) 5 s | 1~6 / 300 (3 회) | 1.3~1.5 ms | 3.3~7.7 ms |

500 편집/s 에서 단위 작업(탐색 32 단계 0.5 ms, 결과 반영 0.5 ms, 작업 준비 0.2 ms)은 모두 짧았다. 초과는 GC 로
보이는 외부 멈춤이며 확인하지는 못했다. 부하가 끝난 뒤 0.5 s 안에 큐가 비고 방 10 개가 최신 상태와 일치했다.
`performance.now` 는 브라우저에서 0.1 ms 단위로 거칠다. 실제 창의 값은 HR-007 로 받는다.

## 아직 없는 연동과 후속 확인

- 감사 포인트 +20·타입당 최초 1 회(Test 2 의 7·10·12): GratitudeSystem(TASK-035).
- 방 해제 시 침대 배정 해제·Action 취소·기상(MVP_SPEC 11.7): SleepSystem / NPCSystem(TASK-028 / 033).
  dirty 방 제외는 `getByType` 에 반영했다. 배정은 방 id 가 아니라 침대 objectId 로 재검증해야 한다(ADR 023).
- 통행 판정: `voxel/occupancy.ts` 의 `isStandableCell` 을 NavigationGraph(TASK-024)가 그대로 쓴다.
  물 칸은 명세대로 "비고체"로 통과 가능하게 두었다 — NPC 가 물로 걸어 들어가는지는 024 에서 본다.
- F3 "통행 가능 셀 표시": TASK-024. 방 저장·로드 후 `rebuildAll`: TASK-051.
- 인식음·경고음의 최종 음질: TASK-050.

## 실제 소요와 재작업

- 한 세션 약 40 분(문서 확인 포함). 에이전트 1 명, 사람의 개입 없음.
- 재작업: 테스트 fixture 오류 5 건(공유 벽, 벽 x 좌표, 빠뜨린 접근 셀, 공유 문 제거의 기대값 — 실제로는
  합병이 맞았다, 문 자리 skip), 진단 결과가 블록 변경 뒤 한 프레임 오래된 값으로 남던 문제, 표현 구독자가
  방 예산을 먹던 문제, 로드로 인식된 방의 해제 연출 누락, 실제 시계 테스트의 병렬 실행 불안정. 모두 같은
  세션에서 해결했다.

## 다음 할 일

1. **TASK-022 게이트 G1: 사람의 플레이 관찰을 받는다.** [HUMAN_REVIEW 4장](../project/HUMAN_REVIEW.md)의 절차·
   질문지대로 플레이하고 결과를 이 폴더에 TASKS 4.1 의 022 형식으로 기록한다.
2. 결과가 부정적이면 판정·진단 축과 감성·표현 축을 나눠 개선하고 다시 관찰한다. 콘텐츠를 추가하지 않는다.
3. 두 축이 통과한 뒤에만 TASKS 2.3 의 4 번 묶음(023 → 024 → …)을 시작한다. READY-04 는 TASK-023 전에 확정한다.
4. 사람 확인 대기(게이트와 별개): HR-001~007.
