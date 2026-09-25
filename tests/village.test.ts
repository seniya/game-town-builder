import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { GameWorld } from '../src/game/GameWorld';
import { aimRay } from '../src/game/systems/aim';
import { donate } from '../src/game/systems/donation';
import { findInteractTarget } from '../src/game/systems/interaction';
import { VillageLevelSystem } from '../src/game/systems/VillageLevelSystem';
import type { Room } from '../src/game/types';
import { ScreenStateMachine, type ModalName } from '../src/ui/ModalController';
import { at, bed, run, village, Y } from './helpers/village';

/** 게이트 평가만 보는 가짜 방. */
function room(type: Room['type'], beds = 0, dirty = false): Room {
  const f = {
    objectId: 'x',
    anchor: { x: 0, y: 0, z: 0 },
    approachCells: [],
    usePosition: { x: 0, y: 0, z: 0 },
  };
  return {
    id: `${type}-${Math.random()}`,
    type,
    shape: { interior: [], boundary: [], doors: [], floorY: 0 },
    facilities: { beds: Array(beds).fill(f), cookingSpots: [], diningSeats: [], chests: [] },
    center: { x: 0, y: 0, z: 0 },
    dirty,
  };
}

/** 가짜 입력으로 VillageLevelSystem 을 만든다. */
function levels(
  over: { points?: number; rooms?: Room[]; population?: number; food?: number } = {},
) {
  const w = village(at(9));
  const g = w.gratitude;
  if (over.points) g.gain({ kind: 'gameEvent', id: 'test' }, over.points, { x: 0, y: 0, z: 0 });
  const rooms = over.rooms ?? [];
  const sys = new VillageLevelSystem({
    events: w.events,
    gratitude: g,
    rooms: () => rooms,
    population: () => over.population ?? 3,
    food: () => over.food ?? 0,
  });
  return { sys, w, rooms };
}

describe('마을 레벨과 종 (TASK-036, MVP_SPEC 23)', () => {
  it('모든 게이트를 현재값 / 필요값으로 보이고 미충족을 구분한다', () => {
    const { sys } = levels({ points: 120, rooms: [room('Bedroom', 1)] });
    const e = sys.evaluate();
    expect(e.level).toBe(1);
    expect(e.nextLevel).toBe(2);
    expect(e.cost).toBe(80);
    expect(e.gates.map((g) => [g.requirement, g.current, g.required, g.met])).toEqual([
      ['감사 포인트', 120, 80, true],
      ['인식된 방', 1, 2, false],
      ['housingLevel', 33, 50, false],
    ]);
    expect(e.canRing).toBe(false);
    expect(sys.ring()).toBe(false);
    expect(sys.level).toBe(1);
  });

  it('조건을 전부 만족해야 칠 수 있고, 치면 80 을 쓰고 레벨 2 가 된다. 레벨 3 은 200, 총 280', () => {
    const rooms = [room('Bedroom', 2), room('EmptyRoom')];
    const { sys, w } = levels({ points: 280, rooms, population: 3 });
    const ups: number[] = [];
    w.events.on('VILLAGE_LEVEL_UP', (e) => ups.push(e.level));
    expect(sys.evaluate().canRing).toBe(true);
    expect(sys.ring()).toBe(true);
    expect(sys.level).toBe(2);
    expect(w.gratitude.total).toBe(200);
    expect(sys.residentCap).toBe(4);
    // 레벨 3: 방 4, foodLevel 50, housingLevel 100. 음식 안내는 현재 주민 수로 계산한다
    rooms.push(room('Kitchen'), room('Bedroom', 1));
    const e3 = sys.evaluate();
    expect(e3.cost).toBe(200);
    const food = e3.gates.find((g) => g.requirement === 'foodLevel');
    expect(food?.hint).toBe('음식 0 / 6 (주민 3명)');
    expect(e3.canRing).toBe(false);
  });

  it('음식 안내는 주민 4 명이면 food 8 이다(도착 예약 인원은 세지 않는다)', () => {
    const { sys } = levels({
      points: 80,
      rooms: [room('Bedroom', 4), room('Kitchen')],
      population: 4,
    });
    expect(sys.ring()).toBe(true);
    expect(sys.evaluate().gates.find((g) => g.requirement === 'foodLevel')?.hint).toBe(
      '음식 0 / 8 (주민 4명)',
    );
  });

  it('dirty 방은 세지 않고 EmptyRoom 은 센다', () => {
    const { sys } = levels({ rooms: [room('EmptyRoom'), room('Bedroom', 3, true)] });
    const g = sys.evaluate().gates;
    expect(g.find((x) => x.requirement === '인식된 방')?.current).toBe(1);
    expect(g.find((x) => x.requirement === 'housingLevel')?.current).toBe(0);
  });

  it('레벨 3 에서는 다음 단계가 없고 ring 은 상태를 바꾸지 않고 실패한다. 레벨을 내리는 경로가 없다', () => {
    const rooms = [room('Bedroom', 3), room('Kitchen'), room('DiningRoom'), room('EmptyRoom')];
    const { sys, w } = levels({ points: 280, rooms, population: 3, food: 6 });
    expect(sys.ring()).toBe(true);
    expect(sys.ring()).toBe(true);
    expect(sys.level).toBe(3);
    expect(w.gratitude.total).toBe(0);
    expect(sys.evaluate()).toEqual({
      level: 3,
      nextLevel: null,
      cost: 0,
      gates: [],
      canRing: false,
    });
    w.gratitude.gain({ kind: 'gameEvent', id: 'more' }, 50, { x: 0, y: 0, z: 0 });
    expect(sys.ring()).toBe(false);
    expect(sys.level).toBe(3);
    expect(w.gratitude.total).toBe(50);
    // 게이트가 다시 거짓이 되어도 레벨은 유지된다
    rooms.length = 0;
    expect(sys.level).toBe(3);
    const methods = Object.getOwnPropertyNames(VillageLevelSystem.prototype);
    expect(methods.filter((m) => /down|lower|decrease|setLevel/i.test(m))).toEqual([]);
  });

  it('게임에서 현재 방·지표로 재평가한다(실제 방 인식 연동)', () => {
    const w = village(at(9));
    w.spawnResident('farmer', { x: 20, y: Y, z: 20 });
    w.spawnResident('cook', { x: 21, y: Y, z: 20 });
    bed(w, 10, 10);
    run(w, 0.5);
    const g = w.village.evaluate().gates;
    // 방 1(침실), 침대 1 / 주민 2 = 50, 감사 포인트 20(최초 침실)
    expect(g.map((x) => x.current)).toEqual([20, 1, 50]);
  });
});

