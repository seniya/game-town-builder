import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { EventBus } from '../src/game/EventBus';
import { VoxelWorld } from '../src/game/voxel/VoxelWorld';
import { lightAt, TorchIndex } from '../src/render/DayNightVisual';

/** 색의 밝기(선형). */
function luma(c: THREE.Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** 해·반사광을 합친 대략의 장면 밝기. */
function brightness(minute: number): number {
  const s = lightAt(minute);
  return luma(s.sun) * s.sunIntensity + luma(s.hemiSky) * s.hemiIntensity;
}

describe('낮과 밤 (TASK-034)', () => {
  it('시간에 따라 하늘색이 바뀐다', () => {
    const noon = lightAt(12 * 60).sky.getHex();
    const dusk = lightAt(18.4 * 60).sky.getHex();
    const night = lightAt(23 * 60).sky.getHex();
    expect(new Set([noon, dusk, night]).size).toBe(3);
  });

  it('밤에 어두워진다', () => {
    expect(brightness(23 * 60)).toBeLessThan(brightness(12 * 60) * 0.4);
    expect(lightAt(23 * 60).night).toBe(1);
    expect(lightAt(12 * 60).night).toBe(0);
  });

  it('전이가 갑자기 튀지 않고 보간된다(1 게임분마다의 변화가 작다, 자정도 이어진다)', () => {
    let worst = 0;
    for (let m = 0; m <= 1440; m++) {
      const a = lightAt(m);
      const b = lightAt(m + 1);
      const d =
        Math.abs(luma(a.sky) - luma(b.sky)) +
        Math.abs(a.sunIntensity - b.sunIntensity) +
        Math.abs(a.hemiIntensity - b.hemiIntensity) +
        a.sunDirection.distanceTo(b.sunDirection) * 0.2;
      worst = Math.max(worst, d);
    }
    expect(worst).toBeLessThan(0.02);
    expect(lightAt(0).sky.getHex()).toBe(lightAt(1440).sky.getHex());
  });

  it('광원이 16 개를 넘지 않고 가까운 것부터 고른다', () => {
    const events = new EventBus();
    const world = new VoxelWorld({ sizeX: 64, sizeY: 8, sizeZ: 16 }, events);
    for (let x = 0; x < 20; x++) world.writeInitial(x * 3, 1, 1, BlockId.torch);
    const index = new TorchIndex(world, events);
    expect(index.size).toBe(20);
    const near = index.nearest(new THREE.Vector3(0, 1, 1), balance.performance.maxPointLights);
    expect(near).toHaveLength(16);
    for (let i = 1; i < near.length; i++) {
      expect((near[i] as THREE.Vector3).x).toBeGreaterThan((near[i - 1] as THREE.Vector3).x);
    }
    // 놓고 부수면 목록이 따라온다(자동으로 켜거나 더하지 않는다)
    world.setBlock(5, 1, 5, BlockId.torch, 'player');
    expect(index.size).toBe(21);
    world.setBlock(0, 1, 1, BlockId.air, 'player');
    expect(index.size).toBe(20);
  });
});
