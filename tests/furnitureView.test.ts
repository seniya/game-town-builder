import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BLOCKS, BlockId } from '../src/game/data/blocks';
import { EventBus } from '../src/game/EventBus';
import { VoxelWorld } from '../src/game/voxel/VoxelWorld';
import { BLOCK_MODEL, FURNITURE_BLOCKS, modelGeometry } from '../src/render/furnitureModels';
import { chairTurns, FurnitureView } from '../src/render/FurnitureView';

/** 뷰 안의 인스턴스 메시 목록. */
function instanced(view: FurnitureView): THREE.InstancedMesh[] {
  const out: THREE.InstancedMesh[] = [];
  view.object3d.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) out.push(o);
  });
  return out;
}

describe('가구·소품 모형 (STYLE-003, MVP_SPEC 45.6)', () => {
  it('모형을 그리는 블록은 모두 prop 이고 모형 지오메트리를 갖는다', () => {
    for (const id of BLOCK_MODEL.keys()) {
      expect(BLOCKS[id]?.prop).toBe(true);
      const name = BLOCK_MODEL.get(id);
      if (!name) throw new Error('모형 없음');
      const g = modelGeometry(name);
      expect(g.body.getAttribute('unlit')).toBeDefined();
      expect(g.body.getAttribute('color')).toBeDefined();
      expect(g.outline.getAttribute('position').count).toBeLessThanOrEqual(
        g.body.getAttribute('position').count,
      );
    }
  });

  it('횃불 불꽃은 스스로 빛나고(unlit 2) 외곽선이 없다', () => {
    const g = modelGeometry('torch');
    const unlit = g.body.getAttribute('unlit');
    let glow = 0;
    for (let i = 0; i < unlit.count; i++) if (unlit.getX(i) >= 2) glow++;
    expect(glow).toBeGreaterThan(0);
    expect(g.outline.getAttribute('position').count).toBe(unlit.count - glow);
  });

  it('종류마다 인스턴스 메시 둘이라 가구 수와 드로우콜이 무관하다', () => {
    const events = new EventBus();
    const world = new VoxelWorld({ sizeX: 64, sizeY: 8, sizeZ: 64 }, events);
    for (let i = 0; i < 40; i++) world.writeInitial(i, 1, 3, BlockId.table);
    for (let i = 0; i < 40; i++) world.writeInitial(i, 1, 4, BlockId.chair);
    const view = new FurnitureView(world, events);
    view.update();
    const meshes = instanced(view);
    expect(meshes).toHaveLength(FURNITURE_BLOCKS.length * 2);
    const drawn = meshes.filter((m) => m.count > 0);
    expect(drawn).toHaveLength(4);
    expect(drawn.every((m) => m.count === 40)).toBe(true);
    expect(view.count).toBe(80);
  });

  it('의자 등받이는 맞닿은 식탁의 반대쪽이다(메셔의 이전 규칙과 같다)', () => {
    const at = (tx: number, tz: number) => ({
      getBlock: (x: number, _y: number, z: number) =>
        x === 5 + tx && z === 5 + tz ? BlockId.table : 0,
    });
    expect(chairTurns(at(0, 1), 5, 1, 5)).toBe(0);
    expect(chairTurns(at(-1, 0), 5, 1, 5)).toBe(1);
    expect(chairTurns(at(0, -1), 5, 1, 5)).toBe(2);
    expect(chairTurns(at(1, 0), 5, 1, 5)).toBe(3);
    expect(chairTurns({ getBlock: () => 0 }, 5, 1, 5)).toBe(0);
  });
});
