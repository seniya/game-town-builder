# ADR 031. 요리: 화덕 후보·예약, 재료 예약·완료 소비, 조리 자세

Status: Accepted (결정 1·4 의 화덕 예약 소유자는 ADR 032 가 보완)
Date: 2026-09-24
Basis: TASK-031 구현과 테스트(`tests/cooking.test.ts` 13 개, `tests/npcDecision.test.ts` 요리 판단 1 개), headless Chrome 관찰. 새 외부 조사 없음.
Related: ADR 008 / 025 / 030
Amends: MVP_SPEC 16.1 신설, ARCHITECTURE 13.4(ActionServices.cooking)·14(CookCandidate 구현)·15(CookingSystem 책임), types(UsePose 'cook')

## 배경

MVP_SPEC 16 은 입력·출력·소요·조건과 "시작 때 예약, 완료 때 소비"를 정했지만 다음은 비어 있었다.

- 누가 화덕 목록을 갖고, 요리사에게 어느 화덕을 주는가.
- 재료 예약을 어디에 두는가. VillageStorage 는 seed / crop / food 세 값만 소유한다(ARCHITECTURE 27).
- 조리 도중 역할 시간이 끝나거나(12:00) 주방이 해제될 때의 처리.
- "1 게임시간"을 실초로 잴지 게임분으로 잴지.
- 화덕을 쓰는 동작을 이동·대기와 구별하는 방법.

## 결정

1. **CookingSystem 이 화덕 목록·화덕 예약·재료 예약·결과 확정을 소유**한다. 화덕 목록은 방 이벤트(ROOM_*)로 dirty 표시하고
   조회 때 Kitchen 의 cookingSpots 에서 다시 만든다. 부서진 화덕은 방 재판정을 기다리지 않도록 목록을 만들 때 블록을 확인해 뺀다.
   슬롯은 따로 두지 않고 update 10 번에서 SleepSystem 과 함께 판단 전에 갱신한다(4.1 의 순서를 바꾸지 않는다).
2. **후보**: 역할 작업 시간에 요리사에게만 가까운 빈 화덕 하나와 `ingredientsReady`(다른 요리사 예약을 뺀 crop ≥ 2)를 준다.
   음식 양·식사 여부는 보지 않는다(ARCHITECTURE 14.4 의 "음식 부족 조건을 새로 넣지 않는다").
3. **재료 예약은 VillageStorage 밖, CookingSystem 안**에 둔다. 저장소 값은 완료 때만 바뀐다. 예약은 저장하지 않으며
   로드(`resetForLoad`)·취소·실패 때 버린다. 소비 전이므로 돌려줄 것이 없고, 완료는 트랜잭션 한 번으로 crop −2·food +3 을 확정한다.
   crop 이 예약 합계보다 적어지면(STORAGE_CHANGED) 나중에 잡은 예약부터 푼다.
4. **화덕 예약**은 가는 중(MoveAction 의 목적 `cook`)부터 잡는다. NPCSystem 이 Action 을 바꿀 때 `cookStove` 로 옮긴다(농사의 `farmTarget` 과 같은 틀).
   → ADR 032 보완: 처음에는 화덕 예약을 CookingSystem 안에 두었으나 MVP_SPEC 12.4·ARCHITECTURE 14.4 는 임시 시설 예약을
   NPCSystem 이 소유한다고 정한다. 식사 의자와 함께 NPCSystem 의 `facilityClaim` 예약으로 옮겼다. CookingSystem 은 재료 예약만 갖는다.
   같은 화덕으로 가는 이동 → 조리는 유지하고, 조리에서 다른 Action 으로 바뀌면 화덕·재료 예약을 함께 푼다.
5. **시간은 게임분**으로 잰다(시작 gameMinutes + 60). 디버그 배속·시각 앞당기기와 일관된다.
6. **역할 시간이 끝나면 조리를 중단**한다. 판단이 역할 작업을 내지 않으면 기본 행동으로 바뀌고 예약만 풀린다. 다음 역할 시간에 처음부터 다시 한다.
   진행분을 저장하지 않는 이유는 예약을 저장하지 않는 규칙(ARCHITECTURE 23)과 맞추기 위해서다.
7. **조리 자세**: UsePose 에 'cook' 을 더했다. 렌더는 화덕을 보고 곧게 서서 한 팔로 젓고, 화덕 위로 김 스프라이트 셋을 올린다.
   밭일(허리 굽힘)과 구별된다. 게임 위치는 접근 셀 그대로다(ARCHITECTURE 12.3).
8. **관찰 장면·디버그**: `?scene=kitchen-lab`(취침 실험장 + 주방 한 채, 09:00, crop 4)과 F3 "작물 +2"·요리 줄. 기존 블록만 쓴다.
9. **감사 포인트 +3** 은 GratitudeSystem(TASK-035) 이 생기면 완료 트랜잭션에서 ActionServices 포트로 요청한다. 지금은 없다.

## 검토한 대안

- **VillageStorage 에 reserved 필드 추가**: 저장소가 예약 개념과 저장 형식까지 갖게 된다. 예약은 저장하지 않는 임시 상태라 조리 도메인에 두었다.
- **시작 때 소비하고 취소 때 돌려주기**: MVP_SPEC 16 과 다르고, 취소 경로 하나를 놓치면 재료를 잃는다.
- **역할 시간이 끝나도 진행 중 조리는 마치기**: 12:00 식사 이동(TASK-032)과 충돌하고 판단 우선순위(14.1)의 예외가 된다.
- **실초 타이머**: 배속·시각 앞당기기에서 게임 시간과 어긋난다.
- **조리에도 'work' 자세 재사용**: 밭일과 같은 동작이 되어 "화덕을 사용하는 조리 동작"을 구별하기 어렵다.

## 예상되는 결과

- TASK-032 식사의 의자 예약도 같은 틀(소유자 후보 + NPCSystem 이 옮기는 예약)을 쓸 수 있다.
- 요리사가 여러 명이거나 화덕이 여러 개여도 후보 계산은 화덕 수에 비례하고 월드 크기와 무관하다.
- TASK-SHAPE-001 에서 화덕 모양을 바꿀 때 조리 자세의 손 위치를 함께 맞춘다.
