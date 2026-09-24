import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { buildIsland } from '../src/game/data/island';
import { dialogueById } from '../src/game/data/dialogues';
import type { GameEventMap } from '../src/game/EventBus';
import { GameWorld } from '../src/game/GameWorld';
import {
  applySave,
  captureSave,
  migrate,
  SaveRejectedError,
  type SaveData,
} from '../src/game/save/saveData';
import { blockItem } from '../src/game/systems/InventorySystem';
import type { SaveStore } from '../src/game/systems/SaveSystem';
import { at, run } from './helpers/village';

const island = buildIsland(() => undefined);

/** main 과 같은 고정 섬 월드. */
function islandWorld(startHour = 9, store?: SaveStore): GameWorld {
  const w = new GameWorld({
    storage: balance.storage,
    worldSize: balance.world,
    startGameMinutes: at(startHour),
    playerSpawn: island.playerSpawn,
    plazaCenter: island.bellPos,
    quarryCandidates: island.quarryRespawnCandidates,
    arrivalCell: island.residentArrival,
    monsterSpawns: island.monsterSpawns,
    ...(store ? { saveStore: store } : {}),
  });
  buildIsland((x, y, z, id) => w.voxels.writeInitial(x, y, z, id));
  w.voxels.markAllDirty();
  w.rooms.rebuildAll();
  w.spawnResident('farmer', island.npcSpawns.farmer);
  w.spawnResident('cook', island.npcSpawns.cook);
  w.spawnResident('carpenter', island.npcSpawns.carpenter);
  return w;
}

/** 저장 → (저장소 왕복을 흉내 낸 복제) → 새 섬에 불러오기. */
function roundTrip(w: GameWorld, startHour = 9): GameWorld {
  const data = structuredClone(captureSave(w));
  const next = islandWorld(startHour);
  applySave(next, data);
  return next;
}

/** 섬 한가운데(종 남동쪽)에 판자 방 하나를 짓는다: 내부 5 × 5, 남쪽 문. */
function buildRoom(w: GameWorld, x0: number, z0: number): { door: string; floorY: number } {
  const g = w.voxels.getBlock(x0 + 3, 0, z0 + 3) >= 0 ? island.bellPos.y - 1 : 0;
  const y = g + 1;
  for (let x = x0; x <= x0 + 6; x++)
    for (let z = z0; z <= z0 + 6; z++) {
      w.voxels.setBlock(x, g, z, BlockId.plank, 'player');
      const edge = x === x0 || x === x0 + 6 || z === z0 || z === z0 + 6;
      for (let k = 0; k < 3; k++) {
        const id = edge && !(x === x0 + 3 && z === z0 + 6 && k < 2) ? BlockId.plank : BlockId.air;
        w.voxels.setBlock(x, y + k, z, id, 'player');
      }
    }
  const door = w.voxels.placements.allocateId();
  w.voxels.editObject(
    {
      kind: 'place',
      object: {
        id: door,
        blockId: BlockId.door,
        anchor: { x: x0 + 3, y, z: z0 + 6 },
        facing: 'south',
      },
    },
    'player',
  );
  run(w, 0.5);
  return { door, floorY: y };
}

