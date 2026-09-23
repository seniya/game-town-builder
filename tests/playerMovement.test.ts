import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import { BlockId } from '../src/game/data/blocks';
import { EventBus } from '../src/game/EventBus';
import { forwardDirection, lookDirection, type Player } from '../src/game/entities/Player';
import { EMPTY_INPUT_FRAME, InputSystem, type InputFrame } from '../src/game/systems/InputSystem';
import {
  createPlayer,
  isSafeStandCell,
  PlayerMovementSystem,
} from '../src/game/systems/PlayerMovementSystem';
import { VoxelWorld } from '../src/game/voxel/VoxelWorld';

const SIZE = { sizeX: 32, sizeY: 32, sizeZ: 32 };

/** y=0..4 가 stone 인 평지 월드. 지면 위 첫 칸은 y=5 다. */
function flat(): VoxelWorld {
  const w = new VoxelWorld(SIZE, new EventBus());
  for (let x = 0; x < 32; x++) {
    for (let z = 0; z < 32; z++)
      for (let y = 0; y <= 4; y++) w.writeInitial(x, y, z, BlockId.stone);
  }
  return w;
}

/** 고정 입력을 돌려주는 가짜 입력원. */
function scripted(frame: Partial<InputFrame> = {}): { frame: InputFrame } {
  return { frame: { ...EMPTY_INPUT_FRAME, ...frame } };
}

/** seconds 동안 60Hz 로 update 를 부른다. */
function run(sys: PlayerMovementSystem, seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) sys.update(dt);
}

/** 시작 칸에 선 플레이어와 시스템. */
function setup(
  world: VoxelWorld,
  input: { frame: InputFrame },
  spawn = { x: 5, y: 5, z: 5 },
): { player: Player; sys: PlayerMovementSystem } {
  const player = createPlayer(spawn);
  return { player, sys: new PlayerMovementSystem(world, player, input) };
}

describe('PlayerMovementSystem (TASK-010)', () => {
  it('W 는 카메라 기준 앞으로 걷는다. yaw 를 돌리면 방향이 바뀐다', () => {
    const w = flat();
    const input = scripted({ moveForward: 1 });
    const { player, sys } = setup(w, input, { x: 16, y: 5, z: 16 });
    run(sys, 1);
    // yaw 0 의 앞은 -z
    expect(player.body.pos.z).toBeLessThan(16.5 - 4);
    expect(Math.abs(player.body.pos.x - 16.5)).toBeLessThan(1e-6);
    player.yaw = Math.PI / 2; // 앞이 -x
    const x0 = player.body.pos.x;
    run(sys, 0.5);
    expect(player.body.pos.x).toBeLessThan(x0 - 2);
    expect(forwardDirection(player).x).toBeCloseTo(-1);
  });

  it('걷기 4.5 / 달리기 7.0 칸/초', () => {
    const w = flat();
    const walk = setup(w, scripted({ moveRight: 1 }), { x: 2, y: 5, z: 16 });
    run(walk.sys, 1);
    expect(walk.player.body.pos.x - 2.5).toBeCloseTo(balance.player.walkSpeed, 0);
    const runner = setup(w, scripted({ moveRight: 1, run: true }), { x: 2, y: 5, z: 20 });
    run(runner.sys, 1);
    expect(runner.player.body.pos.x - 2.5).toBeCloseTo(balance.player.runSpeed, 0);
  });

  it('Space 로 점프해 한 칸 블록 위로 올라간다. 최고 높이는 1.25 이다', () => {
    const w = flat();
    const input = scripted({ jump: true });
    const { player, sys } = setup(w, input);
    run(sys, 0.2); // 착지
    let top = 0;
    input.frame = { ...EMPTY_INPUT_FRAME, jump: true };
    for (let i = 0; i < 40; i++) {
      sys.update(1 / 60);
      top = Math.max(top, player.body.pos.y - 5);
      input.frame = EMPTY_INPUT_FRAME;
    }
    expect(top).toBeGreaterThan(1.1);
    expect(top).toBeLessThanOrEqual(balance.player.jumpHeight + 0.01);
    // 두 칸 높이 벽 앞에 한 칸 블록을 두고 점프 + 전진으로 올라선다
    const w2 = flat();
    for (let z = 0; z < 32; z++)
      for (let x = 8; x < 32; x++) w2.writeInitial(x, 5, z, BlockId.plank);
    const climbInput = scripted({ moveRight: 1, jump: true });
    const climb = setup(w2, climbInput);
    run(climb.sys, 1);
    climbInput.frame = EMPTY_INPUT_FRAME;
    run(climb.sys, 1);
    expect(climb.player.body.pos.y).toBe(6);
    expect(climb.player.body.pos.x).toBeGreaterThan(8);
  });

  it('피치는 -80° ~ +60° 에서 멈춘다', () => {
    const w = flat();
    const input = scripted({ lookDeltaY: 100000 });
    const { player, sys } = setup(w, input);
    sys.update(1 / 60);
    expect(player.pitch).toBeCloseTo((balance.player.pitchMinDeg * Math.PI) / 180);
    input.frame = { ...EMPTY_INPUT_FRAME, lookDeltaY: -100000 };
    sys.update(1 / 60);
    expect(player.pitch).toBeCloseTo((balance.player.pitchMaxDeg * Math.PI) / 180);
    expect(lookDirection(player).y).toBeGreaterThan(0);
  });

  it('dt 가 수십 초여도 바닥을 뚫지 않는다 (dt 클램프)', () => {
    const w = flat();
    const { player, sys } = setup(w, scripted(), { x: 5, y: 20, z: 5 });
    sys.update(30);
    sys.update(30);
    for (let i = 0; i < 20; i++) sys.update(10);
    expect(player.body.pos.y).toBe(5);
  });
});

