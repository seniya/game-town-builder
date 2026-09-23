# Phase D 시간과 이동 + TASK-033 취침 구현 — G2 관찰 대기

Date: 2026-09-23
Status: READY-04 **확정**. TASK-023 / 024 / 025 / 026 / 028 / 029 / 034 **완료**. TASK-033 **검증 대기**(구현 AC 통과, 재미 검증 G2 미실시)
관련 정본: MVP_SPEC 9.5 / 14.3 / 18 / 19 / 20 / 31, ARCHITECTURE 4.1 / 5.2 / 11 / 12 / 13 / 14 / 15 / 23, TASKS 2.3 / 2.5 / 4.1
해결한 READY: READY-04 ([MVP_SPEC 14.3](../project/MVP_SPEC.md#143-채석장-재생-시각과-당일-처리-키-ready-04), [ADR 024](../adr/024-quarry-respawn-timing-ready-04.md))
결정 기록: [ADR 024](../adr/024-quarry-respawn-timing-ready-04.md), [ADR 025](../adr/025-phase-d-navigation-npc-and-day-night.md)

## 요약

TASKS 2.3 의 4 번 묶음(023 → 024 → 025 → 026 → 028 → 029 → 034 → 033)을 구현했다. 주민 셋이 섬(종 주변)에 서 있고,
19:00 광장에 모이고, 20:00 에 배정된 침대로 걸어가 눕고, 침대가 없으면 종 둘레에 앉아 쉬고, 05:00 에 일어나 광장으로 나온다.
TASK-033 은 AGENTS 8 에 따라 **여기서 멈춘다.** 관찰 장면(`/?scene=sleep-lab`)과 질문지를
[HUMAN_REVIEW 4장 G2](../project/HUMAN_REVIEW.md#4-재미-검증-게이트--이-목록으로-미루지-않는다)에 준비했다.
G2 결과 전에는 PERF-001·TASK-030 으로 넘어가지 않는다.

방 판정 조건은 바꾸지 않았다. 새 블록·가구·방 타입·자원·메커닉·프레임워크를 추가하지 않았다.
명세에 넣은 것은 기존 문장이 정한 값의 이름(07:00·19:00·05:00 경계, 배속 목록), NPC 폭 0.6(플레이어와 같음),
NPC 물 통행 금지(9.5 가 TASK-024 에 넘긴 항목)뿐이다.

자동 테스트 313 개(이번 신규 72), lint·typecheck·format·build 통과. 브라우저 확인은 headless Chrome 148 + CDP.

## Task별 결과

| Task | 상태 | 변경한 것 | AC |
| --- | --- | --- | --- |
| READY-04 | 확정 | 05:00 경계·QuarryRespawnSystem·respawnedThroughDay·by='world'·SaveData.quarry·시간은 앞으로만 | 정본·AC 반영 |
| 023 | 완료 | `systems/GameClockSystem.ts`(순수 시각 함수·DayPhase·배속·앞당기기·restore), `systems/QuarryRespawnSystem.ts`, `ui/ClockHud.ts`, F3 시간 줄·버튼, `?time=` | 전부 통과 (15 테스트 + 브라우저) |
| 024 | 완료 | `nav/NavigationGraph.ts`(isStandable+물 제외, 이웃 캐시·역참조 무효화, watch / onInvalidate, stepReadCells), `render/NavOverlayView.ts`, F3 "통행 가능 셀 표시"·`?nav=1` | 전부 통과 (8 테스트 + 브라우저) |
| 025 | 완료 | `nav/pathfind.ts`(A*·힙·수치 키·NO_PATH / NODE_LIMIT·partialPath·reachableBoundary·단일 사용 토큰·cells 목표), `nav/PathScheduler.ts`(공유 예산·순환·범위 기반 재시작) | 전부 통과 (12 테스트). 64 칸 탐색 0.8~2 ms(첫 호출 3.2 ms) |
| 026 | 완료 | `nav/MovementController.ts`(충돌·중력·step-up, blocked 3 회, 0.5 초 간격, standStill) | 전부 통과 (6 테스트) |
| 028 | 완료 | `entities/NPC.ts`(NPC<ActionView>, createNPC), `actions/Action.ts`·`IdleAction`·`MoveAction`, `systems/NPCSystem.ts`, `render/NpcView.ts`(역할별 모형·걷기·정지), `GameWorld.spawnResident`, 섬 주민 셋, F3 NPC 줄 | 전부 통과 (6 테스트 + 브라우저). 외형·정감의 사람 판단은 HR-009 와 G2 |
| 029 | 완료 | `systems/NPCDecisionSystem.ts`(순수 decideAction → ActionPlan, 5 단계, 19.5 시간표, 광장 칸) | 전부 통과 (12 테스트) |
| 034 | 완료 | `render/DayNightVisual.ts`(키프레임 보간·TorchIndex·가까운 16 개), 복셀 셰이더 점광원 uniform, `Renderer` 광원 공개 | 전부 통과 (4 테스트 + 브라우저) |
| 033 | **검증 대기** | `systems/SleepSystem.ts`(경로 확인 후 배정·즉시 해제·저장 snapshot), `actions/SleepAction.ts`·`RestAction.ts`, 눕기·앉기 자세, `?scene=sleep-lab` | 구현 AC 12 개 통과 (9 테스트 + 브라우저). **G2 재미 검증 미실시** |

## 실행한 검증

```text
pnpm test        313 passed (타이밍 테스트는 JIT 준비 3 회 뒤 9 회 중앙값으로 잰다)
pnpm lint        src·tests 통과 (저장소 밖 사용자 파일 .claude/helpers 의 기존 lint 오류는 이번 변경과 무관, 건드리지 않음)
pnpm typecheck   통과
pnpm build       통과
```

## 브라우저 관찰 (headless Chrome 148, ANGLE Vulkan, 1280 × 720, 에이전트 관찰 — 사람의 판단이 아니다)

| 장면 | 확인한 것 |
| --- | --- |
| `/?orbit=0&view=2`, 16× 뒤 `advanceClockTo(4,59)` | HUD `Day 2 05:58 · 새벽`, 05:00 경계에서 채석장 8 칸 복구 1 회(respawnedThroughDay 2) |
| `/?scene=room-lab&view=1&nav=1&debug=1` | 통행 셀 판(초록)과 문 칸(파랑), F3 통행 줄, 경로 요청 한 프레임 안에 완료 |
| `/?orbit=0&view=1` | 섬 종 주변에 농부·요리사·목수 셋이 서 있다(Day 1 07:11) |
| `/?scene=sleep-lab&view=1` 20:00 | 농부가 걷는 자세로 침실 문을 지나 들어간다(20:10). 문은 열리는 모습 없이 통과한다 |
| `/?scene=sleep-lab&view=3` | 침대 위에 누운 자세·베개·이불·떠오르는 z. 몸체는 접근 셀 (38, 11, 25) 가운데 |
| `/?scene=sleep-lab&view=0 / 4` 20:33 | 밤 하늘·달빛, torch 주변만 밝다, 불 켜진 집, 요리사·목수가 종을 보고 앉아 있다 |
| 기상 `advanceClockTo(4,59)` | 05:02 침대가 비고 주민이 "일어나 광장으로 가는 중" |
| `/?scene=sleep-lab&view=1&dpr=1&measure=20` 밤 | 평균 60.0 FPS, 하위 1% 59.5, 최대 프레임 16.8 ms, 드로우콜 52 |

발견·수정: 결정이 접근 셀에 막 들어선 순간 취침으로 바꿔 칸 가장자리(z 25.97)에서 눕던 문제 → 진행 중 이동은 칸 가운데 도착까지 유지(ADR 025 의 6).
누운 자세에서 밀짚모자가 머리판처럼 서던 문제 → 누울 때 모자를 벗는다. 이불 두께 조정.

## 아직 없는 연동과 후속 Task

- 취침 감사 포인트 +5·nightId 중복 방지: TASK-035 (SleepAction 에 보상 포트가 아직 없다).
- 식사·역할 작업·도피·대화 Action: 032 / 030 / 031 / 048 / 047 / 040. 판단은 계획을 내지만 실행은 "대기 (TASK-…)" 로 선다.
- WorldState 를 NPCContext 에 넣는 것: 039. 저장 왕복(시계·채석장 키·침대 배정): 051.
- 주민 관련 소리·문 여닫는 표현: 없음. G2 에서 거슬린다는 지적이 나오면 표현만 다룬다(문 규칙은 그대로).
- 배속은 시계만 빠르게 하므로 16× 에서는 주민이 게임 시간으로 늦게 도착한다(시험용 동작).

## 실제 소요와 재작업

한 세션. 재작업: 64 칸 타이밍 테스트가 병렬 부하에서 한 번 5 ms 를 넘어 측정 방식을 바꿈(기준 5 ms 유지),
결정 시점 문제 1 건, 모형 조정 2 건. 스케줄러 시험이 너무 빨리 끝나던 시험 설계 오류 1 건.

## 다음 단계

1. **TASK-033 G2 관찰** — 사용자 플레이. 절차·질문지는 HUMAN_REVIEW 4장 G2. 결과를 받을 때까지 멈춘다
2. G2 통과 시 TASKS 2.3 의 5 번 묶음: PERF-001 → 030 → 031 → 032 → 039 → 035 → 036 → 037 → 038
3. 사람 확인 대기(게이트와 별개): HR-001~009
