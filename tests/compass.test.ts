import { describe, expect, it } from 'vitest';
import { headingFromDirection, normalizeDeg, signedDeltaDeg } from '../src/ui/CompassHud';

describe('나침반 방위 (MVP_SPEC 29, HR-019)', () => {
  it('북 = −z, 동 = +x, 남 = +z, 서 = −x', () => {
    const deg = (dx: number, dz: number) =>
      Math.round(normalizeDeg((headingFromDirection(dx, dz) * 180) / Math.PI));
    expect([deg(0, -1), deg(1, 0), deg(0, 1), deg(-1, 0)]).toEqual([0, 90, 180, 270]);
  });

  it('방위 차이는 가까운 쪽으로 [−180, 180) 이다', () => {
    expect(signedDeltaDeg(0, 350)).toBe(10);
    expect(signedDeltaDeg(270, 0)).toBe(-90);
    expect(signedDeltaDeg(180, 0)).toBe(-180);
  });
});
