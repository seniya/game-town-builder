# AGENTS.md

작은 마을 복구 게임 프로젝트의 에이전트 작업 규약이다.

## 1. 문서를 먼저 읽는다

작업을 시작하기 전에 다음 순서로 읽는다.

```text
docs/project/GAME_DESIGN.md   왜 만드는가 / 무엇이 재미여야 하는가
docs/project/MVP_SPEC.md      무엇을 만드는가 (수치와 조건식의 정본)
docs/project/ARCHITECTURE.md  어떤 구조로 만드는가 (인터페이스의 정본)
docs/project/TASKS.md         어떤 순서로 만드는가 (Acceptance Criteria 의 정본)
```

부수 문서:

```text
docs/adr/     구조적 결정 기록
docs/state/   작업 완료 기록과 다음 할 일
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
10. commit
```

## 5. 코드 작성 규칙

- 모든 함수에 주석을 작성한다.
- `any` / `@ts-ignore` / `@ts-nocheck` 를 사용하지 않는다. 불가피하면 이유를 주석으로 남긴다.
- `src/game/entities/` 아래의 어느 파일도 Phaser 를 import 하지 않는다.
- 밸런스 수치를 로직 안에 직접 쓰지 않는다. `src/game/data/` 에 둔다.

## 6. 기록 규칙

- 주요 변경점이 생기면 commit 및 push 를 진행한다.
- 주요한 기술 결정은 ADR 형식으로 정리한다. 배경 / 결정 / 검토한 대안 / 예상되는 결과를
  포함해서 `docs/adr/` 아래 마크다운으로 저장한다.
- 큰 틀에서 작업이 완료되면 해당 작업 내용과 다음 할 일을 `docs/state/` 아래에
  `날짜_시간-제목.md` 형식의 마크다운으로 저장한다.

## 7. 임의로 하지 않는 것

`MVP_SPEC.md` 81장의 금지 사항이 그대로 적용된다.

새 NPC, 새 건물, 새 자원, 새 게임 메커닉, 새 프레임워크를 임의로 추가하지 않는다.

좋아 보이는 아이디어라도 핵심 게임 루프 검증 전에는 범위를 넓히지 않는다.
