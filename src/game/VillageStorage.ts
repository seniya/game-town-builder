// 마을 저장소 seed / crop / food (MVP_SPEC 13.2). 이 세 값의 유일한 소유자다 (ARCHITECTURE 27).
import type { EventBus } from './EventBus';
import type { MaterialId, VillageStorageData } from './types';

/** 초기값. balance.storage 에서 주입한다. */
export interface VillageStorageInit {
  readonly initialSeed: number;
  readonly initialCrop: number;
  readonly initialFood: number;
}

/** 마을 공용 자원. 값이 바뀌면 STORAGE_CHANGED 를 발행한다. */
export class VillageStorage {
  private values: Record<MaterialId, number>;

  /** 초기값과 이벤트 버스를 받는다. 생성 시에는 이벤트를 발행하지 않는다. */
  constructor(
    private readonly events: EventBus,
    init: VillageStorageInit,
  ) {
    this.values = { seed: init.initialSeed, crop: init.initialCrop, food: init.initialFood };
  }

  /** 현재 값의 복사본. */
  snapshot(): VillageStorageData {
    return { ...this.values };
  }

  /** 한 자원의 현재 수량. */
  get(kind: MaterialId): number {
    return this.values[kind];
  }

  /** 자원을 더한다. amount 는 양의 정수여야 한다. */
  add(kind: MaterialId, amount: number): void {
    assertPositiveInt(amount);
    this.values[kind] += amount;
    this.changed();
  }

  /** 자원을 뺀다. 부족하면 아무것도 바꾸지 않고 false 를 반환한다. */
  take(kind: MaterialId, amount: number): boolean {
    assertPositiveInt(amount);
    if (this.values[kind] < amount) return false;
    this.values[kind] -= amount;
    this.changed();
    return true;
  }

  /** 로드 시 전체를 교체한다. 로드 재구축 순서에 따라 이벤트를 한 번 발행한다. */
  restore(data: VillageStorageData): void {
    this.values = { seed: data.seed, crop: data.crop, food: data.food };
    this.changed();
  }

  /** STORAGE_CHANGED 를 발행한다. */
  private changed(): void {
    this.events.emit('STORAGE_CHANGED', this.snapshot());
  }
}

/** 수량 인자가 양의 정수인지 검사한다. 호출 측 버그를 조용히 삼키지 않는다. */
function assertPositiveInt(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new RangeError(`수량은 양의 정수여야 한다: ${amount}`);
  }
}
