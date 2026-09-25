// 주민의 한마디 (MVP_SPEC 19.7, ARCHITECTURE 21.4, TASK-BARK-001, ADR 042).
// 이미 있는 계기(Action 전환·이벤트·플레이어 거리·F)를 받아 정해 둔 문장을 고르고 NPC_BARK 를 낸다.
// 말의 간격과 횟수만 소유한다. 게임 상태를 바꾸지 않고 저장하지 않는다. 문장은 data/barks.ts 에 있다.
import { balance } from '../data/balance';
import { BARK_RULES, barkLines } from '../data/barks';
import type { NPC } from '../entities/NPC';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type {
  ActionKind,
  ActionView,
  BarkTopic,
  BlockPos,
  GameClockReader,
  RoomType,
  Vec3,
} from '../types';

const B = balance.bark;

/** BarkSystem 이 읽는 것. 모두 읽기 전용 조회다. */
export interface BarkSystemDeps {
  readonly events: EventBus;
  readonly clock: GameClockReader;
  readonly npcs: () => Iterable<NPC<ActionView>>;
  readonly npcById: (id: string) => NPC<ActionView> | undefined;
  /** 플레이어 발 위치. 플레이어가 없는 월드면 null */
  readonly playerPos: () => Vec3 | null;
  /** 방의 대표 칸. 없는 방이면 undefined */
  readonly roomCenter: (roomId: string) => BlockPos | undefined;
  /** 이 주민에게 배정된 침대가 있는가 (SleepSystem) */
  readonly hasBed: (npcId: string) => boolean;
  /** 지금 식사 구간인가 (MealSystem) */
  readonly mealActive: () => boolean;
  /** 저장소의 food */
  readonly food: () => number;
  /** 이 주민이 진행 대사 중인가 (DialogueSystem) */
  readonly talking: (npcId: string) => boolean;
}

/** 이벤트로 모았다가 update 에서 처리하는 계기. */
type Trigger =
  | {
      readonly kind: 'action';
      readonly npcId: string;
      readonly now: ActionKind;
      readonly prev: ActionKind | undefined;
      readonly dining: boolean;
    }
  | { readonly kind: 'hit'; readonly npcId: string }
  | { readonly kind: 'crowd'; readonly topic: 'raidEnd' | 'levelUp' }
  | { readonly kind: 'room'; readonly roomId: string; readonly type: RoomType }
  | { readonly kind: 'arrived'; readonly npcId: string };

/** 문자열 해시(FNV-1a 32 비트). 주민마다 첫 문장이 달라지게 한다. */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 두 위치의 거리. */
function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** 일(Action 시작)에 대응하는 상황. 말할 것이 없으면 null. */
function workTopic(kind: ActionKind, dining: boolean): BarkTopic | null {
  switch (kind) {
    case 'flee':
      return 'flee';
    case 'sleep':
      return 'sleep';
    case 'rest':
      return 'noBed';
    case 'eat':
      return dining ? 'eatDining' : 'eatPlaza';
    case 'harvest':
    case 'plant':
    case 'cook':
    case 'repair':
      return kind;
    default:
      return null;
  }
}

/** 주민의 한마디. */
export class BarkSystem implements SlotSystem {
  private readonly queue: Trigger[] = [];
  /** 실행 누적 실초. 간격은 모두 이 값으로 잰다 */
  private elapsed = 0;
  private sinceGreetCheck = 0;
  /** 주민 → 마지막으로 말한 시각 */
  private readonly lastAny = new Map<string, number>();
  /** `${npcId}|${topic}` → 마지막으로 말한 시각 (간격 규칙의 상황) */
  private readonly lastTopic = new Map<string, number>();
  /** `${npcId}|${topic}` → 말한 횟수 (문장 순환, 실제 문장의 상황) */
  private readonly counts = new Map<string, number>();
  /** 주민 → 직전 Action 종류 (기상 판정) */
  private readonly lastKind = new Map<string, ActionKind>();
  /** 지난 확인 때 플레이어 인사 반경 안에 있던 주민 */
  private near = new Set<string>();

