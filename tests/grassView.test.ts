import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/game/data/blocks';
import { EventBus } from '../src/game/EventBus';
import { VoxelWorld } from '../src/game/voxel/VoxelWorld';
import { glowScaleAt } from '../src/render/DayNightVisual';
import { GRASS_RADIUS, GrassView, grassCellsInChunk, tuftCount } from '../src/render/GrassView';
import { createVoxelLighting } from '../src/render/materials';

/** 풀밭 한 층(y = 1)이 깔린 월드. */
function meadow(size = 96): VoxelWorld {
  const world = new VoxelWorld({ sizeX: size, sizeY: 16, sizeZ: size }, new EventBus());
  for (let x = 0; x < size; x++)
    for (let z = 0; z < size; z++) world.writeInitial(x, 1, z, BlockId.grass);
  return world;
}

describe('다듬기 1 차 (STYLE-008, MVP_SPEC 45.8)', () => {
  it('포기 수는 칸 좌표로 결정되고 평균이 1.2~1.9 이다', () => {
    let sum = 0;
    for (let x = 0; x < 100; x++) for (let z = 0; z < 100; z++) sum += tuftCount(x, z);
    expect(sum / 10000).toBeGreaterThan(1.2);
    expect(sum / 10000).toBeLessThan(1.9);
    expect(tuftCount(12, 34)).toBe(tuftCount(12, 34));
  });

  it('풀 블록 윗면이 비어 있을 때만 포기 자리가 된다', () => {
    const world = meadow(16);
    world.writeInitial(3, 2, 3, BlockId.plank);
    world.writeInitial(4, 2, 4, BlockId.table);
    const chunk = world.getChunk(0, 0, 0);
    if (!chunk) throw new Error('청크 없음');
    const cells = grassCellsInChunk(world, { cx: 0, cy: 0, cz: 0 }, chunk.blocks);
    expect(cells.length / 3).toBe(16 * 16 - 2);
    for (let i = 0; i < cells.length; i += 3) expect(cells[i + 1]).toBe(2);
  });

  it('카메라 반경 밖은 그리지 않고, 블록이 바뀐 청크만 다시 모은다', () => {
    const world = meadow();
    const view = new GrassView(world, createVoxelLighting().time);
    const cam = new THREE.Vector3(48, 10, 48);
    view.update(cam);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < view.count; i++) {
      view.mesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      expect(Math.hypot(p.x - cam.x, p.z - cam.z)).toBeLessThanOrEqual(GRASS_RADIUS + 1);
    }
    expect(view.count).toBeGreaterThan(1000);
    const scans = view.scans;
    view.update(cam);
    expect(view.scans).toBe(scans);
    world.setBlock(40, 2, 40, BlockId.plank, 'player');
    view.update(cam);
    // 바뀐 칸의 청크(와 그 아래 청크가 있다면)만 다시 모은다
    expect(view.scans - scans).toBeLessThanOrEqual(2);
    expect(view.scans - scans).toBeGreaterThanOrEqual(1);
  });

  it('불꽃 밝기 배율은 낮 1.6 에서 밤 3 이다', () => {
    expect(glowScaleAt(0)).toBeCloseTo(1.6);
    expect(glowScaleAt(1)).toBeCloseTo(3);
    expect(glowScaleAt(0.5)).toBeGreaterThan(glowScaleAt(0));
  });
});
