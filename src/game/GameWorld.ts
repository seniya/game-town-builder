// update 순서를 소유하는 유일한 객체 (ARCHITECTURE 4). 순서를 임의로 바꾸지 않는다 (4.1).
// 렌더는 여기서 호출하지 않는다. main.ts 가 world.update 뒤에 renderer.render 를 부른다.
import { EntityRegistry } from './EntityRegistry';
import { EventBus } from './EventBus';
import { VillageStorage, type VillageStorageInit } from './VillageStorage';

/**
 * ARCHITECTURE 4.1 의 16 슬롯. 배열 순서가 곧 update 순서다.
 * 8 번(raid / arrival)과 16 번(objective / save)은 한 슬롯에 두 시스템을 순서대로 연결한다.
 */
export const UPDATE_SLOTS = [
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
] as const;

export type UpdateSlot = (typeof UPDATE_SLOTS)[number];

/**
 * 슬롯에 연결되는 시스템. dt 는 이번 프레임의 경과 초다.
 * 슬롯은 순서만 규정한다. 시스템은 내부 누적 시간으로 갱신 주기를 따로 가질 수 있다 (3.2).
 */
export interface SlotSystem {
  update(dt: number): void;
}

/** GameWorld 생성에 필요한 데이터. 후속 Task 에서 섬 데이터 등이 추가된다. */
export interface GameWorldInit {
  readonly storage: VillageStorageInit;
}

/** 게임 상태의 루트. 순수 TypeScript 이며 three 를 모른다. */
export class GameWorld {
  readonly events = new EventBus();
  readonly registry = new EntityRegistry();
  readonly storage: VillageStorage;

  private readonly slots = new Map<UpdateSlot, SlotSystem[]>(
    UPDATE_SLOTS.map((slot) => [slot, []]),
  );

  /** 초기 데이터를 주입해 상태 소유자들을 만든다. */
  constructor(init: GameWorldInit) {
    this.storage = new VillageStorage(this.events, init.storage);
  }

  /** 시스템을 슬롯에 연결한다. 같은 슬롯 안에서는 연결한 순서대로 실행한다. */
  attach(slot: UpdateSlot, system: SlotSystem): void {
    this.slotList(slot).push(system);
  }

  /** 한 프레임을 16 슬롯 순서대로 진행한다. 비어 있는 슬롯은 건너뛴다. */
  update(dt: number): void {
    for (const slot of UPDATE_SLOTS) {
      for (const system of this.slotList(slot)) system.update(dt);
    }
  }

  /** 슬롯의 시스템 목록. 생성자에서 모든 슬롯을 만들었으므로 항상 존재한다. */
  private slotList(slot: UpdateSlot): SlotSystem[] {
    const list = this.slots.get(slot);
    if (!list) throw new Error(`알 수 없는 update 슬롯: ${slot}`);
    return list;
  }
}
