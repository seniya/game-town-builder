// V4 큰 마을(SPEC 2·7, ADR 054): 큰 지도 후보, 경로 탐색의 올바름, 100 명 큰 지도 진행.
import { describe, expect, it } from 'vitest';
import { LAYOUTS } from '../../src/dotori/data/villageMap';
import { newWorld } from '../../src/dotori/sim/create';
import { entranceOf, getT, passable, tileCost } from '../../src/dotori/sim/map';
import { findPathRaw, pathStats } from '../../src/dotori/sim/path';
import { deserialize, serialize } from '../../src/dotori/sim/save';
import { run, step } from '../../src/dotori/sim/step';
import type { Pt, World } from '../../src/dotori/sim/types';

/** 시험용 결정적 난수(0~1). */
function lcg(seed: number): () => number {
  let r = seed;
  return () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
}

/** 경로가 규칙대로인가: 한 칸씩, 지나갈 수 있는 칸만, 대각선은 양옆이 열려 있을 때만. 비용을 돌려준다. */
function checkPath(w: World, sx: number, sy: number, path: readonly Pt[]): number {
  let x = sx;
  let y = sy;
  let cost = 0;
  for (const p of path) {
    const dx = p.x - x;
    const dy = p.y - y;
    expect(Math.max(Math.abs(dx), Math.abs(dy))).toBe(1);
    expect(passable(w, p.x, p.y)).toBe(true);
    if (dx && dy) {
      expect(passable(w, x + dx, y)).toBe(true);
      expect(passable(w, x, y + dy)).toBe(true);
    }
    cost += (dx && dy ? Math.SQRT2 : 1) * tileCost(getT(w, p.x, p.y));
    x = p.x;
    y = p.y;
  }
  return cost;
}

/** 비교용 다익스트라(느리지만 단순). 가장 싼 비용, 닿지 못하면 Infinity. */
function cheapest(w: World, sx: number, sy: number, tx: number, ty: number): number {
  const n = w.W * w.H;
  const d = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  d[sy * w.W + sx] = 0;
  for (;;) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < n; i++)
      if (!done[i] && (d[i] as number) < bd) {
        bd = d[i] as number;
        best = i;
      }
    if (best < 0) return Infinity;
    if (best === ty * w.W + tx) return bd;
    done[best] = 1;
    const cx = best % w.W;
    const cy = (best / w.W) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!passable(w, nx, ny)) continue;
        if (dx && dy && (!passable(w, cx + dx, cy) || !passable(w, cx, cy + dy))) continue;
        const nd = bd + (dx && dy ? Math.SQRT2 : 1) * tileCost(getT(w, nx, ny));
        const ni = ny * w.W + nx;
        if (nd < (d[ni] as number)) d[ni] = nd;
      }
  }
}

describe('V4 큰 마을', () => {
  it('큰 지도(160 × 104)는 같은 마을을 품고, 입구에서 모든 건물 문까지 걸어갈 수 있다', () => {
    const w = newWorld(5, { map: 'large' });
    expect([w.W, w.H]).toEqual([LAYOUTS.large.W, LAYOUTS.large.H]);
    const small = newWorld(5);
    expect(w.buildings.map((b) => [b.kind, b.x, b.y])).toEqual(
      small.buildings.map((b) => [b.kind, b.x, b.y]),
    );
    const e = entranceOf(w);
    expect(e).toEqual({ x: w.W - 2, y: 20 });
    expect(entranceOf(small)).toEqual({ x: 78, y: 20 });
    for (const b of w.buildings)
      expect(findPathRaw(w, e.x, e.y, b.door.x, b.door.y)).not.toBeNull();
    // 둘레 들판이 넓어 놓을 자리가 많다
    expect(w.L.grass.length).toBeGreaterThan(small.L.grass.length * 3);
    expect(w.L.water.length).toBeGreaterThan(small.L.water.length);
  });

  it('기본 지도는 배치를 데이터로 뺀 뒤에도 예전과 같은 지형이다', () => {
    const a = newWorld(20260926);
    const b = newWorld(20260926, { map: 'village' });
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect([a.W, a.H]).toEqual([80, 52]);
    // V4 이전(커밋 5dc2b67) 지형의 FNV-1a 해시와 같다
    let h = 2166136261;
    for (const t of a.tiles) h = Math.imul(h ^ t, 16777619) >>> 0;
    expect(h).toBe(711421900);
  });

  it('경로는 규칙을 지키고 가장 싼 비용이다(다익스트라와 비교)', () => {
    const w = newWorld(3, { map: 'large' });
    const R = lcg(99);
    let checked = 0;
    for (let i = 0; i < 400 && checked < 25; i++) {
      const sx = Math.floor(R() * w.W);
      const sy = Math.floor(R() * w.H);
      const tx = Math.floor(R() * w.W);
      const ty = Math.floor(R() * w.H);
      if (!passable(w, sx, sy) || !passable(w, tx, ty)) continue;
      // 다익스트라가 느리므로 60 칸 안쪽 쌍만 본다
      if (Math.max(Math.abs(sx - tx), Math.abs(sy - ty)) > 60) continue;
      const p = findPathRaw(w, sx, sy, tx, ty);
      const best = cheapest(w, sx, sy, tx, ty);
      if (best === Infinity) {
        expect(p).toBeNull();
        continue;
      }
      expect(p).not.toBeNull();
      expect(checkPath(w, sx, sy, p ?? [])).toBeCloseTo(best, 6);
      checked++;
    }
    expect(checked).toBe(25);
  }, 60000);

  it('주민 100 명 큰 지도 마을이 이틀 동안 오류 없이 돌고, 경로 캐시가 쓰인다', () => {
    const w = newWorld(11, { residents: 100, map: 'large' });
    const t0 = performance.now();
    for (let i = 0; i < 2 * 1440; i++) {
      step(w);
      w.out.length = 0;
    }
    const perTick = (performance.now() - t0) / (2 * 1440);
    for (const v of w.vs) {
      expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
      expect(v.x >= 0 && v.y >= 0 && v.x < w.W && v.y < w.H).toBe(true);
    }
    const ps = pathStats(w);
    expect(ps.searches).toBeGreaterThan(0);
    expect(ps.hits).toBeGreaterThan(0);
    // 시간 예산(SPEC 7)은 브라우저에서 잰다. 여기서는 크게 어긋나지 않는지만 본다(느린 CI 여유 10 배).
    expect(perTick).toBeLessThan(3);
  }, 60000);

  it('큰 지도 저장은 크기·지형을 그대로 되살리고, 같은 시드는 같은 이야기가 된다', () => {
    const a = newWorld(8, { map: 'large' });
    run(a, 600);
    const b = deserialize(serialize(a));
    expect(b).not.toBeNull();
    if (!b) return;
    expect([b.W, b.H]).toEqual([a.W, a.H]);
    expect(Array.from(b.tiles)).toEqual(Array.from(a.tiles));
    const c = newWorld(8, { map: 'large' });
    run(c, 600);
    expect(c.feed.map((e) => e.html)).toEqual(a.feed.map((e) => e.html));
  });
});
