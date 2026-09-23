import { describe, expect, it } from 'vitest';
import * as coords from '../src/game/voxel/coords';
import {
  blockToWorldCenter,
  blockToWorldMin,
  standCellToWorldFeet,
  worldToBlock,
} from '../src/game/voxel/coords';
import { balance } from '../src/game/data/balance';
import { posKey } from '../src/game/types';

describe('좌표 변환 기준점 (MVP_SPEC 7.3)', () => {
  const p = { x: 3, y: 25, z: -2 };

  it('blockToWorldMin 은 최소 모서리다', () => {
    expect(blockToWorldMin(p)).toEqual({ x: 3, y: 25, z: -2 });
  });

  it('blockToWorldCenter 는 세 축 모두 +0.5 다', () => {
    expect(blockToWorldCenter(p)).toEqual({ x: 3.5, y: 25.5, z: -1.5 });
  });

  it('standCellToWorldFeet 는 수평 중심·바닥면이다', () => {
    expect(standCellToWorldFeet(p)).toEqual({ x: 3.5, y: 25, z: -1.5 });
  });

  it('worldToBlock 은 음수에서도 내림한다', () => {
    expect(worldToBlock({ x: -0.01, y: 0.99, z: 1 })).toEqual({ x: -1, y: 0, z: 1 });
  });

  it('세 기준점 모두 worldToBlock 으로 같은 블록에 돌아온다', () => {
    for (const q of [p, { x: 0, y: 0, z: 0 }, { x: 127, y: 63, z: 127 }, { x: -5, y: -1, z: 9 }]) {
      expect(worldToBlock(blockToWorldMin(q))).toEqual(q);
      expect(worldToBlock(blockToWorldCenter(q))).toEqual(q);
      expect(worldToBlock(standCellToWorldFeet(q))).toEqual(q);
    }
  });

  it('blockToWorld 라는 이름의 함수가 존재하지 않는다', () => {
    expect(Object.keys(coords)).not.toContain('blockToWorld');
  });
});

describe('balance / posKey', () => {
  it('balance 는 34 장의 값을 담는다', () => {
    expect(balance.world.sizeX).toBe(128);
    expect(balance.storage.initialSeed).toBe(3);
    expect(balance.performance.chunkUploadsPerFrame).toBe(2);
  });

  it('posKey 는 좌표마다 다르다', () => {
    expect(posKey({ x: 1, y: 2, z: 3 })).not.toBe(posKey({ x: 1, y: 23, z: 0 }));
  });
});
