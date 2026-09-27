# 다음 세션 인계: V2.5 → V3 → V5 → V4

Date: 2026-09-27 03:30

## 지금 상태

- v2 도토리 마을([ADR 049](../adr/049-direction-dotori-living-village.md)).
  - V0 이식 완료.
  - V1 가꾸는 마을 완료, VG1 통과.
  - V2 분주한 마을 완료([ADR 050](../adr/050-dotori-v2-visible-production-chain.md)).
    VG2 는 오너 기록 "생산체인이 작동하니 조금 재미가 있네" 로 통과(약한 긍정).
- 관찰판: <https://claude.ai/artifact/SK3HbC93q1kHEuvtwAqXLD> (5 판).
  갱신은 `pnpm vite build && node tools/dotori/artifact.mjs <폴더>` 로 묶음을 만든다. 같은 URL 로 다시 게시한다(바뀐 해시 파일만 넘기고 옛 파일은 null).
- 테스트 574 건 통과. 코드 `src/dotori/`, 정본 `docs/dotori/`.

## 다음 계획 (정본: [TASKS 5 장](../dotori/TASKS.md))

1. **V2.5 생산을 마을 성장과 잇기(먼저, 짧게)**: 빵집·주점에서 먹으면 더 즐겁다. 먹거리가 넉넉하면 새 주민이 더 온다.
   밭 → 빵 → 인구 → 집·밭 고리를 돌린다. 새 건물·새 자원 없이 수치와 연결만 바꾼다. DOT-030~033.
2. **V3 이야기가 쌓이는 마을**: 기억, 결혼과 한 집 살림, 생일, 주간 도토리 신문, 일기 문장 늘리기. 게이트 VG3. DOT-040~045.
3. **V5 소리와 계절(V4 보다 앞당김)**: CC0 음원 조사 기록, 시간대 배경음·환경음, 계절 색·행사. DOT-050~053.
4. **V4 큰 마을**: 100 명·큰 지도, LOD·경로 캐시, 실제 창·모바일 측정.

## 새 세션 시작 방법

- AGENTS.md → `docs/dotori/` 네 정본 → TASKS 5 장 순서로 읽는다.
- 확인용 자동 관찰: `vite preview` + headless Chrome(CDP). `?fresh=1`·`?scene=grown`·`?residents=N`·`?debug=1`, `window.__dotori` 손잡이(runUntil·place·closeUp).
- 사람 확인이 필요한 항목은 HUMAN_REVIEW 에 쌓고 일반 Task 는 계속한다. VG3 는 미루지 않는다.
