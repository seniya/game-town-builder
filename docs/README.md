# 문서 안내

현재는 **Phase D(시간과 이동) 완료, TASK-033 재미 검증(분기점 2, G2) 통과** 상태다.
PERF-001·TASK-030(농사)·031(요리)·032(식사)·SHAPE-001(기존 블록 모양)·039(World State)·035(감사 포인트)·036(마을의 종)·037(해금)·038(새 주민 도착)·040(대사)·041(목표)·042·043(진행 이벤트)·044(습격 스케줄)·045(몬스터 AI)·046(전투)·047(도피)·048(수리)·049(피해 보고) 를 마쳤고 다음은 PERF-002 이다. 전체 순서는 TASKS 2.3을 따른다.
게이트 결과는 [G1 기록](state/2026-09-23_1400-task-022-gate-g1-passed.md), Phase D 는
[Phase D 기록](state/2026-09-23_2241-phase-d-time-movement-and-sleep-gate.md), [G2 기록](state/2026-09-23_2309-task-033-gate-g2-passed.md)에 있다.
결과는 [Phase A 기록](state/2026-09-23_1036-phase-a-voxel-foundation.md),
[Phase B 기록](state/2026-09-23_1130-phase-b-player.md),
[Phase C 기록](state/2026-09-23_1208-phase-c-room-recognition.md)에 있다.

## 읽는 순서와 정본

| 순서 | 문서 | 결정하는 것 |
| --- | --- | --- |
| 1 | [GAME_DESIGN](project/GAME_DESIGN.md) | 게임 의도·감정 목표 |
| 2 | [MVP_SPEC](project/MVP_SPEC.md) | 범위·수치·조건식 |
| 3 | [ARCHITECTURE](project/ARCHITECTURE.md) | 인터페이스·상태 소유권 |
| 4 | [TASKS](project/TASKS.md) | 실행 순서·완료 조건 |

네 정본을 읽은 뒤 [전체 로드맵](project/ROADMAP.md)에서 A~I의 결과와 조건부 장기 계획을
확인한다. ROADMAP은 정본을 연결하는 안내이며 새 규칙의 정본이 아니다.
세부 실행 준비는 TASKS 2.5~2.7, 검증 기록 형식은 TASKS 4.1을 따른다.
사람이 화면을 보고 판단할 항목은 [사람 확인 대기 목록](project/HUMAN_REVIEW.md)에 모으고
일반 Task는 진행한다. TASK-022/033의 재미 검증만은 이 목록으로 미루지 않는다.

작업 규약은 [AGENTS.md](../AGENTS.md)다. 충돌은 위 책임별 정본에서 먼저 고친다.
**아름다운 공간에서 정감 있는 주민이 생활하는 경험**을 중심에 두며,
MVP 5명과 장기 100명·대형 월드의 확장 경계를 구별한다.
TASK-022와 TASK-033의 시스템·감성 검증은 생략하지 않는다.

## 보조 문서의 적용 범위

- `adr/`: 결정의 이유와 변경 이력이다. 001 / 002 / 005 / 009는 폐기됐다.
  Accepted인 구 ADR도 머리말의 보완 범위를 먼저 읽는다. 구체 구현은 현재 정본을 따른다.
- `research/`: 외부 근거·해석·확인 한계를 기록한다. 출처가 있다는 것만으로
  최신성·정확성이나 이 프로젝트의 성능이 검증된 것은 아니다.
- `state/`: 작성 당시의 완료·미완료 기록이다. 파일명의 시각만으로 개정 순서를
  판단하지 않는다. 과거 Task 번호·수치·다음 할 일이 현재 Task 목록을 덮어쓰지 않는다.
- 저장소의 `graft/INDEX.md`는 도구용 탐색 안내다. 게임 규칙이나 구현 상태의 정본이 아니다.

현재 핵심 결정은 ADR 011~023이다. [ADR 목록](project/ARCHITECTURE.md#31-adr-목록)에서
폐기·보완 관계를 확인한다. v1.3의 실행 계약 보완은
[ADR 020](adr/020-consistent-progression-edit-save-contracts.md)에 기록했다.

## 이번 검토와 남은 검증

[v1.3 전수 검토 기록](state/2026-09-22_2248-docs-consistency-and-direction-review.md)에
당시 수정한 반례와 문서 검증 결과를 남겼다. 현재 열린 정책과 확정 시점은
[TASKS 2.5](project/TASKS.md#25-착수-조건과-미결정-정책)를 따른다.
[개발 준비·로드맵 검토 기록](state/2026-09-22_2331-development-readiness-and-roadmap.md)에
이번 점검 결과와 추가 계획, 검증 한계를 정리했다.

90~120분은 분량 가설이다. 첫 방·첫 취침과 플레이어의 애착을 먼저 검증한다.
장기 Job/LOD/스트리밍·Desktop 배포는 현재 구현 목록이 아니며 도입 시 별도 계약과
실측이 필요하다. 과거 검토를 성능·상용성·재미의 증거로 사용하지 않는다.