describe('기부 (MVP_SPEC 13.2 / 13.2.1)', () => {
  it('인벤토리의 seed / crop / food 를 1 개 또는 전부 마을 저장소로 옮긴다', () => {
    const w = village(at(9));
    const seed = { kind: 'material', material: 'seed' } as const;
    w.inventory.add([{ item: seed, count: 4 }]);
    const s0 = w.storage.get('seed');
    expect(donate(w.inventory, w.storage, 'seed', 1)).toBe(1);
    expect(w.inventory.count(seed)).toBe(3);
    expect(donate(w.inventory, w.storage, 'seed', 'all')).toBe(3);
    expect(w.inventory.count(seed)).toBe(0);
    expect(w.storage.get('seed')).toBe(s0 + 4);
    // 없으면 아무것도 바뀌지 않는다
    expect(donate(w.inventory, w.storage, 'food', 'all')).toBe(0);
    expect(w.storage.get('food')).toBe(0);
  });
});

/** 플레이어가 있는 작은 평지. */
function playWorld(): GameWorld {
  const w = new GameWorld({
    storage: balance.storage,
    worldSize: { sizeX: 32, sizeY: 12, sizeZ: 32 },
    playerSpawn: { x: 16, y: Y, z: 20 },
    startGameMinutes: at(9),
  });
  for (let x = 0; x < 32; x++)
    for (let z = 0; z < 32; z++) {
      w.voxels.writeInitial(x, 0, z, BlockId.bedrock);
      w.voxels.writeInitial(x, 1, z, BlockId.grass);
    }
  w.rooms.rebuildAll();
  return w;
}

/** 조준 광선 위 거리 d 의 칸. */
function cellOnRay(w: GameWorld, d: number): { x: number; y: number; z: number } {
  const p = w.player;
  if (!p) throw new Error('플레이어 없음');
  const r = aimRay(w.voxels, p);
  return {
    x: Math.floor(r.origin.x + r.direction.x * d),
    y: Math.floor(r.origin.y + r.direction.y * d),
    z: Math.floor(r.origin.z + r.direction.z * d),
  };
}

