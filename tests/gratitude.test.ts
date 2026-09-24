import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import type { GameEventMap } from '../src/game/EventBus';
import type { GameWorld } from '../src/game/GameWorld';
import { GratitudeSystem } from '../src/game/systems/GratitudeSystem';
import { at, bed, placeObject, run, village, Y } from './helpers/village';

type Gain = GameEventMap['GRATITUDE_GAINED'];

/** 포인트 획득 기록을 모은다. */
function record(w: GameWorld): Gain[] {
  const out: Gain[] = [];
  w.events.on('GRATITUDE_GAINED', (g) => out.push(g));
  return out;
}

/** 두 번째 방(벽·문만, 내부 x 27~31, z 10~14, 문 (29, Y, 15)). 방 판정을 거쳐 인식된다. */
function secondRoom(w: GameWorld): void {
  for (let x = 26; x <= 32; x++)
    for (let z = 9; z <= 15; z++) {
      const edge = x === 26 || x === 32 || z === 9 || z === 15;
      if (!edge || (x === 29 && z === 15)) continue;
      w.voxels.setBlock(x, Y, z, BlockId.plank, 'player');
      w.voxels.setBlock(x, Y + 1, z, BlockId.plank, 'player');
    }
  placeObject(w, BlockId.door, { x: 29, y: Y, z: 15 }, 'south');
  run(w, 0.5);
}