  /** 계기 이벤트를 구독한다. 구독 콜백에서는 모으기만 하고 발행하지 않는다. */
  constructor(private readonly deps: BarkSystemDeps) {
    const e = deps.events;
    e.on('NPC_ACTION_CHANGED', (p) => {
      const npc = deps.npcById(p.npcId);
      if (!npc) return;
      const prev = this.lastKind.get(p.npcId);
      const now = npc.action.kind;
      this.lastKind.set(p.npcId, now);
      this.queue.push({
        kind: 'action',
        npcId: p.npcId,
        now,
        prev,
        dining: npc.action.facilityUse !== undefined,
      });
    });
    e.on('COMBAT_HIT', (p) => {
      if (p.target === 'npc') this.queue.push({ kind: 'hit', npcId: p.id });
    });
    e.on('RAID_ENDED', () => this.queue.push({ kind: 'crowd', topic: 'raidEnd' }));
    e.on('VILLAGE_LEVEL_UP', () => this.queue.push({ kind: 'crowd', topic: 'levelUp' }));
    e.on('ROOM_REGISTERED', (p) =>
      this.queue.push({ kind: 'room', roomId: p.roomId, type: p.type }),
    );
    e.on('ROOM_TYPE_CHANGED', (p) => {
      if (p.to !== 'EmptyRoom') this.queue.push({ kind: 'room', roomId: p.roomId, type: p.to });
    });
    e.on('NPC_ARRIVED', (p) => this.queue.push({ kind: 'arrived', npcId: p.npcId }));
  }

  /** 11 번 슬롯(NPCSystem 뒤). 모인 계기를 처리하고 주기마다 인사 거리를 확인한다. */
  update(dt: number): void {
    this.elapsed += dt;
    const batch = this.queue.splice(0);
    for (const t of batch) this.handle(t);
    this.sinceGreetCheck += dt;
    if (this.sinceGreetCheck >= B.greetCheckSeconds) {
      this.sinceGreetCheck = 0;
      this.checkGreetings();
    }
  }

  /** 이 주민에게 지금 말을 걸 수 있는가(프롬프트 표시). 자는 중·대화 중이면 false. */
  canPoke(npcId: string): boolean {
    const npc = this.deps.npcById(npcId);
    return npc !== undefined && npc.action.kind !== 'sleep' && !this.deps.talking(npcId);
  }

  /**
   * F 로 말을 건다(진행 대사가 없는 주민). 우선순위로 상황을 고른다:
   * 도피 → 기절 → 배고픔 → 잘 곳 없음 → 하는 일(서 있거나 걷는 중이면 역할별 잡담). 말했으면 true.
   */
  poke(npcId: string): boolean {
    const npc = this.deps.npcById(npcId);
    if (!npc || !this.canPoke(npcId)) return false;
    return this.say(npc, this.pokeTopic(npc), { rule: 'poke' });
  }

  /** 말 걸기 상황. */
  private pokeTopic(npc: NPC<ActionView>): BarkTopic {
    const kind = npc.action.kind;
    if (kind === 'flee') return 'flee';
    if (this.stunned(npc)) return 'stunned';
    if (
      this.deps.mealActive() &&
      !npc.hasEatenThisMeal &&
      this.deps.food() < balance.meal.foodPerMeal
    ) {
      return 'hungry';
    }
    const hour = this.deps.clock.minuteOfDay / 60;
    const night = hour >= B.noBedHintStartHour || hour < B.wakeStartHour;
    if (night && !this.deps.hasBed(npc.id)) return 'noBed';
    return workTopic(kind, npc.action.facilityUse !== undefined) ?? 'idle';
  }

  /** 계기 하나를 처리한다. */
  private handle(t: Trigger): void {
    const d = this.deps;
    switch (t.kind) {
      case 'action': {
        const npc = d.npcById(t.npcId);
        if (!npc) return;
        const hour = d.clock.minuteOfDay / 60;
        const wakeTime = hour >= B.wakeStartHour && hour < B.wakeEndHour;
        let topic: BarkTopic | null;
        if (t.now === 'flee') topic = 'flee';
        else if (wakeTime && t.prev === 'sleep' && t.now !== 'sleep') topic = 'wake';
        else if (wakeTime && t.prev === 'rest' && t.now !== 'rest') topic = 'wakeFloor';
        else topic = workTopic(t.now, t.dining);
        if (topic) this.say(npc, topic);
        return;
      }
      case 'hit': {
        const npc = d.npcById(t.npcId);
        if (npc) this.say(npc, this.stunned(npc) ? 'stunned' : 'hit');
        return;
      }
      case 'arrived': {
        const npc = d.npcById(t.npcId);
        if (npc) this.say(npc, 'arrived');
        return;
      }
      case 'crowd': {
        const p = d.playerPos();
        if (!p) return;
        for (const npc of d.npcs()) {
          if (distance(npc.body.pos, p) <= B.reactRadius) this.say(npc, t.topic);
        }
        return;
      }
      case 'room': {
        const c = d.roomCenter(t.roomId);
        if (!c) return;
        const center = { x: c.x + 0.5, y: c.y, z: c.z + 0.5 };
        let best: NPC<ActionView> | null = null;
        let bestD: number = B.reactRadius;
        for (const npc of d.npcs()) {
          if (this.silent(npc, 'newRoom')) continue;
          const dd = distance(npc.body.pos, center);
          if (dd <= bestD) {
            best = npc;
            bestD = dd;
          }
        }
        if (best) this.say(best, 'newRoom', { roomType: t.type });
        return;
      }
    }
  }

