# TASKS.md

# Small Village Restoration Game — Task Breakdown

Version: 1.4 (게임 명세 v1.3 유지, 개발 준비·로드맵 보완)
Status: Phase A·B 완료 (TASK-001~016·027) — 다음 TASK-017
Date: 2026-09-22

---

# 1. 문서 목적

이 문서는 **어떤 순서로 만드는가** 를 정의한다.

**Acceptance Criteria 의 정본은 이 문서다.**

전체 이정표와 MVP 이후의 조건부 계획은 [ROADMAP](ROADMAP.md)을 참고한다.
현재 일반 Task 53개 + PERF 2개 중 Phase A·B의 17개(001~016·027)가 완료되었다. 세부 정책을 구현 전에 확정할 시점은
2.5, 통합 검증 연결은 2.6, 첫 실행 묶음은 2.7에 정리한다.

## 1.1 Task 하나의 크기 기준

```text
한 번의 작업 세션에서 끝난다
독립적으로 테스트하거나 눈으로 확인할 수 있다
완료 여부를 다투지 않는다
```

## 1.2 Task 작업 절차

```text
 1  TASKS.md 에서 Task 와 Acceptance Criteria 를 읽는다
 2  MVP_SPEC.md 에서 수치와 조건을 확인한다
 3  ARCHITECTURE.md 에서 책임 위치와 인터페이스를 확인한다
 4  필요하면 GAME_DESIGN.md 에서 의도를 확인한다
 5  구현한다
 6  테스트를 작성하고 통과시킨다
 7  브라우저에서 실행을 확인한다
 8  주요 결정이 있었다면 docs/adr/ 에 ADR 을 추가한다
 9  docs/state/ 에 완료 기록과 다음 할 일을 남긴다
10  commit 후 push, 원격 반영 확인
```

## 1.3 Task 를 임의로 추가하지 않는다

범위를 넓히는 Task 를 만들지 않는다.
필요하다고 판단되면 먼저 `MVP_SPEC.md` 를 고치고 ADR 을 남긴다.

TASK-PERF-001 / 002는 사용자 요청과 ADR 018에 따른 구조 검증이다. 별도 synthetic
fixture를 사용하며 MVP 인원·월드·콘텐츠와 완료 성능 수치를 확대하지 않는다.

## 1.4 이 문서는 전면 개정되었다

Version 0.2 의 TASK-001 ~ 044 는 Phaser 3 / 2D / Prefab 건물을 전제로 했다.
ADR 011 ~ 015 로 전부 폐기되었다.

번호를 이어 쓰지 않고 001 부터 다시 시작한다.

---

# 2. 단계 개요

```text
Phase A  복셀 기반      TASK-001 ~ 008 + 027    청크 / 메싱 / 렌더 / 섬
Phase B  플레이어       TASK-009 ~ 016    이동 / 충돌 / 블록 편집 / 제작
Phase C  방 인식 ★     TASK-017 ~ 022    detectRoom / 레시피 / 진단
Phase D  시간과 이동     TASK-023 ~ 026, 028 ~ 029, 034    시계 / 통행 / A* / NPC 골격
Phase E  주민 생활 ★   TASK-033 ★ → PERF-001 → 030 ~ 032    취침 / 구조 검증 / 농사·요리·식사
Phase F  성장          TASK-039 → 035 ~ 038    감사 포인트 / 종 / 해금
Phase G  진행          TASK-040 ~ 043    대사 / 목표 / 이벤트
Phase H  방어          TASK-044 ~ 049 → PERF-002    습격 / 파괴 / 전투 / 수리 / 작업 부하 검증
Phase I  마무리        TASK-050 ~ 053    오디오 / 저장 / 엔딩 / 밸런스
```

## 2.1 두 개의 분기점

```text
TASK-022 (방 진단)     Phase C 끝. 방을 만드는 것이 즐거운가
TASK-033 (취침)        Phase E 시작. 주민이 내 방을 쓰는 것이 만족스러운가
```

**두 지점에서 부정적이면 다음 Phase 로 넘어가지 않는다.**

```text
TASK-022 판정 축 실패   MVP_SPEC 11.2의 조건 개정 또는 11.5의 진단 개선 후 재검증
TASK-022 감성 축 실패   기존 블록 팔레트·가구·공간 실루엣을 개선 후 재검증
TASK-033 에서 실패      이동·사용 연결과 MVP_SPEC 31장의 조명·주민 표현을 개선
```

콘텐츠를 추가해서 해결하려 하지 않는다.
두 지점은 “아름답게 만든 공간에서 정감 있는 주민이 실제로 살아가는 순간”을
검증한다. TASK-022는 공간을 가꾸는 즐거움, TASK-033은 그곳에 사는 주민에 대한
애착을 확인한다. 아름다움을 수치로 채점하거나 방 판정 조건에 추가하지 않는다.
두 축을 별도로 기록하고 감성 축의 실패를 “그래픽은 나중”으로 미루지 않는다.
조건을 바꿀 때는 먼저 정본을 개정하며 감성 문제를 방 조건 변경만으로 해결하지 않는다.

## 2.2 Phase 경계에서 플레이 가능한 상태

```text
Phase A 끝    섬이 보인다. 아직 조작할 수 없다
Phase B 끝    돌아다니며 채집·제작하고 블록을 부수고 놓을 수 있다
Phase C 끝    방이 인식된다. 아직 주민이 없다
Phase D 끝    주민 3명과 이동·판단 골격이 있다. 실제 역할·식사·취침은 다음 단계에서 연결한다
Phase E 끝    취침 검증 후 농사 / 요리 / 식사를 연결한다. ★ 게임의 핵심이 전부 있다
Phase F 끝    감사 포인트가 쌓이고 종을 칠 수 있다
Phase G 끝    대사와 목표가 플레이어를 안내한다
Phase H 끝    밤에 몬스터가 온다. 벽이 부서지고 목수가 고친다
Phase I 끝    저장되고, 소리가 나고, 엔딩이 있다
```

## 2.3 실행 순서와 기존 번호

번호는 식별자다. 본문 위치나 숫자 순으로 실행하지 않고 다음 순서와 의존을 따른다.

1. 001 → 002 → 027 → 004 → 003 → 005 → 006 → 007 → 008
2. 009 → 010 → 012 → 011 → 014 → 013 → 015 → 016
3. 017 → 018 → 019 → 020 → 021 → 022 ★
4. 023 → 024 → 025 → 026 → 028 → 029 → 034 → 033 ★
5. PERF-001 → 030 → 031 → 032 → SHAPE-001 → 039 → 035 → 036 → 037 → 038
6. 040 → 041 → 042 → 043 → 044 → 045 → 046 → 047 → 048 → 049 → PERF-002
7. 050 → 051 → 052 → 053
8. PERF-003 → ANIM-001 (2026-09-25 사용자 결정. TASK-053 의 사람 통과 플레이 HR-029 와 병행한다)
9. BARK-001 → BARK-002 (2026-09-25 사용자 결정. 주민의 한마디와 그 소리)

027은 초기 공통 골격, 039는 성장 게이트에 필요한 순수 지표 계산이므로 앞당긴다.
033은 농사·요리·식사에 의존하지 않는다. 기존 디버그 기능으로 침실·주민 한 명·시계를
연결해 핵심 취침 경험부터 확인한다. 022를 통과하기 전 주민 단계로 넘어가지 않는다.
아직 구현하지 않은 시스템은 update 슬롯을 비워 두고, 타 시스템 완료 조건을 통과했다고 주장하지 않는다.
TASK 본문은 참조 안정성을 위해 기존 번호 위치를 유지한다.
PERF-001은 TASK-033을 통과한 직후, PERF-002는 기존 역할 시스템이 모두 연결된 뒤
실행한다. 성능 미달 원인을 측정·기록하고 고정 인원/전역 검색 같은 구조 위반은 고친다.
장기 LOD·스트리밍·범용 Job System의 완성을 위해 MVP 재미 검증을 중단하지 않는다.

PERF-001이 TASK-030의 선행인 이유는 구조 위반을 농사·요리가 얹히기 전에 찾기 위해서다.
**막는 것은 구조 위반뿐이다.** 측정된 프레임 시간이 목표에 못 미치는 것은 기록 대상이며
그것만으로 030 이후를 멈추지 않는다. fixture 제작이 커지면 축소하고 축소한 범위를 남긴다.

## 2.4 표기

```text
★   핵심 검증 지점
의존  이 Task 이전에 끝나 있어야 하는 Task
```

## 2.5 착수 조건과 미결정 정책

Task 착수에는 선행 의존 완료와 아래 준비 항목의 해당 기한 충족이 모두 필요하다.
담당은 **해당 Task를 수행하는 개발자/에이전트**다. 정책 결정은 정본·관련 AC에 먼저
반영하고, 주요 구조 결정이면 ADR을 추가한다. 이 표에는 결정 내용과 반영 링크를 남겨
완료 처리한다. 오래된 state의 TODO를 현재 정책으로 사용하지 않는다.

