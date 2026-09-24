// 다중 칸 객체(bed / door)의 점유 인덱스 (MVP_SPEC 10.4, ARCHITECTURE 6.3).
// VoxelWorld 가 소유한다. 외부에는 읽기 조회만 공개하고 변경은 VoxelWorld.editObject 로만 한다.
import { BlockId } from '../data/blocks';
import { posKey, type BlockPos, type Facing, type PlacedObjectSnapshot } from '../types';

/** facing 방향의 수평 한 칸 오프셋. north = -z, south = +z, east = +x, west = -x. */
export function facingOffset(facing: Facing): { dx: number; dz: number } {
  switch (facing) {
    case 'north':
      return { dx: 0, dz: -1 };
    case 'south':
      return { dx: 0, dz: 1 };
    case 'east':
      return { dx: 1, dz: 0 };
    case 'west':
      return { dx: -1, dz: 0 };
  }
}

/**
 * 객체가 점유하는 칸 목록. 첫 칸이 anchor 다.
 * 침대는 anchor 와 facing 방향 한 칸, 문은 anchor 와 y+1 한 칸이다 (ARCHITECTURE 6.3).
 */
export function objectCells(
  object: Pick<PlacedObjectSnapshot, 'blockId' | 'anchor' | 'facing'>,
): BlockPos[] {
  const a = object.anchor;
  if (object.blockId === BlockId.bed) {
    const o = facingOffset(object.facing);
    return [a, { x: a.x + o.dx, y: a.y, z: a.z + o.dz }];
  }
  if (object.blockId === BlockId.door) {
    return [a, { x: a.x, y: a.y + 1, z: a.z }];
  }
  throw new Error(`다중 칸 객체가 아닌 blockId: ${object.blockId}`);
}

/** 객체 id ↔ 점유 칸의 양방향 인덱스와 id 발급 카운터. */
export class PlacementIndex {
  private readonly objects = new Map<string, PlacedObjectSnapshot>();
  private readonly cellToObject = new Map<string, string>();
  private counter = 0;

  /** 모든 배치를 지운다(로드 복원 전용, ARCHITECTURE 23.4 의 2). */
  clear(): void {
    this.objects.clear();
    this.cellToObject.clear();
  }

  /** 다음 객체 id 를 발급한다. 단조 증가하며 저장된다 (objectIdCounter). */
  allocateId(): string {
    this.counter += 1;
    return `obj-${this.counter}`;
  }

  /** 현재 id 카운터. 저장용이다. */
  get objectIdCounter(): number {
    return this.counter;
  }

  /** id 로 객체를 찾는다. */
  get(id: string): PlacedObjectSnapshot | undefined {
    return this.objects.get(id);
  }

  /** 칸을 점유한 대표 객체를 찾는다. */
  objectAt(p: BlockPos): PlacedObjectSnapshot | undefined {
    const id = this.cellToObject.get(posKey(p));
    return id === undefined ? undefined : this.objects.get(id);
  }

  /** 칸이 다중 칸 객체에 점유되어 있는가. */
  isOccupied(p: BlockPos): boolean {
    return this.cellToObject.has(posKey(p));
  }

  /** 모든 객체. 저장·검증용 복사본이다. */
  all(): PlacedObjectSnapshot[] {
    return [...this.objects.values()];
  }

  /** 객체를 등록한다. 검증은 호출자(VoxelWorld)가 끝낸 뒤다. */
  insert(object: PlacedObjectSnapshot, cells: readonly BlockPos[]): void {
    this.objects.set(object.id, object);
    for (const c of cells) this.cellToObject.set(posKey(c), object.id);
  }

  /** 객체를 제거한다. 제거한 객체를 반환한다. */
  delete(id: string): PlacedObjectSnapshot | undefined {
    const object = this.objects.get(id);
    if (!object) return undefined;
    for (const c of objectCells(object)) this.cellToObject.delete(posKey(c));
    this.objects.delete(id);
    return object;
  }

  /** id 카운터를 최소 value 까지 올린다. 로드 복원용이며 줄이지 않는다. */
  ensureCounterAtLeast(value: number): void {
    this.counter = Math.max(this.counter, value);
  }
}
