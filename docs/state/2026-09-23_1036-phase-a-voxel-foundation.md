# Phase A 복셀 기반 구현 — TASK-001~008·027

Date: 2026-09-23
Status: Phase A 9개 Task 완료 — 사람의 시각 확인과 실제 창 브라우저 측정은 대기
구현 기준 커밋: c02524c (시작) → daa2360 … 83fc2f9, 이 기록의 커밋(TASK-008)
관련 정본: MVP_SPEC 5 / 7 / 8 / 10 / 13 / 14 / 33 / 34 / 36, ARCHITECTURE 2.2 / 4 / 5 / 6 / 7 / 9 / 24 / 27
해결한 READY: READY-00, READY-01

## 판단

TASKS 2.3의 순서 001 → 002 → 027 → 004 → 003 → 005 → 006 → 007 → 008로 진행했고
각 Task의 AC를 모두 통과했다. Phase A 끝의 상태("섬이 보인다. 아직 조작할 수 없다")에
도달했다. 새 블록·가구·메커닉·프레임워크는 추가하지 않았다.

자동 테스트 85개, lint·typecheck·build 통과. 브라우저 확인은 headless Chrome 148을
CDP로 구동해 스크린샷·콘솔·계측값을 읽는 방식으로 했다(아래 환경). 사람이 실제 창에서
보고 판단한 결과는 아직 없다. 팔레트가 "어울린다"는 판단은 에이전트의 관찰이다.

## Task별 결과

| Task | 상태 | 변경한 것 | AC |
| --- | --- | --- | --- |
| 001 | 완료 | package.json·lockfile(정확한 버전), tsconfig strict, Vite/Vitest 설정, ESLint flat config(three 격리), Prettier, 빈 캔버스 | 전부 통과 |
| 002 | 완료 | MVP_SPEC 33 폴더(.gitkeep), `types/index.ts`, `balance.ts`(34장 그대로 + `as const`), `voxel/coords.ts` 4함수 | 전부 통과 |
| 027 | 완료 | 타입 안전 EventBus, EntityRegistry(id 기반 가변), VillageStorage, GameWorld 16 슬롯(`attach`) | 전부 통과 |
| 004 | 완료 | `data/blocks.ts` 23개 정의와 헬퍼, `isMultiCell` | 전부 통과 |
| 003 | 완료 | Chunk(Uint16Array 4096), VoxelWorld(크기 주입·지연 청크 생성·revision·dirty 8방향), PlacementIndex, 원자적 editObject | 전부 통과 |
| 005 | 완료 | `workers/greedyMesh.ts` 순수 함수, 균일 AO 병합, 반투명 분리, 계측 옵션 | 전부 통과 |
| 006 | 완료 | `mesher.worker.ts`(배선), `MeshJobQueue`, `ChunkMeshManager`, `copyPadded`, 최소 Renderer, `?scene=mesh-edit` | 전부 통과 |
| 007 | 완료 | ShaderMaterial(materials.ts만), 코드 생성 아틀라스·팔레트, 반구광+방향광, AO 곡선, `?scene=house` | 전부 통과 (팔레트는 에이전트 관찰) |
| 008 | 완료 | `data/island.ts` 고정 섬, `voxel/quarryRespawn.ts`, 기본 장면을 섬으로, `?measure=` 계측 | 전부 통과 |

### 결정 (ADR 021, 정본 반영)

- 그리디 병합은 네 모서리 AO가 같은 면끼리만 한다. ShaderMaterial 하나에 uv 반복·tile·ao 속성.
- 메싱 순서 규칙은 three 없는 MeshJobQueue로 분리해 단위 테스트한다.
- 섬은 손으로 정한 계수의 결정적 식이다. 난수·노이즈 없음.
- 문서 보완: MVP_SPEC 7.4에 종 위치의 지표면 기준(`surfaceY + 1`, 광장 지면 위)을 명시했다.
  `(64, 지표면, 64)`를 지면 블록 자체로 읽으면 종이 땅에 박히고 7.5의 `지표면+1`과 기준이
  달라지기 때문이다. MVP_SPEC 14.2에 READY-01 정책, ARCHITECTURE 6 / 9 / 24에 구현 인터페이스
  (copyPadded·writeInitial·MeshBuffers.tiles·BlockDefinition.cells/translucent·island 계약)를 적었다.
