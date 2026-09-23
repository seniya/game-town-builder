import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/game/data/blocks';
import { EventBus, type GameEventMap } from '../src/game/EventBus';
import { BlockEditSystem, facingFromLook } from '../src/game/systems/BlockEditSystem';
import { EMPTY_INPUT_FRAME, type InputFrame } from '../src/game/systems/InputSystem';
import { blockItem, INVENTORY_SLOTS, InventorySystem } from '../src/game/systems/InventorySystem';
import { createPlayer, PlayerMovementSystem } from '../src/game/systems/PlayerMovementSystem';
import type { AabbBody, BlockPos } from '../src/game/types';
import { VoxelWorld } from '../src/game/voxel/VoxelWorld';

/** 편집 시험 환경. 지면은 y ≤ 4 의 stone, 플레이어는 (5.5, 5, 5.5) 에서 -z 를 본다. */
function setup(opts: { random?: () => number; npcs?: AabbBody[] } = {}) {
  const events = new EventBus();
  const world = new VoxelWorld({ sizeX: 32, sizeY: 16, sizeZ: 32 }, events);
  for (let x = 0; x < 32; x++)
    for (let z = 0; z < 32; z++)
      for (let y = 0; y <= 4; y++) world.writeInitial(x, y, z, BlockId.stone);
  const input = { frame: EMPTY_INPUT_FRAME as InputFrame };
  const inventory = new InventorySystem(events, input);
  const player = createPlayer({ x: 5, y: 5, z: 5 });
  player.body.onGround = true;
  const npcs = opts.npcs ?? [];
  const edit = new BlockEditSystem(world, player, inventory, input, events, {
    occupants: () => [player.body, ...npcs],
    random: opts.random ?? (() => 0.99),
  });
  const changes: GameEventMap['BLOCK_CHANGED'][] = [];
  events.on('BLOCK_CHANGED', (p) => changes.push(p));
  return { events, world, input, inventory, player, edit, changes };
}

type Env = ReturnType<typeof setup>;

/** 핫바 선택 칸에 아이템을 넣는다. */
function hold(env: Env, blockId: number, count = 1): void {
  env.inventory.add([{ item: blockItem(blockId), count }]);
}

/** 좌클릭을 누른 채 seconds 동안 60Hz 로 update 한다. */
function holdPrimary(env: Env, seconds: number): void {
  env.input.frame = { ...EMPTY_INPUT_FRAME, primaryHeld: true };
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) env.edit.update(1 / 60);
}

/** 시선 정면(어깨점 x≈6.1, y≈6.6) z=3 칸에 블록을 둔다. */
function wallAhead(env: Env, id: number): BlockPos {
  const p = { x: 6, y: 6, z: 3 };
  env.world.setBlock(p.x, p.y, p.z, id, 'player');
  return p;
}

