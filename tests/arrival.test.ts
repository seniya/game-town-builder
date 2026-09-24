import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { buildIsland } from '../src/game/data/island';
import type { GameWorld } from '../src/game/GameWorld';
import { computeWorldState } from '../src/game/systems/WorldStateSystem';
import { at, bed, PLAZA, run, village, Y } from './helpers/village';

/** 레벨 상승을 알린다(종 치기의 결과만 흉내 낸다). */
function levelUp(w: GameWorld, level: number): void {
  w.events.emit('VILLAGE_LEVEL_UP', { level, unlocked: [] });
}

/** 주민 수. */
function population(w: GameWorld): number {
  return w.registry.npcs.size;
}

describe('새 주민 도착 (TASK-038, MVP_SPEC 19.6)', () => {
  it('레벨 2 를 달성하면 다음 07:00 에 한 명이 섬 가장자리에 오고 광장으로 걸어 들어온다', () => {
    const w = village(at(15));
    levelUp(w, 2);
    expect(w.arrivals.snapshot()).toEqual([
      expect.objectContaining({ level: 2, npcId: 'villager-lv2', arrived: false }),
    ]);
    const arrivedEvents: string[] = [];
    w.events.on('NPC_ARRIVED', (e) => arrivedEvents.push(e.npcId));
    w.clock.advanceTo(6, 58);
    run(w, 0.5);
    expect(population(w)).toBe(0);
    run(w, 2, () => population(w) > 0);
    expect(population(w)).toBe(1);
    expect(arrivedEvents).toEqual(['villager-lv2']);
    const v = w.registry.npcs.get('villager-lv2');
    expect(v?.role).toBe('villager');
    // 도착 칸: 광장 남쪽 8 칸(시험 마을의 기본 도착 칸)
    const start = v ? { x: Math.floor(v.body.pos.x), z: Math.floor(v.body.pos.z) } : null;
    expect(start).toEqual({ x: PLAZA.x, z: PLAZA.z + 8 });
    run(w, 0.5);
    expect(v?.action.label).toBe('광장으로 가는 중');
    run(w, 20, () => v?.action.kind === 'idle');
    const d = v ? Math.hypot(v.body.pos.x - PLAZA.x, v.body.pos.z - PLAZA.z) : 99;
    expect(d).toBeLessThanOrEqual(balance.world.plazaRadius + 1);
    // 다음 날에도 다시 오지 않는다
    w.clock.advanceTo(7, 30);
    run(w, 1);
    expect(population(w)).toBe(1);
  });

  it('도착 즉시 빈 침대가 배정된다', () => {
    const w = village(at(6, 58));
    bed(w, 10, 10);
    run(w, 0.5);
    levelUp(w, 2);
    run(w, 10, () => population(w) > 0);
    run(w, 1);
    expect(w.sleep.assignedBed('villager-lv2')).not.toBeNull();
  });

  it('인구 증가를 반영해 지표를 다시 계산한다: 침대 3·food 6 에서 3 → 4 명이면 housing 100 → 75, food 50 → 38', () => {
    const base = { food: 6, accessibleBeds: 3, lastRaid: null, balance };
    const three = computeWorldState({ ...base, population: 3 });
    const four = computeWorldState({ ...base, population: 4 });
    expect([three.housingLevel, three.foodLevel]).toEqual([100, 50]);
    expect([four.housingLevel, four.foodLevel]).toEqual([75, 38]);
    // 게임에서도 도착한 주민이 곧바로 인구와 지표에 들어간다
    const w = village(at(6, 58));
    for (const x of [10, 12, 14]) bed(w, x, 10);
    w.storage.add('food', 6);
    for (const [i, role] of (['farmer', 'cook', 'carpenter'] as const).entries()) {
      w.spawnResident(role, { x: 20 + i, y: Y, z: 20 });
    }
    run(w, 0.5);
    expect([w.worldState.housingLevel, w.worldState.foodLevel]).toEqual([100, 50]);
    levelUp(w, 2);
    run(w, 10, () => population(w) === 4);
    run(w, 0.1);
    expect([w.worldState.housingLevel, w.worldState.foodLevel]).toEqual([75, 38]);
  });

  it('새 주민은 시간표대로 생활한다: 점심에 먹고 밤에 쉰다', () => {
    const w = village(at(6, 58));
    w.storage.add('food', 2);
    levelUp(w, 2);
    run(w, 10, () => population(w) > 0);
    const v = w.registry.npcs.get('villager-lv2');
    w.clock.advanceTo(12, 0);
    run(w, 40, () => v?.action.kind === 'eat');
    expect(v?.action.kind).toBe('eat');
    w.clock.advanceTo(20, 0);
    run(w, 40, () => v?.action.kind === 'rest');
    expect(v?.action.kind).toBe('rest');
  });

  it('레벨 2·3 을 같은 날 달성해도 예약마다 한 명씩 정확히 두 명이 온다', () => {
    const w = village(at(10));
    levelUp(w, 2);
    levelUp(w, 3);
    levelUp(w, 3); // 같은 레벨 이벤트가 다시 와도 예약은 하나다
    expect(w.arrivals.snapshot()).toHaveLength(2);
    w.clock.advanceTo(7, 0);
    run(w, 1);
    expect([...w.registry.npcs.values()].map((n) => n.id).sort()).toEqual([
      'villager-lv2',
      'villager-lv3',
    ]);
    const a = w.registry.npcs.get('villager-lv2')?.body.pos;
    const b = w.registry.npcs.get('villager-lv3')?.body.pos;
    expect(a && b && (a.x !== b.x || a.z !== b.z)).toBe(true);
    run(w, 5);
    expect(population(w)).toBe(2);
  });

  it('종을 07:00 에 치면 다음 날 07:00 에 온다(엄격히 뒤). 예약을 복원해도 두 번 스폰하지 않는다', () => {
    const w = village(at(7));
    levelUp(w, 2);
    const due = w.arrivals.snapshot()[0]?.dueAtGameMinutes ?? 0;
    expect(due - w.clock.gameMinutes).toBe(1440);
    w.clock.advanceTo(6, 57);
    run(w, 0.5);
    expect(population(w)).toBe(0);
    w.clock.advanceTo(7, 0);
    run(w, 1);
    expect(population(w)).toBe(1);
    const saved = w.arrivals.snapshot();
    w.arrivals.restore(saved);
    run(w, 1);
    expect(population(w)).toBe(1);
  });

  it('섬의 도착 칸은 종 남쪽 해안 안쪽 땅이다', () => {
    const d = buildIsland(() => undefined);
    expect(d.residentArrival.x).toBe(d.bellPos.x);
    expect(d.residentArrival.z).toBeGreaterThan(d.bellPos.z + 10);
    const blocks = new Map<string, number>();
    buildIsland((x, y, z, id) => blocks.set(`${x},${y},${z}`, id));
    const r = d.residentArrival;
    const under = blocks.get(`${r.x},${r.y - 1},${r.z}`);
    expect(under !== undefined && under !== BlockId.water).toBe(true);
    expect(blocks.get(`${r.x},${r.y},${r.z}`) ?? BlockId.air).toBe(BlockId.air);
  });
});
