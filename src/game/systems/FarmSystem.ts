// 농사 (MVP_SPEC 15, ARCHITECTURE 4.1 의 7 번, 14.4 / 14.5, 15, 27, TASK-030).
// crop 성장 상태(칸 → 심은 시각)의 유일한 소유자다. 성장은 농부와 무관하게 시계로 계산한다.
// farmland 칸 목록을 블록 변경 이벤트로 유지하고, 농부에게 가까운 후보(성숙 작물 → 빈 밭)를 좁혀 준다.
// 주민마다 월드를 훑지 않는다. 한 칸은 한 농부만 예약한다.
import { balance } from '../data/balance';
import { BlockId } from '../data/blocks';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type { NavigationGraph } from '../nav/NavigationGraph';
import { posKey, type BlockPos, type GameClockReader } from '../types';
import type { VillageStorage } from '../VillageStorage';
import type { VoxelWorld } from '../voxel/VoxelWorld';

/** 성숙까지의 게임분 = 표시 단계 수 × 단계 시간 (MVP_SPEC 15.2). */
export const MATURE_MINUTES = balance.farm.growthStages * balance.farm.hoursPerStage * 60;

/** 경과 게임분의 표시 단계 0 / 1 / 2. 단계 2 는 성숙을 뜻하지 않는다. */
export function cropStage(elapsedMinutes: number): number {
  const stage = Math.floor(elapsedMinutes / (balance.farm.hoursPerStage * 60));
  return Math.max(0, Math.min(balance.farm.growthStages - 1, stage));
}

/** 경과 게임분이 성숙인가(>= 720). */
export function isMature(elapsedMinutes: number): boolean {
  return elapsedMinutes >= MATURE_MINUTES;
}

/** 농부 한 명에게 좁힌 후보 (ARCHITECTURE 14 의 FarmCandidate). target 은 farmland 칸이다. */
export interface FarmCandidate {
  readonly kind: 'plant' | 'harvest';
  readonly target: BlockPos;
  readonly approachCells: readonly BlockPos[];
}

/** 저장 단위 (SaveData.crops). */
export interface CropRecord {
  readonly pos: BlockPos;
  readonly plantedAtGameMinutes: number;
}

/** 렌더가 읽는 작물 표시 상태. */
export interface CropView {
  readonly pos: BlockPos;
  readonly stage: number;
  readonly mature: boolean;
}

/** FarmSystem 이 읽고 쓰는 것. */
export interface FarmDeps {
  readonly voxels: Pick<VoxelWorld, 'getBlock' | 'setBlock' | 'allChunkCoords' | 'getChunk'>;
  readonly clock: GameClockReader;
  readonly storage: VillageStorage;
  readonly nav: NavigationGraph;
  readonly events: EventBus;
}

/** 계측값. */
export interface FarmStats {
  readonly farmland: number;
  readonly crops: number;
  readonly mature: number;
  readonly claims: number;
}

/** 두 칸의 맨해튼 거리. */
function manhattan(a: BlockPos, b: BlockPos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}

/** 밭·작물·후보·예약을 관리한다. */
export class FarmSystem implements SlotSystem {
  /** farmland 칸 (posKey → 칸) */
  private readonly farmland = new Map<string, BlockPos>();
  /** crop 칸이 아니라 그 아래 farmland 칸의 posKey → 심은 시각 */
  private readonly planted = new Map<string, number>();
  /** farmland posKey → 예약한 npcId */
  private readonly claims = new Map<string, string>();
  /** 밭·작물·예약·씨앗이 바뀔 때마다 오른다. 후보 캐시의 유효성 기준이다 (PERF-002) */
  private revision = 0;
  /** npcId → 마지막 후보와 그때의 판·시각 칸 */
  private readonly cache = new Map<
    string,
    { rev: number; slot: number; result: FarmCandidate | null }
  >();

  /** 월드의 farmland 를 한 번 모으고(로드·장면 초기화) 블록 변경을 구독한다. */
  constructor(private readonly deps: FarmDeps) {
    this.rescan();
    deps.events.on('BLOCK_CHANGED', (c) => this.onBlockChanged(c.pos, c.from, c.to));
    deps.events.on('STORAGE_CHANGED', () => void (this.revision += 1));
  }

