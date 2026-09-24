import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { GAME_EVENT_ORDER } from '../src/game/data/gameEventOrder';
import { GAME_EVENTS } from '../src/game/data/gameEvents';
import { EventBus } from '../src/game/EventBus';
import { GameWorld } from '../src/game/GameWorld';
import { GameEventSystem } from '../src/game/systems/GameEventSystem';
import type {
  EventContext,
  GameCommand,
  GameEventDefinition,
  GameEventId,
  RaidResult,
  Room,
} from '../src/game/types';
import { at, run, Y } from './helpers/village';

/** 빈 방. */
function room(dirty = false): Room {
  return {
    id: `r${Math.random()}`,
    type: 'EmptyRoom',
    shape: { interior: [], boundary: [], doors: [], floorY: 0 },
    facilities: { beds: [], cookingSpots: [], diningSeats: [], chests: [] },
    center: { x: 0, y: 0, z: 0 },
    dirty,
  };
}

/** 조건 평가용 snapshot. 필요한 것만 덮어쓴다. */
function ctx(
  over: Partial<EventContext> & { done?: GameEventId[]; minutes?: number } = {},
): EventContext {
  const { done, minutes, ...rest } = over;
  const gm = minutes ?? 0;
  return {
    clock: {
      gameMinutes: gm,
      day: 1 + Math.floor(gm / 1440),
      minuteOfDay: (420 + gm) % 1440,
      phase: 'morning',
    },
    storage: { seed: 3, crop: 0, food: 0 },
    worldState: {
      foodLevel: 0,
      housingLevel: 0,
      safetyLevel: 100,
      happinessLevel: 0,
      population: 3,
    },
    rooms: [],
    gratitude: 0,
    bellWorldCenter: { x: 1, y: 2, z: 3 },
    villageLevel: 1,
    raidResults: [],
    completed: new Set(done ?? []),
    dialogueCompleted: new Set(),
    ...rest,
  };
}

/** id 의 정의. */
function def(id: GameEventId): GameEventDefinition {
  const d = GAME_EVENTS.find((e) => e.id === id);
  if (!d) throw new Error(id);
  return d;
}

/** 앞선 모든 이벤트. */
function before(id: GameEventId): GameEventId[] {
  return GAME_EVENT_ORDER.slice(0, GAME_EVENT_ORDER.indexOf(id));
}

const RAID = (raidId: number, endedAtGameMinutes: number): RaidResult => ({
  raidId,
  total: 4,
  reached: 0,
  endedAtGameMinutes,
});

describe('이벤트 골격 (TASK-042, ADR 007)', () => {
  it('execute 는 부작용 없이 커맨드 배열을 반환하고, 해석은 GameEventSystem 한 곳에서만 한다', () => {
    const c = ctx();
    const frozen = JSON.stringify({ ...c, completed: [...c.completed], dialogueCompleted: [] });
    const commands = def('EVENT_ARRIVAL').execute(c);
    expect(commands.map((x) => x.kind)).toEqual([
      'setObjective',
      'markDialogueAvailable',
      'markDialogueAvailable',
      'markDialogueAvailable',
      'gainGratitude',
    ]);
    expect(JSON.stringify({ ...c, completed: [...c.completed], dialogueCompleted: [] })).toBe(
      frozen,
    );
    // 커맨드 4 종에 주민 스폰은 없다
    const kinds = new Set(
      GAME_EVENTS.flatMap((d) => d.execute(ctx()).map((x: GameCommand) => x.kind)),
    );
    expect(
      [...kinds].every((k) =>
        ['setObjective', 'markDialogueAvailable', 'gainGratitude', 'playCutscene'].includes(k),
      ),
    ).toBe(true);
  });

  it('완료된 이벤트는 다시 실행되지 않고, 조건이 거짓이 되어도 완료가 유지된다. 완료를 지우는 경로가 없다', () => {
    let crop = 0;
    let fired = 0;
    const once: GameEventDefinition = {
      id: 'EVENT_ARRIVAL',
      canTrigger: (c) => c.storage.crop >= 1,
      execute: () => {
        fired += 1;
        return [{ kind: 'playCutscene', id: 'x' }];
      },
    };
    const played: string[] = [];
    const sys = new GameEventSystem({
      events: new EventBus(),
      definitions: [once],
      context: () => {
        const { completed: _c, ...rest } = ctx({ storage: { seed: 0, crop, food: 0 } });
        void _c;
        return rest;
      },
      ports: {
        setObjective: () => undefined,
        markDialogueAvailable: () => undefined,
        gainGratitude: () => undefined,
        playCutscene: (id) => played.push(id),
      },
    });
    sys.update();
    expect(fired).toBe(0);
    crop = 1;
    sys.update();
    sys.update();
    expect(fired).toBe(1);
    expect(played).toEqual(['x']);
    crop = 0;
    sys.update();
    expect(sys.completed.has('EVENT_ARRIVAL')).toBe(true);
    const methods = Object.getOwnPropertyNames(GameEventSystem.prototype);
    expect(methods.filter((m) => /remove|delete|reset|undo|rollback/i.test(m))).toEqual([]);
  });
});

