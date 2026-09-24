// NPC 판단 (MVP_SPEC 19.4 / 19.5, ARCHITECTURE 14, TASK-029). update 10 번 슬롯.
// decideAction 은 순수 함수다: 읽기 전용 Context 만 읽고 아무것도 바꾸지 않으며 실행할 계획(ActionPlan)을 반환한다.
// 계획을 실제 Action 으로 만들어 실행하는 것은 NPCSystem(11 번)이다. 우선순위 5 단계를 위에서 아래로 한 번만 평가한다.
import { balance } from '../data/balance';
import type { NPC } from '../entities/NPC';
import type { SlotSystem } from '../GameWorld';
import type { NavigationGraph } from '../nav/NavigationGraph';
import type { PathGoal } from '../nav/pathfind';
import type { FarmCandidate } from './FarmSystem';
import {
  posKey,
  type ActionKind,
  type ActionView,
  type BlockPos,
  type DayPhase,
  type Facility,
  type GameClockReader,
  type NPCRole,
  type Vec3,
  type VillageStorageData,
} from '../types';

/** 판단에 쓰는 NPC snapshot. 가변 Action 을 담지 않는다 (ARCHITECTURE 14). */
export interface NPCDecisionView {
  readonly id: string;
  readonly role: NPCRole;
  /** 지금 서 있는 칸(발밑 칸) */
  readonly cell: BlockPos;
  readonly actionKind: ActionKind;
  /** 현재 Action 의 판단 키. 같은 계획이면 유지한다 */
  readonly actionKey: string;
  readonly hasEatenThisMeal: boolean;
  /** 기절 중이면 새 Action 을 시작하지 않는다 */
  readonly stunned: boolean;
}

/** 역할 작업 후보. 소유 시스템(Farm / Cooking / Repair)이 좁혀 준다. 이 단계에서는 전부 null 이다. */
export interface NPCCandidates {
  readonly diningSeat: Readonly<Facility> | null;
  readonly farm: FarmCandidate | null;
  readonly cooking: Readonly<{ facility: Facility; ingredientsReady: boolean }> | null;
  readonly repair: Readonly<{ damageId: string; cells: readonly BlockPos[] }> | null;
}

/** 위협 snapshot (FleeAction, TASK-047). */
export interface ThreatView {
  readonly monsterId: string;
  readonly pos: Vec3;
}

/**
 * decideAction 의 입력. 판단 직전에 조립하고 재사용하지 않는다 (14.2). 전부 읽기 전용이다 (14.3).
 * 방 전체·피해 전체 목록을 담지 않는다. 소유 시스템이 이 주민에게 좁힌 결과만 받는다 (14.4 / 14.5).
 */
export interface NPCContext {
  readonly npc: NPCDecisionView;
  /** SleepSystem 이 확인한 배정 침대. 없으면 null */
  readonly assignedBed: Readonly<Facility> | null;
  readonly phase: DayPhase;
  readonly gameMinutes: number;
  /** 그날 00:00 부터의 분 */
  readonly minuteOfDay: number;
  readonly threatNearby: ThreatView | null;
  readonly dialogueRequested: boolean;
  /** 식사 구간이 열려 있는가. MealSystem(TASK-032) 전에는 false 다 */
  readonly mealActive: boolean;
  readonly storage: VillageStorageData;
  /** 이 주민이 광장에서 쉬거나 모일 칸. 광장이 없으면 null */
  readonly plazaSpot: BlockPos | null;
  readonly candidates: NPCCandidates;
}

/** 실행할 계획. NPCSystem 이 Action 으로 만든다. key 가 현재 Action 과 같으면 판단은 null 을 반환한다. */
export type ActionPlan =
  | { readonly kind: 'idle'; readonly key: string; readonly label: string }
  | {
      readonly kind: 'move';
      readonly key: string;
      readonly label: string;
      readonly goal: PathGoal;
      readonly destination: BlockPos;
      /** 실패 보고용: 어느 계획의 이동인가 */
      readonly purpose: MovePurpose;
    }
  | { readonly kind: 'sleep'; readonly key: string; readonly bed: Readonly<Facility> }
  | { readonly kind: 'rest'; readonly key: string; readonly spot: BlockPos }
  | { readonly kind: 'eat'; readonly key: string; readonly seat: Readonly<Facility> | null }
  | { readonly kind: 'role'; readonly key: string; readonly work: 'cook' | 'repair' }
  | { readonly kind: 'plant' | 'harvest'; readonly key: string; readonly target: BlockPos }
  | { readonly kind: 'flee'; readonly key: string; readonly from: Vec3 }
  | { readonly kind: 'talk'; readonly key: string };

