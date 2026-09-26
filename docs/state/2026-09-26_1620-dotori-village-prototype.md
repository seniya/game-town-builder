# 도토리 마을 시뮬레이션 시험판 (2D·3D)

Date: 2026-09-26 16:20

## 배경

오너가 지금까지 만든 결과물이 재미없다고 했다. 대화 끝에 오너가 원한 것이 "컴퓨터로 세상과 삶을 시뮬레이션하는 것"에
가깝다는 점을 확인했다(자세한 흐름은 [제안 문서](../proposals/2026-09-26-world-simulation-prototype.md) 1장).
오너 지시: "너의 제안을 문서로 남기고 해당 개발을 능력껏 진행하자."
본 게임(`src/`)과 정본 문서는 바꾸지 않았다.

## 한 일

- 제안 문서: `docs/proposals/2026-09-26-world-simulation-prototype.md`. `docs/README.md` 보조 문서 목록에 `proposals/` 를 더했다.
- 조사 기록 두 건:
  - `docs/research/2026-09-26-generative-agents.md`: 원문 확인. 비용 "수천 달러"는 확인하지 못해 결정 근거에서 뺐다.
  - `docs/research/2026-09-26-cc0-3d-asset-packs.md`: 팩을 내려받아 License 파일과 동작 목록을 확인했다.
- 시험판 코드: `prototypes/dotori-village/`
  - `sim.js`: 규칙 기반 주민 30명. 성격 10, 직업 7, 욕구, 대화와 호감, 짝사랑과 고백, 소문, 파티, 비, 유령 공포. DOM과 무관하게 node에서도 돈다.
  - `ui.js`: 패널, 속도, 생각 심기, 루프.
  - `render2d.js`: 2판. 머리 큰 캐릭터와 행동별 동작.
  - `render3d.js`: 새로 만든 3D 판. 구성은 다음과 같다.
    - Three.js 0.186.0(본 게임과 같은 판)
    - Kenney Mini Characters: 주민 12종과 걷기, 달리기, 앉기, 줍기, 휘두르기, 끄덕임 동작
    - KayKit Medieval Hexagon: 집, 주점, 시장, 대장간, 풍차, 나무, 소품
    - 코드로 만든 직업 모자와 도구, 낚싯줄과 찌, 우산
    - 낮밤 하늘과 그림자, 등불과 창문 빛, 파티 전구와 깃발, 굴뚝 연기, 오버레이 입자와 말풍선
  - `assets/`: `tools/pack_assets.py` 로 만든 glTF JSON 49개(약 6.4MB)와 라이선스 원문 3개.
    아티팩트가 `.glb` 를 서빙하지 않아 데이터를 품은 `.json` 으로 바꿨다.
- 게시(비공개, 오너 계정)
  - 2D 판: <https://claude.ai/artifact/RfmXdrbSB1jYyCRQmVFJJ7> (Version 2, 모듈로 나누기 전 한 파일본. 규칙과 그림은 같다)
  - 3D 판: <https://claude.ai/artifact/NBoPPzTWGjFH2Pct7rixA7> (Version 1)
- `docs/project/HUMAN_REVIEW.md` 에 HR-037(시험판 판단)을 대기로 추가했다. 오너 확인판을 다시 만들어 같은 URL에 재게시했다(Version 7).
- 린트와 포맷 설정에서 `prototypes/` 를 뺐다(`eslint.config.js`, `.prettierignore`). 브라우저용 JS 실험이라 본 게임 규칙을 적용하지 않는다.

## 검증

- `node` 로 `sim.js` 이틀 진행: 오류 없음. 첫날 파티는 소식을 들은 15명 중 6명이 왔고, 둘째 날은 25명 중 16명이 왔다.
  고백 성공과 실패, 말다툼, 발견 소식이 저절로 생긴다.
- headless Chrome(swiftshader)으로 로컬 정적 서버에서 확인했다.
  - 2D: 모듈 판이 오류 없이 뜬다.
  - 3D: 아침, 12:00, 19:41 장면을 캡처했다. 건물 문 방향, 모자, 그림자, 밤 불빛, 파티 전구가 보인다.
    headless는 초당 몇 프레임이라 동작의 부드러움은 확인하지 못했다.
- **게시된 3D 페이지는 직접 열어 보지 못했다.** 로컬에서 같은 파일로 확인한 것뿐이다. 모듈과 `.json` 에셋 로딩이
  아티팩트 환경에서 막히면 "3D 모델을 불러오지 못했어요" 가 뜬다.
- `pnpm test` 547건 통과, `pnpm typecheck` 통과.
- `pnpm lint` 와 `format:check` 경고는 모두 추적되지 않는 `.claude/`, `.mcp.json` 에서 나온다(이번 변경과 무관).

## 다음 할 일

- HR-037 오너 판단을 받는다. 계속 보고 싶은가, 2D와 3D 중 어느 쪽인가, 어색한 동작은 무엇인가.
- 판단에 따라 두 가지 중 하나로 간다.
  - 제안 3.2(생산 체인과 분주함): 밀 → 방앗간 → 빵집을 수레로 나르고, 오가는 사람을 늘린다.
  - 3D 동작 다듬기: 파티 춤과 앉기 높이, 낚시 방향 등.
- 3D에서 확인할 것:
  - Kenney 캐릭터 12종이 30명에게 반복된다. 모자로만 구별되는 것이 충분한지 본다.
  - 모바일 성능은 측정하지 않았다.
- 방향이 확정되면 GAME_DESIGN 핵심 문장 개정 여부부터 오너와 정한다(제안 5장). 그 전까지 본 게임 정본은 그대로다.
