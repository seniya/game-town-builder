// TASK-053 "이벤트만 따라가도 레벨 2 에 도달한다" (MVP_SPEC 35.3). 고정 섬에서 이벤트가 요청하는 것만 한다:
// 나온 대사를 모두 읽고, 밭 네 칸을 깔고 씨앗 하나를 보태고, 요청이 오면 주방·침실을 짓고, 종을 친다.
// 짓기는 즉시(플레이어 편집)라 걸린 게임 시간은 기다림(성장·조리·이벤트)의 하한이며 실제 플레이 분량이 아니다.
import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { buildIsland } from '../src/game/data/island';
import { GameWorld } from '../src/game/GameWorld';
import { writeMvpPerfRooms, type MvpRoomKind } from '../src/game/perfLoad';
import type { GameEventId } from '../src/game/types';
import { at, run } from './helpers/village';

const island = buildIsland(() => undefined);

/** 고정 섬. main 과 같은 설정. */
function islandWorld(): GameWorld {
  const w = new GameWorld({
    storage: balance.storage,
    worldSize: balance.world,
    startGameMinutes: at(7),
    playerSpawn: island.playerSpawn,
    plazaCenter: island.bellPos,
    quarryCandidates: island.quarryRespawnCandidates,
    arrivalCell: island.residentArrival,
    monsterSpawns: island.monsterSpawns,
  });
  buildIsland((x, y, z, id) => w.voxels.writeInitial(x, y, z, id));
  w.voxels.markAllDirty();
  w.rooms.rebuildAll();
  w.spawnResident('farmer', island.npcSpawns.farmer);
  w.spawnResident('cook', island.npcSpawns.cook);
  w.spawnResident('carpenter', island.npcSpawns.carpenter);
  return w;
}

/** 대사가 있는 주민과 모두 끝까지 대화한다(플레이어가 "!" 를 보고 말을 거는 것). */
function readAll(w: GameWorld): number {
  let n = 0;
  for (const npc of w.registry.npcs.values()) {
    while (w.dialogue.hasDialogue(npc) && w.dialogue.begin(npc)) {
      while (w.dialogue.advance()) {
        /* 줄 넘기기 */
      }
      n += 1;
    }
  }
  return n;
}

/** 요청받은 방을 플레이어 편집으로 짓는다(측정 장면과 같은 자리·가구). */
function build(w: GameWorld, kind: MvpRoomKind): void {
  const objects = writeMvpPerfRooms(
    (x, y, z, id) => void w.voxels.setBlock(x, y, z, id, 'player'),
    island.bellPos,
    [kind],
  );
  for (const o of objects) {
    const ok = w.voxels.editObject(
      { kind: 'place', object: { id: w.voxels.placements.allocateId(), ...o } },
      'player',
    );
    if (!ok) throw new Error(`객체 설치 실패 ${kind}`);
  }
}

/** until 이 참이 될 때까지 최대 maxHours 게임시간 돌린다. 도달 시각(gameMinutes)을 반환한다. */
function until(w: GameWorld, cond: () => boolean, maxHours = 48): number {
  run(w, maxHours * balance.clock.secondsPerGameHour, cond, 1 / 20);
  if (!cond()) throw new Error(`조건에 닿지 못했다 (${w.clock.gameMinutes} 분)`);
  return w.clock.gameMinutes;
}

