// 16³ 청크 (MVP_SPEC 7.2, ARCHITECTURE 6.2). 블록마다 객체를 만들지 않고 TypedArray 로 저장한다.
import type { ChunkCoord } from '../types';

/** 블록 id 배열 하나. index = x + z * 16 + y * 256. */
export class Chunk {
  static readonly SIZE = 16;
  static readonly VOLUME = Chunk.SIZE * Chunk.SIZE * Chunk.SIZE;
  /** 블록 좌표 → 청크 좌표 시프트 (log2 SIZE). */
  static readonly SHIFT = 4;
  /** 블록 좌표 → 청크 로컬 좌표 마스크 (SIZE - 1). */
  static readonly MASK = Chunk.SIZE - 1;

  readonly blocks = new Uint16Array(Chunk.VOLUME);

  /** 청크 좌표를 받는다. 블록은 전부 air(0) 로 시작한다. */
  constructor(readonly coord: ChunkCoord) {}

  /** 청크 로컬 좌표의 배열 인덱스. */
  static index(lx: number, ly: number, lz: number): number {
    return lx + lz * Chunk.SIZE + ly * Chunk.SIZE * Chunk.SIZE;
  }
}
