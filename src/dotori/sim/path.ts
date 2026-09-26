// A* 길찾기(8 방향). 지도 크기 배열을 세대 번호로 다시 쓰고, 틱당 탐색 횟수를 예산으로 묶는다 (SPEC 7).
import { inb, passable, tileCost } from './map';
import type { Pt, World } from './types';

const DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** 탐색마다 새로 만들지 않고 다시 쓰는 작업 배열. 지도 크기가 바뀌면 다시 잡는다. */
class Scratch {
  n = 0;
  g = new Float32Array(0);
  came = new Int32Array(0);
  seen = new Uint32Array(0);
  closed = new Uint32Array(0);
  gen = 0;
  heapF: number[] = [];
  heapI: number[] = [];

  /** 크기 n 에 맞춰 준비하고 새 세대를 연다. */
  begin(n: number): void {
    if (this.n !== n) {
      this.n = n;
      this.g = new Float32Array(n);
      this.came = new Int32Array(n);
      this.seen = new Uint32Array(n);
      this.closed = new Uint32Array(n);
      this.gen = 0;
    }
    this.gen++;
    if (this.gen === 0xffffffff) {
      this.seen.fill(0);
      this.closed.fill(0);
      this.gen = 1;
    }
    this.heapF.length = 0;
    this.heapI.length = 0;
  }

  /** 최소 힙에 넣는다. */
  push(f: number, i: number): void {
    const F = this.heapF;
    const I = this.heapI;
    F.push(f);
    I.push(i);
    let k = F.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if ((F[p] as number) <= (F[k] as number)) break;
      [F[p], F[k]] = [F[k] as number, F[p] as number];
      [I[p], I[k]] = [I[k] as number, I[p] as number];
      k = p;
    }
  }

  /** 가장 작은 것을 꺼낸다. 비었으면 -1. */
  pop(): number {
    const F = this.heapF;
    const I = this.heapI;
    if (!F.length) return -1;
    const top = I[0] as number;
    const lf = F.pop() as number;
    const li = I.pop() as number;
    if (F.length) {
      F[0] = lf;
      I[0] = li;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < F.length && (F[l] as number) < (F[m] as number)) m = l;
        if (r < F.length && (F[r] as number) < (F[m] as number)) m = r;
        if (m === k) break;
        [F[m], F[k]] = [F[k] as number, F[m] as number];
        [I[m], I[k]] = [I[k] as number, I[m] as number];
        k = m;
      }
    }
    return top;
  }
}

const scratch = new Scratch();

/** 예산 없이 경로를 구한다(시험·놓기 검사용). 닿지 못하면 null, 같은 칸이면 []. */
export function findPathRaw(w: World, sx: number, sy: number, tx: number, ty: number): Pt[] | null {
  if (!inb(w, tx, ty) || !passable(w, tx, ty)) return null;
  if (sx === tx && sy === ty) return [];
  const W = w.W;
  const S = scratch;
  S.begin(W * w.H);
  const gen = S.gen;
  const s = sy * W + sx;
  const goal = ty * W + tx;
  const oct = (x: number, y: number): number => {
    const dx = Math.abs(x - tx);
    const dy = Math.abs(y - ty);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  S.g[s] = 0;
  S.seen[s] = gen;
  S.came[s] = -1;
  S.push(oct(sx, sy), s);
  let found = false;
  for (;;) {
    const cur = S.pop();
    if (cur < 0) break;
    if (S.closed[cur] === gen) continue;
    if (cur === goal) {
      found = true;
      break;
    }
    S.closed[cur] = gen;
    const cx = cur % W;
    const cy = (cur / W) | 0;
    const gc = S.g[cur] as number;
    for (const [dx, dy, dc] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inb(w, nx, ny) || !passable(w, nx, ny)) continue;
      if (dx && dy && (!passable(w, cx + dx, cy) || !passable(w, cx, cy + dy))) continue;
      const ni = ny * W + nx;
      if (S.closed[ni] === gen) continue;
      const ng = gc + dc * tileCost(w.tiles[ni] as number);
      if (S.seen[ni] !== gen || ng < (S.g[ni] as number)) {
        S.seen[ni] = gen;
        S.g[ni] = ng;
        S.came[ni] = cur;
        S.push(ng + oct(nx, ny), ni);
      }
    }
  }
  if (!found) return null;
  const path: Pt[] = [];
  let c = goal;
  while (c !== s) {
    path.push({ x: c % W, y: (c / W) | 0 });
    c = S.came[c] as number;
    if (c < 0) return null;
  }
  return path.reverse();
}

/** 틱 예산 안에서 경로를 구한다. 예산이 없으면 'busy' 를 돌려주고, 부른 쪽이 다음 틱에 다시 시도한다. */
export function findPath(
  w: World,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): Pt[] | null | 'busy' {
  if (w.pathBudget <= 0) return 'busy';
  w.pathBudget--;
  return findPathRaw(w, sx, sy, tx, ty);
}
