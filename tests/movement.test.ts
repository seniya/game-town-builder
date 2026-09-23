import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { MovementController } from '../src/game/nav/MovementController';
import { pathWatchCells } from '../src/game/nav/NavigationGraph';
import { findPath } from '../src/game/nav/pathfind';
import type { AabbBody, BlockPos } from '../src/game/types';
import { standCellToWorldFeet } from '../src/game/voxel/coords';
import { FEET_Y, navFixture, wallAlongZ, type NavFixture } from './helpers/navWorld';

const DT = 1 / 60;

/** 칸에 선 NPC 몸체. */
function bodyAt(cell: BlockPos): AabbBody {
  return {
    pos: standCellToWorldFeet(cell),
    velocity: { x: 0, y: 0, z: 0 },
    width: balance.npc.width,
    height: balance.npc.height,
    onGround: true,
  };
}

/** 경로를 찾는다. 없으면 실패한다. */
function pathOf(f: NavFixture, from: BlockPos, to: BlockPos): BlockPos[] {
  const r = findPath(f.graph, from, { kind: 'cell', pos: to }, 'npc', 100000);
  if (!r.path) throw new Error('경로 없음');
  return r.path;
}

describe('MovementController (TASK-026)', () => {
  it("경로를 따라 부드럽게 이동하고 목적지에 도착하면 'arrived' 를 반환한다", () => {
    const f = navFixture();
    const path = pathOf(f, f.cell(2, 5), f.cell(12, 5));
    const mc = new MovementController(f.world);
    const body = bodyAt(path[0] as BlockPos);
    mc.setPath(path);
    let status = 'moving';
    let t = 0;
    let lastX = body.pos.x;
    let maxStep = 0;
    while (status !== 'arrived' && t < 10) {
      status = mc.update(DT, body, balance.npc.moveSpeed);
      maxStep = Math.max(maxStep, body.pos.x - lastX);
      expect(body.pos.x).toBeGreaterThanOrEqual(lastX - 1e-9); // 되돌아가지 않는다
      lastX = body.pos.x;
      t += DT;
    }
    expect(status).toBe('arrived');
    expect(body.pos.x).toBeCloseTo(12.5, 1);
    expect(body.pos.z).toBeCloseTo(5.5, 1);
    // 10 칸 / 3.2 칸/초 ≈ 3.1 초. 칸마다 멈칫하지 않고 일정 속도로 간다
    expect(t).toBeGreaterThan(3.0);
    expect(t).toBeLessThan(3.5);
    expect(maxStep).toBeLessThanOrEqual(balance.npc.moveSpeed * DT + 1e-6);
    expect(mc.update(DT, body, balance.npc.moveSpeed)).toBe('arrived');
  });

  it('1 칸 계단을 오르고 내려간다', () => {
    const f = navFixture();
    f.put(6, FEET_Y, 5, BlockId.plank);
    f.put(7, FEET_Y, 5, BlockId.plank);
    f.put(7, FEET_Y + 1, 5, BlockId.plank);
    f.put(8, FEET_Y, 5, BlockId.plank);
    const path = pathOf(f, f.cell(3, 5), f.cell(11, 5));
    expect(Math.max(...path.map((p) => p.y))).toBe(FEET_Y + 2);
    const mc = new MovementController(f.world);
    const body = bodyAt(path[0] as BlockPos);
    mc.setPath(path);
    let status = 'moving';
    for (let i = 0; i < 600 && status !== 'arrived'; i++) status = mc.update(DT, body, 3.2);
    expect(status).toBe('arrived');
    expect(body.pos.y).toBeCloseTo(FEET_Y, 3);
  });

  it('경로 위의 블록을 부수면 재계산을 요청한다', () => {
    const f = navFixture();
    // 판자 다리 위를 지나는 경로: 다리 한 칸을 부수면 경로가 무효다
    for (let x = 4; x <= 10; x++) f.put(x, FEET_Y, 5, BlockId.plank);
    const path = pathOf(f, { x: 4, y: FEET_Y + 1, z: 5 }, { x: 10, y: FEET_Y + 1, z: 5 });
    const mc = new MovementController(f.world);
    const stop = f.graph.watch(pathWatchCells(path), () => mc.invalidate());
    mc.setPath(path);
    expect(mc.takeRepath()).toBe(false);
    f.world.setBlock(8, FEET_Y, 5, BlockId.air, 'player');
    expect(mc.takeRepath()).toBe(true);
    stop();
  });

  it('재계산이 0.5 초 간격 제한을 지킨다', () => {
    const f = navFixture();
    const mc = new MovementController(f.world);
    const body = bodyAt(f.cell(5, 5));
    mc.setPath([f.cell(5, 5)]);
    const at: number[] = [];
    for (let i = 0; i < 180; i++) {
      mc.invalidate(); // 매 프레임 무효화가 와도
      mc.update(DT, body, 3.2);
      if (mc.takeRepath()) at.push(i * DT);
    }
    expect(at.length).toBeLessThanOrEqual(Math.ceil(3 / balance.npc.repathMinIntervalSeconds) + 1);
    for (let i = 1; i < at.length; i++) {
      expect((at[i] as number) - (at[i - 1] as number)).toBeGreaterThanOrEqual(
        balance.npc.repathMinIntervalSeconds - 1e-9,
      );
    }
  });

  it("막혀서 3 번 연속 'blocked' 면 재계산을 요청한다", () => {
    const f = navFixture();
    const mc = new MovementController(f.world);
    const body = bodyAt(f.cell(5, 5));
    mc.setPath([f.cell(5, 5), f.cell(6, 5), f.cell(7, 5)]);
    wallAlongZ(f, 6, 5, 5); // 경로를 알리지 않고 막는다
    const statuses: string[] = [];
    for (let i = 0; i < 40; i++) {
      statuses.push(mc.update(DT, body, 3.2));
      if (mc.repathPending) break;
    }
    expect(statuses.slice(-3)).toEqual(['blocked', 'blocked', 'blocked']);
    expect(mc.takeRepath()).toBe(true);
  });

  it('두 캐릭터가 문 앞에서 겹쳐도 프레임이 떨어지지 않는다', () => {
    const f = navFixture();
    wallAlongZ(f, 10, 0, 31);
    f.world.setBlock(10, FEET_Y, 15, BlockId.air, 'player');
    f.world.setBlock(10, FEET_Y + 1, 15, BlockId.air, 'player');
    f.door(10, 15);
    const a = { from: f.cell(4, 15), to: f.cell(16, 15) };
    const b = { from: f.cell(16, 15), to: f.cell(4, 15) };
    const movers = [a, b].map((m) => {
      const mc = new MovementController(f.world);
      const body = bodyAt(m.from);
      let path = pathOf(f, m.from, m.to);
      mc.setPath(path);
      const stop = f.graph.watch(pathWatchCells(path), () => mc.invalidate());
      return {
        mc,
        body,
        m,
        get path() {
          return path;
        },
        set path(p: BlockPos[]) {
          path = p;
        },
        stop,
      };
    });
    let repaths = 0;
    let worstMs = 0;
    let arrived = 0;
    for (let i = 0; i < 60 * 12 && arrived < 2; i++) {
      const t0 = performance.now();
      arrived = 0;
      for (const mv of movers) {
        const s = mv.mc.update(DT, mv.body, 3.2);
        if (s === 'arrived') arrived += 1;
        if (mv.mc.takeRepath()) {
          repaths += 1;
          const cell = {
            x: Math.floor(mv.body.pos.x),
            y: Math.round(mv.body.pos.y),
            z: Math.floor(mv.body.pos.z),
          };
          mv.path = pathOf(f, cell, mv.m.to);
          mv.mc.setPath(mv.path);
        }
      }
      worstMs = Math.max(worstMs, performance.now() - t0);
    }
    expect(arrived).toBe(2);
    // 겹침은 충돌이 아니므로 서로 막지 않는다. 재계산이 폭주하지 않는다
    expect(repaths).toBeLessThanOrEqual(4);
    expect(worstMs).toBeLessThan(8);
  });
});
