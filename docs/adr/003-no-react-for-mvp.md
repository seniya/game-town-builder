# ADR 003. MVP 에서 React 와 외부 상태 관리 라이브러리를 사용하지 않는다

Status: Accepted
Date: 2026-09-22

## 배경

게임 UI로 Resource HUD, Objective, Interaction Prompt, Build Menu, Game Time,
Dialogue, Debug Panel이 필요하다.

웹 프로젝트이므로 React를 쓰는 것이 자연스러워 보인다.

## 결정

MVP에서 **React 를 사용하지 않는다.**

Redux, Zustand, MobX, RxJS도 사용하지 않는다.

UI는 Phaser의 텍스트·이미지 오브젝트 또는 최소한의 HTML/CSS로 구현한다.

UI는 게임 상태를 소유하지 않고, `*_CHANGED` 이벤트를 구독해서 표시만 한다.

## 검토한 대안

**React + Zustand**

게임 상태를 Zustand에 두고 React가 구독하는 구조.

문제는 게임 루프가 60fps로 상태를 바꾼다는 점이다.
플레이어 위치, NPC 위치, 애니메이션 프레임이 매 프레임 변한다.

이것을 React 상태에 넣으면 렌더 비용이 발생하고, 넣지 않으면
**게임 상태와 UI 상태가 두 곳에 존재**한다.

어느 값이 어느 쪽에 있는지 규칙을 세워도, 새 기능이 추가될 때마다
그 규칙을 판단해야 한다. MVP에서 감당할 복잡성이 아니다.

**React 를 UI 레이어에만 사용**

Canvas는 Phaser가, HUD는 React가 담당하는 분리.

기술적으로 가능하지만 빌드 구성, 두 렌더 트리의 생명주기 동기화,
Dialogue 중 입력 차단 같은 상호작용 처리가 추가된다.

UI가 7개뿐인 MVP에서 얻는 이득보다 비용이 크다.

**Phaser UI 만 사용**

채택. Debug Panel처럼 텍스트가 많은 UI는 HTML 오버레이를 허용한다.

## 예상되는 결과

긍정적:

- 상태의 진실의 원천이 하나다. 게임 시스템이 소유하고 UI는 읽는다.
- 빌드 구성이 단순하고 번들 크기가 작다.
- UI가 Phaser 카메라와 같은 좌표계 안에 있어 월드 좌표 기반 표시
  (NPC 머리 위 대화 표시 등)가 쉽다.

부정적 / 위험:

- Phaser로 복잡한 레이아웃을 만드는 것은 CSS보다 번거롭다.
  Build Menu가 커지면 불편해질 수 있다.
- MVP 이후 UI 규모가 커지면 React 도입을 재검토할 수 있다.
  그때를 대비해 UI는 게임 로직을 소유하지 않는 규칙을 지킨다.
