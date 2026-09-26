# 도토리 마을 (시뮬레이션 시험판)

주민 30명이 과장된 성격대로 알아서 사는 작은 마을이다. 버려도 되는 실험이다.
2026-09-26 ADR 049 로 이 방향이 본 게임(v2)이 되어 `src/dotori/` 에 TypeScript 로 다시 짰다. 이 폴더는 비교용으로 남긴다.
왜 만들었는지와 판단 기준은 [제안 문서](../../docs/proposals/2026-09-26-world-simulation-prototype.md)에 있다.

| 판 | 페이지 | 게시된 곳 (비공개, 오너 계정) |
| --- | --- | --- |
| 2D (위에서 내려다본 지도, 코드로 그린 캐릭터) | `index.html` | <https://claude.ai/artifact/RfmXdrbSB1jYyCRQmVFJJ7> |
| 3D (CC0 에셋, 비스듬히 내려다본 카메라) | `3d.html` | <https://claude.ai/artifact/NBoPPzTWGjFH2Pct7rixA7> |

## 구조

```text
sim.js          시뮬레이션 규칙. DOM·렌더러와 무관하다(node 에서도 돈다)
ui.js           오른쪽 패널, 속도, 생각 심기, 메인 루프. 렌더러를 끼워 넣는다
render2d.js     2D 렌더러
render3d.js     3D 렌더러 (Three.js 0.186.0, jsDelivr importmap)
main2d.js / main3d.js   각 판의 시작점
style.css       공용 스타일
3D 모델은 저장소의 public/dotori/assets/ 를 쓴다(v2 본 게임과 공유, 2026-09-26 이동). 데이터를 품은 glTF JSON(.json)이다
묶는 도구는 tools/dotori/pack_assets.py 로 옮겼다
```

렌더러 인터페이스는 `init(app) / onWorld() / fit() / centerOn(v) / fx(v, kind) / drawPortrait(canvas, v) / frame(now, dt, dtA)` 다.

## 로컬에서 보기

ES 모듈이라 `file://` 로는 열리지 않는다. **저장소 루트**에서 정적 서버를 띄운다(에셋이 public/dotori/assets 에 있다).

```text
python3 -m http.server 8765    → http://localhost:8765/prototypes/dotori-village/index.html , /3d.html
?ff=분  을 붙이면 그만큼 미리 진행한다 (예: /3d.html?ff=750 → 첫날 19:30 파티)
node --input-type=module -e "import * as s from './sim.js'; s.newWorld(1); for(let i=0;i<2880;i++) s.step(); console.log(s.S.feed.length)"
```

## 에셋 출처 (모두 CC0 1.0)

- Kenney Mini Characters 1.0, Fantasy Town Kit 2.0: <https://kenney.nl>
- KayKit Medieval Hexagon Pack 1.0 (Kay Lousberg): <https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0>

라이선스 원문은 `public/dotori/assets/LICENSE-*.txt` 에 있다. 조사 기록: [docs/research/2026-09-26-cc0-3d-asset-packs.md](../../docs/research/2026-09-26-cc0-3d-asset-packs.md)