describe('파괴 (TASK-013, MVP_SPEC 10.2)', () => {
  it('블록마다 파괴 시간이 다르다: dirt 0.6 / stone 1.5 / stone_brick 2.0', () => {
    for (const [id, seconds] of [
      [BlockId.dirt, 0.6],
      [BlockId.stone, 1.5],
      [BlockId.stone_brick, 2.0],
    ] as const) {
      const env = setup();
      const p = wallAhead(env, id);
      holdPrimary(env, seconds - 0.05);
      expect(env.world.getBlock(p.x, p.y, p.z)).toBe(id);
      expect(env.edit.breakProgress).toBeGreaterThan(0.9);
      holdPrimary(env, 0.1);
      expect(env.world.getBlock(p.x, p.y, p.z)).toBe(BlockId.air);
      expect(env.inventory.count(blockItem(id))).toBe(1);
    }
  });

  it('파괴 중 다른 블록을 보면 진행도가 0 이 된다. 손을 떼도 0 이다', () => {
    const env = setup();
    wallAhead(env, BlockId.stone);
    env.world.setBlock(3, 6, 3, BlockId.stone, 'player');
    holdPrimary(env, 1.0);
    expect(env.edit.breakProgress).toBeGreaterThan(0.6);
    env.player.yaw = 0.8; // 왼쪽 블록을 본다
    holdPrimary(env, 1 / 60);
    expect(env.edit.breakingPos).toEqual({ x: 3, y: 6, z: 3 });
    expect(env.edit.breakProgress).toBeLessThan(0.05);
    env.input.frame = EMPTY_INPUT_FRAME;
    env.edit.update(1 / 60);
    expect(env.edit.breakProgress).toBe(0);
  });

  it('bedrock / water / bell 은 파괴되지 않는다', () => {
    for (const id of [BlockId.bedrock, BlockId.water, BlockId.bell]) {
      const env = setup();
      const p = { x: 6, y: 6, z: 3 };
      env.world.writeInitial(p.x, p.y, p.z, id);
      holdPrimary(env, 5);
      expect(env.world.getBlock(p.x, p.y, p.z)).toBe(id);
      expect(env.edit.breakAt(p)).toEqual({ ok: false, reason: 'unbreakable' });
    }
  });

  it('grass 는 dirt 를, leaves 는 25% 로 seed 를 더 떨군다. crop 은 드롭이 없다', () => {
    const lucky = setup({ random: () => 0.1 });
    lucky.world.setBlock(8, 5, 8, BlockId.leaves, 'player');
    lucky.world.setBlock(9, 5, 8, BlockId.grass, 'player');
    lucky.world.writeInitial(10, 5, 8, BlockId.crop);
    expect(lucky.edit.breakAt({ x: 8, y: 5, z: 8 }).ok).toBe(true);
    expect(lucky.edit.breakAt({ x: 9, y: 5, z: 8 }).ok).toBe(true);
    expect(lucky.edit.breakAt({ x: 10, y: 5, z: 8 }).ok).toBe(true);
    expect(lucky.inventory.count(blockItem(BlockId.leaves))).toBe(1);
    expect(lucky.inventory.count({ kind: 'material', material: 'seed' })).toBe(1);
    expect(lucky.inventory.count(blockItem(BlockId.dirt))).toBe(1);
    expect(lucky.inventory.snapshot().filter(Boolean)).toHaveLength(3);
    const unlucky = setup({ random: () => 0.25 });
    unlucky.world.setBlock(8, 5, 8, BlockId.leaves, 'player');
    unlucky.edit.breakAt({ x: 8, y: 5, z: 8 });
    expect(unlucky.inventory.count({ kind: 'material', material: 'seed' })).toBe(0);
  });

  it('드롭을 넣을 공간이 없으면 부수지 않는다', () => {
    const env = setup();
    for (let i = 0; i < INVENTORY_SLOTS; i++) hold(env, BlockId.plank, 64);
    env.world.setBlock(8, 5, 8, BlockId.dirt, 'player');
    const before = env.changes.length;
    expect(env.edit.breakAt({ x: 8, y: 5, z: 8 })).toEqual({ ok: false, reason: 'inventory-full' });
    expect(env.world.getBlock(8, 5, 8)).toBe(BlockId.dirt);
    expect(env.changes.length).toBe(before);
  });

  it('플레이어가 발밑 블록을 부수면 그대로 떨어진다 (READY-06)', () => {
    const env = setup();
    const move = new PlayerMovementSystem(env.world, env.player, env.input);
    for (let i = 0; i < 10; i++) move.update(1 / 60);
    expect(env.player.body.pos.y).toBe(5);
    env.edit.breakAt({ x: 5, y: 4, z: 5 });
    for (let i = 0; i < 60; i++) move.update(1 / 60);
    expect(env.player.body.pos.y).toBe(4);
  });
});

