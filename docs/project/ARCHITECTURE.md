# ARCHITECTURE.md

# Small Village Restoration Game — Architecture Guide

Version: 1.0
Status: DQB2 Redesign Baseline
Date: 2026-09-22

---

# 1. 문서 목적

이 문서는 **어떤 구조로 만드는가** 를 정의한다.

**인터페이스와 책임 위치의 정본은 이 문서다.**

수치와 조건식은 `MVP_SPEC.md` 를 따른다.

## 1.1 이 문서는 전면 개정되었다

Version 0.2 는 Phaser 3 / 2D Tilemap / Prefab 건물을 전제로 한 구조였다.

ADR 011 ~ 015 로 전제가 전부 바뀌었다.

살아남은 구조 결정은 다음이다.

```text
ADR 003   React 를 쓰지 않는다. UI 는 상태를 소유하지 않는다
ADR 004   WorldState 는 파생 지표다
ADR 006   Entity 는 순수 데이터. 렌더링은 View 로 분리한다   (Phaser → three 로 보정)
ADR 007   진행 이벤트의 execute 는 커맨드를 반환한다
ADR 008   NPC 의 상태는 현재 Action 이다
ADR 010   대사 종료는 목표 문구만 바꾼다
```

---

# 2. 전체 구조

```text
                      main.ts
                         │
        ┌────────────────┼────────────────┐
        │                │                │
    GameWorld        Renderer            UI
   (순수 TS)         (three)           (DOM)
        │                │                │
        │  읽기 전용 참조   │   이벤트 구독    │
        └───────────────>─┴────────────────┘

    src/game/**  →  three 를 모른다
    src/render/** →  게임 상태를 읽는다. 쓰지 않는다
    src/ui/**     →  이벤트를 구독한다. 상태를 소유하지 않는다
    src/workers/**→  three 도 게임 상태도 모른다. 순수 함수만 실행한다
```

## 2.1 의존성 방향

```text
data       ←  아무것도 의존하지 않는다
types      ←  아무것도 의존하지 않는다
voxel      ←  types, data
room       ←  types, data, voxel
nav        ←  types, data, voxel
entities   ←  types, data
actions    ←  types, entities, voxel, nav, room
systems    ←  위 전부
GameWorld  ←  systems
render     ←  GameWorld (읽기)
ui         ←  EventBus (구독)
```

**역방향 의존을 만들지 않는다.**

`voxel` 이 `systems` 를 import 하면 순환이 생긴다.
알림이 필요하면 `EventBus` 로 발행한다.

## 2.2 엔진 격리를 lint 로 강제한다

```js
// eslint.config.js
{
  files: ['src/game/**', 'src/ui/**', 'src/workers/**'],
  rules: {
    'no-restricted-imports': ['error', { patterns: ['three', 'three/*'] }],
  },
}
```

이 규칙은 **선택이 아니다.** ADR 011 이 엔진을 한 번 교체하면서 그 가치가 증명되었다.

---

# 3. 런타임 구성

```ts
// main.ts
const world = new GameWorld(islandData, balance);
const renderer = new Renderer(canvas, world);
const ui = new UiRoot(world.events, world);

let last = performance.now();
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1);   // 스파이크 클램프
  last = now;

  world.update(dt);      // 게임 규칙
  renderer.render(dt);   // 그리기
  requestAnimationFrame(frame);
}
```

`dt` 를 0.1 초로 클램프한다. 탭이 백그라운드에 갔다 오면
한 프레임에 수십 초가 흘러 캐릭터가 벽을 통과한다.

## 3.1 Fixed Update 를 쓰지 않는다

물리 엔진이 없고 결정적 시뮬레이션이 필요하지 않다.

다만 **충돌은 이동 거리를 나눠서 처리한다.**

```text
한 프레임의 이동 거리가 0.4 를 넘으면 0.4 이하로 분할해서 충돌을 푼다
```

그렇지 않으면 빠르게 낙하할 때 블록을 관통한다.

---

# 4. GameWorld

`update` 순서를 소유하는 유일한 객체다.

```ts
export class GameWorld {
  readonly events: EventBus;
  readonly registry: EntityRegistry;
  readonly voxels: VoxelWorld;
  readonly rooms: RoomRegistry;
  readonly nav: NavigationGraph;
  readonly storage: VillageStorage;
  readonly clock: GameClockSystem;

  worldState: WorldStateData;   // 매 프레임 재계산. 저장하지 않는다

  update(dt: number): void;
}
```

## 4.1 update 순서

순서에 이유가 있다. 임의로 바꾸지 않는다.

```text
 1  clock              시간을 먼저 진행시킨다. 모든 판단의 기준이다
 2  input              플레이어 입력을 읽는다
 3  playerMovement     이동 + 충돌
 4  blockEdit          파괴 / 설치. 여기서 블록이 바뀐다
 5  room               ★ 블록 변경 이후. 방 재판정 큐를 예산 안에서 처리한다
 6  nav                무효화된 통행 캐시를 정리한다
 7  farm               작물 성장
 8  raid               습격 스케줄 판정
 9  monster            몬스터 AI. 블록 파괴 포함
10  npcDecision        NPC 의 다음 Action 을 정한다
11  npc                현재 Action 을 실행한다
12  combat             공격 판정
13  gratitude          누적 이벤트를 소비해 포인트를 더한다
14  worldState         ★ 파생 지표를 계산한다. NPC 행동 이후여야 한다
15  gameEvent          진행 이벤트 조건을 평가한다
16  objective          목표 문구를 갱신한다
```

## 4.2 5 번이 4 번 뒤인 이유

방 판정은 블록 상태를 읽는다.

같은 프레임에 블록을 놓고 방이 인식되지 않으면
플레이어는 한 프레임 늦게 피드백을 받는다. 체감상 문제는 없지만,
순서를 뒤집으면 **항상 한 프레임 전의 블록 상태로 판정** 하게 되어
"막았는데 인식이 안 된다 → 다시 보니 됐다" 는 혼란이 생긴다.

## 4.3 14 번이 10 ~ 11 번 뒤인 이유

ADR 004 의 결정을 유지한다.

주민이 밥을 먹으면 `storage.food` 가 줄고 `foodLevel` 이 내려간다.
NPC 행동 전에 계산하면 지표가 항상 한 프레임 과거를 가리킨다.

## 4.4 9 번이 10 번 앞인 이유

몬스터가 블록을 부수면 NPC 의 경로가 무효화된다.
NPC 가 먼저 판단하면 이미 사라진 블록 위로 경로를 잡는다.

---

# 5. EventBus

