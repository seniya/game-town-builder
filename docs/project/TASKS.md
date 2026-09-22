# TASKS.md

# Small Village Restoration Game — Task Breakdown

Version: 1.1
Status: Reviewed Specification — Implementation Pending
Date: 2026-09-22

---

# 1. 문서 목적

이 문서는 **어떤 순서로 만드는가** 를 정의한다.

**Acceptance Criteria 의 정본은 이 문서다.**

## 1.1 Task 하나의 크기 기준

```text
한 번의 작업 세션에서 끝난다
독립적으로 테스트하거나 눈으로 확인할 수 있다
완료 여부를 다투지 않는다
```

## 1.2 Task 작업 절차

```text
 1  TASKS.md 에서 Task 와 Acceptance Criteria 를 읽는다
 2  MVP_SPEC.md 에서 수치와 조건을 확인한다
 3  ARCHITECTURE.md 에서 책임 위치와 인터페이스를 확인한다
 4  필요하면 GAME_DESIGN.md 에서 의도를 확인한다
 5  구현한다
 6  테스트를 작성하고 통과시킨다
 7  브라우저에서 실행을 확인한다
 8  주요 결정이 있었다면 docs/adr/ 에 ADR 을 추가한다
 9  docs/state/ 에 완료 기록과 다음 할 일을 남긴다
10  commit
```

## 1.3 Task 를 임의로 추가하지 않는다

범위를 넓히는 Task 를 만들지 않는다.
필요하다고 판단되면 먼저 `MVP_SPEC.md` 를 고치고 ADR 을 남긴다.

## 1.4 이 문서는 전면 개정되었다

Version 0.2 의 TASK-001 ~ 044 는 Phaser 3 / 2D / Prefab 건물을 전제로 했다.
ADR 011 ~ 015 로 전부 폐기되었다.

번호를 이어 쓰지 않고 001 부터 다시 시작한다.

---

# 2. 단계 개요

```text
Phase A  복셀 기반      TASK-001 ~ 008 + 027    청크 / 메싱 / 렌더 / 섬
Phase B  플레이어       TASK-009 ~ 016    이동 / 충돌 / 블록 편집 / 제작
Phase C  방 인식 ★     TASK-017 ~ 022    detectRoom / 레시피 / 진단
Phase D  시간과 이동     TASK-023 ~ 026, 028 ~ 029, 034    시계 / 통행 / A* / NPC 골격
Phase E  주민 생활 ★   TASK-033 ★ → 030 ~ 032    농사 / 요리 / 식사 / 취침
Phase F  성장          TASK-039 → 035 ~ 038    감사 포인트 / 종 / 해금
Phase G  진행          TASK-040 ~ 043    지표 / 대사 / 목표 / 이벤트
Phase H  방어          TASK-044 ~ 049    습격 / 파괴 / 전투 / 수리
Phase I  마무리        TASK-050 ~ 053    오디오 / 저장 / 엔딩 / 밸런스
```

## 2.1 두 개의 분기점

```text
TASK-022 (방 진단)     Phase C 끝. 방을 만드는 것이 즐거운가
TASK-033 (취침)        Phase E 시작. 주민이 내 방을 쓰는 것이 만족스러운가
```

**두 지점에서 부정적이면 다음 Phase 로 넘어가지 않는다.**

```text
TASK-022 에서 실패      MVP_SPEC 11.2 의 방 조건을 완화한다
                      MVP_SPEC 11.5 의 진단을 강화한다
TASK-033 에서 실패      MVP_SPEC 31 장의 연출을 강화한다
```

콘텐츠를 추가해서 해결하려 하지 않는다.

## 2.2 Phase 경계에서 플레이 가능한 상태

```text
Phase A 끝    섬이 보인다. 아직 조작할 수 없다
Phase B 끝    돌아다니며 블록을 부수고 놓을 수 있다. 마인크래프트 크리에이티브 수준
Phase C 끝    방이 인식된다. 아직 주민이 없다
Phase D 끝    주민 3 명이 시간표대로 걸어다닌다. 아직 일을 하지 않는다
Phase E 끝    취침 검증 후 농사 / 요리 / 식사를 연결한다. ★ 게임의 핵심이 전부 있다
Phase F 끝    감사 포인트가 쌓이고 종을 칠 수 있다
Phase G 끝    대사와 목표가 플레이어를 안내한다
Phase H 끝    밤에 몬스터가 온다. 벽이 부서지고 목수가 고친다
Phase I 끝    저장되고, 소리가 나고, 엔딩이 있다
```

## 2.3 실행 순서와 기존 번호

번호는 식별자다. 본문 위치나 숫자 순으로 실행하지 않고 다음 순서와 의존을 따른다.

1. 001 → 002 → 027 → 004 → 003 → 005 → 006 → 007 → 008
2. 009 → 010 → 012 → 011 → 014 → 013 → 015 → 016
3. 017 → 018 → 019 → 020 → 021 → 022 ★
4. 023 → 024 → 025 → 026 → 028 → 029 → 034 → 033 ★
5. 030 → 031 → 032 → 039 → 035 → 036 → 037 → 038
6. 040 → 041 → 042 → 043 → 044 → 045 → 046 → 047 → 048 → 049
7. 050 → 051 → 052 → 053

027은 초기 공통 골격, 039는 성장 게이트에 필요한 순수 지표 계산이므로 앞당긴다.
033은 농사·요리·식사에 의존하지 않는다. 기존 디버그 기능으로 침실·주민 한 명·시계를
연결해 핵심 취침 경험부터 확인한다. 022를 통과하기 전 주민 단계로 넘어가지 않는다.
아직 구현하지 않은 시스템은 update 슬롯을 비워 두고, 타 시스템 완료 조건을 통과했다고 주장하지 않는다.
TASK 본문은 참조 안정성을 위해 기존 번호 위치를 유지한다.

## 2.4 표기

```text
★   핵심 검증 지점
의존  이 Task 이전에 끝나 있어야 하는 Task
```

---

# Phase A. 복셀 기반

## TASK-001 프로젝트 생성

의존: 없음

작업:

```text
pnpm init. Node 24 LTS
typescript 5.x (strict: true)
vite 8.x (SPA)
three 0.18x
vitest 4.1 이상 4.x (Vite 8 지원)
eslint + no-restricted-imports 로 three 격리 규칙
prettier
```

Acceptance Criteria:

- [ ] `pnpm dev` 로 빈 캔버스가 뜬다
- [ ] `pnpm build` 가 성공한다
- [ ] `pnpm test` 가 0 개 테스트로 성공한다
- [ ] `src/game/` 아래에서 `import * as THREE from 'three'` 를 쓰면 lint 에러가 난다
- [ ] `pnpm-lock.yaml` 이 커밋되어 있다

---

## TASK-002 폴더 구조와 공통 타입

의존: TASK-001

작업:

```text
MVP_SPEC.md 33 장의 폴더 구조를 만든다
src/game/types/index.ts 에 BlockPos / Vec3 / ChunkCoord / posKey 를 둔다
src/game/data/balance.ts 에 MVP_SPEC 34 장을 그대로 옮긴다
좌표 변환 함수 4개 (blockToWorldMin / blockToWorldCenter / standCellToWorldFeet / worldToBlock)
```

Acceptance Criteria:

- [ ] 모든 폴더에 최소 1 개의 파일 또는 `.gitkeep` 이 있다
- [ ] `balance.ts` 가 `as const` 로 선언되어 있다
- [ ] 좌표 변환 4함수의 기준점·왕복 테스트가 통과한다
- [ ] `blockToWorld` 라는 이름의 함수가 존재하지 않는다

---

## TASK-003 Chunk 와 VoxelWorld

의존: TASK-004, TASK-027

작업:

```text
Chunk (Uint16Array 4096, index = x + z*16 + y*256)
VoxelWorld (128 × 64 × 128, getBlock / setBlock)
dirty 청크 추적. 경계 블록이면 인접 청크도 dirty
PlacementIndex + 원자적 editObject. meshRevision 추적
```

Acceptance Criteria:

- [ ] `getBlock` 이 월드 밖 좌표에 대해 0 을 반환한다
- [ ] `setBlock` 이 같은 id 면 `false` 를 반환하고 dirty 를 만들지 않는다
- [ ] 청크 경계(x % 16 === 0)의 블록을 바꾸면 **인접 청크도 dirty** 가 된다
- [ ] `takeDirtyChunks()` 가 중복 없이 반환하고, 호출 후 비워진다
- [ ] 위 전부에 대한 테스트가 있다
- [ ] 침대·문의 점유 칸과 메타데이터가 함께 변경된다. 일부만 실패하면 모두 롤백한다
- [ ] AO를 위해 padded에 변경점을 포함하는 모서리·꼭짓점 이웃도 dirty/revision이 갱신된다
- [ ] 다중 칸 객체에 단일 setBlock을 직접 적용하면 거부한다

---

## TASK-004 블록 정의

의존: TASK-002

작업:

```text
src/game/data/blocks.ts
MVP_SPEC 8.1 의 22 종을 그대로 정의한다
BlockDefinition { id, name, kind, solid, opaque, terrain, breakSeconds, drops }
헬퍼: isSolid / isOpaque / isWallBlock / isFurniture / isTerrain
```

Acceptance Criteria:

- [ ] 공기 제외 22종, 공기 포함 23개가 id 0~22로 연속이다
- [ ] `isWallBlock` 이 plank / stone_brick / window / door 만 true 를 반환한다
- [ ] `isWallBlock(dirt)` 가 false 다 — MVP_SPEC 8.4
- [ ] bedrock / water / bell 의 `breakSeconds` 가 `null` 이다
- [ ] leaves 회수 1개와 씨앗 25% 추가 드롭, 다중 칸 객체의 단일 아이템 드롭이 정의된다

---

## TASK-005 greedyMesh — 순수 함수 ★

의존: TASK-004

작업:

```text
src/workers/greedyMesh.ts
입력: 18³ padded Uint16Array + BlockDefinition[]
출력: MeshData (positions / normals / uvs / ao / indices)
면 컬링 + 그리디 병합 + 정점 AO
불투명 / 반투명 분리
```

Acceptance Criteria:

- [ ] 전부 air 인 청크가 정점 0 개를 만든다
- [ ] 단일 블록 하나가 정확히 6 면 24 정점을 만든다
- [ ] 2 × 1 × 1 로 붙은 같은 블록에서 맞닿은 2 면이 컬링되어 보이는 면이 10 개다
- [ ] 주변 장애물이 없고 재질·AO가 같은 두 블록의 10면이 **쿼드 6개**로 병합된다
- [ ] 경계(padded 의 바깥 1 칸)가 불투명이면 해당 면이 생성되지 않는다
- [ ] `three` 를 import 하지 않는다
- [ ] Worker 없이 Vitest 에서 직접 호출된다
- [ ] AO 유무의 정점 수를 따로 측정하고 면 컬링과 그리디 병합의 감소량을 구분한다

---

## TASK-006 Worker 메싱 파이프라인

의존: TASK-005, TASK-003

작업:

```text
src/workers/mesher.worker.ts  (배선만)
src/render/ChunkMeshManager.ts
18³ padded 뷰를 잘라서 transferable 로 넘긴다
결과를 프레임당 chunkUploadsPerFrame 개까지 GPU 에 올린다
```

Acceptance Criteria:

- [ ] 블록 하나를 바꾸면 해당 청크만 다시 메싱된다
- [ ] 경계 블록을 바꾸면 인접 청크도 다시 메싱된다
- [ ] 청크 경계에 구멍이 보이지 않는다
- [ ] 블록을 빠르게 연속으로 놓아도 프레임이 끊기지 않는다
- [ ] `mesher.worker.ts` 에 메싱 알고리즘이 없다
- [ ] Worker 결과가 역순 도착해도 최신 meshRevision의 메시만 표시된다
- [ ] 처리 중 인접 청크 변경과 연속 편집에서 오래된 결과가 dirty를 해제하지 않는다
- [ ] transferable에 월드 원본 배열을 넘기지 않는다

---

## TASK-007 Renderer 와 materials

의존: TASK-006

작업:

```text
src/render/Renderer.ts — WebGLRenderer / Scene / 카메라
src/render/materials.ts — 재질 생성은 여기 한 곳에만
텍스처 아틀라스 1 장 (플레이스홀더. 블록당 단색이어도 된다)
방향광 + 앰비언트
```

Acceptance Criteria:

- [ ] 청크 메시가 화면에 보인다
- [ ] 블록 종류가 색으로 구분된다
- [ ] 반투명 블록(water / window)이 뒤가 비쳐 보인다
- [ ] `ShaderMaterial` / `MeshStandardMaterial` 생성이 `materials.ts` 밖에 없다
- [ ] 정점 AO 가 적용되어 모서리가 어둡다

---

## TASK-008 섬 생성

의존: TASK-007

작업:

```text
src/game/data/island.ts
128 × 64 × 128 고정 지형 생성 함수
MVP_SPEC 7.4 의 5 개 영역 + 바다
마을 터의 폐허 (부서진 판자벽 / 기초)
마을의 종 1 개
나무 24 그루
```

Acceptance Criteria:

- [ ] 섬이 생성되어 화면에 보인다
- [ ] 숲 / 채석장 / 물가 / 마을 터를 눈으로 구분할 수 있다
- [ ] 마을의 종이 `(64, 지표면, 64)` 에 있다
- [ ] 나무가 24 그루다
- [ ] 생성이 결정적이다. 두 번 실행해도 같은 섬이 나온다
- [ ] 생성 시간이 1 초 이하다
- [ ] MVP_SPEC 36장의 기준 장치·브라우저·DPR·시험 장면을 docs/state에 기록한다

---

# Phase B. 플레이어

## TASK-009 복셀 충돌

의존: TASK-003

작업:

```text
src/game/voxel/collision.ts
AabbBody + moveWithCollision (축 분리 스윕)
step-up (1.0 이하 턱 자동 오르기)
이동 거리 0.4 초과 시 분할
```

Acceptance Criteria:

- [ ] 벽으로 걸어가면 멈춘다. 관통하지 않는다
- [ ] 높이 1 블록 턱을 자동으로 오른다
- [ ] 높이 2 블록 턱은 오르지 못한다
- [ ] 빠르게 낙하해도 바닥을 관통하지 않는다 (속도 -30 테스트)
- [ ] 1 칸 폭 통로를 통과할 수 있다 (폭 0.6)
- [ ] 가짜 `VoxelWorld` 로 테스트한다

