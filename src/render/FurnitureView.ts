// 한 칸 가구·소품 모형 (STYLE-003, MVP_SPEC 45.6). 식탁·의자·상자·화덕·물 항아리·종·횃불은 청크 메시에서 빠지고(blocks.prop)
// 여기서 둥근 모형으로 그린다. 종류마다 InstancedMesh 하나 + 외곽선 하나라 가구 수와 드로우콜이 무관하다.
// 게임 상태는 읽기만 한다. 칸 목록은 처음에 한 번 훑고 이후에는 블록 변경 이벤트로만 고친다(TorchIndex 와 같은 방식).
import * as THREE from 'three';
import { BlockId } from '../game/data/blocks';
import type { EventBus } from '../game/EventBus';
import type { VoxelWorld } from '../game/voxel/VoxelWorld';
import { BLOCK_MODEL, FURNITURE_BLOCKS, modelGeometry } from './furnitureModels';
import { createModelToonMaterial, createOutlineMaterial, createToonGradient } from './materials';

/** 인스턴스 버퍼의 처음 크기. 넘치면 두 배로 늘린다. */
const INITIAL_CAPACITY = 32;

/** 한 칸. */
interface Cell {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 블록 조회(의자 방향을 정할 때 이웃 식탁을 본다). */
export interface FurnitureWorld {
  getBlock(x: number, y: number, z: number): number;
}

/**
 * 의자 등받이 방향(ADR 028 보완 2, 메셔의 규칙과 같다): 맞닿은 식탁의 반대쪽에 등받이를 둔다.
 * 식탁이 남(+z) 0 / 서(−x) 1 / 북(−z) 2 / 동(+x) 3 번 ¼ 회전. 식탁이 없으면 0(등받이 북쪽).
 * ¼ 회전 한 번은 북쪽(−z)의 등받이를 동쪽(+x)으로 보낸다(y 축 −90°).
 */
export function chairTurns(world: FurnitureWorld, x: number, y: number, z: number): number {
  const T = BlockId.table;
  if (world.getBlock(x, y, z + 1) === T) return 0;
  if (world.getBlock(x - 1, y, z) === T) return 1;
  if (world.getBlock(x, y, z - 1) === T) return 2;
  if (world.getBlock(x + 1, y, z) === T) return 3;
  return 0;
}

/** 종류 하나의 인스턴스 메시 둘. */
class Batch {
  body: THREE.InstancedMesh;
  outline: THREE.InstancedMesh;
  capacity = INITIAL_CAPACITY;

  /** 모형 지오메트리·재질로 빈 배치를 만든다. */
  constructor(
    private readonly group: THREE.Group,
    private readonly blockId: number,
    private readonly toon: THREE.Material,
    private readonly line: THREE.Material,
  ) {
    [this.body, this.outline] = this.create(this.capacity);
  }

  /** 인스턴스 수를 맞춘다. 모자라면 두 배 크기로 다시 만든다. */
  ensure(count: number): void {
    if (count <= this.capacity) return;
    while (this.capacity < count) this.capacity *= 2;
    for (const m of [this.body, this.outline]) {
      this.group.remove(m);
      m.dispose();
    }
    [this.body, this.outline] = this.create(this.capacity);
  }

  /** 인스턴스 메시 한 쌍. */
  private create(capacity: number): [THREE.InstancedMesh, THREE.InstancedMesh] {
    const name = BLOCK_MODEL.get(this.blockId);
    if (!name) throw new Error(`모형이 없는 블록: ${this.blockId}`);
    const g = modelGeometry(name);
    const body = new THREE.InstancedMesh(g.body, this.toon, capacity);
    const outline = new THREE.InstancedMesh(g.outline, this.line, capacity);
    body.castShadow = true;
    body.receiveShadow = true;
    for (const m of [body, outline]) {
      m.count = 0;
      // 인스턴스가 섬 곳곳에 흩어져 있어 모형 하나의 경계 구로는 컬링할 수 없다
      m.frustumCulled = false;
      this.group.add(m);
    }
    return [body, outline];
  }
}

/** 배치된 한 칸 가구를 그린다. */
export class FurnitureView {
  readonly object3d = new THREE.Group();
  private readonly cells = new Map<string, Cell>();
  private readonly batches = new Map<number, Batch>();
  private dirty = true;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);

  /** 월드를 훑어 가구 칸을 모으고 블록 변경을 구독한다. */
  constructor(
    private readonly world: VoxelWorld,
    events: EventBus,
  ) {
    const toon = createModelToonMaterial(createToonGradient(3));
    const line = createOutlineMaterial(0x3b2b25, 0.012);
    for (const id of FURNITURE_BLOCKS)
      this.batches.set(id, new Batch(this.object3d, id, toon, line));
    const wanted = new Set<number>(FURNITURE_BLOCKS);
    for (const coord of world.allChunkCoords()) {
      const chunk = world.getChunk(coord.cx, coord.cy, coord.cz);
      if (!chunk) continue;
      const blocks = chunk.blocks;
      for (let i = 0; i < blocks.length; i++) {
        const id = blocks[i] ?? 0;
        if (!wanted.has(id)) continue;
        const x = coord.cx * 16 + (i & 15);
        const z = coord.cz * 16 + ((i >> 4) & 15);
        const y = coord.cy * 16 + (i >> 8);
        this.cells.set(`${x},${y},${z}`, { id, x, y, z });
      }
    }
    events.on('BLOCK_CHANGED', (c) => {
      const key = `${c.pos.x},${c.pos.y},${c.pos.z}`;
      if (wanted.has(c.to)) this.cells.set(key, { id: c.to, x: c.pos.x, y: c.pos.y, z: c.pos.z });
      else this.cells.delete(key);
      // 식탁이 놓이거나 치워지면 이웃 의자의 방향이 바뀔 수 있다
      if (wanted.has(c.to) || wanted.has(c.from)) this.dirty = true;
    });
  }

  /** 가구 칸 수(계측). */
  get count(): number {
    return this.cells.size;
  }

  /** 매 프레임 부른다. 목록이 바뀐 프레임에만 인스턴스 행렬을 다시 쓴다. */
  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const byId = new Map<number, Cell[]>();
    for (const c of this.cells.values()) {
      const list = byId.get(c.id) ?? [];
      list.push(c);
      byId.set(c.id, list);
    }
    for (const [id, batch] of this.batches) {
      const list = byId.get(id) ?? [];
      batch.ensure(list.length);
      list.forEach((c, i) => {
        const turns = id === BlockId.chair ? chairTurns(this.world, c.x, c.y, c.z) : 0;
        this.q.setFromAxisAngle(this.up, (-turns * Math.PI) / 2);
        this.m.compose(
          new THREE.Vector3(c.x + 0.5, c.y, c.z + 0.5),
          this.q,
          new THREE.Vector3(1, 1, 1),
        );
        batch.body.setMatrixAt(i, this.m);
        batch.outline.setMatrixAt(i, this.m);
      });
      for (const mesh of [batch.body, batch.outline]) {
        mesh.count = list.length;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}
