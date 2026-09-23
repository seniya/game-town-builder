// 메싱 Worker. 메시지 배선만 한다. 알고리즘은 greedyMesh.ts 에 있다 (MVP_SPEC 33.2).
import { BLOCKS } from '../game/data/blocks';
import type { MeshBuffers, MeshRequest, MeshResult } from '../game/types';
import { greedyMesh } from './greedyMesh';

/** Worker 전역의 최소 형태. lib.webworker 와 lib.dom 을 함께 쓰므로 필요한 부분만 선언한다. */
interface WorkerScope {
  onmessage: ((event: MessageEvent<MeshRequest>) => void) | null;
  postMessage(message: MeshResult, transfer: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

/** 버퍼의 ArrayBuffer 목록. 결과를 복사 없이 넘긴다. */
function transferables(b: MeshBuffers | null): ArrayBuffer[] {
  if (!b) return [];
  return [b.positions, b.normals, b.uvs, b.ao, b.tiles, b.indices].map(
    (a) => a.buffer as ArrayBuffer,
  );
}

scope.onmessage = (event) => {
  const { coord, revision, padded } = event.data;
  const mesh = greedyMesh(padded, BLOCKS);
  const result: MeshResult = { coord, revision, ...mesh };
  scope.postMessage(result, [...transferables(mesh.opaque), ...transferables(mesh.transparent)]);
};