/** 이동 계획의 목적. 침대로 가다 실패하면 SleepSystem 에 알린다. */
export type MovePurpose =
  | { readonly kind: 'bed'; readonly bedObjectId: string }
  | { readonly kind: 'farm'; readonly target: BlockPos }
  | { readonly kind: 'plaza' };

const C = balance.clock;

/** 분이 [시작 시, 끝 시) 안인가. */
function within(minuteOfDay: number, startHour: number, endHour: number): boolean {
  return minuteOfDay >= startHour * 60 && minuteOfDay < endHour * 60;
}

/** 두 칸이 같은가. */
function same(a: BlockPos, b: BlockPos): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/** 역할 작업 시간(07~12, 13~18)인가 (MVP_SPEC 19.5). */
export function isWorkTime(minuteOfDay: number): boolean {
  return (
    within(minuteOfDay, C.workStartHour, C.lunchStartHour) ||
    within(minuteOfDay, C.lunchEndHour, C.dinnerStartHour)
  );
}

/** 취침 시간(20~05)인가 (MVP_SPEC 18 / 19.5). */
export function isSleepTime(phase: DayPhase): boolean {
  return phase === 'night';
}

/**
 * 목적 칸에 도착했는가. 칸만 같아서는 안 된다: 그 칸으로 가는 이동이 아직 진행 중이면(칸 경계를 막 넘었다)
 * 이동이 칸 가운데에서 끝날 때까지 도착으로 보지 않는다. 사용 자세가 칸 가장자리에서 시작하지 않게 한다.
 */
function arrivedAt(ctx: NPCContext, cells: readonly BlockPos[], moveKey: string): boolean {
  if (ctx.npc.actionKind === 'move' && ctx.npc.actionKey === moveKey) return false;
  return cells.some((c) => same(c, ctx.npc.cell));
}

/** 광장으로 가는 이동 계획의 키. */
function plazaKey(spot: BlockPos): string {
  return `move:plaza:${posKey(spot)}`;
}

/** 광장으로 가는 이동 계획. */
function toPlaza(spot: BlockPos, label: string): ActionPlan {
  return {
    kind: 'move',
    key: plazaKey(spot),
    label,
    goal: { kind: 'cell', pos: spot },
    destination: spot,
    purpose: { kind: 'plaza' },
  };
}

/**
 * 3 단계 생리(식사·취침)의 계획. 해당 없으면 null.
 * 취침: 배정 침대가 있으면 그 접근 셀로 걸어가 잔다. 없으면 광장 칸으로 가서 쉰다(12.5 의 대체 동작).
 */
function physiological(ctx: NPCContext): ActionPlan | null {
  if (ctx.mealActive && !ctx.npc.hasEatenThisMeal) {
    return {
      kind: 'eat',
      key: `eat:${ctx.candidates.diningSeat?.objectId ?? 'plaza'}`,
      seat: ctx.candidates.diningSeat,
    };
  }
  if (!isSleepTime(ctx.phase)) return null;
  const bed = ctx.assignedBed;
  if (bed) {
    const moveKey = `move:bed:${bed.objectId}`;
    if (arrivedAt(ctx, bed.approachCells, moveKey)) {
      return { kind: 'sleep', key: `sleep:${bed.objectId}`, bed };
    }
    return {
      kind: 'move',
      key: moveKey,
      label: '침대로 가는 중',
      goal: { kind: 'cells', cells: bed.approachCells },
      destination: bed.anchor,
      purpose: { kind: 'bed', bedObjectId: bed.objectId },
    };
  }
  const spot = ctx.plazaSpot ?? ctx.npc.cell;
  if (arrivedAt(ctx, [spot], plazaKey(spot))) {
    return { kind: 'rest', key: `rest:${posKey(spot)}`, spot };
  }
  return toPlaza(spot, '광장으로 쉬러 가는 중');
}

