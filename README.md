# 작은 마을 복구 게임 (game-town-builder)

폐허가 된 작은 마을을 복구하고, 주민들이 플레이어가 만든 시설을 실제로 사용하며
살아가기 시작하는 모습을 관찰하는 2D Top-down 게임이다.

> 죽어 있던 작은 마을을 내가 만든 것들로 살아 움직이게 만드는 게임

## 핵심 루프

```text
Problem  →  Explore  →  Build  →  Life  →  Change
```

건설 자체가 목표가 아니다. 건설에는 항상 건설해야 하는 이유가 있고,
건설의 결과는 주민의 행동 변화로 눈에 보여야 한다.

## 현재 상태

```text
단계    문서 설계 완료. 구현 미착수 (TASK-001 부터 시작)
범위    MVP — 20~30분 분량의 첫 사이클 1회
맵      64 × 64 타일 1개
주민    3명 (농부 / 요리사 / 목수) + 엔딩에서 1명 추가
건물    4종 (밭 / 주방 / 집 / 방벽)
```

## 기술 스택

```text
Node.js 24 LTS  /  pnpm
TypeScript 5.x (strict)
Phaser 3.x (3.90 이상, 4.x 금지)
Vite 8.x  —  SPA. React / Next.js 를 사용하지 않는다
Vitest 3.x
Tiled 1.12 이상 (맵 제작, JSON export)
```

버전의 정본은 `package.json` 과 `pnpm-lock.yaml` 이다.
문서는 메이저 버전 제약만 규정한다.

## 문서

읽는 순서가 정해져 있다.

```text
docs/project/GAME_DESIGN.md   왜 만드는가 / 무엇이 재미여야 하는가
docs/project/MVP_SPEC.md      무엇을 만드는가          수치와 조건식의 정본
docs/project/ARCHITECTURE.md  어떤 구조로 만드는가      인터페이스의 정본
docs/project/TASKS.md         어떤 순서로 만드는가      Acceptance Criteria 의 정본
docs/adr/                     구조적 결정 기록
docs/state/                   작업 완료 기록과 다음 할 일
```

에이전트 작업 규약은 `AGENTS.md` 에 있다.

## 개발

```bash
pnpm install
pnpm dev      # 개발 서버
pnpm test     # Vitest
pnpm build    # 프로덕션 빌드
```

게임 로직은 Phaser 와 분리하여 작성하므로, 테스트는 Phaser Scene 없이 실행된다.

## 성공 기준

기능의 개수가 아니다.

플레이어가 밭을 완성했을 때 농부가 그곳으로 걸어가 일을 시작하고,
주방을 만들었을 때 주민들이 저녁에 모여 밥을 먹고,
밤이 되면 플레이어가 만든 집으로 돌아가 잠드는 모습을 보면서

> 이 마을을 조금 더 키워보고 싶다.

라고 생각하게 만드는 것이다.
