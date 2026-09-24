# TASK-049 피해 보고 — 완료

Date: 2026-09-25
Status: **완료**. 사람 확인 HR-024 대기
관련 정본: MVP_SPEC 25.1 / 25.4 / 29

## 변경한 것

| 영역 | 파일 |
| --- | --- |
| 07:00 아침 보고(지난 보고 뒤 이력의 파괴 칸 수, 하루 한 번, 보고 시각 저장), DAMAGE_REPORT | `systems/RepairSystem.ts`, `EventBus.ts` |
| 보고 창(모달, 아무 키·클릭으로 닫기, 조작 중일 때 연다) | `ui/DamageReportPanel.ts`, `main.ts` |
| 미수리 칸 붉은 반투명 상자(InstancedMesh, 숨쉬는 밝기) | `render/DamageMarkView.ts`, `materials.createDamageMarkMaterial` |

## AC

| AC | 결과 | 근거 |
| --- | --- | --- |
| 습격 다음 아침 패널 | 통과 | 테스트(07:00 에 한 번) + 브라우저(Day 2 아침 창) |
| 파괴된 블록 수 표시 | 통과 | 테스트(3 / 2) + 브라우저("지난밤 블록 6 개") |
| 좌표를 붉게 표시 | 통과(에이전트 관찰) | 브라우저: 벽 구멍의 붉은 상자 |
| 수리되면 표시가 사라짐 | 통과 | 표시는 미수리 목록만 그린다(수리·플레이어 해결 테스트, TASK-048) |
| 피해가 없으면 패널 없음 | 통과 | 테스트 |
| 아침 전 수리한 피해도 지난밤 수에 포함, 미수리 표시만 사라짐 | 통과 | 테스트 |

## 검증

- `pnpm test` 444 통과(신규 damageReport 4), lint·typecheck·build 통과.
- headless Chrome `?scene=kitchen-lab`: 22:00 에 침실 벽 여섯 칸을 몬스터 편집으로 없앤 뒤 06:59 → 07:00, 보고 창과 붉은 표시.

## 다음 단계

1. PERF-002 (역할 시스템이 모두 연결된 뒤 성능 측정)
