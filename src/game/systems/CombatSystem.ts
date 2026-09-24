// 전투 (MVP_SPEC 19.2 / 24.2 / 26 / 26.1, ARCHITECTURE 4.1 의 12 번, ADR 036, TASK-046). 체력 변경·기절·부활의 유일한 소유자다.
// 플레이어: 조준 광선이 사거리 2.5 안에서 블록보다 먼저 몬스터에 닿으면 좌클릭이 공격이다(0.5 초, 1, 넉백 0.3).
// 몬스터: 수평 1.2·높이 차 1.5 미만·가림 없는 가장 가까운 대상(플레이어·기절하지 않은 주민)을 1.5 초마다 2 로 때린다.
// 주민은 체력 0 이면 30 게임분 기절한다(죽지 않는다). 플레이어는 체력 0 이면 종 옆에서 부활한다(게임 오버 없음).
import { balance } from '../data/balance';
import type { Monster } from '../entities/Monster';
import type { NPC } from '../entities/NPC';
import type { Player } from '../entities/Player';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type { ActionView, AabbBody, BlockPos, GameClockReader, Vec3 } from '../types';
import { isCollisionSolid, moveWithCollision, type CollisionWorld } from '../voxel/collision';
import { standCellToWorldFeet } from '../voxel/coords';
import { aimRay, findAimTarget } from './aim';
import { rayHitsBody } from './interaction';

const P = balance.player;
const M = balance.monster;
const C = balance.combat;

/** 몬스터가 때릴 수 있는 대상. */
export type CombatTarget =
  | { readonly kind: 'player'; readonly body: AabbBody }
  | { readonly kind: 'npc'; readonly id: string; readonly body: AabbBody };

/** 추적 대상. id 는 'player' 또는 주민 id 다. */
export interface ChaseTarget {
  readonly id: string;
  readonly pos: Vec3;
}

/** CombatSystem 이 읽고 쓰는 것. */
export interface CombatDeps {
  readonly events: EventBus;
  readonly clock: GameClockReader;
  readonly world: CollisionWorld;
  readonly player: Player | null;
  /** 이번 프레임 좌클릭 유지 */
  readonly primaryHeld: () => boolean;
  readonly monsters: {
    values(): IterableIterator<Monster>;
    remove(id: string): boolean;
  };
  readonly npcs: () => Iterable<NPC<ActionView>>;
  /** 부활 후보 칸(종 둘레 광장 칸). 비어 있으면 플레이어 시작 칸 */
  readonly respawnCells: () => readonly BlockPos[];
  readonly playerSpawn: BlockPos | null;
}

