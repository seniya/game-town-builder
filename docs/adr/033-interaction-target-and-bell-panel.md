# ADR 033. 상호작용 대상 선택(READY-07)과 종 패널·마을 레벨

Status: Accepted
Date: 2026-09-24
Basis: MVP_SPEC 9.2 / 13.2 / 23 / 29, ARCHITECTURE 15 / 17, TASK-036 구현과 테스트. 새 외부 조사 없음.
Related: ADR 013 / 022(화면 상태) / 032
Amends: MVP_SPEC 13.2.1 신설, TASKS 2.5 READY-07, ARCHITECTURE 17(구현 노트)

## 배경

F 는 종·상자·주민과의 상호작용 하나의 키다. 셋이 가까이 있을 때 무엇을 여는지, 벽 너머는 어떻게 되는지,
인식되지 않은 상자에도 기부할 수 있는지가 비어 있었다(READY-07).

## 결정

1. **조준선 하나로 고른다.** 블록 편집의 광선·사거리(reachDistance 5)를 그대로 쓴다. 파괴·설치와 같은 대상을 보므로 플레이어가 예측할 수 있다.
   광선은 첫 고체에서 멈추므로 가림은 따로 계산하지 않는다. 블록보다 가까운 주민 몸체가 광선에 걸리면 주민이 대상이다(대화는 TASK-040).
2. **판정은 게임 쪽 순수 함수**(`systems/interaction.ts` 의 `findInteractTarget`), **모달을 여는 것은 UI 화면 상태 기계**다.
   F 키는 ScreenStateMachine 이 조작 중일 때만 대상 조회를 불러 해당 모달 하나를 연다(한 번에 하나, READY-03).
3. **종 패널 하나**에 [성장] / [저장소] 탭을 둔다. 상자는 같은 패널을 [저장소] 탭만으로 연다. Storeroom 인식은 기부 자격이 아니다
   (창고는 방 수·최초 보너스에만 기여한다, MVP_SPEC 12.4).
4. **기부**: 종류별 한 개 / 전부. 인벤토리 제거와 저장소 추가를 한 번에 한다(부족하면 아무것도 바꾸지 않는다).
5. **VillageLevelSystem**: evaluate 는 현재 상태로 순수 게이트 평가(유효한 방 수는 dirty 제외·EmptyRoom 포함, 지표는 computeWorldState 로 다시 계산).
   ring 은 같은 평가를 다시 하고 GratitudeSystem.spend → level + 1 → VILLAGE_LEVEL_UP. 감소 경로는 없다. 최고 레벨은 cost 0 / gates [] / canRing false.
   음식 게이트 안내는 현재 주민 수 × 2(끼니) × 2(일) × 50% 로 필요한 food 개수를 함께 보인다.
6. **연출**: 합성 종소리(ui/BellSound), 종 둘레의 빛 번짐(render/BellRingView), 카메라의 짧은 흔들림(CameraController). 모두 VILLAGE_LEVEL_UP 구독이다.
7. 해금 적용(TASK-037)과 주민 도착 예약(TASK-038)은 이 이벤트와 level 조회에 연결한다.

## 검토한 대안

- **가장 가까운 대상(거리 원)**: 벽 너머 상자가 열리고, 종·상자가 붙어 있으면 무엇이 열릴지 예측하기 어렵다.
- **Storeroom 안 상자만 기부**: 창고를 먼저 지어야 저장소에 넣을 수 있어 초반 흐름이 막힌다. 종 탭이 이미 대체 경로다.
- **종과 상자에 다른 패널**: MVP_SPEC 13.2 의 "F 는 항상 패널 하나"와 어긋나고 UI 가 두 벌이 된다.

## 예상되는 결과

- TASK-040 대화는 같은 조준 대상 함수의 주민 분기를 쓴다.
- 조준이 어긋나면 F 가 아무것도 하지 않는다. 프롬프트로 대상을 알린다. 체감은 HR 로 확인한다.
