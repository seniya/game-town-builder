// 마을 레벨과 종 (MVP_SPEC 23, ARCHITECTURE 17, ADR 013 / 033, TASK-036). 마을 레벨의 유일한 소유자다.
// evaluate 는 현재 상태로 게이트를 전부 계산해 돌려준다(UI 가 다시 계산하지 않는다, 17.1). ring 만 레벨을 바꾸며 감소 경로는 없다.
import { balance } from '../data/balance';
import { UNLOCKS_BY_LEVEL } from '../data/unlocks';
import type { EventBus } from '../EventBus';
import type { Room } from '../types';
import { computeWorldState } from './WorldStateSystem';

/** 게이트 조건 하나. 미충족도 전부 표시한다 (MVP_SPEC 23.4). */
export interface LevelGateStatus {
  /** "감사 포인트" / "인식된 방" / "housingLevel" / "foodLevel" */
  readonly requirement: string;
  readonly current: number;
  readonly required: number;
  readonly met: boolean;
  /** 보조 안내. foodLevel 은 현재 주민 수로 계산한 필요 food 개수 */
  readonly hint?: string;
}

/** evaluate 의 결과. 최고 레벨이면 nextLevel null, cost 0, gates [], canRing false. */
export interface LevelEvaluation {
  readonly level: number;
  readonly nextLevel: number | null;
  readonly cost: number;
  readonly gates: readonly LevelGateStatus[];
  readonly canRing: boolean;
}

/** VillageLevelSystem 이 읽고 쓰는 것. 각각 소유자의 포트다. */
export interface VillageLevelDeps {
  readonly events: EventBus;
  readonly gratitude: { readonly total: number; spend(amount: number): boolean };
  /** 모든 방(dirty 포함). dirty 방은 세지 않는다 */
  readonly rooms: () => readonly Room[];
  /** 현재 주민 수(도착 예약 인원은 세지 않는다) */
  readonly population: () => number;
  readonly food: () => number;
}

type LevelDef = (typeof balance.village.levels)[number];

/** 레벨·게이트 평가·종 치기. */
export class VillageLevelSystem {
  private current: number = balance.village.levels[0].level;

  /** 포트를 받는다. 시작은 레벨 1 이다. */
  constructor(private readonly deps: VillageLevelDeps) {}

  /** 현재 마을 레벨. */
  get level(): number {
    return this.current;
  }

  /** 현재 레벨의 주민 정원. */
  get residentCap(): number {
    return this.def(this.current)?.residentCap ?? 0;
  }

  /** 이 블록이 현재 레벨에서 해금되었는가 (TASK-037 이 제작에 연결한다). */
  isUnlocked(blockId: number): boolean {
    for (let l = 1; l <= this.current; l++) {
      if ((UNLOCKS_BY_LEVEL[l] ?? []).includes(blockId)) return true;
    }
    return false;
  }

  /**
   * 다음 레벨의 게이트를 현재 상태로 평가한다 (ARCHITECTURE 17.1 / 17.2).
   * 방 수는 dirty 가 아닌 인식된 방(EmptyRoom 포함), 지표는 computeWorldState 로 지금 다시 계산한다.
   */
  evaluate(): LevelEvaluation {
    const next = this.def(this.current + 1);
    if (!next) {
      return { level: this.current, nextLevel: null, cost: 0, gates: [], canRing: false };
    }
    const rooms = this.deps.rooms().filter((r) => !r.dirty);
    const beds = rooms
      .filter((r) => r.type === 'Bedroom')
      .reduce((n, r) => n + r.facilities.beds.length, 0);
    const population = this.deps.population();
    const ws = computeWorldState({
      population,
      food: this.deps.food(),
      accessibleBeds: beds,
      lastRaid: null,
      balance,
    });
    const gates: LevelGateStatus[] = [gate('감사 포인트', this.deps.gratitude.total, next.cost)];
    const g: LevelDef['gate'] & {
      minRooms?: number;
      minHousingLevel?: number;
      minFoodLevel?: number;
    } = next.gate;
    if (g.minRooms !== undefined) gates.push(gate('인식된 방', rooms.length, g.minRooms));
    if (g.minFoodLevel !== undefined) {
      const need = Math.ceil(
        (g.minFoodLevel / 100) *
          population *
          balance.meal.mealsPerDay *
          balance.worldState.foodTargetDays,
      );
      gates.push({
        ...gate('foodLevel', ws.foodLevel, g.minFoodLevel),
        hint: `음식 ${this.deps.food()} / ${need} (주민 ${population}명)`,
      });
    }
    if (g.minHousingLevel !== undefined) {
      gates.push(gate('housingLevel', ws.housingLevel, g.minHousingLevel));
    }
    return {
      level: this.current,
      nextLevel: next.level,
      cost: next.cost,
      gates,
      canRing: gates.every((x) => x.met),
    };
  }

  /**
   * 종을 친다: 같은 평가를 다시 하고, 전부 만족하면 비용을 쓰고 레벨을 하나 올린다 (MVP_SPEC 23.3).
   * 조건 미충족·최고 레벨·비용 차감 실패면 아무것도 바꾸지 않고 false. 주민 도착 예약은 TASK-038 이 이 이벤트로 만든다.
   */
  ring(): boolean {
    const e = this.evaluate();
    if (!e.canRing || e.nextLevel === null) return false;
    if (!this.deps.gratitude.spend(e.cost)) return false;
    this.current = e.nextLevel;
    this.deps.events.emit('VILLAGE_LEVEL_UP', {
      level: this.current,
      unlocked: [...(UNLOCKS_BY_LEVEL[this.current] ?? [])],
    });
    return true;
  }

  /** 로드 복원. 저장된 레벨을 그대로 쓴다(이벤트 없음). */
  restore(level: number): void {
    if (this.def(level)) this.current = level;
  }

  /** 레벨 정의. */
  private def(level: number): LevelDef | undefined {
    return balance.village.levels.find((l) => l.level === level);
  }
}

/** 현재 / 필요 게이트 한 줄. */
function gate(requirement: string, current: number, required: number): LevelGateStatus {
  return { requirement, current, required, met: current >= required };
}
