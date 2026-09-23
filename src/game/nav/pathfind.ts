// A* 경로탐색 (ARCHITECTURE 11.3, TASK-025). 게임 상태를 바꾸지 않는 계산이며 숨은 전역 상태가 없다.
// 예산(maxNodes)을 넘으면 NODE_LIMIT 과 이어서 쓸 continuation 을 반환한다. 진짜로 길이 없으면 NO_PATH 다.
// 두 reason 을 구분한다: 몬스터는 NO_PATH 에서만 벽을 부순다 (MVP_SPEC 24.3).
import { isTerrain } from '../data/blocks';
import type { ActorKind, BlockPos, Vec3 } from '../types';
import { standCellToWorldFeet } from '../voxel/coords';
import { isPassableFor } from '../voxel/occupancy';
import { navKey, navPos, type NavigationGraph } from './NavigationGraph';

/**
 * 목적지. radius 는 발밑 중심이 center 에서 radius 안인 통행 가능 칸이면 성공이다.
 * cells 는 여러 칸 중 하나에 닿으면 성공이다(가구의 접근 셀들, MVP_SPEC 12.2).
 */
export type PathGoal =
  | { readonly kind: 'cell'; readonly pos: BlockPos }
  | { readonly kind: 'radius'; readonly center: Vec3; readonly radius: number }
  | { readonly kind: 'cells'; readonly cells: readonly BlockPos[] };

/** 접근 경로가 실제로 있는 파괴 가능한 장애물 (NO_PATH 에서만 채운다). */
export interface BoundaryObstacle {
  readonly obstacle: BlockPos;
  /** 장애물 바로 앞의 도달 가능한 칸 */
  readonly approach: BlockPos;
  /** 출발 → approach 경로 */
  readonly path: readonly BlockPos[];
}

/** 탐색 결과 (ARCHITECTURE 11.3). */
export interface PathResult {
  /** 출발 칸부터 목적지 칸까지. 실패·진행 중이면 null */
  readonly path: BlockPos[] | null;
  /** NODE_LIMIT 에서 목표에 가장 가까운 검증된 칸까지의 경로. 그 밖에는 빈 배열 */
  readonly partialPath: BlockPos[];
  readonly reachableBoundary: readonly BoundaryObstacle[];
  /** 이번 호출에서 확장한 노드 수 */
  readonly nodesExplored: number;
  readonly reason?: 'NO_PATH' | 'NODE_LIMIT';
  /** NODE_LIMIT 에서 다음 호출로 넘길 상태. 끝났으면 null */
  readonly continuation: PathSearchState | null;
  /**
   * NO_PATH 에서 출발 칸이 닿을 수 있는 칸 전체(navKey). 이 칸들에 선 다른 actor 도 같은 목표에 갈 수 없다.
   * 같은 목표를 주민마다 따로 다시 탐색하지 않게 한다 (PERF-001, ADR 029). 그 밖에는 없다
   */
  readonly reachable?: ReadonlySet<number>;
}

/**
 * 이어서 탐색할 상태. 한 번만 이어 쓸 수 있는 불투명 토큰이다(ADR 025).
 * 이어 쓰면 이 토큰은 소비되어 다시 넘길 수 없다. 탐색 상태는 저장하지 않는다.
 */
export interface PathSearchState {
  readonly from: BlockPos;
  readonly goal: PathGoal;
  readonly actor: ActorKind;
  /** 세션을 시작할 때의 NavigationGraph.revision */
  readonly revision: number;
  /** 지금까지 확장한 노드 수(세션 전체) */
  readonly explored: number;
  /** 확장한 칸의 xz / y 범위. 이 범위 밖의 변경은 세션 결과에 영향이 없다 */
  readonly bounds: SearchBounds;
  /** 이미 이어 쓴 토큰인가 */
  readonly consumed: boolean;
}

/** 확장한 칸의 범위. */
export interface SearchBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** 이진 힙의 한 항목. f 가 같으면 h 가 작은 쪽(목표에 가까운 쪽)을 먼저 꺼낸다. */
interface OpenNode {
  readonly key: number;
  readonly f: number;
  readonly h: number;
}

/** 세션 내부 상태. 토큰 객체 안에 숨겨 둔다. */
interface Internal {
  readonly open: OpenNode[];
  readonly g: Map<number, number>;
  readonly parent: Map<number, number>;
  readonly closed: Set<number>;
  readonly boundary: Map<number, { obstacle: BlockPos; approachKey: number }>;
  bestKey: number;
  bestH: number;
  explored: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
}

/** 토큰의 실제 구현. 내부 상태를 외부 타입에 드러내지 않는다. */
class SearchToken implements PathSearchState {
  consumed = false;

  /** 세션 입력과 내부 상태를 묶는다. */
  constructor(
    readonly from: BlockPos,
    readonly goal: PathGoal,
    readonly actor: ActorKind,
    readonly revision: number,
    readonly internal: Internal,
  ) {}