/** 4 단계 역할 작업. 소유 시스템이 준 후보가 있을 때만. 이 단계에서는 후보가 없어 null 이다. */
function roleWork(ctx: NPCContext): ActionPlan | null {
  if (!isWorkTime(ctx.minuteOfDay)) return null;
  const c = ctx.candidates;
  if (ctx.npc.role === 'farmer' && c.farm) {
    // 밭 작업: 작업 칸까지 걸어간 뒤(MoveAction) 심기·수확(PlantAction / HarvestAction). 복합 Action 을 만들지 않는다
    const f = c.farm;
    const k = posKey(f.target);
    const moveKey = `move:farm:${k}`;
    if (arrivedAt(ctx, f.approachCells, moveKey)) {
      return { kind: f.kind, key: `${f.kind}:${k}`, target: f.target };
    }
    return {
      kind: 'move',
      key: moveKey,
      label: f.kind === 'harvest' ? '수확하러 가는 중' : '밭으로 가는 중',
      goal: { kind: 'cells', cells: f.approachCells },
      destination: f.target,
      purpose: { kind: 'farm', target: f.target },
    };
  }
  if (ctx.npc.role === 'cook' && c.cooking?.ingredientsReady) {
    return { kind: 'role', key: 'role:cook', work: 'cook' };
  }
  if (ctx.npc.role === 'carpenter' && c.repair) {
    return { kind: 'role', key: `role:repair:${c.repair.damageId}`, work: 'repair' };
  }
  return null;
}

/**
 * 5 단계 기본 행동 (MVP_SPEC 19.5).
 * 기상(05~07)에는 방에서 나와 광장 칸으로, 자유 행동(19~20)에는 광장 칸으로 모인다. 그 밖에는 제자리 대기다.
 */
function fallback(ctx: NPCContext): ActionPlan {
  const spot = ctx.plazaSpot;
  const wake = ctx.phase === 'dawn';
  const free = within(ctx.minuteOfDay, C.freeTimeStartHour, C.sleepStartHour);
  if (spot && (wake || free) && !arrivedAt(ctx, [spot], plazaKey(spot))) {
    return toPlaza(spot, wake ? '일어나 광장으로 가는 중' : '광장으로 모이는 중');
  }
  return { kind: 'idle', key: 'idle', label: '대기' };
}

/**
 * 우선순위 5 단계를 위에서 아래로 한 번만 평가한다 (MVP_SPEC 19.4, ARCHITECTURE 14.1).
 *   1 위협 → 도피 / 2 대화 → 대화 / 3 생리 → 식사·취침·휴식 / 4 역할 → 역할 작업 / 5 기본 → 대기
 * 기절 중이거나 결과가 현재 Action 과 같은 계획이면 null(현재 Action 유지)이다. 아무것도 바꾸지 않는다.
 */
export function decideAction(ctx: NPCContext): ActionPlan | null {
  if (ctx.npc.stunned) return null;
  const plan = choose(ctx);
  return plan.key === ctx.npc.actionKey ? null : plan;
}

/** 5 단계 중 첫 번째로 해당하는 계획. */
function choose(ctx: NPCContext): ActionPlan {
  if (ctx.threatNearby) return { kind: 'flee', key: 'flee', from: ctx.threatNearby.pos };
  if (ctx.dialogueRequested) return { kind: 'talk', key: 'talk' };
  return physiological(ctx) ?? roleWork(ctx) ?? fallback(ctx);
}

/** 주민의 현재 칸(발밑 칸). */
export function npcCell(npc: NPC): BlockPos {
  const p = npc.body.pos;
  return { x: Math.floor(p.x), y: Math.floor(p.y + 0.01), z: Math.floor(p.z) };
}

/** 판단 시스템이 읽는 것들. 각 항목은 소유 시스템의 좁은 조회다. */
export interface NPCDecisionDeps {
  readonly npcs: () => Iterable<NPC<ActionView>>;
  readonly clock: GameClockReader;
  readonly storage: () => VillageStorageData;
  /** SleepSystem 의 배정 조회 */
  readonly assignedBed: (npcId: string) => Readonly<Facility> | null;
  /** 광장 칸 목록 (plazaSpots). 광장이 없으면 빈 배열 */
  readonly plazaSpots: () => readonly BlockPos[];
  /** 계획을 NPCSystem 에 넘긴다 */
  readonly assign: (npcId: string, plan: ActionPlan) => void;
  /** FarmSystem 의 후보(농부에게만, 역할 작업 시간에만 묻는다). 없으면 농사가 없는 월드다 */
  readonly farmCandidate?: (npcId: string, cell: BlockPos) => FarmCandidate | null;
}

/** 빈 후보. 역할·식사 시스템(030~032·048)이 생기면 소유자가 채운다. */
const NO_CANDIDATES: NPCCandidates = { diningSeat: null, farm: null, cooking: null, repair: null };

