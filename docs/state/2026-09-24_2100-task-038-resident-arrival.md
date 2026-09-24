# TASK-038 새 주민 도착 — 완료

Date: 2026-09-24
Status: **완료**. 사람 확인 HR-019 대기
관련 정본: MVP_SPEC 19.5(보완) / 19.6(신설) / 23.3, ARCHITECTURE 4.1 / 15 / 23.1, [ADR 034](../adr/034-resident-arrival-and-villager-day.md)

## 변경한 것

| 영역 | 파일 |
| --- | --- |
| 레벨별 고유 예약(다음 07:00, 엄격히 뒤)·경계 통과 시 스폰+완료(한 트랜잭션)·스냅샷/복원 | `src/game/systems/ResidentArrivalSystem.ts` (update 8 번) |
| 도착 칸: 섬은 종 남쪽 해안 세 칸 안쪽(`IslandData.residentArrival`), 장면은 fixture `arrivalCell`, 없으면 광장 남쪽 8 칸 | `data/island.ts`, `data/visualFixtures.ts`, `GameWorld.ts`, `main.ts` |
| Villager 는 역할 작업 시간에 광장으로 가서 머문다 | `systems/NPCDecisionSystem.ts` |
| NPC_ARRIVED 이벤트, 화면 상단 "새 주민이 마을에 왔어요" | `EventBus.ts`, `ui/ArrivalToast.ts` |
| spawnResident 에 id 선택 인자 | `GameWorld.ts` |

## AC

| AC | 결과 | 근거 |
| --- | --- | --- |
| 레벨 2 → 다음 아침 1 명 | 통과 | 테스트 + 브라우저(Day 2 07:00 인구 3 → 4) |
| 섬 가장자리에서 걸어 들어옴 | 통과 | 테스트(도착 칸 → 광장) + 브라우저(z 61 → 35.5, "광장으로 가는 중") |
| 도착 즉시 빈 침대 배정 | 통과 | 테스트(빈 침대가 있으면 1 초 안에 배정). 브라우저 장면은 빈 침대가 없어 미배정(정상) |
| 인구 증가로 지표 재계산(100→75, 50→38) | 통과 | 순수 함수 + 게임 테스트 |
| 시간표대로 생활 | 통과 | 테스트(점심 식사, 밤 휴식), 낮에는 광장 |
| 레벨 2·3 같은 날 → 정확히 두 명 | 통과 | 테스트(서로 다른 칸, 같은 레벨 이벤트 중복 무시) |
| EVENT_NEW_RESIDENT 는 스폰하지 않음 | 통과(구조) | 스폰 경로는 ResidentArrivalSystem 하나. 이벤트 평가는 TASK-041 |

## 검증

- `pnpm test` 398 통과(신규 arrival 7), lint(src·tests)·typecheck·build 통과.
- headless Chrome `?scene=kitchen-lab&view=0`: 포인트·침대를 더해 종을 친 뒤 06:58 로 앞당김 → 07:00 도착, 알림, 07:21 광장 도착.

## 다음 단계

1. TASK-040 대사 (F 의 주민 분기를 같은 조준 대상 함수로 연결)
2. 사람 확인: HR-019 이하 대기 목록
