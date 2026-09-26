# CC0 3D 에셋 팩 조사 (도토리 마을 3D 시험판용)

Date: 2026-09-26
Related: [시뮬레이션 시험판 제안](../proposals/2026-09-26-world-simulation-prototype.md)

## 왜 조사했나

코드로 그리는 절차적 그래픽은 도토리 마을 2D 2판 근처가 천장이다.
그래서 이미 만들어진 3D 모델과 동작을 무료로 쓸 수 있는지 확인했다.
오너가 참고로 든 Anno 1800 / 117 수준은 목표가 아니다.
목표는 "잘 만든 인디 게임" 수준에서 캐릭터와 행동이 보이는 것이다.

## 확인한 팩 (2026-09-26 내려받아 파일로 확인)

| 팩 | 출처 | 라이선스 (팩 안 License 파일) | 내용 |
| --- | --- | --- | --- |
| Kenney Mini Characters 1.0 | <https://kenney.nl/assets/mini-characters> | CC0 1.0 | 일상복 캐릭터 12종(남 a~f, 여 a~f), GLB, 스킨 포함, 캐릭터당 약 270KB |
| Kenney Fantasy Town Kit 2.0 | <https://kenney.nl/assets/fantasy-town-kit> | CC0 1.0 | 벽·지붕 모듈, 분수, 가판대, 수레, 등불, 나무, 풍차, 물레방아 등 GLB 167개 |
| KayKit Medieval Hexagon Pack 1.0 | <https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0> | CC0 1.0 | 완성된 건물(집, 주점, 시장, 대장간, 제재소, 풍차, 우물 등, 4색), 나무, 바위, 소품(통, 상자, 자루, 수레 등), glTF 221개 |
| KayKit Adventurers Character Pack 1.0 | <https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0> | CC0 1.0 | 모험가 캐릭터 5종과 동작 76개, 무기와 소품(머그잔, 책 등) |
| KayKit City Builder Bits 1.0 | <https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0> | CC0 1.0 | 현대 도시 소품(이번에는 쓰지 않음) |

Kenney Mini Characters에 들어 있는 동작은 GLB를 열어 확인했다.

```text
static, idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up,
emote-yes, emote-no, holding-right, holding-left, holding-both, (…-shoot),
attack-melee-right/left, attack-kick-right/left, interact-right/left, wheelchair-*
```

KayKit Adventurers 동작에는 걷기, 달리기, 앉기(의자·바닥), 눕기, 환호, 줍기, 상호작용, 도끼질 등이 있다.

- GitHub 저장소의 license 필드는 NOASSERTION이다. 팩 안 LICENSE.txt에는 CC0 1.0이라고 적혀 있어 이를 근거로 삼는다.
- Kenney와 KayKit 모두 제작자 표기를 부탁하지만 의무는 아니다. 시험판 README에 출처를 표기한다.

## 선택

- 주민: **Kenney Mini Characters.** 일상복 차림이라 마을 주민에 맞는다.
  걷기, 달리기, 앉기, 줍기, 상호작용, 휘두르기, 끄덕임/도리질 동작이 있어 시험판의 행동 대부분에 대응한다.
- 건물·나무·소품: **KayKit Medieval Hexagon Pack.**
  완성된 건물이라 조립 없이 바로 놓을 수 있고, 둥글고 부드러운 톤이 귀여운 방향과 맞는다.
- 보조: Kenney Fantasy Town Kit에서 분수, 등불, 가판대, 수레 정도만 쓴다.

## 신뢰도와 확인하지 못한 것

- 라이선스는 내려받은 팩 안의 파일로 확인했다(신뢰도 높음).
  배포처 페이지의 약관이 나중에 바뀔 수 있지만 받은 시점의 CC0 부여는 철회되지 않는 것으로 이해한다.
  법률 검토를 한 것은 아니다.
- 두 제작자의 화풍 차이가 한 화면에서 어색하지 않은지는 사람의 눈으로 판단해야 한다.
- Kenney 캐릭터의 표정은 텍스처에 고정돼 있어 바꿀 수 없다. 감정은 말풍선과 입자 효과로 대신한다.
- 모바일 성능은 측정하지 않았다.