  /** 세션 전체 확장 수. */
  get explored(): number {
    return this.internal.explored;
  }

  /** 확장 범위의 복사본. */
  get bounds(): SearchBounds {
    return { ...this.internal.bounds };
  }
}

/** 힙에 넣는다. */
function heapPush(heap: OpenNode[], node: OpenNode): void {
  heap.push(node);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (!before(heap[i] as OpenNode, heap[parent] as OpenNode)) break;
    [heap[i], heap[parent]] = [heap[parent] as OpenNode, heap[i] as OpenNode];
    i = parent;
  }
}

/** 힙에서 가장 앞의 항목을 꺼낸다. */
function heapPop(heap: OpenNode[]): OpenNode | undefined {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length > 0 && last) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && before(heap[l] as OpenNode, heap[m] as OpenNode)) m = l;
      if (r < heap.length && before(heap[r] as OpenNode, heap[m] as OpenNode)) m = r;
      if (m === i) break;
      [heap[i], heap[m]] = [heap[m] as OpenNode, heap[i] as OpenNode];
      i = m;
    }
  }
  return top;
}

/** a 가 b 보다 먼저 꺼내져야 하는가. */
function before(a: OpenNode, b: OpenNode): boolean {
  return a.f < b.f || (a.f === b.f && a.h < b.h);
}

/**
 * 휴리스틱. 한 걸음은 x 또는 z 로 정확히 1 칸, y 로 최대 1 칸이므로
 * cell 목표는 max(|dx|+|dz|, |dy|), radius 목표는 max(0, 수평 거리 − radius) 가 과대 추정이 없다.
 */
function heuristic(p: BlockPos, goal: PathGoal): number {
  if (goal.kind === 'cell') return cellDistance(p, goal.pos);
  if (goal.kind === 'cells') {
    let best = Number.POSITIVE_INFINITY;
    for (const c of goal.cells) best = Math.min(best, cellDistance(p, c));
    return Number.isFinite(best) ? best : 0;
  }
  const f = standCellToWorldFeet(p);
  return Math.max(0, Math.hypot(f.x - goal.center.x, f.z - goal.center.z) - goal.radius);
}

/** 칸 사이의 최소 걸음 수 하한: max(|dx|+|dz|, |dy|). */
function cellDistance(p: BlockPos, q: BlockPos): number {
  return Math.max(Math.abs(q.x - p.x) + Math.abs(q.z - p.z), Math.abs(q.y - p.y));
}

/** 이 칸이 목표를 만족하는가. radius 는 발밑 중심의 3 차원 거리로 판정한다. */
function reachesGoal(p: BlockPos, goal: PathGoal): boolean {
  if (goal.kind === 'cell') return sameCell(p, goal.pos);
  if (goal.kind === 'cells') return goal.cells.some((c) => sameCell(p, c));
  const f = standCellToWorldFeet(p);
  return Math.hypot(f.x - goal.center.x, f.y - goal.center.y, f.z - goal.center.z) <= goal.radius;
}

/** 같은 칸인가. */
function sameCell(a: BlockPos, b: BlockPos): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/** parent 를 따라 경로를 되짚는다. */
function reconstruct(parent: Map<number, number>, end: number): BlockPos[] {
  const out: BlockPos[] = [];
  let k: number | undefined = end;
  while (k !== undefined) {
    out.push(navPos(k));
    k = parent.get(k);
  }
  return out.reverse();
}

/** 새 세션을 만든다. 출발 칸을 열린 목록에 넣는다. */
function startSession(
  graph: NavigationGraph,
  from: BlockPos,
  goal: PathGoal,
  actor: ActorKind,
): SearchToken {
  const key = navKey(from.x, from.y, from.z);
  const h = heuristic(from, goal);
  const internal: Internal = {
    open: [{ key, f: h, h }],
    g: new Map([[key, 0]]),
    parent: new Map(),
    closed: new Set(),
    boundary: new Map(),
    bestKey: key,
    bestH: h,
    explored: 0,
    bounds: { minX: from.x, maxX: from.x, minY: from.y, maxY: from.y, minZ: from.z, maxZ: from.z },
  };
  return new SearchToken(from, goal, actor, graph.revision, internal);
}

/**
 * 한 칸에서 이웃으로 막힌 방향의 파괴 가능한 장애물을 기록한다(몬스터의 NO_PATH 판단용).
 * 같은 높이로 걸어 들어갈 발·머리 칸이 actor 에게 막혀 있고 terrain 이 아니면 장애물이다.
 */
function noteObstacles(
  graph: NavigationGraph,
  p: BlockPos,
  pKey: number,
  actor: ActorKind,
  boundary: Internal['boundary'],
): void {
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    for (const dy of [0, 1]) {
      const x = p.x + dx;
      const y = p.y + dy;
      const z = p.z + dz;
      const id = graph.blockAt(x, y, z);
      if (isPassableFor(id, actor) || isTerrain(id)) continue;
      const ok = navKey(x, y, z);
      if (!boundary.has(ok)) boundary.set(ok, { obstacle: { x, y, z }, approachKey: pKey });
    }
  }
}