describe('설치 (TASK-013, MVP_SPEC 10.3 / 10.4)', () => {
  it('조준한 면 앞 칸에 놓고 아이템 1 개를 쓴다', () => {
    const env = setup();
    wallAhead(env, BlockId.stone);
    hold(env, BlockId.plank, 3);
    env.input.frame = { ...EMPTY_INPUT_FRAME, secondaryPressed: true };
    env.edit.update(1 / 60);
    expect(env.world.getBlock(6, 6, 4)).toBe(BlockId.plank);
    expect(env.inventory.selectedStack()?.count).toBe(2);
  });

  it('플레이어 AABB 와 겹치는 위치에 설치되지 않는다', () => {
    const env = setup();
    hold(env, BlockId.plank, 3);
    expect(env.edit.placeAt({ x: 5, y: 5, z: 5 }, 'north')).toEqual({
      ok: false,
      reason: 'character',
    });
    expect(env.edit.placeAt({ x: 5, y: 6, z: 5 }, 'north')).toEqual({
      ok: false,
      reason: 'character',
    });
    // 플레이어(폭 0.6)는 x 5.2~5.8 을 차지한다. 옆 칸은 괜찮다
    expect(env.edit.placeAt({ x: 6, y: 5, z: 5 }, 'north').ok).toBe(true);
    expect(env.world.getBlock(5, 5, 5)).toBe(BlockId.air);
    expect(env.inventory.selectedStack()?.count).toBe(2);
  });

  it('단일 칸에도 NPC AABB 점유 검사를 적용한다', () => {
    const npc: AabbBody = {
      pos: { x: 10.5, y: 5, z: 10.5 },
      velocity: { x: 0, y: 0, z: 0 },
      width: 0.6,
      height: 1.8,
      onGround: true,
    };
    const env = setup({ npcs: [npc] });
    hold(env, BlockId.torch, 1);
    expect(env.edit.placeAt({ x: 10, y: 6, z: 10 }, 'north')).toEqual({
      ok: false,
      reason: 'character',
    });
    expect(env.inventory.selectedStack()?.count).toBe(1);
  });

  it('bed 는 수평 2 칸을 차지하고, 두 칸이 비어 있고 아래가 고체여야 놓인다', () => {
    const env = setup();
    hold(env, BlockId.bed, 2);
    env.world.setBlock(10, 5, 9, BlockId.plank, 'player');
    // north: anchor (10,5,10), 나머지 (10,5,9) 가 막혀 있다
    expect(env.edit.placeAt({ x: 10, y: 5, z: 10 }, 'north')).toEqual({
      ok: false,
      reason: 'occupied',
    });
    // 아래가 비어 있는 칸
    env.world.setBlock(12, 4, 11, BlockId.air, 'player');
    expect(env.edit.placeAt({ x: 12, y: 5, z: 10 }, 'south')).toEqual({
      ok: false,
      reason: 'no-support',
    });
    expect(env.inventory.selectedStack()?.count).toBe(2);
    expect(env.edit.placeAt({ x: 10, y: 5, z: 10 }, 'east').ok).toBe(true);
    expect(env.world.getBlock(10, 5, 10)).toBe(BlockId.bed);
    expect(env.world.getBlock(11, 5, 10)).toBe(BlockId.bed);
    expect(env.inventory.selectedStack()?.count).toBe(1);
    const o = env.world.placements.objectAt({ x: 11, y: 5, z: 10 });
    expect(o?.facing).toBe('east');
    expect(o?.anchor).toEqual({ x: 10, y: 5, z: 10 });
  });

  it('farmland 는 아래가 고체일 때만 놓인다', () => {
    const env = setup();
    hold(env, BlockId.farmland, 2);
    env.world.setBlock(9, 4, 9, BlockId.air, 'player');
    expect(env.edit.placeAt({ x: 9, y: 4, z: 9 }, 'north').ok).toBe(true); // 아래 y=3 stone
    env.world.setBlock(12, 4, 12, BlockId.air, 'player');
    env.world.setBlock(12, 3, 12, BlockId.air, 'player');
    expect(env.edit.placeAt({ x: 12, y: 4, z: 12 }, 'north')).toEqual({
      ok: false,
      reason: 'no-support',
    });
  });

  it('torch 는 아래 또는 옆면이 고체여야 한다. 나머지 가구는 아래가 고체', () => {
    const env = setup();
    hold(env, BlockId.torch, 3);
    expect(env.edit.placeAt({ x: 9, y: 7, z: 9 }, 'north')).toEqual({
      ok: false,
      reason: 'no-support',
    });
    env.world.setBlock(10, 7, 9, BlockId.plank, 'player');
    expect(env.edit.placeAt({ x: 9, y: 7, z: 9 }, 'north').ok).toBe(true);
    const env2 = setup();
    hold(env2, BlockId.table, 1);
    env2.world.setBlock(10, 7, 9, BlockId.plank, 'player');
    expect(env2.edit.placeAt({ x: 9, y: 7, z: 9 }, 'north')).toEqual({
      ok: false,
      reason: 'no-support',
    });
  });

  it('door 아이템 하나가 수직 2 칸을 차지한다', () => {
    const env = setup();
    hold(env, BlockId.door, 1);
    expect(env.edit.placeAt({ x: 9, y: 5, z: 9 }, 'south').ok).toBe(true);
    expect(env.world.getBlock(9, 5, 9)).toBe(BlockId.door);
    expect(env.world.getBlock(9, 6, 9)).toBe(BlockId.door);
    expect(env.inventory.selectedStack()).toBeNull();
    const o = env.world.placements.objectAt({ x: 9, y: 6, z: 9 });
    expect(o?.blockId).toBe(BlockId.door);
  });

  it('bell·crop·seed 는 플레이어가 설치할 수 없다', () => {
    const env = setup();
    hold(env, BlockId.bell, 1);
    expect(env.edit.placeAt({ x: 9, y: 5, z: 9 }, 'north').ok).toBe(false);
    const env2 = setup();
    env2.inventory.add([{ item: { kind: 'material', material: 'seed' }, count: 1 }]);
    expect(env2.edit.placeAt({ x: 9, y: 5, z: 9 }, 'north')).toEqual({
      ok: false,
      reason: 'not-placeable',
    });
  });

  it('인벤토리가 비었거나 칸이 차 있거나 월드 밖이면 아무것도 바뀌지 않는다', () => {
    const env = setup();
    const before = env.changes.length;
    expect(env.edit.placeAt({ x: 9, y: 5, z: 9 }, 'north')).toEqual({
      ok: false,
      reason: 'no-item',
    });
    hold(env, BlockId.bed, 1);
    expect(env.edit.placeAt({ x: 9, y: 4, z: 9 }, 'north')).toEqual({
      ok: false,
      reason: 'occupied',
    });
    expect(env.edit.placeAt({ x: 31, y: 5, z: 9 }, 'east')).toEqual({
      ok: false,
      reason: 'out-of-world',
    });
    expect(env.changes.length).toBe(before);
    expect(env.world.placements.all()).toHaveLength(0);
    expect(env.inventory.selectedStack()?.count).toBe(1);
  });

  it('변경 알림 구독자는 아이템과 블록이 함께 확정된 상태만 읽는다', () => {
    const env = setup();
    hold(env, BlockId.plank, 2);
    const seen: number[] = [];
    env.events.on('BLOCK_CHANGED', () => seen.push(env.inventory.count(blockItem(BlockId.plank))));
    let invSawBlock = -1;
    env.events.on('INVENTORY_CHANGED', () => (invSawBlock = env.world.getBlock(9, 5, 9)));
    env.edit.placeAt({ x: 9, y: 5, z: 9 }, 'north');
    expect(seen).toEqual([1]);
    expect(invSawBlock).toBe(BlockId.plank);
  });
});

