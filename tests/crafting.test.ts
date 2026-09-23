import { describe, expect, it } from 'vitest';
import { BLOCKS, BlockId } from '../src/game/data/blocks';
import { RECIPES } from '../src/game/data/recipes';
import { requiredLevel, UNLOCKS_BY_LEVEL } from '../src/game/data/unlocks';
import { EventBus } from '../src/game/EventBus';
import { BlockEditSystem } from '../src/game/systems/BlockEditSystem';
import { CraftingSystem } from '../src/game/systems/CraftingSystem';
import { EMPTY_INPUT_FRAME, InputSystem } from '../src/game/systems/InputSystem';
import { blockItem, INVENTORY_SLOTS, InventorySystem } from '../src/game/systems/InventorySystem';
import { createPlayer } from '../src/game/systems/PlayerMovementSystem';
import { VoxelWorld } from '../src/game/voxel/VoxelWorld';
import { ScreenStateMachine, type ScreenEffects } from '../src/ui/ModalController';

/** 인벤토리와 제작 시스템. level 은 마을 레벨이다. */
function setup(level = 1): { inv: InventorySystem; craft: CraftingSystem } {
  const inv = new InventorySystem(new EventBus());
  return { inv, craft: new CraftingSystem(inv, () => level) };
}

describe('레시피 데이터 (MVP_SPEC 8.5 / 23.2)', () => {
  it('12 개 레시피의 재료와 결과가 blocks.ts 의 블록으로만 구성된다', () => {
    expect(RECIPES).toHaveLength(12);
    const ids = new Set(BLOCKS.map((b) => b.id));
    for (const r of RECIPES) {
      expect(ids.has(r.output.blockId)).toBe(true);
      for (const i of r.inputs) expect(ids.has(i.blockId)).toBe(true);
      expect(BLOCKS[r.output.blockId]?.name).toBe(r.id);
    }
  });

  it('모든 레시피 결과가 해금표에 정확히 한 번 나온다', () => {
    const all = Object.values(UNLOCKS_BY_LEVEL).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const r of RECIPES) expect(requiredLevel(r.output.blockId)).not.toBeNull();
    expect(requiredLevel(BlockId.window)).toBe(2);
    expect(requiredLevel(BlockId.chest)).toBe(2);
    expect(requiredLevel(BlockId.stone_brick)).toBe(3);
    expect(requiredLevel(BlockId.bed)).toBe(1);
  });
});

