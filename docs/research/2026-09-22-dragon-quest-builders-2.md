# 드래곤 퀘스트 빌더즈 2 조사

조사일: 2026-09-22
조사 목적: 프로젝트 목표를 이 게임과 같은 구조로 재정의하기 위한 사실 확인
관련 결정: ADR 011 / 012 / 013 / 015

---

# 0. 이 문서의 위치

**이 문서는 정본이 아니다. 근거다.**

```text
MVP_SPEC.md       우리가 무엇을 만드는가          ← 정본
ARCHITECTURE.md   우리가 어떤 구조로 만드는가      ← 정본
docs/adr/         우리가 왜 그렇게 결정했는가      ← 정본
docs/research/    그 결정이 기댄 외부 사실         ← 이 문서
```

ADR 011 ~ 015 는 "DQB2 는 이렇게 동작한다" 를 전제로 결정을 내렸다.
그 전제가 어디서 왔는지가 남아 있지 않으면, 나중에 전제가 틀렸을 때
어느 결정까지 다시 봐야 하는지 알 수 없다.

이 문서는 그 추적을 위해 존재한다.

## 0.1 신뢰도에 대한 정직한 고지

2026-09-22 정정: DQB2의 건물 파괴가 레벨을 떨어뜨린다는 주장은 재확인하지 못했다.
[확인 기록](2026-09-22-review-source-check.md)을 따른다. 이 주장을 현재 결정의 사실 전제로 사용하지 않는다.


```text
조사 방법    웹 검색 결과 요약
직접 플레이   하지 않았다
1 차 자료     공식 문서 / 개발자 인터뷰를 확인하지 않았다
2 차 자료     위키 / 리뷰 / 공략 / 플레이어 포럼
```

따라서 아래 사실들은 **플레이어 커뮤니티가 관찰한 동작** 이지
개발사가 명시한 사양이 아니다.

특히 다음은 검증되지 않았다.

```text
방 판정의 정확한 내부 알고리즘
감사 포인트의 정확한 획득량
레벨업 게이트의 정확한 조건식
```

**우리 프로젝트의 모든 수치는 우리가 정한 것이다.** DQB2 의 수치가 아니다.
정본은 `MVP_SPEC.md` 34 장이다.

---

# 1. 게임 개요

```text
장르       1 인 플레이 샌드박스 액션 RPG
표현       3D 복셀 (각진 블록)
핵심       각 챕터의 중심 마을을 재건한다
```

출처: [Dragon Quest Builders 2 — Dragon Quest Wiki][w1],
[GameSpot 리뷰][r2]

마인크래프트처럼 시작하지만 곧 갈라진다.
**마을 관리 / 농사 / 마을 방어 / 퀘스트** 에 큰 비중이 있다.

출처: [Dragon Quest Builders 2 — Dragon Quest Wiki][w1]

---

# 2. 세 개의 루프

조사 결과를 정리하면 DQB2 의 재미는 하나의 루프가 아니라 셋이 겹친 구조다.

이 정리는 **우리의 해석이다.** 출처에 이렇게 쓰여 있지 않다.
각 루프를 이루는 개별 사실만 출처가 있다.

## 2.1 요청 루프

```text
주민이 퀘스트를 준다  →  플레이어가 만들어 준다  →  스토리와 레시피가 열린다
```

마을 주민이 주변을 개선하기 위한 퀘스트를 주고, 완료하면 스토리가 진행되며
새 아이템 제작 능력이 열린다.

퀘스트 완료 보상은 **감사(gratitude)** 이며, 이것이

```text
새 아이템 제작 레시피
거점 NPC 의 능력 향상
건축 / 농사 / 채굴 / 몬스터 처치를 돕는 새 주민
```

으로 이어진다.

출처: [Dragon Quest Builders 2 — Dragon Quest Wiki][w1], [RPGamer 리뷰][r1]

## 2.2 인식 루프 — 방 레시피

**이것이 DQB2 의 정체성이다.**

빈 방의 조건:

```text
벽으로 둘러싸인 공간
벽 높이 2 블록 이상
문
```

여기에 가구를 추가하면 욕실 / 침실 / 주방 등이 되고, 그 대가로 감사를 얻는다.

출처: [GamesRadar 방 레시피 가이드][g1]

세트 레시피는 **논리적으로 배치** 해야 한다.

> 레시피에 테이블, 좌석, 음식이 있으면
> 음식을 테이블 위에, 의자를 테이블 옆에 두어야 인식된다.

출처: [GamesRadar 방 레시피 가이드][g1]

**주민이 방을 어떻게 사용하는가가 감사 포인트를 만든다.**
그 포인트로 블록 / 아이템 레시피, 탐험 해안 지역, 후반부 블록 직접 구매를 해금한다.

> 방이 주민의 필요에 잘 맞을수록 더 많은 포인트를 얻는다.

출처: [Room Recipes — Dragon Quest Wiki][w2]

주방에 제대로 된 조리 설비가 있으면, 재료를 넣어 두면 **주민이 대신 요리한다.**

출처: [GamesRadar 방 레시피 가이드][g1]

## 2.3 성장 루프 — 빌더의 종과 베이스 레벨