- EventBus의 `INVENTORY_CHANGED: void`는 lint 규칙 때문에 `undefined`로 표기했다(의미 동일).
  아직 payload 타입이 없는 이벤트는 해당 Task에서 정본 이름 그대로 추가한다.
- `BlockChangeSource`는 정본의 player / monster / npc만 둔다. 섬 생성은 `writeInitial`로
  이벤트 없이 쓴다. 채석장 복구의 `by`는 READY-04에서 정한다.

## 검증

### 명령

```text
pnpm test        85 passed (8 files)
pnpm lint        통과 — game/ui/workers 의 'three', 'three/examples/...' import 6건이 에러가 됨을 확인
pnpm typecheck   통과
pnpm build       통과 (three 포함 번들 >500kB 경고만, 코드 분할은 범위 밖)
```

### 측정값

- 메싱 감소량(작은 집 조각 fixture, 테스트에 고정): 컬링 전 696면 → 보이는 면 245 →
  균일 AO 병합 79 쿼드(316 정점). AO를 끄면 29 쿼드(116 정점).
- 섬 총량: 나무 24, log 96, leaves 480(그루당 4 / 20). 종 1개. 채석장 재생 후보는 테스트에서
  80개 초과를 확인(y → z → x 순서).
- 섬 생성 시간: 브라우저 약 21~23 ms, Node 테스트도 1초 기준 통과.
- 초기 메싱 완료: 약 2.15 s(256 청크, 업로드 예산 2개/프레임이 병목), 메시 181개.
- 연속 편집(mesh-edit, 청크 경계 x=15/16과 (16,16,16) 꼭짓점 주변): 20 edits/s와 60 edits/s
  모두 약 700 프레임 동안 최대 프레임 16.8 ms, 33 ms 초과 0회. 60 edits/s는 결과 대부분이
  폐기되어(1,739건) 편집이 멈출 때까지 해당 청크의 새 메시가 늦게 보인다(ADR 021 예상 결과).
  swiftshader(소프트웨어 GL)에서는 초반에 116~133 ms 프레임이 2~3회 있었고 GPU에서는 없었다.

### MVP_SPEC 36 기준 장치와 첫 시험 장면 (TASK-008)

```text
CPU       AMD Ryzen 5 5600 6-Core (12 threads)
GPU       NVIDIA GeForce GTX 1070 8 GiB, driver 535.309.01
RAM       31 GiB
OS        Linux Mint 22.3, kernel 6.17.0-29-generic
브라우저   Google Chrome 148.0.7778.178, --headless=new, ANGLE Vulkan 1.3.242
          WebGL 2.0 (OpenGL ES 3.0 Chromium)
해상도     1280 × 720 (CDP device metrics), DPR = 1
전원 모드   performance (power-profiles-daemon)
재현       pnpm dev → /?orbit=0&view=0&dpr=1&measure=60 (전경) / view=1 (마을 터)
          초기 메싱 완료 후 워밍업 5 s, 이후 60 s
```

| 시험 장면 | 평균 FPS | 하위 1% FPS | 최대 프레임 | 최대 드로우콜 |
| --- | --- | --- | --- | --- |
| 초기 섬 전경 (view 0) | 60.0 | 59.5 | 16.8 ms | 181 |
| 마을 터 근경 (view 1) | 60.0 | 59.5 | 16.8 ms | 117 |

headless의 프레임 제공이 60 Hz로 묶여 있어 GPU 여유는 이 값으로 알 수 없다. 실제 창의
Chrome에서의 같은 측정은 아직 하지 않았다. 네 방·주민 다섯·몬스터 다섯·광원 16개 장면과
연속 편집 장면의 MVP 측정은 해당 기능이 생긴 뒤(H 이후, TASKS 2.6) 한다. 미래 장면을
측정했다고 표시하지 않는다. 방 재판정·A*·로드 시간 예산은 해당 시스템이 없어 미측정이다.

