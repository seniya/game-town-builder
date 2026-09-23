// 인식된 방 목록과 재판정 큐 (MVP_SPEC 11.6 / 11.7, ARCHITECTURE 10.3~10.5). 방의 유일한 소유자다.
// 블록 변경마다 영향 받은 방·근처 문만 dirty 로 만들고, 프레임 예산 안에서 탐색 kernel 을 이어서 실행한다.
// 월드 전역 스캔은 로드 직후 rebuildAll 에서만 한다.
import { BlockId, isWallBlock } from '../data/blocks';
import type { EventBus, GameEventMap, RoomUnregisterReason } from '../EventBus';
import {
  posKey,
  type BlockPos,
  type Room,
  type RoomBlockReader,
  type RoomDiagnostic,
  type RoomLimits,
  type RoomRecipe,
  type RoomShape,
  type RoomType,
} from '../types';
import { HORIZONTAL_DIRS, RoomSearch } from './detectRoom';
import { analyzeRoom, describeFacilityIssues, matchAnalysis } from './matchRecipe';

/** RoomRegistry 생성 옵션. */
export interface RoomRegistryOptions {
  readonly limits: RoomLimits;
  readonly recipes: readonly RoomRecipe[];
  /** 밀리초 시계. 브라우저는 performance.now, 테스트는 가짜 시계를 준다 */
  readonly now: () => number;
  /** 로드 재구축용 문 목록. PlacementIndex 에서 온다 */
  readonly listDoors: () => readonly BlockPos[];
}

/** 큐 작업. 문 작업의 키는 (문 anchor, 시작 면)이다 (MVP_SPEC 11.6). */
type Job =
  | { readonly kind: 'door'; readonly key: string; readonly anchor: BlockPos; readonly dir: number }
  | { readonly kind: 'verify'; readonly key: string; readonly roomId: string };

/** 진행 중 작업과 누적 계산 시간. */
interface ActiveJob {
  readonly job: Job;
  search: RoomSearch;
  elapsedMs: number;
  restarts: number;
}

/** 진단 상태. */
interface DiagnosisState {
  readonly start: BlockPos;
  search: RoomSearch;
  /** 마지막으로 끝난 결과. 재계산 중이면 이전 결과다 */
  result: RoomDiagnostic | null;
  /** 최신 상태의 탐색이 아직 끝나지 않았다 */
  pending: boolean;
}

/** 방 내부 표현. 외부에는 Room(읽기 전용)으로만 보인다. */
interface MutableRoom {
  id: string;
  type: RoomType;
  shape: RoomShape;
  facilities: Room['facilities'];
  center: BlockPos;
  dirty: boolean;
}

/** F3 표시용 계측 (ARCHITECTURE 26). */
export interface RoomRegistryStats {
  readonly rooms: number;
  readonly byType: Readonly<Record<RoomType, number>>;
  readonly queueLength: number;
  /** 마지막으로 끝난 판정 한 건의 누적 계산 시간 */
  readonly lastDetectMs: number;
  /** 마지막 processQueue 호출이 쓴 시간 */
  readonly lastFrameMs: number;
  /** 지금까지 processQueue 한 번이 쓴 최대 시간 */
  readonly maxFrameMs: number;
  /** 탐색 중 읽은 범위가 바뀌어 다시 시작한 횟수 */
  readonly restarts: number;
  readonly jobsDone: number;
}

/** 예산 확인 사이에 진행할 탐색 셀 수. 한 묶음은 수 µs 다. */
const STEPS_PER_CHECK = 32;
/** 문 공간 인덱스의 버킷 한 변(블록). */
const DOOR_BUCKET = 32;

/** 버킷 키. */
function bucketKey(x: number, z: number): string {
  return `${Math.floor(x / DOOR_BUCKET)},${Math.floor(z / DOOR_BUCKET)}`;
}

/** 시설 비교용 서명. objectId 와 접근 셀이 같으면 같은 시설이다. */
function facilitySignature(f: Room['facilities']): string {
  const part = (list: Room['facilities']['beds']): string =>
    list.map((x) => `${x.objectId}:${x.approachCells.map(posKey).join('|')}`).join(';');
  return [part(f.beds), part(f.cookingSpots), part(f.diningSeats), part(f.chests)].join('/');
}

