// 경로 요청 스케줄러 (ARCHITECTURE 11.3 / 11.6, TASK-025). update 6 번(nav) 슬롯에서 돈다.
// 모든 요청이 프레임당 확장 예산(balance.performance.pathfindMaxNodes)을 나눠 쓰고, 순서를 돌려 대기 요청이 굶지 않는다.
// 요청자별 continuation 을 이 스케줄러가 소유한다. pathfind 에는 숨은 전역 상태가 없다.
import type { SlotSystem } from '../GameWorld';
import type { ActorKind, BlockPos } from '../types';
import type { NavigationGraph } from './NavigationGraph';
import { findPath, type PathGoal, type PathResult, type PathSearchState } from './pathfind';

/** 요청 상태. done 이면 result 가 최종 결과(경로 또는 NO_PATH)다. */
export type PathRequestStatus = 'pending' | 'done' | 'cancelled';

/** 요청자가 들고 있는 핸들. 결과를 기다리는 동안 매 프레임 status 를 읽는다(동기 응답을 전제하지 않는다). */
export interface PathRequest {
  readonly id: number;
  readonly from: BlockPos;
  readonly goal: PathGoal;
  readonly actor: ActorKind;
  readonly status: PathRequestStatus;
  /** done 이면 최종 결과 */
  readonly result: PathResult | null;
  /** 진행 중 마지막 NODE_LIMIT 의 부분 경로(검증된 칸만). 파괴 판단에 쓰지 않는다 */
  readonly partialPath: readonly BlockPos[];
  /** 세션 누적 확장 수 */
  readonly explored: number;
  /** 읽은 월드가 바뀌어 처음부터 다시 시작한 횟수 */
  readonly restarts: number;
}

/** 내부 가변 요청. */
interface Entry {
  id: number;
  from: BlockPos;
  goal: PathGoal;
  actor: ActorKind;
  status: PathRequestStatus;
  result: PathResult | null;
  partialPath: readonly BlockPos[];
  explored: number;
  restarts: number;
  search: PathSearchState | undefined;
  /** 이번 세션 이후 영향 범위 안의 변경이 있었다 */
  stale: boolean;
}

/** 계측값 (F3). */
export interface PathSchedulerStats {
  readonly pending: number;
  readonly lastFrameNodes: number;
  readonly completed: number;
}

/** 세션 범위 밖이어도 읽는 칸(이웃의 y±2, 장애물 칸)까지 포함하는 여유. */
const BOUNDS_MARGIN = 2;

/** 프레임 예산을 나눠 경로 세션을 이어 실행한다. */
export class PathScheduler implements SlotSystem {
  private readonly queue: Entry[] = [];
  private nextId = 1;
  private lastNodes = 0;
  private completed = 0;

  /** 통행 그래프와 프레임 예산을 받는다. 그래프 변경을 듣고 영향받는 세션을 표시한다. */
  constructor(
    private readonly graph: NavigationGraph,
    private readonly budgetPerFrame: number,
  ) {
    graph.onInvalidate((pos) => this.onChanged(pos));
  }

  /** 계측값. */
  get stats(): PathSchedulerStats {
    return {
      pending: this.queue.length,
      lastFrameNodes: this.lastNodes,
      completed: this.completed,
    };
  }

  /** 경로를 요청한다. 결과는 다음 nav 슬롯 이후에 나온다. */
  request(from: BlockPos, goal: PathGoal, actor: ActorKind): PathRequest {
    const entry: Entry = {
      id: this.nextId++,
      from,
      goal,
      actor,
      status: 'pending',
      result: null,
      partialPath: [],
      explored: 0,
      restarts: 0,
      search: undefined,
      stale: false,
    };
    this.queue.push(entry);
    return entry;
  }

  /** 요청을 취소한다. 이미 끝났으면 아무것도 하지 않는다. */
  cancel(request: PathRequest): void {
    const i = this.queue.findIndex((e) => e.id === request.id);
    if (i < 0) return;
    const [entry] = this.queue.splice(i, 1);
    if (entry) {
      entry.status = 'cancelled';
      entry.search = undefined;
    }
  }

  /**
   * 이번 프레임의 예산을 대기 요청에 고르게 나눈다. 다 못 쓴 몫은 다음 요청에 넘긴다.
   * 끝나지 않은 요청은 큐 뒤로 보내 다음 프레임에 먼저 받은 요청보다 뒤에서 이어 간다.
   */
  update(): void {
    let budget = this.budgetPerFrame;
    let used = 0;
    const count = this.queue.length;
    const unfinished: Entry[] = [];
    for (let i = 0; i < count; i++) {
      const entry = this.queue.shift() as Entry;
      if (budget <= 0) {
        unfinished.push(entry);
        continue;
      }
      const share = Math.max(1, Math.floor(budget / (count - i)));
      if (entry.stale) {
        entry.search = undefined;
        entry.stale = false;
        entry.restarts += 1;
      }
      const r = findPath(this.graph, entry.from, entry.goal, entry.actor, share, entry.search);
      budget -= r.nodesExplored;
      used += r.nodesExplored;
      entry.explored += r.nodesExplored;
      if (r.reason === 'NODE_LIMIT' && r.continuation) {
        entry.search = r.continuation;
        entry.partialPath = r.partialPath;
        unfinished.push(entry);
      } else {
        entry.status = 'done';
        entry.result = r;
        entry.search = undefined;
        this.completed += 1;
      }
    }
    this.queue.push(...unfinished);
    this.lastNodes = used;
  }

  /** 칸이 바뀌면 그 칸을 읽었을 수 있는 진행 중 세션을 다음 차례에 처음부터 다시 하도록 표시한다. */
  private onChanged(pos: BlockPos): void {
    for (const e of this.queue) {
      if (!e.search || e.stale) continue;
      const b = e.search.bounds;
      if (
        pos.x >= b.minX - BOUNDS_MARGIN &&
        pos.x <= b.maxX + BOUNDS_MARGIN &&
        pos.y >= b.minY - BOUNDS_MARGIN &&
        pos.y <= b.maxY + BOUNDS_MARGIN &&
        pos.z >= b.minZ - BOUNDS_MARGIN &&
        pos.z <= b.maxZ + BOUNDS_MARGIN
      ) {
        e.stale = true;
      }
    }
  }
}