describe('감사 포인트 (TASK-035, MVP_SPEC 22)', () => {
  it('gain 은 좌표를 필수 인자로 받는다', () => {
    expect(GratitudeSystem.prototype.gain.length).toBe(3);
  });

  it('주민이 잠들면 +5 가 침대 위에 뜨고, 같은 밤에 두 번 받지 않는다', () => {
    const w = village(at(19, 50));
    const bedId = bed(w, 10, 10);
    const id = w.spawnResident('farmer', { x: 20, y: Y, z: 26 }).id;
    run(w, 1);
    const gains = record(w);
    run(w, 60, () => w.registry.npcs.get(id)?.action.kind === 'sleep');
    const sleep = gains.filter((g) => g.source.kind === 'sleep');
    expect(sleep).toHaveLength(1);
    expect(sleep[0]?.amount).toBe(balance.gratitude.onSleep);
    // 침대 위 좌표(침대 칸 수평 범위 안, 매트리스보다 위)
    const bedObj = w.voxels.placements.get(bedId);
    const a = sleep[0]?.at;
    expect(a && bedObj && Math.abs(a.x - (bedObj.anchor.x + 0.5)) <= 1).toBe(true);
    expect(a && a.y > Y + 0.5).toBe(true);
    // 자정 뒤 다시 잠들어도(같은 nightId) 추가로 주지 않는다
    w.clock.advanceTo(1, 0);
    expect(w.gratitude.gain({ kind: 'sleep', npcId: id }, 5, { x: 0, y: 0, z: 0 })).toBe(false);
    // 다음 날 밤에는 다시 받는다
    w.clock.advanceTo(20, 5);
    expect(w.gratitude.gain({ kind: 'sleep', npcId: id }, 5, { x: 0, y: 0, z: 0 })).toBe(true);
  });

  it('요리 완료 시 +3 이 요리사 위에 뜬다', () => {
    const w = village(at(9), true);
    w.voxels.setBlock(14, Y, 14, BlockId.cooking_stove, 'player');
    w.voxels.setBlock(13, Y, 14, BlockId.water_pot, 'player');
    w.storage.add('crop', 2);
    const cook = w.spawnResident('cook', { x: 20, y: Y, z: 20 });
    run(w, 0.5);
    const gains = record(w);
    run(w, balance.clock.secondsPerGameHour * 2, () => gains.some((g) => g.source.kind === 'cook'));
    const g = gains.find((x) => x.source.kind === 'cook');
    expect(g?.amount).toBe(balance.gratitude.onCook);
    expect(g && Math.hypot(g.at.x - cook.body.pos.x, g.at.z - cook.body.pos.z)).toBeLessThan(0.01);
    expect(g && g.at.y).toBeGreaterThan(cook.body.pos.y + 1.5);
  });

  it('식당에서 먹으면 +2, 광장에서 먹으면 0 이다', () => {
    const dining = village(at(11, 55), true);
    dining.voxels.setBlock(12, Y, 12, BlockId.table, 'player');
    dining.voxels.setBlock(11, Y, 12, BlockId.chair, 'player');
    dining.voxels.setBlock(13, Y, 12, BlockId.chair, 'player');
    dining.storage.add('food', 3);
    const a = dining.spawnResident('farmer', { x: 20, y: Y, z: 22 }).id;
    run(dining, 0.5);
    const g1 = record(dining);
    run(dining, 60, () => dining.registry.npcs.get(a)?.action.kind === 'eat');
    expect(g1.filter((g) => g.source.kind === 'eat').map((g) => g.amount)).toEqual([2]);

    const plaza = village(at(11, 55), false);
    plaza.storage.add('food', 3);
    const b = plaza.spawnResident('farmer', { x: 20, y: Y, z: 22 }).id;
    const g2 = record(plaza);
    run(plaza, 60, () => plaza.registry.npcs.get(b)?.action.kind === 'eat');
    expect(plaza.registry.npcs.get(b)?.action.label).toBe('광장에서 먹는 중');
    expect(g2.filter((g) => g.source.kind === 'eat')).toHaveLength(0);
    expect(plaza.storage.get('food')).toBe(2);
  });

  it('새 방 타입 최초 인식 +20, 두 번째 같은 타입은 0, EmptyRoom 은 없다. EmptyRoom → Bedroom 변경에서 한 번 준다', () => {
    const w = village(at(9));
    const gains = record(w);
    // 두 번째 빈 방(EmptyRoom) 인식: 보너스 없음
    secondRoom(w);
    expect(w.rooms.getByType('EmptyRoom').length).toBeGreaterThanOrEqual(2);
    expect(gains).toHaveLength(0);
    // 첫 방에 침대 → EmptyRoom 에서 Bedroom 으로 타입 변경: +20 한 번
    bed(w, 10, 10);
    run(w, 0.5);
    expect(gains.map((g) => [g.source.kind, g.amount])).toEqual([['firstRoom', 20]]);
    // 방 위 좌표
    expect(gains[0]?.at.y).toBeGreaterThan(Y + 1);
    // 두 번째 방도 Bedroom 이 되지만 두 번째 같은 타입은 0
    bed(w, 27, 10);
    run(w, 0.5);
    expect(w.rooms.getByType('Bedroom')).toHaveLength(2);
    expect(gains).toHaveLength(1);
    expect(w.gratitude.total).toBe(20);
  });

  it('방이 해제되어도 포인트가 줄지 않는다', () => {
    const w = village(at(9));
    bed(w, 10, 10);
    run(w, 0.5);
    expect(w.gratitude.total).toBe(20);
    // 벽을 부숴 방을 해제한다
    w.voxels.setBlock(9, Y, 12, BlockId.air, 'player');
    w.voxels.setBlock(9, Y + 1, 12, BlockId.air, 'player');
    run(w, 0.5);
    expect(w.rooms.getByType('Bedroom')).toHaveLength(0);
    expect(w.gratitude.total).toBe(20);
    // 다시 막아 같은 타입이 되어도 또 주지 않는다
    w.voxels.setBlock(9, Y, 12, BlockId.plank, 'player');
    w.voxels.setBlock(9, Y + 1, 12, BlockId.plank, 'player');
    run(w, 0.5);
    expect(w.rooms.getByType('Bedroom')).toHaveLength(1);
    expect(w.gratitude.total).toBe(20);
  });

  it('spend 는 모자라면 아무것도 바꾸지 않는다. 저장 스냅샷을 되돌리면 중복 키도 돌아온다', () => {
    const w = village(at(21));
    const g = w.gratitude;
    g.gain({ kind: 'sleep', npcId: 'n1' }, 5, { x: 0, y: 0, z: 0 });
    expect(g.spend(6)).toBe(false);
    expect(g.total).toBe(5);
    expect(g.spend(5)).toBe(true);
    expect(g.total).toBe(0);
    g.gain({ kind: 'firstRoom', roomType: 'Kitchen' }, 20, { x: 0, y: 0, z: 0 });
    const snap = g.snapshot();
    const other = village(at(21)).gratitude;
    other.restore(snap);
    expect(other.total).toBe(20);
    expect(other.gain({ kind: 'sleep', npcId: 'n1' }, 5, { x: 0, y: 0, z: 0 })).toBe(false);
    expect(other.gain({ kind: 'firstRoom', roomType: 'Kitchen' }, 20, { x: 0, y: 0, z: 0 })).toBe(
      false,
    );
  });
});