describe('CraftingSystem (TASK-015)', () => {
  it('log × 1 → plank × 4', () => {
    const { inv, craft } = setup();
    inv.add([{ item: blockItem(BlockId.log), count: 1 }]);
    expect(craft.craft('plank')).toEqual({ ok: true });
    expect(inv.count(blockItem(BlockId.log))).toBe(0);
    expect(inv.count(blockItem(BlockId.plank))).toBe(4);
  });

  it('재료가 부족하면 만들 수 없고 인벤토리가 바뀌지 않는다', () => {
    const { inv, craft } = setup();
    inv.add([{ item: blockItem(BlockId.plank), count: 3 }]);
    const door = craft.statuses().find((s) => s.recipe.id === 'door');
    expect(door?.hasMaterials).toBe(false);
    expect(door?.craftable).toBe(false);
    expect(craft.craft('door')).toEqual({ ok: false, reason: 'materials' });
    expect(inv.count(blockItem(BlockId.plank))).toBe(3);
  });

  it('해금되지 않은 레시피도 목록에 있고 필요 레벨을 알린다', () => {
    const { inv, craft } = setup(1);
    inv.add([
      { item: blockItem(BlockId.plank), count: 64 },
      { item: blockItem(BlockId.sand), count: 5 },
    ]);
    const statuses = craft.statuses();
    expect(statuses).toHaveLength(RECIPES.length);
    const window = statuses.find((s) => s.recipe.id === 'window');
    expect(window).toMatchObject({
      unlocked: false,
      requiredLevel: 2,
      hasMaterials: true,
      craftable: false,
    });
    expect(craft.craft('window')).toEqual({ ok: false, reason: 'locked' });
    const level2 = setup(2);
    level2.inv.add([
      { item: blockItem(BlockId.plank), count: 2 },
      { item: blockItem(BlockId.sand), count: 1 },
    ]);
    expect(level2.craft.craft('window').ok).toBe(true);
    expect(level2.inv.count(blockItem(BlockId.window))).toBe(2);
  });

  it('레벨 1 에서 화덕·물통·침대를 만들 수 있다', () => {
    const { inv, craft } = setup(1);
    inv.add([
      { item: blockItem(BlockId.stone), count: 9 },
      { item: blockItem(BlockId.plank), count: 4 },
      { item: blockItem(BlockId.leaves), count: 4 },
    ]);
    expect(craft.craft('cooking_stove').ok).toBe(true);
    expect(craft.craft('water_pot').ok).toBe(true);
    expect(craft.craft('bed').ok).toBe(true);
    expect(inv.count(blockItem(BlockId.cooking_stove))).toBe(1);
    expect(inv.count(blockItem(BlockId.water_pot))).toBe(1);
    expect(inv.count(blockItem(BlockId.bed))).toBe(1);
  });

  it('결과를 넣을 공간이 없으면 만들지 않는다. 재료를 뺀 칸은 쓸 수 있다', () => {
    const { inv, craft } = setup();
    // 36 칸을 가득 채운다. 한 칸만 log 1 개
    inv.add([{ item: blockItem(BlockId.log), count: 1 }]);
    for (let i = 1; i < INVENTORY_SLOTS; i++)
      inv.add([{ item: blockItem(BlockId.dirt), count: 64 }]);
    // log 칸이 비면 plank 4 가 들어간다
    expect(craft.craft('plank').ok).toBe(true);
    expect(inv.count(blockItem(BlockId.plank))).toBe(4);
    // plank 2 → chair 1: plank 칸이 남아 있고 새 칸이 없다
    expect(craft.craft('chair')).toEqual({ ok: false, reason: 'inventory-full' });
    expect(inv.count(blockItem(BlockId.plank))).toBe(4);
  });

  it('잎 회수부터 침대 제작·설치까지 디버그 없이 이어진다', () => {
    const events = new EventBus();
    const world = new VoxelWorld({ sizeX: 32, sizeY: 16, sizeZ: 32 }, events);
    for (let x = 0; x < 32; x++)
      for (let z = 0; z < 32; z++)
        for (let y = 0; y <= 4; y++) world.writeInitial(x, y, z, BlockId.stone);
    // 나무 한 그루: log 2 + leaves 4
    for (const y of [5, 6]) world.writeInitial(10, y, 10, BlockId.log);
    for (const [x, z] of [
      [9, 10],
      [11, 10],
      [10, 9],
      [10, 11],
    ])
      world.writeInitial(x, 7, z, BlockId.leaves);
    const input = new InputSystem();
    const inv = new InventorySystem(events, input);
    const player = createPlayer({ x: 5, y: 5, z: 5 });
    const edit = new BlockEditSystem(world, player, inv, { frame: EMPTY_INPUT_FRAME }, events, {
      occupants: () => [player.body],
    });
    const craft = new CraftingSystem(inv, () => 1);
    for (const p of [
      { x: 10, y: 5, z: 10 },
      { x: 10, y: 6, z: 10 },
      { x: 9, y: 7, z: 10 },
      { x: 11, y: 7, z: 10 },
      { x: 10, y: 7, z: 9 },
      { x: 10, y: 7, z: 11 },
    ]) {
      expect(edit.breakAt(p).ok).toBe(true);
    }
    expect(craft.craft('plank').ok).toBe(true);
    expect(craft.craft('bed').ok).toBe(true);
    const bedSlot = inv
      .snapshot()
      .findIndex((s) => s?.item.kind === 'block' && s.item.blockId === BlockId.bed);
    inv.swap(bedSlot, inv.selected);
    expect(edit.placeAt({ x: 14, y: 5, z: 14 }, 'east').ok).toBe(true);
    expect(world.placements.objectAt({ x: 15, y: 5, z: 14 })?.blockId).toBe(BlockId.bed);
  });
});

