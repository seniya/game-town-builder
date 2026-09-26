# AGENTS.md

작은 마을 복구 게임 프로젝트의 에이전트 작업 규약이다.

> **2026-09-26 두 번째 전면 개정(v2 도토리 마을, [ADR 049](docs/adr/049-direction-dotori-living-village.md)).**
> 오너가 방향 결정을 에이전트에게 맡겼다. 지금 개발 기준은 `docs/dotori/` 네 문서와 `src/dotori/` 다.
> v1(1인칭 복셀 빌더, `docs/project/`·`src/game`·`src/render`·`src/ui`·`src/workers`)은 동결 보존한다.
> 아래 규칙에서 "MVP_SPEC / ARCHITECTURE / TASKS / GAME_DESIGN" 은 v2 작업에서는
> 각각 `docs/dotori/SPEC.md`·`ARCHITECTURE.md`·`TASKS.md`·`DESIGN.md` 로 읽는다.

게임의 최우선 목표는 **아름답게 만든 공간에서 정감 있는 주민이 실제로 살아가는 순간** 이다.
공간을 가꾸는 즐거움과 주민에 대한 애착을 기준으로 판단한다. 구체적인 의도는
`GAME_DESIGN.md`를 따르며, 이 목표를 이유로 MVP 범위를 임의로 넓히지 않는다.

**MVP는 주민 최대 5명을 구현하지만, 아키텍처는 주민 100명과 대형 월드로 확장 가능해야 한다.**
주민 수·월드 크기를 게임 로직의 고정 한계로 넣지 않는다. 청크 단위 처리, 작업 예산,
게임 상태와 렌더의 분리를 유지한다. 구체 기준은 `ARCHITECTURE.md` 2.3과 ADR 017을 따른다.
이는 MVP 콘텐츠 확대가 아니라 모든 구현에서 지켜야 할 구조 원칙이다.

## 1. 문서를 먼저 읽는다

작업을 시작하기 전에 다음 순서로 읽는다(v2).

```text
docs/dotori/DESIGN.md         왜 만드는가 / 무엇이 재미여야 하는가
docs/dotori/SPEC.md           무엇을 만드는가 (수치와 조건식의 정본)
docs/dotori/ARCHITECTURE.md   어떤 구조로 만드는가 (인터페이스의 정본)
docs/dotori/TASKS.md          어떤 순서로 만드는가 (로드맵·완료 조건의 정본)
```

v1 을 고칠 때만 `docs/project/GAME_DESIGN.md`·`MVP_SPEC.md`·`ARCHITECTURE.md`·`TASKS.md` 를 읽는다.

부수 문서:

```text
docs/adr/       구조적 결정 기록
docs/research/  외부 조사 기록과 출처
docs/state/     작업 완료 기록과 다음 할 일
```

## 2. 문서가 서로 다르면

```text
수치 / 조건식         →  MVP_SPEC.md
인터페이스 / 구조      →  ARCHITECTURE.md
작업 순서 / 완료 조건  →  TASKS.md
의도 / 감정 목표      →  GAME_DESIGN.md
```

`GAME_DESIGN.md`에 등장하는 수치는 의도를 설명하기 위한 예시이며 구현 기준이 아니다.

## 3. 문서와 코드가 다르면

문서를 먼저 고친다.

코드만 고치고 문서를 남겨두면 다음 작업에서 같은 모순을 다시 만난다.

