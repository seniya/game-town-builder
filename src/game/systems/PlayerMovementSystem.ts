// 플레이어 이동 + 충돌 (ARCHITECTURE 4.1 의 3 번, 8.2). 물 복귀·안전 지면·끼임 해소도 여기서 한다 (MVP_SPEC 9.5).
// 입력은 InputFrame 으로만 읽는다. 월드는 읽기만 한다.
import { balance } from '../data/balance';
import { BlockId } from '../data/blocks';
import type { Player } from '../entities/Player';
import { forwardDirection, rightDirection } from '../entities/Player';
import type { SlotSystem } from '../GameWorld';
import type { BlockPos, Vec3 } from '../types';
import {
  isAabbFree,
  isCollisionSolid,
  moveWithCollision,
  type CollisionWorld,
} from '../voxel/collision';
import { standCellToWorldFeet, worldToBlock } from '../voxel/coords';
import type { InputFrame } from './InputSystem';

const P = balance.player;
const DEG = Math.PI / 180;
/** 점프 초속. 최고점이 jumpHeight 가 되도록 v = √(2·|g|·h) 로 계산한다 (MVP_SPEC 9.1). */
const JUMP_SPEED = Math.sqrt(2 * Math.abs(P.gravity) * P.jumpHeight);
/** 발 아래 칸을 찾을 때 발밑에서 내려가는 거리. */
const BELOW_PROBE = 0.01;

/** 시작 칸(발이 놓이는 칸)에 선 플레이어를 만든다. 시작 칸이 첫 안전 지면이다 (MVP_SPEC 9.5). */
export function createPlayer(spawnCell: BlockPos): Player {
  return {
    id: 'player',
    body: {
      pos: standCellToWorldFeet(spawnCell),
      velocity: { x: 0, y: 0, z: 0 },
      width: P.width,
      height: P.height,
      onGround: false,
    },
    yaw: 0,
    pitch: 0,
    health: P.maxHealth,
    spawnCell,
    lastSafeCell: spawnCell,
  };
}

/** 입력 프레임을 제공하는 쪽. InputSystem 이 구현한다. */
export interface InputFrameSource {
  readonly frame: InputFrame;
}

/** 칸이 물인가. */
function isWater(world: CollisionWorld, p: BlockPos): boolean {
  return world.getBlock(p.x, p.y, p.z) === BlockId.water;
}

/**
 * cell 이 안전 지면인가 (MVP_SPEC 9.5).
 * 아래 칸이 고체이고 물이 아니며, 발 칸·머리 칸이 물이 아니고, 그 자리에 선 AABB 가 비어 있다.
 */
export function isSafeStandCell(world: CollisionWorld, cell: BlockPos): boolean {
  const below = { x: cell.x, y: cell.y - 1, z: cell.z };
  const head = { x: cell.x, y: cell.y + 1, z: cell.z };
  if (!isCollisionSolid(world, below.x, below.y, below.z) || isWater(world, below)) return false;
  if (isWater(world, cell) || isWater(world, head)) return false;
  return isAabbFree(world, standCellToWorldFeet(cell), P.width, P.height);
}

/** 플레이어의 발 칸 또는 머리 칸이 물인가. */
function isInWater(world: CollisionWorld, feet: Vec3): boolean {
  const cell = worldToBlock(feet);
  return isWater(world, cell) || isWater(world, { x: cell.x, y: cell.y + 1, z: cell.z });
}

/** 걷기 / 달리기 / 점프 / 중력과 충돌, 물 복귀를 적용한다. */
export class PlayerMovementSystem implements SlotSystem {
  /** 월드·플레이어·입력을 주입받는다. */
  constructor(
    private readonly world: CollisionWorld,
    private readonly player: Player,
    private readonly input: InputFrameSource,
  ) {}

  /** 한 프레임. dt 는 main 에서 이미 클램프되었지만 여기서도 상한을 지킨다. */
  update(dt: number): void {
    const step = Math.min(dt, P.maxFrameSeconds);
    if (!(step > 0)) return;
    const frame = this.input.frame;
    this.applyLook(frame);
    this.resolveEmbedded();
    this.applyVelocity(frame, step);
    const before = this.player.body.pos;
    const grounded = this.player.body.onGround;
    moveWithCollision(this.world, this.player.body, step, P.stepUpHeight);
    if (grounded) this.stopAtWaterEdge(before);
    if (isInWater(this.world, this.player.body.pos)) {
      this.returnToSafeGround();
      return;
    }
    this.recordSafeGround();
  }

  /**
   * 물 가장자리 멈춤 (MVP_SPEC 9.5, HR-006). 지면에서 걷다가 몸 가운데 아래가 물이 되는 이동을 막는다.
   * x·z 한 축씩 다시 시도해 되는 축만 남긴다. 걸어서 물에 들어갔다 튕겨 돌아오는 장면을 없앤다.
   */
  private stopAtWaterEdge(before: Vec3): void {
    const body = this.player.body;
    const after = body.pos;
    if (!this.overWater(after)) return;
    const onlyX = { ...before, x: after.x, y: after.y };
    const onlyZ = { ...before, z: after.z, y: after.y };
    const fits = (p: Vec3): boolean =>
      !this.overWater(p) && isAabbFree(this.world, p, body.width, body.height);
    if (fits(onlyX)) body.pos = onlyX;
    else if (fits(onlyZ)) body.pos = onlyZ;
    else body.pos = { ...before, y: after.y };
    body.velocity = {
      x: body.pos.x === before.x ? 0 : body.velocity.x,
      y: body.velocity.y,
      z: body.pos.z === before.z ? 0 : body.velocity.z,
    };
  }

