// A* 길찾기(8 방향). 지도 크기 배열을 세대 번호로 다시 쓰고, 틱당 탐색 횟수를 예산으로 묶는다 (SPEC 7).
// 같은 시작·도착 칸의 경로는 타일이 바뀔 때까지 캐시에서 꺼낸다(예산을 쓰지 않는다).
import { PERF } from '../data/balance';
import { inb, passable, passableTile, tileCost } from './map';
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

  /** 최소 힙에 넣는다(바꿔 끼우기 대신 빈자리를 올린다. 순서는 바꿔 끼우기와 같다). */
  push(f: number, i: number): void {
    const F = this.heapF;
    const I = this.heapI;
    let k = F.length;
    F.push(f);
    I.push(i);
    while (k > 0) {
      const p = (k - 1) >> 1;
      const pf = F[p] as number;
      if (pf <= f) break;
      F[k] = pf;
      I[k] = I[p] as number;
      k = p;
    }
    F[k] = f;
    I[k] = i;
  }

  /** 가장 작은 것을 꺼낸다. 비었으면 -1. */
  pop(): number {
    const F = this.heapF;
    const I = this.heapI;
    if (!F.length) return -1;
    const top = I[0] as number;
    const lf = F.pop() as number;
    const li = I.pop() as number;
    const n = F.length;
    if (n) {
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = -1;
        let mf = lf;
        if (l < n && (F[l] as number) < mf) {
          m = l;
          mf = F[l] as number;
        }
        if (r < n && (F[r] as number) < mf) {
          m = r;
          mf = F[r] as number;
        }
        if (m < 0) break;
        F[k] = mf;
        I[k] = I[m] as number;
        k = m;
      }
      F[k] = lf;
      I[k] = li;
    }
    return top;
  }
}

const scratch = new Scratch();
/** 지금까지 펼친 칸 수(계측, 모든 World 합). */
let expanded = 0;

/** 타일 판 번호별 통과·비용 격자(탐색마다 타일 종류를 다시 풀지 않는다). 비용 0 은 지나갈 수 없다. */
interface CostGrid {
  ver: number;
  cost: Float64Array;
}

const grids = new WeakMap<World, CostGrid>();

/** 이 World 의 비용 격자. 타일이 바뀌었으면 다시 만든다. */
function gridOf(w: World): Float64Array {
  let g = grids.get(w);
  if (!g || g.cost.length !== w.W * w.H) {
    g = { ver: -1, cost: new Float64Array(w.W * w.H) };
    grids.set(w, g);
  }
  if (g.ver !== w.tileVer) {
    g.ver = w.tileVer;
    const C = g.cost;
    for (let i = 0; i < C.length; i++) {
      const t = w.tiles[i] as number;
      C[i] = passableTile(t) ? tileCost(t) : 0;
    }
  }
  return g.cost;
}

const DX = DIRS.map((d) => d[0]);
const DY = DIRS.map((d) => d[1]);
const DC = DIRS.map((d) => d[2]);

