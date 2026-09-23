// 침대 배정 (MVP_SPEC 18.1, ARCHITECTURE 15 / 27, TASK-033). 침대 배정의 유일한 소유자다.
// NPC 엔티티에는 배정을 저장하지 않는다. 판단은 assignedBed 조회로, Action 은 isAssigned 포트로만 읽는다.
// 배정은 "실제 경로가 있는 빈 침대"에만 한다: 후보를 고르면 경로를 요청하고, 경로가 나오면 확정한다.
// update 10 번 슬롯에서 판단보다 먼저 돈다 (ARCHITECTURE 4.1).
import { BlockId } from '../data/blocks';
import type { NPC } from '../entities/NPC';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type { NavigationGraph } from '../nav/NavigationGraph';
import type { PathRequest, PathScheduler } from '../nav/PathScheduler';
import type { ActionView, BlockPos, Facility, PlacedObjectSnapshot, Room } from '../types';
import { npcCell } from './NPCDecisionSystem';

/** 저장 단위 (SaveData.bedAssignments, ARCHITECTURE 23.1). */
export interface BedAssignment {
  readonly objectId: string;
  readonly npcId: string;
}

/** 배정에 필요한 조회. 각각 소유자의 읽기 포트다. */
export interface SleepSystemDeps {
  readonly events: EventBus;
  /** 모든 방(dirty 포함). 기존 배정 유지 판단에 dirty 방도 본다 */
  readonly rooms: () => readonly Room[];
  readonly placement: (objectId: string) => PlacedObjectSnapshot | undefined;
  readonly npcs: () => Iterable<NPC<ActionView>>;
  readonly nav: NavigationGraph;
  readonly paths: PathScheduler;
}

/** 경로 확인 중인 후보 배정. */
interface Pending {
  readonly bedId: string;
  readonly request: PathRequest;
}

/** 계측값 (F3). */
export interface SleepStats {
  readonly assigned: number;
  readonly checking: number;
  readonly beds: number;
}

/** 침대 한 개 = 주민 한 명의 고정 배정. */
export class SleepSystem implements SlotSystem {
  private readonly bedOf = new Map<string, string>();
  private readonly npcOf = new Map<string, string>();
  private readonly pending = new Map<string, Pending>();
  /** `${npcId}|${bedId}` : 경로가 없었던 조합. 블록·방이 바뀌면 다시 시도한다 */
  private readonly unreachable = new Set<string>();
  /** 현재 Bedroom 의 침대 시설. 방이 dirty 인지 함께 둔다 */
  private beds = new Map<string, { facility: Facility; roomDirty: boolean }>();
  private dirty = true;

  /** 방·블록 변경을 구독한다. 침대 파괴는 방 재판정을 기다리지 않고 즉시 해제한다. */
  constructor(private readonly deps: SleepSystemDeps) {
    const mark = (): void => void (this.dirty = true);
    deps.events.on('ROOM_REGISTERED', mark);
    deps.events.on('ROOM_TYPE_CHANGED', mark);
    deps.events.on('ROOM_FACILITIES_CHANGED', mark);
    deps.events.on('ROOM_UNREGISTERED', mark);
    deps.events.on('BLOCK_CHANGED', (c) => {
      this.unreachable.clear();
      this.dirty = true;
      if (c.removedObject?.blockId === BlockId.bed) this.releaseBed(c.removedObject.id);
    });
  }

  /** 계측값. */
  get stats(): SleepStats {
    return { assigned: this.bedOf.size, checking: this.pending.size, beds: this.beds.size };
  }

  /** 이 주민의 확정된 침대 시설. 없으면 null. 판단(NPCContext.assignedBed)이 읽는다. */
  assignedBed(npcId: string): Facility | null {
    const bedId = this.bedOf.get(npcId);
    if (bedId === undefined) return null;
    return this.beds.get(bedId)?.facility ?? null;
  }

  /** 이 침대가 지금 이 주민에게 배정되어 있는가 (ActionServices.sleep). */
  isAssigned(npcId: string, bedObjectId: string): boolean {
    return this.bedOf.get(npcId) === bedObjectId;
  }

  /** 침대로 가는 실제 이동이 경로를 찾지 못했다. 배정을 풀고 다른 침대를 찾는다. */
  reportUnreachable(npcId: string, bedObjectId: string): void {
    this.unreachable.add(`${npcId}|${bedObjectId}`);
    if (this.bedOf.get(npcId) === bedObjectId) this.release(npcId);
    this.dirty = true;
  }

  /** 새 주민이 도착했거나 떠났다(ResidentArrivalSystem, TASK-038). 다음 update 에서 다시 배정한다. */
  markDirty(): void {
    this.dirty = true;
  }

  /** 저장용 배정 목록. */
  snapshot(): BedAssignment[] {
    return [...this.bedOf].map(([npcId, objectId]) => ({ objectId, npcId }));
  }

