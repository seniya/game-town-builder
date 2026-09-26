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
                 └─ ui/       DOM 패널·HUD·도구 막대. World 를 읽고, 바꿀 때는 sim 의 명령 함수만 부른다
```

- v1 코드(`src/game`·`src/render`·`src/ui`·`src/workers`)와 서로 import 하지 않는다.
- ESLint 가 `src/dotori/sim/**`·`src/dotori/data/**`·`src/dotori/ui/**` 에서 `three` import 를 막는다.

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
sim/save.ts       World ↔ JSON (version 1)
sim/step.ts       한 틱의 순서
sim/commands.ts   UI 가 부르는 명령(생각 심기, 놓기, 치우기, 새 마을)
```

한 틱의 순서(`step`):

```text
t += 1 → (06:00) 아침 → 날씨 → 파티 → 이사 확인(09:00·15:00)
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
- 렌더는 같은 모델을 InstancedMesh 로 묶는다(나무·바위·말뚝·작물). 주민은 개별 스킨 메시다(100 명 이상에서는 LOD 가 필요할 수 있다, TASKS V4).

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
