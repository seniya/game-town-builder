// 통행 그래프 (MVP_SPEC 12.2 / 9.5, ARCHITECTURE 11.1 / 11.2, TASK-024).
// 서 있을 수 있는 칸과 한 걸음 이웃을 계산하고, 계산에 읽은 칸의 역참조로 캐시·경로를 즉시 무효화한다.
// 월드 전체를 미리 그래프로 만들지 않는다. 요청된 칸만 계산해 캐시한다 (ARCHITECTURE 2.3).
import { BlockId } from '../data/blocks';
import type { ActorKind, BlockPos, BlockReader } from '../types';
import { isPassableFor, isStandableCell } from '../voxel/occupancy';

/** 통행 판정이 읽는 월드. VoxelWorld 가 만족한다. 월드 밖은 air 로 읽힌다. */
export interface NavWorld {
  getBlock(x: number, y: number, z: number): number;
}

/** 수평 4 방향 (x, z). 순서가 이웃 목록의 순서다. */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const OFFSET = 32768;
const SPAN = 65536;
const Y_OFFSET = 512;

/**
 * 칸의 수치 키. x·z 는 ±32768, y 는 ±512 범위다. 문자열 할당 없이 Map 키로 쓴다.
 * 대형 월드(ADR 017)도 이 범위 안이다.
 */
export function navKey(x: number, y: number, z: number): number {
  return (y + Y_OFFSET) * SPAN * SPAN + (z + OFFSET) * SPAN + (x + OFFSET);
}

/** navKey 를 좌표로 되돌린다. */
export function navPos(key: number): BlockPos {
  const x = (key % SPAN) - OFFSET;
  const rest = Math.floor(key / SPAN);
  const z = (rest % SPAN) - OFFSET;
  const y = Math.floor(rest / SPAN) - Y_OFFSET;
  return { x, y, z };
}

/** 캐시 한 항목: 이웃 목록과 그것을 만들 때 읽은 칸. */
interface CacheEntry {
  readonly neighbors: readonly BlockPos[];
  readonly reads: readonly number[];
}

/** 경로 감시자. 지켜보는 칸이 바뀌면 동기로 불린다. */
type Watcher = (pos: BlockPos) => void;

/** 계측값 (F3 / 테스트). */
export interface NavigationStats {
  readonly cachedCells: number;
  readonly watchedCells: number;
  readonly invalidations: number;
  readonly revision: number;
}

/**
 * 한 걸음 이동 p → q 에 필요한 칸들(ARCHITECTURE 11.1 구현 계약).
 * 반환: q 의 아래·발·머리 + 오르막이면 p 의 y+2, 내리막이면 q 열의 p.y+1.
 * 경로 감시와 이웃 판정이 같은 칸을 쓰도록 한 곳에서 정의한다.
 */
export function stepReadCells(p: BlockPos, q: BlockPos): BlockPos[] {
  const cells = [{ x: q.x, y: q.y - 1, z: q.z }, q, { x: q.x, y: q.y + 1, z: q.z }];
  if (q.y > p.y) cells.push({ x: p.x, y: p.y + 2, z: p.z });
  if (q.y < p.y) cells.push({ x: q.x, y: p.y + 1, z: q.z });
  return cells;
}

/** NPC·몬스터의 통행 판정과 국소 캐시. */
export class NavigationGraph {
  private readonly read: BlockReader;
  private readonly cache = new Map<number, CacheEntry>();
  /** 읽은 칸 → 그 칸을 읽은 캐시 키 */
  private readonly readers = new Map<number, Set<number>>();
  /** 칸 → 그 칸을 지켜보는 경로 감시자 */
  private readonly watchers = new Map<number, Set<Watcher>>();
  private readonly listeners = new Set<Watcher>();
  private invalidations = 0;
  private rev = 0;

  /** 월드 조회를 받는다. 월드를 바꾸지 않는다. */
  constructor(world: NavWorld) {
    this.read = { get: (x, y, z) => world.getBlock(x, y, z) };
  }

  /** 읽은 칸이 바뀔 때마다 오르는 수. 탐색 세션이 자기가 시작한 뒤의 변경을 알아챈다. */
  get revision(): number {
    return this.rev;
  }

  /** 블록 id 를 읽는다(경로탐색의 장애물 판정). 월드 밖은 air 다. */
  blockAt(x: number, y: number, z: number): number {
    return this.read.get(x, y, z);
  }

  /** 계측값. */
  get stats(): NavigationStats {
    return {
      cachedCells: this.cache.size,
      watchedCells: this.watchers.size,
      invalidations: this.invalidations,
      revision: this.rev,
    };
  }

  /**
   * actor 가 이 칸에 설 수 있는가: 공통 occupancy(아래 고체 + 발·머리 통행 가능) 에
   * 발·머리 칸이 물이 아닐 것을 더한다 (MVP_SPEC 9.5 의 NPC·몬스터 문단).
   */
  isStandable(pos: BlockPos, actor: ActorKind): boolean {
    if (!isStandableCell(this.read, pos, actor)) return false;
    return (
      this.read.get(pos.x, pos.y, pos.z) !== BlockId.water &&
      this.read.get(pos.x, pos.y + 1, pos.z) !== BlockId.water
    );
  }

