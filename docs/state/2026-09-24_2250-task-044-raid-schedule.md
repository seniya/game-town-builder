# TASK-044 습격 스케줄 — 완료

Date: 2026-09-24
Status: **완료**. 몬스터 이동·파괴는 TASK-045
관련 정본: MVP_SPEC 24.1 / 24.4 / 24.5, ARCHITECTURE 4.1 / 18, ADR 015

## 변경한 것

| 영역 | 파일 |
| --- | --- |
| 습격 예약·시작·05:00 소멸·전멸 종료·결과 이력·도달 기록·파괴 예산(16) | `src/game/systems/RaidSystem.ts` (8 번, 도착 앞) |
| 몬스터 엔티티(체력 3, MonsterAction) | `src/game/entities/Monster.ts`, `EntityRegistry<NPC, Monster>` |
| 스폰 칸: 섬은 IslandData.monsterSpawns, 장면은 fixture `monsterSpawns` | `GameWorld.ts`, `main.ts`, `visualFixtures.ts` |
| RAID_STARTED / RAID_ENDED, WorldState lastRaid·이벤트 raidResults 연결 | `EventBus.ts`, `GameWorld.ts` |
| 몬스터 모형(보라 몸통·뿔·빛나는 눈, 걷기 튐·파괴 부딪침·피격 번쩍임) | `src/render/MonsterView.ts`, `materials.createEmissiveMaterial` |

## AC

| AC | 결과 | 근거 |
| --- | --- | --- |
| 레벨 2 뒤 첫 21:00 에 3 마리 | 통과 | 테스트(20:59 0, 21:00 3) + 브라우저(21:00 3 마리) |
| 레벨 3·1 차 종료 뒤 첫 21:00 에 5 마리 | 통과 | 테스트 |
| 그 외의 밤 없음 | 통과 | 테스트(사흘 밤) |
| 05:00 소멸 | 통과 | 테스트 |
| 같은 습격 두 번 없음 | 통과 | 테스트 |
| RAID_STARTED / RAID_ENDED | 통과 | 테스트 |
| 같은 날 두 레벨 → 순서대로 한 번씩 | 통과 | 테스트(1 차 3 마리 → 다음 밤 2 차 5 마리) |
| 1 차를 21~24 시 처치 → 2 차는 종료보다 엄격히 뒤인 다음 21:00 | 통과 | 테스트(같은 밤·새벽 없음, 다음 날 21:00) |

추가: 도달 기록은 한 마리 한 번, safetyLevel 67(3 마리 중 1 도달).

## 검증

- `pnpm test` 419 통과(신규 raid 5), lint·typecheck·build 통과.
- headless Chrome `?scene=kitchen-lab`: 레벨 2 로 바꾸고 20:59 → 21:00 에 몬스터 3 마리(모서리 스폰). 지금은 제자리에 서 있다(TASK-045 전).
- 시계가 크게 건너뛸 때(시각 앞당기기) 1 차 종료와 2 차 예약이 한 프레임에 이어지도록 고쳤다.

## 다음 단계

1. TASK-045 몬스터 AI 와 블록 파괴 ★