  /** 로드 복원. 유효성은 다음 update 에서 확인하고 사라진 침대의 배정만 푼다 (ARCHITECTURE 23.4 의 5). */
  restore(list: readonly BedAssignment[]): void {
    this.bedOf.clear();
    this.npcOf.clear();
    for (const p of this.pending.values()) this.deps.paths.cancel(p.request);
    this.pending.clear();
    for (const a of list) {
      this.bedOf.set(a.npcId, a.objectId);
      this.npcOf.set(a.objectId, a.npcId);
    }
    this.dirty = true;
  }

  /** 변경이 있었거나 경로 확인이 진행 중이면 배정을 맞춘다. */
  update(): void {
    if (!this.dirty && this.pending.size === 0) return;
    this.dirty = false;
    this.refreshBeds();
    const npcs = [...this.deps.npcs()];
    const alive = new Set(npcs.map((n) => n.id));
    // 1. 사라진 침대·방 해제·타입 변경·주민 제거로 무효가 된 배정을 푼다
    for (const [npcId, bedId] of [...this.bedOf]) {
      if (!alive.has(npcId) || !this.beds.has(bedId) || !this.deps.placement(bedId)) {
        this.release(npcId);
      }
    }
    // 2. 경로 확인이 끝난 후보를 확정하거나 버린다
    for (const [npcId, p] of [...this.pending]) {
      const bed = this.beds.get(p.bedId);
      if (!alive.has(npcId) || !bed || bed.roomDirty || this.npcOf.has(p.bedId)) {
        this.deps.paths.cancel(p.request);
        this.pending.delete(npcId);
        this.dirty = true;
        continue;
      }
      if (p.request.status === 'pending') continue;
      this.pending.delete(npcId);
      if (p.request.result?.path) {
        this.bedOf.set(npcId, p.bedId);
        this.npcOf.set(p.bedId, npcId);
      } else {
        this.unreachable.add(`${npcId}|${p.bedId}`);
        this.dirty = true;
      }
    }
    // 3. 미배정 주민에게 가까운 빈 침대 후보를 고르고 경로를 요청한다(등록 순서, 결정적)
    for (const npc of npcs) {
      if (this.bedOf.has(npc.id) || this.pending.has(npc.id)) continue;
      const cell = npcCell(npc);
      const bed = this.pickBed(npc.id, cell);
      if (!bed) continue;
      const from = this.startCell(cell);
      if (!from) continue;
      const request = this.deps.paths.request(
        from,
        { kind: 'cells', cells: bed.approachCells },
        'npc',
      );
      this.pending.set(npc.id, { bedId: bed.objectId, request });
    }
  }

  /** 현재 Bedroom 의 침대 시설 목록을 다시 만든다. */
  private refreshBeds(): void {
    const next = new Map<string, { facility: Facility; roomDirty: boolean }>();
    for (const room of this.deps.rooms()) {
      if (room.type !== 'Bedroom') continue;
      for (const f of room.facilities.beds)
        next.set(f.objectId, { facility: f, roomDirty: room.dirty });
    }
    this.beds = next;
  }

  /** 이 주민이 쓸 수 있는 빈 침대 중 가장 가까운 것. 재판정 중인 방의 침대는 새로 배정하지 않는다. */
  private pickBed(npcId: string, cell: BlockPos): Facility | null {
    const taken = new Set([...this.pending.values()].map((p) => p.bedId));
    let best: Facility | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const [bedId, b] of this.beds) {
      if (b.roomDirty || this.npcOf.has(bedId) || taken.has(bedId)) continue;
      if (this.unreachable.has(`${npcId}|${bedId}`)) continue;
      const a = b.facility.anchor;
      const d = Math.abs(a.x - cell.x) + Math.abs(a.y - cell.y) + Math.abs(a.z - cell.z);
      if (d < bestD || (d === bestD && best !== null && bedId < best.objectId)) {
        best = b.facility;
        bestD = d;
      }
    }
    return best;
  }

  /** 경로 출발 칸. 발 칸이 설 수 없으면 위·아래 한 칸을 본다. */
  private startCell(cell: BlockPos): BlockPos | null {
    for (const dy of [0, 1, -1]) {
      const c = { ...cell, y: cell.y + dy };
      if (this.deps.nav.isStandable(c, 'npc')) return c;
    }
    return null;
  }

  /** 침대 id 로 배정을 푼다. */
  private releaseBed(bedId: string): void {
    const npcId = this.npcOf.get(bedId);
    if (npcId !== undefined) this.release(npcId);
  }

  /** 주민의 배정을 푼다. */
  private release(npcId: string): void {
    const bedId = this.bedOf.get(npcId);
    if (bedId === undefined) return;
    this.bedOf.delete(npcId);
    this.npcOf.delete(bedId);
    this.dirty = true;
  }
}
