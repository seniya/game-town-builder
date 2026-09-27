# 도토리 마을 — 구조 (v2)

Version: 2.0
Date: 2026-09-26
Status: 정본 — 인터페이스·상태 소유권
Related: [SPEC](SPEC.md), [ADR 049](../adr/049-direction-dotori-living-village.md), [ADR 017](../adr/017-scalable-population-and-world.md)

## 1. 한눈에

```text
dotori.html ─ src/dotori/main.ts
                 │  (루프: 실제 시간 → 틱 수, 입력 → 명령)
                 ├─ sim/      규칙. World 상태를 소유한다. three·DOM 을 모른다. node 에서 돈다
                 ├─ data/     수치·목록·지도. 로직이 없다
                 ├─ render/   three 로 World 를 읽어 그린다. World 를 바꾸지 않는다
                 ├─ ui/       DOM 패널·HUD·도구 막대. World 를 읽고, 바꿀 때는 sim 의 명령 함수만 부른다
                 └─ audio/    Web Audio 배경음악·환경음(ADR 053). World 와 카메라 숫자만 읽는다
```

- v1 코드(`src/game`·`src/render`·`src/ui`·`src/workers`)와 서로 import 하지 않는다.
- ESLint 가 `src/dotori/sim/**`·`src/dotori/data/**`·`src/dotori/ui/**`·`src/dotori/audio/**` 에서 `three` import 를 막는다.
- audio: `compose.ts`(곡 짓기)·`mix.ts`(환경음 크기)는 순수 함수라 node 에서 시험한다. `synth.ts`(음색)·`Sound.ts`(스케줄러)만 Web Audio 를 쓴다.
  듣는 자리는 `Renderer3D.listener()` 가 {x, z, dist, rx, rz} 숫자로 넘긴다.

## 2. 상태 소유권

| 상태 | 소유 | 읽는 쪽 |
| --- | --- | --- |
| `World` (시간·지도·건물·주민·호감·소문·대화·파티·날씨·목재·청사진·소식) | `sim/` | render, ui, save |
| 난수 상태 | `World.rng` (직렬화 가능한 mulberry32) | sim 만 |
| 카메라·선택·따라가기·도구 막대 모드 | `ui/app.ts` 의 `AppState` | render, ui |
| 3D 객체·입자·에셋 캐시 | `render/` | render 만 |

- sim 은 **World 를 인자로 받는 함수**로 짠다(전역 상태 없음). 시험에서 여러 World 를 동시에 돌릴 수 있다.
- 사람·건물은 **id 로 서로를 가리킨다**(객체 참조를 저장하지 않는다). 저장이 그대로 JSON 이 된다.
- sim → 바깥 알림은 `World.out` 큐(소식 줄, 연출 fx)에 쌓고 main 이 프레임마다 비운다. sim 은 콜백을 부르지 않는다.
- 렌더는 틱 사이를 보간하려고 주민의 직전 위치(`px`,`py`)를 읽는다.

## 3. sim 모듈

```text
sim/rng.ts        직렬화 가능한 난수
sim/text.ts       한국어 조사(이/가, 을/를 …), 이름 링크 마크업
sim/types.ts      World · Villager · Building · Blueprint · Act · Rumor · Conversation 형
sim/map.ts        타일 격자, 통과·비용, 장소 목록(밭·숲 가장자리·물가 …) 다시 계산
sim/path.ts       A*(8 방향). 세대 번호로 재사용하는 배열, 틱당 탐색 예산
sim/spatial.ts    주민 공간 격자(이웃 찾기)
sim/world.ts      새 마을 만들기, 조회 도구(byId, aff …)
sim/needs.ts      욕구 감소, 유령 공포 도망
sim/decide.ts     행동 점수(options)·행동 만들기(build)
sim/act.ts        행동 시작·도착·진행·끝, 이동
sim/social.ts     대화·궁합·소문 전파·고백·커플
sim/events.ts     아침·날씨·파티
sim/build.ts      가꾸기: 놓기 검사, 청사진, 목재 나르기, 짓기, 완성, 치우기
sim/arrival.ts    새 주민 이사, 인사하기
sim/stats.ts      인구·빈 자리·행복·매력
sim/produce.ts    생산 사슬: 작물·농부·방앗간·굽기·생선·등짐, 먹거리 여유 (SPEC 9·10)
sim/story.ts      기억·기념일·생일·주간 신문 (SPEC 11)
sim/family.ts     청혼·결혼식·신혼집 이사 (SPEC 11.2)
sim/lines.ts      문장 묶음에서 일기 문장 고르기 (data/lines.ts, SPEC 11.5)
sim/season.ts     28 일 달력의 계절·축제(파티 규칙 재사용), 겨울 눈 (SPEC 12.4·12.5)
sim/save.ts       World ↔ JSON (version 2)
sim/step.ts       한 틱의 순서
sim/commands.ts   UI 가 부르는 명령(생각 심기, 놓기, 치우기, 새 마을)
```

한 틱의 순서(`step`):