```text
감사 포인트가 충분해진다
    ↓
빌더의 종을 친다  →  포인트를 소비한다
    ↓
베이스 레벨이 오른다 (최대 4)
    ↓
주민이 늘고, 더 좋은 아이템이 열리고, 주민이 하는 일이 늘어난다
```

출처: [Dragon Quest Builders 2 — Dragon Quest Wiki][w1],
[GameFAQs — 빌더의 종][f2]

세부 사실:

```text
베이스 레벨 최대 4. 단, 마지막 챕터만 3
각성의 섬(영구 거점)에는 레벨이 없다
종은 구역별로 하나씩 필요하다 (Scarlet Sands / Green Gardens / Cerulean Steppes)
감사 포인트는 후반에 섬 해금과 은둔자와의 거래 화폐가 된다
```

출처: [GameFAQs — 각성의 섬 베이스][f1], [GameFAQs — 빌더의 종][f2],
[Neoseeker 공략][n1]

---

# 3. 그 밖의 시스템

## 3.1 주민의 자동 건설 (청사진)

```text
플레이어가 청사진을 깔고 근처 상자에 재료를 넣는다
    ↓
주민이 지어 준다
```

플레이어가 처음 40~50 블록을 놓아 방식을 보여주면 나머지를 주민이 채운다.
아주 큰 청사진은 사실상 전부 주민이 짓는다.

출처: [Game Informer 리뷰][r3], [Steam 커뮤니티 — 청사진 토론][s1]

## 3.2 주민 직업

```text
농부 / 광부 / 상인 / 가수 / 무희 / 병사 등
```

출처: [Dragon Quest Builders 2 — Dragon Quest Wiki][w1],
[GameRant — 최고의 주민][m1], [Neoseeker — 영입 가능 NPC][n2]

## 3.3 낮 / 밤과 방어

```text
낮 / 밤 사이클이 있다
밤에 나오는 몬스터의 종류와 흉포함이 달라진다
몬스터가 플레이어의 건축물을 부술 수 있다
베이스 레벨 하락 여부는 재검증 필요 (아래 정정 참조)
주기적으로 보스가 이끄는 몬스터 무리의 습격을 막아야 한다
```

출처: [Dragon Quest Builders 2 — Dragon Quest Wiki][w1]

## 3.4 챕터 구조

챕터마다 다른 섬에서 중심 마을을 재건한다.
그 위에 리셋되지 않는 영구 거점 "각성의 섬" 이 누적된다.

출처: [Dragon Quest Builders 2 — Dragon Quest Wiki][w1], [GameFAQs][f1]

---

# 4. 조사 사실 → 우리 결정 매핑

**이 표가 이 문서의 핵심이다.**
어떤 사실이 어떤 결정을 떠받치고 있는지가 여기에 있다.

## 4.1 그대로 가져온 것

| DQB2 사실 | 출처 | 우리 결정 |
|---|---|---|
| 벽 + 높이 2 + 문 = 빈 방 | [g1] | ADR 012 / MVP_SPEC 11.2 |
| 천장을 요구하지 않는다 | [g1] | ADR 012 (좌절 감소) |
| 가구 배치의 논리성을 판정한다 | [g1] | ADR 012 / MVP_SPEC 12.1 |
| 주민이 방을 쓰는 것이 포인트를 만든다 | [w2] | ADR 013 / MVP_SPEC 22.1 |
| 종을 쳐서 포인트를 소비해 레벨을 올린다 | [w1][f2] | ADR 013 / MVP_SPEC 23 |
| 레벨업이 주민 수와 레시피를 해금한다 | [w1][r1] | MVP_SPEC 23.1 / 23.2 |
| 주방에 재료를 두면 주민이 요리한다 | [g1] | MVP_SPEC 16 |
| 몬스터가 건축물을 부순다 | [w1] | ADR 015 |
| 밤에 몬스터가 나온다 | [w1] | MVP_SPEC 24 |
| 3D 복셀 블록 월드 | [w1] | ADR 011 / ADR 014 |

## 4.2 의도적으로 다르게 한 것

| DQB2 사실 | 출처 | 우리 결정 | 이유 |
|---|---|---|---|
| 건물 파괴에 따른 레벨 하락 여부 미확인 | [w1] 재검증 실패 | 레벨 비감소는 독립적인 설계 정책 | ADR 013. 해금과 도착한 주민의 비가역성 |
| 베이스 레벨 최대 4 | [f1] | 최대 3 | 수직 슬라이스 분량 |
| 감사 포인트가 후반에 화폐가 된다 | [w2][n1] | 소비처는 종 하나뿐 | 가격표라는 새 밸런스 축을 만들지 않는다 |
| 지형을 포함해 파괴 가능 | [w1] 암시 | 지형 블록은 파괴되지 않는다 | ADR 015. 섬을 관통하는 터널 방지 |

## 4.3 지금은 가져오지 않은 것

