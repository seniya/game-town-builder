# 문서 검토 중 외부 근거 확인

조사일: 2026-09-22
관련 검토: ../state/2026-09-22_1802-design-review.md

## 범위

현재 설계의 기술 스택 호환성 주장을 공식 자료로 확인했다.
프로젝트에는 package.json과 lockfile이 없어 실제 의존성 설치·빌드 검증은 하지 않았다.
기존 조사에 수록된 모든 링크를 재검증한 것은 아니다.

## Vite / Vitest

- [Vite 8 공식 발표](https://vite.dev/blog/announcing-vite8): 2026-03-12에 Vite 8 정식 출시를 발표했다.
- [Vitest 4.1 공식 발표](https://vitest.dev/blog/vitest-4-1): Vite 8 지원 추가를 명시한다.
- [Vitest v3.2.4 공식 소스의 package.json](https://raw.githubusercontent.com/vitest-dev/vitest/v3.2.4/packages/vitest/package.json): vite 의존 범위는 ^5.0.0 || ^6.0.0 || ^7.0.0-0 이다. Vite 8은 포함되지 않는다.

**판단:** 문서의 Vite 8.x / Vitest 3.x를 검증된 단일 Vite 조합으로 간주하면 안 된다.
확인한 3.2.4를 사용하면 Vitest 쪽에 별도 Vite 버전이 설치될 수 있다.
이 사실만으로 설치 또는 모든 테스트가 반드시 실패한다고 단정하지 않는다.
Vite 8을 유지한다면 Vite 8 지원을 명시한 Vitest 4.1 계열 등으로 제약을 정리하고,
TASK-001에서 실제 dev / build / test / 설정 타입 검사를 확인하는 방안을 권고한다.

신뢰도: 높음. 공식 릴리스와 고정 태그의 소스를 확인했다.
미확인: Vitest 3.x의 모든 후속 패치, 실제 pnpm 해석 결과, 공유 설정의 실행 호환성.
이번 검토에서는 스택 정본이나 ADR 011을 변경하지 않았다.

## DQB2의 건물 파괴와 레벨 하락 주장

기존 조사와 ADR 013은 건물 파괴가 DQB2의 베이스 레벨을 떨어뜨린다고 기술한다.
근거로 지정된 [Dragon Quest Wiki 문서](https://dragonquest.fandom.com/wiki/Dragon_Quest_Builders_2)를 열었으나 접근 오류로 본문을 확인하지 못했다.

**판단:** 이번 검토에서는 이 주장을 확인된 사실이나 확인된 오류로 분류하지 않는다.
직접 플레이 또는 신뢰할 수 있는 추가 출처로 재검증하기 전까지는 외부 게임과의 차이를
확정하는 근거로 사용하지 않는 편이 좋다. 우리 게임의 비가역 레벨 정책 자체는
해금과 주민 도착을 되돌리지 않는다는 내부 설계 이유만으로도 설명할 수 있다.

신뢰도: 이번에는 검증 불가.
미확인: DQB2 실제 레벨 하락 여부와 전작 규칙 혼동 여부.