```text
t += 1 → (06:00) 아침(계절 소식·축제 → 기억·생일·청혼·신혼집) → 날씨 → 파티·결혼식 → 이사 확인(09:00·15:00, 넉넉하면 12:00)
→ 생일 요약(20:00) → 신문(7 일째 20:00) → 작물·방앗간
→ 주민마다: 직전 위치 저장, 욕구
→ 경로 예산 초기화 → 주민마다: 행동 진행(대화 중이면 건너뜀)
→ 공간 격자 갱신 → 대화 시작 → 대화 진행
→ 완성된 공사 반영 → (매 60 틱) 통계 갱신
```

## 4. 확장 원칙 (ADR 017 이어받음)

- 지도 크기·주민 수는 데이터다. 배열은 `World` 를 만들 때 크기에 맞춰 잡는다.
- 주민 이웃 찾기는 공간 격자로 한다(주민 수의 제곱에 비례하는 이중 반복을 틱마다 돌리지 않는다).
- 경로 탐색은 틱당 예산 안에서만 한다. 예산을 넘은 주민은 다음 틱에 다시 시도한다.
- 장소 목록(밭·숲 가장자리 등)은 지도가 바뀔 때만 다시 계산한다.
- 경로 탐색은 타일 판 번호(`World.tileVer`, `setT` 가 올린다)마다 통과·비용 격자를 한 번 만들고, 같은 시작·도착 칸의 결과를 캐시한다(`sim/path.ts`, SPEC 7.1).
  경로 배열은 여러 주민이 함께 읽으므로 고치지 않는다. 타일을 바꾸는 코드는 반드시 `setT`(또는 판 번호를 올리는 곳)를 거친다.
- 지도 배치(숲·호수·길·크기)는 데이터(`data/villageMap.ts` 의 `LAYOUTS`)다. 마을 가운데(건물·광장·밭) 좌표는 배치와 무관하게 같다.
- 렌더는 같은 모델을 InstancedMesh 로 묶는다(나무·바위·말뚝·작물). 나무·바위·물풀은 32 칸 구역마다 나눠 화면 밖 구역을 그리지 않는다.
- 주민은 개별 스킨 메시다. **LOD 는 render 에만 있다**(SPEC 7.2): 화면 밖은 그리지 않고 동작을 멈추며, 먼 주민은 그림자·입자를 끄고 동작을 띄엄띄엄 갱신한다.
  시뮬레이션은 카메라를 모른다(결정성 유지). 수백 명이 목표가 되면 주민 인스턴싱(뼈대 텍스처)을 다시 검토한다(ADR 054).
- 주민 몸짓(SPEC 13): `render/characters.ts` 가 믹서 자세 위에 머리·몸통·팔 각도를 덧입힌다(믹서 전에 쉬는 자세로 되돌린다).
  일 박자는 `data/motion.ts` 한 곳에 있고, 그리기(치는 순간 입자)와 소리(`audio/mix.strikeSchedule`, 치는 순간 예약)가 함께 읽는다.
- 주민 표정(SPEC 14): `render/face.ts` 가 원본 모형을 복제하기 전에 머리 메시에 모프 넷을 붙인다(눈·입 꼭짓점 고르기와 모양 계산은 three 없는 `data/face.ts`).
  머리는 몸과 다른 재질(`matFace`)을 쓴다. 모프 수가 다른 메시가 한 재질을 나눠 쓰면 그릴 때마다 셰이더를 다시 고른다(ADR 056).
  render 는 동작 시계(`Renderer3D.animClock`)를 숫자로 넘길 뿐이고, audio 는 three 를 모른다.
- 그림자를 드리우는 메시는 `materials.shareShadowDepth` 로 종류별 깊이 재질을 받는다. 새 메시를 장면에 더하는 곳(마을 다시 짓기·주민 만들기)에서 부른다.
- 그림자 카메라는 보는 점을 따라가고, 지면 텍스처는 한 변 4096 을 넘지 않는다(큰 지도).

## 5. render 인터페이스

```ts
interface VillageRenderer {
  load(onProgress: (p: number) => void): Promise<void>; // 에셋
  init(canvas: HTMLCanvasElement, app: AppState): void;
  rebuild(world: World): void;           // 새 마을·불러오기
  syncStatic(world: World): void;        // 건물·청사진·장식이 바뀌었을 때(World.staticVersion 이 바뀌면)
  fx(world: World, v: Villager, kind: FxKind): void;
  frame(world: World, dt: number, dtAnim: number, alpha: number): void;
  pickVillager(sx: number, sy: number): number | null;
  pickTile(sx: number, sy: number): { x: number; y: number } | null;
  focus(x: number, y: number, k?: number): void;
  drawPortrait(canvas: HTMLCanvasElement, v: Villager): void;
}
```

- 에셋은 `public/dotori/assets/*.json`(버퍼를 품은 glTF JSON)이다. 아티팩트 보기 화면이 `.glb`·data:·blob: fetch 를 막기 때문에
  같은 출처 JSON 을 받아 메모리에서 GLB 로 조립한다(시험판 `loadGltf` 와 같은 방식).
- 재질: 코드로 만드는 소품 재질은 `render/materials.ts` 한 곳에서 만든다(AGENTS 5 의 원칙을 v2 에도 적용).

## 6. 시험

- `tests/dotori/*.test.ts` (vitest, node). sim 과 data 만 시험한다.
- 필수: 결정성(같은 시드 → 같은 결과), 이틀 진행 무오류, 파티 개최, 청사진 → 완성, 목재 흐름, 이사, 저장 왕복, 경로 예산.