```ts
export type GameEventMap = {
  BLOCK_CHANGED:       { pos: BlockPos; from: number; to: number; by: 'player' | 'npc' | 'monster' };
  ROOM_REGISTERED:     { roomId: string; type: RoomType };
  ROOM_TYPE_CHANGED:   { roomId: string; from: RoomType; to: RoomType };
  ROOM_UNREGISTERED:   { roomId: string; reason: RoomFailure };
  GRATITUDE_GAINED:    { amount: number; source: GratitudeSource; at: Vec3 };
  VILLAGE_LEVEL_UP:    { level: number; unlocked: number[] };
  STORAGE_CHANGED:     { seed: number; crop: number; food: number };
  INVENTORY_CHANGED:   void;
  NPC_ACTION_CHANGED:  { npcId: string; label: string };
  NPC_ARRIVED:         { npcId: string };
  RAID_STARTED:        { count: number };
  RAID_ENDED:          { total: number; reached: number };
  BLOCK_DAMAGED:       { pos: BlockPos; progress: number };
  DAMAGE_LOGGED:       { pos: BlockPos; blockId: number };
  BLOCK_REPAIRED:      { pos: BlockPos };
  GAME_EVENT_FIRED:    { id: GameEventId };
  DIALOGUE_STARTED:    { npcId: string; lines: string[] };
  DIALOGUE_ENDED:      { npcId: string };
  OBJECTIVE_CHANGED:   { text: string; progress?: { current: number; total: number } };
  DAY_PHASE_CHANGED:   { phase: DayPhase };
  WORLD_STATE_CHANGED: WorldStateData;
};

export class EventBus {
  on<K extends keyof GameEventMap>(k: K, fn: (p: GameEventMap[K]) => void): () => void;
  emit<K extends keyof GameEventMap>(k: K, p: GameEventMap[K]): void;
}
```

## 5.1 사용 원칙

```text
쓴다      시스템 → UI / 렌더
쓴다      시스템 → 다른 시스템에게 "일어난 일" 을 알린다
안 쓴다    시스템 → 다른 시스템에게 "해라" 를 지시한다
안 쓴다    매 프레임 발행되는 위치 갱신
```

명령은 커맨드로 한다. ADR 007 을 참조한다.

## 5.2 BLOCK_CHANGED 의 by 필드

누가 바꿨는지가 필요하다.

```text
player    파괴 진행 UI 를 닫는다
monster   DamageLog 에 기록한다
npc       목수의 수리. DamageLog 에서 제거한다
```

---

# 6. VoxelWorld

```ts
export class VoxelWorld {
  readonly sizeX: number; readonly sizeY: number; readonly sizeZ: number;

  getBlock(x: number, y: number, z: number): number;   // 경계 밖은 0 (air)
  setBlock(x: number, y: number, z: number, id: number, by: BlockChangeSource): boolean;

  getChunk(cx: number, cy: number, cz: number): Chunk | undefined;

  /** 이번 프레임에 변경된 청크 좌표. 렌더가 읽고 비운다. */
  takeDirtyChunks(): ChunkCoord[];

  /** 이번 프레임에 변경된 블록 좌표. RoomSystem 과 NavigationGraph 가 읽는다. */
  takeChangedBlocks(): BlockPos[];
}
```

## 6.1 setBlock 이 하는 일

```text
1  범위 검사. 밖이면 false
2  같은 id 면 false
3  Chunk 의 배열에 쓴다
4  해당 청크를 dirty 로 표시
5  경계 블록이면 인접 청크도 dirty 로 표시   ★ 잊기 쉽다
6  changedBlocks 에 좌표를 넣는다
7  BLOCK_CHANGED 이벤트를 발행한다
8  true 반환
```

5 번을 빠뜨리면 청크 경계에 구멍이 보인다. 가장 흔한 버그다.

## 6.2 Chunk

```ts
export class Chunk {
  static readonly SIZE = 16;
  readonly coord: ChunkCoord;
  readonly blocks: Uint16Array;   // 4096

  static index(lx: number, ly: number, lz: number): number {
    return lx + lz * 16 + ly * 256;
  }
}
```

블록에 인스턴스 객체를 만들지 않는다. 100 만 개의 객체가 된다.

## 6.3 블록 부가 상태

블록 자체가 아니라 별도 맵이 소유한다.

```ts
// FarmSystem 이 소유한다
Map<string /* "x,y,z" */, { stage: number; plantedAtGameMinutes: number }>

// SleepSystem 이 소유한다
Map<string /* bed 좌표 */, string /* npcId */>
```

키를 문자열로 만드는 것은 `Map` 의 참조 동등성 문제를 피하기 위해서다.
`posKey(pos)` 헬퍼를 `types` 에 둔다.

---

# 7. 좌표 타입

```ts
export interface BlockPos { x: number; y: number; z: number; }   // 정수
export interface Vec3     { x: number; y: number; z: number; }   // 실수
export interface ChunkCoord { cx: number; cy: number; cz: number; }
```

## 7.1 변환 함수에 기준점을 명시한다

```ts
blockToWorldMin(p: BlockPos): Vec3       // 블록의 최소 모서리
blockToWorldCenter(p: BlockPos): Vec3    // 블록의 중심
worldToBlock(v: Vec3): BlockPos          // floor
```

`blockToWorld` 라는 이름을 쓰지 않는다.
어느 지점인지 모르면 NPC 가 블록 모서리를 목적지로 삼는 버그가 반복된다.

## 7.2 사용 규칙

```text
게임 규칙 / 방 판정 / 통행 / 저장   →  BlockPos
이동 / 충돌 / 렌더 / 카메라        →  Vec3
NPC 의 이동 목적지                →  blockToWorldCenter(BlockPos)
```

---

# 8. Raycast 와 Collision

## 8.1 raycast.ts

```ts
export interface RaycastHit {
  pos: BlockPos;
  face: BlockPos;        // 단위 법선. -1 / 0 / 1
  distance: number;
}

/** 복셀 DDA. Amanatides & Woo. */
export function raycastVoxels(
  world: VoxelWorld,
  origin: Vec3,
  direction: Vec3,      // 정규화되어 있어야 한다
  maxDistance: number,
  isTarget: (id: number) => boolean,
): RaycastHit | null;
```

`isTarget` 을 주입받는 이유는 용도마다 대상이 다르기 때문이다.

```text
블록 파괴     id !== 0 && 파괴 가능
블록 설치     id !== 0                (설치는 hit.pos + hit.face 에 한다)
카메라 충돌   isOpaque(id)
```

## 8.2 collision.ts

```ts
export interface AabbBody {
  pos: Vec3;        // 발밑 중심
  velocity: Vec3;
  width: number;
  height: number;
  onGround: boolean;
}

/** 축 분리 스윕. world 를 읽기만 한다. */
export function moveWithCollision(
  world: VoxelWorld,
  body: AabbBody,
  dt: number,
  stepUpHeight: number,
): void;
```

순수 함수에 가깝게 유지한다. `body` 를 변형하지만 월드는 읽기만 한다.
테스트에서 가짜 `VoxelWorld` 를 넣어 검증한다.