| ID | 현재 상태 | 확정 기한 | 확정할 내용·반영 위치 | 검증 계획 |
| --- | --- | --- | --- | --- |
| READY-00 | **확정** (2026-09-23) | TASK-001 안에서, 002 전 | Node 24.16.0 / pnpm 11.2.2 / TypeScript 5.9.3 / Vite 8.3.0 / Vitest 4.1.11 / three·@types/three 0.186.0 / ESLint 10.11.0 + typescript-eslint 8.70.1 / Prettier 3.9.8. package.json·pnpm-lock.yaml에 정확한 버전으로 고정 | dev/build/test/lint/typecheck 통과, Chrome 148 캔버스, 금지 import 6건 lint 에러 확인. 기록: [Phase A state](../state/2026-09-23_1036-phase-a-voxel-foundation.md) |
| READY-01 | **확정** (2026-09-23) | TASK-008 구현 전 | 채석장 후보 = 노출 돌 지대(반지름 10)의 평지 위 원래 stone 칸, y→z→x 고정 순서. 하루 최대 8칸, air·캐릭터 비점유·면 인접 비지형 블록 없음만 복구, 부족분 이월 없음. [MVP_SPEC 14.2](MVP_SPEC.md#142-채석장-재생-후보와-점유-보호-ready-01), [ARCHITECTURE 24 island.ts 계약](ARCHITECTURE.md#islandts-계약-task-008) | island 테스트: 후보 재현·순서, 캐릭터 칸·플레이어 블록·건축물 인접 칸 제외, 후보 부족. 시간 연결은 READY-04 |
| READY-02 | **확정** (2026-09-23) | TASK-013 구현 전 | 지지 조건은 설치 때만 검사. 지지면이 부서져도 가구·침대·문·횃불·farmland 는 남고 연쇄 파괴·드롭 없음. 한 번의 파괴는 대상 블록 또는 그 다중 칸 객체 전체만 바꾼다. 예외는 기존 규칙인 farmland 제거 시 crop 제거(TASK-030). [MVP_SPEC 10.4.1](MVP_SPEC.md#1041-지지면이-사라진-뒤-ready-02) | 013 테스트: 침대·문·torch 아래를 부숴도 객체·PlacementIndex 유지, 드롭은 부순 블록 것뿐, 인벤토리 부족 시 전체 미변경 |
| READY-03 | **확정** (2026-09-23) | TASK-015 구현 전 | 화면 상태 = 조작 중 / 모달 / 메뉴. 모달(인벤토리·종·저장소·대사·피해 보고)은 시간·시뮬레이션 진행 + 플레이어 조작만 차단, Esc 메뉴는 일시정지. 락 상실 시 메뉴, 메뉴는 클릭으로 락 복귀. E 로 닫으면 락 재요청, Esc 로 닫으면 메뉴. 모달 전후 눌린 키·버튼은 새로 눌러야 한다. 기절 시 모달 닫기(046). [MVP_SPEC 29.0](MVP_SPEC.md#290-모달-중-시간입력포인터-락-ready-03), [ARCHITECTURE 3](ARCHITECTURE.md#3-런타임-구성) | InputSystem 차단·재입력 테스트, ModalController 상태 전이 테스트, 브라우저에서 E 열기·닫기와 메뉴. 종·대사는 036/040, 저장 UI는 051 |
| READY-04 | **확정** (2026-09-23) | TASK-023 구현 전 | 매일 05:00 경계 통과(직전 < 05:00 ≤ 현재) 때 한 번, 첫 재생 Day 2 05:00. 소유 = QuarryRespawnSystem(update 4 번 슬롯, BlockEditSystem 뒤). 처리 키 respawnedThroughDay = 마지막 처리 경계의 day, 한 프레임 여러 경계도 한 번·보충 없음. 점유 칸은 그날 건너뜀. BLOCK_CHANGED by = 'world'. SaveData.quarry 에 키 저장, 로드 중 미처리·로드 뒤 첫 update 에서 남은 경계 1 회. 시각 강제 설정은 앞으로만. [MVP_SPEC 14.3](MVP_SPEC.md#143-채석장-재생-시각과-당일-처리-키-ready-04) / [20.3](MVP_SPEC.md#203-시간은-앞으로만-간다), [ARCHITECTURE 5.2 / 15 / 23.1](ARCHITECTURE.md#52-block_changed-의-by-필드), [ADR 024](../adr/024-quarry-respawn-timing-ready-04.md) | TASK-023 테스트: 04:59→05:00 경계 1 회·같은 날 재통과 없음, 16× 배속·강제 설정 다중 경계 1 회, 후보 부족, 캐릭터 점유 칸 건너뜀, by='world', 키 snapshot/restore 뒤 중복 없음. 실제 저장 왕복은 051 |
| READY-05 | **확정** (2026-09-24) | TASK-046 구현 전 | 몬스터 공격: 수평 1.2·높이 차 1.5 미만·가슴 높이 선분 차폐. 대상: 사거리 안 가장 가까운 플레이어/기절 안 한 주민, 도달·후보 소진 뒤 반경 12 추적. 넉백 0.3 칸. 기절 30 게임분·재피격 없음·깨면 체력 10. 부활: 몬스터와 3 칸 이상 떨어진 광장 칸, 3 실초 보호, 모달 닫기. [MVP_SPEC 26.1](MVP_SPEC.md#261-공격기절부활의-세부-ready-05-adr-036), [ADR 036](../adr/036-combat-targets-stun-respawn.md) | 차폐·거리 경계·기절 만료·종 주변 점유와 부활 실패 대안. 기존 체력·기절 시간 유지 |
| READY-06 | **확정** (2026-09-23) | TASK-009 구현 전 | 물 = 발·머리 칸이 water 면 마지막 안전 지면으로 즉시 복귀(수영·익사·낙하 피해 없음). 수평 월드 밖·y<0 은 플레이어 충돌 고체. 발밑 제거·추락은 중력대로 낙하. 블록에 끼면 위로 가장 가까운 빈 자리. [MVP_SPEC 9.5](MVP_SPEC.md#95-물월드-경계발판-상실-ready-06), [ARCHITECTURE 8.2](ARCHITECTURE.md#82-collisionts) | collision 테스트(월드 밖 벽·y<0), PlayerMovement 테스트(바다 진입 복귀·안전 지면 무효 시 시작 위치·높은 곳 추락·발밑 제거·끼임 해소). 010/013 AC에 연결 |
| READY-07 | **확정** (2026-09-24) | TASK-036 구현 전 | 조준선(블록 편집과 같은 광선·사거리 5) 위 가장 가까운 대상 하나. 광선은 첫 고체에서 멈춰 가림을 처리하고, 블록보다 가까운 주민이 우선(040). 종 = 성장·저장소 탭 패널, 상자 = 저장소 탭만(Storeroom 인식 여부 무관). 기부는 종류별 1 개/전부. [MVP_SPEC 13.2.1](MVP_SPEC.md#1321-상호작용-대상과-기부-자격-ready-07-adr-033), [ADR 033](../adr/033-interaction-target-and-bell-panel.md) | 종·상자·NPC가 가까이 있을 때 패널 하나만 열림, 가림·거리 경계 사례. NPC 실연동은 040 |

READY-01~05는 기존 검토에서 남긴 정책이며, READY-06~07은 개발 준비 검토에서 확인한
입력·경계 상황의 공백이다. 규칙을 이 표에서 새로 결정하지 않는다. 모든 값을 미리
정해야 TASK-001을 시작할 수 있는 것은 아니며, 해당 Task 전까지는 **미확정**이다.

일반 Task도 시작 전 다음을 확인한다.

- 관련 MVP_SPEC 장과 ARCHITECTURE 계약, 변경할 상태의 소유자가 명확한가.
- 검증할 fixture·경계 사례와 브라우저에서 볼 장면이 있는가.
- 아직 구현되지 않은 연동 대상은 명시적인 fixture/포트로 검증하고, 실제 연결을
  완료할 후속 Task를 적었는가. 미래 기능까지 통과했다고 쓰지 않는다.
- 새 지속 상태를 만들면 ARCHITECTURE 23의 저장/재구축 계약과 맞는가.

## 2.6 통합 검증과 단계별 증거

MVP_SPEC 39의 10개 테스트는 TASK-053에서 모두 재실행한다. 아래의 최초 검증은
중간 통합 시점이며 053의 전체 플레이를 대신하지 않는다.

| 통합 테스트 | 기능 구현 Task | 최초 전체 검증 시점·후속 확인 |
| --- | --- | --- |
| Test 1 블록 | 009~015 | 015 이후, 디버그 없는 채집→제작→설치 |
| Test 2 방 인식 | 018~022, 035 | 022는 인식·진단·피드백만. +20·중복 방지까지는 035 이후 |
| Test 3 진단 | 018~022 | 022에서 실제 플레이 관찰과 함께 |
| Test 4 농사 | 023, 030, 036 | 030은 초기 3씨앗/fixture. 4칸·추가 씨앗 기부 전체 경로는 036 이후 |
| Test 5 요리·식사 | 031~032, 035 | 포인트·중복 소비를 포함해 035 이후 |
| Test 6 취침 | 028~029, 033~035 | 033은 귀가·취침·기상과 애착. +5·밤당 중복 방지는 035 이후 |
| Test 7 종 | 035~039 | 해금·도착까지 연결한 038 이후 |
| Test 8 습격 | 044~047, 039 | 공격·도피·종 도달·지형벽을 연결한 047 이후 |
| Test 9 수리 | 048~049 | 아침 보고까지 연결한 049 이후 |
| Test 10 엔딩 | 038, 043~049, 051~052 | 실제 두 습격·도착·저장과 연결한 052 이후 |

각 최초 전체 검증은 해당 Task의 완료 기록에 남긴다. 043의 후반 이벤트 fixture를
실제 습격·엔딩 플레이로 대체 확인하는 책임은 049/052/053에 있다.
자동 테스트 결과, 브라우저 관찰, 사람이 느낀 재미, 성능 측정을 구별하여 기록한다.
성능 환경은 008에서 정하고, 아직 없는 네 방·주민/몬스터 다섯 시험 장면은 H 이후에
측정한다. 008에서 미래 시험 장면까지 측정했다고 표시하지 않는다.

## 2.7 첫 실행 묶음(Phase A)의 세부 계획

아래는 다음 작업부터 섬 표시까지의 참조표다. 각 Task 본문의 AC가 완료 기준이다.

| 순서 | Task | 읽을 정본 | 결과물·주요 검증 |
| --- | --- | --- | --- |
| 1 | TASK-001 | MVP_SPEC 5/37, ARCHITECTURE 2.2 | 도구·스크립트·lockfile, 빈 캔버스와 엔진 격리 lint |
| 2 | TASK-002 | MVP_SPEC 7.3/33/34, ARCHITECTURE 7/24 | 폴더·공통 타입·좌표 변환·balance, 기준점 테스트 |
| 3 | TASK-027 | ARCHITECTURE 4/5/15/27 | EventBus·registry·storage·16슬롯 골격, 상태 소유권과 순서 |
| 4 | TASK-004 | MVP_SPEC 8/14 | 블록 정의·헬퍼, 종류·파괴/드롭 규칙 |
| 5 | TASK-003 | MVP_SPEC 7/10, ARCHITECTURE 6 | 청크·VoxelWorld·PlacementIndex, 원자 편집·경계/revision |
| 6 | TASK-005 | ARCHITECTURE 9.2~9.3 | 순수 greedyMesh, 컬링·병합·AO fixture |
| 7 | TASK-006 | ARCHITECTURE 9.1~9.2 | Worker 배선·업로드 큐, 역순 결과·연속/경계 편집 |
| 8 | TASK-007 | GAME_DESIGN 14, ARCHITECTURE 9.4 | Renderer·중앙 재질 생성·아틀라스, 작은 집 팔레트와 투명도 |
| 9 | TASK-008 | MVP_SPEC 7.4/14/36, READY-01 | 고정 섬·채석장 후보·자원 총량, 생성 시간과 기준 장치 기록 |

003~005처럼 화면 연결 전의 순수 모듈은 fixture 단위 검증을 수행하고 아직 볼 수 없는
화면 확인은 006~008의 연결 위치를 기록한다. 브라우저 결과를 허위 완료 처리하지 않는다.
006의 시각 AC에는 최소 장면이 필요하므로 007에서 완성할 Renderer/materials 모듈의
최소 연결을 먼저 마련한다. 재질 생성 위치는 이때부터 materials.ts로 유지하며,
007의 팔레트·아틀라스·AO 품질 AC는 007에서 별도로 확인한다.

---

# Phase A. 복셀 기반

## TASK-001 프로젝트 생성

의존: 없음

작업:

```text
pnpm init. Node 24 LTS
typescript 5.x (strict: true)
vite 8.x (SPA)
three 0.18x
vitest 4.1 이상 4.x (Vite 8 지원)
eslint + no-restricted-imports 로 three 격리 규칙
prettier
```

Acceptance Criteria:

- [x] `pnpm dev` 로 빈 캔버스가 뜬다
- [x] `pnpm build` 가 성공한다
- [x] `pnpm test` 가 0 개 테스트로 성공한다
- [x] game / ui / workers에서 `three`와 `three/*` import가 lint 에러가 된다
- [x] `pnpm lint`와 `pnpm typecheck`가 성공한다. 실제 설치 버전·Node 환경과 dev/build/test 결과를 기록한다
- [x] `pnpm-lock.yaml` 이 커밋되어 있다

---

## TASK-002 폴더 구조와 공통 타입

의존: TASK-001

작업:

```text
MVP_SPEC.md 33 장의 폴더 구조를 만든다
src/game/types/index.ts 에 BlockPos / Vec3 / ChunkCoord / posKey 를 둔다
src/game/data/balance.ts 에 MVP_SPEC 34 장을 그대로 옮긴다
좌표 변환 함수 4개 (blockToWorldMin / blockToWorldCenter / standCellToWorldFeet / worldToBlock)
```

Acceptance Criteria:

- [x] 모든 폴더에 최소 1 개의 파일 또는 `.gitkeep` 이 있다
- [x] `balance.ts` 가 `as const` 로 선언되어 있다
- [x] 좌표 변환 4함수의 기준점·왕복 테스트가 통과한다
- [x] `blockToWorld` 라는 이름의 함수가 존재하지 않는다

---

## TASK-003 Chunk 와 VoxelWorld

의존: TASK-004, TASK-027

작업:

```text
Chunk (Uint16Array 4096, index = x + z*16 + y*256)
VoxelWorld (크기는 데이터로 주입, MVP 128 × 64 × 128, getBlock / setBlock)
dirty 청크 추적. 경계 블록이면 인접 청크도 dirty
PlacementIndex + 원자적 editObject. meshRevision 추적
```

Acceptance Criteria:

- [x] `getBlock` 이 월드 밖 좌표에 대해 0 을 반환한다
- [x] `setBlock` 이 같은 id 면 `false` 를 반환하고 dirty 를 만들지 않는다
- [x] 청크 경계(x % 16 === 0)의 블록을 바꾸면 **인접 청크도 dirty** 가 된다
- [x] `takeDirtyChunks()` 가 중복 없이 반환하고, 호출 후 비워진다
- [x] 위 전부에 대한 테스트가 있다
- [x] 침대·문의 점유 칸과 메타데이터가 함께 변경된다. 일부만 실패하면 모두 롤백한다
- [x] AO를 위해 padded에 변경점을 포함하는 모서리·꼭짓점 이웃도 dirty/revision이 갱신된다
- [x] 다중 칸 객체에 단일 setBlock을 직접 적용하면 거부한다
- [x] 월드 크기를 데이터로 주입한다. MVP와 다른 크기의 작은 fixture에서도 경계·청크 좌표 검사가 통과한다

---

## TASK-004 블록 정의

의존: TASK-002

작업:

```text
src/game/data/blocks.ts
MVP_SPEC 8.1 의 22 종을 그대로 정의한다
BlockDefinition { id, name, kind, solid, opaque, terrain, breakSeconds, drops }
헬퍼: isSolid / isOpaque / isWallBlock / isFurniture / isTerrain
```

Acceptance Criteria:

- [x] 공기 제외 22종, 공기 포함 23개가 id 0~22로 연속이다
- [x] `isWallBlock` 이 plank / stone_brick / window / door 만 true 를 반환한다
- [x] `isWallBlock(dirt)` 가 false 다 — MVP_SPEC 8.4
- [x] bedrock / water / bell 의 `breakSeconds` 가 `null` 이다
- [x] leaves 회수 1개와 씨앗 25% 추가 드롭, 다중 칸 객체의 단일 아이템 드롭이 정의된다

---

## TASK-005 greedyMesh — 순수 함수 ★

의존: TASK-004

작업:

```text
src/workers/greedyMesh.ts
입력: 18³ padded Uint16Array + BlockDefinition[]
출력: MeshData (positions / normals / uvs / ao / indices)
면 컬링 + 그리디 병합 + 정점 AO
불투명 / 반투명 분리
```

Acceptance Criteria:

- [x] 전부 air 인 청크가 정점 0 개를 만든다
- [x] 단일 블록 하나가 정확히 6 면 24 정점을 만든다
- [x] 2 × 1 × 1 로 붙은 같은 블록에서 맞닿은 2 면이 컬링되어 보이는 면이 10 개다
- [x] 주변 장애물이 없고 재질·AO가 같은 두 블록의 10면이 **쿼드 6개**로 병합된다
- [x] 경계(padded 의 바깥 1 칸)가 불투명이면 해당 면이 생성되지 않는다
- [x] `three` 를 import 하지 않는다
- [x] Worker 없이 Vitest 에서 직접 호출된다
- [x] AO 유무의 정점 수를 따로 측정하고 면 컬링과 그리디 병합의 감소량을 구분한다

---

## TASK-006 Worker 메싱 파이프라인

의존: TASK-005, TASK-003

시각 검증 준비: 2.7에 따라 최소 Renderer/materials 연결과 고정 편집 fixture를 함께
마련한다. TASK-007은 이 모듈을 이어서 완성한다. TASK-013의 플레이어 편집을 기다리지 않는다.

작업:

```text
src/workers/mesher.worker.ts  (배선만)
src/render/ChunkMeshManager.ts
18³ padded 뷰를 잘라서 transferable 로 넘긴다
결과를 프레임당 chunkUploadsPerFrame 개까지 GPU 에 올린다
```

Acceptance Criteria:

- [x] 청크 경계에서 떨어진 내부 블록 하나를 바꾸면 해당 청크만 다시 메싱된다
- [x] 경계 블록을 바꾸면 인접 청크도 다시 메싱된다
- [x] 청크 경계에 구멍이 보이지 않는다
- [x] 블록을 빠르게 연속으로 놓아도 프레임이 끊기지 않는다
- [x] `mesher.worker.ts` 에 메싱 알고리즘이 없다
- [x] Worker 결과가 역순 도착해도 최신 meshRevision의 메시만 표시된다
- [x] 처리 중 인접 청크 변경과 연속 편집에서 오래된 결과가 dirty를 해제하지 않는다
- [x] transferable에 월드 원본 배열을 넘기지 않는다

---

## TASK-007 Renderer 와 materials

의존: TASK-006

작업:

```text
src/render/Renderer.ts — WebGLRenderer / Scene / 카메라
src/render/materials.ts — 재질 생성은 여기 한 곳에만
텍스처 아틀라스 1 장 (플레이스홀더. 블록당 단색이어도 된다)
방향광 + 앰비언트
```

Acceptance Criteria:

- [x] 청크 메시가 화면에 보인다
- [x] 블록 종류가 색으로 구분된다
- [x] 반투명 블록(water / window)이 뒤가 비쳐 보인다
- [x] `ShaderMaterial` / `MeshStandardMaterial` 생성이 `materials.ts` 밖에 없다
- [x] 정점 AO 가 적용되어 모서리가 어둡다
- [x] 단색 플레이스홀더라도 함께 놓인 블록의 팔레트가 어울린다. 작은 집 fixture에서 벽·바닥·문·창문과 기존 블록 지붕의 형태가 읽히는지 기록한다. 지붕은 선택이며 새 블록을 만들지 않는다

---

## TASK-008 섬 생성

의존: TASK-007

구현 전: READY-01을 확정한다. MVP_SPEC 14장의 채석장 재생 후보 좌표·점유 보호 정책을 명세화한다. 시간 연동은 TASK-023에서 한다.

작업:

```text
src/game/data/island.ts
128 × 64 × 128 고정 지형 생성 함수
MVP_SPEC 7.4 의 5 개 영역 + 바다
마을 터의 폐허 (부서진 판자벽 / 기초)
마을의 종 1 개
나무 24 그루
```

Acceptance Criteria:

- [x] 섬이 생성되어 화면에 보인다
- [x] 숲 / 채석장 / 물가 / 마을 터를 눈으로 구분할 수 있다
- [x] 마을의 종이 `(64, 지표면, 64)` 에 있다 — 지표면 기준은 MVP_SPEC 7.4 (`surfaceY + 1`, 광장 지면 위)
- [x] 나무가 24 그루다. 그루당 `log` 4 / `leaves` 20 (MVP_SPEC 7.4)이며 실제 총량을 기록한다
- [x] 생성이 결정적이다. 두 번 실행해도 같은 섬이 나온다
- [x] 생성 시간이 1 초 이하다
- [x] MVP_SPEC 36장의 기준 장치·브라우저·DPR·시험 장면을 docs/state에 기록한다

---

# Phase B. 플레이어

## TASK-009 복셀 충돌

의존: TASK-003

구현 전: READY-06을 확정한다. 물·월드 경계·발판 상실 시의 이동과 복귀 정책을 MVP_SPEC 7/9와 ARCHITECTURE 8에 반영하고 TASK-010/013의 연결 검증도 명시한다.

작업:

```text
src/game/voxel/collision.ts
AabbBody + moveWithCollision (축 분리 스윕)
step-up (1.0 이하 턱 자동 오르기)
이동 거리 0.4 초과 시 분할
```

Acceptance Criteria:

- [x] 벽으로 걸어가면 멈춘다. 관통하지 않는다
- [x] 높이 1 블록 턱을 자동으로 오른다
- [x] 높이 2 블록 턱은 오르지 못한다
- [x] 빠르게 낙하해도 바닥을 관통하지 않는다 (속도 -30 테스트)
- [x] 1 칸 폭 통로를 통과할 수 있다 (폭 0.6)
- [x] 가짜 `VoxelWorld` 로 테스트한다
- [x] 수평 월드 밖과 y < 0 이 고체로 막힌다 (MVP_SPEC 9.5)

---

## TASK-010 플레이어 이동

의존: TASK-009

작업:

```text
InputSystem (WASD / Shift / Space / 마우스)
Player 엔티티 + 이동 / 점프 / 중력
포인터 락
```

Acceptance Criteria:

- [x] WASD 로 카메라 기준 방향으로 이동한다
- [x] Shift 로 달린다
- [x] Space 로 점프하고 한 칸 블록 위로 올라갈 수 있다
- [x] 캔버스 클릭으로 포인터 락이 걸리고 Esc 로 풀린다 — 락 상태 처리는 단위 테스트, 실제 창의 락은 headless 에서 걸리지 않아 [HR-005](HUMAN_REVIEW.md) 대기
- [x] 탭을 백그라운드에 뒀다 돌아와도 바닥을 뚫지 않는다 (dt 클램프)
- [x] 바다·연못에 들어가면 마지막 안전 지면으로 복귀하고, 그 칸이 무효면 시작 위치 위의 안전 지면으로 간다 (READY-06)
- [x] 높은 곳에서 떨어져도 피해 없이 착지하고, 블록에 끼면 위로 가장 가까운 빈 자리로 올라간다

---

## TASK-011 3인칭 카메라

의존: TASK-010, TASK-012

작업:

```text
src/render/CameraController.ts
거리 5.0. 피치 -80° ~ +60°
카메라가 블록에 막히면 거리를 줄인다 (raycast)
```

Acceptance Criteria:

- [x] 마우스로 캐릭터 주위를 돈다
- [x] 벽에 붙어도 카메라가 벽을 뚫고 나가지 않는다
- [x] 위아래 시야가 제한 각도에서 멈춘다
- [x] 실내에 들어가도 카메라가 벽 밖으로 나가지 않는다
- [x] 투명한 window도 카메라 충돌을 막는다

---

## TASK-012 레이캐스트와 조준

의존: TASK-007, TASK-010

작업:

```text
src/game/voxel/raycast.ts — 복셀 DDA
src/render/Highlight.ts — 조준 블록 테두리 표시
```

Acceptance Criteria:

- [x] 바라보는 블록에 테두리가 그려진다
- [x] 5.0 보다 먼 블록은 선택되지 않는다
- [x] 어느 면을 보고 있는지 `face` 가 올바르다 (설치 위치가 맞다)
- [x] 대각선으로 볼 때도 블록을 건너뛰지 않는다
- [x] DDA 에 대한 단위 테스트가 있다

---

## TASK-013 블록 파괴와 설치

의존: TASK-012, TASK-014

구현 전: READY-02를 확정한다. MVP_SPEC 10장에서 가구·장식의 설치 후 지지면 제거 정책을 확정한다. 물리 엔진이나 복셀 중력을 임의로 도입하지 않는다.

작업:

```text
BlockEditSystem
좌클릭 유지 → 파괴 진행도 → 파괴 + drops
우클릭 → 설치. MVP_SPEC 10.4 의 블록별 규칙
파괴 진행 균열 표시 8 단계
```

Acceptance Criteria:

- [x] 블록마다 파괴 시간이 다르다 (dirt 0.6 / stone 1.5 / stone_brick 2.0)
- [x] 파괴 중 다른 블록을 보면 진행도가 0 이 된다
- [x] bedrock / water / bell 이 파괴되지 않는다
- [x] 플레이어 AABB 와 겹치는 위치에 설치되지 않는다
- [x] `bed` 가 수평 2 칸을 차지하고, 두 칸이 비어 있어야만 놓인다
- [x] `farmland` 는 아래가 고체일 때만 놓인다
- [x] 파괴 균열이 진행도에 따라 보인다
- [x] door 아이템 하나가 수직 2칸을 차지하며 주민에게 두 칸 통로를 제공한다
- [x] 침대 방향과 객체 id가 보존된다. 어느 점유 칸을 부숴도 전체 제거와 드롭 1개가 원자적이다
- [x] 두 침대를 붙여 놓아도 별개 객체로 판정한다
- [x] 단일 칸·다중 칸 모두 인벤토리 부족·점유 충돌·편집 실패 시 블록·아이템·PlacementIndex가 바뀌지 않는다
- [x] 단일 칸에도 NPC AABB 점유 검사를 적용하고, 변경 알림 구독자는 아이템과 블록이 함께 확정된 상태만 읽는다
- [x] 플레이어가 발밑 블록을 부수면 그대로 떨어진다 (READY-06)
- [x] 침대·문·torch 의 지지면을 부숴도 그 객체는 그대로 남고 드롭은 부순 블록 것뿐이다 (READY-02)

---

## TASK-014 인벤토리와 핫바

의존: TASK-012

작업:

```text
InventorySystem (핫바 9 / 가방 27 / 스택 64)
src/ui/Hotbar.ts — DOM
1~9 / 휠 선택
```

Acceptance Criteria:

- [x] 드롭 추가 API로 블록이 인벤토리에 들어간다 (파괴 연동은 TASK-013)
- [x] 64 를 넘으면 다음 칸으로 넘어간다
- [x] 핫바 선택이 숫자키와 휠로 바뀐다
- [x] 설치 소비 API가 1개를 차감하고 0개면 거부한다 (설치 연동은 TASK-013)
- [x] UI 가 `three` 를 import 하지 않는다

---

## TASK-015 제작

의존: TASK-013

구현 전: READY-03을 확정한다. MVP_SPEC 20/29장에서 인벤토리·종·대사·메뉴의 시간·입력 처리 정책을 일치시킨다.

작업:

```text
src/game/data/recipes.ts — MVP_SPEC 8.5
src/game/data/unlocks.ts의 레벨별 정적 표 — MVP_SPEC 23.2 (초기 레벨 1 조회)
CraftingSystem
src/ui/InventoryPanel.ts — E 로 열기
해금되지 않은 레시피는 회색 + 필요 레벨 표시
MVP_SPEC 9.2/29의 Esc 메뉴와 모달 입력 경계. READY-03에서 확정한 시간 정책 적용
```

Acceptance Criteria:

- [x] `log × 1 → plank × 4` 가 동작한다
- [x] 재료가 부족하면 제작 버튼이 비활성이다
- [x] 해금되지 않은 레시피가 **숨겨지지 않고 회색으로 보인다**
- [x] 회색 레시피에 "마을 레벨 2 필요" 가 표시된다
- [x] 제작 재료가 `blocks.ts` 에 존재하는 블록으로만 구성되어 있다
- [x] 레벨 1에서 화덕·물통·침대 제작이 가능하고, 잎 회수부터 침대 제작까지 디버그 없이 이어진다
- [x] E/인벤토리·Esc/메뉴의 열기·닫기와 포인터 락 복귀가 READY-03에서 확정한 명세를 따른다. 클릭 관통과 눌린 키 잔류가 없다 — 상태 전이·입력 차단은 단위 테스트, 실제 창의 락 복귀는 [HR-005](HUMAN_REVIEW.md) 대기

---

## TASK-016 디버그 패널

의존: TASK-013

작업:

```text
DebugSystem + src/ui/DebugPanel.ts (F3)
ARCHITECTURE 26 장의 표시 항목
디버그 명령: 블록 무제한. 시간 배속은 TASK-023에서 연결 (그 전 비활성)
```

Acceptance Criteria:

- [x] F3 로 열고 닫힌다
- [x] FPS / 드로우콜 / 청크 상태가 보인다
- [x] 블록 무제한 모드에서 재료 없이 설치된다
- [x] 프로덕션 빌드에서도 동작한다 (개발 중 계속 쓴다)

---

# Phase C. 방 인식 ★

## TASK-017 buildTestWorld 헬퍼

의존: TASK-004, TASK-003

작업:

```text
tests/helpers/buildTestWorld.ts
문자열 레이어로 3D 블록 배열을 만든다
ARCHITECTURE 25.1 의 형식
```

Acceptance Criteria:

- [x] 문자열 레이어에서 `RoomBlockReader` 를 만든다
- [x] `#` = plank, `.` = air, `D` = door, `B` = bed, `T` = table, `C` = chair 를 지원한다
- [x] 레이어 개수가 y 높이가 된다
- [x] 헬퍼 자체에 대한 테스트가 있다

**이 Task 를 건너뛰지 않는다.** 이것이 없으면 방 테스트를 아무도 쓰지 않는다.
- [x] 기본 바닥은 자동 생성하지 않는다. 성공 fixture는 바닥 레이어를 명시한다
- [x] D는 수직 쌍의 문 객체로 생성한다. B는 명시한 anchor/facing으로 침대 객체를 생성한다
- [x] 잘못된 점유·메타데이터 fixture는 오류를 낸다

---

## TASK-018 detectRoom ★

의존: TASK-017

작업:

```text
src/game/room/detectRoom.ts
MVP_SPEC 11.2 / 11.3 의 조건과 알고리즘
RoomFailure 6 종. 좌표를 포함한다
```

Acceptance Criteria:

- [x] 5 × 5 판자방 + 문 1 개가 성공한다
- [x] 평지의 벽 구멍은 `TOO_LARGE` 또는 `NOT_ENCLOSED`로 종료하고 탐색 영역·경로를 남긴다
- [x] 문이 없으면 `NO_DOOR` 다
- [x] 벽이 1 칸 높이면 `WALL_TOO_LOW` + 좌표다
- [x] 바닥에 구멍이 있으면 `NO_FLOOR` + 좌표다
- [x] 2 × 1 공간은 `TOO_SMALL` 이다
- [x] 내부 바닥 11 × 11 공간은 `TOO_LARGE` 다
- [x] **dirt 로만 둘러싸인 공간은 `NOT_ENCLOSED` 다** (MVP_SPEC 8.4)
- [x] 열린 공간에서 시작하면 `TOO_LARGE` 또는 `NOT_ENCLOSED` 로 종료된다. 무한 루프가 없다
- [x] `VoxelWorld` 가 아니라 `RoomBlockReader` 를 받는다
- [x] 고체 가구를 놓아도 방 형태가 유지되고 점유 칸이 바닥 면적에 포함된다
- [x] 문은 비고체보다 먼저 경계로 처리한다

---

## TASK-019 방 레시피

의존: TASK-018

작업:

```text
src/game/data/roomRecipes.ts — MVP_SPEC 12.1 의 5 종
src/game/room/matchRecipe.ts
RoomFacilities 계산 (beds / cookingSpots / diningSeats / chests)
```

Acceptance Criteria:

- [x] 침대 1 개 → `Bedroom`
- [x] 화덕 + 물통 → `Kitchen`
- [x] 식탁 + 인접 의자 2 개 → `DiningRoom`
- [x] 상자 → `Storeroom`
- [x] 아무것도 없으면 `EmptyRoom`
- [x] 침대와 화덕+물통이 같이 있으면 `Kitchen` 이다 (priority 30 > 20)
- [x] **벽 틈에 낀 침대는 `facilities.beds` 에 들어가지 않고 `Bedroom` 도 아니다**
- [x] 식탁에서 떨어진 의자는 `diningSeats` 가 아니다
- [x] `facilities` 가 좌표 목록을 들고 있다 (타입만 반환하지 않는다)
- [x] 가구 옆 머리 공간이 막히거나 문과 단절되면 접근 가능한 시설에 포함하지 않는다
- [x] 접근 셀과 사용 위치가 구분되며 고체 가구 자체를 A* 목적지로 쓰지 않는다
- [x] 높은 priority로 타입이 바뀌면 이전 타입 시설은 비활성화된다

---

## TASK-020 RoomRegistry 와 재판정

의존: TASK-019, TASK-013, TASK-027

작업:

```text
src/game/room/RoomRegistry.ts
markDirty / processQueue(budgetMs) / findContaining / getByType
RoomSystem — GameWorld.update 5 번 자리
BLOCK_CHANGED 를 구독해 markDirty
```

Acceptance Criteria:

- [x] 블록을 놓으면 몇 프레임 안에 방이 인식된다
- [x] 벽을 부수면 방 인식이 해제된다
- [x] 재판정이 프레임당 3ms 를 넘지 않는다 (디버그 패널로 확인)
- [x] 블록을 빠르게 연속으로 놓아도 큐가 밀리지 않는다
- [x] 같은 방이 큐에 중복으로 들어가지 않는다
- [x] 월드 전체 스캔이 발생하지 않는다 (로드 시 제외)
- [x] 문부터 설치하고 멀리 있는 마지막 벽을 막아도 인식된다
- [x] 해제된 방의 먼 벽을 복구하면 재인식된다
- [x] 바닥·둘째 층 벽·머리 공간 변경이 재판정에 반영된다
- [x] 같은 방의 여러 문은 방 하나로, 공유 문 양쪽의 서로 다른 방은 둘로 등록된다
- [x] 탐색 중 변경된 결과는 버리고 재시작한다. dirty 시설은 신규 예약·완료 보상에서 제외한다

---

## TASK-021 방 표시와 연출

의존: TASK-020

작업:

```text
src/render/RoomLabelView.ts — 월드 공간 라벨
인식 시 경계가 한 번 빛난다
해제 시 붉게 깜빡이고 라벨이 사라진다
방 인식·해제의 최소 효과음. TASK-050에서 최종 음질·전체 오디오를 완성한다
```

Acceptance Criteria:

- [x] 인식된 방 위에 이름이 보인다
- [x] 거리에 따라 페이드된다
- [x] 인식 순간 경계가 빛난다
- [x] 인식·해제 시 구별되는 효과음이 난다. TASK-022의 첫 인식 피드백을 무음으로 평가하지 않는다
- [x] 해제 순간 경고 연출이 나온다
- [x] 방이 여러 개여도 라벨이 겹쳐서 읽을 수 없게 되지 않는다

---

## TASK-022 방 진단 모드 ★ — 분기점 1

의존: TASK-021

작업:

```text
src/ui/RoomDiagnosticPanel.ts — Tab 토글
플레이어 위치에서 강제 flood fill → RoomFailure 표시
확인된 실패 좌표 또는 열린 탐색 영역·경로를 붉게 하이라이트
인식된 방은 초록 경계
```

Acceptance Criteria:

- [x] Tab 으로 켜고 끈다
- [x] 열린 평지에서는 탐색 영역·경로와 “공간이 열려 있거나 너무 큽니다”가 표시된다
- [x] "문이 없습니다" 같은 사유 문구가 보인다
- [x] 문을 아직 안 단 공간도 진단된다 (door 없이 플레이어 위치에서 시작)
- [x] 진단이 자동 큐보다 먼저 시작하고 공통 3ms 예산 안에서 이어서 수행된다
- [x] 바닥 구멍·낮은 벽·지형 경계는 실제 확인한 좌표와 사유를 표시한다
- [x] 가구 접근 실패를 진단한다. 구멍 위치를 추측해 정답으로 표시하지 않는다
- [x] 흙집·주방에 침대 추가·같은 높이 제한 사례를 플레이어가 이해하는지 기록한다 ([G1 기록](../state/2026-09-23_1400-task-022-gate-g1-passed.md))

구현 AC 는 자동 테스트·headless 관찰로 확인했다(2026-09-23). 아래 판단은 사람의 플레이 관찰이 필요하며
[HUMAN_REVIEW 4장 G2](HUMAN_REVIEW.md#4-재미-검증-게이트--이-목록으로-미루지-않는다)에 절차·질문지를 준비했다. G2 는 2026-09-23 통과했다([기록](../state/2026-09-23_2309-task-033-gate-g2-passed.md)). Q6 애매(애니메이션 부족, 지금은 추가하지 않음)와 Q8 의 어색한 점은 개선 대상으로 기록했다.

**여기서 멈추고 판단한다.**

```text
Q  5 × 5 방을 만들고 인식시키는 과정이 즐거웠는가
Q  인식되지 않았을 때 이유를 진단만으로 알 수 있었는가
Q  실패가 짜증이 아니라 퍼즐로 느껴졌는가
Q  기존 블록과 가구로 내 취향에 맞게 공간을 더 가꾸고 싶은가
Q  기능이나 보상과 상관없이 방이나 집을 조금 더 예쁘게 꾸미고 싶은가
```

부정적이면 판정·진단 문제와 감성·표현 문제를 나눠 2.1에 따라 개선하고 다시 한다.
작은 집의 실루엣·팔레트·가구 배치와 더 꾸미고 싶었던 이유를 `docs/state/`에 기록한다.
**Phase D 로 넘어가지 않는다.**

---

# Phase D. 시간과 이동

## TASK-023 게임 시계

의존: TASK-002, TASK-008

구현 전: READY-04 확정 (2026-09-23, [MVP_SPEC 14.3](MVP_SPEC.md#143-채석장-재생-시각과-당일-처리-키-ready-04)). 채석장 재생을 이 Task에서 시계와 연결한다.

작업:

```text
GameClockSystem — secondsPerGameHour 25
DayPhase 6 종 + 전이 이벤트
디버그 배속 1× / 4× / 16×, 시각 강제 설정(앞으로만)
QuarryRespawnSystem — 05:00 경계에서 selectQuarryRespawnCells 8 칸 (READY-04)
게임 시간 HUD (MVP_SPEC 29: 우측 상단 Day N / HH:MM)
```

Acceptance Criteria:

- [x] 1 게임일이 실시간 600 초다
- [x] DayPhase 가 MVP_SPEC 20.1 대로 전이한다
- [x] 전이할 때만 `DAY_PHASE_CHANGED` 가 발행된다
- [x] 디버그 배속이 동작한다
- [x] `gameMinutes` 단일 누적값으로 시간을 표현한다
- [x] 채석장은 05:00 경계를 넘을 때 하루 한 번 최대 8 칸 복구한다. 같은 날 다시 넘거나 배속·강제 설정으로 여러 경계를 넘어도 중복되지 않는다 (MVP_SPEC 14.3)
- [x] 캐릭터가 선 후보 칸은 건너뛰고, 후보가 모자라면 있는 만큼만 복구한다. BLOCK_CHANGED 의 by 는 `'world'` 다
- [x] respawnedThroughDay 를 snapshot / restore 할 수 있고 복원 뒤 같은 날을 다시 처리하지 않는다 (실제 저장 왕복은 TASK-051)

---

## TASK-024 통행 그래프

의존: TASK-003, TASK-019

작업:

```text
src/game/nav/NavigationGraph.ts
isStandable — voxel/occupancy.ts를 room과 공유. 발밑 고체 + 발·머리 비고체
neighbors — 4 방향 × (같은 높이 / +1 / -1)
ActorKind 로 door 처리 분기
invalidate — 실제 읽은 셀의 역참조 (step-up 머리 공간까지)
```

Acceptance Criteria:

- [x] 평지에서 4 방향 이웃이 4 개다
- [x] 1 칸 턱을 오르는 이웃이 포함된다
- [x] 2 칸 턱은 이웃이 아니다
- [x] 2 칸 낙차는 이웃이 아니다
- [x] `door` 가 `'npc'` 에게는 통행 가능, `'monster'` 에게는 불가다
- [x] `ActorKind` 에 기본값이 없다 (생략하면 컴파일 에러)
- [x] 디버그 모드에서 통행 가능 셀을 시각화할 수 있다
- [x] step-up 출발·도착 중 머리 공간 변경도 이웃 캐시와 경로를 즉시 무효화한다

---

## TASK-025 A* 경로탐색

의존: TASK-024

작업:

```text
src/game/nav/pathfind.ts
프레임 전체 확장 예산 4000. NODE_LIMIT이면 탐색 세션을 이어서 실행
PathResult 에 reason ('NO_PATH' / 'NODE_LIMIT')
```

Acceptance Criteria:

- [x] 직선 경로를 찾는다
- [x] 벽을 우회한다
- [x] 계단(1 칸씩 쌓은 블록)을 오른다
- [x] 완전히 막히면 `reason: 'NO_PATH'` 다
- [x] 노드 상한을 넘으면 `reason: 'NODE_LIMIT'` 다
- [x] **두 reason 이 구분된다** — 몬스터가 이걸로 판단한다
- [x] 64 칸 거리 탐색이 5ms 이하다
- [x] 반경 목표는 고체 종이 아니라 반경 안의 통행 가능한 셀에서 성공한다
- [x] NODE_LIMIT의 partialPath는 검증된 셀만 포함한다
- [x] 4000노드보다 큰 막힌 영역도 세션을 이어서 탐색해 NO_PATH로 종료한다
- [x] NO_PATH의 reachableBoundary에는 실제 접근 경로가 있는 장애물만 들어간다
- [x] 여러 NPC 요청이 4000 확장 예산을 공유하고 대기 요청이 굶지 않는다

---

## TASK-026 이동 제어

의존: TASK-025, TASK-009

작업:

```text
MovementController — 경로 추종
경로 무효화 / 재계산 (최소 간격 0.5 초)
'blocked' 연속 3 회 시 재계산
```

Acceptance Criteria:

- [x] 경로를 따라 부드럽게 이동한다
- [x] 경로 위의 블록을 부수면 재계산한다
- [x] 두 캐릭터가 문 앞에서 겹쳐도 프레임이 떨어지지 않는다
- [x] 재계산이 0.5 초 간격 제한을 지킨다
- [x] 목적지에 도착하면 `'arrived'` 를 반환한다

---

## TASK-027 월드 골격

의존: TASK-002

작업:

```text
EventBus (타입 안전)
EntityRegistry
VillageStorage (seed / crop / food)
GameWorld와 update 16슬롯. 아직 없는 시스템은 빈 슬롯이며 후속 Task에서 연결한다
```

Acceptance Criteria:

- [x] `EventBus.emit` 에 잘못된 payload 를 넣으면 컴파일 에러다
- [x] `on` 이 구독 해제 함수를 반환한다
- [x] `GameWorld.update` 슬롯 순서가 ARCHITECTURE 4.1과 일치하고 추가 시스템도 그 자리에 연결된다
- [x] `VillageStorage` 변경 시 `STORAGE_CHANGED` 가 발행된다
- [x] 초기 `seed` 가 3 이다
- [x] update 슬롯은 순서를 규정한다. NPC 판단·Action 실행·렌더의 호출 책임이 분리되어 후속 갱신 주기를 바꿀 수 있다 (ARCHITECTURE 3.2)

---

## TASK-028 NPC 골격

의존: TASK-027, TASK-026

작업:

```text
NPC 엔티티 (순수 데이터)
NPCFactory
Action 인터페이스 + IdleAction / MoveAction
src/render/EntityView.ts (단순 형태로 시작하되 주민 구분·방향·걷기 자세를 표현)
```

Acceptance Criteria:

- [x] 주민 3 명이 마을에 서 있다
- [x] `NPC` 가 `three` 를 import 하지 않는다
- [x] `MoveAction` 으로 지정 좌표까지 걸어간다
- [x] 디버그 패널에 각 NPC 의 현재 Action label 이 보인다
- [x] `npc.state` 같은 필드가 없다 (ADR 008)
- [x] 주민 수를 고정하지 않는다. 게임 진행과 분리한 registry fixture에 100개의 고유 NPC id를 등록·조회·제거할 수 있다 (생활·성능 검증과 별개)
- [x] 같은 주민을 외형으로 알아볼 수 있고, 정지와 걷기가 라벨 없이 구별된다. TASK-033까지 정감 있는 실루엣을 다듬는다
- [x] MoveAction은 경로 요청이 끝날 때까지 대기하고, 경로 취소·실패를 처리한다. 동기 응답을 전제하지 않는다

---

## TASK-029 판단과 시간표

의존: TASK-028, TASK-023

작업:

```text
NPCDecisionSystem — 우선순위 5 단계 (순수 함수)
NPCContext 조립
MVP_SPEC 19.5 의 시간표
```

Acceptance Criteria:

- [x] `decideAction` 이 순수 함수다. 아무것도 바꾸지 않는다
- [x] 우선순위가 위에서 아래로 한 번만 평가된다
- [x] 시간대가 바뀌면 행동이 바뀐다
- [x] 아직 밭 / 주방 / 침대가 없으므로 대부분 Idle 이다 (정상)
- [x] 우선순위 5 단계 전부에 대한 테스트가 있다
- [x] Context 가 전부 `readonly` 다
- [x] 순수 snapshot에 가변 Action·시스템을 노출하지 않는다. 기절 중에는 새 Action을 시작하지 않는다
- [x] Context가 방 전체·피해 전체 목록을 담지 않는다. ARCHITECTURE 14장의 `NPCCandidates` 형태로 소유 시스템이 좁힌 후보만 받는다 (이 단계에서는 전부 null이어도 된다)

---

# Phase E. 주민 생활 ★

## TASK-030 농사와 농부

의존: TASK-033, TASK-PERF-001, TASK-020

작업:

```text
FarmSystem — crop 표시 3단계 각각 4시간. 12시간 경과 시 성숙
PlantAction / HarvestAction
farmland 파괴 시 crop 정리
```

결과: [TASK-030 기록](../state/2026-09-24_0330-task-030-farming.md), [ADR 030](../adr/030-farming-candidates-claims-and-crop-view.md). 밭 4칸 시나리오 전체(씨앗 기부)는 TASK-036 에서 확인한다.

Acceptance Criteria:

- [x] `farmland` 를 깔면 농부가 걸어간다
- [x] 씨앗을 심으면 `storage.seed` 가 1 준다
- [x] 게임 시간 12 시간 뒤 수확 가능해진다
- [x] 수확하면 `crop +1`, `seed +1` 이다
- [x] 성장이 농부와 무관하게 진행된다
- [x] `farmland` 를 부수면 위의 `crop` 도 사라진다
- [x] `seed` 가 0 이면 심지 않고 다른 행동을 한다
- [x] 8시간의 stage=2는 미성숙이며 12시간에만 수확된다
- [x] 성숙 작물 수확·재파종을 우선하고 role 시간 밖에는 작업하지 않는다
- [x] 씨앗은 정상 수확에서만 돌아오며 작물 파괴로 잃은 씨앗은 채집으로 보충한다
- [x] FarmSystem이 밭·성숙 후보를 변경/성장 시각으로 갱신한다. 주민마다 월드 전체를 훑지 않는다
- [x] 걷기와 심기·수확의 작업 동작이 시각적으로 구별된다
- [x] 초기 `seed` 3개와 디버그 투입으로 검증한다. 플레이어의 씨앗 기부 경로는 TASK-036에서 연결되므로 MVP_SPEC 28 Phase 1의 밭 4칸 시나리오 전체를 이 Task에서 통과했다고 하지 않는다

---

## TASK-031 요리와 요리사

의존: TASK-030

작업:

```text
CookingSystem — crop 2 → food 3, 1 게임시간
CookAction — Kitchen 의 cookingSpots 로 이동
```

결과: [TASK-031 기록](../state/2026-09-24_1740-task-031-cooking.md), [ADR 031](../adr/031-cooking-stove-claims-and-ingredient-reservation.md). 감사 포인트 +3 은 GratitudeSystem(TASK-035) 에서 연결한다. 조리 자세의 사람 판단은 HR-014.

Acceptance Criteria:

- [x] `Kitchen` 이 인식되어 있어야 요리한다
- [x] `crop` 이 2 미만이면 요리하지 않는다
- [x] 1 게임시간 뒤 `crop -2`, `food +3` 이다
- [x] `Kitchen` 이 없으면 `crop` 이 쌓이기만 한다 (게임이 멈추지 않는다)
- [x] 요리 중 주방이 해제되면 Action 이 취소된다
- [x] 시작 시 재료를 예약하고 완료 때 소비한다. 중단·로드로 재료를 잃거나 음식을 복제하지 않는다
- [x] 식사를 못 했어도 다음 역할 시간에 요리할 수 있다
- [x] 저장소·시설·역할 시간 변경으로 조리 후보를 갱신하고 시설·재료 예약을 재검증한다. 음식 부족 조건을 새로 넣지 않는다
- [x] 화덕을 사용하는 조리 동작이 이동·대기와 구별된다

---

## TASK-032 식사

의존: TASK-031

작업:

```text
MealSystem — 12:00 / 18:00
EatAction — DiningRoom 의 chair 또는 광장
hasEatenThisMeal 리셋
요리사가 식탁에 음식 오브젝트를 올리는 연출
```

결과: [TASK-032 기록](../state/2026-09-24_1750-task-032-meal.md), [ADR 032](../adr/032-meal-seats-facility-claims-and-dishes.md). 음식은 주민이 앉을 때 그 앞 식탁 위에 나타난다(요리사의 배식 동작은 두지 않음, ADR 032 결정 6). 감사 포인트 +2 는 TASK-035. 사람 판단은 HR-015.

Acceptance Criteria:

- [x] 12:00 에 주민들이 식사하러 이동한다
- [x] `DiningRoom` 이 있으면 의자에 앉는다
- [x] 없으면 광장에서 먹는다
- [x] `food` 1 이 소비된다
- [x] `food` 가 0 이면 먹지 않고 넘어간다. 게임이 멈추지 않는다
- [x] 같은 끼니에 두 번 먹지 않는다
- [x] 식탁 위 음식이 연출 오브젝트이고 블록이 아니다
- [x] 같은 의자를 동시에 예약하지 않는다. 경로 실패·취소 시 시설 예약을 해제한다
- [x] 앉아서 먹는 동작이 취침·대기와 구별되고 가구·음식 연출이 주민을 가리지 않는다

---

## TASK-SHAPE-001 기존 블록의 모양 표현

의존: TASK-032, TASK-005, TASK-006

사용자 결정(2026-09-24, [ADR 028](../adr/028-shaped-rendering-of-existing-blocks.md))으로 추가했다. 새 블록·규칙이 아니라 기존 블록의 렌더 모양이다.

구현 전: ADR 028 에 방식(메셔 모양 표 / 모형)·AO·면 컬링·성능 기준을 보완하고 아래 AC 를 구체화한다. → 2026-09-24 보완([ADR 028 보완](../adr/028-shaped-rendering-of-existing-blocks.md#보완-구현-방식-2026-09-24-task-shape-001-착수-전)).

작업:

```text
torch / window / table / chair / chest / cooking_stove / water_pot / crop / bell 의 비정육면체 모양
식사·조리 사용 자세(TASK-031 / 032)와 가구 모양을 맞춘다
```

결과: [TASK-SHAPE-001 기록](../state/2026-09-24_1830-task-shape-001-block-shapes.md). 모양 표 `src/game/data/blockShapes.ts`, 메셔 `src/workers/greedyMesh.ts`. 사람 판단은 HR-016.

Acceptance Criteria:

- [x] 충돌·통행·방 판정·설치·드롭 테스트가 바뀌지 않고 모두 통과한다
- [x] 모양 블록을 많이 놓아도 청크 드로우콜이 늘지 않는다(모양 표 방식이면 청크 메시 안에 포함)
- [x] 브라우저에서 가구 모양·주민 사용 자세를 확인하고, 사람 확인은 HUMAN_REVIEW 에 올린다
- [x] 모양 블록은 이웃 면을 가리지 않고, 불투명 블록에 붙은 모양 상자 면만 지운다(메셔 테스트)
- [x] window 판유리 방향과 chair 등받이 방향이 이웃 규칙(ADR 028 보완 2)을 따른다(메셔 테스트)
- [x] 바닥 한 층을 모양 블록으로 채운 청크의 Node 메싱이 20 ms 미만이고 버퍼가 두 벌을 넘지 않는다
- [x] 의자 앉는 높이·화덕 높이에 사용 자세(식사·조리)가 맞는다(브라우저 관찰, HR)

---

## TASK-033 취침 ★ — 분기점 2

의존: TASK-029, TASK-020, TASK-034

작업:

```text
SleepSystem — 침대 배정 / 해제
SleepAction (침대) / RestAction (광장) — 별개의 Action
침대 파괴 시 깨어남. 농사·요리·식사 없이 기존 디버그 시험 월드로 먼저 검증
```

Acceptance Criteria:

- [x] 20:00 에 주민이 배정된 침대로 걸어간다
- [x] 침대에 눕는 자세가 보인다
- [x] 05:00 에 일어나 방에서 나온다
- [x] 침대가 주민 수보다 적으면 남는 주민이 광장에서 `RestAction` 을 한다
- [x] `SleepAction` 과 `RestAction` 이 별개의 클래스다
- [x] 자고 있는 주민의 침대를 부수면 깨어나고 배정이 해제된다
- [x] 방이 해제되면 그 방의 배정이 전부 풀린다
- [x] 한 주민·침실·침대로 핵심 장면을 먼저 확인한 뒤 주민 세 명으로 배정 충돌을 확인한다
- [x] 침대는 SleepSystem만 소유한다. NPC 엔티티에 별도 배정 상태를 저장하지 않는다
- [x] 방 타입이 바뀌거나 같은 타입에서 침대 하나만 없어져도 해당 배정을 해제한다
- [x] 실제 접근 경로가 없으면 다른 침대 또는 RestAction을 선택한다
- [x] 사용 자세는 렌더에서 표시하고 body.pos는 접근 셀에 유지한다. 취침 취소·기상 후 고체 침대 안에서 이동을 시작하지 않는다

**여기서 멈추고 판단한다.**

```text
Q  밤이 되어 주민이 내가 만든 방으로 걸어 들어가는 장면이 만족스러운가
Q  그 장면을 계속 보고 싶은가
Q  침대를 하나 더 놔주고 싶은가
Q  내가 가꾼 공간과 그곳에서 잠드는 주민이 함께 정겹게 느껴지는가
Q  같은 주민이 아침에 일어나 하루를 시작하는 모습을 다시 보고 싶은가
Q  주민의 모습과 행동에 정감이 가는가
Q  밤에 불이 들어온 집으로 돌아가는 모습을 다시 기다리고 싶은가
```

부정적이면 MVP_SPEC 31 장의 연출을 강화하고 이 Task 를 다시 한다.
**감사 포인트를 붙여서 해결하려 하지 않는다.**
플레이어가 다시 보고 싶었던 장면과 어색했던 동작·가림·조명을 `docs/state/`에 기록한다.
플레이스홀더라도 귀가·취침·기상의 연결과 공간에 대한 애착을 확인한 뒤 진행한다.
부정적인 팔레트·조명·가구·실루엣 평가는 이 단계에서 개선한다. 장기 성공 장면에 대한
기대와 지금 관찰한 소수 주민 장면의 만족감을 구별하여 기록한다.

---

## TASK-034 낮과 밤

의존: TASK-023, TASK-007, TASK-028

작업:

```text
src/render/DayNightVisual.ts
하늘색 / 방향광 색과 강도 보간
torch PointLight (상한 16)
```

Acceptance Criteria:

- [x] 시간에 따라 하늘색이 바뀐다
- [x] 밤에 어두워지고 `torch` 주변만 밝다
- [x] 광원이 16 개를 넘지 않는다 (가까운 것 우선)
- [x] 전이가 갑자기 튀지 않고 보간된다
- [x] 기존 torch를 놓은 작은 집에서 실내 불빛과 TASK-028의 이동 fixture가 함께 읽힌다. 자동 점등이나 광원 상한 확대 없이 확인한다. 실제 귀가·취침 연동은 후속 TASK-033에서 검증한다

---

# Phase F. 성장

## TASK-035 감사 포인트

의존: TASK-033, TASK-032

작업:

```text
GratitudeSystem — gain / spend / 중복 방지
GratitudeSource 5 종
src/ui/GratitudeHud.ts + 월드 공간 +N 연출
```

결과: [TASK-035 기록](../state/2026-09-24_1930-task-035-gratitude.md). `systems/GratitudeSystem.ts`(13 번 슬롯), `ui/GratitudeHud.ts`, `render/GratitudePopupView.ts`. +N 연출의 체감은 HR-017.

Acceptance Criteria:

- [x] 주민이 잠들면 +5 가 침대 위에 뜬다
- [x] 같은 밤에 같은 주민이 두 번 받지 않는다
- [x] 요리 완료 시 +3 이 요리사 위에 뜬다
- [x] 식당에서 먹으면 +2, 광장이면 0 이다
- [x] 새 방 타입 최초 인식 시 +20 이다. 두 번째 같은 타입은 0 이다
- [x] `EmptyRoom` 은 보너스를 주지 않는다
- [x] 방이 해제되어도 포인트가 줄지 않는다
- [x] `gain` 이 좌표를 필수 인자로 받는다
- [x] EmptyRoom 등록 뒤 Bedroom 타입 변경에서도 최초 +20을 한 번 지급한다
- [x] 자정 전 취침 후 자정 뒤 깨어나 다시 자도 같은 nightId에는 추가 지급하지 않는다

---

## TASK-036 마을의 종

의존: TASK-035, TASK-039

구현 전: READY-07을 확정한다(2026-09-24 확정, ADR 033). 종·상자·NPC의 상호작용 선택과 기부 자격을 명세화하고, 후속 TASK-040에서 같은 입력 계약을 재사용한다.

작업:

```text
VillageLevelSystem — evaluate / ring
src/ui/BellPanel.ts — 게이트 상태 전부 표시
종 상호작용 (F)
```

결과: [TASK-036 기록](../state/2026-09-24_2010-task-036-village-bell.md), [ADR 033](../adr/033-interaction-target-and-bell-panel.md). 해금 적용은 TASK-037, 도착 예약은 TASK-038. 체감은 HR-018.

Acceptance Criteria:

- [x] 종에 F 를 누르면 패널이 열린다
- [x] 감사 포인트와 **모든 게이트 조건이 현재값 / 필요값** 으로 표시된다
- [x] 미충족 조건이 명확히 구분된다
- [x] 조건을 전부 만족해야 버튼이 활성화된다
- [x] 치면 포인트가 소비되고 레벨이 오른다
- [x] 레벨을 내리는 코드 경로가 존재하지 않는다
- [x] 종 연출(소리 / 빛 / 카메라)이 있다
- [x] 종의 F는 성장·저장소 탭을 가진 패널 하나만 연다
- [x] 종 또는 상자에서 seed/crop/food를 플레이어 인벤토리에서 마을 저장소로 기부한다
- [x] 레벨 2에서 80, 레벨 3에서 200을 차감한다. 총 소비량은 280이다
- [x] 현재 상태로 게이트를 재평가하고 dirty 방은 세지 않는다
- [x] 레벨 3에서 다음 단계가 없음을 표시하고 ring은 상태를 바꾸지 않고 실패한다
- [x] 레벨 3 음식 게이트 안내는 현재 주민 수로 계산한다. 주민 3명은 food 6, 4명은 food 8이며 도착 예약 인원을 현재 인구로 세지 않는다

---

## TASK-037 해금

의존: TASK-036, TASK-015

작업:

```text
TASK-015에서 만든 unlocks.ts를 VillageLevelSystem의 실제 레벨 전이와 연결
CraftingSystem이 현재 레벨의 해금을 확인
```

결과: [TASK-037 기록](../state/2026-09-24_2030-task-037-unlocks.md). CraftingSystem 의 레벨 조회를 VillageLevelSystem.level 에 연결했다.

Acceptance Criteria:

- [x] 레벨 1 에서 `window` / `chest` 이 회색이다
- [x] 회색 항목에 필요 레벨이 표시된다
- [x] 레벨 2 를 달성하면 즉시 활성화된다
- [x] 해금되지 않은 블록은 디버그 모드에서도 제작되지 않는다
- [x] 레벨이 오른 뒤 다시 잠기지 않는다
- [x] cooking_stove / water_pot은 레벨 1부터 제작 가능하다

---

## TASK-038 새 주민 도착

의존: TASK-037

작업:

```text
ResidentArrivalSystem이 레벨별 고유 키로 다음 07:00 도착을 예약·스폰
Villager 역할 (생활만 한다)
도착 연출
```

결과: [TASK-038 기록](../state/2026-09-24_2100-task-038-resident-arrival.md), [ADR 034](../adr/034-resident-arrival-and-villager-day.md). 사람 판단은 HR-019.

Acceptance Criteria:

- [x] 레벨 2 를 달성하면 다음 아침에 1 명이 온다
- [x] 섬 가장자리에서 마을로 걸어 들어온다
- [x] 도착 즉시 침대가 배정된다 (비어 있으면)
- [x] 같은 자원에서 인구 증가를 반영해 지표를 재계산한다. 침대 3개·food 6에서 3→4명 도착 시 housing 100→75, food 50→38이다. 이미 0/100으로 제한된 지표가 반드시 하락한다고 요구하지 않는다
- [x] 새 주민이 시간표대로 생활한다 (서 있기만 하지 않는다)
- [x] 레벨 2·3을 같은 날 달성해도 각 예약당 한 명씩 정확히 두 명이 도착한다
- [x] EVENT_NEW_RESIDENT는 스폰하지 않는다. 도착 사실만 확인한다 (스폰 경로는 ResidentArrivalSystem 하나뿐이다. 이벤트 평가는 TASK-041)

---

# Phase G. 진행

## TASK-039 World State

의존: TASK-020, TASK-027

실행: 성장 게이트보다 먼저 완료한다 (2.3 참조).

작업:

```text
computeWorldState 순수 함수 — MVP_SPEC 21.1
WorldStateSystem — update 14 번 자리
디버그 패널에 4 지표 표시
```

결과: [TASK-039 기록](../state/2026-09-24_1900-task-039-world-state.md). `src/game/systems/WorldStateSystem.ts`(computeWorldState + 14 번 슬롯). 식사 연동(점심 뒤 foodLevel 하락)도 테스트로 확인했다.

Acceptance Criteria:

- [x] 4 지표가 MVP_SPEC 21.1 대로 계산된다
- [x] `population === 0` 에서 0 으로 나누지 않는다
- [x] food 감소 입력에서 `foodLevel`이 내려간다. 실제 식사 연동은 TASK-032 이후 확인한다
- [x] 테스트 입력의 주민 수가 늘면 `housingLevel`이 내려간다. 실제 도착 연동은 TASK-038에서 확인한다
- [x] 습격 전에는 `safetyLevel` 이 100 이다
- [x] `WorldState` 에 변경 API 가 없다
- [x] `SaveData` 에 포함되지 않는다 (저장 형식은 아직 없다. WorldState 는 어떤 저장 대상 상태에도 들어가지 않으며 TASK-051 테스트에서 다시 확인한다)
- [x] `accessibleBeds` 가 `facilities.beds` 로만 계산된다

---

## TASK-040 대사

의존: TASK-027, TASK-028

작업:

```text
src/game/data/dialogues.ts
DialogueSystem + src/ui/DialogueBox.ts
NPC 머리 위 대화 가능 표시
```

결과: [TASK-040 기록](../state/2026-09-24_2130-task-040-dialogue.md), [ADR 035](../adr/035-dialogue-speaker-key-and-modal-keys.md). 대화 표시 등록은 TASK-042, 목표 적용은 TASK-041. 사람 판단은 HR-020.

Acceptance Criteria:

- [x] NPC 에 F 를 누르면 대사가 나온다
- [x] 대사 중 이동과 블록 편집이 막힌다
- [x] 대사 표시가 있는 NPC 만 대화된다
- [x] 대사가 끝나면 정확한 dialogueId를 포함한 종료 이벤트와 완료 기록이 생긴다. nextObjective 표시 연동은 TASK-041에서 검증한다
- [x] 같은 NPC에게 두 대사를 등록해도 미완료 대사가 덮어써지거나 같은 id가 중복 등록되지 않는다
- [x] 대사가 해금을 하지 않는다 (ADR 010)

---

## TASK-041 목표

의존: TASK-040

작업:

```text
ObjectiveSystem + src/ui/ObjectivePanel.ts
진행 수치가 있는 목표
```

결과: [TASK-041 기록](../state/2026-09-24_2150-task-041-objectives.md). `systems/ObjectiveSystem.ts`(16 번 슬롯), `ui/ObjectivePanel.ts`, `data/gameEventOrder.ts`. setObjective 커맨드 연결은 TASK-042.

Acceptance Criteria:

- [x] 목표가 좌측 상단에 한 줄로 보인다
- [x] "밭흙을 4 칸" 에 (2 / 4) 가 실시간으로 표시된다
- [x] "마을을 벽으로 둘러싸 주세요" 에는 수치가 없다
- [x] 목표가 바뀔 때 시각적으로 강조된다
- [x] 대사·커맨드·저장에 같은 ObjectiveDefinition을 쓰고 current는 FarmSystem 집계에서 계산한다
- [x] 늦게 읽은 이전 단계 대사가 목표를 되돌리지 않는다. 같은 목표 재적용도 수치를 초기화하지 않는다

---

## TASK-042 이벤트 골격

의존: TASK-041

작업:

```text
GameEventSystem — 커맨드 반환 (ADR 007)
GameCommand 4종 (주민 스폰 명령 없음)
completed 집합. 비가역
```

결과: [TASK-042·043 기록](../state/2026-09-24_2220-task-042-043-game-events.md). `systems/GameEventSystem.ts`(15 번 슬롯). 정의·커맨드 타입은 `types`(데이터 계층이 시스템을 import 하지 않게).

Acceptance Criteria:

- [x] `execute` 가 부작용 없이 커맨드 배열을 반환한다
- [x] `GameEventSystem` 한 곳에서만 커맨드를 해석한다
- [x] 완료된 이벤트가 다시 실행되지 않는다
- [x] `completed` 에서 제거하는 코드 경로가 없다
- [x] 이벤트 정의를 시스템 없이 테스트할 수 있다

---

## TASK-043 진행 이벤트 8 개

의존: TASK-042

작업:

```text
src/game/data/gameEvents.ts — MVP_SPEC 27.1
대사 8 세트
```

결과: [TASK-042·043 기록](../state/2026-09-24_2220-task-042-043-game-events.md). `data/gameEvents.ts`, 대사 8 세트는 `data/dialogues.ts`. 습격 조건(WALL / SLICE_END)은 RaidResult fixture 로 검증했고 실제 연동은 TASK-044~049. 도착 확인·엔딩 연출은 알림 문구이며 완성은 TASK-052.

Acceptance Criteria:

- [x] 8 개가 MVP_SPEC 27.1 의 조건대로 발생한다
- [x] 모든 조건이 결정적이다 (난수 / 모호한 시간 조건 없음)
- [x] 조건이 다시 거짓이 되어도 롤백되지 않는다
- [x] 각 이벤트가 감사 포인트 +15 를 준다
- [x] 8 개 전부에 대한 `canTrigger` 테스트가 있다
- [x] 처음부터 끝까지 이벤트만 따라가면 레벨 2 에 도달한다 (MVP_SPEC 35.3)
- [x] 표 순서의 선행 이벤트 완료 조건을 함께 검사한다
- [x] 레벨 1 해금·초기 자원으로 주방 → 침실 → 첫 종 경로가 성립한다
- [x] 종 대사가 밭 4→8칸·주민 수에 맞춘 침대를 안내한다
- [x] 첫 종 대사는 레벨 3의 방 4개·housing 100·foodLevel 50과 주민 수에 따른 필요량을 안내한다. food 8은 4명일 때의 예시이며 `chest`·`table`/`chair`로 창고·식당을 만들 수 있다는 것도 안내한다 (MVP_SPEC 28 Phase 4)
- [x] 첫 Farmer 대화 종료로 밭 목표·완료 id가 적용되고 FARM_REQUEST가 보상을 한 번 준다. 같은 요청을 다시 듣게 하지 않는다
- [x] 이벤트를 늦게 평가해도 raidId별 완료 이력으로 1차 종료와 2차 종료를 구별한다. 같은 프레임에 여러 조건을 만족하면 정본 순서로 각각 한 번 발생한다
- [x] 습격 조건은 RaidResult fixture로 단위 검증하고 실제 연동은 TASK-044~049에서 검증한다

---

# Phase H. 방어

## TASK-044 습격 스케줄

의존: TASK-036

작업:

```text
Monster 엔티티
RaidSystem — villageLevel 달성 후 첫 21:00
스폰 2 곳. 05:00 강제 소멸
```

결과: [TASK-044 기록](../state/2026-09-24_2250-task-044-raid-schedule.md). `systems/RaidSystem.ts`(8 번, 도착보다 먼저), `entities/Monster.ts`, `render/MonsterView.ts`. 몬스터 이동·파괴는 TASK-045.

Acceptance Criteria:

- [x] 레벨 2 달성 후 첫 21:00 에 3 마리가 나온다
- [x] 레벨 3이고 1차 습격이 끝난 뒤 첫 21:00에 5마리가 나온다
- [x] 그 외의 밤에는 나오지 않는다
- [x] 05:00 에 남은 몬스터가 사라진다
- [x] 같은 습격이 두 번 발생하지 않는다
- [x] `RAID_STARTED` / `RAID_ENDED` 가 발행된다
- [x] 두 레벨을 같은 날 달성해도 습격은 겹치지 않고 순서대로 한 번씩 발생한다
- [x] 1차를 21:00~24:00에 처치한 경우에도 2차는 종료보다 엄격히 뒤인 다음 21:00이다. 05:00 종료만 가정하지 않는다

---

## TASK-045 몬스터 AI 와 블록 파괴 ★

의존: TASK-044, TASK-025

작업:

```text
MonsterSystem — ARCHITECTURE 18.1 의 판단 순서
findBreakableToward (도달 가능한 경계 + terrain=false + breakSeconds!=null + 남은 예산)
파괴 진행 + 블록 흔들림 연출
```

결과: [TASK-045 기록](../state/2026-09-24_2330-task-045-monster-ai.md). `systems/MonsterSystem.ts`(9 번 슬롯). 플레이어·주민 추적·공격은 TASK-046.

Acceptance Criteria:

- [x] 열린 마을에서는 종까지 그냥 걸어온다
- [x] 판자벽으로 막으면 벽 앞에서 멈추고 부수기 시작한다
- [x] `plank` 가 0.8 × 2.0 = 1.6 초에 부서진다
- [x] 부서지면 통행 그래프가 갱신되어 들어온다
- [x] **`dirt` / `stone` 은 부수지 않고 우회한다**
- [x] `NODE_LIMIT` 로 경로를 못 찾았을 때는 부수지 않는다
- [x] 완전히 막히면 배회하다 05:00 에 사라진다
- [x] 종 반경 6 안에 들어오면 "도달" 로 기록된다
- [x] 종은 파괴되지 않으며 열린 마을의 목표 반경까지 걸어간다
- [x] 벽에서 떨어져 스폰해도 접근 가능한 벽 앞까지 이동한 뒤 파괴한다
- [x] 습격 파괴량이 16복셀을 넘지 않고 두 칸 객체는 부분 파괴하지 않는다
- [x] 흙벽 제한이 방어·수리의 재미를 없애는지 관찰 기록을 남긴다 (에이전트 관찰은 기록에, 사람의 판단은 HR-021)

---

## TASK-046 전투

의존: TASK-045

구현 전: READY-05를 확정한다(2026-09-24 확정, ADR 036). MVP_SPEC 19/24/26장에서 공격 거리·대상 선택·기절 회복·안전한 부활 위치를 확정한다. 기존 체력과 기절 시간은 임의로 바꾸지 않는다.

작업:

```text
CombatSystem — 플레이어 공격 / 몬스터 공격
플레이어 체력 + 부활
```

결과: [TASK-046 기록](../state/2026-09-25_0000-task-046-combat.md), [ADR 036](../adr/036-combat-targets-stun-respawn.md). 체감은 HR-022.

Acceptance Criteria:

- [x] 좌클릭으로 몬스터를 공격한다 (블록 조준과 구분된다)
- [x] 3 대에 처치된다
- [x] 몬스터가 플레이어와 NPC 를 공격한다
- [x] NPC 체력이 0 이면 30 게임분 기절한다. 죽지 않는다
- [x] 플레이어 체력이 0 이면 종 옆에서 부활하고 인벤토리를 잃지 않는다
- [x] 게임 오버가 없다

---

## TASK-047 도피

의존: TASK-046

작업:

```text
FleeAction — 위협 반경 12
집 안 또는 마을 반대편으로 도피
```

결과: [TASK-047 기록](../state/2026-09-25_0020-task-047-flee.md). 도피 칸·해제 반경은 MVP_SPEC 19.4.1.

Acceptance Criteria:

- [x] 몬스터가 반경 12 안에 오면 주민이 도망친다
- [x] 도피 속도가 5.0 이다
- [x] 도피 중 다른 판단을 하지 않는다 (우선순위 1)
- [x] 위협이 사라지면 원래 시간표로 돌아간다
- [x] 이전에 하던 작업을 이어가지 않는다 (새로 판단한다)
- [x] 문을 통과해 실내로 들어갈 수 있다

---

## TASK-048 수리

의존: TASK-045

작업:

```text
RepairSystem — DamageLog
RepairAction — 목수. 하루 8 점유 복셀. 07:00 ~ 18:00
플레이어가 직접 놓아도 resolve
```

결과: [TASK-048 기록](../state/2026-09-25_0050-task-048-repair.md). `systems/RepairSystem.ts`, `actions/RepairAction.ts`. 수리 후보 예약은 NPCSystem 시설 예약(`repair:<id>`).

Acceptance Criteria:

- [x] 몬스터가 부순 좌표가 기록된다
- [x] 아침에 목수가 그곳으로 가서 원래 블록을 복구한다
- [x] 하루 8 점유 복셀까지만 한다
- [x] 9 번째부터는 다음 날로 넘어간다
- [x] 재료를 소비하지 않는다
- [x] 플레이어가 직접 놓아 피해 cells가 모두 채워지면 미수리 목록에서 제거된다. 아침 보고용 파괴 이력은 유지한다
- [x] 18:00 이후에는 수리하지 않는다
- [x] 문·침대는 전체 배치로 복원하고 당일 예산에서 2칸을 쓴다
- [x] 부분 복구·NPC 점유가 있으면 덮어쓰지 않는다. 완료 시 공간과 예산을 다시 검사한다
- [x] 농사 BLOCK_CHANGED를 수리 완료로 오인하지 않는다
- [x] DamageLog 변경에서 수리 후보를 갱신하고 완료·플레이어 복구 시 후보를 제거한다. NPC가 전체 블록에서 피해를 다시 찾지 않는다

---

## TASK-049 피해 보고

의존: TASK-048

작업:

```text
src/ui/DamageReportPanel.ts — 07:00 자동
파괴 좌표 붉은 반투명 큐브 (수리될 때까지)
```

결과: [TASK-049 기록](../state/2026-09-25_0110-task-049-damage-report.md). 보고 판정은 RepairSystem(07:00 하루 한 번, 보고 시각 저장), 패널 `ui/DamageReportPanel.ts`, 표시 `render/DamageMarkView.ts`. 체감은 HR-024.

Acceptance Criteria:

- [x] 습격 다음 아침에 패널이 뜬다
- [x] 파괴된 블록 수가 표시된다
- [x] 좌표가 월드에 붉게 표시된다
- [x] 수리되면 표시가 사라진다
- [x] 피해가 없으면 패널이 뜨지 않는다
- [x] 아침 전에 수리한 피해도 지난밤 파괴 수에 포함되고 미수리 표시만 사라진다

---

# Phase I. 마무리

## TASK-050 오디오

의존: TASK-049, TASK-PERF-002

작업:

```text
MVP_SPEC 30 장의 소리
TASK-021의 방 인식·해제음과 TASK-036의 종소리를 다듬고 나머지 소리를 완성한다
방 인식 성공음에 가장 공을 들인다
```

결과: [TASK-050 기록](../state/2026-09-25_0230-task-050-audio.md). `ui/audio/AudioEngine.ts`(합성 리버브·음소거), `ui/audio/GameSounds.ts`, `ui/audio/soundMaterial.ts`. 음색 판단은 HR-026.

Acceptance Criteria:

- [x] 블록 파괴 / 설치 소리가 재질별로 다르다
- [x] 방 인식 성공음이 전용 효과음이다
- [x] 방 인식 해제음이 경고음이다
- [x] 종소리에 리버브가 있다
- [x] 낮 / 밤 BGM 이 전환된다
- [x] 음소거 토글이 있다

---

## TASK-051 저장

의존: TASK-050

작업:

```text
SaveSystem — IndexedDB
ARCHITECTURE 23 장의 SaveData
로드 후 재구축 6 단계
자동 저장 (매일 07:00 / 종을 친 직후)
```

결과: [TASK-051 기록](../state/2026-09-25_0330-task-051-save.md), [ADR 038](../adr/038-save-slot-autosave-and-load.md). 확인 HR-027.

Acceptance Criteria:

- [x] 저장하고 새로고침하면 블록이 그대로다
- [x] 방이 다시 인식된다 (저장하지 않고 재판정)
- [x] 주민 위치 / 침대 배정 / 진행 상태가 복원된다
- [x] 감사 포인트 / 마을 레벨 / 해금이 복원된다
- [x] `WorldState` 는 저장되지 않고 계산된다
- [x] 로드 시간이 5 초 이하다
- [x] 변경된 청크만 저장된다
- [x] `Date.now()` 가 저장 데이터에 없다
- [x] 버전이 다르면 조용히 깨지지 않고 거부한다
- [x] gameMinutes 하나로 시각을 저장하고 다중 칸 배치·objectId를 복원한다
- [x] 습격 중 저장·로드 후 몬스터 체력·도달 집합·파괴 예산·종료 이벤트가 유지된다
- [x] 종 직후 도착 예약이 보존되고 같은 주민·이벤트·보상을 두 번 생성하지 않는다
- [x] 자정 전후 취침 보상, 기절, 식사 구간, 당일 수리 8칸 제한이 유지된다
- [x] 현재 목표와 미완료 대화 표시가 복원된다
- [x] 로드의 방 재구축은 보상 이벤트를 발생시키지 않는다
- [x] 저장만 하면 진행 중 조리·이동·예약이 유지되고, 로드할 때만 임시 Action·예약을 비운다
- [x] 비동기 저장 도중 편집해도 캡처한 스냅샷이 바뀌지 않는다. 연속 요청은 최신 상태를 마지막으로 저장하고 실패 시 이전 슬롯을 보존·실패를 표시한다
- [x] 침대·의자 사용 중 저장·로드 후 NPC의 논리 위치가 고체 가구 안이 아니다
- [x] 목표의 id·원천 이벤트·집계 종류와 미완료 대사 순서가 복원되고 지연된 과거 대사가 목표를 되돌리지 않는다

---

## TASK-052 엔딩

의존: TASK-051

작업:

```text
EVENT_SLICE_END 연출
아침 / 주민 5 명 / 수리하는 목수
연출 후에도 계속 플레이 가능
```

결과: [TASK-052 기록](../state/2026-09-25_0430-task-052-ending.md), [ADR 039](../adr/039-ending-cutscene-modal.md). 시험 `tests/ending.test.ts`. 확인 HR-028.

Acceptance Criteria:

- [x] 2차 습격 종료 뒤 첫 07:00 이후이며 주민 5명·선행 이벤트 완료를 만족할 때 한 번 발생한다. 07:00 한 프레임의 등호 비교를 쓰지 않는다
- [x] 연출이 재생된다
- [x] 연출이 끝나도 게임이 계속된다
- [x] 저장하고 이어서 할 수 있다

---

## TASK-053 밸런스와 성능

의존: TASK-052

작업:

```text
MVP_SPEC 35 장의 검산을 실제 플레이로 검증
MVP_SPEC 36 장의 성능 목표 달성
```

결과: **검증 대기**. [TASK-053 기록](../state/2026-09-25_0600-task-053-balance-perf.md). 자동 검산·측정 AC 는 통과했다.
분량 가설·감성 기록·39장의 시각/청각 단계는 사람의 처음부터 끝까지 플레이(HR-029)가 필요해 열어 둔다.
측정 장면 `?scene=mvp-perf&view=0&seconds=60&jumps=0&dpr=1`, 시험 `tests/balance053.test.ts`·`progression053.test.ts`·`mvpPerfScene.test.ts`.

Acceptance Criteria:

- [ ] 첫 방 10~20분·첫 취침 20~30분·전체 90~120분 가설과 실제 소요를 비교한다. 차이와 대기·채집·진단의 원인을 기록하고 분량만 맞추기 위한 지연을 추가하지 않는다
- [ ] 분량 가설이 빗나가면 재미·진행 결과에 근거해 명세 유지/개정 판단을 기록한다. 측정 전 목표 분량 달성을 선언하지 않는다
- [x] 이벤트만 따라가도 레벨 2 에 도달한다
- [x] 레벨 2 이후 약 3게임일이라는 가설을 측정하고 차이와 원인을 기록한다
- [x] 밭 8칸·충분한 씨앗과 접근 가능한 주방에서 주민 5명의 일간 식량을 검증한다
- [x] 파괴 없는 정상 수확에서 씨앗이 순환하고 손실 시 채집으로 보충할 수 있다
- [x] MVP_SPEC 36장의 동일 조건에서 60 FPS 목표 / 하위 1% 30 FPS 최소를 측정한다
- [x] 드로우콜이 600 미만이다
- [x] 방 재판정이 프레임당 3ms 이하다
- [ ] MVP_SPEC 39 장의 Acceptance Test 10 개가 전부 통과한다
- [x] ARCHITECTURE 2.3의 확장 경계를 검토하고, 100명·대형 월드 확장 시 남은 병목과 미검증 항목을 기록한다. MVP 측정을 확장 성능 검증으로 간주하지 않는다
- [x] TASK-PERF-001 / 002 결과와 비교해 실제 저장·로드 비용을 추가 측정하고, 미구현 Job/LOD/계층 경로/스트리밍은 미검증으로 명시한다
- [ ] 방을 더 꾸미고 싶은지, 주민에 정감이 가는지, 밤 귀가를 다시 보고 싶은지 기록한다. 큰 마을을 한동안 바라보고 싶다는 기대는 장기 규모에서 재검증할 항목으로 남긴다

---

# PERF. MVP와 분리한 구조 검증

아래 fixture 수치는 스트레스 입력이며 MVP 수치·밸런스·플레이 가능한 콘텐츠가 아니다.
새 자원·가구·역할 없이 기존 데이터를 반복 배치한다. 절차적 게임 지형을 도입하지 않고
고정된 시험 배치를 사용한다. 실행 설정과 결과는 `docs/state/`에 기록한다.

## TASK-PERF-001 첫 취침 이후의 확장 구조 점검

의존: TASK-033 통과, TASK-016, TASK-025

작업:

```text
MVP 시험 장면과 별도 진입점/fixture를 만든다. 진행 정원과 balance 원본은 유지한다
256 × 64 × 256 시험 월드, 주민 5 / 50 / 100명 단계별 실행
기존 레시피의 방 100개, 기존 가구 객체 총 2000개, 고정된 이동 목적지들
실제 방 판정·시설 조회·NPC 이동·동시 경로 요청·청크 편집·낮밤 렌더 연결
국소 편집과 경계 편집, 여러 요청의 동시 발생과 큐 소진 구간 비교
카메라 두 장면을 모두 실행한다
  근경  마을 안. 주민과 시설이 보이는 기존 시험 시점
  원경  높은 곳에서 시험 월드 전체를 내려다보는 시점 (장기 성공 장면의 최악 조건)
```

결과: [PERF-001 기록](../state/2026-09-24_0200-perf-001-structure-check.md), [ADR 029](../adr/029-perf-001-structure-fixes.md). GPU 시간은 측정하지 못했고 CPU 수치로 대신 주장하지 않았다.

Acceptance Criteria:

- [x] 총/상주/메시 청크 수, 전체/상세 시뮬레이션/가시 NPC 수, 방·가구 수를 각각 기록한다. 현재 전부 상세 처리했다면 그대로 명시한다
- [x] MVP_SPEC 36장의 장치·해상도·DPR 기록 형식을 재사용하고, 워밍업 뒤 60초의 평균/하위 1% FPS, 프레임 시간 p95/최대, 메모리 측정 방법과 한계를 기록한다
- [x] NPC 이동·판단 시간, A* 확장 수·대기 시간·최장 대기 요청, room/mesh 큐 길이·처리 시간·GPU 업로드 수를 기록한다. GPU 시간을 측정하지 못했으면 CPU 수치로 대체해 주장하지 않는다
- [x] 주민 수 증가가 주민별 전역 복셀 검색을 만들지 않는다. 국소 편집은 영향받은 방/문 후보와 dirty 청크만 재처리한다
- [x] 경로 4000 확장·방 3ms·GPU 업로드 2개라는 기존 공유 예산을 유지하고, 입력을 멈추면 큐가 소진되는지와 기아 여부를 확인한다
- [x] 실제 브라우저에서 100명 이동과 낮밤 장면을 확인한다. 100개 id 등록만으로 통과하지 않는다
- [x] 근경·원경 각각의 **드로우콜 수, 렌더러 CPU 시간, 보이는 메시 청크 수**를 따로 기록한다. MVP_SPEC 36장의 600 미만은 128 × 64 × 128 기준이며 시험 월드에 그대로 적용하지 않는다
- [x] 원경에서 드로우콜이 크게 늘면 그 비용이 GPU가 아니라 드로우 제출(CPU)에 있는지 구분해 기록한다. 스트리밍은 상주 메모리를 줄일 뿐 보이는 청크 수를 줄이지 않는다는 점을 결과에 명시한다
- [x] 완화가 필요하면 후보를 **원거리 청크 LOD(청크 병합·수직 컬럼 단일 메시) 등 배치 병합**으로 기록한다. ADR 019의 순서대로 배치·가시성·광원 예산을 먼저 검토하며, 이 Task에서 구현하거나 WebGPU 전환을 결정하지 않는다
- [x] 측정 결과·병목·재현 절차·후속 개선을 남긴다. 100명에서 MVP FPS 목표를 달성해야만 완료되는 Task는 아니며, 고정 인원 제한·전역 검색·예약 중복 등 구조 위반은 수정한다
- [x] 범용 Job·원거리 Simulation LOD·렌더 청크 LOD·계층 경로·스트리밍은 미구현/미측정으로 표시한다. 역할 작업 부하는 TASK-PERF-002에서 추가한다

## TASK-PERF-002 역할 작업과 큐 집중 부하 점검

의존: TASK-PERF-001, TASK-032, TASK-048, TASK-049

실행: TASK-049 이후, TASK-050 이전.

작업:

```text
PERF-001 fixture와 장치를 재사용한다
고정된 성숙 작물·조리 가능한 시설/재료·피해 기록으로 작업 후보 다수를 동시에 만든다
작업 후보 100 / 1000건에서 역할 선택·예약·동시 경로 요청·시설 파괴·재판정을 측정한다
같은 시험에서 청크 mesh 갱신과 낮밤을 함께 실행한다
```

결과: [PERF-002 기록](../state/2026-09-25_0150-perf-002-role-load.md), [ADR 037](../adr/037-role-candidate-cache-and-claim-conflict.md). 시험 `tests/perf002.test.ts`, 장면 `?scene=perf&load=1000&jumps=0`. 실제 창 측정은 HR-025.

Acceptance Criteria:

- [x] 후보 수·대기/진행/완료/취소 수와 생성·선택 비용, 최대 대기 시간을 기록한다. 실제 MVP 역할 후보 큐와 장기 Job Queue를 구별한다
- [x] 여러 NPC가 한 시설·재료·작업 결과를 중복 점유/소비/생산하지 않는다. 파괴·취소 뒤 예약 누수와 오래된 후보가 남지 않는다
- [x] 피해 fixture 주입은 기술 시험이며 실제 습격의 피해 상한·목수의 일일 수리량을 바꾸지 않는다. 예산 때문에 남은 작업은 기아와 구분한다
- [x] PERF-001과 같은 지표를 비교하고 사건 폭주 뒤 큐가 안정되는지 확인한다. 아직 없는 범용 Job System의 실측 성능으로 보고하지 않는다
- [x] 장기 Job System 도입 시 동일 후보 부하를 실제 Job 생성/claim/취소/완료 경로로 재실행할 검증 항목을 남긴다. 현재 Task를 위해 운반·광산 같은 새 메커닉을 만들지 않는다

---

## TASK-PERF-003 몬스터 추적 재탐색 비용

의존: TASK-053(측정에서 병목 발견), TASK-045, TASK-046

사용자 결정(2026-09-25)으로 추가했다. TASK-053 의 36장 측정에서 종에 닿은 몬스터가 닿을 수 없는 대상(방 안 주민 등)을
1 초마다 다시 찾아 섬의 통행 영역 전체를 훑는 것이 드러났다(브라우저 nav 슬롯 최대 18.5 ms).

작업:

```text
추적 경로 탐색 한 번의 누적 확장 수를 상한(chaseMaxNodes)으로 묶는다
상한에 걸리거나 NO_PATH 인 대상은 chaseRetrySeconds 동안 쫓지 않고 다음으로 가까운 대상을 본다
쫓을 대상이 없으면 추적 전 모드(도달 후 대기 / 배회)로 돌아간다
MVP_SPEC 24.3 의 5 와 34 장 balance 를 먼저 개정한다
```

결과: [PERF-003·ANIM-001 기록](../state/2026-09-25_0830-perf-003-chase-anim-001-motion.md), [ADR 040](../adr/040-monster-chase-node-cap-and-give-up.md). 시험 `tests/chase.test.ts`.
같은 날 같은 장치에서 번갈아 잰 mvp-perf 값: nav 최대 23.7~33.9 → 3.2~7.4 ms, update 평균 0.9~1.05 → 0.15 ms. 실제 창의 추적 체감은 HR-031.

Acceptance Criteria:

- [x] 닿을 수 없는 대상 하나를 두고 몬스터 다섯이 60 초 추적해도 한 요청의 누적 확장 수가 chaseMaxNodes 를 넘지 않는다(시험)
- [x] 포기한 대상은 chaseRetrySeconds 동안 다시 요청하지 않고, 닿을 수 있는 다른 대상이 반경 안에 있으면 그쪽을 쫓는다(시험)
- [x] 열린 곳의 주민·플레이어 추적과 공격(TASK-046 시험)이 그대로 통과한다
- [x] 추적 대상이 없어지면 배회하던 몬스터는 배회로, 종에 닿은 몬스터는 대기로 돌아간다(시험)
- [x] `?scene=mvp-perf` 60 초 측정을 다시 해 nav 슬롯 최대·A* 프레임 확장을 TASK-053 값과 비교해 기록한다(같은 날 변경 전 빌드도 다시 재서 비교했다)
- [x] 프레임당 경로 예산(pathfindMaxNodes)·종 목표 탐색(24.3 의 1~4)·파괴 규칙은 바꾸지 않는다

---

## TASK-ANIM-001 캐릭터 동작 다듬기

의존: TASK-033(G2 Q6 "애니메이션 부족"), TASK-046, TASK-047, TASK-048, TASK-SHAPE-001

사용자 결정(2026-09-25)으로 추가했다. G2 에서 보류한 Q6 개선이다. **렌더 표현만 바꾼다.**
새 Action·자세 종류를 게임 상태에 더하지 않고, 이미 있는 Action·자세·이벤트를 읽어 그린다(ARCHITECTURE 12.2 / 12.3).

작업:

```text
주민: 자세 사이의 부드러운 전환(관절·위치 보간), 걷기와 달리기(도피) 구별, 대기 중 숨·눈 깜빡임·둘러보기,
      수리(망치질)를 밭일과 구별, 기절(주저앉음)을 쉬기와 구별
플레이어: 임시 상자 모형을 관절 모형으로 바꾸고 걷기·달리기·점프·낙하·파괴(휘두르기)·설치·공격 동작
몬스터: 공격 동작(달려들기)
```

결과: [PERF-003·ANIM-001 기록](../state/2026-09-25_0830-perf-003-chase-anim-001-motion.md), [ADR 041](../adr/041-character-motion-target-pose-blending.md).
자세 계산 `src/render/characterPose.ts`, 시험 `tests/characterPose.test.ts`. 사람 판단은 HR-030.

Acceptance Criteria:

- [x] `src/game/` 의 상태·Action·저장 형식을 바꾸지 않는다. 동작은 render 가 읽기만 해서 만든다
- [x] 자세가 바뀔 때(걷기 → 앉기 / 눕기 → 기상 등) 관절과 몸 위치가 한 프레임에 튀지 않는다(보간 시험)
- [x] 걷기·달리기·밭일·조리·식사·취침·수리·기절·대화가 서로 다른 자세로 그려진다(자세 표 시험)
- [x] 플레이어가 파괴·설치·공격할 때 팔을 휘두르고, 공중에 있으면 점프·낙하 자세다
- [x] 드로우콜·프레임이 TASK-053 측정 대비 눈에 띄게 늘지 않는다(`?scene=mvp-perf` 재측정)
- [x] 브라우저(headless)에서 장면을 관찰하고, 사람의 판단은 HUMAN_REVIEW 에 올린다(HR-030, `대기`)

---

## TASK-BARK-001 주민의 한마디

의존: TASK-040(대사·F 대상), TASK-047(도피), TASK-046(맞음·기절), TASK-032(식사), TASK-034(침대 배정), TASK-ANIM-001

사용자 결정(2026-09-25)으로 추가했다. "마을 사람들이 상황에 맞는 간단한 말을 할 수 있으면 좋겠다."
GAME_DESIGN 의 "정감 있는 주민이 실제로 살아가는 순간"을 말로도 보이게 하는 표현 작업이다. 명세는 MVP_SPEC 19.7, 구조는 ARCHITECTURE 21.4.

작업:

```text
data/barks.ts: 상황별 짧은 문장(역할별·공통·시간대 인사·방 타입별 새 방)
systems/BarkSystem.ts: 계기(이벤트·Action 전환·플레이어 거리·F) → 간격 확인 → 결정적 문장 → NPC_BARK
render/BarkBubbleView.ts: 머리 위 DOM 말풍선(3.5 초, 22 칸, 최대 4 개)
main: 진행 대사가 없는 주민에게 "[F] 말 걸기" → poke
```

결과: [BARK-001 기록](../state/2026-09-25_0905-bark-001-resident-barks.md), [ADR 042](../adr/042-resident-barks.md). 시험 `tests/bark.test.ts`. 사람 판단은 HR-032.

Acceptance Criteria:

- [x] 표의 계기마다 해당 상황 문장을 낸다: 인사·말 걸기·기상(침대 / 바닥)·취침·잘 곳 없음·식사(식당 / 광장)·농사·조리·수리·도피·맞음 / 기절·습격 끝·새 방·마을 레벨·도착(시험)
- [x] 주민별 공통 간격 10 초와 상황별 간격을 지킨다. 도피·맞음·말 걸기만 공통 간격을 무시한다(시험)
- [x] 자는 중·대화 중에는 말하지 않고, 기절 중에는 맞음 / 기절 문장만 한다(시험)
- [x] 말 걸기의 우선순위(도피 → 기절 → 배고픔 → 잘 곳 없음 → 하는 일)를 따른다(시험)
- [x] 같은 조건이면 같은 문장을 고른다(결정적). 같은 주민·상황을 되풀이하면 문장이 돌아가며 바뀐다(시험)
- [x] 한마디가 게임 상태(Action·저장소·감사 포인트·목표·진행 대사·저장 데이터)를 바꾸지 않는다(시험)
- [x] 진행 대사가 있는 주민의 F 는 그대로 대사 상자를 연다. 없는 주민은 "[F] 말 걸기" 로 말풍선만 뜬다(브라우저)
- [x] 주민 100 명 부하에서 BarkSystem 이 프레임 예산을 눈에 띄게 쓰지 않는다(시험 또는 계측)
- [x] 브라우저(headless)에서 말풍선을 관찰하고, 사람의 판단은 HUMAN_REVIEW 에 올린다(`대기`)

---

## TASK-BARK-002 주민의 한마디 소리

의존: TASK-BARK-001, TASK-050(합성 오디오·음소거)

사용자 결정(2026-09-25)으로 추가했다. "말할 때 짧은 소리도 넣자." 명세는 MVP_SPEC 19.7 의 소리 항목과 30 장이다.
파일 에셋 없이 TASK-050 의 Web Audio 합성으로 만든다. 게임 상태를 바꾸지 않고 NPC_BARK 만 듣는다.

작업:

```text
ui/audio/barkVoice.ts: 문장·역할·상황 → 짧은 음 목록(시각·음높이·길이), 거리 → 음량 (three·Web Audio 없는 순수 함수)
ui/audio/GameSounds.ts: NPC_BARK 를 받아 음 목록을 합성해 낸다. 동시 두 주민, 22 칸 밖은 무음
main: 주민 역할과 카메라까지 거리를 GameSounds 에 넘긴다
```

결과: [BARK-002 기록](../state/2026-09-25_1730-bark-002-bark-voice.md), [ADR 042 보완](../adr/042-resident-barks.md). 시험 `tests/barkVoice.test.ts`. 사람 판단은 HR-033.

Acceptance Criteria:

- [x] 음 개수는 글자 두 자마다 하나(1~6), 같은 문장·주민은 같은 음 목록이다(시험)
- [x] 역할마다 기본 음높이가 다르고(목수 < 농부 < 요리사), 도피·맞음은 빠르고 높게, 기절은 내려가고, "?" 끝음은 올라간다(시험)
- [x] 거리에 따라 음량이 줄고 22 칸 밖은 0 이다(시험)
- [x] 동시에 두 주민까지만 소리를 낸다. Web Audio 가 없거나 음소거면 오류 없이 지나간다(시험)
- [x] 브라우저(headless)에서 오류 없이 소리 노드가 만들어지는지 확인하고, 사람의 판단은 HUMAN_REVIEW 에 올린다(`대기`)

---

# 3. Task 의존 그래프 요약

실행 정본은 2.3의 전체 순서와 각 Task의 의존 목록이다.
주요 수정: 027→003/020, 012→011, 014→013, 029/020/034→033,
033→PERF-001→030, 020/027→039→036, 032/033→035, 049→PERF-002→050.
같은 Phase 안에서도 이 선행 조건을 생략하지 않는다.

---

# 4. 진행 기록

각 Task 완료 시 `docs/state/` 에 기록한다.

```text
docs/state/YYYY-MM-DD_HHMM-제목.md
```

내용:

```text
무엇을 했는가
어떤 결정을 했는가 (ADR 로 남길 것이 있는가)
Acceptance Criteria 중 통과하지 못한 것이 있는가
다음 할 일
```

**Acceptance Criteria 를 통과하지 못한 채로 다음 Task 로 넘어가지 않는다.**

일반 Task의 미완료 항목을 이관해야 한다면 원인·영향·후속 검증 위치를 `docs/state/`에
남긴다. **TASK-022와 TASK-033의 부정적/미실시 검증은 이 예외로 건너뛸 수 없다.**
두 지점은 관찰한 장면, 시스템 축·감성 축의 판정, 개선 내용, 재검증 결과를 기록한다.
TASK-022는 현재 구현된 방·진단·표현을, TASK-033은 귀가·취침·기상을 검증한다.
아직 없는 감사 포인트·진행 기능까지 포함한 MVP_SPEC 39장의 통합 테스트 전체를
이 시점에 통과해야 한다는 뜻은 아니다. 통합 10개 테스트는 TASK-053에서 완료한다.
아직 플레이를 관찰하지 않았다면 자동 테스트나 에이전트의 추정만으로 통과 처리하지 않는다.

## 4.1 완료·검증 기록 형식

Task마다 아래 항목을 docs/state에 남긴다. 여러 Task를 한 기록에 담아도 각 상태와
미통과 AC를 구분한다. 정책을 확정하면 2.5에도 정본·결정 기록 링크를 연결한다.

```text
대상 Task / 상태: 미착수·진행 중·검증 대기·수정 필요·완료 중 하나
구현 기준 커밋 / 관련 정본 장 / 해결한 READY 항목
변경한 것 / AC별 통과·미통과 / 관련 코드·테스트
실행한 검증 명령과 결과 / 브라우저 환경·재현 절차·관찰 결과
아직 없는 연동과 실제 검증할 후속 Task
실제 작업 소요 / 재작업 원인 / 다음 Task
커밋·원격 반영 결과는 작업 완료 보고에서 확인
```

TASK-022/033은 추가로 다음을 기록한다.

```text
플레이한 빌드 / 장면·시작 조건 / 디버그 사용 범위
관찰자·플레이어 / 각 질문의 응답과 구체적인 장면
시스템 축: 통과·실패·미검증 / 근거
감성 축: 통과·실패·미검증 / 근거
개선 대상: 판정·진단 / 공간 표현 / 주민 동작·정감
재검증 결과 / 다음 단계 진행 가능 여부
```

일반 Task의 사람 시각·체감 확인은 [HUMAN_REVIEW](HUMAN_REVIEW.md)에 항목으로 추가하고,
에이전트 검증으로 AC를 통과했으면 다음 Task로 진행한다. 확인 결과가 부정적이면 해당 Task를
수정 필요로 되돌린다. 아래 022/033의 재미 검증은 이 방식으로 미루지 않는다.

질문의 응답이 없거나 실제 장면을 아직 관찰하지 않았으면 검증 대기로 남긴다.
실패와 미검증 모두 게이트 미통과다. 게임의 아름다움을 새 점수·방 조건으로 만들지 않는다.
