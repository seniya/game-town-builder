import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/game/data/blocks';
import type { GameEventMap } from '../src/game/EventBus';
import type { GameWorld } from '../src/game/GameWorld';
import { at, run, village, Y } from './helpers/village';

/** 보고 이벤트를 모은다. */
function reports(w: GameWorld): GameEventMap['DAMAGE_REPORT'][] {
  const out: GameEventMap['DAMAGE_REPORT'][] = [];
  w.events.on('DAMAGE_REPORT', (r) => out.push(r));
  return out;
}

/** 판자 칸을 두고 몬스터가 부순 것처럼 없앤다. */
function smash(w: GameWorld, x: number, z: number): void {
  w.voxels.writeInitial(x, Y, z, BlockId.plank);
  w.voxels.setBlock(x, Y, z, BlockId.air, 'monster');
}

describe('피해 보고 (TASK-049, MVP_SPEC 25.4)', () => {
  it('습격 다음 아침 07:00 에 지난밤 파괴된 블록 수를 한 번 알린다', () => {
    const w = village(at(21), false);
    const got = reports(w);
    smash(w, 4, 30);
    smash(w, 6, 30);
    smash(w, 8, 30);
    run(w, 0.1);
    expect(got).toHaveLength(0); // 밤에는 알리지 않는다
    w.clock.advanceTo(6, 59);
    run(w, 0.1);
    expect(got).toHaveLength(0);
    w.clock.advanceTo(7, 0);
    run(w, 0.1);
    expect(got).toEqual([{ cells: 3, entries: 3 }]);
    run(w, 1);
    expect(got).toHaveLength(1); // 같은 아침에 두 번 알리지 않는다
  });

  it('피해가 없으면 보고하지 않는다', () => {
    const w = village(at(21), false);
    const got = reports(w);
    w.clock.advanceTo(7, 0);
    run(w, 0.1);
    expect(got).toHaveLength(0);
  });

  it('아침 전에 직접 고친 피해도 지난밤 파괴 수에 들어가고, 미수리 표시(목록)에서만 빠진다', () => {
    const w = village(at(21), false);
    const got = reports(w);
    smash(w, 4, 30);
    smash(w, 6, 30);
    w.voxels.setBlock(4, Y, 30, BlockId.plank, 'player');
    expect(w.repair.pending.flatMap((e) => e.cells)).toEqual([{ x: 6, y: Y, z: 30 }]);
    w.clock.advanceTo(7, 0);
    run(w, 0.1);
    expect(got).toEqual([{ cells: 2, entries: 2 }]);
  });

  it('두 번째 밤의 보고는 그 밤의 피해만 센다', () => {
    const w = village(at(21), false);
    const got = reports(w);
    smash(w, 4, 30);
    w.clock.advanceTo(7, 0);
    run(w, 0.1);
    w.clock.advanceTo(22, 0);
    smash(w, 10, 30);
    smash(w, 12, 30);
    w.clock.advanceTo(7, 0);
    run(w, 0.1);
    expect(got.map((r) => r.cells)).toEqual([1, 2]);
  });
});
