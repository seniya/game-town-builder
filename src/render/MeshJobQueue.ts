// 청크 메싱 작업의 대기·진행·업로드 순서 관리 (ARCHITECTURE 9.1 ~ 9.2).
// three 를 쓰지 않는 순수 로직이다. ChunkMeshManager 가 Worker·GPU 업로드와 연결한다.
import { chunkKey, type ChunkCoord, type MeshResult } from '../game/types';

/** revision 을 조회하는 포트. VoxelWorld.getRevision 이 이를 만족한다. */
export interface RevisionSource {
  getRevision(coord: ChunkCoord): number;
}

/** 요청으로 보낼 작업 하나. */
export interface MeshJob {
  readonly coord: ChunkCoord;
  readonly revision: number;
}

/**
 * 규칙
 * - 청크마다 진행 중 작업은 최대 하나다. 진행 중에 다시 dirty 가 되면 대기열에 남겨 끝난 뒤 다시 보낸다.
 * - 결과의 revision 이 현재 revision 과 다르면 버린다. 오래된 결과는 대기 상태를 해제하지 않는다.
 * - 업로드 직전에도 revision 을 다시 확인한다.
 * - revision 이 오를 때마다 VoxelWorld 가 청크를 dirty 로 표시하므로, 버린 결과의 청크는
 *   takeDirtyChunks 를 통해 반드시 다시 들어온다. 여기서 따로 재등록하지 않는다.
 */
export class MeshJobQueue {
  /** 메싱이 필요한 청크. 삽입 순서가 처리 순서다. */
  private readonly pending = new Map<string, ChunkCoord>();
  /** Worker 에 보낸 청크 → 보낸 revision. */
  private readonly inFlight = new Map<string, number>();
  /** 업로드를 기다리는 최신 결과. 청크당 하나. */
  private readonly ready = new Map<string, MeshResult>();
  /** 버린 결과 수. 계측용이다. */
  discarded = 0;

  /** revision 조회 포트를 받는다. */
  constructor(private readonly revisions: RevisionSource) {}

  /** dirty 청크를 대기열에 넣는다. 이미 있으면 순서를 유지한다. */
  enqueue(coords: readonly ChunkCoord[]): void {
    for (const c of coords) {
      const key = chunkKey(c);
      if (!this.pending.has(key)) this.pending.set(key, c);
    }
  }

  /** 대기 중 청크 수 (진행 중 제외). */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** 진행 중 작업 수. */
  get inFlightCount(): number {
    return this.inFlight.size;
  }

  /** 업로드 대기 결과 수. */
  get readyCount(): number {
    return this.ready.size;
  }

  /**
   * 최대 max 개의 작업을 꺼낸다. 진행 중인 청크는 건너뛰고 대기열에 남긴다.
   * 꺼낸 작업은 현재 revision 으로 진행 중 표시된다.
   */
  takeJobs(max: number): MeshJob[] {
    const jobs: MeshJob[] = [];
    for (const [key, coord] of this.pending) {
      if (jobs.length >= max) break;
      if (this.inFlight.has(key)) continue;
      const revision = this.revisions.getRevision(coord);
      this.pending.delete(key);
      this.inFlight.set(key, revision);
      jobs.push({ coord, revision });
    }
    return jobs;
  }

  /** Worker 결과를 받는다. 최신이 아니면 버린다. */
  receive(result: MeshResult): void {
    const key = chunkKey(result.coord);
    if (this.inFlight.get(key) === result.revision) this.inFlight.delete(key);
    if (result.revision !== this.revisions.getRevision(result.coord)) {
      this.discarded += 1;
      return;
    }
    this.ready.set(key, result);
  }

  /** 업로드할 결과를 최대 max 개 꺼낸다. 그 사이 revision 이 바뀐 결과는 버린다. */
  takeUploads(max: number): MeshResult[] {
    const out: MeshResult[] = [];
    for (const [key, result] of this.ready) {
      if (out.length >= max) break;
      this.ready.delete(key);
      if (result.revision !== this.revisions.getRevision(result.coord)) {
        this.discarded += 1;
        continue;
      }
      out.push(result);
    }
    return out;
  }

  /** 대기·진행·업로드 대기가 모두 비었는가. */
  get idle(): boolean {
    return this.pending.size === 0 && this.inFlight.size === 0 && this.ready.size === 0;
  }
}
