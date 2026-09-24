import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { createMonster, type Monster } from '../src/game/entities/Monster';
import type { GameWorld } from '../src/game/GameWorld';
import { npcCell } from '../src/game/systems/NPCDecisionSystem';
import { at, run, village, Y } from './helpers/village';

/** 움직이지 않는 몬스터(종이 없는 시험 마을에서는 MonsterSystem 이 몬스터를 세워 둔다). */
function monster(w: GameWorld, x: number, z: number): Monster {
  const m = createMonster('m1', 1, { x: 0, y: Y, z: 0 });
  m.body.pos = { x, y: Y, z };
  w.registry.monsters.add(m);
  return m;
}

describe('도피 (TASK-047, MVP_SPEC 19.4)', () => {
  it('몬스터가 반경 12 안에 오면 속도 5.0 으로 도망치고, 방이 있으면 문을 지나 안으로 들어가 숨는다', () => {
    // 시험 마을: 방(내부 x 10~14, z 10~14, 문 (12, Y, 15))과 광장 중심(24, Y, 24). 광장 칸이 없게 종 없이 쓴다
    const w = village(at(9));
    const npc = w.spawnResident('farmer', { x: 12, y: Y, z: 22 });
    run(w, 0.2);
    monster(w, 12.5, 26.5); // 4.5 칸 남쪽
    run(w, 0.2);
    expect(npc.action.kind).toBe('flee');
    expect(npc.action.label).toBe('도망치는 중');
    // 속도: 1 초에 약 5 칸(경로 모퉁이·요청 대기로 조금 덜 갈 수 있다)
    const p0 = { ...npc.body.pos };
    run(w, 1);
    const moved = Math.hypot(npc.body.pos.x - p0.x, npc.body.pos.z - p0.z);
    expect(moved).toBeGreaterThan(balance.npc.moveSpeed + 0.3);
    // run 은 1/30 초 단위라 31 프레임(약 1.03 초)이 될 수 있다
    expect(moved).toBeLessThanOrEqual(balance.npc.fleeSpeed * 1.04 + 0.05);
    run(w, 10, () => npc.action.label === '숨는 중');
    expect(npc.action.label).toBe('숨는 중');
    expect(w.rooms.findContaining(npcCell(npc))).toBeDefined();
  });

  it('도피 중에는 다른 판단을 하지 않는다: 식사 시간이어도 먹으러 가지 않는다', () => {
    const w = village(at(11, 59));
    w.storage.add('food', 3);
    const npc = w.spawnResident('farmer', { x: 20, y: Y, z: 20 });
    monster(w, 20.5, 26.5);
    run(w, 3);
    expect(w.meal.active).toBe(true);
    expect(['flee', 'idle']).toContain(npc.action.kind);
    expect(npc.action.kind).not.toBe('eat');
    expect(npc.hasEatenThisMeal).toBe(false);
  });

  it('위협이 사라지면 하던 일을 이어가지 않고 새로 판단해 시간표로 돌아간다', () => {
    const w = village(at(19, 10)); // 자유 행동: 광장으로 모인다
    const npc = w.spawnResident('farmer', { x: 20, y: Y, z: 30 });
    run(w, 0.3);
    const before = npc.action;
    expect(before.label).toBe('광장으로 모이는 중');
    const m = monster(w, 20.5, 26.5);
    run(w, 0.5);
    expect(npc.action.kind).toBe('flee');
    w.registry.monsters.remove(m.id);
    run(w, 0.3);
    expect(npc.action.kind).not.toBe('flee');
    expect(npc.action.label).toBe('광장으로 모이는 중');
    expect(npc.action).not.toBe(before); // 같은 계획이라도 새 Action 이다
  });

  it('방이 없으면 몬스터 반대쪽으로 달아난다', () => {
    const w = village(at(9), false);
    const npc = w.spawnResident('farmer', { x: 20, y: Y, z: 20 });
    monster(w, 20.5, 25.5);
    run(w, 3);
    // 몬스터(남쪽)에서 멀어졌다
    expect(npc.body.pos.z).toBeLessThan(18);
  });
});
