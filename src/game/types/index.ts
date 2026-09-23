// 공통 타입의 유일한 위치 (MVP_SPEC 33.1). 같은 개념을 다른 파일에서 다시 정의하지 않는다.
// 이 파일은 아무것도 import 하지 않는다 (ARCHITECTURE 2.1).

/** 정수 복셀 좌표. 게임 규칙 / 방 판정 / 통행 / 저장에서 쓴다. */
export interface BlockPos {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 실수 월드 좌표. 이동 / 충돌 / 렌더 / 카메라에서 쓴다. 블록 한 변은 1.0 이다. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * 캐릭터 충돌 몸체 (ARCHITECTURE 8.2). pos 는 발밑 중심이다.
 * 플레이어·NPC·몬스터 엔티티가 공유하므로 여기에 둔다. 이동 함수가 pos / velocity / onGround 를 바꾼다.
 */
export interface AabbBody {
  pos: Vec3;
  velocity: Vec3;
  readonly width: number;
  readonly height: number;
  onGround: boolean;
}

/** 청크 좌표. 블록 좌표를 청크 크기로 나눈 몫이다. */
export interface ChunkCoord {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
}

/** BlockPos 의 Map/Set 키. 모든 모듈이 이 함수 하나로 키를 만든다. */
export function posKey(p: BlockPos): string {
  return `${p.x},${p.y},${p.z}`;
}

/** ChunkCoord 의 Map/Set 키. */
export function chunkKey(c: ChunkCoord): string {
  return `${c.cx},${c.cy},${c.cz}`;
}

/** 초기 생성에서 블록 한 칸을 쓰는 콜백. data 계층이 voxel 을 import 하지 않도록 주입한다. */
export type WriteBlock = (x: number, y: number, z: number, id: number) => void;

/** 블록을 바꾼 주체 (ARCHITECTURE 5.2). 섬 생성·로드는 편집 API 를 거치지 않는다. */
export type BlockChangeSource = 'player' | 'monster' | 'npc';

/** 다중 칸 객체의 수평 방향. */
export type Facing = 'north' | 'east' | 'south' | 'west';

/** 다중 칸 객체(bed / door)의 배치 메타데이터 (ARCHITECTURE 6.3). */
export interface PlacedObjectSnapshot {
  readonly id: string;
  /** bed 또는 door */
  readonly blockId: number;
  readonly anchor: BlockPos;
  readonly facing: Facing;
}

/** VoxelWorld.editObject 의 원자적 편집 명령 (ARCHITECTURE 6.3). */
export type ObjectEditCommand =
  | { readonly kind: 'place'; readonly object: PlacedObjectSnapshot }
  | { readonly kind: 'remove'; readonly objectId: string };

/** 블록 종류 분류 (MVP_SPEC 8.1). */
export type BlockKind =
  'air' | 'terrain' | 'fluid' | 'build' | 'door' | 'light' | 'furniture' | 'crop' | 'special';

/** 블록이 아닌 재료. VillageStorage 의 세 자원과 같은 이름이다 (MVP_SPEC 13). */
export type MaterialId = 'seed' | 'crop' | 'food';

/** VillageStorage 의 세 자원 스냅샷 (MVP_SPEC 13.2). */
export interface VillageStorageData {
  readonly seed: number;
  readonly crop: number;
  readonly food: number;
}

/** 인벤토리에 들어가는 것. 블록이거나 재료다 (MVP_SPEC 13.1). */
export type ItemRef =
  | { readonly kind: 'block'; readonly blockId: number }
  | { readonly kind: 'material'; readonly material: MaterialId };

/** 파괴 시 인벤토리에 들어가는 드롭 한 항목. chance 가 없으면 항상 나온다. */
export interface BlockDrop {
  readonly item: ItemRef;
  readonly count: number;
  /** 0~1. 생략 시 1. MVP 에서 난수를 쓰는 유일한 곳은 leaves 의 seed 다 (MVP_SPEC 14.1). */
  readonly chance?: number;
}

/** 블록 정의 (TASKS TASK-004, MVP_SPEC 8.1). */
export interface BlockDefinition {
  readonly id: number;
  readonly name: string;
  readonly kind: BlockKind;
  /** 충돌·지지면 기준의 고체 여부. door 는 false (MVP_SPEC 8.3) */
  readonly solid: boolean;
  /** 면 컬링·AO 기준의 불투명 여부 */
  readonly opaque: boolean;
  /** true 면 몬스터가 파괴하지 않는다 (MVP_SPEC 8.2) */
  readonly terrain: boolean;
  /** null 이면 파괴 불가 */
  readonly breakSeconds: number | null;
  /** 플레이어 파괴 시 드롭. 몬스터 파괴·목수 수리는 드롭을 만들지 않는다 */
  readonly drops: readonly BlockDrop[];
  /** 다중 칸 객체(bed / door)의 점유 칸 수. 단일 칸은 1 */
  readonly cells: number;
  /** 반투명 메시로 그린다 (water / window). 뒤가 비쳐 보인다 (TASK-007) */
  readonly translucent: boolean;
}

/** 청크 메시의 버퍼 한 벌. 좌표는 청크 로컬(0~16)이다. 쿼드마다 정점 4 개, 인덱스 6 개. */
export interface MeshBuffers {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** 쿼드 로컬 반복 좌표. 병합된 w × h 쿼드는 0~w, 0~h 다. 셰이더가 타일 안에서 반복한다 */
  readonly uvs: Float32Array;
  /** 정점 AO 0~1. 1 이 가려지지 않은 상태다 */
  readonly ao: Float32Array;
  /** 아틀라스 타일 인덱스 = blockId * 3 + 면 종류(0 윗면 / 1 아랫면 / 2 옆면) */
  readonly tiles: Float32Array;
  readonly indices: Uint32Array;
}

/** greedyMesh 의 결과 (ARCHITECTURE 9.3). */
export interface MeshData {
  readonly opaque: MeshBuffers;
  /** 반투명 블록이 없으면 null */
  readonly transparent: MeshBuffers | null;
  /** 면 컬링 뒤 보이는 면 수와 병합 뒤 쿼드 수. 계측용이다 */
  readonly stats: { readonly visibleFaces: number; readonly quads: number };
}

/** 메인 → Worker 메싱 요청 (ARCHITECTURE 9.2). padded 는 전용 복사본이며 transferable 로 넘긴다. */
export interface MeshRequest {
  readonly coord: ChunkCoord;
  readonly revision: number;
  /** 경계 1 칸을 포함한 18 × 18 × 18 뷰. 5832 개. index = px + pz * 18 + py * 324 */
  readonly padded: Uint16Array;
}

/** Worker → 메인 메싱 결과. revision 이 현재 meshRevision 과 같을 때만 업로드한다. */
export interface MeshResult extends MeshData {
  readonly coord: ChunkCoord;
  readonly revision: number;
}

// ── 방 인식 (MVP_SPEC 11 / 12, ARCHITECTURE 10) ────────────────────────────────

/** 블록 id 읽기. room / nav 의 순수 판정이 공유한다. 월드 밖은 air(0) 로 읽는다. */
export interface BlockReader {
  /** blockId 를 읽는다. */
  get(x: number, y: number, z: number): number;
}

/** 방 판정이 읽는 블록·배치 정보 (ARCHITECTURE 10.1). VoxelWorld 를 직접 받지 않는다. */
export interface RoomBlockReader extends BlockReader {
  /** 월드 밖 air 와 내부 air 를 구별한다. */
  contains(pos: BlockPos): boolean;
  /** 다중 칸 객체(bed / door)를 조회한다. */
  objectAt(pos: BlockPos): PlacedObjectSnapshot | undefined;
}

/** 방 판정 제한값 (MVP_SPEC 11.1). balance.room 에서 온다. */
export interface RoomLimits {
  readonly minFloorArea: number;
  readonly maxFloorArea: number;
  readonly minWallHeight: number;
}

/** 방 판정 실패 사유와 확인 가능한 좌표 (MVP_SPEC 11.4). */
export type RoomFailure =
  | { readonly reason: 'NOT_ENCLOSED'; readonly at: BlockPos }
  | { readonly reason: 'NO_FLOOR'; readonly at: BlockPos }
  | { readonly reason: 'NO_DOOR' }
  | { readonly reason: 'WALL_TOO_LOW'; readonly at: BlockPos }
  | { readonly reason: 'TOO_LARGE' }
  | { readonly reason: 'TOO_SMALL' };

/** 성립한 방의 형태 (ARCHITECTURE 10.1). */
export interface RoomShape {
  /** 가구 점유를 포함한 바닥 영역(발 높이 y = floorY 의 칸) */
  readonly interior: readonly BlockPos[];
  /** 첫 층 경계. 둘째 층(y+1)도 벽으로 검증했다 */
  readonly boundary: readonly BlockPos[];
  /** 경계에 있는 완전한 두 칸 문의 아래 anchor */
  readonly doors: readonly BlockPos[];
  /** 내부 영역의 y. 바닥 블록은 floorY - 1 에 있다 */
  readonly floorY: number;
}

/** 방 판정 결과. */
export type RoomDetection =
  | { readonly ok: true; readonly shape: RoomShape }
  | { readonly ok: false; readonly failure: RoomFailure };

/**
 * 진단 모드(Tab)의 결과 (ARCHITECTURE 10.1, MVP_SPEC 11.5).
 * failureDetail 은 NOT_ENCLOSED 의 원인을 나눈다: 월드 밖 도달(열린 공간)인지, 벽이 아닌 블록인지.
 */
export interface RoomDiagnostic {
  readonly start: BlockPos;
  readonly detection: RoomDetection;
  /** 탐색한 내부 칸. 열린 공간이면 탐색 범위다 */
  readonly explored: readonly BlockPos[];
  /** 시작점에서 실패 지점(또는 마지막 방문 칸)까지 실제 탐색 경로. 구멍의 정답이라는 뜻이 아니다 */
  readonly escapeTrace: readonly BlockPos[];
  /** NOT_ENCLOSED 의 원인. 그 밖의 실패·성공이면 null */
  readonly failureDetail: 'outside' | 'notWall' | null;
  /** 성공한 방의 타입. 실패면 null */
  readonly roomType: RoomType | null;
  /** 가구 접근 실패·미충족 레시피 (MVP_SPEC 11.5) */
  readonly facilityIssues: readonly { readonly at: BlockPos; readonly message: string }[];
}

/** 방 타입 (MVP_SPEC 12.1). */
export type RoomType = 'DiningRoom' | 'Kitchen' | 'Bedroom' | 'Storeroom' | 'EmptyRoom';

/**
 * 방 레시피의 조건 (MVP_SPEC 12.1). 조건 종류는 다섯 타입과 1:1 이며 개수만 data 에 둔다.
 * 판정 로직은 room/matchRecipe.ts 에 있다.
 */
export type RoomRecipeRule =
  | { readonly kind: 'dining'; readonly minTables: number; readonly minChairsPerTable: number }
  | { readonly kind: 'kitchen'; readonly minStoves: number; readonly minWaterPots: number }
  | { readonly kind: 'bedroom'; readonly minBeds: number }
  | { readonly kind: 'storeroom'; readonly minChests: number }
  | { readonly kind: 'none' };

/** 방 레시피 한 행. priority 내림차순으로 처음 만족하는 타입을 부여한다. */
export interface RoomRecipe {
  readonly type: RoomType;
  readonly priority: number;
  readonly rule: RoomRecipeRule;
  /** 화면 표시 이름 (라벨·진단) */
  readonly displayName: string;
}

/** 접근 가능한 가구 하나 (ARCHITECTURE 10.2). */
export interface Facility {
  /** 다중 칸 객체는 PlacementIndex id, 단일 칸 가구는 posKey(ARCHITECTURE 6.3) */
  readonly objectId: string;
  readonly anchor: BlockPos;
  /** 가구에 수평 인접하고 문과 이어진 보행 셀. NPC 의 A* 목적지 후보다 */
  readonly approachCells: readonly BlockPos[];
  /** 렌더의 사용 자세용. body.pos 나 A* 목적지가 아니다 */
  readonly usePosition: Vec3;
}

/** 방 타입이 주민에게 주는 시설 (MVP_SPEC 12.4). 최종 타입의 시설만 채운다. */
export interface RoomFacilities {
  readonly beds: readonly Facility[];
  readonly cookingSpots: readonly Facility[];
  readonly diningSeats: readonly Facility[];
  readonly chests: readonly Facility[];
}

/** matchRecipe 결과. */
export interface RecipeMatch {
  readonly type: RoomType;
  readonly facilities: RoomFacilities;
}

/** 인식된 방 (ARCHITECTURE 10.4). RoomRegistry 가 소유하고 외부에는 읽기 전용으로 보인다. */
export interface Room {
  readonly id: string;
  readonly type: RoomType;
  readonly shape: RoomShape;
  readonly facilities: RoomFacilities;
  /** 라벨·보상 좌표용 대표 칸. 내부 칸 중 무게중심에 가장 가까운 칸 */
  readonly center: BlockPos;
  /** 재판정 대기 중. dirty 방의 시설은 신규 예약·완료 보상에 쓰지 않는다 */
  readonly dirty: boolean;
}

/** 통행 판정의 주체. door 가 NPC 에게만 비고체이므로 호출부가 항상 명시한다 (ARCHITECTURE 11.2). */
export type ActorKind = 'npc' | 'monster';
