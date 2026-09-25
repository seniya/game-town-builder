# DQB2 의 보이는 방식과 방 확장 사례 (확장 로드맵용)

Date: 2026-09-25
Purpose: 오너 지시("너무 마인크래프트 느낌이 난다, 자제하고 드래곤퀘스트 빌더즈 2 의 캐릭터를 참고하자")와
확장 로드맵의 방 후보를 정하기 위한 조사. 사용처: [ADR 044](../adr/044-art-direction-cute-rounded-not-minecraft.md),
[확장 로드맵](../project/EXPANSION_ROADMAP.md).

## 1. 확인한 사실

| # | 사실 | 출처 | 신뢰도 |
| --- | --- | --- | --- |
| F1 | DQB2 의 캐릭터 디자인은 토리야마 아키라가 맡았다(말로스·남녀 주인공 포함) | [Anime News Network 2018-04-08](https://www.animenewsnetwork.com/news/2018-04-08/dragon-quest-builders-2-game-reveals-akira-toriyama-design-for-malroth/.130105), [Wikipedia: Dragon Quest Builders 2](https://en.wikipedia.org/wiki/Dragon_Quest_Builders_2) | 높음(뉴스·백과 일치) |
| F2 | 감독 니이노는 "마인크래프트의 블록 스타일이 초기 드래곤 퀘스트의 도트 그림과 닮았다" 는 점을 영감으로 들었고, 차별점으로 "NPC 와 함께 짓고, 내가 만든 환경에서 그들의 생활을 엿보는 것" 을 강조했다 | [RPG Site E3 2019 인터뷰](https://www.rpgsite.net/interview/8651-dragon-quest-builders-2-interview-at-e3-2019-we-talk-with-square-enix-about-the-expanding-world-of-dragon-quest) | 높음(개발자 발언 직접 인용) |
| F3 | 세계는 블록이지만 캐릭터는 셀 셰이딩된 매끈한 모델이며, 마인크래프트처럼 의도적으로 픽셀화한 모습이 아니다 | 검색 요약(원문 페이지 미확인, [Wikipedia: Dragon Quest Builders](https://en.wikipedia.org/wiki/Dragon_Quest_Builders) 등) | 중간(2 차 요약) |
| F4 | 리뷰들은 DQB2 의 화면을 "색이 선명하고 깨끗하다", "둥글고 다채로운 토리야마 그림체가 친근한 느낌을 준다", "super-deformed(머리가 큰 SD) 그림체가 매력적이다", "귀엽고 익살스러운 표정", "가구·건물·아이템에 예술적 품질이 있다" 고 묘사한다 | [RPGamer](https://rpgamer.com/review/dragon-quest-builders-2-review/), [Game Rant](https://gamerant.com/dragon-quest-builders-2-review/), [Back2Gaming](https://www.back2gaming.com/review/dragon-quest-builders-2-review-ps4/) (검색 결과 요약) | 중간(리뷰어 인상, 요약 경유) |
| F5 | 주인공 복장은 기능적인 모험 복장: 긴 모자·고글·스카프·재료 가방·큰 벨트, 남녀가 색을 뒤집은 배색(파랑 튜닉/빨강 스카프 ↔ 빨강 튜닉/파랑 스카프) | [Dragon Quest Wiki: Builder](https://dragon-quest.org/wiki/Builder_(Dragon_Quest_Builders)) | 높음(팬 위키, 공식 이미지 기반) |
| F6 | 방 레시피 사례: 기본 침실(침대 2·조명 1), 공동 욕실(욕조 2·수건 2·대야 2·조명 1), 꽃밭(꽃 6·식물 4, 야외), 대장간(화로 1·상자 1·걸이 가방 1·항아리 1), 기본 바(칵테일 카운터 세트 1), 도구점(탁자·가격표·가게 간판·상자 2). 레시피는 100 개가 넘는다 | [Dragon Quest Wiki: Room recipes (DQB2)](https://dragon-quest.org/wiki/List_of_room_recipes_in_Dragon_Quest_Builders_2), [GamesRadar](https://www.gamesradar.com/dragon-quest-builders-2-room-recipes/) | 높음(팬 위키·공략 일치) |
| F7 | 주민은 욕실에서 목욕하고 그 사용이 감사 포인트를 만든다 | [PC Gamer](https://www.pcgamer.com/dragon-quest-builders-2-recipes-room-food-cooking/) 등 검색 요약 | 중간 |

## 2. 해석 (이 프로젝트에 적용)

- F2·F3 가 핵심이다. **블록은 "짓는 재료" 이고, 사람과 생활은 블록이 아니다.** DQB2 는 블록 세계 위에
  둥근 SD 캐릭터와 세밀한 가구를 올려 "생활을 엿보는 장면" 을 만든다. 현재 이 프로젝트는 주민·가구·아이콘까지
  모두 상자와 픽셀 노이즈 텍스처로 되어 있어 마인크래프트처럼 보인다.
- 따라서 바꿀 곳의 우선순위는 **주민(형태·얼굴·재질) → 가구·소품(식별성) → 블록 텍스처(노이즈 → 부드러운 손그림풍)
  → 조명·색·UI** 다. 블록 편집·방 판정 격자는 그대로 둔다.
- F6·F7 은 "새 방 = 새 주민 행동" 이 DQB2 에서도 확장의 중심임을 보여 준다. 쉼·위생(욕실), 야외 가꾸기(꽃밭)는
  생산 체인을 늘리지 않고도 주민의 새 모습을 만든다.

## 3. 확인하지 못한 것 · 주의

- DQB2 캐릭터의 정확한 등신비(머리:몸)를 공식 자료로 확인하지 못했다. "SD, 머리가 크다" 는 리뷰 묘사(F4)뿐이다.
  로드맵의 "2.5~3 등신" 은 이 묘사에 기댄 작업 가설이며 시안으로 정한다.
- 이미지·영상은 직접 보지 못했다(도구 한계). 오너가 레퍼런스 이미지를 주면 이 문서에 추가한다.
- 블록 텍스처·조명 처리(외곽선 유무, 그림자 방식)의 구체 기법은 조사하지 않았다.
- **DQB2 의 캐릭터·몬스터·로고·에셋은 저작물이다.** 형태·비율·배색의 원칙만 참고하고, 특정 캐릭터(말로스·주인공·슬라임 등)를
  닮게 만들거나 에셋을 가져오지 않는다.
