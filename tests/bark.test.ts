import { describe, expect, it } from 'vitest';
import { barkLines } from '../src/game/data/barks';
import { createNPC, type NPC } from '../src/game/entities/NPC';
import { EventBus, type GameEventMap } from '../src/game/EventBus';
import { captureSave } from '../src/game/save/saveData';
import { BarkSystem } from '../src/game/systems/BarkSystem';
import type {
  ActionKind,
  ActionView,
  BlockPos,
  DayPhase,
  FacilityUse,
  NPCRole,
  Vec3,
} from '../src/game/types';
import { at, bed, run, village, Y } from './helpers/village';

type Bark = GameEventMap['NPC_BARK'];

/** 시험용 Action view. */
function view(kind: ActionKind, facilityUse?: FacilityUse): ActionView {
  return { kind, label: kind, key: kind, facilityUse };
}

const SEAT: FacilityUse = { objectId: 'chair', usePosition: { x: 0, y: 0, z: 0 }, pose: 'sit' };

/** 가짜 조회로 만든 BarkSystem. 시각·플레이어·침대·식사·대화를 시험이 바꾼다. */
function harness(hour = 10) {
  const events = new EventBus();
  const clock = { gameMinutes: 1000, day: 1, minuteOfDay: hour * 60, phase: 'noon' as DayPhase };
  const npcs = new Map<string, NPC<ActionView>>();
  const rooms = new Map<string, BlockPos>();
  const s = {
    player: { x: 50, y: Y, z: 50 } as Vec3 | null,
    beds: new Set<string>(),
    meal: false,
    food: 5,
    talking: null as string | null,
  };
  const sys = new BarkSystem({
    events,
    clock,
    npcs: () => npcs.values(),
    npcById: (id) => npcs.get(id),
    playerPos: () => s.player,
    roomCenter: (id) => rooms.get(id),
    hasBed: (id) => s.beds.has(id),
    mealActive: () => s.meal,
    food: () => s.food,
    talking: (id) => s.talking === id,
  });
  const barks: Bark[] = [];
  events.on('NPC_BARK', (b) => barks.push(b));
  return {
    events,
    clock,
    npcs,
    rooms,
    s,
    sys,
    barks,
    /** 주민 하나를 세운다. */
    add(id: string, role: NPCRole, x = 0, z = 0): NPC<ActionView> {
      const n = createNPC<ActionView>(id, role, { x, y: Y, z }, view('idle'));
      npcs.set(id, n);
      return n;
    },
    /** Action 을 바꾸고 NPC_ACTION_CHANGED 를 낸다(NPCSystem 과 같은 순서). */
    act(id: string, kind: ActionKind, use?: FacilityUse): void {
      const n = npcs.get(id);
      if (!n) throw new Error(id);
      n.action = view(kind, use);
      events.emit('NPC_ACTION_CHANGED', { npcId: id, label: kind });
    },
    /** 초만큼 update 한다(0.1 초 단위). */
    tick(seconds: number): void {
      for (let t = 0; t < seconds - 1e-9; t += 0.1) sys.update(0.1);
    },
    /** 시각을 바꾼다. */
    setHour(h: number, phase: DayPhase): void {
      clock.minuteOfDay = h * 60;
      clock.phase = phase;
    },
    /** 마지막 한마디의 상황. */
    last(): string | undefined {
      return barks.at(-1)?.topic;
    },
  };
}