  /** 몸 가운데 아래로 4 칸 안의 첫 블록이 물인가(발 칸·머리 칸이 이미 물인 경우 포함). */
  private overWater(feet: Vec3): boolean {
    if (isInWater(this.world, feet)) return true;
    const x = Math.floor(feet.x);
    const z = Math.floor(feet.z);
    const top = Math.floor(feet.y - 0.01);
    for (let y = top; y >= top - 3; y--) {
      const id = this.world.getBlock(x, y, z);
      if (id === BlockId.water) return true;
      if (id !== BlockId.air) return false;
    }
    return false;
  }

  /** 마우스 이동으로 yaw / pitch 를 바꾼다. 피치는 제한 각도에서 멈춘다 (MVP_SPEC 9.3). */
  private applyLook(frame: InputFrame): void {
    const p = this.player;
    p.yaw -= frame.lookDeltaX * P.mouseRadiansPerPixel;
    p.pitch -= frame.lookDeltaY * P.mouseRadiansPerPixel;
    p.pitch = Math.min(P.pitchMaxDeg * DEG, Math.max(P.pitchMinDeg * DEG, p.pitch));
  }

  /** 입력으로 수평 속도·점프를 정하고 중력을 더한다. 수평 이동은 카메라 기준이다. */
  private applyVelocity(frame: InputFrame, dt: number): void {
    const p = this.player;
    const f = forwardDirection(p);
    const r = rightDirection(p);
    let wx = f.x * frame.moveForward + r.x * frame.moveRight;
    let wz = f.z * frame.moveForward + r.z * frame.moveRight;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      const speed = frame.run ? P.runSpeed : P.walkSpeed;
      wx = (wx / len) * speed;
      wz = (wz / len) * speed;
    }
    let vy = p.body.velocity.y;
    if (frame.jump && p.body.onGround) {
      vy = JUMP_SPEED;
      p.body.onGround = false;
    }
    vy = Math.max(vy + P.gravity * dt, P.maxFallSpeed);
    p.body.velocity = { x: wx, y: vy, z: wz };
  }

  /**
   * 이동 시작 시 AABB 가 고체와 겹치면 같은 (x, z) 에서 위로 가장 가까운 빈 자리로 올린다 (MVP_SPEC 9.5).
   * 빈 자리가 없으면 안전 지면으로 복귀한다.
   */
  private resolveEmbedded(): void {
    const body = this.player.body;
    if (isAabbFree(this.world, body.pos, body.width, body.height)) return;
    for (let y = Math.floor(body.pos.y) + 1; y < this.world.sizeY; y++) {
      const feet = { ...body.pos, y };
      if (isAabbFree(this.world, feet, body.width, body.height) && !isInWater(this.world, feet)) {
        body.pos = feet;
        body.velocity = { ...body.velocity, y: 0 };
        return;
      }
    }
    this.returnToSafeGround();
  }

  /** 마지막 안전 지면으로 복귀한다. 무효면 시작 칸 위로 가장 가까운 안전 지면을 쓴다 (MVP_SPEC 9.5). */
  private returnToSafeGround(): void {
    const p = this.player;
    const cell = isSafeStandCell(this.world, p.lastSafeCell)
      ? p.lastSafeCell
      : this.safeCellAboveSpawn();
    p.lastSafeCell = cell;
    p.body.pos = standCellToWorldFeet(cell);
    p.body.velocity = { x: 0, y: 0, z: 0 };
    p.body.onGround = true;
  }

  /** 시작 칸의 (x, z) 열에서 시작 칸 높이부터 위로 첫 안전 지면. 없으면 월드 꼭대기다. */
  private safeCellAboveSpawn(): BlockPos {
    const s = this.player.spawnCell;
    for (let y = Math.max(1, s.y); y < this.world.sizeY; y++) {
      const cell = { x: s.x, y, z: s.z };
      if (isSafeStandCell(this.world, cell)) return cell;
    }
    // 열 전체가 막힌 경우. 정상 섬에서는 일어나지 않으며 중력으로 떨어지게 둔다
    return { x: s.x, y: this.world.sizeY - 2, z: s.z };
  }

  /** 지면에 서 있고 발 아래가 안전하면 현재 칸을 안전 지면으로 기록한다. */
  private recordSafeGround(): void {
    const body = this.player.body;
    if (!body.onGround) return;
    const cell = worldToBlock(body.pos);
    const below = worldToBlock({ ...body.pos, y: body.pos.y - BELOW_PROBE });
    if (below.y !== cell.y - 1) return;
    if (isSafeStandCell(this.world, cell)) this.player.lastSafeCell = cell;
  }
}
