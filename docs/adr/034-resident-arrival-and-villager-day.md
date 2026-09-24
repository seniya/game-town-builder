# ADR 034. 새 주민 도착과 Villager 의 낮 생활

Status: Accepted
Date: 2026-09-24
Basis: MVP_SPEC 19.1 / 19.5 / 23.3, ARCHITECTURE 4.1(8 번)·15·23.1(residentArrivals), TASK-038 구현과 테스트. 새 외부 조사 없음.
Related: ADR 025 / 033
Amends: MVP_SPEC 19.5 보완·19.6 신설, ARCHITECTURE 15 구현 노트, IslandData.residentArrival

## 배경

TASK-038 AC 는 "섬 가장자리에서 걸어 들어온다"와 "서 있기만 하지 않는다"를 요구한다. 그러나 Villager 는 역할이 없어
MVP_SPEC 19.5 의 기본 행동만으로는 07:00~18:00 에 도착 칸에서 대기만 한다. 도착 칸과 예약 처리 순서도 정해져 있지 않았다.

## 결정

1. **ResidentArrivalSystem**(update 8 번)이 도착 예약과 스폰의 유일한 소유자다. VILLAGE_LEVEL_UP 을 받아 레벨 키로 한 번만 예약하고
   (`dueAtGameMinutes` = 종 시각보다 엄격히 뒤인 다음 07:00), 그 시각을 넘긴 첫 프레임에 스폰과 완료 표시를 함께 한다. 스냅샷에 넣는다.
2. **Villager 의 낮**: 역할 작업 시간(07~12, 13~18)에는 광장 칸으로 가서 머문다. 새 규칙이 아니라 "역할 없음"의 기본 행동을 광장으로 정한 것이며,
   이로써 도착 직후 마을로 걸어 들어오는 장면이 생긴다.
3. **도착 칸**: 섬은 종에서 남쪽으로 해안까지 가서 해안 세 칸 안쪽 땅(`IslandData.residentArrival`). 시험 장면은 fixture 가 준다.
   GameWorldInit 에 없으면 광장 중심에서 남쪽 8 칸의 설 수 있는 칸, 그것도 없으면 광장 칸이다.
4. **연출**: NPC_ARRIVED 이벤트와 화면 상단 알림(ui/ArrivalToast). 침대 배정은 SleepSystem 이 스폰 직후 다시 계산한다.
5. 진행 이벤트(EVENT_NEW_RESIDENT, TASK-041)는 스폰하지 않고 도착 사실만 읽는다.

## 검토한 대안

- **도착용 별도 Action(마을로 걷기)**: 판단이 다음 프레임에 기본 행동으로 덮어쓰므로 판단 예외가 필요하다. 광장 기본 행동이 더 단순하다.
- **도착 즉시 광장에 스폰**: "걸어 들어온다"를 만족하지 않는다.
- **정원 초과 검사**: 레벨마다 한 명만 예약하므로 인원이 정원(4 / 5)을 넘지 않는다. 별도 검사를 두지 않는다.

## 예상되는 결과

- TASK-041 의 EVENT_NEW_RESIDENT 는 population 과 예약 완료를 읽는다. TASK-051 저장은 residentArrivals 를 그대로 쓴다.
