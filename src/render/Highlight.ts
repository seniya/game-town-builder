// 조준 블록 테두리 (TASK-012). 게임 상태는 읽기만 한다. 다중 칸 객체는 전체 점유 칸을 감싼다.
import * as THREE from 'three';
import type { PlacementQuery } from '../game/voxel/VoxelWorld';
import { objectCells } from '../game/voxel/PlacementIndex';
import type { BlockPos } from '../game/types';
import { createHighlightMaterial } from './materials';

/** 테두리가 블록 면과 겹쳐 깜빡이지 않도록 조금 키운다. */
const GROW = 0.004;

/** 조준 대상 블록을 감싸는 선 상자. */
export class Highlight {
  readonly object3d: THREE.LineSegments;

  /** 단위 상자 모서리 선을 만든다. */
  constructor() {
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.object3d = new THREE.LineSegments(edges, createHighlightMaterial());
    this.object3d.visible = false;
  }

  /** target 칸(없으면 숨김)을 감싼다. 다중 칸 객체면 모든 점유 칸의 경계 상자다. */
  show(target: BlockPos | null, placements: PlacementQuery): void {
    if (!target) {
      this.object3d.visible = false;
      return;
    }
    const object = placements.objectAt(target);
    const cells = object ? objectCells(object) : [target];
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const c of cells) {
      min.x = Math.min(min.x, c.x);
      min.y = Math.min(min.y, c.y);
      min.z = Math.min(min.z, c.z);
      max.x = Math.max(max.x, c.x + 1);
      max.y = Math.max(max.y, c.y + 1);
      max.z = Math.max(max.z, c.z + 1);
    }
    this.object3d.position.set((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
    this.object3d.scale.set(max.x - min.x + GROW, max.y - min.y + GROW, max.z - min.z + GROW);
    this.object3d.visible = true;
  }
}
