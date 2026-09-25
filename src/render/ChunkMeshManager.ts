// 청크 메시 큐와 GPU 업로드 예산 (ARCHITECTURE 9.1). GameWorld.update 이후, render 이전에 update 를 호출한다.
import * as THREE from 'three';
import { Chunk } from '../game/voxel/Chunk';
import type { VoxelWorld } from '../game/voxel/VoxelWorld';
import { chunkKey, type MeshBuffers, type MeshRequest, type MeshResult } from '../game/types';
import MesherWorker from '../workers/mesher.worker.ts?worker';
import { MeshJobQueue } from './MeshJobQueue';

/** 한 청크의 GPU 메시 두 개(불투명 / 반투명). */
interface ChunkMeshes {
  opaque: THREE.Mesh | null;
  transparent: THREE.Mesh | null;
}

/** 이번 프레임 계측값. F3 패널(TASK-016)과 브라우저 검증에서 읽는다. */
export interface ChunkMeshStats {
  totalChunks: number;
  meshedChunks: number;
  pending: number;
  inFlight: number;
  uploadsThisFrame: number;
  discardedResults: number;
}

/** Worker 풀과 청크 메시의 수명을 관리한다. */
export class ChunkMeshManager {
  private readonly queue: MeshJobQueue;
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly meshes = new Map<string, ChunkMeshes>();
  private readonly group = new THREE.Group();
  readonly stats: ChunkMeshStats;

  /**
   * scene 에 청크 그룹을 붙이고 Worker 를 workerCount 개 만든다.
   * uploadsPerFrame 은 balance.performance.chunkUploadsPerFrame 이다.
   */
  constructor(
    scene: THREE.Scene,
    private readonly world: VoxelWorld,
    workerCount: number,
    private readonly uploadsPerFrame: number,
    private readonly opaqueMaterial: THREE.Material,
    private readonly transparentMaterial: THREE.Material,
    /** 불투명 메시의 그림자 깊이 재질(천장 걷어 내기를 따른다, ADR 046). 없으면 three 기본 */
    private readonly depthMaterial: THREE.Material | null = null,
  ) {
    this.queue = new MeshJobQueue(world);
    this.group.name = 'chunks';
    scene.add(this.group);
    for (let i = 0; i < Math.max(1, workerCount); i++) {
      const worker = new MesherWorker();
      worker.onmessage = (event: MessageEvent<MeshResult>) => {
        this.queue.receive(event.data);
        this.idle.push(worker);
      };
      this.workers.push(worker);
      this.idle.push(worker);
    }
    this.stats = {
      totalChunks: world.chunksX * world.chunksY * world.chunksZ,
      meshedChunks: 0,
      pending: 0,
      inFlight: 0,
      uploadsThisFrame: 0,
      discardedResults: 0,
    };
  }

  /** 대기·진행·업로드가 모두 끝났는가. 초기 메싱 완료 확인용이다. */
  get settled(): boolean {
    return this.queue.idle;
  }

  /** 드로우콜 수에 해당하는 메시 수. */
  get meshCount(): number {
    let n = 0;
    for (const m of this.meshes.values()) n += (m.opaque ? 1 : 0) + (m.transparent ? 1 : 0);
    return n;
  }

  /** 카메라 절두체 안의 메시 청크 수 (PERF-001 계측). 불투명·반투명 중 하나라도 보이면 한 청크로 센다. */
  countVisible(frustum: THREE.Frustum): number {
    let n = 0;
    for (const m of this.meshes.values()) {
      const meshes = [m.opaque, m.transparent].filter((x): x is THREE.Mesh => x !== null);
      if (meshes.some((x) => frustum.intersectsObject(x))) n += 1;
    }
    return n;
  }

  /**
   * 1 dirty 청크를 큐에 넣는다 2 유휴 Worker 에 하나씩 보낸다
   * 3 완료 결과를 최대 uploadsPerFrame 개 GPU 에 올린다 4 나머지는 다음 프레임으로 미룬다
   */
  update(): void {
    this.queue.enqueue(this.world.takeDirtyChunks());
    for (const job of this.queue.takeJobs(this.idle.length)) {
      const worker = this.idle.pop();
      if (!worker) break;
      const padded = this.world.copyPadded(job.coord);
      const request: MeshRequest = { coord: job.coord, revision: job.revision, padded };
      worker.postMessage(request, [padded.buffer]);
    }
    const uploads = this.queue.takeUploads(this.uploadsPerFrame);
    for (const result of uploads) this.upload(result);
    this.stats.pending = this.queue.pendingCount;
    this.stats.inFlight = this.queue.inFlightCount;
    this.stats.uploadsThisFrame = uploads.length;
    this.stats.discardedResults = this.queue.discarded;
    this.stats.meshedChunks = this.meshes.size;
  }

  /** Worker 를 종료하고 GPU 자원을 해제한다. */
  dispose(): void {
    for (const w of this.workers) w.terminate();
    for (const m of this.meshes.values()) {
      m.opaque?.geometry.dispose();
      m.transparent?.geometry.dispose();
    }
    this.meshes.clear();
    this.group.removeFromParent();
  }

  /** 결과 하나를 GPU 에 올리고 이전 메시를 해제한다. */
  private upload(result: MeshResult): void {
    const key = chunkKey(result.coord);
    let entry = this.meshes.get(key);
    if (!entry) {
      entry = { opaque: null, transparent: null };
      this.meshes.set(key, entry);
    }
    const origin = new THREE.Vector3(
      result.coord.cx * Chunk.SIZE,
      result.coord.cy * Chunk.SIZE,
      result.coord.cz * Chunk.SIZE,
    );
    entry.opaque = this.replace(entry.opaque, result.opaque, this.opaqueMaterial, origin, 0);
    entry.transparent = this.replace(
      entry.transparent,
      result.transparent,
      this.transparentMaterial,
      origin,
      1,
    );
  }

  /** 기존 메시를 새 버퍼로 교체한다. 버퍼가 비었으면 메시를 제거하고 null 을 반환한다. */
  private replace(
    old: THREE.Mesh | null,
    buffers: MeshBuffers | null,
    material: THREE.Material,
    origin: THREE.Vector3,
    renderOrder: number,
  ): THREE.Mesh | null {
    if (old) {
      old.geometry.dispose();
      old.removeFromParent();
    }
    if (!buffers || buffers.indices.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(buffers.normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(buffers.uvs, 2));
    geometry.setAttribute('ao', new THREE.BufferAttribute(buffers.ao, 1));
    geometry.setAttribute('tile', new THREE.BufferAttribute(buffers.tiles, 1));
    geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
    geometry.boundingBox = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(Chunk.SIZE, Chunk.SIZE, Chunk.SIZE),
    );
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(Chunk.SIZE / 2, Chunk.SIZE / 2, Chunk.SIZE / 2),
      (Chunk.SIZE * Math.sqrt(3)) / 2,
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(origin);
    mesh.renderOrder = renderOrder;
    // 불투명 블록은 해 그림자를 던지고 받는다. 반투명(물·창문)은 받기만 한다 (MVP_SPEC 45.3)
    const opaque = material === this.opaqueMaterial;
    mesh.castShadow = opaque;
    mesh.receiveShadow = true;
    if (opaque && this.depthMaterial) mesh.customDepthMaterial = this.depthMaterial;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.group.add(mesh);
    return mesh;
  }
}