---

# 9. 렌더 — 청크 메싱

## 9.1 ChunkMeshManager

```ts
export class ChunkMeshManager {
  constructor(scene: THREE.Scene, world: VoxelWorld, workerCount: number);

  /** GameWorld.update 이후, render 이전에 호출한다. */
  update(): void;
}
```

```text
update()
  1  world.takeDirtyChunks() 를 받아 큐에 넣는다 (중복 제거)
  2  유휴 Worker 에게 청크를 하나씩 보낸다
  3  완료된 결과를 최대 chunkUploadsPerFrame 개까지 GPU 에 올린다
  4  나머지는 다음 프레임으로 미룬다
```

## 9.2 Worker 프로토콜

```ts
// 메인 → Worker
interface MeshRequest {
  coord: ChunkCoord;
  /** 경계 1 칸을 포함한 18 × 18 × 18 뷰. 5832 개. */
  padded: Uint16Array;
}

// Worker → 메인
interface MeshResult {
  coord: ChunkCoord;
  opaque:      { positions: Float32Array; normals: Float32Array; uvs: Float32Array; ao: Float32Array; indices: Uint32Array };
  transparent: { ... } | null;
}
```

**경계 1 칸을 포함한 18³ 뷰를 넘기는 것이 규칙이다.**

Worker 가 인접 청크를 알 수 없으므로, 메인 스레드가 미리 잘라서 넘긴다.
이 규칙을 지키지 않으면 청크 경계의 면 컬링이 틀린다.

`ArrayBuffer` 는 transferable 로 넘긴다. 복사하지 않는다.

## 9.3 greedyMesh.ts

```ts
/** 순수 함수. Worker 도 three 도 모른다. 테스트 대상이다. */
export function greedyMesh(
  padded: Uint16Array,       // 18³
  defs: readonly BlockDefinition[],
): MeshData;
```

Worker 파일에는 알고리즘을 두지 않는다. 메시지 배선만 한다.
그래야 Vitest 에서 Worker 없이 테스트할 수 있다.

## 9.4 materials.ts

**재질 생성은 이 파일 한 곳에만 있다.**

```ts
export function createOpaqueMaterial(atlas: THREE.Texture): THREE.Material;
export function createTransparentMaterial(atlas: THREE.Texture): THREE.Material;
export function createEntityMaterial(...): THREE.Material;
```

ADR 011 의 WebGPU 전환 조건이 충족되면 이 파일만 고친다.
`ShaderMaterial` 을 다른 곳에서 만들지 않는다.

---

# 10. 방 인식

**이 장이 이 아키텍처의 핵심이다.**

## 10.1 detectRoom.ts — 순수 함수

```ts
export interface RoomBlockReader {
  get(x: number, y: number, z: number): number;
}

export type RoomFailure =
  | { reason: 'NOT_ENCLOSED'; at: BlockPos }
  | { reason: 'NO_FLOOR';     at: BlockPos }
  | { reason: 'NO_DOOR' }
  | { reason: 'WALL_TOO_LOW'; at: BlockPos }
  | { reason: 'TOO_LARGE' }
  | { reason: 'TOO_SMALL' };

export interface RoomShape {
  interior: BlockPos[];     // 바닥 위 첫 칸의 내부 셀
  boundary: BlockPos[];     // 벽 블록 좌표
  doors:    BlockPos[];
  floorY:   number;         // interior 의 y
}

export type RoomDetection =
  | { ok: true;  shape: RoomShape }
  | { ok: false; failure: RoomFailure };

export function detectRoom(
  read: RoomBlockReader,
  start: BlockPos,
  limits: { minFloorArea: number; maxFloorArea: number; minWallHeight: number },
): RoomDetection;
```

`VoxelWorld` 가 아니라 `RoomBlockReader` 를 받는다.

테스트에서 3 차원 배열 리터럴로 방을 그려 넣고 검증하기 위해서다.
이것이 이 프로젝트에서 가장 많이 작성될 테스트다.

## 10.2 matchRecipe.ts — 순수 함수

```ts
export interface FurnitureHit { pos: BlockPos; blockId: number; }

export interface RoomFacilities {
  beds:           BlockPos[];    // 접근 가능한 것만
  cookingSpots:   BlockPos[];    // cooking_stove 에 인접한 통행 가능 셀
  diningSeats:    BlockPos[];    // table 에 인접한 chair
  chests:         BlockPos[];
}

export interface RecipeMatch {
  type: RoomType;
  facilities: RoomFacilities;
}

export function matchRecipe(
  read: RoomBlockReader,
  shape: RoomShape,
  recipes: readonly RoomRecipe[],
): RecipeMatch;
```

**반환값이 `RoomType` 만이 아니라 `RoomFacilities` 를 포함하는 것이 핵심이다.**

Version 0.2 의 Prefab 은 침대 위치를 상수로 알고 있었다.
자유 건축에서는 방 판정만이 그것을 안다.

주민 AI 가 나중에 다시 방 안을 스캔하게 만들면 안 된다.
판정할 때 한 번만 계산하고 결과를 들고 다닌다.

### 접근성 판정에 NavigationGraph 를 쓰지 않는다

`matchRecipe` 의 인자에 `NavigationGraph` 가 없는 것은 실수가 아니다.

```text
접근 가능한 bed  =  bed 가 차지한 2 칸 중 한 칸이
                   shape.interior 의 어떤 셀과 수평으로 인접해 있다
```

`shape.interior` 는 이미 "비고체이고 바로 아래가 고체" 인 셀만 담고 있다.
그것이 통행 가능의 정의다 (MVP_SPEC 11.2 의 조건 1, 2).

`NavigationGraph` 를 인자로 받으면 `room` 이 `nav` 에 의존하게 되어
ARCHITECTURE 2.1 의 의존성 방향이 깨진다. 같은 판정을 두 곳에서 하지 않는다.

## 10.3 RoomRegistry

```ts
export class RoomRegistry {
  getAll(): readonly Room[];
  getById(id: string): Room | undefined;
  getByType(type: RoomType): readonly Room[];
  findContaining(pos: BlockPos): Room | undefined;

  /** 이 좌표가 바뀌었으니 다시 판정하라고 큐에 넣는다. */
  markDirty(pos: BlockPos): void;

  /** 예산 안에서 큐를 처리한다. RoomSystem 이 호출한다. */
  processQueue(budgetMs: number): void;

  /** 진단 모드 전용. 큐를 거치지 않고 즉시 판정한다. */
  diagnose(start: BlockPos): RoomDetection;

  /** 로드 직후에만 호출한다. 전역 스캔. */
  rebuildAll(doorPositions: readonly BlockPos[]): void;
}
```

## 10.4 Room 엔티티

