// 방 형태 판정 (MVP_SPEC 11.2 / 11.3, ARCHITECTURE 10.1). 순수 모듈이며 VoxelWorld 를 모른다.
// RoomSearch 는 한 셀씩 진행하는 탐색 kernel 이다. detectRoom 은 끝까지 실행하고,
// RoomRegistry 는 같은 kernel 을 프레임 예산 안에서 나눠 실행한다.
import { BlockId, isFurniture, isSolid, isWallBlock } from '../data/blocks';
import {
  type BlockPos,
  type RoomBlockReader,
  type RoomDetection,
  type RoomFailure,
  type RoomLimits,
} from '../types';

/** 4 방향 수평 이웃 오프셋. 탐색 순서를 고정해 결과를 재현 가능하게 한다. */
export const HORIZONTAL_DIRS: readonly { readonly dx: number; readonly dz: number }[] = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
];

/** 수치 키의 축 범위. x·z 는 ±2^20, y 는 ±2^10 이며 합쳐 2^53 안에 들어간다. */
const XZ_HALF = 2 ** 20;
const Y_HALF = 2 ** 10;

/**
 * 탐색 전용 수치 칸 키. 칸마다 문자열을 만들지 않아 GC 부담을 줄인다(프레임 예산, ARCHITECTURE 10.5).
 * 외부에 내보내는 키는 계속 types 의 posKey 다.
 */
function cellKey(x: number, y: number, z: number): number {
  return ((x + XZ_HALF) * (2 * XZ_HALF) + (z + XZ_HALF)) * (2 * Y_HALF) + (y + Y_HALF);
}

/** 후보 칸의 분류 (MVP_SPEC 11.3 의 2.a~e). */
type CellClass = 'wall' | 'outside' | 'noFloor' | 'interior' | 'blocked';

/**
 * 후보 칸을 분류한다. 순서가 규칙이다: 벽/문 → 월드 밖 → 바닥 없음 → 내부 → 그 밖의 고체/지형.
 * 문은 통행상 비고체이지만 벽 검사가 먼저이므로 경계가 된다.
 */
function classify(read: RoomBlockReader, p: BlockPos): CellClass {
  const id = read.get(p.x, p.y, p.z);
  if (isWallBlock(id)) return 'wall';
  if (!read.contains(p)) return 'outside';
  if (!isSolid(read.get(p.x, p.y - 1, p.z))) return 'noFloor';
  if (!isSolid(id)) return 'interior';
  if (isFurniture(id)) {
    // 침대는 다중 칸 객체여야 유효한 가구다. 메타데이터가 없는 bed 칸은 벽도 가구도 아니다
    if (id === BlockId.bed && !read.objectAt(p)) return 'blocked';
    return 'interior';
  }
  return 'blocked';
}

/** 탐색 단계. */
type Phase = 'fill' | 'walls' | 'done';

/**
 * 한 번의 방 탐색. step(n) 으로 최대 n 셀씩 진행하고, done 이 되면 result 를 읽는다.
 * 탐색이 읽은 범위를 touches 로 물을 수 있어, 도중에 그 범위가 바뀌면 호출자가 버리고 다시 시작한다.
 */
export class RoomSearch {
  private phase: Phase = 'fill';
  private readonly interiorKeys = new Set<number>();
  private readonly interiorList: BlockPos[] = [];
  private readonly boundaryKeys = new Set<number>();
  private readonly boundaryList: BlockPos[] = [];
  /** BFS 부모. 탐색 경로(escapeTrace)를 되짚는다 */
  private readonly parent = new Map<number, BlockPos | null>();
  private readonly queue: BlockPos[] = [];
  private head = 0;
  private wallIndex = 0;
  private outcome: RoomDetection | null = null;
  private traceEnd: BlockPos | null = null;
  private detail: 'outside' | 'notWall' | null = null;
  private minX: number;
  private maxX: number;
  private minZ: number;
  private maxZ: number;

  /** start 의 y 로 평면을 고정하고 탐색을 준비한다. 아직 아무것도 읽지 않는다. */
  constructor(
    private readonly read: RoomBlockReader,
    readonly start: BlockPos,
    private readonly limits: RoomLimits,
  ) {
    this.minX = start.x;
    this.maxX = start.x;
    this.minZ = start.z;
    this.maxZ = start.z;
  }

