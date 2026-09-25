import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import type { GameEventMap } from '../src/game/EventBus';
import { GameWorld } from '../src/game/GameWorld';
import { at, run, Y } from './helpers/village';

/** 습격 스폰 칸 두 곳이 있는 평지. */
function raidWorld(startHour: number): GameWorld {
  const w = new GameWorld({
    storage: balance.storage,
    worldSize: { sizeX: 32, sizeY: 8, sizeZ: 32 },
    startGameMinutes: at(startHour),
    plazaCenter: { x: 16, y: Y, z: 16 },
    monsterSpawns: [
      { x: 2, y: Y, z: 2 },
      { x: 29, y: Y, z: 2 },
    ],
    gameEvents: [],
  });
  for (let x = 0; x < 32; x++)
    for (let z = 0; z < 32; z++) {
      w.voxels.writeInitial(x, 0, z, BlockId.bedrock);
      w.voxels.writeInitial(x, 1, z, BlockId.grass);
    }
  w.rooms.rebuildAll();
  return w;
}

/** 이벤트 기록. */
function log(w: GameWorld) {
  const started: GameEventMap['RAID_STARTED'][] = [];
  const ended: GameEventMap['RAID_ENDED'][] = [];
  w.events.on('RAID_STARTED', (e) => started.push(e));
  w.events.on('RAID_ENDED', (e) => ended.push(e));
  return { started, ended };
}

/** 몬스터 수. */
function monsters(w: GameWorld): number {
  return w.registry.monsters.size;
}

/** 시계를 hour:minute 로 앞당기고 한 프레임 진행한다. */
function jump(w: GameWorld, hour: number, minute = 0): void {
  w.clock.advanceTo(hour, minute);
  run(w, 1 / 30);
}

describe('습격 스케줄 (TASK-044, MVP_SPEC 24.1)', () => {
  it('레벨 2 달성 뒤 첫 21:00 에 3 마리가 나오고, 05:00 에 남은 몬스터가 사라지며 결과가 기록된다', () => {
    const w = raidWorld(15);
    const { started, ended } = log(w);
    run(w, 0.1);
    expect(w.raids.scheduledAtGameMinutes).toBeNull(); // 레벨 1 에는 예약이 없다
    w.village.restore(2);
    run(w, 0.1);
    jump(w, 20, 59);
    expect(monsters(w)).toBe(0);
    jump(w, 21, 0);
    expect(monsters(w)).toBe(3);
    expect(started).toEqual([{ raidId: 1, count: 3 }]);
    // 두 스폰 칸에 번갈아, 겹치지 않게
    const cells = new Set(
      [...w.registry.monsters.values()].map((m) => `${m.body.pos.x},${m.body.pos.z}`),
    );
    expect(cells.size).toBe(3);
    jump(w, 4, 59);
    expect(monsters(w)).toBe(3);
    jump(w, 5, 0);
    expect(monsters(w)).toBe(0);
    expect(ended).toHaveLength(1);
    expect(ended[0]).toMatchObject({ raidId: 1, total: 3, reached: 0 });
    expect(w.raids.results).toHaveLength(1);
    expect(w.worldState.safetyLevel).toBe(100);
  });

  it('그 외의 밤에는 나오지 않고, 같은 습격이 두 번 발생하지 않는다', () => {
    const w = raidWorld(15);
    const { started } = log(w);
    w.village.restore(2);
    run(w, 0.1);
    jump(w, 21, 0);
    jump(w, 5, 0);
    // 레벨 2 인 채로 사흘 밤을 보낸다
    for (let d = 0; d < 3; d++) {
      jump(w, 21, 0);
      expect(monsters(w)).toBe(0);
      jump(w, 5, 0);
    }
    expect(started).toHaveLength(1);
  });

  it('레벨 3 이고 1 차가 끝난 뒤 첫 21:00 에 5 마리가 나온다. 두 레벨을 같은 날 달성해도 순서대로 한 번씩이다', () => {
    const w = raidWorld(10);
    const { started, ended } = log(w);
    w.village.restore(3); // 같은 날 레벨 2·3
    run(w, 0.1);
    jump(w, 21, 0);
    expect(started).toEqual([{ raidId: 1, count: 3 }]); // 1 차가 먼저, 3 마리
    jump(w, 5, 0);
    expect(ended).toHaveLength(1);
    jump(w, 21, 0);
    expect(started.at(-1)).toEqual({ raidId: 2, count: 5 });
    expect(monsters(w)).toBe(5);
    jump(w, 5, 0);
    expect(ended.map((e) => e.raidId)).toEqual([1, 2]);
    // 그 뒤로는 없다
    jump(w, 21, 0);
    expect(monsters(w)).toBe(0);
    expect(started).toHaveLength(2);
  });

  it('시각 강제 설정으로 그 밤을 통째로 건너뛰면 낮에 열지 않고 다음 21:00 에 연다 (MVP_SPEC 20.3, HR-019)', () => {
    const w = raidWorld(9);
    const { started } = log(w);
    w.village.restore(2);
    run(w, 0.1);
    const first = w.raids.scheduledAtGameMinutes ?? 0;
    jump(w, 7, 0); // 09:00 → 다음 날 07:00: 21:00~05:00 을 건너뛴다
    expect(monsters(w)).toBe(0);
    expect(started).toHaveLength(0);
    expect(w.raids.scheduledAtGameMinutes).toBe(first + 24 * 60);
    jump(w, 21, 0);
    expect(monsters(w)).toBe(3);
    // 밤 안에서 멈추면 그 자리에서 시작한다
    const v = raidWorld(9);
    v.village.restore(2);
    run(v, 0.1);
    jump(v, 23, 0);
    expect(monsters(v)).toBe(3);
  });

  it('1 차를 21~24 시에 모두 처치하면 그때 끝나고, 2 차는 종료보다 엄격히 뒤인 다음 21:00 이다', () => {
    const w = raidWorld(10);
    const { started, ended } = log(w);
    w.village.restore(3);
    run(w, 0.1);
    jump(w, 21, 0);
    w.clock.advanceTo(22, 30);
    for (const m of [...w.registry.monsters.values()]) w.registry.monsters.remove(m.id);
    run(w, 1 / 30);
    expect(ended).toHaveLength(1);
    expect(ended[0]?.endedAtGameMinutes).toBeLessThan(at(23) + 0);
    // 같은 밤 23:00·다음 날 새벽에는 2 차가 없다
    jump(w, 23, 0);
    jump(w, 5, 0);
    expect(started).toHaveLength(1);
    const due = w.raids.scheduledAtGameMinutes ?? 0;
    expect(due).toBeGreaterThan(ended[0]?.endedAtGameMinutes ?? 0);
    jump(w, 21, 0);
    expect(started.at(-1)).toEqual({ raidId: 2, count: 5 });
  });

  it('도달 기록은 한 마리에 한 번이고 safetyLevel 에 반영된다', () => {
    const w = raidWorld(15);
    w.village.restore(2);
    run(w, 0.1);
    jump(w, 21, 0);
    const [first] = [...w.registry.monsters.values()];
    if (!first) throw new Error('몬스터 없음');
    w.raids.markReached(first.id);
    w.raids.markReached(first.id);
    jump(w, 5, 0);
    expect(w.raids.lastResult).toMatchObject({ total: 3, reached: 1 });
    run(w, 0.1);
    expect(w.worldState.safetyLevel).toBe(67);
  });
});
