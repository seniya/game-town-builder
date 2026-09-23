// TASK-PERF-001 구조 점검: 주민 수가 늘어도 편집마다 주민별 재탐색·전역 검색이 생기지 않는다.
import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { at, bed, DOOR, run, village, Y } from './helpers/village';

describe('PERF-001 구조 (AC 4 / 5)', () => {
  it('도달할 수 없는 빈 침대의 재시도는 편집마다가 아니라 sleepRetrySeconds 에 한 번이다(주민 100 명)', () => {
    const w = village(at(9, 0)); // 주민이 서 있는 시간: 이동 경로 요청이 섞이지 않는다
    bed(w, 10, 10);
    // 문 바깥을 막아 침실을 도달할 수 없게 한다: 전원이 그 침대를 시도하고 "경로 없음"으로 기록된다
    for (const [dx, dz] of [
      [0, 1],
      [-1, 1],
      [1, 1],
      [0, 2],
    ] as const) {
      w.voxels.setBlock(DOOR.x + dx, Y, DOOR.z + dz, BlockId.plank, 'player');
      w.voxels.setBlock(DOOR.x + dx, Y + 1, DOOR.z + dz, BlockId.plank, 'player');
    }
    for (let i = 0; i < 100; i++)
      w.spawnResident('villager', { x: 1 + (i % 38), y: Y, z: 30 + Math.floor(i / 38) });
    run(w, 4);
    expect(w.sleep.stats.assigned).toBe(0);
    const before = w.paths.stats.completed;
    // 먼 곳에서 1 초 동안 30 번 편집한다
    for (let i = 0; i < 30; i++) {
      w.voxels.setBlock(35, Y, 35, i % 2 === 0 ? BlockId.plank : BlockId.air, 'player');
      run(w, 1 / 30);
    }
    const requests = w.paths.stats.completed - before + w.paths.stats.pending;
    // 침대 하나는 한 번에 한 주민만 확인한다(주민 수에 비례하지 않는다). 재시도는 1 초 창에 최대 1~2 번이다.
    // 제한이 없으면 편집 30 번마다 한 번씩 다시 탐색한다
    expect(requests).toBeLessThanOrEqual(Math.ceil(1 / balance.performance.sleepRetrySeconds) + 1);
  });

  it('경로 예산 4000 을 넘지 않고, 입력을 멈추면 경로 큐가 비며 굶는 요청이 없다', () => {
    const w = village(at(19, 58));
    for (const [x, z] of [
      [10, 10],
      [12, 10],
      [14, 10],
      [10, 13],
      [14, 13],
    ] as const)
      bed(w, x, z);
    for (let i = 0; i < 100; i++)
      w.spawnResident('villager', { x: 1 + (i % 38), y: Y, z: 30 + Math.floor(i / 38) });
    let maxNodes = 0;
    for (let f = 0; f < 60 * 20; f++) {
      w.update(1 / 60);
      maxNodes = Math.max(maxNodes, w.paths.stats.lastFrameNodes);
      if (f > 120 && w.paths.stats.pending === 0) break;
    }
    expect(maxNodes).toBeLessThanOrEqual(balance.performance.pathfindMaxNodes);
    expect(w.paths.stats.pending).toBe(0);
    expect(w.paths.stats.maxCompletedWaitFrames).toBeLessThan(60);
  });
});