```ts
export interface Room {
  readonly id: string;
  type: RoomType;
  shape: RoomShape;
  facilities: RoomFacilities;
  center: BlockPos;
}
```

`Room` 은 순수 데이터다. three 를 모른다. 메서드를 두지 않는다.

## 10.5 재판정 큐

```text
markDirty(pos)
  ├─ pos 를 포함하는 기존 Room 이 있으면 그 Room 의 door 를 큐에 넣는다
  └─ pos 가 door 이거나 door 에 인접하면 그 door 를 큐에 넣는다

processQueue(budgetMs)
  시작 시각을 재고, 예산을 넘기 전까지:
    큐에서 door 를 꺼낸다
    detectRoom → matchRecipe
    결과가 이전과 다르면 Room 을 갱신하고 이벤트를 발행한다
```

같은 door 가 큐에 중복으로 들어가면 합친다. `Set` 으로 관리한다.

## 10.6 방이 사라질 때의 연쇄

```text
ROOM_UNREGISTERED
  ├─ SleepSystem     그 방의 침대 배정을 전부 해제한다
  ├─ NPCSystem       그 방을 목적지로 하던 Action 을 취소한다
  ├─ NPCSystem       그 방에서 자던 NPC 를 깨운다
  └─ UI              라벨을 지우고 경고음을 낸다
```

**GratitudeSystem 은 구독하지 않는다.** 포인트를 회수하지 않는다 (ADR 013).

---

# 11. 통행과 경로

## 11.1 NavigationGraph

```ts
export class NavigationGraph {
  constructor(world: VoxelWorld);

  /** 발을 디딜 수 있는 위치인가. MVP_SPEC 15 장의 조건. */
  isStandable(pos: BlockPos, actor: ActorKind): boolean;

  /** from 에서 한 걸음에 갈 수 있는 이웃. 같은 높이 / +1 / -1. */
  neighbors(pos: BlockPos, actor: ActorKind, out: BlockPos[]): number;

  /** 블록이 바뀌면 주변 3 × 3 × 3 캐시를 버린다. */
  invalidate(pos: BlockPos): void;
}

export type ActorKind = 'npc' | 'monster';
```

## 11.2 ActorKind 가 남은 이유

ADR 015 는 통행 레이어 두 개를 없앴다.

그래도 `ActorKind` 는 남는다. **문 때문이다.**

```text
door 블록
  npc      비고체로 취급 → 통과
  monster  고체로 취급   → 통과 불가, 파괴 대상
```

기본값을 두지 않는다. 호출부가 항상 명시해야 한다.
기본값이 있으면 몬스터 경로를 NPC 규칙으로 계산하는 버그가 조용히 생긴다.

## 11.3 pathfind.ts

```ts
export interface PathResult {
  path: BlockPos[] | null;
  nodesExplored: number;
  reason?: 'NO_PATH' | 'NODE_LIMIT';
}

export function findPath(
  graph: NavigationGraph,
  from: BlockPos,
  to: BlockPos,
  actor: ActorKind,
  maxNodes: number,
): PathResult;
```

**`reason` 을 반드시 반환한다.**

```text
NO_PATH      경로가 진짜로 없다  →  몬스터는 벽을 부순다
NODE_LIMIT   너무 멀다          →  몬스터는 계속 시도한다. 부수지 않는다
```

둘을 구분하지 않으면 몬스터가 멀리 있다는 이유로 멀쩡한 벽을 부순다.

## 11.4 MovementController

```ts
export class MovementController {
  setPath(path: BlockPos[]): void;
  update(dt: number, body: AabbBody, speed: number): 'moving' | 'arrived' | 'blocked';

  /** 경로 위의 블록이 바뀌었을 때 호출. 다음 update 에서 재계산을 요청한다. */
  invalidate(): void;
}
```

## 11.5 재계산 규칙

```text
언제 재계산하는가
  경로 위의 셀이 통행 불가가 되었다
  목적지가 통행 불가가 되었다
  'blocked' 가 연속 3 회 발생했다

재계산 최소 간격
  NPC 당 0.5 초 (balance.npc.repathMinIntervalSeconds)
```

간격 제한이 없으면 문 앞에 두 NPC 가 겹쳤을 때 매 프레임 A* 가 돌아
프레임이 무너진다.

---

# 12. Entity 와 View

ADR 006 을 유지한다.

## 12.1 Entity 는 순수 데이터다

```ts
export interface NPC {
  readonly id: string;
  readonly role: NPCRole;
  body: AabbBody;
  health: number;
  action: Action;
  assignedBed: BlockPos | null;
  hasEatenThisMeal: boolean;
  stunUntilGameMinutes: number;
}
```

`three` 를 import 하지 않는다. 메서드를 최소화한다.

## 12.2 EntityView 는 렌더 쪽에 있다

```ts
// src/render/EntityView.ts
export class EntityView {
  readonly object3d: THREE.Object3D;
  syncFrom(npc: NPC): void;    // 위치 / 회전 / 애니메이션 상태
}
```

```text
Entity  →  진실의 원천
View    →  Entity 를 읽어서 그린다. Entity 를 고치지 않는다
```

## 12.3 위치 동기화

렌더는 매 프레임 `syncFrom` 을 호출한다.

보간을 하지 않는다. `GameWorld.update` 와 `render` 가 같은 프레임에 돌기 때문이다.

---

# 13. Action

ADR 008 을 유지한다. **NPC 의 상태는 현재 Action 이다.**

```ts
export interface Action {
  readonly kind: ActionKind;
  readonly label: string;             // UI 표시용

  start(ctx: ActionContext): void;
  update(ctx: ActionContext, dt: number): ActionStatus;
  cancel(ctx: ActionContext): void;   // 방이 사라지는 등 외부 사유
}

export type ActionStatus = 'running' | 'done' | 'failed';
```

## 13.1 별도의 state 필드를 두지 않는다

```text
없다      npc.state = 'sleeping'
있다      npc.action.kind === 'sleep'
```

두 곳에 상태를 두면 반드시 어긋난다.

## 13.2 복합 Action 을 만들지 않는다

```text
없다   FarmAction   (이동 + 심기 + 기다리기 + 수확)
있다   MoveAction → PlantAction
       MoveAction → HarvestAction
```

복합 Action 은 내부에 또 하나의 상태 기계를 만든다.
그 상태 기계는 디버그 패널에 보이지 않는다.

## 13.3 RestAction 과 SleepAction 은 다른 Action 이다

```text
SleepAction   침대가 있다. 감사 포인트 +5
RestAction    침대가 없다. 광장에 앉는다. 포인트 없음
```

하나의 Action 에 플래그로 처리하지 않는다.
플레이어에게는 완전히 다른 장면이고, 그것이 침실을 짓는 동기다.

## 13.4 ActionContext