  /** 플레이어 반경에 새로 들어온 주민이 인사한다. 떠난 주민의 기록도 여기서 지운다. */
  private checkGreetings(): void {
    const d = this.deps;
    const p = d.playerPos();
    const next = new Set<string>();
    if (p) {
      for (const npc of d.npcs()) {
        if (distance(npc.body.pos, p) > B.greetRadius) continue;
        next.add(npc.id);
        if (!this.near.has(npc.id)) this.say(npc, 'greet');
      }
    }
    this.near = next;
    for (const id of this.lastKind.keys()) if (!d.npcById(id)) this.forget(id);
  }

  /** 떠난 주민의 간격·횟수 기록을 지운다. */
  private forget(id: string): void {
    this.lastKind.delete(id);
    this.lastAny.delete(id);
    const prefix = `${id}|`;
    for (const k of this.lastTopic.keys()) if (k.startsWith(prefix)) this.lastTopic.delete(k);
    for (const k of this.counts.keys()) if (k.startsWith(prefix)) this.counts.delete(k);
  }

  /** 기절 중인가. */
  private stunned(npc: NPC<ActionView>): boolean {
    return this.deps.clock.gameMinutes < npc.stunUntilGameMinutes;
  }

  /** 지금 이 상황의 말을 하지 않는가: 자는 중(잠드는 말 제외)·대화 중·기절 중(맞음 / 기절 제외). */
  private silent(npc: NPC<ActionView>, topic: BarkTopic): boolean {
    if (npc.action.kind === 'talk' || this.deps.talking(npc.id)) return true;
    if (npc.action.kind === 'sleep' && topic !== 'sleep') return true;
    if (this.stunned(npc) && topic !== 'hit' && topic !== 'stunned') return true;
    return false;
  }

  /**
   * 간격을 확인하고 문장을 골라 NPC_BARK 를 낸다. rule 은 간격 규칙의 상황(기본은 topic)이다.
   * 문장은 lines[(hash(npcId) + 횟수) % 길이] 로 결정적으로 고른다. 말했으면 true.
   */
  private say(
    npc: NPC<ActionView>,
    topic: BarkTopic,
    opts: { readonly rule?: BarkTopic; readonly roomType?: RoomType } = {},
  ): boolean {
    const ruleTopic = opts.rule ?? topic;
    if (this.silent(npc, topic)) return false;
    const rule = BARK_RULES[ruleTopic];
    const now = this.elapsed;
    const any = this.lastAny.get(npc.id);
    if (!rule.urgent && any !== undefined && now - any < B.npcCooldownSeconds) return false;
    const ruleKey = `${npc.id}|${ruleTopic}`;
    const last = this.lastTopic.get(ruleKey);
    if (last !== undefined && now - last < rule.cooldownSeconds) return false;
    const lines = barkLines(topic, npc.role, {
      phase: this.deps.clock.phase,
      roomType: opts.roomType,
    });
    if (lines.length === 0) return false;
    const countKey = `${npc.id}|${topic}`;
    const n = this.counts.get(countKey) ?? 0;
    const text = lines[(hashId(npc.id) + n) % lines.length] as string;
    this.counts.set(countKey, n + 1);
    this.lastAny.set(npc.id, now);
    this.lastTopic.set(ruleKey, now);
    this.deps.events.emit('NPC_BARK', { npcId: npc.id, topic, text });
    return true;
  }
}