describe('다중 칸 객체의 파괴 (TASK-013)', () => {
  it('침대 방향과 객체 id 가 보존되고, 어느 칸을 부숴도 전체 제거와 드롭 1 개다', () => {
    for (const hit of [
      { x: 10, y: 5, z: 10 },
      { x: 10, y: 5, z: 11 },
    ]) {
      const env = setup();
      hold(env, BlockId.bed, 1);
      env.edit.placeAt({ x: 10, y: 5, z: 10 }, 'south');
      const id = env.world.placements.objectAt({ x: 10, y: 5, z: 11 })?.id;
      expect(id).toBeDefined();
      env.changes.length = 0;
      expect(env.edit.breakAt(hit).ok).toBe(true);
      expect(env.world.getBlock(10, 5, 10)).toBe(BlockId.air);
      expect(env.world.getBlock(10, 5, 11)).toBe(BlockId.air);
      expect(env.world.placements.all()).toHaveLength(0);
      expect(env.inventory.count(blockItem(BlockId.bed))).toBe(1);
      expect(new Set(env.changes.map((c) => c.batchId)).size).toBe(1);
      expect(env.changes[0]?.removedObject?.facing).toBe('south');
    }
  });

  it('두 침대를 붙여 놓아도 별개 객체로 판정한다', () => {
    const env = setup();
    hold(env, BlockId.bed, 2);
    env.edit.placeAt({ x: 10, y: 5, z: 10 }, 'east');
    env.edit.placeAt({ x: 10, y: 5, z: 11 }, 'east');
    const a = env.world.placements.objectAt({ x: 11, y: 5, z: 10 });
    const b = env.world.placements.objectAt({ x: 11, y: 5, z: 11 });
    expect(a?.id).not.toBe(b?.id);
    env.edit.breakAt({ x: 11, y: 5, z: 10 });
    expect(env.world.getBlock(10, 5, 11)).toBe(BlockId.bed);
    expect(env.world.placements.all()).toHaveLength(1);
  });

  it('파괴 진행 중 같은 침대의 다른 칸을 봐도 같은 대상이다', () => {
    const env = setup();
    hold(env, BlockId.bed, 1);
    // 시선 정면 z=3 과 그 옆 x=5 칸을 침대로
    env.world.setBlock(6, 5, 3, BlockId.plank, 'player');
    env.world.setBlock(5, 5, 3, BlockId.plank, 'player');
    env.edit.placeAt({ x: 6, y: 6, z: 3 }, 'west');
    holdPrimary(env, 0.5);
    const p = env.edit.breakProgress;
    expect(p).toBeGreaterThan(0.5);
    env.player.yaw = 0.2;
    holdPrimary(env, 1 / 60);
    expect(env.edit.breakProgress).toBeGreaterThan(p);
  });

  it('지지면을 부숴도 침대·문·torch 는 남고 드롭은 부순 블록 것뿐이다 (READY-02)', () => {
    const env = setup();
    hold(env, BlockId.bed, 1);
    // 설치로 선택 칸이 비면 다음 아이템이 같은 칸에 들어간다
    expect(env.edit.placeAt({ x: 10, y: 5, z: 10 }, 'east').ok).toBe(true);
    hold(env, BlockId.door, 1);
    expect(env.edit.placeAt({ x: 14, y: 5, z: 10 }, 'north').ok).toBe(true);
    hold(env, BlockId.torch, 1);
    expect(env.edit.placeAt({ x: 16, y: 5, z: 10 }, 'north').ok).toBe(true);
    for (const p of [
      { x: 10, y: 4, z: 10 },
      { x: 11, y: 4, z: 10 },
      { x: 14, y: 4, z: 10 },
      { x: 16, y: 4, z: 10 },
    ]) {
      expect(env.edit.breakAt(p).ok).toBe(true);
    }
    expect(env.world.placements.all()).toHaveLength(2);
    expect(env.world.getBlock(11, 5, 10)).toBe(BlockId.bed);
    expect(env.world.getBlock(14, 6, 10)).toBe(BlockId.door);
    expect(env.world.getBlock(16, 5, 10)).toBe(BlockId.torch);
    expect(env.inventory.count(blockItem(BlockId.stone))).toBe(4);
    expect(env.inventory.count(blockItem(BlockId.bed))).toBe(0);
  });
});

describe('설치 방향', () => {
  it('카메라 수평 방향을 가장 가까운 동서남북으로 양자화한다', () => {
    expect(facingFromLook({ yaw: 0, pitch: -1 })).toBe('north');
    expect(facingFromLook({ yaw: Math.PI, pitch: 0 })).toBe('south');
    expect(facingFromLook({ yaw: Math.PI / 2, pitch: 0 })).toBe('west');
    expect(facingFromLook({ yaw: -Math.PI / 2 + 0.3, pitch: 0.5 })).toBe('east');
  });
});