describe('주민의 한마디 (TASK-BARK-001, MVP_SPEC 19.7)', () => {
  it('Action 이 바뀌면 그 상황의 문장을 말한다(역할별 문장이 있으면 그것)', () => {
    const h = harness();
    h.add('f', 'farmer');
    h.add('c', 'cook');
    h.add('k', 'carpenter');
    h.add('v', 'villager');
    const cases: [string, ActionKind, FacilityUse | undefined, string][] = [
      ['f', 'harvest', undefined, 'harvest'],
      ['c', 'cook', undefined, 'cook'],
      ['k', 'repair', undefined, 'repair'],
      ['v', 'eat', SEAT, 'eatDining'],
    ];
    for (const [id, kind, use, topic] of cases) {
      h.act(id, kind, use);
      h.tick(0.1);
      expect(h.barks.at(-1)).toMatchObject({ npcId: id, topic });
    }
    // 공통 간격 10 초 뒤 다른 상황
    h.tick(11);
    for (const [id, kind, use, topic] of [
      ['f', 'plant', undefined, 'plant'],
      ['c', 'eat', undefined, 'eatPlaza'],
      ['k', 'rest', undefined, 'noBed'],
      ['v', 'sleep', undefined, 'sleep'],
    ] as const) {
      h.act(id, kind, use);
      h.tick(0.1);
      expect(h.barks.at(-1)).toMatchObject({ npcId: id, topic });
    }
    // 문장은 데이터의 그 상황·역할 문장이다
    for (const b of h.barks) {
      const role = h.npcs.get(b.npcId)?.role ?? 'villager';
      expect(barkLines(b.topic, role)).toContain(b.text);
    }
    // 서 있기·걷기 시작은 말하지 않는다
    h.tick(11);
    const n = h.barks.length;
    h.act('f', 'move');
    h.act('c', 'idle');
    h.tick(0.1);
    expect(h.barks).toHaveLength(n);
  });

  it('05:00~09:00 에 잠(침대)·쉬기(바닥)에서 깨면 기상 문장, 다른 시각에는 말하지 않는다', () => {
    const h = harness();
    h.add('a', 'farmer');
    h.add('b', 'cook');
    h.setHour(4, 'night');
    h.act('a', 'sleep');
    h.act('b', 'rest');
    h.tick(11);
    h.setHour(5.2, 'dawn');
    h.barks.length = 0;
    h.act('a', 'idle');
    h.act('b', 'move');
    h.tick(0.1);
    expect(h.barks.map((b) => [b.npcId, b.topic])).toEqual([
      ['a', 'wake'],
      ['b', 'wakeFloor'],
    ]);
    // 낮잠처럼 다른 시각의 전환은 기상이 아니다
    h.tick(11);
    h.setHour(14, 'afternoon');
    h.act('a', 'sleep');
    h.tick(11);
    h.barks.length = 0;
    h.act('a', 'idle');
    h.tick(0.1);
    expect(h.barks).toHaveLength(0);
  });

  it('공통 간격 10 초·일 간격 90 초를 지키고, 도피·맞음은 공통 간격을 무시한다', () => {
    const h = harness();
    h.add('f', 'farmer');
    h.act('f', 'harvest');
    h.tick(1);
    h.act('f', 'plant'); // 1 초 뒤: 공통 간격
    h.tick(0.1);
    expect(h.barks.map((b) => b.topic)).toEqual(['harvest']);
    h.tick(11);
    h.act('f', 'harvest'); // 11 초 뒤: 같은 일 간격(90)
    h.tick(0.1);
    expect(h.barks.map((b) => b.topic)).toEqual(['harvest']);
    h.act('f', 'plant'); // 다른 일은 된다
    h.tick(0.1);
    expect(h.barks.map((b) => b.topic)).toEqual(['harvest', 'plant']);
    h.act('f', 'flee'); // 도피는 공통 간격 무시
    h.tick(0.1);
    h.events.emit('COMBAT_HIT', { target: 'npc', id: 'f', at: { x: 0, y: 0, z: 0 } });
    h.tick(0.1);
    expect(h.barks.map((b) => b.topic)).toEqual(['harvest', 'plant', 'flee', 'hit']);
    h.act('f', 'flee'); // 도피 간격 30
    h.tick(0.1);
    expect(h.last()).toBe('hit');
    h.tick(90);
    h.act('f', 'harvest');
    h.tick(0.1);
    expect(h.last()).toBe('harvest');
  });

  it('자는 중·대화 중에는 말하지 않고, 기절 중에는 맞음 / 기절 문장만 한다', () => {
    const h = harness();
    const n = h.add('f', 'farmer', 50, 50);
    h.act('f', 'sleep');
    h.tick(0.1);
    expect(h.last()).toBe('sleep'); // 잠드는 말은 한다
    h.tick(20);
    h.events.emit('COMBAT_HIT', { target: 'npc', id: 'f', at: n.body.pos });
    h.events.emit('RAID_ENDED', { raidId: 1, total: 1, reached: 0, endedAtGameMinutes: 0 });
    h.tick(0.6);
    expect(h.barks).toHaveLength(1); // 자는 중: 맞음·습격 끝·인사 모두 없음
    expect(h.sys.canPoke('f')).toBe(false);
    // 대화 중
    h.act('f', 'idle');
    h.s.talking = 'f';
    h.act('f', 'harvest');
    h.tick(20);
    expect(h.sys.poke('f')).toBe(false);
    expect(h.barks).toHaveLength(1);
    h.s.talking = null;
    // 기절 중
    n.stunUntilGameMinutes = h.clock.gameMinutes + 30;
    h.act('f', 'plant');
    h.tick(20);
    expect(h.barks).toHaveLength(1);
    h.events.emit('COMBAT_HIT', { target: 'npc', id: 'f', at: n.body.pos });
    h.tick(0.1);
    expect(h.last()).toBe('stunned');
    h.tick(6);
    expect(h.sys.poke('f')).toBe(true);
    expect(h.last()).toBe('stunned');
  });

  it('말 걸기의 우선순위: 도피 → 기절 → 배고픔 → 잘 곳 없음 → 하는 일 → 역할별 잡담', () => {
    const h = harness(21);
    h.setHour(21, 'night');
    const n = h.add('c', 'cook');
    const poke = (): string | undefined => {
      h.tick(1.1);
      expect(h.sys.poke('c')).toBe(true);
      return h.last();
    };
    h.s.meal = true;
    h.s.food = 0;
    n.action = view('flee');
    expect(poke()).toBe('flee');
    n.action = view('idle');
    n.stunUntilGameMinutes = h.clock.gameMinutes + 10;
    expect(poke()).toBe('stunned');
    n.stunUntilGameMinutes = 0;
    expect(poke()).toBe('hungry');
    expect(barkLines('hungry', 'cook')).toContain(h.barks.at(-1)?.text);
    h.s.food = 5;
    expect(poke()).toBe('noBed');
    h.s.beds.add('c');
    n.action = view('cook');
    expect(poke()).toBe('cook');
    n.action = view('move');
    expect(poke()).toBe('idle');
    expect(barkLines('idle', 'cook')).toContain(h.barks.at(-1)?.text);
    // 낮에는 침대가 없어도 잘 곳 없음이 아니다
    h.s.beds.clear();
    h.setHour(10, 'morning');
    expect(poke()).toBe('idle');
    // 말 걸기 간격 1 초
    expect(h.sys.poke('c')).toBe(false);
  });

  it('문장 고르기는 결정적이고, 같은 주민·상황을 되풀이하면 돌아가며 바뀐다', () => {
    const texts = (): string[] => {
      const h = harness();
      h.add('farmer', 'farmer');
      const out: string[] = [];
      for (let i = 0; i < 6; i++) {
        h.tick(1.1);
        h.sys.poke('farmer');
        out.push(h.barks.at(-1)?.text ?? '');
      }
      return out;
    };
    const a = texts();
    expect(texts()).toEqual(a);
    const lines = barkLines('idle', 'farmer');
    expect(new Set(a.slice(0, lines.length)).size).toBe(lines.length);
    expect(a.slice(lines.length)).toEqual(a.slice(0, a.length - lines.length));
  });

  it('플레이어가 반경 4 안에 들어오면 시간대 인사를 한 번 하고, 120 초 안에는 되풀이하지 않는다', () => {
    const h = harness();
    h.setHour(21, 'night');
    h.add('a', 'villager', 10, 10);
    h.add('b', 'villager', 30, 30);
    h.s.player = { x: 12, y: Y, z: 10.5 };
    h.tick(0.6);
    expect(h.barks.map((b) => [b.npcId, b.topic])).toEqual([['a', 'greet']]);
    expect(barkLines('greet', 'villager', { phase: 'night' })).toContain(h.barks[0]?.text);
    h.tick(5); // 머무는 동안 되풀이하지 않는다
    h.s.player = { x: 40, y: Y, z: 10 };
    h.tick(1);
    h.s.player = { x: 12, y: Y, z: 10 };
    h.tick(1); // 떠났다 돌아와도 120 초 안이면 없다
    expect(h.barks).toHaveLength(1);
    h.s.player = { x: 40, y: Y, z: 10 };
    h.tick(120);
    h.setHour(8, 'morning');
    h.s.player = { x: 12, y: Y, z: 10 };
    h.tick(0.6);
    expect(h.barks).toHaveLength(2);
    expect(barkLines('greet', 'villager', { phase: 'morning' })).toContain(h.barks[1]?.text);
  });

  it('새 방: 방 중심 16 칸 안의 가장 가까운 주민 한 명이 방 타입 문장을 말한다. 빈 방으로 바뀐 것은 무시한다', () => {
    const h = harness();
    h.add('near', 'cook', 12, 10);
    h.add('far', 'farmer', 20, 10);
    h.add('away', 'carpenter', 60, 60);
    h.rooms.set('r1', { x: 10, y: Y, z: 10 });
    h.rooms.set('r2', { x: 90, y: Y, z: 90 });
    h.events.emit('ROOM_REGISTERED', { roomId: 'r1', type: 'Kitchen' });
    h.events.emit('ROOM_REGISTERED', { roomId: 'r2', type: 'Bedroom' });
    h.tick(0.1);
    expect(h.barks).toHaveLength(1);
    expect(h.barks[0]).toMatchObject({ npcId: 'near', topic: 'newRoom' });
    expect(barkLines('newRoom', 'cook', { roomType: 'Kitchen' })).toContain(h.barks[0]?.text);
    h.tick(11);
    h.events.emit('ROOM_TYPE_CHANGED', { roomId: 'r1', from: 'Kitchen', to: 'EmptyRoom' });
    h.tick(0.1);
    expect(h.barks).toHaveLength(1);
    h.events.emit('ROOM_TYPE_CHANGED', { roomId: 'r1', from: 'EmptyRoom', to: 'DiningRoom' });
    h.tick(0.1);
    expect(h.barks).toHaveLength(2);
  });

  it('습격 끝·마을 레벨은 플레이어 16 칸 안의 주민이, 도착은 그 주민이 말한다', () => {
    const h = harness();
    h.add('a', 'farmer', 50, 55);
    h.add('b', 'cook', 50, 80);
    h.add('v', 'villager', 0, 0);
    h.events.emit('RAID_ENDED', { raidId: 1, total: 3, reached: 0, endedAtGameMinutes: 0 });
    h.events.emit('NPC_ARRIVED', { npcId: 'v' });
    h.tick(0.1);
    expect(h.barks.map((b) => [b.npcId, b.topic])).toEqual([
      ['a', 'raidEnd'],
      ['v', 'arrived'],
    ]);
    h.tick(11);
    h.events.emit('VILLAGE_LEVEL_UP', { level: 2, unlocked: [] });
    h.tick(0.1);
    expect(h.last()).toBe('levelUp');
    expect(h.barks.at(-1)?.npcId).toBe('a');
  });

  it('실제 월드: 침대 없는 주민이 20:00 에 광장에서 쉬며 잘 곳이 없다고 말하고, 한마디는 게임 상태를 바꾸지 않는다', () => {
    const w = village(at(19, 50));
    const npc = w.spawnResident('carpenter', { x: 20, y: Y, z: 26 });
    const barks: Bark[] = [];
    w.events.on('NPC_BARK', (b) => barks.push(b));
    run(w, 60, () => npc.action.kind === 'rest');
    run(w, 0.1);
    expect(barks.map((b) => b.topic)).toContain('noBed');
    // 말 걸기 전후의 저장 데이터·Action·저장소가 같다
    run(w, 2);
    const before = JSON.stringify(captureSave(w));
    const action = npc.action;
    expect(w.barks.poke(npc.id)).toBe(true);
    expect(barks.at(-1)?.topic).toBe('noBed');
    expect(JSON.stringify(captureSave(w))).toBe(before);
    expect(npc.action).toBe(action);
  });

  it('실제 월드: 침대에서 잠들 때 잘 자라고 말한다', () => {
    const w = village(at(19, 50));
    bed(w, 10, 10);
    const npc = w.spawnResident('farmer', { x: 20, y: Y, z: 26 });
    const barks: Bark[] = [];
    w.events.on('NPC_BARK', (b) => barks.push(b));
    run(w, 60, () => npc.action.kind === 'sleep');
    run(w, 0.1);
    expect(barks.at(-1)).toMatchObject({ npcId: npc.id, topic: 'sleep' });
    expect(w.barks.canPoke(npc.id)).toBe(false);
  });

  it('주민 100 명: 0.5 초마다의 인사 확인이 가볍다', () => {
    const h = harness();
    for (let i = 0; i < 100; i++) h.add(`v${i}`, 'villager', (i % 10) * 3, Math.floor(i / 10) * 3);
    const t0 = performance.now();
    // 60 초 동안 플레이어가 마을을 가로지른다(1/60 초 프레임)
    for (let f = 0; f < 3600; f++) {
      h.s.player = { x: (f / 3600) * 30, y: Y, z: 15 };
      h.sys.update(1 / 60);
    }
    const ms = performance.now() - t0;
    expect(h.barks.length).toBeGreaterThan(0);
    // 프레임당 평균이 0.05 ms 를 넘지 않는다(3600 프레임 180 ms). 시험 기계 편차를 넉넉히 둔다
    expect(ms).toBeLessThan(180);
  });
});