describe('물·경계·발판 상실 (READY-06, MVP_SPEC 9.5)', () => {
  /** x ≥ 20 은 지면이 y=2 까지이고 y=3 에 물이 찬 바다다. */
  function withSea(): VoxelWorld {
    const w = flat();
    for (let x = 20; x < 32; x++) {
      for (let z = 0; z < 32; z++) {
        for (let y = 3; y <= 4; y++) w.writeInitial(x, y, z, y === 4 ? BlockId.air : BlockId.water);
      }
    }
    return w;
  }

  it('걸어서 물가에 가면 가장자리에서 멈춘다: 튕겨 돌아오지 않는다 (HR-006)', () => {
    const w = withSea();
    const input = scripted({ moveRight: 1 });
    const { player, sys } = setup(w, input, { x: 15, y: 5, z: 10 });
    let maxX = 0;
    let jumpedBack = false;
    for (let t = 0; t < 3; t += 1 / 60) {
      const x0 = player.body.pos.x;
      sys.update(1 / 60);
      maxX = Math.max(maxX, player.body.pos.x);
      if (player.body.pos.x < x0 - 0.5) jumpedBack = true;
    }
    expect(jumpedBack).toBe(false);
    expect(maxX).toBeLessThan(20.01); // 몸 가운데가 물 위로 넘어가지 않는다
    expect(maxX).toBeGreaterThan(19.9);
    expect(player.body.pos.y).toBe(5);
    // 물가를 따라서는 계속 걸을 수 있다(z 축은 막히지 않는다)
    input.frame = { ...EMPTY_INPUT_FRAME, moveRight: 1, moveForward: 1 };
    const z0 = player.body.pos.z;
    run(sys, 0.5);
    expect(Math.abs(player.body.pos.z - z0)).toBeGreaterThan(1);
    expect(player.body.pos.x).toBeLessThan(20.01);
  });

  it('점프·추락으로 바다에 들어가면 마지막 안전 지면으로 복귀하고 체력은 그대로다', () => {
    const w = withSea();
    const input = scripted({ moveRight: 1 });
    const { player, sys } = setup(w, input, { x: 15, y: 5, z: 10 });
    run(sys, 3);
    // 가장자리 멈춤을 넘어 물 위로 옮겨 떨어뜨린다(점프로 넘어간 경우와 같다)
    player.body.pos = { x: 22.5, y: 6, z: 10.5 };
    player.body.onGround = false;
    input.frame = EMPTY_INPUT_FRAME;
    run(sys, 1);
    expect(player.body.pos.x).toBeLessThan(20);
    expect(player.body.pos.y).toBe(5);
    expect(player.health).toBe(balance.player.maxHealth);
    expect(player.lastSafeCell.x).toBe(19);
  });

  it('안전 지면이 무효면 시작 칸 위의 안전 지면으로 간다', () => {
    const w = withSea();
    const { player, sys } = setup(w, scripted(), { x: 15, y: 5, z: 10 });
    run(sys, 0.1);
    player.lastSafeCell = { x: 18, y: 5, z: 10 };
    // 기록된 안전 지면의 발밑을 없앤다 (아래도 모두 air → 안전하지 않다)
    for (let y = 0; y <= 4; y++) w.setBlock(18, y, 10, BlockId.air, 'player');
    expect(isSafeStandCell(w, { x: 18, y: 5, z: 10 })).toBe(false);
    player.body.pos = { x: 25.5, y: 3, z: 10.5 };
    sys.update(1 / 60);
    expect(player.body.pos).toEqual({ x: 15.5, y: 5, z: 10.5 });
  });

  it('높은 곳에서 떨어져도 피해 없이 착지한다', () => {
    const w = flat();
    const { player, sys } = setup(w, scripted(), { x: 5, y: 30, z: 5 });
    run(sys, 3);
    expect(player.body.pos.y).toBe(5);
    expect(player.body.onGround).toBe(true);
    expect(player.health).toBe(balance.player.maxHealth);
  });

  it('발밑 블록이 사라지면 그대로 떨어진다', () => {
    const w = flat();
    const { player, sys } = setup(w, scripted());
    run(sys, 0.2);
    expect(player.body.pos.y).toBe(5);
    w.setBlock(5, 4, 5, BlockId.air, 'player');
    w.setBlock(5, 3, 5, BlockId.air, 'player');
    run(sys, 1);
    expect(player.body.pos.y).toBe(3);
  });

  it('블록에 끼면 위로 가장 가까운 빈 자리로 올라간다', () => {
    const w = flat();
    const { player, sys } = setup(w, scripted());
    run(sys, 0.2);
    w.setBlock(5, 5, 5, BlockId.stone, 'player');
    w.setBlock(5, 6, 5, BlockId.stone, 'player');
    sys.update(1 / 60);
    expect(player.body.pos.y).toBeGreaterThanOrEqual(7);
    run(sys, 0.5);
    expect(player.body.pos.y).toBe(7);
  });
});

