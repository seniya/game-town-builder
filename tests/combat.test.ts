import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { createMonster, type Monster } from '../src/game/entities/Monster';
import { GameWorld } from '../src/game/GameWorld';
import { aimRay } from '../src/game/systems/aim';
import { blockItem } from '../src/game/systems/InventorySystem';
import type { BlockPos } from '../src/game/types';
import { at, run, Y } from './helpers/village';

/** 플레이어가 있는 평지. plaza 가 있으면 종도 둔다(몬스터가 종으로 걸어간다). */
function arena(plaza: BlockPos | null = null): GameWorld {
  const w = new GameWorld({
    storage: balance.storage,
    worldSize: { sizeX: 32, sizeY: 8, sizeZ: 32 },
    startGameMinutes: at(22),
    playerSpawn: { x: 16, y: Y, z: 20 },
    ...(plaza ? { plazaCenter: plaza } : {}),
    gameEvents: [],
  });
  for (let x = 0; x < 32; x++)
    for (let z = 0; z < 32; z++) {
      w.voxels.writeInitial(x, 0, z, BlockId.bedrock);
      w.voxels.writeInitial(x, 1, z, BlockId.grass);
    }
  if (plaza) w.voxels.writeInitial(plaza.x, plaza.y, plaza.z, BlockId.bell);
  w.rooms.rebuildAll();
  return w;
}

/** 몬스터를 세운다. */
function monster(w: GameWorld, x: number, z: number, id = 'm1'): Monster {
  const m = createMonster(id, 1, { x: 0, y: Y, z: 0 });
  m.body.pos = { x, y: Y, z };
  w.registry.monsters.add(m);
  return m;
}

/** 좌클릭을 누른 채 seconds 동안 진행한다. */
function hold(w: GameWorld, seconds: number): void {
  w.input.setPointerLocked(true);
  w.input.mouseDown(0);
  run(w, seconds);
  w.input.mouseUp(0);
}

