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
}