describe('저장 (TASK-051, ARCHITECTURE 23)', () => {
  it('블록·다중 칸 배치·objectId 가 그대로 돌아오고, 방은 저장 없이 다시 인식된다. 변경된 청크만 저장한다', () => {
    const w = islandWorld();
    const { door, floorY } = buildRoom(w, 70, 70);
    w.voxels.editObject(
      {
        kind: 'place',
        object: {
          id: w.voxels.placements.allocateId(),
          blockId: BlockId.bed,
          anchor: { x: 71, y: floorY, z: 71 },
          facing: 'south',
        },
      },
      'player',
    );
    run(w, 0.5);
    expect(w.rooms.getByType('Bedroom')).toHaveLength(1);
    const data = captureSave(w);
    expect(data.chunks.length).toBeGreaterThan(0);
    expect(data.chunks.length).toBeLessThan(w.voxels.allChunkCoords().length / 4);
    const t0 = performance.now();
    const next = islandWorld();
    applySave(next, structuredClone(data));
    const loadMs = performance.now() - t0;
    expect(loadMs).toBeLessThan(5000);
    for (let x = 70; x <= 76; x++)
      for (let z = 70; z <= 76; z++)
        for (let y = floorY - 1; y <= floorY + 2; y++) {
          expect(next.voxels.getBlock(x, y, z)).toBe(w.voxels.getBlock(x, y, z));
        }
    expect(next.voxels.placements.get(door)).toEqual(w.voxels.placements.get(door));
    expect(next.rooms.getByType('Bedroom')).toHaveLength(1);
    // 이어서 발급하는 id 는 저장 전 것과 겹치지 않는다
    expect(Number(next.voxels.placements.allocateId().slice(4))).toBeGreaterThan(
      data.objectIdCounter,
    );
    // 저장하지 않는 것
    expect(Object.keys(data)).not.toContain('worldState');
    expect(Object.keys(data)).not.toContain('rooms');
    // 벽시계 시각이 없다: 모든 수는 게임 값이다
    // Date.now() 형식(1.5e12 ~ 2e12 밀리초)의 정수가 없다
    const big = JSON.stringify(data, (_k, v: unknown) => (v instanceof Uint16Array ? [] : v)).match(
      /(?<![\d.])1[5-9]\d{11}(?![\d.])/g,
    );
    expect(big).toBeNull();
  });

  it('주민 위치·침대 배정·진행 상태·감사 포인트·레벨·해금·목표·미완료 대화 순서가 돌아온다. WorldState 는 다시 계산한다', () => {
    const w = islandWorld();
    const { floorY } = buildRoom(w, 70, 70);
    w.voxels.editObject(
      {
        kind: 'place',
        object: {
          id: w.voxels.placements.allocateId(),
          blockId: BlockId.bed,
          anchor: { x: 71, y: floorY, z: 71 },
          facing: 'south',
        },
      },
      'player',
    );
    run(w, 2);
    const farmer = [...w.registry.npcs.values()].find((n) => n.role === 'farmer');
    if (!farmer) throw new Error('농부 없음');
    w.dialogue.begin(farmer);
    while (w.dialogue.advance());
    w.dialogue.markAvailable('kitchen_request');
    w.gratitude.gain({ kind: 'gameEvent', id: 'x' }, 100, { x: 0, y: 0, z: 0 });
    w.village.restore(2);
    w.inventory.add([{ item: blockItem(BlockId.plank), count: 11 }]);
    run(w, 0.5);
    const next = roundTrip(w);
    expect([...next.registry.npcs.values()].map((n) => [n.id, n.role, n.body.pos])).toEqual(
      [...w.registry.npcs.values()].map((n) => [n.id, n.role, n.body.pos]),
    );
    run(next, 1);
    expect(next.sleep.snapshot()).toEqual(w.sleep.snapshot());
    expect([...next.gameEvents.completed]).toEqual([...w.gameEvents.completed]);
    expect(next.gratitude.total).toBe(w.gratitude.total);
    expect(next.village.level).toBe(2);
    expect(next.village.isUnlocked(BlockId.window)).toBe(true);
    expect(next.objectives.objective).toEqual(w.objectives.objective);
    expect(next.objectives.objective?.progress?.kind).toBe('farmland');
    expect(next.dialogue.snapshot()).toEqual(w.dialogue.snapshot());
    expect(next.inventory.count(blockItem(BlockId.plank))).toBe(
      w.inventory.count(blockItem(BlockId.plank)),
    );
    expect(next.worldState).toEqual(w.worldState);
    // 늦게 읽은 과거 대사가 목표를 되돌리지 않는다
    next.events.emit('DIALOGUE_ENDED', { npcId: 'farmer-1', dialogueId: 'farmer_first' });
    expect(next.objectives.objective?.id).toBe(w.objectives.objective?.id);
    void dialogueById;
  });

  it('로드의 방 재구축은 보상 이벤트를 내지 않고, 완료 이벤트를 다시 실행하지 않는다', () => {
    const w = islandWorld();
    buildRoom(w, 70, 70);
    run(w, 0.5);
    const data = structuredClone(captureSave(w));
    const next = islandWorld();
    run(next, 0.1); // ARRIVAL 등 새 월드의 첫 프레임 이벤트는 로드 전에 끝낸다
    const events: string[] = [];
    for (const k of [
      'GRATITUDE_GAINED',
      'ROOM_REGISTERED',
      'ROOM_TYPE_CHANGED',
      'GAME_EVENT_FIRED',
    ] as const) {
      next.events.on(k, () => events.push(k));
    }
    const pts0 = data.gratitude.total;
    applySave(next, data);
    run(next, 1);
    expect(events).toEqual([]);
    expect(next.gratitude.total).toBe(pts0);
  });

  it('버전이 다르면 조용히 깨지지 않고 거부한다', () => {
    expect(() => migrate({ version: 999 })).toThrow(SaveRejectedError);
    expect(() => migrate(null)).toThrow(SaveRejectedError);
    expect(() => applySave(islandWorld(), { version: 1, chunks: 'x' })).toThrow(SaveRejectedError);
  });

  it('습격 중 저장·로드 뒤 몬스터 체력·도달 집합·파괴 예산이 유지되고 05:00 에 한 번 끝난다', () => {
    const w = islandWorld(20);
    w.village.restore(2);
    run(w, 0.1);
    w.clock.advanceTo(21, 0);
    run(w, 0.1);
    const [m] = [...w.registry.monsters.values()];
    if (!m) throw new Error('몬스터 없음');
    m.health = 1;
    w.raids.markReached(m.id);
    w.raids.spendDestroyCells(5);
    const next = roundTrip(w, 20);
    expect(next.registry.monsters.get(m.id)?.health).toBe(1);
    expect(next.raids.active).toMatchObject({ raidId: 1, reachedIds: [m.id], destroyedCells: 5 });
    const ended: GameEventMap['RAID_ENDED'][] = [];
    next.events.on('RAID_ENDED', (e) => ended.push(e));
    next.clock.advanceTo(5, 0);
    run(next, 0.2);
    expect(ended).toHaveLength(1);
    expect(ended[0]?.reached).toBe(1);
  });

  it('종 직후 도착 예약이 보존되고 같은 주민을 두 번 만들지 않는다', () => {
    const w = islandWorld(15);
    w.events.emit('VILLAGE_LEVEL_UP', { level: 2, unlocked: [] });
    const next = roundTrip(w, 15);
    expect(next.arrivals.snapshot()).toEqual(w.arrivals.snapshot());
    next.clock.advanceTo(7, 0);
    run(next, 0.5);
    expect(next.registry.npcs.get('villager-lv2')).toBeDefined();
    // 도착 뒤 저장·로드해도 다시 오지 않는다
    const again = roundTrip(next, 7);
    run(again, 1);
    expect([...again.registry.npcs.values()].filter((n) => n.role === 'villager')).toHaveLength(1);
  });

  it('자정 뒤 취침 보상 키·기절·식사 구간·당일 수리량이 유지된다', () => {
    const w = islandWorld(23);
    const [n] = [...w.registry.npcs.values()];
    if (!n) throw new Error('주민 없음');
    w.gratitude.gain({ kind: 'sleep', npcId: n.id }, 5, { x: 0, y: 0, z: 0 });
    w.clock.advanceTo(0, 30);
    run(w, 0.1);
    n.stunUntilGameMinutes = w.clock.gameMinutes + 20;
    n.health = 0;
    const next = roundTrip(w, 23);
    next.clock.restore(w.clock.gameMinutes);
    expect(next.gratitude.gain({ kind: 'sleep', npcId: n.id }, 5, { x: 0, y: 0, z: 0 })).toBe(
      false,
    );
    const n2 = next.registry.npcs.get(n.id);
    expect(n2?.stunUntilGameMinutes).toBe(n.stunUntilGameMinutes);
    run(next, 0.2);
    expect(n2?.action.label).toBe('기절');
    // 식사 구간: 같은 구간에 먹은 기록은 초기화되지 않는다
    const lunch = islandWorld(12);
    lunch.storage.add('food', 5);
    run(lunch, 0.1);
    const eater = [...lunch.registry.npcs.values()][0];
    if (!eater) throw new Error('주민 없음');
    eater.mealId = '1:lunch';
    eater.hasEatenThisMeal = true;
    const lunch2 = roundTrip(lunch, 12);
    run(lunch2, 0.2);
    expect(lunch2.registry.npcs.get(eater.id)?.hasEatenThisMeal).toBe(true);
    // 당일 수리 8 칸
    const snap = captureSave(w);
    const full = {
      ...structuredClone(snap),
      damage: { ...snap.damage, repairedCells: 8, day: w.clock.day },
    };
    const rep = islandWorld(23);
    applySave(rep, full);
    expect(rep.repair.repairedToday).toBe(8);
  });

  it('저장만 하면 진행 중 Action·예약이 그대로이고, 로드하면 임시 Action·예약을 비운다. 침대에서 저장해도 논리 위치가 가구 안이 아니다', () => {
    const w = islandWorld(19, undefined);
    const { floorY } = buildRoom(w, 70, 70);
    w.voxels.editObject(
      {
        kind: 'place',
        object: {
          id: w.voxels.placements.allocateId(),
          blockId: BlockId.bed,
          anchor: { x: 71, y: floorY, z: 71 },
          facing: 'south',
        },
      },
      'player',
    );
    w.clock.advanceTo(20, 0);
    const sleeper = () => [...w.registry.npcs.values()].find((n) => n.action.kind === 'sleep');
    run(w, 60, () => sleeper() !== undefined);
    const s = sleeper();
    if (!s) throw new Error('자는 주민 없음');
    const before = s.action;
    captureSave(w);
    expect(s.action).toBe(before);
    const next = roundTrip(w, 19);
    const s2 = next.registry.npcs.get(s.id);
    expect(s2?.action.kind).toBe('idle');
    const p = s2?.body.pos ?? { x: 0, y: 0, z: 0 };
    expect(next.voxels.getBlock(Math.floor(p.x), Math.floor(p.y + 0.01), Math.floor(p.z))).toBe(
      BlockId.air,
    );
    expect(next.cooking.stats.cooking).toBe(0);
    expect(next.npcSystem.facilityClaims).toBe(0);
  });

  it('비동기 저장 중 편집해도 캡처가 바뀌지 않고, 연속 요청은 최신 상태를 마지막에 쓰며, 실패하면 이전 슬롯을 남기고 알린다', async () => {
    const written: SaveData[] = [];
    let slot: SaveData | null = null;
    let fail = false;
    let release: (() => void) | null = null;
    const store: SaveStore = {
      write: (d) =>
        new Promise<void>((resolve, reject) => {
          release = () => {
            if (fail) reject(new Error('디스크 가득 참'));
            else {
              written.push(d);
              slot = d;
              resolve();
            }
          };
        }),
    };
    const w = islandWorld(9, store);
    const failures: string[] = [];
    w.events.on('SAVE_FAILED', (e) => failures.push(e.reason));
    w.saves.request();
    run(w, 1 / 30);
    // 쓰는 도중 편집: 캡처한 스냅샷은 바뀌지 않는다
    w.voxels.setBlock(60, island.bellPos.y, 60, BlockId.plank, 'player');
    w.saves.request();
    run(w, 1 / 30);
    w.voxels.setBlock(61, island.bellPos.y, 60, BlockId.plank, 'player');
    w.saves.request();
    run(w, 1 / 30);
    (release as (() => void) | null)?.();
    await Promise.resolve();
    await Promise.resolve();
    (release as (() => void) | null)?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(written).toHaveLength(2); // 첫 요청 + 대기 중 두 요청을 합친 최신 하나
    const firstHasEdit = written[0]?.chunks.some((c) => c.blocks.includes(BlockId.plank)) ?? false;
    expect(firstHasEdit).toBe(false);
    const last = written[1];
    const next = islandWorld();
    if (!last) throw new Error('저장 없음');
    applySave(next, structuredClone(last));
    expect(next.voxels.getBlock(61, island.bellPos.y, 60)).toBe(BlockId.plank);
    // 실패: 이전 슬롯이 남고 실패를 알린다
    fail = true;
    const before = slot;
    w.saves.request();
    run(w, 1 / 30);
    (release as (() => void) | null)?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(slot).toBe(before);
    expect(failures).toEqual(['디스크 가득 참']);
  });

  it('매일 07:00 과 종 직후에 자동 저장을 요청한다', async () => {
    const written: SaveData[] = [];
    const store: SaveStore = { write: (d) => Promise.resolve(void written.push(d)) };
    const w = islandWorld(6, store);
    run(w, 0.1);
    expect(written).toHaveLength(0);
    w.clock.advanceTo(7, 0);
    run(w, 0.1);
    await Promise.resolve();
    expect(written).toHaveLength(1);
    w.events.emit('VILLAGE_LEVEL_UP', { level: 2, unlocked: [] });
    run(w, 1 / 30);
    await Promise.resolve();
    expect(written).toHaveLength(2);
  });
});