describe('전투 (TASK-046, MVP_SPEC 26 / 26.1)', () => {
  it('좌클릭은 조준한 몬스터를 공격하고 블록을 부수지 않는다. 세 대에 처치되며 조금 밀려난다', () => {
    const w = arena();
    const p = w.player;
    if (!p) throw new Error('플레이어 없음');
    const r = aimRay(w.voxels, p);
    // 광선 위 1.6 칸에 몬스터, 그 뒤 2.8 칸에 판자(몬스터가 블록보다 가깝다)
    const m = monster(w, r.origin.x + r.direction.x * 1.6, r.origin.z + r.direction.z * 1.6);
    const wall = {
      x: Math.floor(r.origin.x + r.direction.x * 2.8),
      y: Math.floor(r.origin.y),
      z: Math.floor(r.origin.z + r.direction.z * 2.8),
    };
    w.voxels.setBlock(wall.x, wall.y, wall.z, BlockId.plank, 'player');
    expect(w.combat.monsterInAim()?.id).toBe('m1');
    const z0 = m.body.pos.z;
    hold(w, 0.1);
    expect(m.health).toBe(2);
    expect(Math.abs(m.body.pos.z - z0)).toBeGreaterThan(0.1);
    expect(w.voxels.getBlock(wall.x, wall.y, wall.z)).toBe(BlockId.plank);
    expect(w.blockEdit?.breakProgress ?? 0).toBe(0);
    // 넉백으로 멀어졌으니 다시 조준 광선 위로 되돌려 두고 계속 친다
    const again = (): void => {
      m.body.pos = {
        x: r.origin.x + r.direction.x * 1.6,
        y: Y,
        z: r.origin.z + r.direction.z * 1.6,
      };
    };
    again();
    hold(w, 0.55);
    again();
    hold(w, 0.55);
    expect(w.registry.monsters.get('m1')).toBeUndefined();
  });

  it('몬스터는 주민을 1.5 초마다 2 씩 때리고, 체력 0 이면 30 게임분 기절한다. 기절 중에는 맞지 않고 깨면 체력 10', () => {
    const w = arena();
    const npc = w.spawnResident('farmer', { x: 5, y: Y, z: 5 });
    npc.body.pos = { x: 5.5, y: Y, z: 5.5 };
    const m = monster(w, 6.4, 5.5);
    run(w, 0.1);
    expect(npc.health).toBe(8);
    run(w, 1.5);
    expect(npc.health).toBe(6);
    run(w, 1.5 * 3 + 0.1);
    expect(npc.health).toBe(0);
    expect(npc.stunUntilGameMinutes).toBeGreaterThan(w.clock.gameMinutes);
    run(w, 0.2);
    expect(npc.action.label).toBe('기절');
    // 기절 중에는 다시 맞지 않는다
    run(w, 3);
    expect(npc.health).toBe(0);
    // 30 게임분 뒤 체력 10 으로 깬다
    w.registry.monsters.remove(m.id);
    const wake = (balance.clock.startHour * 60 + npc.stunUntilGameMinutes + 1) % 1440;
    w.clock.advanceTo(Math.floor(wake / 60), Math.floor(wake % 60));
    run(w, 0.2);
    expect(npc.stunUntilGameMinutes).toBe(0);
    expect(npc.health).toBe(balance.npc.maxHealth);
    expect(npc.action.label).not.toBe('기절');
  });

  it('가슴 높이 선분에 고체 칸이 있으면 사거리 안이어도 때리지 않는다', () => {
    const w = arena();
    const npc = w.spawnResident('farmer', { x: 7, y: Y, z: 5 });
    const m = monster(w, 5.9, 5.5);
    // 물리를 돌리지 않고 몸체만 둔다(벽 칸과 겹쳐도 판정 규칙만 본다)
    npc.body.pos = { x: 7.05, y: Y, z: 5.5 };
    expect(w.combat.targetInRange(m)).toMatchObject({ kind: 'npc', id: npc.id });
    w.voxels.setBlock(6, Y + 1, 5, BlockId.plank, 'player');
    expect(w.combat.targetInRange(m)).toBeNull();
    // 높이 차 1.5 이상도 때리지 않는다
    w.voxels.setBlock(6, Y + 1, 5, BlockId.air, 'player');
    npc.body.pos = { x: 6.5, y: Y + 1.5, z: 5.5 };
    expect(w.combat.targetInRange(m)).toBeNull();
  });

  it('플레이어가 쓰러지면 종 옆(몬스터와 떨어진 광장 칸)에서 체력 20 으로 부활하고 인벤토리를 잃지 않는다. 게임 오버는 없다', () => {
    const w = arena({ x: 16, y: Y, z: 10 });
    const p = w.player;
    if (!p) throw new Error('플레이어 없음');
    w.inventory.add([{ item: blockItem(BlockId.plank), count: 7 }]);
    const downs: number[] = [];
    w.events.on('PLAYER_DOWN', () => downs.push(1));
    p.health = 2;
    const m = monster(w, p.body.pos.x + 0.8, p.body.pos.z);
    run(w, 0.1);
    expect(downs).toHaveLength(1);
    expect(p.health).toBe(balance.player.maxHealth);
    expect(w.inventory.count(blockItem(BlockId.plank))).toBe(7);
    // 종 둘레이고 몬스터와 3 칸 이상 떨어졌다
    expect(Math.hypot(p.body.pos.x - 16.5, p.body.pos.z - 10.5)).toBeLessThanOrEqual(
      balance.world.plazaRadius + 1,
    );
    expect(
      Math.hypot(p.body.pos.x - m.body.pos.x, p.body.pos.z - m.body.pos.z),
    ).toBeGreaterThanOrEqual(3);
    // 부활 보호 3 초: 옆에 와도 맞지 않는다
    m.body.pos = { x: p.body.pos.x + 0.8, y: p.body.pos.y, z: p.body.pos.z };
    run(w, 1);
    expect(p.health).toBe(balance.player.maxHealth);
    expect(w.combat.guarded).toBe(true);
  });

  it('종에 도달한 몬스터는 가까운 주민을 쫓아가 멈춰 서서 때린다', () => {
    const w = arena({ x: 16, y: Y, z: 16 });
    const npc = w.spawnResident('farmer', { x: 16, y: Y, z: 24 });
    // 플레이어는 멀리 둔다(더 가까운 대상을 먼저 쫓으므로)
    if (w.player) w.player.body.pos = { x: 1.5, y: Y, z: 1.5 };
    w.clock.advanceTo(22, 0);
    const m = monster(w, 16.5, 13.5);
    run(w, 12, () => npc.health < balance.npc.maxHealth);
    expect(npc.health).toBeLessThan(balance.npc.maxHealth);
    run(w, 0.1);
    expect(m.action.kind).toBe('attack');
  });
});
