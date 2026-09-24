# ADR 030. 농사: 밭 목록·후보·예약, 작업 자세, 작물 렌더 모형

Status: Accepted
Date: 2026-09-24
Basis: TASK-030 구현과 테스트(`tests/farm.test.ts` 11 개), headless Chrome 관찰. 새 외부 조사 없음.
Related: ADR 008 / 018 / 025 / 026 / 029
Amends: MVP_SPEC 15.4 신설·34(farm.workPoseSeconds), ARCHITECTURE 5.2(world 의미)·14(FarmCandidate)·15·24(prop)

## 배경

MVP_SPEC 15 는 성장 시간·수확 결과·우선순위를 정했지만 다음은 비어 있었다.

- 농부가 어느 칸에 서서 일하는가(15.3 "접근 가능한 인접 셀").
- 여러 농부(장기 규모)가 같은 칸을 잡지 않게 하는 방법.
- 청크 메시에는 블록 id 뿐이라 crop 의 표시 단계 0 / 1 / 2 와 성숙을 그릴 수 없다.
- "도착 즉시 완료"와 "걷기·심기·수확이 시각적으로 구별된다"(AC)를 함께 만족하는 방법.
- farmland 가 사라질 때 crop 을 지우는 편집의 `by`.

## 결정

1. **FarmSystem 이 farmland 칸 목록을 소유**한다. 초기화·로드 때 청크를 한 번 훑고(허용된 전역 스캔) 이후 BLOCK_CHANGED 로만 갱신한다.
   심은 시각(farmland posKey → gameMinutes)도 FarmSystem 만 소유한다. 성장은 시각 차이로 계산한다(농부와 무관, 매 프레임 비용 없음).
2. **후보**: 농부에게 가까운(맨해튼) 성숙 작물 → seed ≥ 1 이면 빈 밭. 판단(NPCDecisionSystem)은 역할 작업 시간에 농부에게만 묻는다.
   후보 계산은 밭 칸 수에 비례하고 월드 크기와 무관하다(테스트: 16 칸 / 128 칸 월드에서 읽는 블록 수가 같다).
3. **작업 칸**: crop 칸의 수평 이웃 중 NPC 가 설 수 있는 칸, 다른 farmland 위가 아닌 칸 우선. MoveAction 의 목표는 `cells`.
4. **예약**: farmland 칸마다 농부 한 명. NPCSystem 이 Action 을 바꿀 때 `farmTarget` 으로 잡고 푼다(판단은 순수 함수로 남는다).
5. **작업 Action**: PlantAction / HarvestAction 은 start 에서 ActionServices.farm 으로 결과를 한 번 확정하고, workPoseSeconds(0.8 실초) 동안 작업 자세를 보인 뒤 done. 이동은 앞의 MoveAction 이 한다(복합 Action 금지).
6. **작물 렌더 모형**: crop 을 prop 으로 두고 render/CropView 가 칸마다 포기 넷을 단계별(새싹 / 중간 / 큰 포기 / 성숙 이삭)로 그린다. 부위별 InstancedMesh 라 작물 수와 드로우콜이 무관하다(PERF-001 의 교훈).
7. **밭 정리 `by = 'world'`**: 규칙에 따른 환경 변화로 본다. 씨앗은 돌아오지 않는다.
8. **디버그 씨앗 투입**: F3 "씨앗 +5"(TASK-036 기부 경로 전의 시험용).

## 검토한 대안

- **crop 블록 부가 상태로 단계 저장**: 청크 배열·메셔·저장 형식을 바꿔야 한다. 단계는 심은 시각에서 파생되므로 따로 저장할 이유가 없다(MVP_SPEC 32.1).
- **판단 안에서 예약**: decideAction 이 상태를 바꾸게 된다(ADR 008·14.3 위반).
- **작업 시간 동안 결과를 미루기(도착 뒤 0.8 초에 확정)**: 명세 15.3 의 "도착 즉시 완료"와 다르고, 취소 시 결과가 사라지는 경우가 생긴다.

## 예상되는 결과

- 식사(TASK-032)·요리(TASK-031)도 같은 틀(소유자 후보 + 예약 + 짧은 작업 자세)을 쓸 수 있다.
- TASK-SHAPE-001 에서 crop 모양을 다시 정할 때 CropView 를 기준으로 삼는다.