### 화면 관찰 (에이전트, 스크린샷)

- 섬 전경에서 숲(나무 군집) / 채석장(계단식 회색 돌 언덕) / 물가(모래 테두리 연못) /
  마을 터(풀밭의 폐허 기초·판자 조각과 가운데 금색 종) / 어두운 외곽(갈색 흙 지대 2곳)을
  구분할 수 있었다. 바다는 y=24까지 물이며 해변은 모래다.
- 작은 집: 돌벽돌 기초·판자벽·통나무 기둥·문·창문·돌벽돌 박공지붕의 실루엣이 읽혔다.
  창문 너머로 실내의 침대가 비쳐 보였다(반투명 확인). 연못 물 아래 모래가 비친다.
- 정점 AO: AO 값만 출력하는 임시 셰이더로 벽 아래·처마 밑·풀과 벽의 이음부가 어두워짐을
  확인했다. 풀 위 한 칸 폭의 AO는 질감 노이즈 때문에 실제 색에서는 약하게 보인다.
- 초기 단계의 torch·crop은 큐브라 상자처럼 보여 컷아웃 타일(막대·새싹)로 바꿨다.
  아직 큐브 크기의 면이라 가까이서는 얇은 판 네 장으로 보인다. 모양 개선은 해당 기능 Task에서 본다.
- 월드 경계 밖이 air라 바다의 바깥 옆면이 유리 상자처럼 보인다. 플레이 시점은 안개로 가려진다.

사람이 실제로 보고 "작은 집이 사람이 살 것 같은가"를 판단하는 것은 TASK-022의 감성 축에서
다시 확인한다. 이번 관찰을 그 통과로 쓰지 않는다.

## 아직 없는 연동과 후속 확인

- 블록 편집이 발행하는 Nav·방 후보 즉시 무효화(ARCHITECTURE 6.1의 6)는 해당 소유자가 없어
  아직 연결하지 않았다. TASK-020 / 024에서 VoxelWorld의 동기 무효화 포트로 연결한다.
- 저장용 modifiedChunks·PlacementIndex 복원은 TASK-051. `ensureCounterAtLeast`만 준비했다.
- 채석장 복구의 호출 시각·소유 시스템·저장 키는 READY-04 / TASK-023.
- 플레이어 조작 연속 설치의 체감은 TASK-013 이후 다시 본다.
- F3 계측 패널은 TASK-016. 지금은 콘솔 로그와 `window.__gtb`로 읽는다.

## 실제 소요와 재작업

- 한 세션 약 45분(문서 확인 포함). 에이전트 1명, 사람의 개입 없음.
- 재작업: 테스트 좌표 오류 2건(청크 경계 기대값, fixture 밖 좌표), 오래된 메싱 결과의 불필요한
  재등록 제거, 옆면 UV 방향 보정, AO 대각선 규칙 수정, 폐허 하나가 채석장 후보를 덮은 문제,
  `node:fs` 타입 부재로 Vite `?raw` import로 변경. 모두 같은 Task 안에서 해결했다.
- 예상 작업량 갱신(ROADMAP 3): Phase B(8 Task)는 1~2 세션, Phase C(6 Task)는 구현 1~2 세션에
  TASK-022의 사람 플레이 관찰·개선 반복이 더해진다. 022의 재작업량은 관찰 전에는 추정하지 않는다.

## 다음 할 일

1. **READY-06 확정(TASK-009 전)**: 물·월드 경계·발판 상실 시 이동과 복귀를 MVP_SPEC 7 / 9,
   ARCHITECTURE 6 / 8에 반영한다. 새 수영·익사 메커닉은 추가하지 않는다.
2. TASKS 2.3의 다음 묶음 009 → 010 → 012 → 011 → 014 → 013 → 015 → 016. READY-02는 013 전,
   READY-03은 015 전.
3. 사람의 확인(팔레트·실루엣, 영역 구분, 실제 창 측정, 연속 편집 체감)은
   [HUMAN_REVIEW](../project/HUMAN_REVIEW.md)의 HR-001~004로 옮겼다. 확인을 기다리지 않고 진행한다.
