// 블록의 유일한 소유자 (ARCHITECTURE 6, 27). 편집 진입점은 setBlock(단일 칸)과 editObject(다중 칸)다.
// 크기는 데이터로 주입한다. 청크 단위로 저장·dirty 추적하며 국소 편집마다 월드 전체를 순회하지 않는다.
import { BlockId, isMultiCell } from '../data/blocks';
import type { EventBus } from '../EventBus';
import type {
  BlockChangeSource,
  BlockPos,
  ChunkCoord,
  ObjectEditCommand,
  PlacedObjectSnapshot,
} from '../types';
import { Chunk } from './Chunk';
import { objectCells, PlacementIndex } from './PlacementIndex';

/** 월드 크기 (블록 단위). MVP 는 balance.world 의 128 × 64 × 128 이다. */
export interface WorldSize {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
}

/** 외부에 공개하는 PlacementIndex 의 읽기 조회와 id 발급. 변경은 editObject 로만 한다. */
export type PlacementQuery = Pick<
  PlacementIndex,
  'get' | 'objectAt' | 'isOccupied' | 'all' | 'allocateId' | 'objectIdCounter'
>;

/** 커밋 뒤 발행할 칸 하나의 변경 기록. */
interface CellChange {
  readonly pos: BlockPos;
  readonly from: number;
  readonly to: number;
}

/** 복셀 월드. 경계 밖은 air(0) 로 읽힌다. */
export class VoxelWorld {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  /** 각 축의 청크 개수. 크기가 16 의 배수가 아니면 마지막 청크가 일부만 쓰인다. */
  readonly chunksX: number;
  readonly chunksY: number;
  readonly chunksZ: number;

  private readonly chunks: (Chunk | undefined)[];
  /** 청크별 메시 revision. 블록이 없는(air 만인) 청크도 이웃 변경으로 revision 이 오를 수 있다. */
  private readonly revisions: Uint32Array;
  private readonly dirty = new Set<number>();
  private readonly index = new PlacementIndex();
  private batchCounter = 0;

  /** 크기와 이벤트 버스를 받는다. 모든 칸은 air 로 시작한다. */
  constructor(
    size: WorldSize,
    private readonly events: EventBus,
  ) {
    for (const v of [size.sizeX, size.sizeY, size.sizeZ]) {
      if (!Number.isInteger(v) || v <= 0) throw new RangeError(`월드 크기가 잘못되었다: ${v}`);
    }
    this.sizeX = size.sizeX;
    this.sizeY = size.sizeY;
    this.sizeZ = size.sizeZ;
    this.chunksX = Math.ceil(size.sizeX / Chunk.SIZE);
    this.chunksY = Math.ceil(size.sizeY / Chunk.SIZE);
    this.chunksZ = Math.ceil(size.sizeZ / Chunk.SIZE);
    const count = this.chunksX * this.chunksY * this.chunksZ;
    this.chunks = new Array<Chunk | undefined>(count).fill(undefined);
    this.revisions = new Uint32Array(count);
  }

  /** 다중 칸 객체 조회. */
  get placements(): PlacementQuery {
    return this.index;
  }

  /** 마지막으로 발급한 편집 batchId. 저장용이다 (editBatchCounter). */
  get editBatchCounter(): number {
    return this.batchCounter;
  }

