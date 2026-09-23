import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/game/EventBus';
import { GameWorld, UPDATE_SLOTS, type UpdateSlot } from '../src/game/GameWorld';
import { balance } from '../src/game/data/balance';
import type { VillageStorageData } from '../src/game/types';

/** 테스트용 GameWorld. balance 의 초기 저장소 값을 쓴다. */
function makeWorld(): GameWorld {
  return new GameWorld({
    storage: balance.storage,
    worldSize: { sizeX: 16, sizeY: 16, sizeZ: 16 },
  });
}

describe('EventBus (ARCHITECTURE 5)', () => {
  it('잘못된 payload 는 컴파일 에러다', () => {
    const bus = new EventBus();
    // @ts-expect-error — STORAGE_CHANGED payload 에 food 가 없다. 타입 검사가 이를 막아야 한다.
    bus.emit('STORAGE_CHANGED', { seed: 1, crop: 0 });
    // @ts-expect-error — 존재하지 않는 이벤트 이름.
    bus.on('NOT_AN_EVENT', () => undefined);
    expect(true).toBe(true);
  });

  it('on 은 구독 해제 함수를 반환한다', () => {
    const bus = new EventBus();
    const got: VillageStorageData[] = [];
    const off = bus.on('STORAGE_CHANGED', (p) => got.push(p));
    bus.emit('STORAGE_CHANGED', { seed: 1, crop: 2, food: 3 });
    off();
    bus.emit('STORAGE_CHANGED', { seed: 9, crop: 9, food: 9 });
    expect(got).toEqual([{ seed: 1, crop: 2, food: 3 }]);
  });

  it('발행 중 구독 해제해도 나머지 구독자가 호출된다', () => {
    const bus = new EventBus();
    const calls: string[] = [];
    const offA = bus.on('INVENTORY_CHANGED', () => {
      calls.push('a');
      offA();
    });
    bus.on('INVENTORY_CHANGED', () => calls.push('b'));
    bus.emit('INVENTORY_CHANGED', undefined);
    bus.emit('INVENTORY_CHANGED', undefined);
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});

describe('VillageStorage', () => {
  it('초기 seed 가 3 이다', () => {
    expect(makeWorld().storage.snapshot()).toEqual({ seed: 3, crop: 0, food: 0 });
  });

  it('변경 시 STORAGE_CHANGED 가 발행된다', () => {
    const world = makeWorld();
    const got: VillageStorageData[] = [];
    world.events.on('STORAGE_CHANGED', (p) => got.push(p));
    world.storage.add('crop', 2);
    expect(world.storage.take('seed', 1)).toBe(true);
    expect(world.storage.take('food', 1)).toBe(false);
    expect(got).toEqual([
      { seed: 3, crop: 2, food: 0 },
      { seed: 2, crop: 2, food: 0 },
    ]);
  });

  it('양의 정수가 아닌 수량을 거부한다', () => {
    const world = makeWorld();
    expect(() => world.storage.add('seed', 0)).toThrow(RangeError);
    expect(() => world.storage.take('seed', 1.5)).toThrow(RangeError);
  });
});

describe('GameWorld update 슬롯 (ARCHITECTURE 4.1)', () => {
  it('슬롯 순서가 4.1 의 16 단계와 일치한다', () => {
    expect(UPDATE_SLOTS).toEqual([
      'clock',
      'input',
      'playerMovement',
      'blockEdit',
      'room',
      'nav',
      'farm',
      'raidArrival',
      'monster',
      'npcDecision',
      'npc',
      'combat',
      'gratitude',
      'worldState',
      'gameEvent',
      'objectiveSave',
    ]);
  });

  it('연결 순서와 무관하게 슬롯 순서로 실행되고, 같은 슬롯은 연결 순서를 지킨다', () => {
    const world = makeWorld();
    const calls: string[] = [];
    const attach = (slot: UpdateSlot, name: string): void =>
      world.attach(slot, { update: () => void calls.push(name) });
    attach('objectiveSave', 'objective');
    attach('npc', 'npcExec');
    attach('objectiveSave', 'save');
    attach('npcDecision', 'decision');
    attach('raidArrival', 'raid');
    attach('raidArrival', 'arrival');
    attach('clock', 'clock');
    world.update(1 / 60);
    expect(calls).toEqual(['clock', 'raid', 'arrival', 'decision', 'npcExec', 'objective', 'save']);
  });

  it('NPC 판단과 Action 실행은 다른 슬롯이며 각자 dt 를 받는다', () => {
    const world = makeWorld();
    const seen: Record<string, number> = {};
    world.attach('npcDecision', { update: (dt) => void (seen.decision = dt) });
    world.attach('npc', { update: (dt) => void (seen.npc = dt) });
    world.update(0.05);
    expect(seen).toEqual({ decision: 0.05, npc: 0.05 });
  });
});