describe('InputSystem', () => {
  it('프레임 사이의 입력을 한 장으로 확정하고 한 번성 입력을 비운다', () => {
    const input = new InputSystem();
    input.keyDown('KeyW');
    input.keyDown('Digit3');
    input.setPointerLocked(true);
    input.mouseMove(10, -4);
    input.mouseDown(2);
    input.wheelScroll(120);
    input.update();
    const f = input.frame;
    expect(f.moveForward).toBe(1);
    expect(f.hotbarSelect).toBe(2);
    expect([f.lookDeltaX, f.lookDeltaY]).toEqual([10, -4]);
    expect(f.secondaryPressed).toBe(true);
    expect(f.wheelSteps).toBe(1);
    input.update();
    expect(input.frame.moveForward).toBe(1);
    expect(input.frame.hotbarSelect).toBeNull();
    expect(input.frame.secondaryPressed).toBe(false);
    expect(input.frame.lookDeltaX).toBe(0);
  });

  it('포인터 락이 아니면 마우스 입력을 버리고, 포커스를 잃으면 눌린 키를 뗀다', () => {
    const input = new InputSystem();
    input.mouseMove(50, 50);
    input.mouseDown(0);
    input.keyDown('KeyD');
    input.update();
    expect(input.frame.lookDeltaX).toBe(0);
    expect(input.frame.primaryHeld).toBe(false);
    input.releaseAll();
    input.update();
    expect(input.frame.moveRight).toBe(0);
  });

  it('키 자동 반복은 새로 누른 것으로 세지 않는다', () => {
    const input = new InputSystem();
    input.keyDown('KeyE');
    input.update();
    expect(input.frame.pressed.has('KeyE')).toBe(true);
    input.keyDown('KeyE', true);
    input.update();
    expect(input.frame.pressed.has('KeyE')).toBe(false);
  });
});
