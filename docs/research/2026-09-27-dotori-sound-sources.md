# 도토리 마을 소리: CC0 에셋과 브라우저 합성 조사

Date: 2026-09-27
Task: DOT-050 (docs/dotori/TASKS.md 5.3)
Used by: [ADR 053](../adr/053-dotori-v5-synth-sound-and-seasons.md)

## 물음

도토리 마을에 시간대별 배경음(아침·낮·저녁·밤)과 환경음(새소리·풀벌레·망치질·주점 소음·물·비)을 넣으려 한다.
CC0 녹음·음악 파일을 받아 쓸 것인가, 브라우저의 Web Audio API 로 소리를 만들어 쓸 것인가.

## 확인한 것

| 출처 | 확인 내용 | 신뢰도 |
| --- | --- | --- |
| OpenGameArt "Short Loops Background Music Pack" (hernandack) <https://opengameart.org/content/short-loops-background-music-pack> | CC0, OGG, 루프 4 곡("A Brand New Wisdom"·"Winter Dust"·"Just Saying Tho"·"Swinging Sweet"). 표기는 "Credit is appreciated" 이지만 필수는 아님 | 중간: 페이지 표기만 봤다. 파일 안 메타데이터·곡 길이·음색은 듣지 못했다 |
| OpenGameArt "CC0 Background Ambience" (FGResources) <https://opengameart.org/content/cc0-background-ambience> | CC0 모음. 숲 환경음(Forest Ambience) 한 개가 보였다. 파일 형식·크기는 페이지에 없었다 | 중간: 모음 페이지다. 모음에 든 개별 항목의 라이선스는 항목마다 따로 확인해야 한다(OpenGameArt 모음은 여러 라이선스가 섞일 수 있다) |
| OpenGameArt "CC0 Music" 모음 <https://opengameart.org/content/cc0-music-0> | 검색 결과로 존재만 확인 | 낮음: 열어 보지 않았다 |
| itch.io "cozy + music" 무료 에셋 목록 <https://itch.io/game-assets/free/tag-cozy/tag-music> | "아늑한 마을" 류 무료 음악이 많다. 라이선스는 제작자마다 다르다(CC0·CC-BY·자체 약관) | 낮음: 목록만 봤다 |
| Kenney 오디오 분류 <https://kenney.nl/assets/category:Audio> | 오디오 팩 10 종(Music Jingles, RPG Audio, UI Audio, Impact Sounds …). 긴 배경음악 팩은 보이지 않았다. Kenney 에셋은 CC0 로 알려져 있으나 이 페이지에서 라이선스 문구는 확인하지 못했다 | 중간 |
| 검색 요약 <https://gtstu.com/free-royalty-free-music-indie-games/> | 게임 루프에는 앞뒤 무음이 없는 OGG 가 흔히 권장된다 | 낮음: 2 차 요약 |

Web Audio API 자체(OscillatorNode·BiquadFilterNode·ConvolverNode·AudioBufferSourceNode·GainNode 스케줄링,
사용자 조작 전에는 AudioContext 가 `suspended` 로 시작하는 자동재생 정책)는 표준 동작으로 알고 있으며,
실제 동작은 headless Chrome 에서 확인한다(ADR 053 검증).

## 판단에 쓴 사실

1. **곡 하나하나의 라이선스를 따로 확인해야 한다.** 모음 페이지의 CC0 표기가 모든 항목에 해당한다는 보장이 없다.
   시간대 4 개 × 계절 4 개에 맞는 곡을 모으면 확인할 파일이 수십 개가 된다.
2. **분위기가 한 벌로 맞지 않는다.** 서로 다른 제작자의 곡을 모으면 악기·믹스·음량이 달라 이어 들을 때 튄다.
3. **소리가 마을 상태와 이어져야 한다.** 망치 소리는 실제로 짓는 목수 수와 카메라 거리에, 주점 소음은 주점 안 사람 수에,
   풀벌레는 계절과 시각에 따라야 한다. 녹음 루프는 켜고 끄기만 된다.
4. **아티팩트 보기 화면 제약.** 이 프로젝트의 관찰판은 같은 출처 JSON 만 안정적으로 받는다(ARCHITECTURE 5: `.glb`·data:·blob: fetch 가 막힌다).
   OGG 를 게시해도 재생되는지 확인하지 못했다. 합성은 파일이 없으니 이 위험이 없다.
5. 합성의 약점: 녹음만큼 풍성한 음색은 어렵다. 잔향(ConvolverNode, 만든 잡음 충격응답)과 부드러운 음색(사인·삼각파, 낮은 통과 필터)으로 줄인다.

## 확인하지 못한 것

- 위 CC0 곡을 실제로 들어 보지 못했다(에이전트 환경에 소리 출력이 없다). 합성한 소리도 사람이 들어 봐야 한다(HUMAN_REVIEW).
- 아티팩트 보기 화면에서 AudioContext 가 첫 조작 뒤 재생되는지(iframe 권한). headless 에서는 확인한다.
- 모바일 Safari 의 무음 스위치·백그라운드 동작.

## 결론

지금은 **Web Audio 합성**으로 간다(ADR 053). 파일·라이선스·게시 위험이 없고 마을 상태에 맞춰 바꿀 수 있다.
사람이 들어 보고 음악이 빈약하다고 하면, 위 CC0 후보(특히 hernandack 루프)를 곡별 라이선스 확인 뒤 배경음악만 바꾸는 것을 다음 후보로 둔다.
환경음은 상태 연동이 중요해 합성을 유지한다.