| DQB2 사실 | 출처 | 상태 |
|---|---|---|
| 주민 자동 건설 (청사진) | [r3][s1] | 확장 후보 3 단계 |
| 주민 직업 6 종 이상 | [w1][m1][n2] | 확장 후보 2 단계 |
| 챕터 구조 + 영구 거점 이중 구조 | [w1][f1] | 확장 후보 4 단계 |
| 보스 습격 | [w1] | 확장 후보 5 단계 |
| 구역별 종 여러 개 | [f2] | 섬 1 개라 불필요 |

---

# 5. 확인하지 못한 것

**아래는 조사로 답을 얻지 못했다. 우리가 직접 설계했다.**

```text
방 판정의 flood fill 구현 방식        →  MVP_SPEC 11.3 은 우리 알고리즘이다
방 크기 상한이 존재하는지              →  우리는 100 으로 두었다 (무한 확산 방지)
지형 블록을 벽으로 인정하는지           →  우리는 인정하지 않기로 했다 (MVP_SPEC 8.4)
방 판정 실패 시 플레이어에게 알려주는지   →  우리는 진단 UI 를 필수로 두었다 (MVP_SPEC 11.5)
감사 포인트의 정확한 획득량             →  우리가 정했다 (MVP_SPEC 22.1)
레벨업 게이트 조건식                   →  우리가 정했다 (MVP_SPEC 23.1)
몬스터의 블록 파괴 속도                →  우리가 정했다 (breakSeconds × 2.0)
```

"방 판정 실패를 알려주는가" 는 특히 중요하다.

DQB2 가 어떻게 하는지 확인하지 못했지만,
**진단이 없으면 게임이 그 자리에서 끝난다** 는 판단으로 필수 기능에 넣었다.
이것은 조사 결과가 아니라 우리의 설계 판단이다.

---

# 6. 출처 목록

## 위키

[w1]: https://dragonquest.fandom.com/wiki/Dragon_Quest_Builders_2
[w2]: https://dragonquest.fandom.com/wiki/Room_Recipes_(Dragon_Quest_Builders_2)

- [w1] Dragon Quest Builders 2 — Dragon Quest Wiki (Fandom)
- [w2] Room Recipes (Dragon Quest Builders 2) — Dragon Quest Wiki (Fandom)

## 가이드

[g1]: https://www.gamesradar.com/dragon-quest-builders-2-room-recipes/
[g2]: https://www.pcgamer.com/dragon-quest-builders-2-recipes-room-food-cooking/
[g3]: https://www.thegamer.com/dragon-quest-builders-2-guide-room-recipes/

- [g1] Dragon Quest Builders 2 room recipes — GamesRadar   ★ 방 조건의 주 출처
- [g2] Dragon Quest Builders 2 recipes — PC Gamer
- [g3] A Complete Guide To Room Recipes — TheGamer

## 리뷰

[r1]: https://rpgamer.com/review/dragon-quest-builders-2-review/
[r2]: https://www.gamespot.com/reviews/dragon-quest-builders-2-review-building-on-a-stron/1900-6417219/
[r3]: https://gameinformer.com/review/dragon-quest-builders-2/rebuilding-hope-one-block-at-a-time

- [r1] RPGamer 리뷰
- [r2] GameSpot 리뷰
- [r3] Game Informer 리뷰

## 공략 / 커뮤니티

[f1]: https://gamefaqs.gamespot.com/boards/215335-dragon-quest-builders-2/77864132
[f2]: https://gamefaqs.gamespot.com/boards/215335-dragon-quest-builders-2/77864133
[n1]: https://www.neoseeker.com/dragon-quest-builders-2/faqs/3075038-walkthrough.html
[n2]: https://www.neoseeker.com/dragon-quest-builders-2/errata/builderdoms_best
[m1]: https://gamerant.com/dragon-quest-builders-2-best-townspeople-recruit/
[s1]: https://steamcommunity.com/app/1072420/discussions/0/2626094636170679677/?l=english

- [f1] GameFAQs 게시판 — 각성의 섬 베이스 / 레벨
- [f2] GameFAQs 게시판 — 빌더의 종
- [n1] Neoseeker FAQ / Walkthrough
- [n2] Neoseeker — Builderdom's Best (영입 가능 NPC)
- [m1] GameRant — Best Townspeople And How To Recruit Them
- [s1] Steam 커뮤니티 — 청사진 토론

**커뮤니티 출처([f1][f2][n1][n2][m1][s1])는 플레이어의 관찰이다.**
개발사의 사양이 아니며, 패치로 달라졌을 수 있다.

---

# 7. 이 문서를 다시 봐야 할 때

```text
방 인식이 플레이어의 직관과 계속 어긋난다
    →  3 장의 방 조건과 5 장의 "확인하지 못한 것" 을 다시 읽는다
    →  필요하면 DQB2 를 직접 플레이해 판정 방식을 관찰한다

감사 포인트의 획득 빈도가 지루하거나 너무 빠르다
    →  4.1 의 "주민이 방을 쓰는 것이 포인트를 만든다" 는 유지하되
       MVP_SPEC 22.1 의 수치만 조정한다. 이 문서는 수치의 근거가 아니다

챕터 구조로 확장을 검토한다
    →  3.4 와 4.3 을 다시 읽고, 각성의 섬 구조를 추가 조사한다
```
