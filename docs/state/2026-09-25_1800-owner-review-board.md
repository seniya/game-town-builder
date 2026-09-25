# 오너 확인판 (HUMAN_REVIEW.md 의 HTML 사본)

Date: 2026-09-25 18:00

## 한 일

- 사용자 요청: 오너 확인이 필요한 `docs/project/HUMAN_REVIEW.md` 를 HTML 또는 엑셀로 보기 쉽게.
- `tools/human-review/build.mjs` 가 문서의 3 절(대기)·4 절(게이트)·5 절(완료) 표를 읽어
  `tools/human-review/template.html` 에 넣고 `.review/human-review.html` 을 만든다(gitignore).
- 비공개 페이지로 게시: <https://claude.ai/artifact/7F7dRDragvhcFEaHZZ1z6z>
  - 요약(재확인 2·대기 23·기록함·완료 8), 처음 볼 것(HR-029 통과 플레이), 실행 방법, 게이트 G1·G2 통과 표시.
  - 거르기(전체·재확인·대기·아직 안 봄·기록함)와 찾기.
  - 카드마다 장면 주소 링크(실행 주소는 확인자가 바꿀 수 있다)·복사, 확인할 것을 질문 단위 목록으로, 지난 결과.
  - 오너 판단(좋음·고칠 곳 있음·애매)과 메모를 공유 저장소 `results/<HR-ID>` 에 저장.
- 운영 절차를 HUMAN_REVIEW.md 2.1 에 적었다.

## 검증

- 생성 스크립트 실행: 대기 25·완료 8·게이트 2 를 읽음. eslint·prettier 통과.
- headless Chrome 으로 로컬 사본 1 회 렌더 확인(저장소가 없는 보기에서는 읽기 전용 안내가 뜬다).
- 게시 뒤 `results` 컬렉션 조회: 비어 있음(정상). 실제 창에서 저장 버튼을 눌러 보는 것은 오너가 처음 쓸 때 확인된다.
- 엑셀 형식은 만들지 않았다. 판단을 바로 저장·회수할 수 있는 HTML 이 목적에 더 맞다고 봤다.

## 다음 할 일

1. 오너가 확인판에 판단을 남기면 `results` 를 읽어 HUMAN_REVIEW.md 로 옮기고, `bad` 항목을 수정한다.
2. HUMAN_REVIEW.md 를 바꿀 때마다 `node tools/human-review/build.mjs` 뒤 같은 URL 에 재게시한다.
3. 우선 HR-029(TASK-053 통과 플레이)의 결과를 받아 053 을 닫는다.