describe('상호작용 대상 선택 (READY-07)', () => {
  it('조준한 종·상자를 고르고, 벽 너머·사거리 밖은 고르지 않는다', () => {
    const w = playWorld();
    const p = w.player;
    if (!p) throw new Error('플레이어 없음');
    const npcs = () => w.registry.npcs.values();
    const c = cellOnRay(w, 2.5);
    w.voxels.setBlock(c.x, c.y, c.z, BlockId.bell, 'player');
    expect(findInteractTarget(w.voxels, p, npcs())).toMatchObject({ kind: 'bell', pos: c });
    // 앞에 벽을 세우면 종을 고를 수 없다(가림)
    const wall = cellOnRay(w, 1.2);
    w.voxels.setBlock(wall.x, wall.y, wall.z, BlockId.plank, 'player');
    expect(findInteractTarget(w.voxels, p, npcs())).toBeNull();
    w.voxels.setBlock(wall.x, wall.y, wall.z, BlockId.air, 'player');
    // 상자는 저장소 대상이다(Storeroom 이 아니어도)
    w.voxels.setBlock(c.x, c.y, c.z, BlockId.chest, 'player');
    expect(findInteractTarget(w.voxels, p, npcs())?.kind).toBe('chest');
    // 사거리(reachDistance) 밖이면 없다
    w.voxels.setBlock(c.x, c.y, c.z, BlockId.air, 'player');
    const far = cellOnRay(w, balance.player.reachDistance + 1.5);
    w.voxels.setBlock(far.x, far.y, far.z, BlockId.bell, 'player');
    expect(findInteractTarget(w.voxels, p, npcs())).toBeNull();
  });

  it('종보다 가까운 주민이 광선에 있으면 주민이 대상이다(패널은 하나)', () => {
    const w = playWorld();
    const p = w.player;
    if (!p) throw new Error('플레이어 없음');
    const c = cellOnRay(w, 3.5);
    w.voxels.setBlock(c.x, c.y, c.z, BlockId.bell, 'player');
    const near = cellOnRay(w, 1.8);
    const npc = w.spawnResident('farmer', { x: near.x, y: Y, z: near.z });
    const r = aimRay(w.voxels, p);
    npc.body.pos = {
      x: r.origin.x + r.direction.x * 1.8,
      y: Y,
      z: r.origin.z + r.direction.z * 1.8,
    };
    expect(findInteractTarget(w.voxels, p, w.registry.npcs.values())).toEqual({
      kind: 'npc',
      npcId: npc.id,
    });
  });

  it('F 는 조작 중에만 대상 패널 하나를 열고, 열린 동안 다른 모달 키는 무시하며 F 로 닫는다', async () => {
    const opened: string[] = [];
    const view = (name: string) => ({
      open: () => opened.push(`open:${name}`),
      close: () => opened.push(`close:${name}`),
    });
    let target: ModalName | null = 'bell';
    const m = new ScreenStateMachine(
      {
        requestLock: () => Promise.resolve(true),
        exitLock: () => undefined,
        setGameplayBlocked: () => undefined,
        showMenu: () => undefined,
        hideMenu: () => undefined,
      },
      { inventory: view('inventory'), bell: view('bell'), storage: view('storage') },
      () => target,
    );
    expect(m.key('KeyF')).toBe(false); // 메뉴에서는 열지 않는다
    m.lockAcquired();
    expect(m.key('KeyF')).toBe(true);
    expect(m.state).toEqual({ kind: 'modal', name: 'bell' });
    expect(m.key('KeyE')).toBe(false); // 다른 모달 키는 무시
    expect(m.key('KeyF')).toBe(true); // F 로 닫는다
    await Promise.resolve();
    m.lockAcquired();
    target = null;
    expect(m.key('KeyF')).toBe(false);
    target = 'storage';
    expect(m.key('KeyF')).toBe(true);
    expect(opened).toEqual(['open:bell', 'close:bell', 'open:storage']);
  });

  it('Test 7-1 (MVP_SPEC 39): 다른 게이트를 다 만족해도 감사 포인트가 79 면 칠 수 없고, 부족한 것은 포인트뿐이다', () => {
    const { sys } = levels({
      points: 79,
      rooms: [room('Bedroom', 2), room('EmptyRoom')],
      population: 3,
    });
    const e = sys.evaluate();
    expect(e.canRing).toBe(false);
    expect(e.gates.filter((g) => !g.met).map((g) => g.requirement)).toEqual(['감사 포인트']);
    expect(sys.ring()).toBe(false);
  });
});
