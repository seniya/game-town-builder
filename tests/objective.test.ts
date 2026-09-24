import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/game/data/blocks';
import { dialogueById } from '../src/game/data/dialogues';
import { EventBus, type GameEventMap } from '../src/game/EventBus';
import { ObjectiveSystem } from '../src/game/systems/ObjectiveSystem';
import type { ObjectiveDefinition } from '../src/game/types';
import { at, run, village, Y } from './helpers/village';

const WALL: ObjectiveDefinition = {
  id: 'objective_wall',
  sourceEventId: 'EVENT_WALL_REQUEST',
  text: '마을을 벽으로 둘러싸 주세요',
  progress: null,
};

/** farm_intro 대사의 밭 목표. */
function farmObjective(): ObjectiveDefinition {
  const o = dialogueById('farmer_first')?.nextObjective;
  if (!o) throw new Error('밭 목표 없음');
  return o;
}

describe('목표 (TASK-041, ARCHITECTURE 21)', () => {
  it('첫 농부 대화가 끝나면 밭 목표가 되고, farmland 를 깔면 (n / 4) 가 실시간으로 오른다', () => {
    const w = village(at(9));
    const seen: GameEventMap['OBJECTIVE_CHANGED'][] = [];
    w.events.on('OBJECTIVE_CHANGED', (o) => seen.push(o));
    const farmer = w.spawnResident('farmer', { x: 20, y: Y, z: 20 });
    w.dialogue.markAvailable('farmer_first');
    w.dialogue.begin(farmer);
    while (w.dialogue.advance());
    expect(w.objectives.objective?.id).toBe('objective_farmland');
    expect(w.objectives.view).toEqual({
      text: '밭흙을 4 칸 만들어 주세요',
      progress: { current: 0, total: 4 },
    });
    w.voxels.setBlock(5, Y - 1, 5, BlockId.farmland, 'player');
    w.voxels.setBlock(6, Y - 1, 5, BlockId.farmland, 'player');
    run(w, 0.1);
    expect(w.objectives.view?.progress).toEqual({ current: 2, total: 4 });
    expect(seen.at(-1)).toEqual({
      text: '밭흙을 4 칸 만들어 주세요',
      progress: { current: 2, total: 4 },
    });
    // 수치가 그대로면 다시 알리지 않는다
    const n = seen.length;
    run(w, 0.3);
    expect(seen.length).toBe(n);
  });

  it('수치가 없는 목표(벽)에는 progress 가 없다', () => {
    const o = new ObjectiveSystem(new EventBus(), { farmland: () => 3 });
    o.apply(WALL);
    expect(o.view).toEqual({ text: '마을을 벽으로 둘러싸 주세요' });
  });

  it('늦게 읽은 이전 단계 대사는 목표를 되돌리지 않고, 같은 목표 재적용은 아무것도 바꾸지 않는다', () => {
    const events = new EventBus();
    const seen: string[] = [];
    events.on('OBJECTIVE_CHANGED', (e) => seen.push(e.text));
    let plots = 1;
    const o = new ObjectiveSystem(events, { farmland: () => plots });
    const kitchen = dialogueById('kitchen_request')?.nextObjective;
    if (!kitchen) throw new Error('주방 목표 없음');
    expect(o.apply(farmObjective())).toBe(true);
    plots = 3;
    o.update();
    expect(o.apply(farmObjective())).toBe(false);
    expect(o.view?.progress?.current).toBe(3);
    expect(o.apply(kitchen)).toBe(true);
    // 늦게 읽은 농부 대사(이전 단계)
    events.emit('DIALOGUE_ENDED', { npcId: 'farmer-1', dialogueId: 'farmer_first' });
    expect(o.objective?.id).toBe('objective_kitchen');
    expect(seen).toEqual([
      '밭흙을 4 칸 만들어 주세요',
      '밭흙을 4 칸 만들어 주세요',
      '주방을 만들어 주세요',
    ]);
  });

  it('저장·대사·커맨드가 같은 정의를 쓴다: 스냅샷은 정의 그대로이고 수치는 원천에서 다시 계산한다', () => {
    const o = new ObjectiveSystem(new EventBus(), { farmland: () => 2 });
    o.apply(farmObjective());
    const saved = o.snapshot();
    expect(saved).toBe(farmObjective());
    const loaded = new ObjectiveSystem(new EventBus(), { farmland: () => 4 });
    loaded.restore(saved);
    expect(loaded.view?.progress).toEqual({ current: 4, total: 4 });
  });
});
