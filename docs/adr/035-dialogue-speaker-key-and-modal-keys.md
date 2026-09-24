# ADR 035. 대사: 화자 키, 대화 중 TalkAction, 모달 키 전달

Status: Accepted
Date: 2026-09-24
Basis: MVP_SPEC 19.4 / 27.4, ARCHITECTURE 21 / 23.1(availableDialogues), TASK-040 구현과 테스트. 새 외부 조사 없음.
Related: ADR 010 / 022 / 033
Amends: ARCHITECTURE 21 구현 노트, types(DialogueDefinition / ObjectiveDefinition / GameEventId)

## 배경

대사 데이터(ARCHITECTURE 20 의 예)는 `npcId: 'carpenter'` 처럼 역할 이름으로 화자를 부르지만 실행 중 주민 id 는 `carpenter-3` 이다.
대화 중 주민의 행동(판단 2 단계)과, 모달 안에서 F 로 대사를 넘기는 입력 경로도 정해져 있지 않았다.

## 결정

1. **화자 키**: 창립 주민(farmer / cook / carpenter)은 역할 이름, 그 밖의 주민(Villager)은 NPC id 다(`speakerKey`). 저장의
   availableDialogues.npcId 도 화자 키를 쓴다. MVP 에서 같은 역할의 창립 주민은 한 명이다.
2. **DialogueSystem** 은 화자별 미완료 목록(등록 순서, id 중복 제거, 완료 id 재등록 거부)과 완료 집합, 진행 중 대화 하나를 소유한다.
   끝까지 읽으면 완료 기록 뒤 DIALOGUE_ENDED 를 낸다. Esc 로 닫으면 `abort` — 완료하지 않고 대사가 남는다. 이벤트 버스 말고는 아무것도 받지 않으므로 해금·보상을 줄 수 없다.
3. **대화 중 주민**: 판단 Context 의 `dialogueRequested` 는 이 주민이 진행 중 대화의 상대일 때 참이고, 2 단계에서 TalkAction(제자리, 플레이어를 봄)을 한다.
4. **모달 키 전달**: ModalView 에 선택 `key(code)` 를 두고, 모달이 열려 있으면 Esc 가 아닌 키를 화면 상태 기계가 먼저 그 화면에 준다.
   대사 상자는 F / Space / Enter 로 넘기고 마지막 줄 뒤에 닫는다.
5. **대화 표시**: 들을 대사가 있는 주민 머리 위에 말풍선 "!"(렌더), 조준하면 "[F] 대화하기". 등록은 진행 이벤트(TASK-042)가 한다.

## 검토한 대안

- **창립 주민 id 를 역할 이름으로 고정**: 저장·디버그의 기존 id 규칙(`role-n`)을 바꿔야 한다.
- **Esc 로 닫아도 완료**: 대사를 읽지 않고 목표가 바뀌어 인과가 끊긴다.

## 예상되는 결과

- TASK-041 ObjectiveSystem 은 DIALOGUE_ENDED 의 dialogueId 로 nextObjective 를 적용한다. TASK-042 가 markAvailable 로 표시를 등록한다.