```ts
export interface ActionContext {
  readonly npc: NPC;
  readonly world: VoxelWorld;
  readonly rooms: RoomRegistry;
  readonly nav: NavigationGraph;
  readonly storage: VillageStorage;
  readonly clock: GameClockReader;
  readonly events: EventBus;
}
```

Action 은 `GameWorld` 전체를 받지 않는다. 필요한 것만 받는다.

---

# 14. NPCDecisionSystem

```ts
export interface NPCContext {
  npc: NPC;
  phase: DayPhase;
  gameMinutes: number;
  threatNearby: Monster | null;
  dialogueRequested: boolean;
  storage: Readonly<VillageStorageData>;
  rooms: RoomRegistry;
  worldState: Readonly<WorldStateData>;
  damageLog: Readonly<DamageEntry[]>;
}

export function decideAction(ctx: NPCContext): Action | null;
```

## 14.1 우선순위는 5 단계. 위에서 아래로 한 번만

```text
1  위협      ctx.threatNearby !== null              → FleeAction
2  대화      ctx.dialogueRequested                  → TalkAction
3  생리      식사 시간 && !hasEatenThisMeal          → EatAction
           취침 시간                               → SleepAction / RestAction
4  역할      역할별 조건                             → 역할 Action
5  기본      아무것도 아니면                          → IdleAction
```

`null` 을 반환하면 현재 Action 을 유지한다.

## 14.2 Context 는 Decision 직전에 조립한다

미리 만들어 두고 재사용하지 않는다.
같은 프레임 안에서도 몬스터가 죽거나 방이 사라질 수 있다.

## 14.3 Context 는 전부 읽기 전용이다

`decideAction` 은 아무것도 바꾸지 않는다.
바꾸는 것은 반환된 Action 의 `start` / `update` 다.

---

# 15. 시스템 책임표

```text
GameClockSystem       게임 시간 진행. DayPhase 전이 이벤트
InventorySystem       플레이어 인벤토리 / 핫바
CraftingSystem        제작 레시피 판정. 해금 확인
BlockEditSystem       레이캐스트 / 파괴 진행도 / 설치 규칙
RoomSystem            RoomRegistry.processQueue 호출. 예산 관리
NPCDecisionSystem     Action 선택 (순수)
NPCSystem             Action 실행. NPC 이동
FarmSystem            crop 성장 단계. farmland 파괴 시 정리
CookingSystem         조리 진행. crop → food
MealSystem            식사 시간 판정. hasEatenThisMeal 리셋
SleepSystem           침대 배정 / 해제
GratitudeSystem       포인트 누적. 최초 인식 보너스 중복 방지
VillageLevelSystem    게이트 평가. 종 상호작용 처리. 해금 적용
RaidSystem            습격 스케줄. 몬스터 스폰 / 소멸
MonsterSystem         몬스터 AI. 블록 파괴
RepairSystem          DamageLog 관리. 목수 수리 할당
CombatSystem          플레이어 / 몬스터 공격 판정
WorldStateSystem      파생 지표 계산 (순수 함수 호출)
GameEventSystem       진행 이벤트 조건 평가 / 커맨드 실행
DialogueSystem        대사 재생
ObjectiveSystem       목표 문구
```

## 15.1 시스템은 다른 시스템을 직접 호출하지 않는다

예외를 둔다.

```text
허용   GameWorld 가 update 순서대로 호출한다
허용   생성자 주입으로 받은 읽기 전용 조회 (rooms.getByType 등)
금지   시스템 A 가 시스템 B 의 상태를 바꾼다
```

상태를 바꿔야 하면 이벤트를 발행하거나 커맨드를 반환한다.

---

# 16. GratitudeSystem

```ts
export class GratitudeSystem {
  get total(): number;

  /** 다른 시스템이 호출한다. */
  gain(source: GratitudeSource, amount: number, at: Vec3): void;

  /** VillageLevelSystem 만 호출한다. */
  spend(amount: number): boolean;
}

export type GratitudeSource =
  | { kind: 'sleep';  npcId: string }
  | { kind: 'cook';   npcId: string }
  | { kind: 'eat';    npcId: string }
  | { kind: 'firstRoom'; roomType: RoomType }
  | { kind: 'gameEvent';  id: GameEventId };
```

## 16.1 중복 방지

```text
firstRoom     타입별로 1 회. 이미 준 타입 집합을 저장한다
gameEvent     이벤트 id 별로 1 회
sleep         npcId + 날짜로 1 회
cook / eat    행위마다 1 회. 중복 방지가 필요 없다
```

이 집합들은 저장 대상이다.

## 16.2 gain 은 반드시 좌표를 받는다

`at` 은 `+N` 연출을 띄울 위치다.

좌표 없이 포인트가 오르면 플레이어는 이유를 모른다.
ADR 013 의 위험 항목이다. 인터페이스로 강제한다.

---

# 17. VillageLevelSystem

```ts
export interface LevelGateStatus {
  requirement: string;      // "인식된 방"
  current: number;
  required: number;
  met: boolean;
}

export class VillageLevelSystem {
  get level(): number;
  get residentCap(): number;

  /** 종 UI 가 매 프레임 호출한다. 전부 표시하기 위한 것이다. */
  evaluate(): { cost: number; gates: LevelGateStatus[]; canRing: boolean };

  /** 플레이어가 종을 쳤을 때만 호출된다. */
  ring(): boolean;

  isUnlocked(blockId: number): boolean;
}
```

## 17.1 evaluate 가 전부 반환하는 이유

MVP_SPEC 23.4 가 미충족 조건을 전부 표시하라고 요구한다.

`canRing: boolean` 만 반환하면 UI 가 다시 조건을 계산해야 한다.
계산이 두 곳에 생기면 반드시 어긋난다.

## 17.2 레벨은 내려가지 않는다

`ring` 만이 `level` 을 바꾼다. 감소 경로가 존재하지 않는다.

---

# 18. MonsterSystem

```ts
export type MonsterAction =
  | { kind: 'move';   path: BlockPos[] }
  | { kind: 'break';  target: BlockPos; progress: number }
  | { kind: 'attack'; targetId: string }
  | { kind: 'wander' };
```

## 18.1 판단 순서

```text
1  종까지 findPath(actor: 'monster')
2  path !== null            → move
3  reason === 'NODE_LIMIT'  → 목표 방향으로 move (부수지 않는다)
4  reason === 'NO_PATH'
     목표 방향으로 가장 가까운 파괴 가능 블록을 찾는다
     찾으면 그 앞 셀로 이동 → break
     못 찾으면 가장 가까운 NPC / 플레이어 → attack
     그것도 없으면 wander
5  05:00 이 되면 종류와 무관하게 소멸
```

## 18.2 파괴 가능 블록 탐색

```ts
function findBreakableToward(
  world: VoxelWorld, from: BlockPos, toward: BlockPos, maxRadius: number,
): BlockPos | null;
```

