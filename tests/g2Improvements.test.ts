// TASK-033 G2 개선 (ADR 026): 침대·문 렌더 모형 분리, 천장 걷어 내기.
import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BLOCKS, BlockId, getBlockDef } from '../src/game/data/blocks';
import { cameraBoomDistance, ceilingCutFor, isCut } from '../src/game/systems/aim';
import { createPlayer } from '../src/game/systems/PlayerMovementSystem';
import { greedyMesh, PADDED_VOLUME, paddedIndex } from '../src/workers/greedyMesh';
import { navFixture, FEET_Y } from './helpers/navWorld';

describe('침대·문은 청크 메시 대신 렌더 모형이다', () => {
  it('prop 은 door / bed / crop 뿐이고 게임 규칙 필드는 그대로다', () => {
    expect(
      BLOCKS.filter((b) => b.prop)
        .map((b) => b.name)
        .sort(),
    ).toEqual(['bed', 'crop', 'door']);
    expect(getBlockDef(BlockId.bed).solid).toBe(true);
    expect(getBlockDef(BlockId.door).solid).toBe(false);
  });

  it('greedyMesh 는 prop 블록의 면을 만들지 않고, 그 아래 바닥 윗면을 가리지 않는다', () => {
    const p = new Uint16Array(PADDED_VOLUME);
    p[paddedIndex(6, 5, 6)] = BlockId.stone; // 바닥
    p[paddedIndex(6, 6, 6)] = BlockId.bed; // 그 위 침대
    const withBed = greedyMesh(p, BLOCKS, { greedy: false });
    p[paddedIndex(6, 6, 6)] = 0;
    const alone = greedyMesh(p, BLOCKS, { greedy: false });
    expect(withBed.stats).toEqual(alone.stats); // 돌 6 면만
    expect(withBed.stats.visibleFaces).toBe(6);
  });
});

describe('천장 걷어 내기 (MVP_SPEC 9.3)', () => {
  it('머리 위에 블록이 없으면 null, 있으면 가장 낮은 천장 y 로 범위를 만든다', () => {
    const f = navFixture(24, 14);
    const player = createPlayer({ x: 10, y: FEET_Y, z: 10 });
    player.body.onGround = true;
    expect(ceilingCutFor(f.world, player)).toBeNull();
    f.put(10, FEET_Y + 5, 10, BlockId.plank);
    f.put(10, FEET_Y + 3, 10, BlockId.plank);
    const cut = ceilingCutFor(f.world, player);
    expect(cut?.y).toBe(FEET_Y + 3);
    expect(cut?.radius).toBe(balance.player.ceilingCutRadius);
    if (!cut) return;
    expect(isCut(cut, 12, FEET_Y + 3, 10)).toBe(true);
    expect(isCut(cut, 12, FEET_Y + 2, 10)).toBe(false); // 천장 아래(벽)는 남는다
    expect(isCut(cut, 10 + balance.player.ceilingCutRadius + 2, FEET_Y + 3, 10)).toBe(false);
  });

  it('천장이 걷히면 카메라 거리가 천장에 막히지 않는다', () => {
    const f = navFixture(24, 14);
    const player = createPlayer({ x: 10, y: FEET_Y, z: 10 });
    player.pitch = -1.2; // 내려다보면 카메라가 위로 간다
    for (let x = 4; x <= 16; x++)
      for (let z = 4; z <= 16; z++) f.put(x, FEET_Y + 3, z, BlockId.plank);
    const cut = ceilingCutFor(f.world, player);
    expect(cut).not.toBeNull();
    const blocked = cameraBoomDistance(f.world, player);
    const open = cameraBoomDistance(f.world, player, cut);
    expect(blocked).toBeLessThan(balance.player.cameraDistance);
    expect(open).toBe(balance.player.cameraDistance);
    // 블록 자체는 그대로다
    expect(f.world.getBlock(10, FEET_Y + 3, 10)).toBe(BlockId.plank);
  });
});

describe('잎은 안쪽 면도 그린다 (HR 기타 의견 2)', () => {
  it('맞닿은 두 잎은 12 면, 맞닿은 두 물은 10 면이다', () => {
    const pair = (id: number): number => {
      const p = new Uint16Array(PADDED_VOLUME);
      p[paddedIndex(6, 6, 6)] = id;
      p[paddedIndex(7, 6, 6)] = id;
      return greedyMesh(p, BLOCKS, { greedy: false }).stats.visibleFaces;
    };
    expect(pair(BlockId.leaves)).toBe(12);
    expect(pair(BlockId.water)).toBe(10);
    expect(pair(BlockId.window)).toBe(10);
    expect(pair(BlockId.stone)).toBe(10);
  });
});
