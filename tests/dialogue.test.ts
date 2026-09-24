import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { DIALOGUES } from '../src/game/data/dialogues';
import { EventBus, type GameEventMap } from '../src/game/EventBus';
import { GameWorld } from '../src/game/GameWorld';
import { DialogueSystem, speakerKey } from '../src/game/systems/DialogueSystem';
import { ScreenStateMachine } from '../src/ui/ModalController';
import { at, run, Y } from './helpers/village';

const farmer = { id: 'farmer-1', role: 'farmer' as const };
const cook = { id: 'cook-2', role: 'cook' as const };

describe('대사 (TASK-040, ARCHITECTURE 21)', () => {
  it('대사가 등록된 주민만 대화된다. 끝까지 읽으면 dialogueId 를 담은 종료 이벤트와 완료 기록이 생긴다', () => {
    const events = new EventBus();
    const ended: GameEventMap['DIALOGUE_ENDED'][] = [];
    events.on('DIALOGUE_ENDED', (e) => ended.push(e));
    const d = new DialogueSystem(events);
    expect(d.hasDialogue(farmer)).toBe(false);
    expect(d.begin(farmer)).toBeNull();
    expect(d.markAvailable('farmer_first')).toBe(true);
    expect(d.hasDialogue(farmer)).toBe(true);
    expect(d.hasDialogue(cook)).toBe(false);
    const lines = DIALOGUES.find((x) => x.id === 'farmer_first')?.lines.length ?? 0;
    const a = d.begin(farmer);
    expect(a?.dialogue.id).toBe('farmer_first');
    // 대화 중에는 다른 대화를 시작하지 않는다
    d.markAvailable('cook_first');
    expect(d.begin(cook)).toBeNull();
    for (let i = 1; i < lines; i++) expect(d.advance()?.line).toBe(i);
    expect(d.advance()).toBeNull();
    expect(ended).toEqual([{ npcId: 'farmer-1', dialogueId: 'farmer_first' }]);
    expect(d.isCompleted('farmer_first')).toBe(true);
    expect(d.hasDialogue(farmer)).toBe(false);
    // 완료한 대사는 다시 등록되지 않는다
    expect(d.markAvailable('farmer_first')).toBe(false);
  });

  it('같은 화자에게 두 대사를 등록하면 덮어쓰지 않고 순서대로 읽으며, 같은 id 는 중복 등록되지 않는다', () => {
    const d = new DialogueSystem(new EventBus());
    expect(d.markAvailable('carpenter_first')).toBe(true);
    expect(d.markAvailable('bedroom_request')).toBe(true);
    expect(d.markAvailable('carpenter_first')).toBe(false);
    expect(d.snapshot().available).toEqual([
      { npcId: 'carpenter', dialogueId: 'carpenter_first' },
      { npcId: 'carpenter', dialogueId: 'bedroom_request' },
    ]);
    const carpenter = { id: 'carpenter-3', role: 'carpenter' as const };
    expect(d.begin(carpenter)?.dialogue.id).toBe('carpenter_first');
    d.finish();
    expect(d.begin(carpenter)?.dialogue.id).toBe('bedroom_request');
  });

  it('끝까지 읽지 않고 닫으면(Esc) 완료되지 않고 대사가 남는다. 스냅샷을 되돌려도 같다', () => {
    const d = new DialogueSystem(new EventBus());
    d.markAvailable('cook_first');
    d.begin(cook);
    d.abort();
    expect(d.isCompleted('cook_first')).toBe(false);
    expect(d.hasDialogue(cook)).toBe(true);
    const other = new DialogueSystem(new EventBus());
    other.restore(d.snapshot());
    expect(other.hasDialogue(cook)).toBe(true);
    expect(speakerKey({ id: 'villager-lv2', role: 'villager' })).toBe('villager-lv2');
  });

  it('대사는 해금·레벨·포인트를 바꾸지 않는다 (ADR 010)', () => {
    const w = new GameWorld({
      storage: balance.storage,
      worldSize: { sizeX: 24, sizeY: 8, sizeZ: 24 },
      startGameMinutes: at(9),
    });
    w.dialogue.markAvailable('bell_intro');
    const carpenter = w.spawnResident('carpenter', { x: 5, y: Y, z: 5 });
    const before = [w.village.level, w.gratitude.total, w.village.isUnlocked(BlockId.window)];
    w.dialogue.begin(carpenter);
    while (w.dialogue.advance());
    expect(w.dialogue.isCompleted('bell_intro')).toBe(true);
    expect([w.village.level, w.gratitude.total, w.village.isUnlocked(BlockId.window)]).toEqual(
      before,
    );
    // DialogueSystem 은 이벤트 버스 말고 아무것도 받지 않는다
    expect(DialogueSystem.length).toBe(1);
  });

  it('대화 중인 주민은 제자리에서 TalkAction 으로 플레이어를 보고, 끝나면 생활로 돌아간다', () => {
    const w = new GameWorld({
      storage: balance.storage,
      worldSize: { sizeX: 24, sizeY: 8, sizeZ: 24 },
      startGameMinutes: at(19, 10),
      playerSpawn: { x: 10, y: Y, z: 14 },
      plazaCenter: { x: 18, y: Y, z: 18 },
    });
    for (let x = 0; x < 24; x++)
      for (let z = 0; z < 24; z++) {
        w.voxels.writeInitial(x, 0, z, BlockId.bedrock);
        w.voxels.writeInitial(x, 1, z, BlockId.grass);
      }
    w.voxels.writeInitial(18, Y, 18, BlockId.bell);
    w.rooms.rebuildAll();
    const npc = w.spawnResident('farmer', { x: 10, y: Y, z: 10 });
    w.dialogue.markAvailable('farmer_first');
    w.dialogue.begin(npc);
    run(w, 1);
    expect(npc.action.kind).toBe('talk');
    expect(npc.action.lookAt).toMatchObject({ x: w.player?.body.pos.x, z: w.player?.body.pos.z });
    const p0 = { ...npc.body.pos };
    run(w, 1);
    expect(Math.hypot(npc.body.pos.x - p0.x, npc.body.pos.z - p0.z)).toBeLessThan(0.01);
    w.dialogue.finish();
    run(w, 0.5);
    // 19:10 자유 행동: 광장으로 간다
    expect(npc.action.kind).toBe('move');
  });

  it('대사 모달은 조작을 막고, 열린 동안 F 는 대사 상자가 먼저 받는다', () => {
    const log: string[] = [];
    let blocked = false;
    const view = {
      open: () => log.push('open'),
      close: () => log.push('close'),
      key: (code: string) => {
        log.push(`key:${code}`);
        return code === 'KeyF';
      },
    };
    const m = new ScreenStateMachine(
      {
        requestLock: () => Promise.resolve(true),
        exitLock: () => undefined,
        setGameplayBlocked: (b) => void (blocked = b),
        showMenu: () => undefined,
        hideMenu: () => undefined,
      },
      { dialogue: view },
      () => 'dialogue',
    );
    m.lockAcquired();
    expect(m.key('KeyF')).toBe(true);
    expect(m.state).toEqual({ kind: 'modal', name: 'dialogue' });
    expect(blocked).toBe(true);
    expect(m.key('KeyF')).toBe(true);
    expect(log).toEqual(['open', 'key:KeyF']);
    expect(m.key('Escape')).toBe(true);
    expect(log.at(-1)).toBe('close');
  });
});