```text
조건   blockDefinitions[id].terrain === false
      id !== 0
      몬스터가 서 있는 위치에서 수평으로 인접하거나 그 위 칸
```

`terrain === true` 인 블록은 후보에서 제외한다. MVP_SPEC 8.2 다.

## 18.3 블록을 부수면

```text
world.setBlock(pos, 0, 'monster')
    ↓
BLOCK_CHANGED (by: 'monster')
    ↓
RepairSystem 이 DamageLog 에 기록한다
NavigationGraph 가 무효화된다
RoomRegistry 가 dirty 로 표시한다
    ↓
다음 프레임에 경로를 다시 찾는다
```

---

# 19. RepairSystem

```ts
export class RepairSystem {
  get pending(): readonly DamageEntry[];

  /** 몬스터가 부순 블록을 기록한다. BLOCK_CHANGED 를 구독한다. */
  log(pos: BlockPos, blockId: number): void;

  /** 목수가 수리할 다음 좌표. 하루 상한을 넘으면 null. */
  nextRepairTarget(): DamageEntry | null;

  /** 목수 또는 플레이어가 복구했을 때. */
  resolve(pos: BlockPos): void;
}
```

플레이어가 직접 블록을 놓아도 `resolve` 가 호출되어야 한다.
`BLOCK_CHANGED` 를 구독해서 `pos` 가 `pending` 에 있으면 제거한다.

---

# 20. GameEventSystem

ADR 007 을 유지한다. **execute 는 부작용 대신 커맨드를 반환한다.**

```ts
export interface EventContext {
  readonly clock: GameClockReader;
  readonly storage: Readonly<VillageStorageData>;
  readonly worldState: Readonly<WorldStateData>;
  readonly rooms: RoomRegistry;
  readonly gratitude: number;
  readonly villageLevel: number;
  readonly lastRaid: Readonly<RaidResult> | null;
  readonly completed: ReadonlySet<GameEventId>;
  readonly dialogueCompleted: ReadonlySet<string>;
}

export type GameCommand =
  | { kind: 'setObjective'; text: string; progress?: { current: number; total: number } }
  | { kind: 'markDialogueAvailable'; npcId: string; dialogueId: string }
  | { kind: 'spawnResident'; role: NPCRole }
  | { kind: 'gainGratitude'; amount: number }
  | { kind: 'playCutscene'; id: string };

export interface GameEventDefinition {
  id: GameEventId;
  canTrigger(ctx: EventContext): boolean;
  execute(ctx: EventContext): GameCommand[];
}
```

## 20.1 왜 커맨드인가

```text
execute 안에서 직접 호출하면
  이벤트 정의가 모든 시스템을 알아야 한다
  테스트에 모든 시스템의 가짜 객체가 필요하다

커맨드를 반환하면
  이벤트 정의는 순수 함수다
  테스트가 반환 배열만 비교하면 된다
  GameEventSystem 한 곳에서만 커맨드를 해석한다
```

## 20.2 완료는 비가역이다

```ts
if (!completed.has(def.id) && def.canTrigger(ctx)) {
  completed.add(def.id);                 // 먼저 기록한다
  const commands = def.execute(ctx);
  dispatch(commands);
}
```

`completed` 에서 제거하는 경로를 만들지 않는다. MVP_SPEC 27.3 이다.

## 20.3 이벤트 정의 예

```ts
{
  id: 'EVENT_BELL_REQUEST',
  canTrigger: (ctx) =>
    ctx.completed.has('EVENT_BEDROOM_REQUEST') &&
    ctx.rooms.getAll().filter(r => r.type !== 'EmptyRoom').length >= 2,
  execute: () => [
    { kind: 'markDialogueAvailable', npcId: 'carpenter', dialogueId: 'bell_intro' },
    { kind: 'gainGratitude', amount: balance.gratitude.onGameEvent },
  ],
}
```

목표 문구를 여기서 바꾸지 않는다. ADR 010 이다.
대사가 끝날 때 `DialogueSystem` 이 `setObjective` 를 낸다.

---

# 21. DialogueSystem 과 ObjectiveSystem

## 21.1 대사 데이터가 다음 목표를 들고 있다

```ts
export interface DialogueDefinition {
  id: string;
  npcId: string;
  lines: string[];
  nextObjective?: { text: string; progress?: { current: number; total: number } };
}
```

## 21.2 해금은 대사에 걸지 않는다

ADR 010 을 유지한다.

```text
이벤트 발생   →  해금 적용 + 대화 표시 띄우기
대사 종료     →  목표 문구만 바뀐다
```

플레이어가 대화를 건너뛰어도 진행이 막히지 않는다.

## 21.3 진행 수치가 있는 목표

```text
"밭흙을 4 칸 만들어 주세요"      (2 / 4)
```

`ObjectiveSystem` 이 매 프레임 현재 수치를 다시 센다.

**"마을을 벽으로 둘러싸 주세요" 에는 수치를 붙이지 않는다.**
벽을 채점하지 않는다는 ADR 015 의 결정 때문이다.

---

# 22. WorldStateSystem

ADR 004 를 유지한다.

```ts
export interface WorldStateData {
  readonly foodLevel: number;
  readonly safetyLevel: number;
  readonly housingLevel: number;
  readonly happinessLevel: number;
  readonly population: number;
}

/** 순수 함수. 테스트 대상. */
export function computeWorldState(input: {
  population: number;
  food: number;
  accessibleBeds: number;
  lastRaid: RaidResult | null;
  balance: typeof balance;
}): WorldStateData;
```

## 22.1 저장하지 않는다

`SaveData` 에 포함하지 않는다. 로드 후 계산한다.

## 22.2 변경 API 가 없다

```text
increaseFood()      없다
setPopulation()     없다
```

## 22.3 accessibleBeds 는 RoomRegistry 가 센다

```ts
rooms.getByType('Bedroom')
     .reduce((n, r) => n + r.facilities.beds.length, 0)
```

`facilities.beds` 는 접근 가능한 것만 담고 있다 (10.2 참조).
`housingLevel` 이 도달 불가능한 침대를 세지 않는다.

---

# 23. SaveSystem

```ts
export interface SaveData {
  version: number;
  clock: { day: number; hour: number; minute: number };

  chunks: { coord: ChunkCoord; blocks: Uint16Array }[];   // 변경된 청크만
  doorPositions: BlockPos[];                              // 로드 시 방 재구축 가속

  player: { pos: Vec3; health: number; inventory: ItemStack[]; hotbarIndex: number };
  storage: VillageStorageData;

  npcs: {
    id: string; role: NPCRole; pos: Vec3;
    assignedBed: BlockPos | null;
    hasEatenThisMeal: boolean;
  }[];

  gratitude: number;
  gratitudeOnce: { roomTypes: RoomType[]; eventIds: string[]; sleptToday: string[] };
  villageLevel: number;
  unlocked: number[];

  completedEvents: GameEventId[];
  completedDialogues: string[];

  lastRaid: RaidResult | null;
  raidsFired: number[];

  damageLog: DamageEntry[];
  crops: { pos: BlockPos; stage: number; plantedAt: number }[];
}
```