  /**
   * from 에서 한 걸음에 갈 수 있는 이웃을 out 에 채우고 개수를 반환한다.
   * 수평 4 방향 × (같은 높이 / +1 / −1). 같은 방향에서는 같은 높이 → +1 → −1 순서로 첫 가능한 칸 하나다.
   * 결과는 (칸, actor) 로 캐시하며 읽은 칸의 역참조를 남긴다.
   */
  neighbors(from: BlockPos, actor: ActorKind, out: BlockPos[]): number {
    const key = navKey(from.x, from.y, from.z) * 2 + (actor === 'npc' ? 0 : 1);
    let entry = this.cache.get(key);
    if (!entry) {
      entry = this.compute(from, actor);
      this.cache.set(key, entry);
      for (const r of entry.reads) {
        let set = this.readers.get(r);
        if (!set) {
          set = new Set();
          this.readers.set(r, set);
        }
        set.add(key);
      }
    }
    out.length = 0;
    for (const n of entry.neighbors) out.push(n);
    return out.length;
  }

  /** p → q 한 걸음이 지금 가능한가. 캐시를 쓰지 않는 직접 판정이다(경로 검증·테스트용). */
  canStep(p: BlockPos, q: BlockPos, actor: ActorKind): boolean {
    if (Math.abs(q.x - p.x) + Math.abs(q.z - p.z) !== 1 || Math.abs(q.y - p.y) > 1) return false;
    if (!this.isStandable(q, actor)) return false;
    if (q.y > p.y) return isPassableFor(this.read.get(p.x, p.y + 2, p.z), actor);
    if (q.y < p.y) return isPassableFor(this.read.get(q.x, p.y + 1, q.z), actor);
    return true;
  }

  /**
   * 칸 pos 가 바뀌었다. pos 를 읽은 이웃 캐시를 지우고 감시자·청취자를 부른다 (ARCHITECTURE 28.1).
   * 감시자 안에서 watch / unwatch 를 해도 안전하도록 목록의 복사본을 부른다.
   */
  invalidate(pos: BlockPos): void {
    this.invalidations += 1;
    this.rev += 1;
    const k = navKey(pos.x, pos.y, pos.z);
    const keys = this.readers.get(k);
    if (keys) {
      for (const cacheKey of [...keys]) this.drop(cacheKey);
    }
    const watching = this.watchers.get(k);
    if (watching) for (const fn of [...watching]) fn(pos);
    for (const fn of [...this.listeners]) fn(pos);
  }

  /**
   * 칸들을 지켜본다. 그중 하나라도 바뀌면 fn(pos) 가 불린다. 반환 함수로 해제한다.
   * 경로는 pathWatchCells 로 감시 칸을 만든다.
   */
  watch(cells: Iterable<BlockPos>, fn: Watcher): () => void {
    const keys: number[] = [];
    for (const c of cells) {
      const k = navKey(c.x, c.y, c.z);
      let set = this.watchers.get(k);
      if (!set) {
        set = new Set();
        this.watchers.set(k, set);
      }
      if (!set.has(fn)) {
        set.add(fn);
        keys.push(k);
      }
    }
    return () => {
      for (const k of keys) {
        const set = this.watchers.get(k);
        if (!set) continue;
        set.delete(fn);
        if (set.size === 0) this.watchers.delete(k);
      }
    };
  }

  /** 모든 변경을 듣는다(탐색 스케줄러의 세션 무효화). 반환 함수로 해제한다. */
  onInvalidate(fn: Watcher): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /** 캐시를 모두 비운다. 로드 재구축 3 번(MVP_SPEC 32.3). 감시자는 그대로 둔다. */
  clear(): void {
    this.cache.clear();
    this.readers.clear();
    this.rev += 1;
  }

  /** 이웃 목록과 읽은 칸을 계산한다. */
  private compute(p: BlockPos, actor: ActorKind): CacheEntry {
    const neighbors: BlockPos[] = [];
    const reads: number[] = [];
    const note = (x: number, y: number, z: number): void => void reads.push(navKey(x, y, z));
    // 오르막의 머리 공간(출발 칸 y+2)
    note(p.x, p.y + 2, p.z);
    const headClear = isPassableFor(this.read.get(p.x, p.y + 2, p.z), actor);
    for (const [dx, dz] of DIRS) {
      const x = p.x + dx;
      const z = p.z + dz;
      // 같은 높이·+1·−1 이 읽는 열의 칸: y-2 ~ y+2
      for (let y = p.y - 2; y <= p.y + 2; y++) note(x, y, z);
      const same = { x, y: p.y, z };
      if (this.isStandable(same, actor)) {
        neighbors.push(same);
        continue;
      }
      const up = { x, y: p.y + 1, z };
      if (headClear && this.isStandable(up, actor)) {
        neighbors.push(up);
        continue;
      }
      const down = { x, y: p.y - 1, z };
      if (this.isStandable(down, actor) && isPassableFor(this.read.get(x, p.y + 1, z), actor)) {
        neighbors.push(down);
      }
    }
    return { neighbors, reads };
  }

  /** 캐시 항목 하나와 그 역참조를 지운다. */
  private drop(cacheKey: number): void {
    const entry = this.cache.get(cacheKey);
    if (!entry) return;
    this.cache.delete(cacheKey);
    for (const r of entry.reads) {
      const set = this.readers.get(r);
      if (!set) continue;
      set.delete(cacheKey);
      if (set.size === 0) this.readers.delete(r);
    }
  }
}

/** 경로가 통행에 의존하는 칸 전체 (ARCHITECTURE 11.1 의 경로 감시 칸). 첫 칸의 아래·발·머리도 포함한다. */
export function pathWatchCells(path: readonly BlockPos[]): BlockPos[] {
  const out: BlockPos[] = [];
  const first = path[0];
  if (first) out.push({ ...first, y: first.y - 1 }, first, { ...first, y: first.y + 1 });
  for (let i = 1; i < path.length; i++) {
    const p = path[i - 1] as BlockPos;
    const q = path[i] as BlockPos;
    out.push(...stepReadCells(p, q));
  }
  return out;
}