  /** 탐색이 끝났는가. */
  get done(): boolean {
    return this.phase === 'done';
  }

  /** 결과. 끝나기 전에는 null. */
  get result(): RoomDetection | null {
    return this.outcome;
  }

  /** 방문한 내부 칸(발견 순서). 실패해도 그때까지의 탐색 범위다. */
  get explored(): readonly BlockPos[] {
    return this.interiorList;
  }

  /** NOT_ENCLOSED 의 원인: 월드 밖 도달(outside) 또는 벽이 아닌 블록(notWall). */
  get failureDetail(): 'outside' | 'notWall' | null {
    return this.detail;
  }

  /**
   * 시작점에서 실패 칸(TOO_LARGE 면 마지막으로 넣은 칸)까지의 실제 BFS 경로.
   * 구멍 위치의 정답이 아니라 "탐색이 이렇게 밖으로 이어졌다"는 기록이다 (MVP_SPEC 11.5).
   */
  escapeTrace(): BlockPos[] {
    const out: BlockPos[] = [];
    let p: BlockPos | null = this.traceEnd;
    if (p && !this.parent.has(cellKey(p.x, p.y, p.z))) {
      out.push(p);
      p = this.lastInterior();
    }
    while (p) {
      out.push(p);
      p = this.parent.get(cellKey(p.x, p.y, p.z)) ?? null;
    }
    return out.reverse();
  }

  /**
   * 이 탐색이 읽었을 수 있는 칸인가. 방문 범위의 xz 경계 +1, y 는 바닥(y-1)부터 벽 최소 높이까지다.
   * 가구 접근의 머리 칸(y+1)도 이 범위에 들어간다.
   */
  touches(p: BlockPos): boolean {
    const y = this.start.y;
    const top = y + Math.max(1, this.limits.minWallHeight - 1);
    return (
      p.y >= y - 1 &&
      p.y <= top &&
      p.x >= this.minX - 1 &&
      p.x <= this.maxX + 1 &&
      p.z >= this.minZ - 1 &&
      p.z <= this.maxZ + 1
    );
  }

  /** 최대 maxSteps 셀을 진행한다. 끝났으면 true. 한 셀 = 내부 칸 하나의 이웃 검사 또는 경계 칸 하나의 높이 검사. */
  step(maxSteps: number): boolean {
    let budget = maxSteps;
    while (budget > 0 && this.phase !== 'done') {
      budget -= 1;
      if (this.phase === 'fill') this.stepFill();
      else this.stepWalls();
    }
    return this.phase === 'done';
  }

  /** 채우기 한 단계. 첫 호출은 시작점을 분류한다. */
  private stepFill(): void {
    if (this.parent.size === 0) {
      this.seed();
      return;
    }
    const c = this.queue[this.head];
    if (!c) {
      this.finishFill();
      return;
    }
    this.head += 1;
    for (const d of HORIZONTAL_DIRS) {
      const nx = c.x + d.dx;
      const nz = c.z + d.dz;
      const k = cellKey(nx, c.y, nz);
      if (this.interiorKeys.has(k) || this.boundaryKeys.has(k)) continue;
      const n = { x: nx, y: c.y, z: nz };
      const cls = classify(this.read, n);
      if (cls === 'wall') {
        this.boundaryKeys.add(k);
        this.boundaryList.push(n);
        this.grow(n);
        continue;
      }
      if (cls === 'interior') {
        this.parent.set(k, c);
        this.addInterior(n, k);
        if (this.interiorList.length > this.limits.maxFloorArea) {
          this.traceEnd = n;
          this.fail({ reason: 'TOO_LARGE' });
          return;
        }
        continue;
      }
      this.parent.set(k, c);
      this.failAt(cls, n);
      return;
    }
  }

  /** 시작점을 분류한다. 벽 칸에서 시작하면 내부가 없으므로 TOO_SMALL 이다. */
  private seed(): void {
    const s = this.start;
    const sk = cellKey(s.x, s.y, s.z);
    this.parent.set(sk, null);
    const cls = classify(this.read, s);
    if (cls === 'wall') {
      this.fail({ reason: 'TOO_SMALL' });
      return;
    }
    if (cls === 'interior') {
      this.addInterior(s, sk);
      return;
    }
    this.failAt(cls, s);
  }