---

## TASK-010 플레이어 이동

의존: TASK-009

작업:

```text
InputSystem (WASD / Shift / Space / 마우스)
Player 엔티티 + 이동 / 점프 / 중력
포인터 락
```

Acceptance Criteria:

- [ ] WASD 로 카메라 기준 방향으로 이동한다
- [ ] Shift 로 달린다
- [ ] Space 로 점프하고 한 칸 블록 위로 올라갈 수 있다
- [ ] 캔버스 클릭으로 포인터 락이 걸리고 Esc 로 풀린다
- [ ] 탭을 백그라운드에 뒀다 돌아와도 바닥을 뚫지 않는다 (dt 클램프)

---

## TASK-011 3인칭 카메라

의존: TASK-010, TASK-012

작업:

```text
src/render/CameraController.ts
거리 5.0. 피치 -80° ~ +60°
카메라가 블록에 막히면 거리를 줄인다 (raycast)
```

Acceptance Criteria:

- [ ] 마우스로 캐릭터 주위를 돈다
- [ ] 벽에 붙어도 카메라가 벽을 뚫고 나가지 않는다
- [ ] 위아래 시야가 제한 각도에서 멈춘다
- [ ] 실내에 들어가도 카메라가 벽 밖으로 나가지 않는다
- [ ] 투명한 window도 카메라 충돌을 막는다

---

## TASK-012 레이캐스트와 조준

의존: TASK-007, TASK-010

작업:

```text
src/game/voxel/raycast.ts — 복셀 DDA
src/render/Highlight.ts — 조준 블록 테두리 표시
```

Acceptance Criteria:

- [ ] 바라보는 블록에 테두리가 그려진다
- [ ] 5.0 보다 먼 블록은 선택되지 않는다
- [ ] 어느 면을 보고 있는지 `face` 가 올바르다 (설치 위치가 맞다)
- [ ] 대각선으로 볼 때도 블록을 건너뛰지 않는다
- [ ] DDA 에 대한 단위 테스트가 있다

---

## TASK-013 블록 파괴와 설치

의존: TASK-012, TASK-014

작업:

```text
BlockEditSystem
좌클릭 유지 → 파괴 진행도 → 파괴 + drops
우클릭 → 설치. MVP_SPEC 10.4 의 블록별 규칙
파괴 진행 균열 표시 8 단계
```

Acceptance Criteria:

- [ ] 블록마다 파괴 시간이 다르다 (dirt 0.6 / stone 1.5 / stone_brick 2.0)
- [ ] 파괴 중 다른 블록을 보면 진행도가 0 이 된다
- [ ] bedrock / water / bell 이 파괴되지 않는다
- [ ] 플레이어 AABB 와 겹치는 위치에 설치되지 않는다
- [ ] `bed` 가 수평 2 칸을 차지하고, 두 칸이 비어 있어야만 놓인다
- [ ] `farmland` 는 아래가 고체일 때만 놓인다
- [ ] 파괴 균열이 진행도에 따라 보인다
- [ ] door 아이템 하나가 수직 2칸을 차지하며 주민에게 두 칸 통로를 제공한다
- [ ] 침대 방향과 객체 id가 보존된다. 어느 점유 칸을 부숴도 전체 제거와 드롭 1개가 원자적이다
- [ ] 두 침대를 붙여 놓아도 별개 객체로 판정한다
- [ ] 인벤토리 부족·점유 충돌로 실패하면 블록·아이템·PlacementIndex가 바뀌지 않는다

---

## TASK-014 인벤토리와 핫바

의존: TASK-012

작업:

```text
InventorySystem (핫바 9 / 가방 27 / 스택 64)
src/ui/Hotbar.ts — DOM
1~9 / 휠 선택
```

Acceptance Criteria:

- [ ] 드롭 추가 API로 블록이 인벤토리에 들어간다 (파괴 연동은 TASK-013)
- [ ] 64 를 넘으면 다음 칸으로 넘어간다
- [ ] 핫바 선택이 숫자키와 휠로 바뀐다
- [ ] 설치 소비 API가 1개를 차감하고 0개면 거부한다 (설치 연동은 TASK-013)
- [ ] UI 가 `three` 를 import 하지 않는다

---

## TASK-015 제작

의존: TASK-013

작업:

```text
src/game/data/recipes.ts — MVP_SPEC 8.5
src/game/data/unlocks.ts의 레벨별 정적 표 — MVP_SPEC 23.2 (초기 레벨 1 조회)
CraftingSystem
src/ui/InventoryPanel.ts — E 로 열기
해금되지 않은 레시피는 회색 + 필요 레벨 표시
```

Acceptance Criteria:

- [ ] `log × 1 → plank × 4` 가 동작한다
- [ ] 재료가 부족하면 제작 버튼이 비활성이다
- [ ] 해금되지 않은 레시피가 **숨겨지지 않고 회색으로 보인다**
- [ ] 회색 레시피에 "마을 레벨 2 필요" 가 표시된다
- [ ] 제작 재료가 `blocks.ts` 에 존재하는 블록으로만 구성되어 있다
- [ ] 레벨 1에서 화덕·물통·침대 제작이 가능하고, 잎 회수부터 침대 제작까지 디버그 없이 이어진다

---

## TASK-016 디버그 패널

의존: TASK-013

작업:

```text
DebugSystem + src/ui/DebugPanel.ts (F3)
ARCHITECTURE 26 장의 표시 항목
디버그 명령: 블록 무제한. 시간 배속은 TASK-023에서 연결 (그 전 비활성)
```

Acceptance Criteria:

- [ ] F3 로 열고 닫힌다
- [ ] FPS / 드로우콜 / 청크 상태가 보인다
- [ ] 블록 무제한 모드에서 재료 없이 설치된다
- [ ] 프로덕션 빌드에서도 동작한다 (개발 중 계속 쓴다)

---

# Phase C. 방 인식 ★

## TASK-017 buildTestWorld 헬퍼

의존: TASK-004, TASK-003

작업:

```text
tests/helpers/buildTestWorld.ts
문자열 레이어로 3D 블록 배열을 만든다
ARCHITECTURE 25.1 의 형식
```

Acceptance Criteria:

- [ ] 문자열 레이어에서 `RoomBlockReader` 를 만든다
- [ ] `#` = plank, `.` = air, `D` = door, `B` = bed, `T` = table, `C` = chair 를 지원한다
- [ ] 레이어 개수가 y 높이가 된다
- [ ] 헬퍼 자체에 대한 테스트가 있다

**이 Task 를 건너뛰지 않는다.** 이것이 없으면 방 테스트를 아무도 쓰지 않는다.
- [ ] 기본 바닥은 자동 생성하지 않는다. 성공 fixture는 바닥 레이어를 명시한다
- [ ] D는 수직 쌍의 문 객체로 생성한다. B는 명시한 anchor/facing으로 침대 객체를 생성한다
- [ ] 잘못된 점유·메타데이터 fixture는 오류를 낸다

---

## TASK-018 detectRoom ★

의존: TASK-017

작업:

```text
src/game/room/detectRoom.ts
MVP_SPEC 11.2 / 11.3 의 조건과 알고리즘
RoomFailure 6 종. 좌표를 포함한다
```