  /** 좌표가 월드 안인가. */
  inBounds(x: number, y: number, z: number): boolean {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      Number.isInteger(z) &&
      x >= 0 &&
      y >= 0 &&
      z >= 0 &&
      x < this.sizeX &&
      y < this.sizeY &&
      z < this.sizeZ
    );
  }

  /** 블록 id. 월드 밖은 0(air) 이다. 미로드 청크의 의미가 아니다 (ARCHITECTURE 2.3). */
  getBlock(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return 0;
    const chunk = this.chunks[this.chunkIndexOfBlock(x, y, z)];
    if (!chunk) return 0;
    return chunk.blocks[Chunk.index(x & Chunk.MASK, y & Chunk.MASK, z & Chunk.MASK)] ?? 0;
  }

  /**
   * 단일 칸을 쓴다 (ARCHITECTURE 6.1). 성공하면 true.
   * 월드 밖·같은 id·다중 칸 블록 id·다중 칸 객체가 점유한 칸이면 거부하고 false 를 반환한다.
   */
  setBlock(x: number, y: number, z: number, id: number, by: BlockChangeSource): boolean {
    if (!this.inBounds(x, y, z)) return false;
    if (isMultiCell(id)) return false;
    const pos = { x, y, z };
    if (this.index.isOccupied(pos)) return false;
    const from = this.getBlock(x, y, z);
    if (from === id) return false;
    this.writeCell(pos, id);
    this.publish([{ pos, from, to: id }], by);
    return true;
  }

  /**
   * 다중 칸 객체를 원자적으로 설치·제거한다 (ARCHITECTURE 6.3).
   * 모든 칸을 먼저 검증하고, 하나라도 실패하면 아무것도 바꾸지 않고 false 를 반환한다.
   * 설치는 모든 칸이 월드 안의 air 이고 기존 객체가 없어야 한다. 지지면 등 설치 규칙은 호출자가 검사한다.
   */
  editObject(command: ObjectEditCommand, by: BlockChangeSource): boolean {
    if (command.kind === 'place') return this.placeObject(command.object, by);
    return this.removeObject(command.objectId, by);
  }

  /** 청크 좌표의 청크. 범위 밖이거나 아직 블록이 쓰이지 않았으면 undefined. */
  getChunk(cx: number, cy: number, cz: number): Chunk | undefined {
    if (!this.chunkInBounds(cx, cy, cz)) return undefined;
    return this.chunks[this.chunkIndex(cx, cy, cz)];
  }

  /** 청크의 현재 메시 revision. 범위 밖은 0. */
  getRevision(coord: ChunkCoord): number {
    if (!this.chunkInBounds(coord.cx, coord.cy, coord.cz)) return 0;
    return this.revisions[this.chunkIndex(coord.cx, coord.cy, coord.cz)] ?? 0;
  }

  /** 마지막 호출 이후 dirty 가 된 청크 좌표. 중복 없이 반환하고 비운다. 렌더 전용이다. */
  takeDirtyChunks(): ChunkCoord[] {
    const out: ChunkCoord[] = [];
    for (const i of this.dirty) out.push(this.chunkCoordOf(i));
    this.dirty.clear();
    return out;
  }

  /** 모든 청크 좌표. 초기 메싱처럼 전체가 필요한 곳에서만 쓴다. */
  allChunkCoords(): ChunkCoord[] {
    const out: ChunkCoord[] = [];
    for (let i = 0; i < this.chunks.length; i++) out.push(this.chunkCoordOf(i));
    return out;
  }

  /**
   * 초기 생성 전용 쓰기. 이벤트를 발행하지 않고 revision·dirty 도 건드리지 않는다.
   * 섬 생성 뒤에는 markAllDirty 로 첫 메싱을 요청한다. 다중 칸 객체는 쓸 수 없다.
   */
  writeInitial(x: number, y: number, z: number, id: number): void {
    if (!this.inBounds(x, y, z)) throw new RangeError(`월드 밖: ${x},${y},${z}`);
    if (isMultiCell(id)) throw new Error('다중 칸 객체는 editObject 로 배치한다');
    this.chunkForWrite(x, y, z).blocks[
      Chunk.index(x & Chunk.MASK, y & Chunk.MASK, z & Chunk.MASK)
    ] = id;
  }

  /** 모든 청크를 dirty 로 표시하고 revision 을 올린다. 초기 생성·로드 직후 한 번 쓴다. */
  markAllDirty(): void {
    for (let i = 0; i < this.chunks.length; i++) {
      this.revisions[i] = (this.revisions[i] ?? 0) + 1;
      this.dirty.add(i);
    }
  }

  /** 설치 명령을 검증하고 커밋한다. */
  private placeObject(object: PlacedObjectSnapshot, by: BlockChangeSource): boolean {
    if (!isMultiCell(object.blockId)) return false;
    if (this.index.get(object.id)) return false;
    const cells = objectCells(object);
    for (const c of cells) {
      if (!this.inBounds(c.x, c.y, c.z)) return false;
      if (this.index.isOccupied(c)) return false;
      if (this.getBlock(c.x, c.y, c.z) !== BlockId.air) return false;
    }
    const changes = cells.map((pos) => ({ pos, from: BlockId.air, to: object.blockId }));
    for (const c of cells) this.writeCell(c, object.blockId);
    this.index.insert(object, cells);
    this.publish(changes, by);
    return true;
  }

  /** 제거 명령을 검증하고 커밋한다. 모든 점유 칸이 air 가 된다. */
  private removeObject(objectId: string, by: BlockChangeSource): boolean {
    const object = this.index.get(objectId);
    if (!object) return false;
    const cells = objectCells(object);
    const changes = cells.map((pos) => ({ pos, from: object.blockId, to: BlockId.air }));
    for (const c of cells) this.writeCell(c, BlockId.air);
    this.index.delete(objectId);
    this.publish(changes, by, object);
    return true;
  }

  /** 칸 하나를 배열에 쓰고, padded 뷰에 이 칸을 포함하는 모든 청크를 dirty 로 만든다. */
  private writeCell(p: BlockPos, id: number): void {
    this.chunkForWrite(p.x, p.y, p.z).blocks[
      Chunk.index(p.x & Chunk.MASK, p.y & Chunk.MASK, p.z & Chunk.MASK)
    ] = id;
    this.markDirtyAround(p);
  }

  /**
   * 변경점을 padded(18³) 에 포함하는 청크를 모두 dirty 로 한다 (ARCHITECTURE 6.1 의 5).
   * 각 축에서 로컬 좌표가 0 이면 -1 이웃, 15 이면 +1 이웃이 포함된다. 면·모서리·꼭짓점 최대 8 청크.
   */
  private markDirtyAround(p: BlockPos): void {
    const cx = p.x >> Chunk.SHIFT;
    const cy = p.y >> Chunk.SHIFT;
    const cz = p.z >> Chunk.SHIFT;
    const xs = neighborsOnAxis(cx, p.x & Chunk.MASK);
    const ys = neighborsOnAxis(cy, p.y & Chunk.MASK);
    const zs = neighborsOnAxis(cz, p.z & Chunk.MASK);
    for (const x of xs) {
      for (const y of ys) {
        for (const z of zs) {
          if (!this.chunkInBounds(x, y, z)) continue;
          const i = this.chunkIndex(x, y, z);
          this.revisions[i] = (this.revisions[i] ?? 0) + 1;
          this.dirty.add(i);
        }
      }
    }
  }

  /** 커밋이 끝난 뒤 같은 batchId 로 칸별 BLOCK_CHANGED 를 발행한다 (MVP_SPEC 10.5 의 5). */
  private publish(
    changes: readonly CellChange[],
    by: BlockChangeSource,
    removedObject?: PlacedObjectSnapshot,
  ): void {
    this.batchCounter += 1;
    const batchId = this.batchCounter;
    for (const c of changes) {
      this.events.emit('BLOCK_CHANGED', {
        batchId,
        pos: c.pos,
        from: c.from,
        to: c.to,
        by,
        ...(removedObject ? { removedObject } : {}),
      });
    }
  }

  /** 쓰기용 청크. 없으면 만든다. */
  private chunkForWrite(x: number, y: number, z: number): Chunk {
    const i = this.chunkIndexOfBlock(x, y, z);
    let chunk = this.chunks[i];
    if (!chunk) {
      chunk = new Chunk({ cx: x >> Chunk.SHIFT, cy: y >> Chunk.SHIFT, cz: z >> Chunk.SHIFT });
      this.chunks[i] = chunk;
    }
    return chunk;
  }

  /** 청크 좌표가 범위 안인가. */
  private chunkInBounds(cx: number, cy: number, cz: number): boolean {
    return (
      cx >= 0 && cy >= 0 && cz >= 0 && cx < this.chunksX && cy < this.chunksY && cz < this.chunksZ
    );
  }

  /** 청크 좌표 → 내부 배열 인덱스. */
  private chunkIndex(cx: number, cy: number, cz: number): number {
    return cx + cz * this.chunksX + cy * this.chunksX * this.chunksZ;
  }

  /** 블록 좌표 → 청크 배열 인덱스. */
  private chunkIndexOfBlock(x: number, y: number, z: number): number {
    return this.chunkIndex(x >> Chunk.SHIFT, y >> Chunk.SHIFT, z >> Chunk.SHIFT);
  }

  /** 내부 배열 인덱스 → 청크 좌표. */
  private chunkCoordOf(i: number): ChunkCoord {
    const layer = this.chunksX * this.chunksZ;
    const cy = Math.floor(i / layer);
    const rest = i - cy * layer;
    const cz = Math.floor(rest / this.chunksX);
    return { cx: rest - cz * this.chunksX, cy, cz };
  }
}

/** 한 축에서 padded 뷰가 이 로컬 좌표를 포함하는 청크 좌표들. */
function neighborsOnAxis(c: number, local: number): number[] {
  if (local === 0) return [c, c - 1];
  if (local === Chunk.SIZE - 1) return [c, c + 1];
  return [c];
}