describe('TASK-053 진행 경로: 이벤트만 따라가도 레벨 2', () => {
  it('대화 → 밭 → 주방 → 침실 → 종 요청을 따라가면 레벨 2 가 되고, 안내대로 넓히면 레벨 3 까지 간다', () => {
    const w = islandWorld();
    const done = (id: GameEventId) => () => w.gameEvents.completed.has(id);
    const log: Record<string, number> = {};
    log.arrival = until(w, done('EVENT_ARRIVAL'), 1);
    readAll(w);
    log.farmRequest = until(w, done('EVENT_FARM_REQUEST'), 1);
    // 밭 네 칸(종 남쪽 평지)과 채집한 씨앗 하나를 기부한다 (35.2: 초기 3 + 채집 1)
    const g = island.bellPos.y - 1;
    for (let i = 0; i < balance.farm.tutorialPlotCount; i++) {
      const x = island.bellPos.x - 2 + i;
      const z = island.bellPos.z + 13;
      expect([BlockId.grass, BlockId.dirt]).toContain(w.voxels.getBlock(x, g, z));
      w.voxels.setBlock(x, g, z, BlockId.farmland, 'player');
    }
    w.storage.add('seed', 1);
    log.kitchenRequest = until(w, done('EVENT_KITCHEN_REQUEST'));
    readAll(w);
    build(w, 'kitchen');
    log.bedroomRequest = until(w, done('EVENT_BEDROOM_REQUEST'));
    readAll(w);
    build(w, 'bedroom');
    log.bellRequest = until(w, done('EVENT_BELL_REQUEST'), 2);
    readAll(w);
    log.canRing = until(w, () => w.village.evaluate().canRing, 24);
    const points = w.gratitude.total;
    expect(w.village.ring()).toBe(true);
    expect(w.village.level).toBe(2);

    // 레벨 2 → 3 (35.4 가설: 약 3 게임일). 종 대사의 안내대로 밭을 8 칸으로 늘리고 씨앗을 채우며,
    // 식당·창고를 짓고 넷째 침대를 둔다. 습격은 막지 않는다(플레이어가 없는 하한). 나온 대사는 그때그때 읽는다
    readAll(w);
    for (let i = 0; i < balance.farm.tutorialPlotCount; i++) {
      w.voxels.setBlock(
        island.bellPos.x - 2 + i,
        g,
        island.bellPos.z + 14,
        BlockId.farmland,
        'player',
      );
    }
    w.storage.add('seed', balance.farm.expandedPlotCount - balance.farm.tutorialPlotCount);
    build(w, 'dining');
    build(w, 'storeroom');
    const bed4 = w.voxels.editObject(
      {
        kind: 'place',
        object: {
          id: w.voxels.placements.allocateId(),
          blockId: BlockId.bed,
          anchor: { x: island.bellPos.x + 6, y: island.bellPos.y, z: island.bellPos.z - 6 },
          facing: 'south',
        },
      },
      'player',
    );
    expect(bed4).toBe(true);
    const ringAt2 = w.clock.gameMinutes;
    let lastRead = 0;
    const l3 = until(
      w,
      () => {
        if (w.clock.gameMinutes - lastRead > 60) {
          lastRead = w.clock.gameMinutes;
          readAll(w);
        }
        return w.village.evaluate().canRing;
      },
      24 * 8,
    );
    const e3 = w.village.evaluate();
    expect(w.village.ring()).toBe(true);
    expect(w.village.level).toBe(3);
    console.info(
      `[TASK-053 level3] ${JSON.stringify({
        gameDaysAfterLevel2: ((l3 - ringAt2) / 1440).toFixed(2),
        realMinutesAfterLevel2: (
          (((l3 - ringAt2) / 60) * balance.clock.secondsPerGameHour) /
          60
        ).toFixed(1),
        raids: w.raids.snapshot().results,
        population: w.registry.npcs.size,
        gates: e3.gates.map((x) => `${x.requirement} ${x.current}/${x.required}`),
      })}`,
    );
    console.info(
      `[TASK-053 progression] ${JSON.stringify({
        ...Object.fromEntries(
          Object.entries(log).map(([k, v]) => [
            k,
            `Day ${Math.floor(v / 1440) + 1} ${String(Math.floor(((v % 1440) + 420) / 60) % 24).padStart(2, '0')}:${String(Math.floor(v % 60)).padStart(2, '0')}`,
          ]),
        ),
        pointsAtRing: points,
      })}`,
    );
  }, 300_000);
});