  /** 채우기가 끝났다. 면적 하한을 보고 벽 높이 검사로 넘어간다. */
  private finishFill(): void {
    if (this.interiorList.length < this.limits.minFloorArea) {
      this.fail({ reason: 'TOO_SMALL' });
      return;
    }
    this.phase = 'walls';
  }

  /** 경계 칸 하나의 둘째 층(이상)을 검사한다. 모두 끝나면 문을 확인한다. */
  private stepWalls(): void {
    const b = this.boundaryList[this.wallIndex];
    if (!b) {
      this.finishWalls();
      return;
    }
    this.wallIndex += 1;
    for (let h = 1; h < this.limits.minWallHeight; h++) {
      const above = { x: b.x, y: b.y + h, z: b.z };
      if (!isWallBlock(this.read.get(above.x, above.y, above.z))) {
        this.fail({ reason: 'WALL_TOO_LOW', at: above });
        return;
      }
    }
  }

  /** 완전한 두 칸 문(anchor 가 이 평면)을 모은다. 없으면 NO_DOOR, 있으면 성공이다. */
  private finishWalls(): void {
    const doors: BlockPos[] = [];
    for (const b of this.boundaryList) {
      if (this.read.get(b.x, b.y, b.z) !== BlockId.door) continue;
      const o = this.read.objectAt(b);
      if (!o || o.blockId !== BlockId.door) continue;
      if (o.anchor.x === b.x && o.anchor.y === b.y && o.anchor.z === b.z) doors.push(o.anchor);
    }
    if (doors.length === 0) {
      this.fail({ reason: 'NO_DOOR' });
      return;
    }
    this.outcome = {
      ok: true,
      shape: {
        interior: this.interiorList,
        boundary: this.boundaryList,
        doors,
        floorY: this.start.y,
      },
    };
    this.phase = 'done';
  }

  /** 좌표가 있는 실패로 끝낸다. 바닥 구멍은 비어 있는 바닥 칸(y-1)을 가리킨다. */
  private failAt(cls: CellClass, n: BlockPos): void {
    this.traceEnd = n;
    if (cls === 'noFloor') {
      this.fail({ reason: 'NO_FLOOR', at: { x: n.x, y: n.y - 1, z: n.z } });
      return;
    }
    this.detail = cls === 'outside' ? 'outside' : 'notWall';
    this.fail({ reason: 'NOT_ENCLOSED', at: n });
  }

  /** 실패로 끝낸다. */
  private fail(failure: RoomFailure): void {
    this.outcome = { ok: false, failure };
    this.phase = 'done';
  }

  /** 내부 칸을 추가하고 큐에 넣는다. */
  private addInterior(p: BlockPos, key: number): void {
    this.interiorKeys.add(key);
    this.interiorList.push(p);
    this.queue.push(p);
    this.grow(p);
  }

  /** 읽은 범위의 xz 경계를 넓힌다. */
  private grow(p: BlockPos): void {
    this.minX = Math.min(this.minX, p.x);
    this.maxX = Math.max(this.maxX, p.x);
    this.minZ = Math.min(this.minZ, p.z);
    this.maxZ = Math.max(this.maxZ, p.z);
  }

  /** 마지막으로 꺼낸 내부 칸. 경로 되짚기의 시작점이다. */
  private lastInterior(): BlockPos | null {
    return this.queue[Math.max(0, this.head - 1)] ?? null;
  }
}

/** MVP_SPEC 11.2~11.3 의 방 형태를 끝까지 판정한다. 테스트와 진단의 동기 경로다. */
export function detectRoom(
  read: RoomBlockReader,
  start: BlockPos,
  limits: RoomLimits,
): RoomDetection {
  const search = new RoomSearch(read, start, limits);
  while (!search.step(4096)) {
    // 무한 루프는 없다: 내부 칸은 최대 maxFloorArea + 1 개, 경계 칸은 그 4 배를 넘지 않는다
  }
  return search.result as RoomDetection;
}
