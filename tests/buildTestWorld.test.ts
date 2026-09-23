import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/game/data/blocks';
import { buildTestWorld } from './helpers/buildTestWorld';

describe('buildTestWorld (TASK-017)', () => {
  it('문자열 레이어에서 RoomBlockReader 를 만든다. 레이어 수가 y 높이다', () => {
    const t = buildTestWorld(`
      y=0: # # #
           # # #
      y=1: # . T
           C . #
      y=2: . . .
           . . .
    `);
    expect(t.dims).toEqual({ x: 3, y: 3, z: 2 });
    expect(t.world.sizeY).toBe(3);
    expect(t.get(0, 0, 0)).toBe(BlockId.plank);
    expect(t.get(1, 1, 0)).toBe(BlockId.air);
    expect(t.get(2, 1, 0)).toBe(BlockId.table);
    expect(t.get(0, 1, 1)).toBe(BlockId.chair);
    expect(t.contains({ x: 2, y: 2, z: 1 })).toBe(true);
    expect(t.contains({ x: 3, y: 0, z: 0 })).toBe(false);
    expect(t.contains({ x: 0, y: -1, z: 0 })).toBe(false);
  });

  it('기본 바닥을 자동 생성하지 않는다', () => {
    const t = buildTestWorld(`
      y=0: . .
           . .
    `);
    expect(t.get(0, 0, 0)).toBe(BlockId.air);
    expect(t.get(1, 0, 1)).toBe(BlockId.air);
  });

  it('D 는 수직 쌍의 문 객체다. 아래 칸이 anchor 다', () => {
    const t = buildTestWorld(`
      y=0: # # #
      y=1: # D #
      y=2: # D #
    `);
    const lower = t.objectAt({ x: 1, y: 1, z: 0 });
    const upper = t.objectAt({ x: 1, y: 2, z: 0 });
    expect(lower?.blockId).toBe(BlockId.door);
    expect(lower?.anchor).toEqual({ x: 1, y: 1, z: 0 });
    expect(upper?.id).toBe(lower?.id);
    expect(t.get(1, 2, 0)).toBe(BlockId.door);
  });

  it('B 는 명시한 anchor / facing 의 침대 객체다', () => {
    const t = buildTestWorld(
      `
      y=0: # # #
      y=1: B B .
    `,
      { beds: [{ anchor: { x: 0, y: 1, z: 0 }, facing: 'east' }] },
    );
    const a = t.objectAt({ x: 0, y: 1, z: 0 });
    expect(a?.blockId).toBe(BlockId.bed);
    expect(a?.facing).toBe('east');
    expect(t.objectAt({ x: 1, y: 1, z: 0 })?.id).toBe(a?.id);
  });

  it('offset 과 size 로 큰 월드 안에 놓는다', () => {
    const t = buildTestWorld(`y=0: # #`, {
      offset: { x: 3, y: 2, z: 4 },
      size: { sizeX: 10, sizeY: 5, sizeZ: 10 },
    });
    expect(t.get(3, 2, 4)).toBe(BlockId.plank);
    expect(t.get(4, 2, 4)).toBe(BlockId.plank);
    expect(t.world.sizeX).toBe(10);
  });

  it('잘못된 점유·메타데이터는 오류를 낸다', () => {
    // 짝 없는 문
    expect(() => buildTestWorld(`y=0: D`)).toThrow(/짝 없는 문/);
    // 세 칸 문 = 두 칸 + 짝 없는 한 칸
    expect(() => buildTestWorld(`y=0: D\ny=1: D\ny=2: D`)).toThrow(/짝 없는 문/);
    // 선언 없는 침대
    expect(() => buildTestWorld(`y=0: B B`)).toThrow(/침대 선언/);
    // 선언과 다른 방향
    expect(() =>
      buildTestWorld(`y=0: B B`, { beds: [{ anchor: { x: 0, y: 0, z: 0 }, facing: 'south' }] }),
    ).toThrow(/B 가 없다/);
    // 모르는 기호·행 길이 불일치·레이어 번호 오류
    expect(() => buildTestWorld(`y=0: # ?`)).toThrow(/모르는 기호/);
    expect(() => buildTestWorld(`y=0: # #\n # `)).toThrow(/열 수/);
    expect(() => buildTestWorld(`y=1: #`)).toThrow(/y=0/);
    expect(() => buildTestWorld(`# #`)).toThrow(/머리말/);
  });
});