Acceptance Criteria:

- [ ] 5 × 5 판자방 + 문 1 개가 성공한다
- [ ] 평지의 벽 구멍은 `TOO_LARGE` 또는 `NOT_ENCLOSED`로 종료하고 탐색 영역·경로를 남긴다
- [ ] 문이 없으면 `NO_DOOR` 다
- [ ] 벽이 1 칸 높이면 `WALL_TOO_LOW` + 좌표다
- [ ] 바닥에 구멍이 있으면 `NO_FLOOR` + 좌표다
- [ ] 2 × 1 공간은 `TOO_SMALL` 이다
- [ ] 내부 바닥 11 × 11 공간은 `TOO_LARGE` 다
- [ ] **dirt 로만 둘러싸인 공간은 `NOT_ENCLOSED` 다** (MVP_SPEC 8.4)
- [ ] 열린 공간에서 시작하면 `TOO_LARGE` 또는 `NOT_ENCLOSED` 로 종료된다. 무한 루프가 없다
- [ ] `VoxelWorld` 가 아니라 `RoomBlockReader` 를 받는다
- [ ] 고체 가구를 놓아도 방 형태가 유지되고 점유 칸이 바닥 면적에 포함된다
- [ ] 문은 비고체보다 먼저 경계로 처리한다

---

## TASK-019 방 레시피

의존: TASK-018

작업:

```text
src/game/data/roomRecipes.ts — MVP_SPEC 12.1 의 5 종
src/game/room/matchRecipe.ts
RoomFacilities 계산 (beds / cookingSpots / diningSeats / chests)
```

Acceptance Criteria:

- [ ] 침대 1 개 → `Bedroom`
- [ ] 화덕 + 물통 → `Kitchen`
- [ ] 식탁 + 인접 의자 2 개 → `DiningRoom`
- [ ] 상자 → `Storeroom`
- [ ] 아무것도 없으면 `EmptyRoom`
- [ ] 침대와 화덕+물통이 같이 있으면 `Kitchen` 이다 (priority 30 > 20)
- [ ] **벽 틈에 낀 침대는 `facilities.beds` 에 들어가지 않고 `Bedroom` 도 아니다**
- [ ] 식탁에서 떨어진 의자는 `diningSeats` 가 아니다
- [ ] `facilities` 가 좌표 목록을 들고 있다 (타입만 반환하지 않는다)
- [ ] 가구 옆 머리 공간이 막히거나 문과 단절되면 접근 가능한 시설에 포함하지 않는다
- [ ] 접근 셀과 사용 위치가 구분되며 고체 가구 자체를 A* 목적지로 쓰지 않는다
- [ ] 높은 priority로 타입이 바뀌면 이전 타입 시설은 비활성화된다

---

## TASK-020 RoomRegistry 와 재판정

의존: TASK-019, TASK-013, TASK-027

작업:

```text
src/game/room/RoomRegistry.ts
markDirty / processQueue(budgetMs) / findContaining / getByType
RoomSystem — GameWorld.update 5 번 자리
BLOCK_CHANGED 를 구독해 markDirty
```

Acceptance Criteria:

- [ ] 블록을 놓으면 몇 프레임 안에 방이 인식된다
- [ ] 벽을 부수면 방 인식이 해제된다
- [ ] 재판정이 프레임당 3ms 를 넘지 않는다 (디버그 패널로 확인)
- [ ] 블록을 빠르게 연속으로 놓아도 큐가 밀리지 않는다
- [ ] 같은 방이 큐에 중복으로 들어가지 않는다
- [ ] 월드 전체 스캔이 발생하지 않는다 (로드 시 제외)
- [ ] 문부터 설치하고 멀리 있는 마지막 벽을 막아도 인식된다
- [ ] 해제된 방의 먼 벽을 복구하면 재인식된다
- [ ] 바닥·둘째 층 벽·머리 공간 변경이 재판정에 반영된다
- [ ] 같은 방의 여러 문은 방 하나로, 공유 문 양쪽의 서로 다른 방은 둘로 등록된다
- [ ] 탐색 중 변경된 결과는 버리고 재시작한다. dirty 시설은 신규 예약·완료 보상에서 제외한다

---

## TASK-021 방 표시와 연출

의존: TASK-020

작업:

```text
src/render/RoomLabelView.ts — 월드 공간 라벨
인식 시 경계가 한 번 빛난다
해제 시 붉게 깜빡이고 라벨이 사라진다
```

Acceptance Criteria:

- [ ] 인식된 방 위에 이름이 보인다
- [ ] 거리에 따라 페이드된다
- [ ] 인식 순간 경계가 빛난다
- [ ] 해제 순간 경고 연출이 나온다
- [ ] 방이 여러 개여도 라벨이 겹쳐서 읽을 수 없게 되지 않는다

---

## TASK-022 방 진단 모드 ★ — 분기점 1

의존: TASK-021

작업:

```text
src/ui/RoomDiagnosticPanel.ts — Tab 토글
플레이어 위치에서 강제 flood fill → RoomFailure 표시
확인된 실패 좌표 또는 열린 탐색 영역·경로를 붉게 하이라이트
인식된 방은 초록 경계
```

Acceptance Criteria:

- [ ] Tab 으로 켜고 끈다
- [ ] 열린 평지에서는 탐색 영역·경로와 “공간이 열려 있거나 너무 큽니다”가 표시된다
- [ ] "문이 없습니다" 같은 사유 문구가 보인다
- [ ] 문을 아직 안 단 공간도 진단된다 (door 없이 플레이어 위치에서 시작)
- [ ] 진단이 자동 큐보다 먼저 시작하고 공통 3ms 예산 안에서 이어서 수행된다
- [ ] 바닥 구멍·낮은 벽·지형 경계는 실제 확인한 좌표와 사유를 표시한다
- [ ] 가구 접근 실패를 진단한다. 구멍 위치를 추측해 정답으로 표시하지 않는다
- [ ] 흙집·주방에 침대 추가·같은 높이 제한 사례를 플레이어가 이해하는지 기록한다

**여기서 멈추고 판단한다.**

```text
Q  5 × 5 방을 만들고 인식시키는 과정이 즐거웠는가
Q  인식되지 않았을 때 이유를 진단만으로 알 수 있었는가
Q  실패가 짜증이 아니라 퍼즐로 느껴졌는가
```

부정적이면 MVP_SPEC 11.2 의 조건을 완화하고 이 Task 를 다시 한다.
**Phase D 로 넘어가지 않는다.**

---

# Phase D. 시간과 이동

## TASK-023 게임 시계

의존: TASK-002

작업:

```text
GameClockSystem — secondsPerGameHour 25
DayPhase 6 종 + 전이 이벤트
디버그 배속 1× / 4× / 16×
```

Acceptance Criteria:

- [ ] 1 게임일이 실시간 600 초다
- [ ] DayPhase 가 MVP_SPEC 20.1 대로 전이한다
- [ ] 전이할 때만 `DAY_PHASE_CHANGED` 가 발행된다
- [ ] 디버그 배속이 동작한다
- [ ] `gameMinutes` 단일 누적값으로 시간을 표현한다

---

## TASK-024 통행 그래프

의존: TASK-003, TASK-019