## 23.1 저장하지 않는 것

```text
WorldState 지표     계산한다
방 인식 결과         블록에서 다시 판정한다
NPC 의 현재 Action  IdleAction 으로 시작한다
통행 그래프 캐시
청크 메시
```

## 23.2 NPC 의 Action 을 복원하지 않는 이유

Action 은 진행 중인 경로, 남은 시간, 대상 좌표를 들고 있다.
저장하면 Action 이 늘 때마다 저장 형식이 바뀐다.

다음 프레임에 `decideAction` 이 같은 결론을 낸다.
자고 있던 주민은 로드 직후 다시 침대로 걸어간다. 허용 가능한 차이다.

## 23.3 저장소는 IndexedDB 다

`localStorage` 는 보통 5MB 제한이다.
변경된 청크만 저장해도 건축이 진행되면 초과한다.

## 23.4 모든 시간값은 게임 시간이다

`Date.now()` 를 저장하지 않는다.
저장은 `gameMinutes` (게임 시작부터의 누적 분) 하나로 표현한다.

## 23.5 Save Version

`version` 이 다르면 `migrate.ts` 를 통과시킨다.
마이그레이션이 불가능하면 로드를 거부하고 새 게임을 제안한다. 조용히 깨뜨리지 않는다.

---

# 24. Data Layer

```text
src/game/data/
  balance.ts       모든 밸런스 수치. MVP_SPEC 34 장이 정본
  blocks.ts        BlockDefinition[] . MVP_SPEC 8.1 이 정본
  recipes.ts       제작 레시피. MVP_SPEC 8.5 가 정본
  roomRecipes.ts   방 레시피. MVP_SPEC 12.1 이 정본
  unlocks.ts       레벨별 해금. MVP_SPEC 23.2 가 정본
  dialogues.ts     대사
  gameEvents.ts    진행 이벤트 정의 8 개
  island.ts        섬 지형 생성 데이터
```

## 24.1 로직에 상수를 쓰지 않는다

```text
금지   if (npc.pos.distanceTo(monster.pos) < 12)
허용   if (npc.pos.distanceTo(monster.pos) < balance.npc.threatRadius)
```

## 24.2 data 는 아무것도 import 하지 않는다

`types` 만 예외로 허용한다.

`data` 가 시스템을 import 하면 순환이 생기고, 테스트에서 데이터만
불러오는 것이 불가능해진다.

---

# 25. 테스트 대상

```text
반드시 테스트한다 (three 없이 실행된다)

  greedyMesh          블록 배열 → 정점 수 / 면 방향
  detectRoom          ★ 가장 많은 케이스. 아래 25.1 참조
  matchRecipe         가구 배치 → RoomType + facilities
  isStandable         3D 통행 조건
  findPath            경로 존재 / NO_PATH / NODE_LIMIT 구분
  moveWithCollision   블록 관통 / step-up
  raycastVoxels       DDA 정확도
  computeWorldState   경계값 (population 0, food 0)
  decideAction        우선순위 5 단계
  GameEventDefinition canTrigger / execute 반환 커맨드
  VillageLevelSystem  게이트 평가 / 레벨 비감소
  GratitudeSystem     중복 방지
  CraftingSystem      해금 확인
  SaveData            직렬화 / 역직렬화 왕복
```

## 25.1 detectRoom 테스트가 가장 중요하다

이 프로젝트에서 가장 많이 작성될 테스트다.

테스트는 3 차원 배열 리터럴로 방을 그린다.

```ts
const room = buildTestWorld(`
  y=0:  # # # # #        # = plank
        # . . . #        . = air
        # . . . #        D = door
        # . . . #
        # # D # #
  y=1:  # # # # #
        # . . . #
        # . . . #
        # . . . #
        # # D # #
`);

expect(detectRoom(room, { x: 2, y: 0, z: 2 }, limits).ok).toBe(true);
```

`buildTestWorld` 헬퍼를 가장 먼저 만든다.
이 헬퍼가 없으면 방 테스트를 아무도 쓰지 않게 된다.

## 25.2 반드시 테스트해야 하는 실패 케이스

```text
벽이 한 칸 뚫려 있다           → NOT_ENCLOSED + 정확한 좌표
문이 없다                     → NO_DOOR
벽이 한 칸 높이뿐이다          → WALL_TOO_LOW + 좌표
바닥에 구멍이 있다             → NO_FLOOR + 좌표
2 × 2 미만 (내부 셀 3 개 이하)  → TOO_SMALL    minFloorArea 4
10 × 10 초과 (내부 셀 101 개)  → TOO_LARGE    maxFloorArea 100
dirt 로만 둘러싸였다          → NOT_ENCLOSED   ★ 지형은 벽이 아니다
침대가 벽에 끼어 있다          → Bedroom 이 아니라 EmptyRoom
의자가 식탁에서 떨어져 있다     → DiningRoom 이 아니다
```

## 25.3 렌더는 테스트하지 않는다

`src/render/` 는 수동 확인한다.
그래서 `greedyMesh` 를 `render` 가 아니라 `workers/` 에 순수 함수로 둔다.

---

# 26. DebugSystem

`F3` 로 여는 패널에 상시 표시한다.

```text
FPS / 프레임 시간 / 드로우콜
청크: 총 / dirty / 메싱 중 / 이번 프레임 업로드
방: 인식 수 / 타입별 / 재판정 큐 길이 / 마지막 판정 소요 ms
NPC: id / 현재 Action label / 목적지 / 경로 길이
몬스터: 수 / 현재 행동 / 파괴 대상 좌표
감사 포인트 / 마을 레벨 / 다음 게이트 상태
WorldState 4 개 지표
게임 시간 / DayPhase
```

디버그 명령:

```text
시간 배속 1× / 4× / 16×
시각 강제 설정
습격 즉시 발생
감사 포인트 부여
블록 무제한 모드
방 경계 상시 표시
통행 가능 셀 표시
```

**"방 경계 상시 표시" 와 "통행 가능 셀 표시" 는 필수다.**
이 둘 없이 방 인식과 경로 버그를 잡는 것은 불가능하다.

---

# 27. 상태 소유권

같은 값을 두 곳에서 관리하지 않는다.

