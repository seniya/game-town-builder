// TASK-053 식량·씨앗 검산 (MVP_SPEC 35.1 / 35.2). 대표 배치(종 주변 평지, 시설 접근 16 칸 이내)에서
// 밭 8 칸·씨앗 8·주민 5 명으로 실제 속도(1×)의 며칠을 돌려 하루 수확·조리·식사를 잰다. 분량을 맞추려고 값을 바꾸지 않는다.
import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { buildIsland } from '../src/game/data/island';
import { kitchenLabFixture } from '../src/game/data/visualFixtures';
import { GameWorld } from '../src/game/GameWorld';
import { at, run } from './helpers/village';

/** 하루 기록. */
interface DayLog {
  day: number;
  harvested: number;
  planted: number;
  cooked: number;
  eaten: number;
  end: { seed: number; crop: number; food: number };
}

/** 주방·식당·침실 장면에 밭 plots 칸(4 또는 8)과 주민 residents 명(3 또는 5)을 둔다. 시작 Day 1 07:00, crop 0, food 0. */
function farmVillage(plots = 8, residents = 5, seed = plots): GameWorld {
  const f = kitchenLabFixture;
  const w = new GameWorld({
    storage: { ...balance.storage, initialSeed: seed, initialCrop: 0, initialFood: 0 },
    worldSize: f.size,
    startGameMinutes: at(7),
    ...(f.plazaCenter ? { plazaCenter: f.plazaCenter } : {}),
    gameEvents: [],
  });
  f.build((x, y, z, id) => w.voxels.writeInitial(x, y, z, id));
  for (const o of f.objects) {
    w.voxels.editObject(
      { kind: 'place', object: { id: w.voxels.placements.allocateId(), ...o } },
      'player',
    );
  }
  // 광장 남서쪽 평지에 밭 8 칸(4 × 2). 주방·식당·종에서 16 칸 이내
  for (let i = 0; i < plots; i++)
    w.voxels.setBlock(27 + (i % 4), 10, 39 + Math.floor(i / 4), BlockId.farmland, 'player');
  w.voxels.markAllDirty();
  w.rooms.rebuildAll();
  for (const r of f.residents ?? []) w.spawnResident(r.role, r.cell);
  if (residents >= 5) {
    w.spawnResident('villager', { x: 33, y: 11, z: 36 });
    w.spawnResident('villager', { x: 31, y: 11, z: 36 });
  }
  return w;
}

/** days 게임일 동안 돌리며 날마다 기록한다. */
function simulate(w: GameWorld, days: number): DayLog[] {
  const logs: DayLog[] = [];
  let cur: DayLog = {
    day: w.clock.day,
    harvested: 0,
    planted: 0,
    cooked: 0,
    eaten: 0,
    end: { seed: 0, crop: 0, food: 0 },
  };
  w.events.on('BLOCK_CHANGED', (c) => {
    if (c.by !== 'npc') return;
    if (c.from === BlockId.crop) cur.harvested += 1;
    if (c.to === BlockId.crop) cur.planted += 1;
  });
  let prevFood = w.storage.get('food');
  w.events.on('STORAGE_CHANGED', (s) => {
    const d = s.food - prevFood;
    if (d === balance.cooking.foodPerCook) cur.cooked += 1;
    else if (d < 0) cur.eaten += -d;
    prevFood = s.food;
  });
  const secondsPerDay = 24 * balance.clock.secondsPerGameHour;
  for (let i = 0; i < days; i++) {
    run(w, secondsPerDay, undefined, 1 / 20);
    cur.end = {
      seed: w.storage.get('seed'),
      crop: w.storage.get('crop'),
      food: w.storage.get('food'),
    };
    logs.push(cur);
    cur = { day: w.clock.day, harvested: 0, planted: 0, cooked: 0, eaten: 0, end: cur.end };
  }
  return logs;
}

describe('TASK-053 식량·씨앗 검산', () => {
  it('밭 8 칸·씨앗 8·주민 5 명: 정상 상태의 하루 생산이 소비(10)를 넘고, 파괴 없는 수확에서 씨앗이 순환한다', () => {
    const w = farmVillage();
    expect(w.rooms.getByType('Kitchen')).toHaveLength(1);
    expect(w.rooms.getByType('DiningRoom')).toHaveLength(1);
    expect(w.registry.npcs.size).toBe(5);
    const logs = simulate(w, 5);
    console.info(`[TASK-053 food] ${JSON.stringify(logs)}`);
    // 첫날은 성장 대기(12 게임시간)로 수확이 거의 없다. 둘째 날부터가 정상 상태다
    const steady = logs.slice(2);
    for (const d of steady) {
      expect(d.harvested).toBeGreaterThanOrEqual(balance.farm.expandedPlotCount);
      expect(d.cooked * balance.cooking.foodPerCook).toBeGreaterThanOrEqual(
        5 * balance.meal.mealsPerDay,
      );
    }
    // 씨앗: 심은 만큼 돌아온다(파괴 없음)
    const last = logs.at(-1);
    expect(last?.end.seed).toBeGreaterThanOrEqual(0);
    const totalPlanted = logs.reduce((s, d) => s + d.planted, 0);
    const totalHarvested = logs.reduce((s, d) => s + d.harvested, 0);
    expect(8 - totalPlanted + totalHarvested).toBe(last?.end.seed);
  }, 300_000);

  it('입문 밭 4 칸·주민 3 명(35.1 의 이론상 유지량 6/일): 생산과 소비가 같아 비축이 늘지 않는다', () => {
    const w = farmVillage(4, 3, 4);
    const logs = simulate(w, 4);
    console.info(`[TASK-053 food4] ${JSON.stringify(logs)}`);
    for (const d of logs.slice(2)) {
      expect(d.harvested).toBe(4);
      expect(d.cooked * balance.cooking.foodPerCook).toBe(3 * balance.meal.mealsPerDay);
    }
  }, 300_000);

  it('씨앗 손실 보충: 고정 섬의 잎은 기대값으로 8 칸 확장분을 여러 번 보충할 만큼 있다(25% 는 보장이 아니다)', () => {
    let leaves = 0;
    buildIsland((_x, _y, _z, id) => void (id === BlockId.leaves && (leaves += 1)));
    const expected = leaves * balance.resource.seedDropChanceFromLeaves;
    console.info(`[TASK-053 seed] leaves=${leaves} expectedSeeds=${expected}`);
    expect(expected).toBeGreaterThan(balance.farm.expandedPlotCount * 3);
  });
});
