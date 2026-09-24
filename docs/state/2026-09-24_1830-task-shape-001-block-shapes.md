# TASK-SHAPE-001 기존 블록의 모양 표현 — 완료

Date: 2026-09-24
Status: **완료**. 사람 확인 HR-016 대기
관련 정본: MVP_SPEC 31, ARCHITECTURE 9.3, [ADR 028 보완](../adr/028-shaped-rendering-of-existing-blocks.md#보완-구현-방식-2026-09-24-task-shape-001-착수-전)
해결한 READY: 없음

## 변경한 것

| 영역 | 파일 |
| --- | --- |
| 모양 표(1/16 단위 상자 목록, 방향 규칙 pane / backrest, 의자 앉는 높이 9/16) | `src/game/data/blockShapes.ts` (신규, 순수 데이터) |
| 메셔: 모양 블록을 그리디 마스크에서 빼고 상자 면을 청크 메시에 넣음. 이웃을 가리지 않음, 경계 면 컬링, AO 1, 칸 로컬 UV | `src/workers/greedyMesh.ts` |
| 의자 usePosition 높이를 앉는 판 높이로 | `src/game/room/matchRecipe.ts` |

대상: torch(막대·불꽃) / window(벽 가운데 판유리) / table(상판·다리) / chair(앉는 판·다리·식탁 반대쪽 등받이) /
chest(몸통·뚜껑) / cooking_stove(몸통·윗판·냄비) / water_pot(몸통·테두리) / bell(받침·기둥·몸통·꼭지).
crop 은 CropView(ADR 030), door / bed 는 PropView(ADR 026) 그대로다. 블록 정의(MVP_SPEC 8.1 의 opaque 포함)는 바꾸지 않았다.

## AC

| AC | 결과 | 근거 |
| --- | --- | --- |
| 충돌·통행·방 판정·설치·드롭 테스트 불변·통과 | 통과 | 기존 테스트 356 개 수정 없이 통과 |
| 모양 블록을 많이 놓아도 드로우콜이 늘지 않음 | 통과 | 청크 메시 두 벌(테스트), 브라우저 A/B: 모양 표를 끈 빌드와 1404 / 1404 |
| 브라우저 확인·HR 등록 | 통과(에이전트 관찰) | kitchen-lab 식당·주방·전경 화면. 사람 판단은 HR-016 |
| 이웃 면을 가리지 않고 불투명 이웃에 붙은 자기 면만 지움 | 통과 | 메셔 테스트(횃불 아래 돌 윗면, 식탁 아래 바닥, AO 불변) |
| window 판유리·chair 등받이 방향 | 통과 | 메셔 테스트(±x / ±z 벽, 식탁 네 방향) |
| 256 칸 모양 층 Node 메싱 20 ms 미만·버퍼 두 벌 | 통과 | 평균 5.1 ms, 쿼드 4550 |
| 의자·화덕 높이에 사용 자세가 맞음 | 통과(에이전트 관찰) | 주민이 의자 판 높이에 앉아 식탁을 봄, 요리사가 화덕·냄비 앞에 섬. HR-016 |

## 검증

- `pnpm test` 363 통과(신규 blockShapes 7), lint(src·tests)·typecheck·format·build 통과.
- headless Chrome 148: `?scene=kitchen-lab` view 0 / 3 / 4. 식탁 다리 사이로 바닥이 보이고, 등받이는 식탁 반대쪽이다.
  창문은 벽 두께 가운데에 들어간 판유리로 보인다(에이전트 관찰 — 사람의 판단이 아니다).
- 드로우콜 A/B: `?scene=perf&view=0&orbit=0&residents=5&dpr=1`, 20:10 으로 앞당긴 뒤 9 초. 모양 표 있음 1404, 없음 1404.

## 알려진 한계

- 조준 테두리·파괴 균열은 1 칸 상자다(규칙과 일치, ADR 028 보완 8). HR-016 에서 거슬리는지 본다.
- 모양 블록끼리 맞닿은 불투명 면은 지우지 않는다(작은 겹침). 반투명 판유리끼리는 지운다.
- 모양 상자에는 AO 가 없다. 가구 밑이 밝게 보이면 HR 결과에 따라 바닥 쪽 음영을 검토한다.

## 다음 단계

1. TASK-039 World State
2. 사람 확인: HR-016, HR-015, HR-014, HR-013, HR-012, HR-001 / 006 / 011