describe('화면 상태 (READY-03, MVP_SPEC 29.0)', () => {
  /** 효과 기록과 상태 기계. lockResult 는 락 요청의 결과다. */
  function machine(lockResult = true) {
    const log: string[] = [];
    let blocked = false;
    const effects: ScreenEffects = {
      requestLock: () => {
        log.push('requestLock');
        return Promise.resolve(lockResult);
      },
      exitLock: () => void log.push('exitLock'),
      setGameplayBlocked: (b) => void (blocked = b),
      showMenu: () => void log.push('showMenu'),
      hideMenu: () => void log.push('hideMenu'),
    };
    const views = {
      inventory: { open: () => void log.push('open'), close: () => void log.push('close') },
    };
    const m = new ScreenStateMachine(effects, views);
    return { m, log, blocked: () => blocked };
  }

  it('시작은 메뉴(일시정지)이고, 클릭 → 락이 걸리면 조작 중이 된다', async () => {
    const { m, blocked } = machine();
    expect(m.paused).toBe(true);
    expect(blocked()).toBe(true);
    m.resumeFromMenu();
    await Promise.resolve();
    m.lockAcquired();
    expect(m.state.kind).toBe('playing');
    expect(m.paused).toBe(false);
    expect(blocked()).toBe(false);
  });

  it('조작 중 락이 풀리면 메뉴가 열린다', () => {
    const { m } = machine();
    m.lockAcquired();
    m.lockLost();
    expect(m.state.kind).toBe('menu');
    expect(m.paused).toBe(true);
  });

  it('E 로 인벤토리를 열면 조작만 막고 시간은 멈추지 않는다. 락 해제는 메뉴를 열지 않는다', () => {
    const { m, log, blocked } = machine();
    m.lockAcquired();
    expect(m.key('KeyE')).toBe(true);
    expect(m.state).toEqual({ kind: 'modal', name: 'inventory' });
    expect(m.paused).toBe(false);
    expect(blocked()).toBe(true);
    expect(log).toContain('exitLock');
    m.lockLost();
    expect(m.state.kind).toBe('modal');
  });

  it('E 로 닫으면 락을 다시 요청하고, 거부되면 메뉴로 간다', async () => {
    const ok = machine(true);
    ok.m.lockAcquired();
    ok.m.key('KeyE');
    ok.m.key('KeyE');
    expect(ok.m.state.kind).toBe('resuming');
    expect(ok.log.at(-1)).toBe('requestLock');
    ok.m.lockAcquired();
    expect(ok.m.state.kind).toBe('playing');
    const denied = machine(false);
    denied.m.lockAcquired();
    denied.m.key('KeyE');
    denied.m.key('KeyE');
    await Promise.resolve();
    await Promise.resolve();
    expect(denied.m.state.kind).toBe('menu');
  });

  it('Esc 로 모달을 닫으면 메뉴로 간다. 모달 중 다른 모달·메뉴 중 E 는 무시한다', () => {
    const { m } = machine();
    expect(m.key('KeyE')).toBe(false); // 메뉴 중
    m.lockAcquired();
    m.key('KeyE');
    expect(m.open('bell')).toBe(false);
    m.key('Escape');
    expect(m.state.kind).toBe('menu');
  });
});

describe('모달 전후 입력 (READY-03)', () => {
  it('모달 동안 조작 입력이 비고, 닫은 뒤에도 계속 누르던 키는 새로 눌러야 들어간다', () => {
    const input = new InputSystem();
    input.setPointerLocked(true);
    input.keyDown('KeyW');
    input.update();
    expect(input.frame.moveForward).toBe(1);
    input.setGameplayBlocked(true);
    input.mouseDown(0);
    input.keyDown('KeyD');
    input.update();
    expect(input.frame.moveForward).toBe(0);
    expect(input.frame.moveRight).toBe(0);
    expect(input.frame.primaryHeld).toBe(false);
    input.setGameplayBlocked(false);
    // 자동 반복 keydown 은 잔류 키를 되살리지 않는다
    input.keyDown('KeyW', true);
    input.update();
    expect(input.frame.moveForward).toBe(0);
    expect(input.frame.moveRight).toBe(0);
    expect(input.frame.primaryHeld).toBe(false);
    input.keyUp('KeyW');
    input.keyDown('KeyW');
    input.update();
    expect(input.frame.moveForward).toBe(1);
  });
});