/** 매 프레임 주민마다 Context 를 조립해 decideAction 을 부르고 계획을 NPCSystem 에 넘긴다. */
export class NPCDecisionSystem implements SlotSystem {
  /** 선행 갱신(침대 배정 등). 같은 슬롯에서 판단 전에 부른다 (ARCHITECTURE 4.1 의 10) */
  constructor(
    private readonly deps: NPCDecisionDeps,
    private readonly before: readonly SlotSystem[] = [],
  ) {}

  /** 판단 한 번. */
  update(dt: number): void {
    for (const s of this.before) s.update(dt);
    const spots = this.deps.plazaSpots();
    const storage = this.deps.storage();
    let i = 0;
    const work = isWorkTime(this.deps.clock.minuteOfDay);
    for (const npc of this.deps.npcs()) {
      const cell = npcCell(npc);
      const farm =
        work && npc.role === 'farmer' && this.deps.farmCandidate
          ? this.deps.farmCandidate(npc.id, cell)
          : null;
      const ctx: NPCContext = {
        npc: {
          id: npc.id,
          role: npc.role,
          cell,
          actionKind: npc.action.kind,
          actionKey: npc.action.key,
          hasEatenThisMeal: npc.hasEatenThisMeal,
          stunned: this.deps.clock.gameMinutes < npc.stunUntilGameMinutes,
        },
        assignedBed: this.deps.assignedBed(npc.id),
        phase: this.deps.clock.phase,
        gameMinutes: this.deps.clock.gameMinutes,
        minuteOfDay: this.deps.clock.minuteOfDay,
        threatNearby: null,
        dialogueRequested: false,
        mealActive: false,
        storage,
        plazaSpot: spots.length > 0 ? (spots[i % spots.length] ?? null) : null,
        candidates: farm ? { ...NO_CANDIDATES, farm } : NO_CANDIDATES,
      };
      const plan = decideAction(ctx);
      if (plan) this.deps.assign(npc.id, plan);
      i += 1;
    }
  }
}

/**
 * 광장(종 주변)에서 주민이 쉬거나 모일 칸들 (MVP_SPEC 18.3 / 19.5).
 * 종에서 수평 2 칸 이상 plazaRadius 이하의 설 수 있는 칸을 종과의 거리 → 각도 순으로 고른다.
 * 주민 수와 무관한 목록이며 주민 i 는 i 번째 칸을 쓴다(모자라면 돌려 쓴다).
 */
export function plazaSpots(nav: NavigationGraph, center: BlockPos, limit = 16): BlockPos[] {
  const r = balance.world.plazaRadius;
  const found: { p: BlockPos; d: number; a: number }[] = [];
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      const d = Math.hypot(dx, dz);
      if (d < 2 || d > r) continue;
      for (const dy of [0, 1, -1, 2, -2]) {
        const p = { x: center.x + dx, y: center.y + dy, z: center.z + dz };
        if (!nav.isStandable(p, 'npc')) continue;
        found.push({ p, d, a: Math.atan2(dz, dx) });
        break;
      }
    }
  }
  // 종에서 2.5 칸 둘레의 칸을 각도 순으로 늘어놓고 0, 1/2, 1/4, 3/4 … 지점 순서로 고른다.
  // 처음 몇 주민이 서로 떨어져 종을 둘러앉게 된다. 둘레가 모자라면 나머지 칸을 거리 순으로 쓴다
  found.sort((u, v) => Math.abs(u.d - 2.5) - Math.abs(v.d - 2.5) || u.a - v.a);
  const ring = found.filter((f) => Math.abs(f.d - 2.5) < 1).sort((u, v) => u.a - v.a);
  const spread: BlockPos[] = [];
  for (const t of spreadFractions(limit)) {
    const f = ring[Math.floor(t * ring.length)];
    if (f && !spread.some((s) => same(s, f.p))) spread.push(f.p);
  }
  for (const f of found) {
    if (spread.length >= limit) break;
    if (!spread.some((s) => same(s, f.p))) spread.push(f.p);
  }
  return spread;
}

/** 0 이상 1 미만의 비율을 0, 1/2, 1/4, 3/4, 1/8 … 순서로 count 개 만든다(비트 뒤집기 순서). */
function spreadFractions(count: number): number[] {
  const out: number[] = [];
  for (let i = 0; out.length < count && i < 1024; i++) {
    let x = 0;
    let bit = 0.5;
    for (let k = i; k > 0; k >>= 1) {
      if (k & 1) x += bit;
      bit /= 2;
    }
    out.push(x);
  }
  return out;
}