  /** 계측값. */
  get stats(): FarmStats {
    let mature = 0;
    for (const t of this.planted.values()) if (isMature(this.elapsed(t))) mature += 1;
    return {
      farmland: this.farmland.size,
      crops: this.planted.size,
      mature,
      claims: this.claims.size,
    };
  }

  /** 성장은 심은 시각과 현재 시각으로 계산하므로 매 프레임 할 일이 없다(슬롯 7 번 자리만 차지한다). */
  update(): void {}

  /** 렌더용 작물 목록. */
  crops(): CropView[] {
    const out: CropView[] = [];
    for (const [k, t] of this.planted) {
      const f = this.farmland.get(k);
      if (!f) continue;
      const e = this.elapsed(t);
      out.push({ pos: { x: f.x, y: f.y + 1, z: f.z }, stage: cropStage(e), mature: isMature(e) });
    }
    return out;
  }

  /**
   * 이 농부에게 줄 후보 하나. 가까운 성숙 작물을 먼저, 없으면 seed 가 있을 때 가까운 빈 밭 (MVP_SPEC 15.3).
   * 다른 농부가 예약한 칸과 작업 칸이 없는 칸은 건너뛴다. 없으면 null.
   */
  candidateFor(npcId: string, from: BlockPos): FarmCandidate | null {
    // 판(밭·작물·예약·씨앗)이 그대로이고 같은 5 게임분 안이면 지난 결과를 쓴다. 성숙은 시계로 바뀌므로 시각 칸도 본다.
    // 주민마다 매 프레임 모든 밭을 훑지 않는다(후보 1000 건 × 농부 수, PERF-002)
    const slot = Math.floor(this.deps.clock.gameMinutes / 5);
    // 이미 잡은 칸이 아직 같은 일(수확·심기)의 대상이면 그대로 준다: 일하러 가는 농부는 다시 훑지 않는다
    const own = this.ownClaim(npcId);
    if (own) {
      const kind = this.kindAt(own);
      const approachCells = kind ? this.approachCells(own) : [];
      if (kind && approachCells.length > 0) return { kind, target: own, approachCells };
    }
    const hit = this.cache.get(npcId);
    if (hit && hit.rev === this.revision && hit.slot === slot) return hit.result;
    const result = this.computeCandidate(npcId, from);
    this.cache.set(npcId, { rev: this.revision, slot, result });
    return result;
  }

  /** 이 농부가 잡은 칸. 없으면 null. */
  private ownClaim(npcId: string): BlockPos | null {
    for (const [k, owner] of this.claims) {
      if (owner === npcId) return this.farmland.get(k) ?? null;
    }
    return null;
  }

  /** 이 칸에서 할 일: 성숙 작물이면 수확, 빈 밭이고 씨앗이 있으면 심기. 없으면 null. */
  private kindAt(p: BlockPos): 'plant' | 'harvest' | null {
    const k = posKey(p);
    const t = this.planted.get(k);
    if (t !== undefined) return isMature(this.elapsed(t)) && this.cropAt(p) ? 'harvest' : null;
    return this.plantable(p) && this.deps.storage.get('seed') >= 1 ? 'plant' : null;
  }

  /** 후보를 새로 계산한다. */
  private computeCandidate(npcId: string, from: BlockPos): FarmCandidate | null {
    const harvest = this.nearest(from, npcId, (k, p) => {
      const t = this.planted.get(k);
      return t !== undefined && isMature(this.elapsed(t)) && this.cropAt(p);
    });
    if (harvest) return { kind: 'harvest', ...harvest };
    if (this.deps.storage.get('seed') < 1) return null;
    const plant = this.nearest(from, npcId, (k, p) => !this.planted.has(k) && this.plantable(p));
    return plant ? { kind: 'plant', ...plant } : null;
  }