작업:

```text
src/game/nav/NavigationGraph.ts
isStandable — voxel/occupancy.ts를 room과 공유. 발밑 고체 + 발·머리 비고체
neighbors — 4 방향 × (같은 높이 / +1 / -1)
ActorKind 로 door 처리 분기
invalidate — 실제 읽은 셀의 역참조 (step-up 머리 공간까지)
```

Acceptance Criteria:

- [ ] 평지에서 4 방향 이웃이 4 개다
- [ ] 1 칸 턱을 오르는 이웃이 포함된다
- [ ] 2 칸 턱은 이웃이 아니다
- [ ] 2 칸 낙차는 이웃이 아니다
- [ ] `door` 가 `'npc'` 에게는 통행 가능, `'monster'` 에게는 불가다
- [ ] `ActorKind` 에 기본값이 없다 (생략하면 컴파일 에러)
- [ ] 디버그 모드에서 통행 가능 셀을 시각화할 수 있다
- [ ] step-up 출발·도착 중 머리 공간 변경도 이웃 캐시와 경로를 즉시 무효화한다

---

## TASK-025 A* 경로탐색

의존: TASK-024

작업:

```text
src/game/nav/pathfind.ts
프레임 전체 확장 예산 4000. NODE_LIMIT이면 탐색 세션을 이어서 실행
PathResult 에 reason ('NO_PATH' / 'NODE_LIMIT')
```

Acceptance Criteria:

- [ ] 직선 경로를 찾는다
- [ ] 벽을 우회한다
- [ ] 계단(1 칸씩 쌓은 블록)을 오른다
- [ ] 완전히 막히면 `reason: 'NO_PATH'` 다
- [ ] 노드 상한을 넘으면 `reason: 'NODE_LIMIT'` 다
- [ ] **두 reason 이 구분된다** — 몬스터가 이걸로 판단한다
- [ ] 64 칸 거리 탐색이 5ms 이하다
- [ ] 반경 목표는 고체 종이 아니라 반경 안의 통행 가능한 셀에서 성공한다
- [ ] NODE_LIMIT의 partialPath는 검증된 셀만 포함한다
- [ ] 4000노드보다 큰 막힌 영역도 세션을 이어서 탐색해 NO_PATH로 종료한다
- [ ] NO_PATH의 reachableBoundary에는 실제 접근 경로가 있는 장애물만 들어간다

---

## TASK-026 이동 제어

의존: TASK-025, TASK-009

작업:

```text
MovementController — 경로 추종
경로 무효화 / 재계산 (최소 간격 0.5 초)
'blocked' 연속 3 회 시 재계산
```

Acceptance Criteria:

- [ ] 경로를 따라 부드럽게 이동한다
- [ ] 경로 위의 블록을 부수면 재계산한다
- [ ] 두 캐릭터가 문 앞에서 겹쳐도 프레임이 떨어지지 않는다
- [ ] 재계산이 0.5 초 간격 제한을 지킨다
- [ ] 목적지에 도착하면 `'arrived'` 를 반환한다

---

## TASK-027 월드 골격

의존: TASK-002

작업:

```text
EventBus (타입 안전)
EntityRegistry
VillageStorage (seed / crop / food)
GameWorld와 update 16슬롯. 아직 없는 시스템은 빈 슬롯이며 후속 Task에서 연결한다
```

Acceptance Criteria:

- [ ] `EventBus.emit` 에 잘못된 payload 를 넣으면 컴파일 에러다
- [ ] `on` 이 구독 해제 함수를 반환한다
- [ ] `GameWorld.update` 슬롯 순서가 ARCHITECTURE 4.1과 일치하고 추가 시스템도 그 자리에 연결된다
- [ ] `VillageStorage` 변경 시 `STORAGE_CHANGED` 가 발행된다
- [ ] 초기 `seed` 가 3 이다

---

## TASK-028 NPC 골격

의존: TASK-027, TASK-026

작업:

```text
NPC 엔티티 (순수 데이터)
NPCFactory
Action 인터페이스 + IdleAction / MoveAction
src/render/EntityView.ts (플레이스홀더 캡슐 메시)
```

Acceptance Criteria:

- [ ] 주민 3 명이 마을에 서 있다
- [ ] `NPC` 가 `three` 를 import 하지 않는다
- [ ] `MoveAction` 으로 지정 좌표까지 걸어간다
- [ ] 디버그 패널에 각 NPC 의 현재 Action label 이 보인다
- [ ] `npc.state` 같은 필드가 없다 (ADR 008)

---

## TASK-029 판단과 시간표

의존: TASK-028, TASK-023

작업:

```text
NPCDecisionSystem — 우선순위 5 단계 (순수 함수)
NPCContext 조립
MVP_SPEC 19.5 의 시간표
```

Acceptance Criteria:

- [ ] `decideAction` 이 순수 함수다. 아무것도 바꾸지 않는다
- [ ] 우선순위가 위에서 아래로 한 번만 평가된다
- [ ] 시간대가 바뀌면 행동이 바뀐다
- [ ] 아직 밭 / 주방 / 침대가 없으므로 대부분 Idle 이다 (정상)
- [ ] 우선순위 5 단계 전부에 대한 테스트가 있다
- [ ] Context 가 전부 `readonly` 다
- [ ] 순수 snapshot에 가변 Action·시스템을 노출하지 않는다. 기절 중에는 새 Action을 시작하지 않는다

---

# Phase E. 주민 생활 ★

## TASK-030 농사와 농부

의존: TASK-033, TASK-020

작업:

```text
FarmSystem — crop 표시 3단계 각각 4시간. 12시간 경과 시 성숙
PlantAction / HarvestAction
farmland 파괴 시 crop 정리
```

Acceptance Criteria:

- [ ] `farmland` 를 깔면 농부가 걸어간다
- [ ] 씨앗을 심으면 `storage.seed` 가 1 준다
- [ ] 게임 시간 12 시간 뒤 수확 가능해진다
- [ ] 수확하면 `crop +1`, `seed +1` 이다
- [ ] 성장이 농부와 무관하게 진행된다
- [ ] `farmland` 를 부수면 위의 `crop` 도 사라진다
- [ ] `seed` 가 0 이면 심지 않고 다른 행동을 한다
- [ ] 8시간의 stage=2는 미성숙이며 12시간에만 수확된다
- [ ] 성숙 작물 수확·재파종을 우선하고 role 시간 밖에는 작업하지 않는다
- [ ] 씨앗은 정상 수확에서만 돌아오며 작물 파괴로 잃은 씨앗은 채집으로 보충한다

---

## TASK-031 요리와 요리사

의존: TASK-030

작업:

```text
CookingSystem — crop 2 → food 3, 1 게임시간
CookAction — Kitchen 의 cookingSpots 로 이동
```

Acceptance Criteria:

- [ ] `Kitchen` 이 인식되어 있어야 요리한다
- [ ] `crop` 이 2 미만이면 요리하지 않는다
- [ ] 1 게임시간 뒤 `crop -2`, `food +3` 이다
- [ ] `Kitchen` 이 없으면 `crop` 이 쌓이기만 한다 (게임이 멈추지 않는다)
- [ ] 요리 중 주방이 해제되면 Action 이 취소된다
- [ ] 시작 시 재료를 예약하고 완료 때 소비한다. 중단·로드로 재료를 잃거나 음식을 복제하지 않는다
- [ ] 식사를 못 했어도 다음 역할 시간에 요리할 수 있다

