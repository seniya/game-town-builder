// 방 fixture 생성기. buildTestWorld 의 문자열 레이어를 코드로 만든다 (큰 방·반복 사례용).
import { balance } from '../../src/game/data/balance';
import type { RoomLimits } from '../../src/game/types';

/** MVP 방 제한값. */
export const LIMITS: RoomLimits = balance.room;

/** 사각 방 레이어 옵션. */
export interface SquareRoomOptions {
  /** 내부 한 변 */
  readonly inner: number;
  /** 내부 z 변. 기본 inner */
  readonly innerZ?: number;
  /** 벽 높이(층 수). 기본 2 */
  readonly wallHeight?: number;
  /** 앞벽(z 최대) 가운데에 문을 둔다. 기본 true */
  readonly door?: boolean;
  /** 벽 기호. 기본 # */
  readonly wall?: string;
  /** 바닥 기호. 기본 # */
  readonly floor?: string;
  /** 벽 위로 더 쌓을 빈 층 수. 기본 1 (머리 공간 검사용) */
  readonly airAbove?: number;
}

/**
 * 바닥(y=0) + 벽(y=1..h) + 빈 층으로 된 사각 방의 레이어 문자열.
 * 내부는 x,z ∈ [1, inner], 문은 앞벽 z = innerZ + 1 의 가운데 x 에 있다.
 */
export function squareRoom(o: SquareRoomOptions): string {
  const nx = o.inner + 2;
  const nz = (o.innerZ ?? o.inner) + 2;
  const h = o.wallHeight ?? 2;
  const wall = o.wall ?? '#';
  const floor = o.floor ?? '#';
  const doorX = Math.floor(nx / 2);
  const layers: string[] = [];
  const rows = (cell: (x: number, z: number) => string): string =>
    Array.from({ length: nz }, (_, z) =>
      Array.from({ length: nx }, (_, x) => cell(x, z)).join(' '),
    ).join('\n');
  layers.push(`y=0:\n${rows(() => floor)}`);
  for (let y = 1; y <= h; y++) {
    layers.push(
      `y=${y}:\n${rows((x, z) => {
        const edge = x === 0 || z === 0 || x === nx - 1 || z === nz - 1;
        if (!edge) return '.';
        if ((o.door ?? true) && z === nz - 1 && x === doorX && y <= 2) return 'D';
        return wall;
      })}`,
    );
  }
  for (let k = 0; k < (o.airAbove ?? 1); k++) layers.push(`y=${h + 1 + k}:\n${rows(() => '.')}`);
  return layers.join('\n');
}