/** 수평 거리. */
function flat(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** 공격·체력·기절·부활. */
export class CombatSystem implements SlotSystem {
  private playerCooldown = 0;
  private guard = 0;
  private readonly monsterCooldown = new Map<string, number>();

  /** 포트를 받는다. */
  constructor(private readonly deps: CombatDeps) {}

  /** 부활 보호 중인가. */
  get guarded(): boolean {
    return this.guard > 0;
  }

  /**
   * 조준 광선이 사거리 안에서 블록보다 먼저 닿는 몬스터. 없으면 null.
   * BlockEditSystem 도 이것으로 파괴를 멈춘다(좌클릭이 공격이 된다).
   */
  monsterInAim(): Monster | null {
    const p = this.deps.player;
    if (!p) return null;
    const ray = aimRay(this.deps.world, p);
    const block = findAimTarget(this.deps.world, p);
    const limit = Math.min(P.attackRange, block?.distance ?? Number.POSITIVE_INFINITY);
    let best: { m: Monster; t: number } | null = null;
    for (const m of this.deps.monsters.values()) {
      const t = rayHitsBody(ray.origin, ray.direction, m.body);
      if (t !== null && t <= limit && (!best || t < best.t)) best = { m, t };
    }
    return best?.m ?? null;
  }

  /**
   * 이 몬스터가 지금 때릴 수 있는 가장 가까운 대상 (MVP_SPEC 26.1). 없으면 null.
   * MonsterSystem 이 이것이 있으면 멈춰 서서 공격 자세를 한다.
   */
  targetInRange(m: Monster): CombatTarget | null {
    let best: { t: CombatTarget; d: number } | null = null;
    for (const t of this.targets()) {
      if (!this.canHit(m.body, t.body)) continue;
      const d = flat(m.body.pos, t.body.pos);
      if (!best || d < best.d) best = { t, d };
    }
    return best?.t ?? null;
  }

  /**
   * 추적할 대상: 반경 12 안 가장 가까운 대상(가림 무관)의 id('player' 또는 주민 id)와 발 위치. 없으면 null.
   * skip 이 참인 id 는 건너뛴다(MonsterSystem 이 포기한 대상, MVP_SPEC 24.3 의 5).
   */
  chaseTarget(m: Monster, skip?: (id: string) => boolean): ChaseTarget | null {
    let best: { t: ChaseTarget; d: number } | null = null;
    for (const t of this.targets()) {
      const id = t.kind === 'player' ? 'player' : t.id;
      if (skip?.(id)) continue;
      const d = flat(m.body.pos, t.body.pos);
      if (d <= M.chaseRadius && (!best || d < best.d)) best = { t: { id, pos: t.body.pos }, d };
    }
    return best?.t ?? null;
  }

  /** 12 번 슬롯: 기절 회복 → 플레이어 공격 → 몬스터 공격. */
  update(dt: number): void {
    this.playerCooldown = Math.max(0, this.playerCooldown - dt);
    this.guard = Math.max(0, this.guard - dt);
    this.recoverStunned();
    this.playerAttack();
    this.monsterAttacks(dt);
  }

  /** 기절이 끝난 주민의 체력을 회복한다. */
  private recoverStunned(): void {
    const now = this.deps.clock.gameMinutes;
    for (const n of this.deps.npcs()) {
      if (n.stunUntilGameMinutes > 0 && now >= n.stunUntilGameMinutes) {
        n.stunUntilGameMinutes = 0;
        n.health = balance.npc.maxHealth;
      }
    }
  }

  /** 좌클릭으로 조준한 몬스터를 때린다. 체력 0 이면 없앤다. */
  private playerAttack(): void {
    const p = this.deps.player;
    if (!p || this.playerCooldown > 0 || !this.deps.primaryHeld()) return;
    const m = this.monsterInAim();
    if (!m) return;
    this.playerCooldown = P.attackIntervalSeconds;
    m.health -= P.attackDamage;
    this.knockback(m.body, p.body.pos);
    this.deps.events.emit('COMBAT_HIT', { target: 'monster', id: m.id, at: m.body.pos });
    if (m.health <= 0) {
      this.deps.monsters.remove(m.id);
      this.monsterCooldown.delete(m.id);
      this.deps.events.emit('MONSTER_DEFEATED', { monsterId: m.id, at: m.body.pos });
    }
  }

  /** 몬스터마다 간격이 되면 사거리 안 대상을 때린다. */
  private monsterAttacks(dt: number): void {
    for (const m of this.deps.monsters.values()) {
      const cd = Math.max(0, (this.monsterCooldown.get(m.id) ?? 0) - dt);
      this.monsterCooldown.set(m.id, cd);
      if (cd > 0) continue;
      const t = this.targetInRange(m);
      if (!t) continue;
      this.monsterCooldown.set(m.id, M.attackIntervalSeconds);
      if (t.kind === 'player') this.hitPlayer();
      else this.hitNpc(t.id);
    }
  }

  /** 플레이어가 맞았다. 0 이면 부활한다. */
  private hitPlayer(): void {
    const p = this.deps.player;
    if (!p || this.guard > 0) return;
    p.health = Math.max(0, p.health - M.attackDamage);
    this.deps.events.emit('COMBAT_HIT', { target: 'player', id: p.id, at: p.body.pos });
    if (p.health > 0) return;
    this.deps.events.emit('PLAYER_DOWN', undefined);
    const cell = this.respawnCell();
    p.body.pos = standCellToWorldFeet(cell);
    p.body.velocity = { x: 0, y: 0, z: 0 };
    p.health = P.maxHealth;
    this.guard = C.respawnGuardSeconds;
  }

  /** 주민이 맞았다. 0 이면 30 게임분 기절한다. */
  private hitNpc(id: string): void {
    for (const n of this.deps.npcs()) {
      if (n.id !== id) continue;
      n.health = Math.max(0, n.health - M.attackDamage);
      this.deps.events.emit('COMBAT_HIT', { target: 'npc', id, at: n.body.pos });
      if (n.health === 0)
        n.stunUntilGameMinutes = this.deps.clock.gameMinutes + balance.npc.stunMinutes;
      return;
    }
  }

  /** 지금 맞을 수 있는 대상들: 보호 중이 아닌 플레이어, 기절하지 않은 주민. */
  private *targets(): Generator<CombatTarget> {
    const p = this.deps.player;
    if (p && this.guard <= 0) yield { kind: 'player', body: p.body };
    const now = this.deps.clock.gameMinutes;
    for (const n of this.deps.npcs()) {
      if (now < n.stunUntilGameMinutes || n.health <= 0) continue;
      yield { kind: 'npc', id: n.id, body: n.body };
    }
  }

  /** 사거리·높이·가림 (26.1). 가슴 높이를 잇는 선분을 0.25 간격으로 표본해 고체 칸이 없어야 한다. */
  private canHit(a: AabbBody, b: AabbBody): boolean {
    if (flat(a.pos, b.pos) > M.attackRange) return false;
    if (Math.abs(a.pos.y - b.pos.y) >= M.attackHeight) return false;
    const ay = a.pos.y + a.height * 0.6;
    const by = b.pos.y + b.height * 0.6;
    const len = Math.hypot(b.pos.x - a.pos.x, by - ay, b.pos.z - a.pos.z);
    const steps = Math.max(1, Math.ceil(len / 0.25));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = a.pos.x + (b.pos.x - a.pos.x) * t;
      const y = ay + (by - ay) * t;
      const z = a.pos.z + (b.pos.z - a.pos.z) * t;
      if (isCollisionSolid(this.deps.world, Math.floor(x), Math.floor(y), Math.floor(z)))
        return false;
    }
    return true;
  }

  /** from 반대쪽으로 knockback 만큼 충돌 이동한다. */
  private knockback(body: AabbBody, from: Vec3): void {
    const dx = body.pos.x - from.x;
    const dz = body.pos.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    const keep = body.velocity;
    const t = 0.1;
    body.velocity = { x: (dx / len) * (C.knockback / t), y: 0, z: (dz / len) * (C.knockback / t) };
    moveWithCollision(this.deps.world, body, t, 0);
    body.velocity = { x: keep.x, y: keep.y, z: keep.z };
  }

  /** 부활 칸: 모든 몬스터와 3 칸 이상 떨어진 첫 광장 칸, 없으면 가장 먼 칸, 광장이 없으면 시작 칸. */
  private respawnCell(): BlockPos {
    const cells = this.deps.respawnCells();
    const monsters = [...this.deps.monsters.values()];
    const far = (c: BlockPos): number => {
      const p = standCellToWorldFeet(c);
      return monsters.reduce((d, m) => Math.min(d, flat(p, m.body.pos)), Number.POSITIVE_INFINITY);
    };
    const safe = cells.find((c) => far(c) >= C.respawnSafeDistance);
    if (safe) return safe;
    const best = [...cells].sort((a, b) => far(b) - far(a))[0];
    return best ?? this.deps.playerSpawn ?? { x: 0, y: 0, z: 0 };
  }
}
