# 툴체인·패키지 버전 확인 — TASK-001 착수 가능성

Date: 2026-09-22
조사 목적: README와 TASKS TASK-001이 규정한 버전 계열이 현재 실제로 설치 가능한지,
그리고 서로 호환되는지를 착수 전에 확인한다.
조사 범위: npm 레지스트리 메타데이터와 로컬 실행 환경. 실제 설치·빌드·실행은 하지 않았다.

## 방법과 출처

- 출처: npm 레지스트리 (`npm view <pkg> version|dist-tags|peerDependencies|engines`),
  `registry.npmjs.org`, 2026-09-22 조회.
- 로컬 환경: `node -v`, `pnpm -v`, `git --version`, `git ls-remote origin`.
- 각 값은 조회 시점의 스냅샷이다. 레지스트리는 계속 바뀌므로 TASK-001에서
  `pnpm-lock.yaml`로 고정한 값이 정본이 된다.

## 로컬 환경

| 항목 | 값 | 판단 |
| --- | --- | --- |
| Node.js | 24.16.0 | README의 Node 24 LTS 충족. Vite 8의 engines(`^20.19.0 \|\| >=22.12.0`) 충족 |
| pnpm | 11.2.2 | 사용 가능 |
| git | 2.43.0 | 사용 가능 |
| origin | github.com/seniya/game-town-builder | `git ls-remote` 읽기 성공. 로컬 `main`과 원격 `main`이 같은 커밋 |

쓰기 권한은 실제 push 전에는 확인되지 않는다.

## 패키지 버전

| 패키지 | 문서가 규정한 계열 | 조회 시점 최신 | 판단 |
| --- | --- | --- | --- |
| three | 0.18x | 0.186.0 | 충족 |
| vite | 8.x | 8.3.0 | 충족 |
| vitest | 4.1 이상 4.x | 4.x 최신 4.1.11 (전체 최신 5.0.1) | 충족 |
| typescript | 5.x | 7.0.2 | 계열 유지 근거는 아래 참조 |
| eslint | 계열 미지정 | 10.11.0 | typescript-eslint 8.x의 peer(`^8.57 \|\| ^9 \|\| ^10`)와 호환 |

### vitest 4.x를 유지해도 되는 근거

`vitest@4.1.11`의 peer는 `vite: ^6.0.0 || ^7.0.0 || ^8.0.0`이다.
TASK-001이 4.1 이상을 요구한 이유("Vite 8 지원")는 4.1.11에서 충족된다.
`vitest@5.0.1`의 peer도 `^6.4.0 || ^7.0.0 || ^8.0.0`이라 5.x 역시 기술적으로는 가능하다.
5.x로 올릴지는 범위 확대가 아니므로 TASK-001에서 판단하되, 문서가 4.x를 규정했으므로
바꾸려면 README·TASKS를 먼저 고친다.

### TypeScript 5.x를 유지하는 근거

최신은 7.0.2지만, 엔진 격리 규칙(`src/game`·`src/ui`·`src/workers`에서 `three` 금지)을
ESLint로 강제하려면 typescript-eslint가 필요하다. `typescript-eslint@8.70.1`(현재 유일한
stable 계열)의 peer는 `typescript: ">=4.8.4 <6.1.0"`이며 9.x는 게시되어 있지 않다.
즉 TypeScript 6/7에서는 타입 인식 lint 구성이 지금 지원되지 않는다.
문서의 5.x 규정은 현재 도구 생태계와 일치한다. TASK-001에서 `typescript`를
`latest`가 아니라 5.x로 명시적으로 고정해야 한다.

## 문서에 없지만 TASK-001에서 필요한 것

- `@types/three` — three는 타입을 자체 배포하지 않는다. `@types/three@0.186.0`이 three와
  같은 버전으로 존재하므로 devDependency로 함께 고정한다. 이는 새 프레임워크 도입이 아니라
  기존 three 선택의 타입 정의다.

## 확인하지 못한 것

- 실제 설치, `pnpm dev/build/test/lint/typecheck` 성공 여부. TASK-001의 완료 조건이다.
- 브라우저 실행과 WebGL2 동작.
- 원격 push 권한.
- 각 패키지의 런타임 상호 호환(메타데이터상 peer 범위만 확인했다).
