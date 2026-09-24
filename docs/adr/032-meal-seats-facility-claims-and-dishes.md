# ADR 032. 식사: mealId·의자 후보, NPCSystem 시설 예약, 식탁 음식 연출

Status: Accepted
Date: 2026-09-24
Basis: TASK-032 구현과 테스트(`tests/meal.test.ts` 9 개, 판단 단위 테스트 2 개, kitchen-lab 장면 테스트), headless Chrome 관찰. 새 외부 조사 없음.
Related: ADR 008 / 025 / 030 / 031
Amends: MVP_SPEC 17.1 신설·34(meal.eatGameMinutes), ARCHITECTURE 12.1(NPC.mealId)·13.4(ActionServices.meal, facilityClaim)·14(DiningSeat)·15(MealSystem), ADR 031 결정 1·4

## 배경

MVP_SPEC 17 은 식사 구간, mealId 와 hasEatenThisMeal, 식당·광장·food 0 의 결과를 정했지만 다음은 비어 있었다.

- 먹는 데 걸리는 시간과 food 를 소비하는 시점.
- 주민이 의자를 어떻게 얻고, 같은 의자를 두 명이 잡지 않게 하는 방법.
- food 0 일 때 "먹지 않고 넘어간다"를 판단에서 처리할지 Action 실패로 처리할지.
- 식탁 위 음식 연출을 누가 어떻게 그리는가.
- TASK-031 에서 화덕 예약을 CookingSystem 에 두었는데, MVP_SPEC 12.4·ARCHITECTURE 14.4 는 의자·화덕 같은 임시 시설 예약을 NPCSystem 이 소유한다고 정한다.

## 결정

1. **MealSystem** 이 식사 구간 판정과 hasEatenThisMeal·mealId 의 유일한 변경자다. update 10 번에서 판단 전에 돈다.
   구간 안에서 주민의 mealId 가 현재 구간과 다르면 갱신하고 플래그를 초기화한다. 같으면(로드·같은 구간 재진입) 두지 않는다.
   NPC 엔티티에 `mealId` 를 더했다(SaveData 의 npcs 항목에 이미 있는 필드).
2. **의자 후보**: DiningRoom 의 diningSeats 를 방 이벤트로 유지하고, 의자에 맞닿은 식탁 칸(의자 둘레 네 칸만 읽는다)을 찾아 `tableTop` 을 붙인다.
   식사 구간에 아직 먹지 않은 주민에게만 가까운 빈 의자 하나를 준다. 없으면 광장 칸에서 먹는다(12.5).
3. **임시 시설 예약은 NPCSystem 이 소유**한다. Action 의 `facilityClaim`(objectId)이 바뀌면 옮기고, 다른 주민이 잡은 시설은 잡지 않는다.
   Cooking / Meal 은 `facilityTaken(objectId, npcId)` 로 후보에서 뺀다. 화덕 예약도 여기로 옮겼다(ADR 031 보완). CookingSystem 은 재료 예약만 갖는다.
   가는 중부터 잡으므로 경로 실패·취소·구간 종료로 Action 이 바뀌면 예약이 풀린다.
4. **food 0 은 판단에서 거른다**: 식사 계획은 food ≥ 1 일 때만 만든다. 먹으러 가는 도중 다른 주민이 마지막 음식을 먹으면 EatAction 이 시작에서 실패하고 다음 판단에서 넘어간다.
5. **소비 시점은 앉을 때**다(농사의 "도착 즉시 확정"과 같은 틀). 한 트랜잭션으로 food −1 과 hasEatenThisMeal = true.
   이후 `meal.eatGameMinutes`(20 게임분) 동안 먹는 모습을 보인다. 판단은 먹는 중이면(actionKind 'eat') 구간 동안 유지한다.
   감사 포인트 +2(식당 의자만)는 GratitudeSystem(TASK-035) 이 생기면 이 트랜잭션에서 요청한다.
6. **식탁 위 음식은 렌더 모형**(render/DishView, InstancedMesh 둘)이다. 식당 의자에서 먹는 주민 앞 식탁 윗면에 그릇과 음식을 놓는다. 블록이 아니다.
   요리사가 식탁까지 걸어가 음식을 놓는 동작은 두지 않는다. 새 역할 동작이 되고 12:00 식사 이동과 겹치기 때문이다. 사람 확인(HR-015)에서 부족하면 다시 본다.
7. **자세**: 의자면 의자 윗면(usePosition)에 앉아 식탁을 보고 숟가락질, 광장이면 바닥에 앉아 먹는다. 의자·식탁이 아직 정육면체라
   높이가 어색한 것은 TASK-SHAPE-001 에서 맞춘다.
8. **관찰 장면**: kitchen-lab 에 식당 한 채(식탁 1, 의자 3)를 더하고 시작 저장소를 fixture 의 `startStorage` 로 일반화했다(crop 4, food 3).

## 검토한 대안

- **다 먹은 뒤 소비**: 여러 주민이 마지막 음식 하나를 두고 모두 앉았다가 한 명만 먹는다. 앉은 주민이 이유 없이 굶는 장면이 된다.
- **food 0 이면 앉아서 실패**: "먹지 않고 넘어간다"보다 불필요한 이동이 생기고, 플레이어에게 음식이 있는 것처럼 보인다.
- **화덕 예약을 CookingSystem 에 유지**: 의자 예약만 NPCSystem 에 두면 같은 개념의 소유자가 둘이 되고 정본과 다르다.
- **요리사의 배식 동작**: 연출 가치가 있으나 새 동작·순서 규칙이 필요하다. 최소 연출로 먼저 확인한다.

## 예상되는 결과

- 주민 수가 늘어도 의자 후보 계산은 의자 수에 비례하고, 예약 조회는 Map 한 번이다.
- TASK-035 에서 감사 포인트 +2·+3 을 식사·조리 트랜잭션에 붙인다. TASK-039 의 foodLevel 은 이 소비 결과를 읽는다.
- TASK-051 저장은 NPC 의 mealId·hasEatenThisMeal 만 저장하고 예약은 저장하지 않는다.
