import { describe, expect, it } from 'vitest';
import {
  decideAction,
  type NPCContext,
  type ActionPlan,
} from '../src/game/systems/NPCDecisionSystem';
import type { DayPhase, Facility } from '../src/game/types';

const BED: Facility = {
  objectId: 'bed-1',
  anchor: { x: 5, y: 2, z: 5 },
  approachCells: [{ x: 6, y: 2, z: 5 }],
  usePosition: { x: 5.5, y: 3, z: 5.5 },
};
const SPOT = { x: 20, y: 2, z: 22 };

/** 시각(시)의 시간대. */
function phaseOf(hour: number): DayPhase {
  if (hour >= 20 || hour < 5) return 'night';
  if (hour < 7) return 'dawn';
  if (hour < 12) return 'morning';
  if (hour < 13) return 'noon';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/** 기본 Context. 필요한 항목만 덮어쓴다. 깊이 동결해 decideAction 이 아무것도 바꾸지 않음을 확인한다. */
function ctx(over: Partial<NPCContext> & { hour?: number } = {}): NPCContext {
  const hour = over.hour ?? 9;
  const base: NPCContext = {
    npc: {
      id: 'farmer-1',
      role: 'farmer',
      cell: { x: 10, y: 2, z: 10 },
      actionKind: 'idle',
      actionKey: 'idle',
      hasEatenThisMeal: false,
      stunned: false,
    },
    assignedBed: null,
    phase: phaseOf(hour),
    gameMinutes: 0,
    minuteOfDay: hour * 60,
    threatNearby: null,
    dialogueRequested: false,
    mealActive: false,
    storage: { seed: 3, crop: 0, food: 0 },
    worldState: {
      foodLevel: 0,
      housingLevel: 0,
      safetyLevel: 100,
      happinessLevel: 30,
      population: 1,
    },
    plazaSpot: SPOT,
    candidates: { diningSeat: null, farm: null, cooking: null, repair: null },
  };
  const { hour: _h, ...rest } = over;
  void _h;
  return deepFreeze({ ...base, ...rest });
}

/** 객체를 깊이 동결한다. */
function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/** 계획 종류(null 이면 'keep'). */
function kind(p: ActionPlan | null): string {
  return p === null ? 'keep' : p.kind;
}

describe('decideAction (TASK-029, MVP_SPEC 19.4)', () => {
  it('순수 함수다: 동결된 Context 로 불러도 예외가 없고 같은 입력에 같은 결과다', () => {
    const c = ctx({ hour: 21, assignedBed: BED });
    const a = decideAction(c);
    const b = decideAction(c);
    expect(a).toEqual(b);
  });

  it('1 위협이 모든 것보다 먼저다', () => {
    const p = decideAction(
      ctx({
        hour: 21,
        assignedBed: BED,
        dialogueRequested: true,
        mealActive: true,
        threatNearby: { monsterId: 'm1', pos: { x: 1, y: 2, z: 1 } },
      }),
    );
    expect(kind(p)).toBe('flee');
  });

  it('2 대화가 생리보다 먼저다', () => {
    expect(kind(decideAction(ctx({ hour: 21, assignedBed: BED, dialogueRequested: true })))).toBe(
      'talk',
    );
  });

  it('3 생리: 식사 구간이면 먹고, 취침 시간이면 침대로 가서 잔다', () => {
    const fed = { seed: 3, crop: 0, food: 2 };
    // 식당 의자가 없으면 광장 칸으로 가서 먹는다
    const toPlaza = decideAction(ctx({ hour: 12, mealActive: true, storage: fed }));
    expect(toPlaza?.kind).toBe('move');
    const atPlaza = ctx({
      hour: 12,
      mealActive: true,
      storage: fed,
      npc: { ...ctx().npc, cell: SPOT },
    });
    expect(decideAction(atPlaza)).toMatchObject({ kind: 'eat', seat: null });
    // food 가 0 이면 먹지 않고 넘어간다
    expect(
      kind(decideAction(ctx({ hour: 12, mealActive: true, npc: { ...ctx().npc, cell: SPOT } }))),
    ).toBe('keep');
    const toBed = decideAction(ctx({ hour: 21, assignedBed: BED }));
    expect(toBed?.kind).toBe('move');
    if (toBed?.kind === 'move')
      expect(toBed.goal).toEqual({ kind: 'cells', cells: BED.approachCells });
    const atBed = ctx({
      hour: 21,
      assignedBed: BED,
      npc: { ...ctx().npc, cell: { x: 6, y: 2, z: 5 } },
    });
    expect(kind(decideAction(atBed))).toBe('sleep');
    // 침대가 없으면 광장 칸에서 쉰다
    expect(decideAction(ctx({ hour: 21 }))?.kind).toBe('move');
    expect(kind(decideAction(ctx({ hour: 21, npc: { ...ctx().npc, cell: SPOT } })))).toBe('rest');
  });

  it('3 생리(식사): 식당 의자가 있으면 걸어가 앉고, 먹는 중에는 유지하며, 먹었으면 다시 먹지 않는다', () => {
    const seat = {
      objectId: '21,2,38',
      anchor: { x: 21, y: 2, z: 38 },
      approachCells: [{ x: 20, y: 2, z: 38 }],
      usePosition: { x: 21.5, y: 3, z: 38.5 },
      tableTop: { x: 22.5, y: 3, z: 38.5 },
    };
    const fed = { seed: 3, crop: 0, food: 2 };
    const cand = { diningSeat: seat, farm: null, cooking: null, repair: null };
    const toSeat = decideAction(
      ctx({ hour: 12, mealActive: true, storage: fed, candidates: cand }),
    );
    expect(toSeat).toMatchObject({
      kind: 'move',
      purpose: { kind: 'seat', seatObjectId: seat.objectId },
    });
    const atSeat = ctx({
      hour: 12,
      mealActive: true,
      storage: fed,
      candidates: cand,
      npc: { ...ctx().npc, cell: { x: 20, y: 2, z: 38 } },
    });
    expect(decideAction(atSeat)).toMatchObject({ kind: 'eat', seat: { objectId: seat.objectId } });
    // 먹는 중(음식은 앉을 때 먹어 플래그가 이미 true)에는 구간 동안 유지한다
    const eating = ctx({
      hour: 12,
      mealActive: true,
      npc: { ...ctx().npc, actionKind: 'eat', actionKey: 'eat:21,2,38', hasEatenThisMeal: true },
    });
    expect(decideAction(eating)).toBeNull();
    // 이미 먹었으면 다시 먹지 않는다
    const done = ctx({
      hour: 12,
      mealActive: true,
      storage: fed,
      candidates: cand,
      npc: { ...ctx().npc, hasEatenThisMeal: true },
    });
    expect(kind(decideAction(done))).toBe('keep');
  });

  it('침대로 가는 이동이 진행 중이면 접근 셀에 막 들어서도 이동이 끝날 때까지 유지한다', () => {
    const moving = ctx({
      hour: 21,
      assignedBed: BED,
      npc: {
        ...ctx().npc,
        cell: { x: 6, y: 2, z: 5 },
        actionKind: 'move',
        actionKey: 'move:bed:bed-1',
      },
    });
    expect(decideAction(moving)).toBeNull();
  });

  it('4 역할: 소유 시스템이 준 후보가 있고 작업 시간이면 역할 작업이다', () => {
    const farm = {
      kind: 'plant' as const,
      target: { x: 1, y: 1, z: 1 },
      approachCells: [{ x: 2, y: 2, z: 1 }],
    };
    const c = ctx({ hour: 9, candidates: { diningSeat: null, farm, cooking: null, repair: null } });
    // 작업 칸이 아니면 밭으로 걸어가고, 작업 칸에 서 있으면 심는다
    const toFarm = decideAction(c);
    expect(toFarm?.kind).toBe('move');
    if (toFarm?.kind === 'move')
      expect(toFarm.purpose).toEqual({ kind: 'farm', target: farm.target });
    const atFarm = ctx({
      hour: 9,
      npc: { ...ctx().npc, cell: { x: 2, y: 2, z: 1 } },
      candidates: { diningSeat: null, farm, cooking: null, repair: null },
    });
    expect(kind(decideAction(atFarm))).toBe('plant');
    // 역할이 다르면 해당하지 않는다
    const cook = ctx({
      hour: 9,
      npc: { ...ctx().npc, role: 'cook' },
      candidates: { diningSeat: null, farm, cooking: null, repair: null },
    });
    expect(kind(decideAction(cook))).toBe('keep');
    // 점심 시간에는 역할 작업을 하지 않는다
    const lunch = ctx({
      hour: 12,
      candidates: { diningSeat: null, farm, cooking: null, repair: null },
    });
    expect(kind(decideAction(lunch))).toBe('keep');
  });

  it('4 역할(요리사): 재료가 준비된 화덕이면 걸어가서 조리하고, 식사 여부·음식 양은 보지 않는다', () => {
    const stove: Facility = {
      objectId: 'block:14,2,14',
      anchor: { x: 14, y: 2, z: 14 },
      approachCells: [{ x: 14, y: 2, z: 13 }],
      usePosition: { x: 14.5, y: 2, z: 14.5 },
    };
    const cookNpc = { ...ctx().npc, id: 'cook-1', role: 'cook' as const };
    const cooking = { facility: stove, ingredientsReady: true };
    const cand = { diningSeat: null, farm: null, cooking, repair: null };
    const toStove = decideAction(ctx({ hour: 9, npc: cookNpc, candidates: cand }));
    expect(toStove?.kind).toBe('move');
    if (toStove?.kind === 'move') {
      expect(toStove.purpose).toEqual({ kind: 'cook', stoveObjectId: stove.objectId });
      expect(toStove.label).toBe('주방으로 가는 중');
    }
    // 화덕 앞 칸에 서 있으면 조리한다. 끼니를 거르고 음식이 많아도 마찬가지다
    const atStove = ctx({
      hour: 14,
      npc: { ...cookNpc, cell: { x: 14, y: 2, z: 13 }, hasEatenThisMeal: false },
      storage: { seed: 0, crop: 2, food: 99 },
      candidates: cand,
    });
    expect(kind(decideAction(atStove))).toBe('cook');
    // 재료가 준비되지 않았거나 역할 시간 밖이면 조리하지 않는다
    const notReady = { ...cand, cooking: { facility: stove, ingredientsReady: false } };
    expect(kind(decideAction(ctx({ hour: 9, npc: cookNpc, candidates: notReady })))).toBe('keep');
    expect(kind(decideAction(ctx({ hour: 12, npc: cookNpc, candidates: cand })))).toBe('keep');
  });

  it('5 기본: 아무것도 아니면 대기다. 현재가 대기면 null(유지)이다', () => {
    expect(decideAction(ctx({ hour: 9 }))).toBeNull();
    const walking = ctx({
      hour: 9,
      npc: { ...ctx().npc, actionKind: 'move', actionKey: 'move:x' },
    });
    expect(kind(decideAction(walking))).toBe('idle');
  });

  it('아직 밭 / 주방 / 침대가 없으므로 낮 시간은 대부분 대기다 (정상)', () => {
    const kinds = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((h) =>
      kind(decideAction(ctx({ hour: h }))),
    );
    expect(kinds.every((k) => k === 'keep')).toBe(true);
  });

  it('시간대가 바뀌면 행동이 바뀐다', () => {
    const seq = [9, 19.5, 21, 6].map((h) => decideAction(ctx({ hour: h, assignedBed: BED })));
    expect(seq.map(kind)).toEqual(['keep', 'move', 'move', 'move']);
    expect(seq[1]?.key).not.toBe(seq[2]?.key); // 19:30 광장 → 21:00 침대
    if (seq[3]?.kind === 'move') expect(seq[3].label).toContain('일어나');
  });

  it('기절 중에는 새 Action 을 시작하지 않는다', () => {
    const c = ctx({ hour: 21, assignedBed: BED, npc: { ...ctx().npc, stunned: true } });
    expect(decideAction(c)).toBeNull();
  });

  it('Context 가 전부 readonly 다 (컴파일 검사)', () => {
    const c = ctx();
    const unchecked = (): void => {
      // @ts-expect-error — phase 는 읽기 전용이다
      c.phase = 'night';
      // @ts-expect-error — npc snapshot 도 읽기 전용이다
      c.npc.stunned = true;
      // @ts-expect-error — 후보도 읽기 전용이다
      c.candidates.farm = null;
    };
    expect(typeof unchecked).toBe('function');
  });

  it('Context 가 방 전체·피해 전체 목록과 가변 Action 을 담지 않는다', () => {
    const keys = Object.keys(ctx());
    for (const banned of ['rooms', 'damageLog', 'npcs', 'action', 'world']) {
      expect(keys).not.toContain(banned);
    }
    expect(Object.keys(ctx().npc)).not.toContain('action');
  });
});
