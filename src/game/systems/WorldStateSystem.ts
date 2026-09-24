// 파생 지표 (MVP_SPEC 21, ARCHITECTURE 22, ADR 004, TASK-039). update 14 번 슬롯. 아무것도 저장하지 않는 계산기다.
// 지표를 바꾸는 API 가 없다. 원인이 되는 실제 상태(주민 수·저장소·침대·습격 결과)를 바꿔야 지표가 바뀐다 (21.3).
import { balance } from '../data/balance';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type { RaidResult, WorldStateData } from '../types';

/** computeWorldState 의 입력. 모두 현재 상태의 읽기 값이다. */
export interface WorldStateInput {
  readonly population: number;
  readonly food: number;
  /** 유효한 Bedroom 의 facilities.beds 수 (ARCHITECTURE 22.3) */
  readonly accessibleBeds: number;
  /** 직전 습격 결과. 습격이 한 번도 없었으면 null */
  readonly lastRaid: RaidResult | null;
  readonly balance: typeof balance;
}

/** [0, 100] 으로 자른다. */
function clamp100(x: number): number {
  return Math.max(0, Math.min(100, x));
}

/**
 * 네 지표를 계산한다 (MVP_SPEC 21.1). 순수 함수다.
 * 반올림은 마지막에 한 번만 한다: happinessLevel 도 반올림 전의 세 값으로 계산한다 (21.2).
 * population 0 이면 식량·주거는 100 이다(0 으로 나누지 않는다). 습격이 없었거나 몬스터가 0 마리였으면 안전은 100 이다.
 */
export function computeWorldState(input: WorldStateInput): WorldStateData {
  const b = input.balance;
  const n = input.population;
  const food =
    n === 0
      ? 100
      : clamp100((100 * input.food) / (n * b.meal.mealsPerDay * b.worldState.foodTargetDays));
  const housing = n === 0 ? 100 : clamp100((100 * input.accessibleBeds) / n);
  const raid = input.lastRaid;
  const safety =
    raid === null || raid.total <= 0
      ? 100
      : clamp100((100 * (raid.total - raid.reached)) / raid.total);
  const w = b.worldState.happinessWeights;
  const happiness = food * w.food + housing * w.housing + safety * w.safety;
  return {
    foodLevel: Math.round(food),
    housingLevel: Math.round(housing),
    safetyLevel: Math.round(safety),
    happinessLevel: Math.round(happiness),
    population: n,
  };
}

/** WorldStateSystem 이 읽는 것. 각각 소유자의 조회다. */
export interface WorldStateDeps {
  readonly events: EventBus;
  /** EntityRegistry.npcs.size */
  readonly population: () => number;
  /** VillageStorage.food */
  readonly food: () => number;
  /** RoomRegistry 의 유효한 Bedroom 침대 수 */
  readonly accessibleBeds: () => number;
  /** RaidSystem(TASK-044~) 의 직전 습격 결과. 없으면 null */
  readonly lastRaid: () => RaidResult | null;
}

/** 두 지표 값이 같은가. */
function same(a: WorldStateData, b: WorldStateData): boolean {
  return (
    a.foodLevel === b.foodLevel &&
    a.housingLevel === b.housingLevel &&
    a.safetyLevel === b.safetyLevel &&
    a.happinessLevel === b.happinessLevel &&
    a.population === b.population
  );
}

/** 매 프레임 지표를 계산해 공유한다. 값이 바뀔 때만 WORLD_STATE_CHANGED 를 발행한다. */
export class WorldStateSystem implements SlotSystem {
  private value: WorldStateData;

  /** 읽기 포트를 받고 첫 값을 계산한다(이벤트 없음). */
  constructor(private readonly deps: WorldStateDeps) {
    this.value = this.compute();
  }

  /** 마지막으로 계산한 지표. */
  get current(): WorldStateData {
    return this.value;
  }

  /** 14 번 슬롯: NPC 행동 뒤의 상태로 다시 계산한다 (ARCHITECTURE 4.3). */
  update(): void {
    const next = this.compute();
    if (same(next, this.value)) return;
    this.value = next;
    this.deps.events.emit('WORLD_STATE_CHANGED', next);
  }

  /** 현재 입력으로 계산한다. */
  private compute(): WorldStateData {
    const d = this.deps;
    return computeWorldState({
      population: d.population(),
      food: d.food(),
      accessibleBeds: d.accessibleBeds(),
      lastRaid: d.lastRaid(),
      balance,
    });
  }
}