  /** 칸을 예약한다. 다른 농부가 잡고 있으면 false. */
  claim(npcId: string, target: BlockPos): boolean {
    const k = posKey(target);
    const owner = this.claims.get(k);
    if (owner !== undefined && owner !== npcId) return false;
    if (owner !== npcId) this.revision += 1;
    this.claims.set(k, npcId);
    return true;
  }

  /** 다른 농부가 이 칸을 잡았는가. */
  taken(npcId: string, target: BlockPos): boolean {
    const owner = this.claims.get(posKey(target));
    return owner !== undefined && owner !== npcId;
  }

  /** 예약을 푼다. 자기 예약만 푼다. */
  release(npcId: string, target: BlockPos): void {
    const k = posKey(target);
    if (this.claims.get(k) === npcId) {
      this.claims.delete(k);
      this.revision += 1;
    }
  }

  /**
   * 심는다: 빈 farmland 위에 crop 을 놓고 seed −1, 심은 시각을 기록한다 (MVP_SPEC 15.3).
   * 조건이 맞지 않거나 seed 가 없으면 아무것도 바꾸지 않고 false.
   */
  plant(target: BlockPos): boolean {
    const k = posKey(target);
    if (!this.farmland.has(k) || this.planted.has(k) || !this.plantable(target)) return false;
    if (this.deps.storage.get('seed') < 1) return false;
    return this.deps.events.transaction(() => {
      if (!this.deps.voxels.setBlock(target.x, target.y + 1, target.z, BlockId.crop, 'npc')) {
        return false;
      }
      this.deps.storage.take('seed', 1);
      this.planted.set(k, this.deps.clock.gameMinutes);
      return true;
    });
  }

  /**
   * 수확한다: 성숙 작물을 없애고 crop +1, seed +1 (MVP_SPEC 15.3). 미성숙·없음이면 false.
   */
  harvest(target: BlockPos): boolean {
    const k = posKey(target);
    const t = this.planted.get(k);
    if (t === undefined || !isMature(this.elapsed(t)) || !this.cropAt(target)) return false;
    return this.deps.events.transaction(() => {
      // 기록을 먼저 지워 BLOCK_CHANGED 구독(작물 파괴 처리)이 이 수확을 파괴로 보지 않게 한다
      this.planted.delete(k);
      if (!this.deps.voxels.setBlock(target.x, target.y + 1, target.z, BlockId.air, 'npc')) {
        this.planted.set(k, t);
        return false;
      }
      this.deps.storage.add('crop', balance.farm.seedReturnedPerHarvest);
      this.deps.storage.add('seed', balance.farm.seedReturnedPerHarvest);
      return true;
    });
  }

  /** 저장용 작물 기록. */
  snapshot(): CropRecord[] {
    return [...this.planted].map(([k, t]) => ({
      pos: this.farmland.get(k) ?? parseKey(k),
      plantedAtGameMinutes: t,
    }));
  }

  /** 로드 복원. farmland 를 다시 모으고, 위에 crop 이 있는 기록만 남긴다 (ARCHITECTURE 23.4). */
  restore(records: readonly CropRecord[]): void {
    this.revision += 1;
    this.rescan();
    this.planted.clear();
    this.claims.clear();
    for (const r of records) {
      const k = posKey(r.pos);
      if (this.farmland.has(k) && this.cropAt(r.pos)) this.planted.set(k, r.plantedAtGameMinutes);
    }
  }

  /** 블록 변경: farmland 목록 갱신, farmland 제거 시 위 crop 정리, crop 이 사라지면 기록 삭제. */
  private onBlockChanged(pos: BlockPos, from: number, to: number): void {
    if (
      from === BlockId.farmland ||
      to === BlockId.farmland ||
      from === BlockId.crop ||
      to === BlockId.crop
    ) {
      this.revision += 1;
    }
    if (to === BlockId.farmland) this.farmland.set(posKey(pos), pos);
    if (from === BlockId.farmland && to !== BlockId.farmland) {
      const k = posKey(pos);
      this.farmland.delete(k);
      this.planted.delete(k);
      this.claims.delete(k);
      // farmland 가 사라지면 위의 crop 도 사라진다 (READY-02 의 예외, MVP_SPEC 15.4). 씨앗은 돌아오지 않는다
      if (this.deps.voxels.getBlock(pos.x, pos.y + 1, pos.z) === BlockId.crop) {
        this.deps.voxels.setBlock(pos.x, pos.y + 1, pos.z, BlockId.air, 'world');
      }
    }
    if (from === BlockId.crop && to !== BlockId.crop) {
      // 플레이어·몬스터가 부순 작물. 씨앗은 돌아오지 않는다
      this.planted.delete(posKey({ x: pos.x, y: pos.y - 1, z: pos.z }));
    }
  }