/**
 * from 에서 goal 까지 A* 로 찾는다 (ARCHITECTURE 11.3).
 * maxNodes 는 이번 호출의 확장 예산이다. 예산이 끝나면 NODE_LIMIT 과 continuation 을 반환한다.
 * search 를 넘기면 그 세션을 이어 가며 search 는 소비된다. from / goal / actor 가 세션과 다르면 새로 시작한다.
 * 출발 칸이 설 수 없는 칸이면 곧바로 NO_PATH 다.
 */
export function findPath(
  graph: NavigationGraph,
  from: BlockPos,
  goal: PathGoal,
  actor: ActorKind,
  maxNodes: number,
  search?: PathSearchState,
): PathResult {
  let token: SearchToken;
  if (search instanceof SearchToken && sameSession(search, from, goal, actor)) {
    if (search.consumed) throw new Error('이미 이어 쓴 탐색 상태다 (한 번만 이어 쓸 수 있다)');
    search.consumed = true;
    token = new SearchToken(search.from, search.goal, actor, search.revision, search.internal);
  } else {
    if (!graph.isStandable(from, actor)) {
      return {
        path: null,
        partialPath: [],
        reachableBoundary: [],
        nodesExplored: 0,
        reason: 'NO_PATH',
        continuation: null,
      };
    }
    token = startSession(graph, from, goal, actor);
  }
  const s = token.internal;
  const neighbors: BlockPos[] = [];
  let explored = 0;
  while (s.open.length > 0) {
    if (explored >= maxNodes) {
      return {
        path: null,
        partialPath: reconstruct(s.parent, s.bestKey),
        reachableBoundary: [],
        nodesExplored: explored,
        reason: 'NODE_LIMIT',
        continuation: token,
      };
    }
    const node = heapPop(s.open) as OpenNode;
    if (s.closed.has(node.key)) continue;
    s.closed.add(node.key);
    explored += 1;
    s.explored += 1;
    const p = navPos(node.key);
    const b = s.bounds;
    b.minX = Math.min(b.minX, p.x);
    b.maxX = Math.max(b.maxX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxY = Math.max(b.maxY, p.y);
    b.minZ = Math.min(b.minZ, p.z);
    b.maxZ = Math.max(b.maxZ, p.z);
    if (reachesGoal(p, goal)) {
      return {
        path: reconstruct(s.parent, node.key),
        partialPath: [],
        reachableBoundary: [],
        nodesExplored: explored,
        continuation: null,
      };
    }
    if (node.h < s.bestH) {
      s.bestH = node.h;
      s.bestKey = node.key;
    }
    noteObstacles(graph, p, node.key, actor, s.boundary);
    const gp = s.g.get(node.key) ?? 0;
    graph.neighbors(p, actor, neighbors);
    for (const q of neighbors) {
      const qk = navKey(q.x, q.y, q.z);
      if (s.closed.has(qk)) continue;
      const gq = gp + 1;
      const known = s.g.get(qk);
      if (known !== undefined && known <= gq) continue;
      s.g.set(qk, gq);
      s.parent.set(qk, node.key);
      const h = heuristic(q, goal);
      heapPush(s.open, { key: qk, f: gq + h, h });
    }
  }
  const reachableBoundary: BoundaryObstacle[] = [];
  for (const o of s.boundary.values()) {
    reachableBoundary.push({
      obstacle: o.obstacle,
      approach: navPos(o.approachKey),
      path: reconstruct(s.parent, o.approachKey),
    });
  }
  return {
    path: null,
    partialPath: [],
    reachableBoundary,
    nodesExplored: explored,
    reason: 'NO_PATH',
    continuation: null,
    reachable: s.closed,
  };
}

/** 세션의 입력이 같은가. */
function sameSession(
  s: PathSearchState,
  from: BlockPos,
  goal: PathGoal,
  actor: ActorKind,
): boolean {
  if (s.actor !== actor) return false;
  if (s.from.x !== from.x || s.from.y !== from.y || s.from.z !== from.z) return false;
  if (s.goal.kind !== goal.kind) return false;
  if (goal.kind === 'cell' && s.goal.kind === 'cell') return sameCell(s.goal.pos, goal.pos);
  if (goal.kind === 'cells' && s.goal.kind === 'cells') {
    const a = s.goal.cells;
    const b = goal.cells;
    return a.length === b.length && a.every((c, i) => sameCell(c, b[i] as BlockPos));
  }
  if (goal.kind === 'radius' && s.goal.kind === 'radius') {
    return (
      s.goal.radius === goal.radius &&
      s.goal.center.x === goal.center.x &&
      s.goal.center.y === goal.center.y &&
      s.goal.center.z === goal.center.z
    );
  }
  return false;
}
