import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { ENDING_SHOTS } from '../src/game/data/ending';
import { GAME_EVENTS } from '../src/game/data/gameEvents';
import { buildIsland } from '../src/game/data/island';
import { ENDING_TOTAL_SECONDS, endingPose, shotAt } from '../src/game/ending/endingShot';
import { GameWorld } from '../src/game/GameWorld';
import { applySave, captureSave, type SaveData } from '../src/game/save/saveData';
import type { SaveStore } from '../src/game/systems/SaveSystem';
import type { GameEventId } from '../src/game/types';
import { ScreenStateMachine, type ModalView } from '../src/ui/ModalController';
import { at, run } from './helpers/village';

const island = buildIsland(() => undefined);

/** 엔딩 이벤트 전까지 완료된 이벤트 id. */
const BEFORE_END: GameEventId[] = GAME_EVENTS.map((d) => d.id).filter(
  (id) => id !== 'EVENT_SLICE_END',
);

/** 고정 섬에서 레벨 3·주민 5 명·2 차 습격이 막 끝난 22:00 상태. */
function endgameWorld(store?: SaveStore): GameWorld {
  const w = new GameWorld({
    storage: balance.storage,
    worldSize: balance.world,
    startGameMinutes: at(22),
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
  w.spawnResident('villager', island.residentArrival);
  w.spawnResident('villager', island.residentArrival);
  w.village.restore(3);
  w.gameEvents.restore(BEFORE_END);
  const ended = w.clock.gameMinutes;
  w.raids.restore({
    results: [
      { raidId: 1, total: 3, reached: 0, endedAtGameMinutes: ended - 24 * 60 },
      { raidId: 2, total: 5, reached: 0, endedAtGameMinutes: ended },
    ],
    active: null,
    scheduledAtGameMinutes: null,
  });
  return w;
}

/** 이벤트 발생·연출 요청·엔딩 끝을 센다. */
function watch(w: GameWorld): { fired: number; cutscenes: string[]; finished: number } {
  const log = { fired: 0, cutscenes: [] as string[], finished: 0 };
  w.events.on('GAME_EVENT_FIRED', (e) => void (e.id === 'EVENT_SLICE_END' && (log.fired += 1)));
  w.events.on('CUTSCENE_REQUESTED', (c) => void log.cutscenes.push(c.id));
  w.events.on('ENDING_FINISHED', () => void (log.finished += 1));
  return log;
}

describe('엔딩 (TASK-052, MVP_SPEC 27.1 / Test 10)', () => {
  it('2 차 습격 뒤 첫 07:00 전에는 없고, 07:00 프레임을 건너뛰어도 그 뒤 한 번 발생해 엔딩을 기다리게 한다', () => {
    const w = endgameWorld();
    const log = watch(w);
    run(w, 0.2);
    w.clock.advanceTo(6, 59);
    run(w, 0.2);
    expect(log.fired).toBe(0);
    expect(w.ending.pending).toBe(false);
    // 07:00 한 프레임을 지나쳐 09:00 으로 뛴다(등호 비교가 아니다)
    w.clock.advanceTo(9, 0);
    run(w, 0.2);
    expect(log.fired).toBe(1);
    expect(log.cutscenes).toEqual(['slice_end']);
    expect(w.ending.pending).toBe(true);
    expect(w.ending.played).toBe(false);
    run(w, 1);
    expect(log.fired).toBe(1);
  });

  it('주민이 5 명이 아니면 발생하지 않는다', () => {
    const w = endgameWorld();
    const log = watch(w);
    const villager = [...w.registry.npcs.values()].find((n) => n.role === 'villager');
    if (villager) w.registry.npcs.remove(villager.id);
    w.clock.advanceTo(9, 0);
    run(w, 0.5);
    expect(log.fired).toBe(0);
    expect(w.ending.pending).toBe(false);
  });

  it('연출이 끝나면 한 번만 기록·저장하고, 게임은 그대로 계속된다', async () => {
    const writes: SaveData[] = [];
    const w = endgameWorld({
      write: (d) => {
        writes.push(d);
        return Promise.resolve();
      },
    });
    const log = watch(w);
    w.clock.advanceTo(9, 0);
    run(w, 0.2);
    await Promise.resolve();
    const before = writes.length;
    w.ending.finish();
    w.ending.finish();
    expect(log.finished).toBe(1);
    expect(w.ending.played).toBe(true);
    expect(w.ending.pending).toBe(false);
    run(w, 0.1);
    await Promise.resolve();
    expect(writes.length).toBe(before + 1);
    expect(writes.at(-1)?.ending).toEqual({ pending: false, played: true });
    // 계속 플레이: 시간이 흐르고 주민이 움직이며, 블록을 놓을 수 있다
    const t0 = w.clock.gameMinutes;
    run(w, 5);
    expect(w.clock.gameMinutes).toBeGreaterThan(t0);
    expect(log.fired).toBe(1);
    expect([...w.registry.npcs.values()].some((n) => n.action.kind !== 'idle')).toBe(true);
  });

  it('연출 전·중에 저장하면 이어 할 때 다시 보여 주고, 본 뒤에 저장하면 다시 보이지 않는다. 이벤트는 다시 발생하지 않는다', () => {
    const w = endgameWorld();
    w.clock.advanceTo(9, 0);
    run(w, 0.2);
    const mid = structuredClone(captureSave(w));
    expect(mid.ending).toEqual({ pending: true, played: false });
    const a = endgameWorld();
    const logA = watch(a);
    applySave(a, mid);
    run(a, 0.5);
    expect(a.ending.pending).toBe(true);
    expect(logA.fired).toBe(0);
    a.ending.finish();
    const after = structuredClone(captureSave(a));
    const b = endgameWorld();
    const logB = watch(b);
    applySave(b, after);
    run(b, 0.5);
    expect(b.ending.pending).toBe(false);
    expect(b.ending.played).toBe(true);
    expect(logB.fired).toBe(0);
    expect(logB.cutscenes).toEqual([]);
  });

  it('샷: 순서대로 이어지고 끝나면 없으며, 목수가 없으면 종을 본다', () => {
    const total = ENDING_SHOTS.reduce((s, x) => s + x.seconds, 0);
    expect(ENDING_TOTAL_SECONDS).toBe(total);
    expect(shotAt(0)?.shot.kind).toBe('wideOrbit');
    expect(shotAt(6.5)?.shot.kind).toBe('carpenter');
    expect(shotAt(total - 0.01)?.shot.kind).toBe('rise');
    expect(shotAt(total)).toBeNull();
    const bell = { x: 64, y: 11, z: 64 };
    const scene = { bell, carpenter: { x: 70, y: 11, z: 60 }, residents: [bell] };
    for (let t = 0; t < total; t += 0.5) {
      const p = endingPose(t, scene);
      expect(p).not.toBeNull();
      if (!p) continue;
      for (const v of [p.eye.x, p.eye.y, p.eye.z]) expect(Number.isFinite(v)).toBe(true);
      // 언제나 주시점보다 높은 곳에서 내려다본다
      expect(p.eye.y).toBeGreaterThan(p.target.y);
    }
    expect(endingPose(7, scene)?.target.x).toBe(70);
    expect(endingPose(7, { ...scene, carpenter: null })?.target.x).toBe(64);
    expect(endingPose(total + 1, scene)).toBeNull();
  });

  it('화면: 엔딩 모달은 조작 키를 모두 받아 인벤토리가 열리지 않고, Esc 는 닫고 메뉴로 간다', () => {
    const log: string[] = [];
    const view: ModalView = {
      open: () => log.push('open'),
      close: () => log.push('close'),
      key: (c) => (log.push(`key:${c}`), true),
    };
    const inventory: ModalView = { open: () => log.push('inv'), close: () => undefined };
    const m = new ScreenStateMachine(
      {
        requestLock: () => Promise.resolve(true),
        exitLock: () => undefined,
        setGameplayBlocked: () => undefined,
        showMenu: () => log.push('menu'),
        hideMenu: () => undefined,
      },
      { ending: view, inventory },
    );
    m.lockAcquired();
    expect(m.open('ending')).toBe(true);
    expect(m.key('KeyE')).toBe(true);
    expect(log).not.toContain('inv');
    m.key('Escape');
    expect(log.slice(-2)).toEqual(['close', 'menu']);
  });
});
