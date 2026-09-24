import { describe, expect, it } from 'vitest';
import { IdleAction } from '../src/game/actions/IdleAction';
import { EntityRegistry } from '../src/game/EntityRegistry';
import { createNPC } from '../src/game/entities/NPC';
import { at, PLAZA, run, village, Y } from './helpers/village';

/** NPC 엔티티 원문. */
const npcSource = Object.values(
  import.meta.glob<string>('../src/game/entities/NPC.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
)[0];

describe('NPC 골격 (TASK-028)', () => {
  it('주민 3 명이 마을에 서 있다', () => {
    const w = village(at(9), false);
    w.spawnResident('farmer', { x: 20, y: Y, z: 20 });
    w.spawnResident('cook', { x: 22, y: Y, z: 20 });
    w.spawnResident('carpenter', { x: 24, y: Y, z: 20 });
    run(w, 1);
    const npcs = [...w.registry.npcs.values()];
    expect(npcs).toHaveLength(3);
    expect(w.registry.npcs.size).toBe(3);
    for (const n of npcs) {
      expect(n.body.onGround).toBe(true);
      expect(n.body.pos.y).toBeCloseTo(Y, 5);
      expect(n.action.kind).toBe('idle');
    }
    expect(new Set(npcs.map((n) => n.role))).toEqual(new Set(['farmer', 'cook', 'carpenter']));
  });

  it('NPC 가 three 를 import 하지 않고 state 같은 필드가 없다 (ADR 008)', () => {
    const src = npcSource ?? '';
    expect(src.length).toBeGreaterThan(0);
    expect(src).not.toMatch(/from ['"]three/);
    const npc = createNPC('a', 'farmer', { x: 1, y: 2, z: 3 }, new IdleAction());
    expect(Object.keys(npc)).not.toContain('state');
    expect(Object.keys(npc).sort()).toEqual(
      [
        'action',
        'body',
        'hasEatenThisMeal',
        'health',
        'id',
        'mealId',
        'role',
        'stunUntilGameMinutes',
      ].sort(),
    );
  });

  it('MoveAction 으로 지정 좌표까지 걸어가고, 경로 응답을 기다린다', () => {
    const w = village(at(9), false);
    const npc = w.spawnResident('farmer', { x: 4, y: Y, z: 4 });
    run(w, 0.2);
    const goal = { x: 14, y: Y, z: 6 };
    w.npcSystem.assign(npc.id, {
      kind: 'move',
      key: 'move:test',
      label: '시험 이동',
      goal: { kind: 'cell', pos: goal },
      destination: goal,
      purpose: { kind: 'plaza' },
    });
    // 계획을 받은 프레임: 경로 요청만 있고 아직 움직이지 않는다(동기 응답을 전제하지 않는다)
    const before = { ...npc.body.pos };
    w.npcSystem.update(1 / 30);
    expect(npc.action.kind).toBe('move');
    expect(w.paths.stats.pending).toBe(1);
    expect(npc.body.pos.x).toBeCloseTo(before.x, 6);
    // 판단 슬롯 없이 경로(6)·실행(11) 슬롯만 돌린다: 시험 계획을 판단이 덮어쓰지 않게 한다
    for (let i = 0; i < 600 && npc.action.kind !== 'idle'; i++) {
      w.paths.update();
      w.npcSystem.update(1 / 30);
    }
    expect(npc.body.pos.x).toBeCloseTo(goal.x + 0.5, 2);
    expect(npc.body.pos.z).toBeCloseTo(goal.z + 0.5, 2);
  });

  it('경로 취소·실패를 처리한다', () => {
    const w = village(at(9), false);
    const npc = w.spawnResident('farmer', { x: 4, y: Y, z: 4 });
    const unreachable = { x: 4, y: Y + 5, z: 4 }; // 공중: 설 수 없는 칸
    w.npcSystem.assign(npc.id, {
      kind: 'move',
      key: 'move:nowhere',
      label: '못 가는 곳',
      goal: { kind: 'cell', pos: unreachable },
      destination: unreachable,
      purpose: { kind: 'plaza' },
    });
    w.npcSystem.update(1 / 30);
    expect(w.paths.stats.pending).toBe(1);
    // 도중에 다른 계획이 오면 요청을 취소한다
    w.npcSystem.assign(npc.id, { kind: 'idle', key: 'idle:other', label: '대기' });
    w.npcSystem.update(1 / 30);
    expect(w.paths.stats.pending).toBe(0);
    // 다시 보내 실패시키면 대기로 돌아간다
    w.npcSystem.assign(npc.id, {
      kind: 'move',
      key: 'move:nowhere',
      label: '못 가는 곳',
      goal: { kind: 'cell', pos: unreachable },
      destination: unreachable,
      purpose: { kind: 'plaza' },
    });
    w.npcSystem.update(1 / 30);
    w.paths.update();
    w.npcSystem.update(1 / 30);
    expect(npc.action.kind).toBe('idle');
  });

  it('디버그 패널에 각 NPC 의 현재 Action label 이 보인다', () => {
    const w = village(at(19, 10), false);
    w.spawnResident('cook', { x: 4, y: Y, z: 4 });
    run(w, 0.5);
    const lines = w.debug.snapshot().npcs;
    expect(lines).toHaveLength(1);
    expect(lines[0]?.label).toBe('광장으로 모이는 중');
    expect(lines[0]?.destination).not.toBeNull();
    expect(lines[0]?.pathLength).toBeGreaterThan(0);
  });

  it('주민 수를 고정하지 않는다: registry fixture 에 100 명을 등록·조회·제거한다', () => {
    const reg = new EntityRegistry<ReturnType<typeof createNPC<IdleAction>>>();
    for (let i = 0; i < 100; i++) {
      reg.npcs.add(createNPC(`npc-${i}`, 'villager', { x: i, y: 1, z: 0 }, new IdleAction()));
    }
    expect(reg.npcs.size).toBe(100);
    expect(reg.npcs.get('npc-57')?.body.pos.x).toBeCloseTo(57.5);
    expect(reg.npcs.remove('npc-57')).toBe(true);
    expect(reg.npcs.get('npc-57')).toBeUndefined();
    expect(reg.npcs.size).toBe(99);
    expect(() => reg.npcs.add(createNPC('npc-1', 'villager', PLAZA, new IdleAction()))).toThrow();
  });
});
