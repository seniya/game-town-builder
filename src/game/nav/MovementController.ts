// 경로 추종 (ARCHITECTURE 11.4 / 11.5, TASK-026). 칸 경로를 따라 몸체를 움직인다. 월드는 읽기만 한다.
// 이동은 플레이어와 같은 복셀 충돌(moveWithCollision)과 중력을 쓴다. 칸 가운데를 차례로 지나며 1 칸 턱은 충돌의 step-up 으로 오른다.
// 재계산 여부는 이 컨트롤러가 판단만 하고(무효화·연속 blocked·최소 간격), 경로 요청은 호출자(MoveAction)가 한다.
import { balance } from '../data/balance';
import type { AabbBody, BlockPos } from '../types';
import { moveWithCollision, type CollisionWorld } from '../voxel/collision';
import { standCellToWorldFeet } from '../voxel/coords';

/** 한 프레임의 이동 결과. */
export type MoveStatus = 'moving' | 'arrived' | 'blocked';

/** 중간 칸 가운데에 닿았다고 보는 수평 거리. 모서리에서 멈칫하지 않게 조금 느슨하다. */
const ARRIVE_EPSILON = 0.12;
/** 마지막 칸은 가운데에 거의 정확히 선다(사용 자세·다음 경로의 출발 칸이 흔들리지 않게). */
const FINAL_EPSILON = 0.01;
/** 칸 높이가 맞다고 보는 수직 차이. step-up 도중(0 < 차이 < 1)은 아직 도착이 아니다. */
const HEIGHT_EPSILON = 0.55;
/** 기대 이동량 대비 이 비율보다 적게 움직이면 막힌 프레임으로 센다. */
const BLOCKED_RATIO = 0.25;
/** 연속 blocked 가 이 횟수가 되면 재계산을 요청한다 (ARCHITECTURE 11.5). */
const BLOCKED_REPATH_COUNT = 3;

/**
 * NPC·몬스터 공용 경로 추종기. 중력은 같은 월드의 값(balance.player.gravity)을 쓴다.
 * update 가 경과 시간을 누적해 재계산 최소 간격(balance.npc.repathMinIntervalSeconds)을 지킨다.
 */
export class MovementController {
  private path: readonly BlockPos[] = [];
  private index = 0;
  private blockedFrames = 0;
  private repathWanted = false;
  private clock = 0;
  private lastRepathAt = Number.NEGATIVE_INFINITY;

  /** 충돌 판정용 월드를 받는다. */
  constructor(private readonly world: CollisionWorld) {}

  /** 현재 경로. 첫 칸은 출발 칸이다. */
  get currentPath(): readonly BlockPos[] {
    return this.path;
  }

  /** 남은 칸(다음 목표 칸부터). */
  get remaining(): readonly BlockPos[] {
    return this.path.slice(this.index);
  }

  /** 새 경로를 따른다. 출발 칸(첫 칸)은 이미 서 있는 칸이므로 다음 칸부터 향한다. */
  setPath(path: readonly BlockPos[]): void {
    this.path = path;
    this.index = path.length > 1 ? 1 : 0;
    this.blockedFrames = 0;
    this.repathWanted = false;
  }

  /** 경로 위의 셀이 바뀌었다. 다음 재계산 기회에 새 경로를 요청하게 한다 (ARCHITECTURE 11.5). */
  invalidate(): void {
    this.repathWanted = true;
  }

  /**
   * 재계산을 지금 요청해야 하는가. 무효화 또는 연속 blocked 가 있었고 마지막 재계산 뒤 최소 간격이 지났으면
   * true 를 반환하고 요청 시각을 기록한다. 간격 전이면 false 이고 요청은 남아 있다.
   */
  takeRepath(): boolean {
    if (!this.repathWanted) return false;
    if (this.clock - this.lastRepathAt < balance.npc.repathMinIntervalSeconds) return false;
    this.repathWanted = false;
    this.lastRepathAt = this.clock;
    return true;
  }

  /** 재계산 요청이 남아 있는가(간격 대기 포함). */
  get repathPending(): boolean {
    return this.repathWanted;
  }

  /**
   * 경로를 따라 body 를 dt 초 움직인다. 마지막 칸 가운데에 닿으면 'arrived'.
   * 기대보다 거의 못 움직였으면 'blocked' 이고 3 번 연속이면 재계산을 요청한다.
   * 경로가 없거나 다 왔으면 수평으로 멈춰 중력만 받는다.
   */
  update(dt: number, body: AabbBody, speed: number): MoveStatus {
    this.clock += dt;
    if (!(dt > 0)) return this.index >= this.path.length ? 'arrived' : 'moving';
    const target = this.path[this.index];
    if (!target) {
      this.stand(dt, body);
      return 'arrived';
    }
    let goal = standCellToWorldFeet(target);
    let dx = goal.x - body.pos.x;
    let dz = goal.z - body.pos.z;
    // 칸 가운데에 닿았으면 다음 칸으로 넘어간다(같은 프레임에 여러 칸을 건너뛰지 않는다)
    const eps = this.index === this.path.length - 1 ? FINAL_EPSILON : ARRIVE_EPSILON;
    if (Math.hypot(dx, dz) <= eps && Math.abs(goal.y - body.pos.y) < HEIGHT_EPSILON) {
      this.index += 1;
      const next = this.path[this.index];
      if (!next) {
        this.stand(dt, body);
        this.blockedFrames = 0;
        return 'arrived';
      }
      goal = standCellToWorldFeet(next);
      dx = goal.x - body.pos.x;
      dz = goal.z - body.pos.z;
    }
    const dist = Math.hypot(dx, dz);
    // 한 프레임에 목표를 지나치지 않도록 속도를 줄인다
    const v = dist > 0 ? Math.min(speed, dist / dt) / dist : 0;
    const before = body.pos;
    body.velocity = {
      x: dx * v,
      y: Math.max(body.velocity.y + balance.player.gravity * dt, balance.player.maxFallSpeed),
      z: dz * v,
    };
    moveWithCollision(this.world, body, dt, balance.player.stepUpHeight);
    const moved = Math.hypot(body.pos.x - before.x, body.pos.z - before.z);
    const expected = Math.min(speed * dt, dist);
    if (expected > 1e-6 && moved < expected * BLOCKED_RATIO) {
      this.blockedFrames += 1;
      if (this.blockedFrames >= BLOCKED_REPATH_COUNT) {
        this.blockedFrames = 0;
        this.repathWanted = true;
      }
      return 'blocked';
    }
    this.blockedFrames = 0;
    return 'moving';
  }

  /** 수평으로 멈추고 중력만 적용한다(대기·사용 중에도 발밑이 사라지면 떨어진다). */
  stand(dt: number, body: AabbBody): void {
    body.velocity = {
      x: 0,
      y: Math.max(body.velocity.y + balance.player.gravity * dt, balance.player.maxFallSpeed),
      z: 0,
    };
    moveWithCollision(this.world, body, dt, 0);
  }
}