  /** 청크를 훑어 farmland 칸을 모은다(로드·초기화 때만 허용되는 전역 스캔, MVP_SPEC 32.3). */
  private rescan(): void {
    this.farmland.clear();
    const v = this.deps.voxels;
    for (const c of v.allChunkCoords()) {
      const chunk = v.getChunk(c.cx, c.cy, c.cz);
      if (!chunk) continue;
      const b = chunk.blocks;
      for (let i = 0; i < b.length; i++) {
        if (b[i] !== BlockId.farmland) continue;
        const p = {
          x: c.cx * 16 + (i & 15),
          y: c.cy * 16 + (i >> 8),
          z: c.cz * 16 + ((i >> 4) & 15),
        };
        this.farmland.set(posKey(p), p);
      }
    }
  }

  /** 조건을 만족하는 칸 중 from 에 가장 가까운 칸과 그 작업 칸. 예약된 칸·작업 칸 없는 칸은 뺀다. */
  private nearest(
    from: BlockPos,
    npcId: string,
    ok: (key: string, p: BlockPos) => boolean,
  ): { target: BlockPos; approachCells: BlockPos[] } | null {
    let best: { target: BlockPos; approachCells: BlockPos[]; d: number } | null = null;
    for (const [k, p] of this.farmland) {
      const owner = this.claims.get(k);
      if (owner !== undefined && owner !== npcId) continue;
      if (!ok(k, p)) continue;
      const d = manhattan(from, p);
      if (best && d >= best.d) continue;
      const approachCells = this.approachCells(p);
      if (approachCells.length === 0) continue;
      best = { target: p, approachCells, d };
    }
    return best ? { target: best.target, approachCells: best.approachCells } : null;
  }

  /**
   * 작업 칸: crop 칸(farmland 위)의 수평 이웃 중 NPC 가 설 수 있는 칸. farmland 위가 아닌 칸을 앞에 둔다 (MVP_SPEC 15.4).
   */
  approachCells(target: BlockPos): BlockPos[] {
    const y = target.y + 1;
    const off: BlockPos[] = [];
    const on: BlockPos[] = [];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const c = { x: target.x + dx, y, z: target.z + dz };
      if (!this.deps.nav.isStandable(c, 'npc')) continue;
      if (this.deps.voxels.getBlock(c.x, c.y - 1, c.z) === BlockId.farmland) on.push(c);
      else off.push(c);
    }
    return off.length > 0 ? off : on;
  }

  /** 빈 farmland 인가: 위 칸이 air 다. */
  private plantable(p: BlockPos): boolean {
    return (
      this.deps.voxels.getBlock(p.x, p.y, p.z) === BlockId.farmland &&
      this.deps.voxels.getBlock(p.x, p.y + 1, p.z) === BlockId.air
    );
  }

  /** farmland 위에 crop 이 있는가. */
  private cropAt(p: BlockPos): boolean {
    return this.deps.voxels.getBlock(p.x, p.y + 1, p.z) === BlockId.crop;
  }

  /** 심은 뒤 지난 게임분. */
  private elapsed(plantedAt: number): number {
    return this.deps.clock.gameMinutes - plantedAt;
  }
}

/** posKey 를 좌표로 되돌린다. */
function parseKey(k: string): BlockPos {
  const [x, y, z] = k.split(',').map(Number);
  return { x: x ?? 0, y: y ?? 0, z: z ?? 0 };
}