/** 내부 칸 중 무게중심에 가장 가까운 칸. 라벨·보상 좌표용이다. */
function centerOf(shape: RoomShape): BlockPos {
  const n = shape.interior.length;
  const mx = shape.interior.reduce((s, p) => s + p.x, 0) / n;
  const mz = shape.interior.reduce((s, p) => s + p.z, 0) / n;
  let best = shape.interior[0] as BlockPos;
  let bestD = Infinity;
  for (const p of shape.interior) {
    const d = (p.x - mx) ** 2 + (p.z - mz) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** 방의 영향 칸: 바닥(y-1)·내부 두 층·경계 두 층 (MVP_SPEC 11.6 의 1). */
function influenceCells(shape: RoomShape, wallHeight: number): BlockPos[] {
  const out: BlockPos[] = [];
  for (const p of shape.interior) {
    for (let dy = -1; dy < wallHeight; dy++) out.push({ x: p.x, y: p.y + dy, z: p.z });
  }
  for (const p of shape.boundary) {
    for (let dy = 0; dy < wallHeight; dy++) out.push({ x: p.x, y: p.y + dy, z: p.z });
  }
  return out;
}

/** 인식된 방의 소유자와 재판정 큐. */
export class RoomRegistry {
  private readonly rooms = new Map<string, MutableRoom>();
  private readonly cellToRoom = new Map<string, string>();
  private readonly influence = new Map<string, Set<string>>();
  private readonly doors = new Map<string, BlockPos>();
  private readonly doorBuckets = new Map<string, Set<string>>();
  private queue: Job[] = [];
  private queueHead = 0;
  private readonly queued = new Set<string>();
  private active: ActiveJob | null = null;
  private diagnosis: DiagnosisState | null = null;
  private roomCounter = 0;
  private silent = false;
  private lastDetectMs = 0;
  private lastFrameMs = 0;
  private maxFrameMs = 0;
  private restartCount = 0;
  private jobsDone = 0;

  /** 읽기 포트·이벤트 버스·레시피·시계를 받는다. */
  constructor(
    private readonly read: RoomBlockReader,
    private readonly events: EventBus,
    private readonly options: RoomRegistryOptions,
  ) {}

  /** 읽기 snapshot 목록. */
  getAll(): readonly Room[] {
    return [...this.rooms.values()];
  }

  /** id 로 조회한다. */
  getById(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  /** 타입별 유효한 방. dirty 방은 제외한다 (ARCHITECTURE 10.3, 22.3). */
  getByType(type: RoomType): readonly Room[] {
    return [...this.rooms.values()].filter((r) => r.type === type && !r.dirty);
  }

  /** 내부 영역에 pos 를 포함하는 방. */
  findContaining(pos: BlockPos): Room | undefined {
    const id = this.cellToRoom.get(posKey(pos));
    return id === undefined ? undefined : this.rooms.get(id);
  }

  /** 대기 중 작업 수(진행 중 포함). */
  get queueLength(): number {
    return this.queue.length - this.queueHead + (this.active ? 1 : 0);
  }

  /** F3 계측. */
  get stats(): RoomRegistryStats {
    const byType: Record<RoomType, number> = {
      DiningRoom: 0,
      Kitchen: 0,
      Bedroom: 0,
      Storeroom: 0,
      EmptyRoom: 0,
    };
    for (const r of this.rooms.values()) byType[r.type] += 1;
    return {
      rooms: this.rooms.size,
      byType,
      queueLength: this.queueLength,
      lastDetectMs: this.lastDetectMs,
      lastFrameMs: this.lastFrameMs,
      maxFrameMs: this.maxFrameMs,
      restarts: this.restartCount,
      jobsDone: this.jobsDone,
    };
  }

  /**
   * BLOCK_CHANGED 하나를 반영한다. 문 인덱스를 먼저 고친 뒤 markDirty 한다 (MVP_SPEC 11.6 의 3).
   * 새 문은 인덱스에 추가한 다음 검사하고, 삭제된 문은 소속 방을 영향 칸으로 무효화한다.
   */
  handleBlockChanged(change: GameEventMap['BLOCK_CHANGED']): void {
    if (change.from === BlockId.door && change.removedObject) {
      this.removeDoor(change.removedObject.anchor);
    }
    if (change.to === BlockId.door) {
      const o = this.read.objectAt(change.pos);
      if (o && o.blockId === BlockId.door) this.addDoor(o.anchor);
    }
    this.markDirty(change.pos);
  }

  /**
   * pos 변경의 영향을 받는 기존 방과 문 후보를 큐에 넣는다 (MVP_SPEC 11.6).
   * 진행 중 탐색이 이 칸을 읽었을 수 있으면 버리고 처음부터 다시 한다.
   */
  markDirty(pos: BlockPos): void {
    const affected = this.influence.get(posKey(pos));
    if (affected) {
      for (const id of affected) {
        const room = this.rooms.get(id);
        if (!room) continue;
        room.dirty = true;
        this.enqueue({ kind: 'verify', key: `room:${id}`, roomId: id });
      }
    }
    for (const anchor of this.doorsNear(pos)) this.enqueueDoor(anchor);
    if (this.active?.search.touches(pos)) this.restartActive();
    // 진단은 끝났더라도 읽은 칸이 바뀌면 다시 한다. 새 결과가 나올 때까지 이전 결과를 보여 준다
    const d = this.diagnosis;
    if (d && d.search.touches(pos)) {
      d.search = new RoomSearch(this.read, d.start, this.options.limits);
      d.pending = true;
    }
  }

  /** 진단을 자동 큐보다 먼저 시작한다. 이전 진단은 버린다 (MVP_SPEC 11.5). */
  beginDiagnosis(start: BlockPos): void {
    this.diagnosis = {
      start,
      search: new RoomSearch(this.read, start, this.options.limits),
      // 이전 결과는 새 결과가 나올 때까지 화면에 남긴다(걸을 때 깜빡이지 않게)
      result: this.diagnosis?.result ?? null,
      pending: true,
    };
  }

  /** 진단을 끝낸다. */
  cancelDiagnosis(): void {
    this.diagnosis = null;
  }

  /**
   * 진단 결과 또는 계산 중 상태. pending 이면 result 는 이전 결과(또는 null)다.
   * 진단을 시작하지 않았으면 pending false, result null.
   */
  getDiagnosis(): { pending: boolean; result: RoomDiagnostic | null } {
    const d = this.diagnosis;
    if (!d) return { pending: false, result: null };
    return { pending: d.pending, result: d.result };
  }

  /**
   * 진단 → 자동 큐 순서로 budgetMs 안에서 처리한다. 탐색 셀 묶음 사이마다 시간을 확인하고,
   * 예산이 끝나면 진행 중 탐색을 다음 호출로 넘긴다 (ARCHITECTURE 10.5).
   */
  processQueue(budgetMs: number): void {
    const now = this.options.now;
    const t0 = now();
    const deadline = t0 + budgetMs;
    let t = t0;
    while (t < deadline) {
      const d = this.diagnosis;
      if (d && d.pending) {
        const done = d.search.step(STEPS_PER_CHECK);
        t = now();
        if (done) {
          d.result = this.buildDiagnostic(d);
          d.pending = false;
        }
        continue;
      }
      if (!this.active && !this.takeNext()) break;
      const a = this.active as ActiveJob;
      const s0 = t;
      const done = a.search.step(STEPS_PER_CHECK);
      t = now();
      a.elapsedMs += t - s0;
      if (done) {
        this.active = null;
        this.jobsDone += 1;
        this.lastDetectMs = a.elapsedMs;
        this.finish(a.job, a.search);
        t = now();
      }
    }
    this.lastFrameMs = t - t0;
    this.maxFrameMs = Math.max(this.maxFrameMs, this.lastFrameMs);
  }

  /**
   * 로드 직후 문 인덱스로 재구축한다. 예산 없이 끝까지 처리하며 보상 이벤트를 발행하지 않는다.
   * 전역 스캔은 여기서만 한다 (ARCHITECTURE 10.3).
   */
  rebuildAll(): void {
    this.rooms.clear();
    this.cellToRoom.clear();
    this.influence.clear();
    this.doors.clear();
    this.doorBuckets.clear();
    this.queue = [];
    this.queueHead = 0;
    this.queued.clear();
    this.active = null;
    for (const anchor of this.options.listDoors()) {
      this.addDoor(anchor);
      this.enqueueDoor(anchor);
    }
    this.silent = true;
    try {
      while (this.takeNext()) {
        const a = this.active as ActiveJob | null;
        if (!a) continue;
        while (!a.search.step(4096)) {
          // 끝까지 실행한다
        }
        this.active = null;
        this.finish(a.job, a.search);
      }
    } finally {
      this.silent = false;
    }
  }

  /** 큐에서 다음 실행할 작업을 꺼내 탐색을 준비한다. 건너뛸 작업은 버린다. 없으면 false. */
  private takeNext(): boolean {
    while (this.queueHead < this.queue.length) {
      const job = this.queue[this.queueHead] as Job;
      this.queueHead += 1;
      this.queued.delete(job.key);
      if (this.queueHead > 256 && this.queueHead * 2 > this.queue.length) {
        this.queue = this.queue.slice(this.queueHead);
        this.queueHead = 0;
      }
      const start = this.startOf(job);
      if (!start) continue;
      this.active = {
        job,
        search: new RoomSearch(this.read, start, this.options.limits),
        elapsedMs: 0,
        restarts: 0,
      };
      return true;
    }
    this.queue = [];
    this.queueHead = 0;
    return false;
  }

  /**
   * 작업의 탐색 시작점. 건너뛸 작업이면 null.
   * 문 작업: 문이 사라졌거나, 시작 칸이 벽·월드 밖이거나, 이미 유효한(dirty 아닌) 방 안이면 건너뛴다.
   * 확인 작업: dirty 방의 내부 칸 중 벽이 아닌 첫 칸에서 시작한다. 그런 칸이 없으면 방을 해제한다.
   */
  private startOf(job: Job): BlockPos | null {
    if (job.kind === 'door') {
      const o = this.read.objectAt(job.anchor);
      if (!o || o.blockId !== BlockId.door || posKey(o.anchor) !== posKey(job.anchor)) {
        this.removeDoor(job.anchor);
        return null;
      }
      const d = HORIZONTAL_DIRS[job.dir] as { dx: number; dz: number };
      const start = { x: job.anchor.x + d.dx, y: job.anchor.y, z: job.anchor.z + d.dz };
      if (!this.read.contains(start)) return null;
      if (isWallBlock(this.read.get(start.x, start.y, start.z))) return null;
      const owner = this.findContaining(start);
      if (owner && !owner.dirty) return null;
      return start;
    }
    const room = this.rooms.get(job.roomId);
    if (!room || !room.dirty) return null;
    const start = room.shape.interior.find((p) => !isWallBlock(this.read.get(p.x, p.y, p.z)));
    if (!start) {
      this.unregister(room, { reason: 'TOO_SMALL' });
      return null;
    }
    return start;
  }

  /** 끝난 탐색을 반영한다. 성공이면 등록·갱신, 실패면 시작 칸이 속한 방을 해제한다. */
  private finish(job: Job, search: RoomSearch): void {
    const r = search.result;
    if (!r) return;
    if (r.ok) {
      this.commit(r.shape);
      return;
    }
    const owner = job.kind === 'verify' ? this.rooms.get(job.roomId) : this.roomAt(search.start);
    if (owner) this.unregister(owner, r.failure);
  }

  /** 시작 칸을 포함하는 내부 방. */
  private roomAt(pos: BlockPos): MutableRoom | undefined {
    const id = this.cellToRoom.get(posKey(pos));
    return id === undefined ? undefined : this.rooms.get(id);
  }

  /**
   * 성공한 형태를 등록한다. 겹치는 기존 방이 하나면 그 방을 갱신하고 id 를 유지한다(같은 방의 재판정·
   * 모양 변경). 둘 이상이면 합병이므로 이전 방들을 해제하고 새로 등록한다 (ARCHITECTURE 10.4).
   */
  private commit(shape: RoomShape): void {
    const analysis = analyzeRoom(this.read, shape);
    const match = matchAnalysis(analysis, this.options.recipes);
    const overlapping = new Set<string>();
    for (const p of shape.interior) {
      const id = this.cellToRoom.get(posKey(p));
      if (id !== undefined) overlapping.add(id);
    }
    if (overlapping.size === 1) {
      const room = this.rooms.get([...overlapping][0] as string) as MutableRoom;
      const before = { type: room.type, sig: facilitySignature(room.facilities) };
      this.unindex(room);
      room.shape = shape;
      room.center = centerOf(shape);
      room.type = match.type;
      room.facilities = match.facilities;
      room.dirty = false;
      this.index(room);
      if (before.type !== room.type) {
        this.emit('ROOM_TYPE_CHANGED', { roomId: room.id, from: before.type, to: room.type });
      } else if (before.sig !== facilitySignature(room.facilities)) {
        this.emit('ROOM_FACILITIES_CHANGED', { roomId: room.id });
      }
      return;
    }
    for (const id of overlapping) {
      const old = this.rooms.get(id);
      if (old) this.unregister(old, { reason: 'MERGED' });
    }
    this.roomCounter += 1;
    const room: MutableRoom = {
      id: `room-${this.roomCounter}`,
      type: match.type,
      shape,
      facilities: match.facilities,
      center: centerOf(shape),
      dirty: false,
    };
    this.rooms.set(room.id, room);
    this.index(room);
    this.emit('ROOM_REGISTERED', { roomId: room.id, type: room.type });
  }

  /** 방을 해제하고 인덱스에서 뺀다 (MVP_SPEC 11.7). */
  private unregister(room: MutableRoom, reason: RoomUnregisterReason): void {
    this.unindex(room);
    this.rooms.delete(room.id);
    this.queued.delete(`room:${room.id}`);
    this.emit('ROOM_UNREGISTERED', { roomId: room.id, reason });
  }

  /** 이벤트를 발행한다. 로드 재구축 중에는 발행하지 않는다. */
  private emit<
    K extends
      'ROOM_REGISTERED' | 'ROOM_TYPE_CHANGED' | 'ROOM_FACILITIES_CHANGED' | 'ROOM_UNREGISTERED',
  >(name: K, payload: GameEventMap[K]): void {
    if (!this.silent) this.events.emit(name, payload);
  }

  /** 방의 내부 칸·영향 칸 인덱스를 넣는다. */
  private index(room: MutableRoom): void {
    for (const p of room.shape.interior) this.cellToRoom.set(posKey(p), room.id);
    for (const p of influenceCells(room.shape, this.options.limits.minWallHeight)) {
      const k = posKey(p);
      let set = this.influence.get(k);
      if (!set) {
        set = new Set();
        this.influence.set(k, set);
      }
      set.add(room.id);
    }
  }

  /** 방의 인덱스를 뺀다. */
  private unindex(room: MutableRoom): void {
    for (const p of room.shape.interior) {
      const k = posKey(p);
      if (this.cellToRoom.get(k) === room.id) this.cellToRoom.delete(k);
    }
    for (const p of influenceCells(room.shape, this.options.limits.minWallHeight)) {
      const k = posKey(p);
      const set = this.influence.get(k);
      if (!set) continue;
      set.delete(room.id);
      if (set.size === 0) this.influence.delete(k);
    }
  }

  /** 작업을 중복 없이 큐에 넣는다. 진행 중인 같은 작업은 markDirty 의 touches 가 재시작시킨다. */
  private enqueue(job: Job): void {
    if (this.queued.has(job.key)) return;
    this.queued.add(job.key);
    this.queue.push(job);
  }

  /** 문 하나의 네 시작 면을 큐에 넣는다. */
  private enqueueDoor(anchor: BlockPos): void {
    const k = posKey(anchor);
    for (let dir = 0; dir < HORIZONTAL_DIRS.length; dir++) {
      this.enqueue({ kind: 'door', key: `door:${k}:${dir}`, anchor, dir });
    }
  }

  /**
   * 진행 중 작업을 처음부터 다시 한다. 읽은 블록이 바뀌었기 때문이다.
   * 시작점도 최신 상태로 다시 고른다(시작 칸에 벽을 놓았을 수 있다). 건너뛸 작업이 되면 버린다.
   */
  private restartActive(): void {
    const a = this.active;
    if (!a) return;
    const start = this.startOf(a.job);
    if (!start) {
      this.active = null;
      return;
    }
    a.search = new RoomSearch(this.read, start, this.options.limits);
    a.restarts += 1;
    this.restartCount += 1;
  }

  /** 문 anchor 를 공간 인덱스에 넣는다. */
  private addDoor(anchor: BlockPos): void {
    const k = posKey(anchor);
    if (this.doors.has(k)) return;
    this.doors.set(k, anchor);
    const b = bucketKey(anchor.x, anchor.z);
    let set = this.doorBuckets.get(b);
    if (!set) {
      set = new Set();
      this.doorBuckets.set(b, set);
    }
    set.add(k);
  }

  /** 문 anchor 를 공간 인덱스에서 뺀다. */
  private removeDoor(anchor: BlockPos): void {
    const k = posKey(anchor);
    if (!this.doors.delete(k)) return;
    const b = bucketKey(anchor.x, anchor.z);
    const set = this.doorBuckets.get(b);
    set?.delete(k);
    if (set && set.size === 0) this.doorBuckets.delete(b);
  }

  /**
   * y 가 pos.y-1 / pos.y / pos.y+1 이고 xz Manhattan 거리가 maxFloorArea + 1 이하인 문 (MVP_SPEC 11.6 의 2).
   * 버킷으로 후보를 좁히므로 문 수가 늘어도 월드 전체를 훑지 않는다.
   */
  private doorsNear(pos: BlockPos): BlockPos[] {
    const r = this.options.limits.maxFloorArea + 1;
    const out: BlockPos[] = [];
    const b0x = Math.floor((pos.x - r) / DOOR_BUCKET);
    const b1x = Math.floor((pos.x + r) / DOOR_BUCKET);
    const b0z = Math.floor((pos.z - r) / DOOR_BUCKET);
    const b1z = Math.floor((pos.z + r) / DOOR_BUCKET);
    for (let bx = b0x; bx <= b1x; bx++) {
      for (let bz = b0z; bz <= b1z; bz++) {
        const set = this.doorBuckets.get(`${bx},${bz}`);
        if (!set) continue;
        for (const k of set) {
          const a = this.doors.get(k) as BlockPos;
          if (Math.abs(a.y - pos.y) > 1) continue;
          if (Math.abs(a.x - pos.x) + Math.abs(a.z - pos.z) > r) continue;
          out.push(a);
        }
      }
    }
    return out;
  }

  /** 끝난 진단 탐색을 RoomDiagnostic 으로 만든다. 성공이면 레시피·가구 문제도 담는다. */
  private buildDiagnostic(d: DiagnosisState): RoomDiagnostic {
    const s = d.search;
    const detection = s.result as NonNullable<RoomSearch['result']>;
    let roomType: RoomType | null = null;
    let facilityIssues: RoomDiagnostic['facilityIssues'] = [];
    if (detection.ok) {
      const analysis = analyzeRoom(this.read, detection.shape);
      const match = matchAnalysis(analysis, this.options.recipes);
      roomType = match.type;
      facilityIssues = describeFacilityIssues(analysis, match, this.options.recipes);
    }
    return {
      start: d.start,
      detection,
      explored: [...s.explored],
      escapeTrace: detection.ok ? [] : s.escapeTrace(),
      failureDetail: s.failureDetail,
      roomType,
      facilityIssues,
    };
  }
}