/** 예산 없이 경로를 구한다(시험·놓기 검사용). 닿지 못하면 null, 같은 칸이면 []. */
export function findPathRaw(w: World, sx: number, sy: number, tx: number, ty: number): Pt[] | null {
  if (!inb(w, tx, ty) || !passable(w, tx, ty)) return null;
  if (sx === tx && sy === ty) return [];
  const W = w.W;
  const H = w.H;
  const C = gridOf(w);
  const S = scratch;
  S.begin(W * H);
  const gen = S.gen;
  const G = S.g;
  const seen = S.seen;
  const closed = S.closed;
  const came = S.came;
  const s = sy * W + sx;
  const goal = ty * W + tx;
  G[s] = 0;
  seen[s] = gen;
  came[s] = -1;
  {
    const dx = Math.abs(sx - tx);
    const dy = Math.abs(sy - ty);
    S.push(Math.max(dx, dy) + 0.414 * Math.min(dx, dy), s);
  }
  let found = false;
  for (;;) {
    const cur = S.pop();
    if (cur < 0) break;
    if (closed[cur] === gen) continue;
    if (cur === goal) {
      found = true;
      break;
    }
    closed[cur] = gen;
    expanded++;
    const cx = cur % W;
    const cy = (cur / W) | 0;
    const gc = G[cur] as number;
    for (let d = 0; d < 8; d++) {
      const ddx = DX[d] as number;
      const ddy = DY[d] as number;
      const nx = cx + ddx;
      const ny = cy + ddy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      const c = C[ni] as number;
      if (c === 0) continue;
      // 대각선은 양옆이 모두 열려야 한다(양옆은 지금 칸의 이웃이라 지도 안이다)
      if (ddx && ddy && ((C[cy * W + nx] as number) === 0 || (C[ny * W + cx] as number) === 0))
        continue;
      if (closed[ni] === gen) continue;
      const ng = gc + (DC[d] as number) * c;
      if (seen[ni] !== gen || ng < (G[ni] as number)) {
        seen[ni] = gen;
        G[ni] = ng;
        came[ni] = cur;
        const hx = Math.abs(nx - tx);
        const hy = Math.abs(ny - ty);
        // 휴리스틱을 먼저 더해 둔다(덧셈 순서가 바뀌면 같은 비용 경로 중 고르는 것이 달라진다)
        S.push(ng + (Math.max(hx, hy) + 0.414 * Math.min(hx, hy)), ni);
      }
    }
  }
  if (!found) return null;
  const path: Pt[] = [];
  let c = goal;
  while (c !== s) {
    path.push({ x: c % W, y: (c / W) | 0 });
    c = came[c] as number;
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
  const c = cacheOf(w);
  const n = w.W * w.H;
  const key = inb(w, sx, sy) && inb(w, tx, ty) ? (sy * w.W + sx) * n + ty * w.W + tx : -1;
  if (key >= 0) {
    const hit = c.map.get(key);
    if (hit !== undefined) {
      // 가장 최근에 쓴 것으로 옮긴다(오래 안 쓴 것부터 버린다)
      c.map.delete(key);
      c.map.set(key, hit);
      c.hits++;
      return hit;
    }
  }
  if (w.pathBudget <= 0) {
    c.busy++;
    return 'busy';
  }
  w.pathBudget--;
  c.searches++;
  const p = findPathRaw(w, sx, sy, tx, ty);
  if (key >= 0) {
    c.map.set(key, p);
    if (c.map.size > PERF.pathCache) {
      const old = c.map.keys().next();
      if (!old.done) c.map.delete(old.value);
    }
  }
  return p;
}

/** 경로 캐시. 돌려준 경로 배열은 여러 주민이 함께 읽으므로 고치지 않는다(주민은 v.pi 로 따라간다). */
interface PathCache {
  ver: number;
  map: Map<number, Pt[] | null>;
  hits: number;
  searches: number;
  busy: number;
}

const caches = new WeakMap<World, PathCache>();

/** 이 World 의 경로 캐시. 타일 판 번호가 바뀌었으면 비운다. */
function cacheOf(w: World): PathCache {
  let c = caches.get(w);
  if (!c) {
    c = { ver: w.tileVer, map: new Map(), hits: 0, searches: 0, busy: 0 };
    caches.set(w, c);
  }
  if (c.ver !== w.tileVer) {
    c.ver = w.tileVer;
    c.map.clear();
  }
  return c;
}

/** 계측(`?debug=1`, 시험): 지금까지 캐시 적중·새 탐색·예산 초과 횟수와 캐시 크기. */
export function pathStats(w: World): {
  hits: number;
  searches: number;
  busy: number;
  size: number;
  expanded: number;
} {
  const c = cacheOf(w);
  return { hits: c.hits, searches: c.searches, busy: c.busy, size: c.map.size, expanded };
}
