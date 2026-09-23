import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { EventBus } from '../src/game/EventBus';
import { EMPTY_INPUT_FRAME, type InputFrame } from '../src/game/systems/InputSystem';
import { blockItem, INVENTORY_SLOTS, InventorySystem } from '../src/game/systems/InventorySystem';
import type { ItemRef } from '../src/game/types';

const seed: ItemRef = { kind: 'material', material: 'seed' };

/** 인벤토리와 변경 알림 횟수. */
function setup(input: { frame: InputFrame } | null = null): {
  inv: InventorySystem;
  changes: () => number;
} {
  const events = new EventBus();
  let n = 0;
  events.on('INVENTORY_CHANGED', () => (n += 1));
  return { inv: new InventorySystem(events, input), changes: () => n };
}

describe('InventorySystem (TASK-014)', () => {
  it('핫바 9 + 가방 27 = 36 칸이며 처음에는 비어 있다', () => {
    const { inv } = setup();
    expect(INVENTORY_SLOTS).toBe(36);
    expect(inv.snapshot().every((s) => s === null)).toBe(true);
  });

  it('드롭 추가 API 로 블록과 재료가 들어간다. 같은 아이템은 같은 칸에 쌓인다', () => {
    const { inv, changes } = setup();
    expect(inv.add([{ item: blockItem(BlockId.log), count: 1 }])).toBe(true);
    expect(
      inv.add([
        { item: blockItem(BlockId.log), count: 2 },
        { item: seed, count: 1 },
      ]),
    ).toBe(true);
    expect(inv.slot(0)).toEqual({ item: blockItem(BlockId.log), count: 3 });
    expect(inv.slot(1)).toEqual({ item: seed, count: 1 });
    expect(inv.count(blockItem(BlockId.log))).toBe(3);
    expect(changes()).toBe(2);
  });

  it('64 를 넘으면 다음 칸으로 넘어간다', () => {
    const { inv } = setup();
    inv.add([{ item: blockItem(BlockId.dirt), count: 63 }]);
    inv.add([{ item: blockItem(BlockId.dirt), count: 3 }]);
    expect(inv.slot(0)?.count).toBe(balance.inventory.stackSize);
    expect(inv.slot(1)?.count).toBe(2);
  });

  it('공간이 모자라면 아무것도 넣지 않는다', () => {
    const { inv, changes } = setup();
    for (let i = 0; i < INVENTORY_SLOTS - 1; i++)
      inv.add([{ item: blockItem((i % 20) + 1), count: 64 }]);
    const before = inv.snapshot();
    const n = changes();
    // 빈 칸이 하나뿐인데 두 종류를 넣으려 한다
    expect(
      inv.canAdd([
        { item: seed, count: 1 },
        { item: blockItem(BlockId.bell), count: 1 },
      ]),
    ).toBe(false);
    expect(
      inv.add([
        { item: seed, count: 1 },
        { item: blockItem(BlockId.bell), count: 1 },
      ]),
    ).toBe(false);
    expect(inv.snapshot()).toEqual(before);
    expect(changes()).toBe(n);
  });

  it('설치 소비 API 가 선택 칸에서 1 개를 빼고, 0 개면 거부한다', () => {
    const { inv } = setup();
    inv.add([{ item: blockItem(BlockId.plank), count: 2 }]);
    expect(inv.consumeSelected()).toBe(true);
    expect(inv.selectedStack()?.count).toBe(1);
    expect(inv.consumeSelected()).toBe(true);
    expect(inv.selectedStack()).toBeNull();
    expect(inv.canConsumeSelected()).toBe(false);
    expect(inv.consumeSelected()).toBe(false);
  });

  it('remove 는 전부 빼거나 아무것도 빼지 않는다', () => {
    const { inv } = setup();
    inv.add([
      { item: blockItem(BlockId.plank), count: 70 },
      { item: seed, count: 1 },
    ]);
    expect(
      inv.remove([
        { item: blockItem(BlockId.plank), count: 4 },
        { item: seed, count: 2 },
      ]),
    ).toBe(false);
    expect(inv.count(blockItem(BlockId.plank))).toBe(70);
    expect(inv.remove([{ item: blockItem(BlockId.plank), count: 68 }])).toBe(true);
    expect(inv.count(blockItem(BlockId.plank))).toBe(2);
  });

  it('핫바 선택이 숫자키와 휠로 바뀐다', () => {
    const input = { frame: EMPTY_INPUT_FRAME };
    const { inv } = setup(input);
    input.frame = { ...EMPTY_INPUT_FRAME, hotbarSelect: 4 };
    inv.update();
    expect(inv.selected).toBe(4);
    input.frame = { ...EMPTY_INPUT_FRAME, wheelSteps: 2 };
    inv.update();
    expect(inv.selected).toBe(6);
    input.frame = { ...EMPTY_INPUT_FRAME, wheelSteps: 3 };
    inv.update();
    expect(inv.selected).toBe(0);
    input.frame = { ...EMPTY_INPUT_FRAME, wheelSteps: -1 };
    inv.update();
    expect(inv.selected).toBe(8);
  });
});

describe('EventBus.transaction', () => {
  it('트랜잭션 안의 발행은 끝난 뒤 순서대로 전달된다', () => {
    const events = new EventBus();
    const log: string[] = [];
    events.on('INVENTORY_CHANGED', () => log.push('inv'));
    events.on('STORAGE_CHANGED', () => log.push('storage'));
    events.transaction(() => {
      events.emit('INVENTORY_CHANGED', undefined);
      events.emit('STORAGE_CHANGED', { seed: 0, crop: 0, food: 0 });
      log.push('commit');
    });
    expect(log).toEqual(['commit', 'inv', 'storage']);
  });

  it('예외가 나면 모아 둔 발행을 버린다', () => {
    const events = new EventBus();
    const log: string[] = [];
    events.on('INVENTORY_CHANGED', () => log.push('inv'));
    expect(() =>
      events.transaction(() => {
        events.emit('INVENTORY_CHANGED', undefined);
        throw new Error('x');
      }),
    ).toThrow();
    expect(log).toEqual([]);
    events.emit('INVENTORY_CHANGED', undefined);
    expect(log).toEqual(['inv']);
  });
});