---

## TASK-032 식사

의존: TASK-031

작업:

```text
MealSystem — 12:00 / 18:00
EatAction — DiningRoom 의 chair 또는 광장
hasEatenThisMeal 리셋
요리사가 식탁에 음식 오브젝트를 올리는 연출
```

Acceptance Criteria:

- [ ] 12:00 에 주민들이 식사하러 이동한다
- [ ] `DiningRoom` 이 있으면 의자에 앉는다
- [ ] 없으면 광장에서 먹는다
- [ ] `food` 1 이 소비된다
- [ ] `food` 가 0 이면 먹지 않고 넘어간다. 게임이 멈추지 않는다
- [ ] 같은 끼니에 두 번 먹지 않는다
- [ ] 식탁 위 음식이 연출 오브젝트이고 블록이 아니다
- [ ] 같은 의자를 동시에 예약하지 않는다. 경로 실패·취소 시 시설 예약을 해제한다

---

## TASK-033 취침 ★ — 분기점 2

의존: TASK-029, TASK-020, TASK-034

작업:

```text
SleepSystem — 침대 배정 / 해제
SleepAction (침대) / RestAction (광장) — 별개의 Action
침대 파괴 시 깨어남. 농사·요리·식사 없이 기존 디버그 시험 월드로 먼저 검증
```

Acceptance Criteria:

- [ ] 20:00 에 주민이 배정된 침대로 걸어간다
- [ ] 침대에 눕는 자세가 보인다
- [ ] 05:00 에 일어나 방에서 나온다
- [ ] 침대가 주민 수보다 적으면 남는 주민이 광장에서 `RestAction` 을 한다
- [ ] `SleepAction` 과 `RestAction` 이 별개의 클래스다
- [ ] 자고 있는 주민의 침대를 부수면 깨어나고 배정이 해제된다
- [ ] 방이 해제되면 그 방의 배정이 전부 풀린다
- [ ] 한 주민·침실·침대로 핵심 장면을 먼저 확인한 뒤 주민 세 명으로 배정 충돌을 확인한다
- [ ] 침대는 SleepSystem만 소유한다. NPC 엔티티에 별도 배정 상태를 저장하지 않는다
- [ ] 방 타입이 바뀌거나 같은 타입에서 침대 하나만 없어져도 해당 배정을 해제한다
- [ ] 실제 접근 경로가 없으면 다른 침대 또는 RestAction을 선택한다

**여기서 멈추고 판단한다.**

```text
Q  밤이 되어 주민이 내가 만든 방으로 걸어 들어가는 장면이 만족스러운가
Q  그 장면을 계속 보고 싶은가
Q  침대를 하나 더 놔주고 싶은가
```

부정적이면 MVP_SPEC 31 장의 연출을 강화하고 이 Task 를 다시 한다.
**감사 포인트를 붙여서 해결하려 하지 않는다.**

---

## TASK-034 낮과 밤

의존: TASK-023, TASK-007

작업:

```text
src/render/DayNightVisual.ts
하늘색 / 방향광 색과 강도 보간
torch PointLight (상한 16)
```

Acceptance Criteria:

- [ ] 시간에 따라 하늘색이 바뀐다
- [ ] 밤에 어두워지고 `torch` 주변만 밝다
- [ ] 광원이 16 개를 넘지 않는다 (가까운 것 우선)
- [ ] 전이가 갑자기 튀지 않고 보간된다

---

# Phase F. 성장

## TASK-035 감사 포인트

의존: TASK-033, TASK-032

작업:

```text
GratitudeSystem — gain / spend / 중복 방지
GratitudeSource 5 종
src/ui/GratitudeHud.ts + 월드 공간 +N 연출
```

Acceptance Criteria:

- [ ] 주민이 잠들면 +5 가 침대 위에 뜬다
- [ ] 같은 밤에 같은 주민이 두 번 받지 않는다
- [ ] 요리 완료 시 +3 이 요리사 위에 뜬다
- [ ] 식당에서 먹으면 +2, 광장이면 0 이다
- [ ] 새 방 타입 최초 인식 시 +20 이다. 두 번째 같은 타입은 0 이다
- [ ] `EmptyRoom` 은 보너스를 주지 않는다
- [ ] 방이 해제되어도 포인트가 줄지 않는다
- [ ] `gain` 이 좌표를 필수 인자로 받는다
- [ ] EmptyRoom 등록 뒤 Bedroom 타입 변경에서도 최초 +20을 한 번 지급한다
- [ ] 자정 전 취침 후 자정 뒤 깨어나 다시 자도 같은 nightId에는 추가 지급하지 않는다

---

## TASK-036 마을의 종

의존: TASK-035, TASK-039

작업:

```text
VillageLevelSystem — evaluate / ring
src/ui/BellPanel.ts — 게이트 상태 전부 표시
종 상호작용 (F)
```

Acceptance Criteria:

- [ ] 종에 F 를 누르면 패널이 열린다
- [ ] 감사 포인트와 **모든 게이트 조건이 현재값 / 필요값** 으로 표시된다
- [ ] 미충족 조건이 명확히 구분된다
- [ ] 조건을 전부 만족해야 버튼이 활성화된다
- [ ] 치면 포인트가 소비되고 레벨이 오른다
- [ ] 레벨을 내리는 코드 경로가 존재하지 않는다
- [ ] 종 연출(소리 / 빛 / 카메라)이 있다
- [ ] 종의 F는 성장·저장소 탭을 가진 패널 하나만 연다
- [ ] 종 또는 상자에서 seed/crop/food를 플레이어 인벤토리에서 마을 저장소로 기부한다
- [ ] 레벨 2에서 80, 레벨 3에서 200을 차감한다. 총 소비량은 280이다
- [ ] 현재 상태로 게이트를 재평가하고 dirty 방은 세지 않는다

---

## TASK-037 해금

의존: TASK-036, TASK-015

작업:

```text
TASK-015에서 만든 unlocks.ts를 VillageLevelSystem의 실제 레벨 전이와 연결
CraftingSystem이 현재 레벨의 해금을 확인
```

Acceptance Criteria:

- [ ] 레벨 1 에서 `window` / `chest` 이 회색이다
- [ ] 회색 항목에 필요 레벨이 표시된다
- [ ] 레벨 2 를 달성하면 즉시 활성화된다
- [ ] 해금되지 않은 블록은 디버그 모드에서도 제작되지 않는다
- [ ] 레벨이 오른 뒤 다시 잠기지 않는다
- [ ] cooking_stove / water_pot은 레벨 1부터 제작 가능하다

---

## TASK-038 새 주민 도착

의존: TASK-037

작업:

```text
ResidentArrivalSystem이 레벨별 고유 키로 다음 07:00 도착을 예약·스폰
Villager 역할 (생활만 한다)
도착 연출
```

Acceptance Criteria:

- [ ] 레벨 2 를 달성하면 다음 아침에 1 명이 온다
- [ ] 섬 가장자리에서 마을로 걸어 들어온다
- [ ] 도착 즉시 침대가 배정된다 (비어 있으면)
- [ ] `population` 이 늘어 `housingLevel` 과 `foodLevel` 이 내려간다
- [ ] 새 주민이 시간표대로 생활한다 (서 있기만 하지 않는다)
- [ ] 레벨 2·3을 같은 날 달성해도 각 예약당 한 명씩 정확히 두 명이 도착한다
- [ ] EVENT_NEW_RESIDENT는 스폰하지 않는다. 도착 사실만 확인한다

---

# Phase G. 진행

## TASK-039 World State

의존: TASK-020, TASK-027

실행: 성장 게이트보다 먼저 완료한다 (2.3 참조).

작업:

```text
computeWorldState 순수 함수 — MVP_SPEC 21.1
WorldStateSystem — update 14 번 자리
디버그 패널에 4 지표 표시
```

Acceptance Criteria:

- [ ] 4 지표가 MVP_SPEC 21.1 대로 계산된다
- [ ] `population === 0` 에서 0 으로 나누지 않는다
- [ ] food 감소 입력에서 `foodLevel`이 내려간다. 실제 식사 연동은 TASK-032 이후 확인한다
- [ ] 테스트 입력의 주민 수가 늘면 `housingLevel`이 내려간다. 실제 도착 연동은 TASK-038에서 확인한다
- [ ] 습격 전에는 `safetyLevel` 이 100 이다
- [ ] `WorldState` 에 변경 API 가 없다
- [ ] `SaveData` 에 포함되지 않는다
- [ ] `accessibleBeds` 가 `facilities.beds` 로만 계산된다

---

## TASK-040 대사

의존: TASK-027

작업:

```text
src/game/data/dialogues.ts
DialogueSystem + src/ui/DialogueBox.ts
NPC 머리 위 대화 가능 표시
```

Acceptance Criteria:

- [ ] NPC 에 F 를 누르면 대사가 나온다
- [ ] 대사 중 이동과 블록 편집이 막힌다
- [ ] 대사 표시가 있는 NPC 만 대화된다
- [ ] 대사가 끝나면 `nextObjective` 가 적용된다
- [ ] 대사가 해금을 하지 않는다 (ADR 010)

---

## TASK-041 목표

의존: TASK-040

작업:

```text
ObjectiveSystem + src/ui/ObjectivePanel.ts
진행 수치가 있는 목표
```

Acceptance Criteria:

- [ ] 목표가 좌측 상단에 한 줄로 보인다
- [ ] "밭흙을 4 칸" 에 (2 / 4) 가 실시간으로 표시된다
- [ ] "마을을 벽으로 둘러싸 주세요" 에는 수치가 없다
- [ ] 목표가 바뀔 때 시각적으로 강조된다

---

## TASK-042 이벤트 골격

의존: TASK-041

작업:

```text
GameEventSystem — 커맨드 반환 (ADR 007)
GameCommand 4종 (주민 스폰 명령 없음)
completed 집합. 비가역
```

Acceptance Criteria:

- [ ] `execute` 가 부작용 없이 커맨드 배열을 반환한다
- [ ] `GameEventSystem` 한 곳에서만 커맨드를 해석한다
- [ ] 완료된 이벤트가 다시 실행되지 않는다
- [ ] `completed` 에서 제거하는 코드 경로가 없다
- [ ] 이벤트 정의를 시스템 없이 테스트할 수 있다

---

## TASK-043 진행 이벤트 8 개

의존: TASK-042

작업:

```text
src/game/data/gameEvents.ts — MVP_SPEC 27.1
대사 8 세트
```

Acceptance Criteria:

- [ ] 8 개가 MVP_SPEC 27.1 의 조건대로 발생한다
- [ ] 모든 조건이 결정적이다 (난수 / 모호한 시간 조건 없음)
- [ ] 조건이 다시 거짓이 되어도 롤백되지 않는다
- [ ] 각 이벤트가 감사 포인트 +15 를 준다
- [ ] 8 개 전부에 대한 `canTrigger` 테스트가 있다
- [ ] 처음부터 끝까지 이벤트만 따라가면 레벨 2 에 도달한다 (MVP_SPEC 35.3)
- [ ] 표 순서의 선행 이벤트 완료 조건을 함께 검사한다
- [ ] 레벨 1 해금·초기 자원으로 주방 → 침실 → 첫 종 경로가 성립한다
- [ ] 종 대사가 밭 4→8칸·주민 수에 맞춘 침대를 안내한다
- [ ] 습격 조건은 RaidResult fixture로 단위 검증하고 실제 연동은 TASK-044~049에서 검증한다

---

# Phase H. 방어

## TASK-044 습격 스케줄

의존: TASK-036

작업:

```text
Monster 엔티티
RaidSystem — villageLevel 달성 후 첫 21:00
스폰 2 곳. 05:00 강제 소멸
```

Acceptance Criteria:

- [ ] 레벨 2 달성 후 첫 21:00 에 3 마리가 나온다
- [ ] 레벨 3이고 1차 습격이 끝난 뒤 첫 21:00에 5마리가 나온다
- [ ] 그 외의 밤에는 나오지 않는다
- [ ] 05:00 에 남은 몬스터가 사라진다
- [ ] 같은 습격이 두 번 발생하지 않는다
- [ ] `RAID_STARTED` / `RAID_ENDED` 가 발행된다
- [ ] 두 레벨을 같은 날 달성해도 습격은 겹치지 않고 순서대로 한 번씩 발생한다

---

## TASK-045 몬스터 AI 와 블록 파괴 ★

의존: TASK-044, TASK-025

작업:

```text
MonsterSystem — ARCHITECTURE 18.1 의 판단 순서
findBreakableToward (도달 가능한 경계 + terrain=false + breakSeconds!=null + 남은 예산)
파괴 진행 + 블록 흔들림 연출
```

Acceptance Criteria:

- [ ] 열린 마을에서는 종까지 그냥 걸어온다
- [ ] 판자벽으로 막으면 벽 앞에서 멈추고 부수기 시작한다
- [ ] `plank` 가 0.8 × 2.0 = 1.6 초에 부서진다
- [ ] 부서지면 통행 그래프가 갱신되어 들어온다
- [ ] **`dirt` / `stone` 은 부수지 않고 우회한다**
- [ ] `NODE_LIMIT` 로 경로를 못 찾았을 때는 부수지 않는다
- [ ] 완전히 막히면 배회하다 05:00 에 사라진다
- [ ] 종 반경 6 안에 들어오면 "도달" 로 기록된다
- [ ] 종은 파괴되지 않으며 열린 마을의 목표 반경까지 걸어간다
- [ ] 벽에서 떨어져 스폰해도 접근 가능한 벽 앞까지 이동한 뒤 파괴한다
- [ ] 습격 파괴량이 16복셀을 넘지 않고 두 칸 객체는 부분 파괴하지 않는다
- [ ] 흙벽 제한이 방어·수리의 재미를 없애는지 관찰 기록을 남긴다

---

## TASK-046 전투

의존: TASK-045

작업:

```text
CombatSystem — 플레이어 공격 / 몬스터 공격
플레이어 체력 + 부활
```

Acceptance Criteria:

- [ ] 좌클릭으로 몬스터를 공격한다 (블록 조준과 구분된다)
- [ ] 3 대에 처치된다
- [ ] 몬스터가 플레이어와 NPC 를 공격한다
- [ ] NPC 체력이 0 이면 30 게임분 기절한다. 죽지 않는다
- [ ] 플레이어 체력이 0 이면 종 옆에서 부활하고 인벤토리를 잃지 않는다
- [ ] 게임 오버가 없다

---

## TASK-047 도피

의존: TASK-046

작업:

```text
FleeAction — 위협 반경 12
집 안 또는 마을 반대편으로 도피
```

Acceptance Criteria:

- [ ] 몬스터가 반경 12 안에 오면 주민이 도망친다
- [ ] 도피 속도가 5.0 이다
- [ ] 도피 중 다른 판단을 하지 않는다 (우선순위 1)
- [ ] 위협이 사라지면 원래 시간표로 돌아간다
- [ ] 이전에 하던 작업을 이어가지 않는다 (새로 판단한다)
- [ ] 문을 통과해 실내로 들어갈 수 있다

---

## TASK-048 수리

의존: TASK-045

작업:

```text
RepairSystem — DamageLog
RepairAction — 목수. 하루 8 점유 복셀. 07:00 ~ 18:00
플레이어가 직접 놓아도 resolve
```

Acceptance Criteria:

- [ ] 몬스터가 부순 좌표가 기록된다
- [ ] 아침에 목수가 그곳으로 가서 원래 블록을 복구한다
- [ ] 하루 8 점유 복셀까지만 한다
- [ ] 9 번째부터는 다음 날로 넘어간다
- [ ] 재료를 소비하지 않는다
- [ ] 플레이어가 직접 놓으면 기록에서 제거된다
- [ ] 18:00 이후에는 수리하지 않는다
- [ ] 문·침대는 전체 배치로 복원하고 당일 예산에서 2칸을 쓴다
- [ ] 부분 복구·NPC 점유가 있으면 덮어쓰지 않는다. 완료 시 공간과 예산을 다시 검사한다
- [ ] 농사 BLOCK_CHANGED를 수리 완료로 오인하지 않는다

---

## TASK-049 피해 보고

의존: TASK-048

작업:

```text
src/ui/DamageReportPanel.ts — 07:00 자동
파괴 좌표 붉은 반투명 큐브 (수리될 때까지)
```

Acceptance Criteria:

- [ ] 습격 다음 아침에 패널이 뜬다
- [ ] 파괴된 블록 수가 표시된다
- [ ] 좌표가 월드에 붉게 표시된다
- [ ] 수리되면 표시가 사라진다
- [ ] 피해가 없으면 패널이 뜨지 않는다
- [ ] 아침 전에 수리한 피해도 지난밤 파괴 수에 포함되고 미수리 표시만 사라진다

---

# Phase I. 마무리

## TASK-050 오디오

의존: TASK-049

작업:

```text
MVP_SPEC 30 장의 소리
방 인식 성공음에 가장 공을 들인다
```

Acceptance Criteria:

- [ ] 블록 파괴 / 설치 소리가 재질별로 다르다
- [ ] 방 인식 성공음이 전용 효과음이다
- [ ] 방 인식 해제음이 경고음이다
- [ ] 종소리에 리버브가 있다
- [ ] 낮 / 밤 BGM 이 전환된다
- [ ] 음소거 토글이 있다

---

## TASK-051 저장

의존: TASK-050

작업:

```text
SaveSystem — IndexedDB
ARCHITECTURE 23 장의 SaveData
로드 후 재구축 6 단계
자동 저장 (매일 07:00 / 종을 친 직후)
```

Acceptance Criteria:

- [ ] 저장하고 새로고침하면 블록이 그대로다
- [ ] 방이 다시 인식된다 (저장하지 않고 재판정)
- [ ] 주민 위치 / 침대 배정 / 진행 상태가 복원된다
- [ ] 감사 포인트 / 마을 레벨 / 해금이 복원된다
- [ ] `WorldState` 는 저장되지 않고 계산된다
- [ ] 로드 시간이 5 초 이하다
- [ ] 변경된 청크만 저장된다
- [ ] `Date.now()` 가 저장 데이터에 없다
- [ ] 버전이 다르면 조용히 깨지지 않고 거부한다
- [ ] gameMinutes 하나로 시각을 저장하고 다중 칸 배치·objectId를 복원한다
- [ ] 습격 중 저장·로드 후 몬스터 체력·도달 집합·파괴 예산·종료 이벤트가 유지된다
- [ ] 종 직후 도착 예약이 보존되고 같은 주민·이벤트·보상을 두 번 생성하지 않는다
- [ ] 자정 전후 취침 보상, 기절, 식사 구간, 당일 수리 8칸 제한이 유지된다
- [ ] 현재 목표와 미완료 대화 표시가 복원된다
- [ ] 로드의 방 재구축은 보상 이벤트를 발생시키지 않는다

---

## TASK-052 엔딩

의존: TASK-051

작업:

```text
EVENT_SLICE_END 연출
아침 / 주민 5 명 / 수리하는 목수
연출 후에도 계속 플레이 가능
```

Acceptance Criteria:

- [ ] 2 차 습격 다음 07:00 에 발생한다
- [ ] 연출이 재생된다
- [ ] 연출이 끝나도 게임이 계속된다
- [ ] 저장하고 이어서 할 수 있다

---

## TASK-053 밸런스와 성능

의존: TASK-052

작업:

```text
MVP_SPEC 35 장의 검산을 실제 플레이로 검증
MVP_SPEC 36 장의 성능 목표 달성
```

Acceptance Criteria:

- [ ] 처음부터 끝까지 90 ~ 120 분에 도달한다
- [ ] 이벤트만 따라가도 레벨 2 에 도달한다
- [ ] 레벨 2 이후 약 3게임일이라는 가설을 측정하고 차이와 원인을 기록한다
- [ ] 밭 8칸·충분한 씨앗과 접근 가능한 주방에서 주민 5명의 일간 식량을 검증한다
- [ ] 파괴 없는 정상 수확에서 씨앗이 순환하고 손실 시 채집으로 보충할 수 있다
- [ ] MVP_SPEC 36장의 동일 조건에서 60 FPS 목표 / 하위 1% 30 FPS 최소를 측정한다
- [ ] 드로우콜이 600 미만이다
- [ ] 방 재판정이 프레임당 3ms 이하다
- [ ] MVP_SPEC 39 장의 Acceptance Test 10 개가 전부 통과한다

---

# 3. Task 의존 그래프 요약

실행 정본은 2.3의 전체 순서와 각 Task의 의존 목록이다.
주요 수정: 027→003/020, 012→011, 014→013, 029/020/034→033,
033→030, 020/027→039→036, 032/033→035.
같은 Phase 안에서도 이 선행 조건을 생략하지 않는다.

---

# 4. 진행 기록

각 Task 완료 시 `docs/state/` 에 기록한다.

```text
docs/state/YYYY-MM-DD_HHMM-제목.md
```

내용:

```text
무엇을 했는가
어떤 결정을 했는가 (ADR 로 남길 것이 있는가)
Acceptance Criteria 중 통과하지 못한 것이 있는가
다음 할 일
```

**Acceptance Criteria 를 통과하지 못한 채로 다음 Task 로 넘어가지 않는다.**

넘어가야 한다면 그 이유를 `docs/state/` 에 남긴다.