describe('진행 이벤트 8 개 (TASK-043, MVP_SPEC 27.1)', () => {
  it('8 개가 표의 순서이고 각각 감사 포인트 +15 를 종 위에 준다', () => {
    expect(GAME_EVENTS.map((e) => e.id)).toEqual(GAME_EVENT_ORDER);
    for (const e of GAME_EVENTS) {
      const g = e.execute(ctx()).filter((c) => c.kind === 'gainGratitude');
      expect(g).toEqual([
        {
          kind: 'gainGratitude',
          amount: balance.gratitude.onGameEvent,
          source: { kind: 'gameEvent', id: e.id },
          at: { x: 1, y: 2, z: 3 },
        },
      ]);
    }
  });

  it('각 조건은 이전 이벤트 완료 AND 표의 조건이다', () => {
    const cases: [GameEventId, Partial<EventContext> & { minutes?: number }][] = [
      ['EVENT_FARM_REQUEST', { dialogueCompleted: new Set(['farmer_first']) }],
      ['EVENT_KITCHEN_REQUEST', { storage: { seed: 0, crop: 3, food: 0 } }],
      ['EVENT_BEDROOM_REQUEST', { storage: { seed: 0, crop: 0, food: 3 } }],
      ['EVENT_BELL_REQUEST', { rooms: [room(), room()] }],
      ['EVENT_WALL_REQUEST', { raidResults: [RAID(1, 100)] }],
      [
        'EVENT_NEW_RESIDENT',
        {
          villageLevel: 3,
          worldState: {
            foodLevel: 50,
            housingLevel: 100,
            safetyLevel: 100,
            happinessLevel: 80,
            population: 5,
          },
        },
      ],
      [
        'EVENT_SLICE_END',
        {
          raidResults: [RAID(1, 100), RAID(2, 3000)],
          minutes: 4320,
          worldState: {
            foodLevel: 50,
            housingLevel: 100,
            safetyLevel: 100,
            happinessLevel: 80,
            population: 5,
          },
        },
      ],
    ];
    for (const [id, over] of cases) {
      const d = def(id);
      // 조건만 있고 이전 이벤트가 없으면 거짓
      expect(d.canTrigger(ctx(over))).toBe(false);
      // 이전 이벤트 완료 + 조건
      expect(d.canTrigger(ctx({ ...over, done: before(id) }))).toBe(true);
      // 이전 이벤트는 있어도 조건이 없으면 거짓
      expect(d.canTrigger(ctx({ done: before(id) }))).toBe(false);
    }
  });

  it('경계 사례: dirty 방은 세지 않고, 엔딩은 2 차 습격 종료 뒤 첫 07:00 도달로 판정한다', () => {
    const bell = def('EVENT_BELL_REQUEST');
    expect(
      bell.canTrigger(ctx({ rooms: [room(), room(true)], done: before('EVENT_BELL_REQUEST') })),
    ).toBe(false);
    const end = def('EVENT_SLICE_END');
    const base = {
      raidResults: [RAID(1, 100), RAID(2, 3000)],
      worldState: {
        foodLevel: 50,
        housingLevel: 100,
        safetyLevel: 100,
        happinessLevel: 80,
        population: 5,
      },
      done: before('EVENT_SLICE_END'),
    };
    // 3000 분(Day 3 09:00) 뒤 첫 07:00 은 4320 분(Day 4 07:00)
    expect(end.canTrigger(ctx({ ...base, minutes: 4319 }))).toBe(false);
    expect(end.canTrigger(ctx({ ...base, minutes: 4320 }))).toBe(true);
    expect(end.canTrigger(ctx({ ...base, minutes: 5000 }))).toBe(true);
    expect(end.canTrigger(ctx({ ...base, minutes: 4320, raidResults: [RAID(1, 100)] }))).toBe(
      false,
    );
  });

  it('게임에서: 시작하면 목표와 세 주민의 대화 표시가 생기고, 농부 대화를 마치면 FARM_REQUEST, 작물 3 이면 주방 요청이 온다', () => {
    const w = new GameWorld({
      storage: balance.storage,
      worldSize: { sizeX: 24, sizeY: 8, sizeZ: 24 },
      startGameMinutes: at(9),
      plazaCenter: { x: 12, y: Y, z: 12 },
    });
    for (let x = 0; x < 24; x++)
      for (let z = 0; z < 24; z++) {
        w.voxels.writeInitial(x, 0, z, BlockId.bedrock);
        w.voxels.writeInitial(x, 1, z, BlockId.grass);
      }
    w.rooms.rebuildAll();
    const farmer = w.spawnResident('farmer', { x: 5, y: Y, z: 5 });
    const cook = w.spawnResident('cook', { x: 6, y: Y, z: 5 });
    run(w, 0.1);
    expect(w.gameEvents.completed.has('EVENT_ARRIVAL')).toBe(true);
    expect(w.objectives.view?.text).toBe('섬을 둘러보세요');
    expect(w.dialogue.hasDialogue(farmer)).toBe(true);
    expect(w.dialogue.hasDialogue(cook)).toBe(true);
    expect(w.gratitude.total).toBe(15);
    w.dialogue.begin(farmer);
    while (w.dialogue.advance());
    run(w, 0.1);
    expect(w.gameEvents.completed.has('EVENT_FARM_REQUEST')).toBe(true);
    expect(w.objectives.view?.text).toBe('밭흙을 4 칸 만들어 주세요');
    expect(w.gratitude.total).toBe(30);
    // 같은 요청을 다시 듣게 하지 않는다
    expect(w.dialogue.hasDialogue(farmer)).toBe(false);
    w.storage.add('crop', 3);
    run(w, 0.1);
    expect(w.gameEvents.completed.has('EVENT_KITCHEN_REQUEST')).toBe(true);
    // 요리사: 첫 인사 뒤에 주방 요청이 순서대로 쌓인다(덮어쓰지 않는다)
    expect(
      w.dialogue
        .snapshot()
        .available.filter((a) => a.npcId === 'cook')
        .map((a) => a.dialogueId),
    ).toEqual(['cook_first', 'kitchen_request']);
    // 작물이 줄어도 완료는 되돌아가지 않는다
    w.storage.take('crop', 3);
    run(w, 0.1);
    expect(w.gameEvents.completed.has('EVENT_KITCHEN_REQUEST')).toBe(true);
  });
});