## 4. Task 작업 절차

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
10. commit 후 push, 원격 반영 확인
```

## 5. 코드 작성 규칙

- 모든 함수에 주석을 작성한다.
- `any` / `@ts-ignore` / `@ts-nocheck` 를 사용하지 않는다. 불가피하면 이유를 주석으로 남긴다.
- **`src/game/` 아래의 어느 파일도 `three` 를 import 하지 않는다.**
  `src/ui/` 와 `src/workers/` 도 마찬가지다. v2 에서는 `src/dotori/sim`·`data`·`ui` 가 같다. ESLint 가 이를 강제한다.
- 밸런스 수치를 로직 안에 직접 쓰지 않는다. `src/game/data/`(v2 는 `src/dotori/data/`)에 둔다.
- `THREE.Material` 생성은 `src/render/materials.ts`(v2 는 `src/dotori/render/materials.ts`) 한 곳에서만 한다.
- 좌표 변환 함수 이름에 기준점을 명시한다.
  `blockToWorldMin` / `blockToWorldCenter` 는 있고, `blockToWorld` 는 없다.

## 6. 기록 규칙

- **외부 자료를 조사했으면 `docs/research/` 에 출처와 함께 남긴다.**
  조사 결과를 대화나 커밋 메시지에만 남기지 않는다.
  결정이 어떤 사실에 기대고 있는지, 그 사실의 신뢰도가 어느 정도인지,
  무엇을 확인하지 못했는지를 함께 적는다.
  파일명은 `YYYY-MM-DD-주제.md` 로 한다.
- 조사에 근거한 ADR 은 머리말에 `Evidence:` 로 해당 조사 문서를 가리킨다.
  전제가 틀린 것으로 드러났을 때 어느 결정까지 다시 봐야 하는지 추적하기 위해서다.
- **항상 작업을 마친 후 해당 작업의 변경 사항을 commit 및 push 하고 원격 반영을 확인한다.**
  문서 작업에도 적용한다. 기존 사용자 변경은 임의로 포함하지 않는다.
  변경 사항이 없으면 빈 커밋을 만들지 않는다. push 실패 시 미반영 상태와 원인을 알린다.
- 주요한 기술 결정은 ADR 형식으로 정리한다. 배경 / 결정 / 검토한 대안 / 예상되는 결과를
  포함해서 `docs/adr/` 아래 마크다운으로 저장한다.
- 큰 틀에서 작업이 완료되면 해당 작업 내용과 다음 할 일을 `docs/state/` 아래에
  `날짜_시간-제목.md` 형식의 마크다운으로 저장한다.

## 7. 임의로 하지 않는 것

`MVP_SPEC.md` 38 장의 금지 사항이 그대로 적용된다.

새 블록, 새 가구, 새 방 레시피, 새 NPC 역할, 새 자원, 새 게임 메커닉,
새 프레임워크를 임의로 추가하지 않는다.

특히 다음은 명시적으로 금지한다.

```text
물리 엔진 도입 (Rapier / Havok / cannon)
WebGPURenderer 로 전환
React 도입
절차적 지형 생성
방 판정 조건을 임의로 완화하거나 강화하는 것
```

좋아 보이는 아이디어라도 `TASK-022` 와 `TASK-033` 을 통과하기 전에는
범위를 넓히지 않는다.

## 8. 두 개의 검증 지점에서 멈춘다

v1 의 두 지점(TASK-022·033)은 사람의 플레이로 통과했다. v2 의 지점은 다음 둘이다(`docs/dotori/TASKS.md`).

```text
VG1   가꾸는 마을: 내가 놓은 것이 지어지고 주민이 쓰는 모습을 계속 보고 싶은가
VG2   분주한 마을: 생산과 짐 나르기가 마을을 더 살아 있게 하는가
```

v1 의 원래 두 지점:

```text
TASK-022   방을 만들고 인식시키는 과정이 즐거운가
TASK-033   밤에 주민이 내가 만든 방으로 걸어 들어가는 것이 만족스러운가
```

부정적이면 다음 Phase 로 넘어가지 않는다.
콘텐츠를 추가하지 말고, 판정·진단 문제와 감성·표현 문제를 나눠 개선한다.
방 조건 변경이 필요하면 먼저 MVP_SPEC과 관련 ADR·완료 조건을 함께 개정한다.
두 검증 지점의 실패는 작업 기록만 남기고 건너뛸 수 없다.

## 9. 이 프로젝트는 두 번 전면 개정되었다

2026-09-26 v2(도토리 마을)로 두 번째 개정을 했다([ADR 049](docs/adr/049-direction-dotori-living-village.md)).
v1 문서와 코드는 지우지 않았고 동결했다. v1 정본의 본문은 v2 작업의 기준이 아니다.


Version 0.2 는 2D Top-down / Phaser 3 / Prefab 건물 4 종이었다.
Version 1.0 에서 드래곤 퀘스트 빌더즈 2 형 3D 복셀 게임으로 재정의되었다.

폐기된 ADR(001 / 002 / 005 / 009)을 읽을 때는 상단의 폐기 사유를 먼저 본다.
**그 문서의 본문은 더 이상 구현 기준이 아니다.**
`docs/state/`는 작성 당시의 기록이다. 파일명의 시각만으로 최신 명세를 판단하지 않는다.
현재 기준과 과거 기록의 관계는 `docs/README.md`에서 확인한다.
