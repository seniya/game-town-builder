// TASK-053 성능 측정 장면(MVP_SPEC 36): 초기 섬·네 방·주민 다섯·몬스터 다섯·광원 16 개가 실제로 갖춰지는지.
import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { buildIsland } from '../src/game/data/island';
import { GameWorld } from '../src/game/GameWorld';
import { prepareMvpPerf, writeMvpPerfRooms } from '../src/game/perfLoad';
import { at, run } from './helpers/village';

const island = buildIsland(() => undefined);

describe('MVP 성능 측정 장면 (TASK-053)', () => {
  it('네 방이 각 타입으로 인식되고 torch 16 개, 주민 다섯, 21:00 에 몬스터 다섯이 온다', () => {
    const w = new GameWorld({
      storage: balance.storage,
      worldSize: balance.world,
      startGameMinutes: at(20, 50),
      playerSpawn: island.playerSpawn,
      plazaCenter: island.bellPos,
      arrivalCell: island.residentArrival,
      monsterSpawns: island.monsterSpawns,
    });
    let torches = 0;
    buildIsland((x, y, z, id) => w.voxels.writeInitial(x, y, z, id));
    const objects = writeMvpPerfRooms((x, y, z, id) => {
      w.voxels.writeInitial(x, y, z, id);
    }, island.bellPos);
    for (const o of objects) {
      expect(
        w.voxels.editObject(
          { kind: 'place', object: { id: w.voxels.placements.allocateId(), ...o } },
          'player',
        ),
      ).toBe(true);
    }
    w.voxels.markAllDirty();
    w.rooms.rebuildAll();
    for (let x = 0; x < balance.world.sizeX; x++)
      for (let y = 0; y < balance.world.sizeY; y++)
        for (let z = 0; z < balance.world.sizeZ; z++)
          if (w.voxels.getBlock(x, y, z) === BlockId.torch) torches += 1;
    expect(torches).toBe(16);
    expect(w.rooms.getByType('Bedroom')).toHaveLength(1);
    expect(w.rooms.getByType('Kitchen')).toHaveLength(1);
    expect(w.rooms.getByType('DiningRoom')).toHaveLength(1);
    expect(w.rooms.getByType('Storeroom')).toHaveLength(1);
    for (const role of ['farmer', 'cook', 'carpenter', 'villager', 'villager'] as const)
      w.spawnResident(role, island.residentArrival);
    prepareMvpPerf(w);
    run(w, 0.2);
    w.clock.advanceTo(21, 0);
    run(w, 0.2);
    expect(w.registry.npcs.size).toBe(5);
    expect(w.registry.monsters.size).toBe(5);
  });
});