```text
값                        소유자
블록                      VoxelWorld
방                        RoomRegistry
crop 성장 단계             FarmSystem
침대 배정                  SleepSystem
NPC 위치 / 체력 / Action   NPC 엔티티
population                EntityRegistry.npcs.size    ★ WorldState 가 아니다
감사 포인트                GratitudeSystem
마을 레벨 / 해금            VillageLevelSystem
완료된 이벤트               GameEventSystem
DamageLog                 RepairSystem
플레이어 인벤토리            InventorySystem
마을 저장소                VillageStorage
파생 지표                  누구도 소유하지 않는다. 매 프레임 계산한다
```

---

# 28. 핵심 데이터 흐름

## 28.1 블록 설치

```text
우클릭
  → BlockEditSystem.raycast
  → 설치 규칙 검사 (MVP_SPEC 10.4)
  → InventorySystem.consume(1)
  → VoxelWorld.setBlock(pos, id, 'player')
      ├→ Chunk dirty + 인접 청크 dirty
      ├→ changedBlocks 에 추가
      └→ BLOCK_CHANGED 발행
  → (다음 update 순서에서)
      RoomSystem      : rooms.markDirty(pos)
      NavigationGraph : invalidate(pos)
      ChunkMeshManager: takeDirtyChunks → Worker
```

## 28.2 방 인식 ★

```text
RoomSystem.update
  → rooms.processQueue(3ms)
      → 큐에서 door 를 꺼낸다
      → detectRoom(read, start, limits)
          ok: false → 기존 Room 이 있으면 ROOM_UNREGISTERED
          ok: true  → matchRecipe(read, shape, roomRecipes)
                      → Room 생성 또는 갱신
                      → ROOM_REGISTERED / ROOM_TYPE_CHANGED
  → GratitudeSystem 이 ROOM_REGISTERED 를 구독
      → 그 타입이 처음이면 gain('firstRoom', 20, room.center)
  → UI 가 라벨을 띄우고 효과음을 낸다
```

## 28.3 주민이 잠든다

```text
NPCDecisionSystem
  → 취침 시간이고 npc.assignedBed !== null
  → new MoveAction(bed) → new SleepAction(bed)

SleepAction.start
  → npc 를 침대 위치에 눕힌다
  → events.emit('GRATITUDE_GAINED', ...) 이 아니라
    GratitudeSystem.gain({ kind: 'sleep', npcId }, 5, bedWorldPos)

GratitudeSystem
  → 오늘 이미 잤으면 무시한다
  → total += 5
  → GRATITUDE_GAINED 발행

UI
  → 침대 위치에 +5 를 띄운다
```

## 28.4 몬스터가 벽을 부순다

```text
MonsterSystem
  → findPath(monster, bell, 'monster')
  → reason === 'NO_PATH'
  → findBreakableToward(...)  (terrain === false 만)
  → MonsterAction 'break'
  → progress += dt / (breakSeconds * 2.0)
  → progress >= 1
      → VoxelWorld.setBlock(pos, 0, 'monster')
      → BLOCK_CHANGED (by: 'monster')
          ├→ RepairSystem.log(pos, blockId)
          ├→ NavigationGraph.invalidate(pos)
          └→ RoomRegistry.markDirty(pos)
  → 다음 프레임에 경로 재탐색 → 통과
```

## 28.5 종을 친다

```text
F (종 조준)
  → VillageLevelSystem.evaluate()
  → UI 가 게이트 상태를 전부 표시
  → canRing 이면 [종을 친다] 활성
  → VillageLevelSystem.ring()
      → GratitudeSystem.spend(cost)
      → level += 1
      → unlocked 갱신
      → VILLAGE_LEVEL_UP 발행
  → RaidSystem 이 구독 → 다음 21:00 습격 예약
  → GameEventSystem 이 다음 프레임에 EVENT_NEW_RESIDENT 조건을 만족
  → 커맨드 spawnResident → 다음 07:00 에 도착
```

---

# 29. 이번 범위에서 쓰지 않는 아키텍처

```text
ECS 프레임워크
Service Locator
전역 싱글턴 (balance / blockDefinitions 같은 읽기 전용 데이터는 예외)
DI 컨테이너
상태 관리 라이브러리
물리 엔진
Fixed timestep 시뮬레이션
클라이언트-서버 분리
옥트리 / 스파스 복셀
복셀 광원 전파
```

의존성 주입은 생성자 인자로만 한다.

---

# 30. 아키텍처 변경 규칙

## 30.1 문서가 서로 다르면

```text
수치 / 조건식         →  MVP_SPEC.md
인터페이스 / 구조      →  ARCHITECTURE.md (이 문서)
작업 순서 / 완료 조건  →  TASKS.md
의도 / 감정 목표      →  GAME_DESIGN.md
```

## 30.2 문서와 코드가 다르면

**문서를 먼저 고친다.**

코드만 고치고 문서를 남겨두면 다음 작업에서 같은 모순을 다시 만난다.

이 프로젝트는 그 모순을 두 번의 정합성 정리로 걷어냈고,
이번 전면 개정에서 다시 한 번 걷어냈다.

## 30.3 구조를 바꾸려면 ADR 을 쓴다

배경 / 결정 / 검토한 대안 / 예상되는 결과를 포함한다.

기존 결정을 뒤집으면 원본 ADR 의 `Status` 를 `Superseded by ADR NNN` 으로
바꾸고, 왜 뒤집혔는지 상단에 인용문으로 남긴다.

**원본을 삭제하지 않는다.** 그 결정이 왜 옳았고 언제부터 틀렸는지가 기록이다.

---

# 31. ADR 목록

```text
001  Phaser 3 / Vite SPA                    Superseded by 011
002  Prefab 건물 배치                        Superseded by 012
003  React 를 쓰지 않는다                     Accepted
004  WorldState 는 파생 지표다                Accepted
005  방벽은 몬스터만 막고 파괴되지 않는다        Superseded by 015
006  Entity / View 분리                     Accepted (011 로 보정)
007  진행 이벤트는 커맨드를 반환한다             Accepted
008  NPC 의 상태는 현재 Action 이다            Accepted
009  마을 입구에는 방벽만                      Superseded by 015
010  대사 종료는 목표 문구만 바꾼다              Accepted
011  3D 복셀 / Three.js                     Accepted
012  자유 건축 + 방 인식                      Accepted
013  감사 포인트 + 마을 레벨                   Accepted
014  복셀 청크 16³ + 그리디 메싱               Accepted
015  3D 통행 그래프 + 파괴 가능한 벽            Accepted
```

---

# 32. 최종 아키텍처 목표

```text
게임 규칙은 렌더 엔진을 모른다
    엔진이 한 번 바뀌었고, 또 바뀔 수 있다

방 인식은 순수 함수다
    이 게임의 심장이며, 가장 많이 테스트된다

상태의 소유자는 언제나 한 곳이다
    파생값은 누구도 소유하지 않는다

이벤트는 알림이고, 커맨드는 명령이다
    둘을 섞지 않는다
```
