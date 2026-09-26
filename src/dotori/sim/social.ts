// 대화·궁합·소문·고백·커플 (SPEC 3.4, 시험판 규칙). 이웃 찾기는 공간 격자로 한다.
import { NEEDS, PERF, SOCIAL } from '../data/balance';
import { GENERIC_TOPICS, JOBS, REACTS, TRAIT_COMPAT, TRAITS } from '../data/people';
import { SpatialGrid } from './spatial';
import { J, NJ, NV } from './text';
import type { Conversation, ConvKind, Rumor, Villager, World } from './types';
import { addAff, aff, diary, emote, log, pairFlag, vil } from './world';

/* ---------------- 소문 ---------------- */

/** 소문을 만든다. origin 만 안다. */
export function rumor(
  w: World,
  origin: Villager,
  kind: Rumor['kind'],
  short: string,
  e: string,
  juicy: number,
  about: number[] = [],
): Rumor {
  const r: Rumor = {
    id: w.rid++,
    kind,
    short,
    e,
    juicy,
    about,
    knowers: new Set([origin.id]),
    born: w.t,
    active: true,
    half: false,
    all: false,
  };
  w.rumors.unshift(r);
  if (w.rumors.length > PERF.rumorsMax) w.rumors.length = PERF.rumorsMax;
  return r;
}

/** id 로 소문 찾기. */
export function rumorById(w: World, id: number | null): Rumor | undefined {
  return id == null ? undefined : w.rumors.find((r) => r.id === id);
}

/** v 가 소문을 아는가. */
export function knows(v: Villager, r: Rumor): boolean {
  return r.knowers.has(v.id);
}

/** v 가 from 에게서 소문을 듣는다. 겁쟁이·호기심쟁이는 반응한다. */
export function learn(w: World, v: Villager, r: Rumor, from: Villager): void {
  r.knowers.add(v.id);
  diary(w, v, `${J(from.name, '에게서', '에게서')} 들었다: "${r.short}"`);
  const R = w.rng;
  if (r.kind === 'ghost' && v.trait === '겁쟁이' && !v.fearGhost) {
    v.fearGhost = true;
    emote(w, v, '😱', 30);
    log(
      w,
      `😱 겁쟁이 ${NJ(v, '가', '이')} 소문을 듣고 새파랗게 질렸다. 이제 숲 근처엔 얼씬도 안 할 거다.`,
      [v],
      'funny',
    );
  } else if (r.kind === 'ghost' && R.next() < 0.25) v.fearGhost = true;
  if (
    r.kind === 'treasure' &&
    !v.hunting &&
    (v.trait === '호기심쟁이' ? R.next() < 0.8 : R.next() < 0.15)
  )
    v.hunting = true;
  const n = r.knowers.size;
  const N = w.vs.length;
  if (!r.half && n >= N / 2) {
    r.half = true;
    log(w, `📣 "${r.short}" 소문이 마을 절반에 퍼졌다.`, [], 'rumor');
  }
  if (!r.all && n >= N) {
    r.all = true;
    log(w, `📣 이제 온 마을이 안다: "${r.short}"`, [], 'rumor');
  }
}

/** sp 가 ls 에게 가장 맛있는 소문 하나를 전하려 한다. 전했으면 그 소문. */
function tryShare(w: World, sp: Villager, ls: Villager): Rumor | null {
  let best: Rumor | null = null;
  let bj = 0;
  const P = w.party;
  for (const r of w.rumors) {
    if (!r.active || !knows(sp, r) || knows(ls, r)) continue;
    let j = r.juicy;
    if (r.kind === 'party' && P && P.host === sp.id) j += 3;
    if (r.about.includes(ls.id)) j -= 0.5;
    if (j > bj) {
      bj = j;
      best = r;
    }
  }
  if (!best) return null;
  const hosting = best.kind === 'party' && P != null && P.host === sp.id;
  const p = hosting
    ? 1
    : best.juicy * (sp.trait === '수다쟁이' ? 1 : sp.trait === '외톨이' ? 0.25 : 0.55);
  if (w.rng.next() < p) {
    learn(w, ls, best, sp);
    if (P && best.kind === 'party' && P.rumor === best.id && w.t < P.start) {
      if (P.host === sp.id)
        log(
          w,
          `💌 ${NJ(sp, '가', '이')} ${NJ(ls, '를', '을')} 파티에 초대했다.`,
          [sp, ls],
          'party',
        );
      else if (w.rng.next() < 0.35)
        log(w, `🗣️ ${NJ(sp, '가', '이')} ${NV(ls)}에게 파티 소식을 전했다.`, [sp, ls], 'party');
    }
    return best;
  }
  return null;
}

/* ---------------- 대화 ---------------- */

/** 두 사람의 성격 궁합. */
export function compat(a: Villager, b: Villager): number {
  let c = 0;
  const A = a.trait;
  const B = b.trait;
  if (A === B) c += A === '투덜이' ? -2 : 3;
  c += TRAIT_COMPAT[`${A}|${B}`] ?? TRAIT_COMPAT[`${B}|${A}`] ?? 0;
  if (A === '투덜이' || B === '투덜이') c -= 2;
  if (a.home === b.home) c += 2;
  if (a.job === b.job && a.job !== '한량') c += 2;
  return c;
}

/** 대화 화제 이모지. */
function topic(w: World, v: Villager): string {
  const pool = [...TRAITS[v.trait].topics, ...GENERIC_TOPICS, JOBS[v.job].e];
  return w.rng.pick(pool) ?? '🙂';
}

/** 대화 id → 대화. */
export function convById(w: World, id: number | null): Conversation | undefined {
  return id == null ? undefined : w.convs.find((c) => c.id === id);
}

/** 두 사람의 대화를 시작한다. 줄마다 말풍선이 바뀐다. */
export function startConv(w: World, a: Villager, b: Villager, kind: ConvKind): void {
  const R = w.rng;
  const c: Conversation = {
    id: w.cid++,
    a: a.id,
    b: b.id,
    kind,
    start: w.t,
    until: 0,
    lines: [],
    argue: false,
    success: false,
    r1: null,
    r2: null,
    topic: '',
    speaker: a.id,
  };
  if (kind !== 'confess' && kind !== 'welcome') {
    let pa = 0.04;
    if (a.trait === '투덜이' || b.trait === '투덜이') pa += 0.22;
    if ((aff(w, a, b) + aff(w, b, a)) / 2 < -20) pa += 0.3;
    if (kind === 'date' || kind === 'invite') pa *= 0.4;
    c.argue = R.next() < pa;
  }
  if (!c.argue) {
    c.r1 = tryShare(w, a, b)?.id ?? null;
    c.r2 = tryShare(w, b, a)?.id ?? null;
  }
  const r1 = rumorById(w, c.r1);
  const r2 = rumorById(w, c.r2);
  if (kind === 'confess') {
    c.success = b.partner == null && (b.crush === a.id || aff(w, b, a) > 18 + R.next() * 40);
    c.lines = [
      [a.id, '💌'],
      [b.id, '😳'],
      [a.id, '💗'],
      [b.id, c.success ? '💖' : '🙇'],
    ];
  } else if (kind === 'welcome') {
    c.topic = '👋';
    c.lines = [
      [a.id, '👋'],
      [b.id, '😊'],
      [a.id, R.pick(['🍞', '🌷', '🏠', '🎁']) ?? '🎁'],
      [b.id, '💕'],
    ];
  } else if (c.argue) {
    c.topic = topic(w, a);
    c.lines = [
      [a.id, c.topic],
      [b.id, '😤'],
      [a.id, '💢'],
      [b.id, '💢'],
    ];
  } else {
    c.topic = r1 ? r1.e : topic(w, a);
    c.lines = [
      [a.id, c.topic],
      [b.id, r1 ? '😮' : (R.pick(REACTS) ?? '🙂')],
      [b.id, r2 ? r2.e : topic(w, b)],
      [a.id, r2 ? '😮' : (R.pick(REACTS) ?? '🙂')],
    ];
    if (kind === 'date') c.lines.unshift([a.id, '💕'], [b.id, '💕']);
  }
  if (kind === 'date' && a.carry && a.carry.item === 'flower') {
    a.carry = null;
    b.carry = { item: 'flower', until: w.t + 150 };
    emote(w, b, '💖', 20);
    diary(w, a, `${b.name}에게 꽃을 줬다 💐`);
    diary(w, b, `${J(a.name, '가', '이')} 꽃을 줬다 💐`);
    log(w, `💐 ${NJ(a, '가', '이')} ${NV(b)}에게 들꽃을 건넸다.`, [a, b], 'love');
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  a.dir = { x: dx / d, y: dy / d };
  b.dir = { x: -dx / d, y: -dy / d };
  c.until = w.t + c.lines.length * SOCIAL.lineTicks;
  a.talk = b.talk = c.id;
  w.convs.push(c);
}

/** 두 사람이 사귀기 시작한다. 두 사람을 짝사랑하던 이는 시무룩해진다. */
function couple(w: World, x: Villager, y: Villager): void {
  x.partner = y.id;
  y.partner = x.id;
  x.crush = y.crush = null;
  x.confess = y.confess = null;
  addAff(w, x, y, 15);
  addAff(w, y, x, 15);
  pairFlag(w, x, y, 'couple');
  emote(w, x, '💑', 50);
  emote(w, y, '💑', 50);
  diary(w, x, `${J(y.name, '와', '과')} 사귀기 시작했다 💑`);
  diary(w, y, `${J(x.name, '와', '과')} 사귀기 시작했다 💑`);
  rumor(w, x, 'love', `${J(x.name, '와', '과')} ${J(y.name, '가', '이')} 사귄대`, '💑', 0.85, [
    x.id,
    y.id,
  ]);
  for (const z of w.vs) {
    if (z === x || z === y || (z.crush !== x.id && z.crush !== y.id)) continue;
    const who = vil(w, z.crush);
    z.crush = null;
    z.confess = null;
    z.fun -= 30;
    emote(w, z, '💔', 40);
    diary(w, z, `${J(who.name, '가', '이')} 다른 사람이랑 사귄대… 💔`);
    log(
      w,
      `💔 ${J(who.name, '를', '을')} 몰래 좋아하던 ${NJ(z, '가', '이')} 시무룩해졌다.`,
      [z],
      'love',
    );
  }
}

/** 대화가 끝났을 때 호감·욕구·관계를 정리한다. */
function resolveConv(w: World, c: Conversation): void {
  const a = vil(w, c.a);
  const b = vil(w, c.b);
  const R = w.rng;
  a.talk = b.talk = null;
  const cool = (v: Villager): number =>
    w.t + (v.trait === '수다쟁이' ? R.int(15, 40) : R.int(30, 90));
  a.nextTalk = cool(a);
  b.nextTalk = cool(b);
  if (c.kind === 'confess') {
    if (c.success) {
      couple(w, a, b);
      log(
        w,
        `💑 ${NJ(a, '가', '이')} ${NV(b)}에게 고백했다. 대답은… 좋아! 둘이 사귀기 시작했다.`,
        [a, b],
        'love',
      );
    } else {
      a.crush = null;
      a.confess = null;
      a.fun -= 40;
      emote(w, a, '💔', 60);
      emote(w, b, '😅', 20);
      addAff(w, a, b, -5);
      diary(w, a, `${b.name}에게 고백했다가 차였다… 💔`);
      diary(w, b, `${J(a.name, '가', '이')} 고백했는데, 거절했다 😅`);
      log(w, `💔 ${NJ(a, '가', '이')} ${NV(b)}에게 고백했다가 정중하게 차였다.`, [a, b], 'love');
      rumor(w, b, 'reject', `${J(a.name, '가', '이')} ${b.name}에게 차였대`, '💔', 0.95, [
        a.id,
        b.id,
      ]);
    }
    return;
  }
  if (c.kind === 'welcome') {
    addAff(w, a, b, SOCIAL.welcomeAff);
    addAff(w, b, a, SOCIAL.welcomeAff);
    a.social += NEEDS.talkSocial;
    b.social += NEEDS.talkSocial;
    diary(w, a, `새로 이사 온 ${J(b.name, '에게', '에게')} 인사했다 👋`);
    diary(w, b, `${J(a.name, '가', '이')} 인사하러 와 줬다. 좋은 이웃이다 😊`);
    if (!w.daily[`welcome-${b.id}`]) {
      w.daily[`welcome-${b.id}`] = true;
      log(w, `👋 ${NJ(a, '가', '이')} 새로 이사 온 ${NV(b)}에게 인사를 건넸다.`, [a, b], 'arrive');
    }
    return;
  }
  let d: number;
  if (c.argue) {
    d = -(10 + R.next() * 10);
    a.fun -= 8;
    b.fun -= 8;
    emote(w, a, '💢', 20);
    emote(w, b, '💢', 20);
  } else {
    d = compat(a, b) + 2 + R.next() * 6;
    if (c.kind === 'date') d += 6;
  }
  addAff(w, a, b, d * (a.trait === '투덜이' ? 0.6 : 1));
  addAff(w, b, a, d * (b.trait === '투덜이' ? 0.6 : 1));
  a.social += a.trait === '외톨이' ? NEEDS.talkSocialLoner : NEEDS.talkSocial;
  b.social += b.trait === '외톨이' ? NEEDS.talkSocialLoner : NEEDS.talkSocial;
  a.fun += 4;
  b.fun += 4;
  const verb = c.argue
    ? '말다툼을 했다 💢'
    : c.kind === 'date'
      ? '데이트를 했다 💕'
      : `수다를 떨었다 ${c.topic}`;
  diary(w, a, `${J(b.name, '와', '과')} ${verb}`);
  diary(w, b, `${J(a.name, '와', '과')} ${verb}`);

  const partners = a.partner === b.id;
  if (c.argue) {
    if (partners) {
      if (aff(w, a, b) < 15 || aff(w, b, a) < 15) {
        a.partner = b.partner = null;
        log(
          w,
          `💔 ${NJ(a, '와', '과')} ${NJ(b, '가', '이')} 크게 싸우고 헤어졌다.`,
          [a, b],
          'love',
        );
        rumor(
          w,
          a,
          'breakup',
          `${J(a.name, '와', '과')} ${J(b.name, '가', '이')} 헤어졌대`,
          '💔',
          0.9,
          [a.id, b.id],
        );
      } else if (R.next() < 0.5)
        log(w, `💢 ${NJ(a, '와', '과')} ${NJ(b, '가', '이')} 사랑싸움을 했다.`, [a, b], 'fight');
    } else if (aff(w, a, b) <= -40 && aff(w, b, a) <= -40 && !pairFlag(w, a, b, 'enemy'))
      log(w, `⚡ ${NJ(a, '와', '과')} ${NV(b)}, 이제 둘은 앙숙이다.`, [a, b], 'fight');
    else if (R.next() < 0.3)
      log(
        w,
        `💢 ${NJ(a, '와', '과')} ${NJ(b, '가', '이')} ${c.topic} 이야기로 말다툼을 했다.`,
        [a, b],
        'fight',
      );
    return;
  }
  if (
    aff(w, a, b) >= SOCIAL.friendAff &&
    aff(w, b, a) >= SOCIAL.friendAff &&
    !partners &&
    !pairFlag(w, a, b, 'friend')
  )
    log(w, `🤝 ${NJ(a, '와', '과')} ${NJ(b, '가', '이')} 친구가 됐다.`, [a, b]);
  if (a.crush === b.id && b.crush === a.id && a.partner == null && b.partner == null) {
    couple(w, a, b);
    log(
      w,
      `💑 ${NJ(a, '와', '과')} ${NJ(b, '가', '이')} 서로 좋아한다는 걸 알게 됐다. 사귀기 시작했다!`,
      [a, b],
      'love',
    );
    return;
  }
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    if (x.partner != null || y.partner != null || x.crush != null) continue;
    const rom = x.trait === '로맨티스트';
    if (
      aff(w, x, y) >= (rom ? SOCIAL.crushAffRomantic : SOCIAL.crushAff) &&
      R.next() < (rom ? 0.35 : 0.08)
    ) {
      x.crush = y.id;
      emote(w, x, '💘', 40);
      diary(w, x, `요즘 ${J(y.name, '가', '이')} 자꾸 생각난다…`);
      log(w, `💘 ${NJ(x, '가', '이')} ${NJ(y, '를', '을')} 좋아하게 된 것 같다.`, [x, y], 'love');
      if (rom) x.confess = y.id;
    }
  }
}

/** 진행 중인 대화의 말풍선을 바꾸고, 끝난 대화를 정리한다. */
export function convTick(w: World): void {
  for (let i = w.convs.length - 1; i >= 0; i--) {
    const c = w.convs[i] as Conversation;
    if (w.t >= c.until) {
      w.convs.splice(i, 1);
      resolveConv(w, c);
      continue;
    }
    const idx = Math.floor((w.t - c.start) / SOCIAL.lineTicks);
    const line = c.lines[Math.min(idx, c.lines.length - 1)];
    if (!line) continue;
    const [spId, e] = line;
    c.speaker = spId;
    const sp = vil(w, spId);
    if (!sp.bubble || sp.bubble.e !== e || sp.bubble.until < w.t) sp.bubble = { e, until: w.t + 2 };
    else sp.bubble.until = w.t + 2;
  }
}

/** 지금 말을 걸 수 있는 상태인가. */
function canChat(w: World, v: Villager): boolean {
  if (v.inside != null || v.talk != null || w.t < v.nextTalk) return false;
  const a = v.act;
  if (!a) return true;
  return !['sleep', 'nap', 'flee', 'rest', 'movein', 'build'].includes(a.type);
}

/** 대화를 거는 빈도(성격·하는 일). */
function chatRate(v: Villager): number {
  const a = v.act;
  let r = TRAITS[v.trait].talk;
  if (a) {
    if (a.type === 'social' || a.type === 'party') r *= 5;
    else if (a.type === 'work' || a.type === 'fetch' || a.type === 'deliver' || a.type === 'haul')
      r *= 0.4;
    else if (a.phase === 'go') r *= 0.5;
  }
  return r;
}

const grid = new SpatialGrid(PERF.spatialCell);

/** 가까이 있는 두 사람이 확률로 대화를 시작한다(공간 격자로 이웃만 본다). */
export function socialTick(w: World): void {
  const out = w.vs.filter((v) => canChat(w, v));
  grid.rebuild(out);
  const used = new Set<number>();
  for (const a of out) {
    if (used.has(a.id)) continue;
    let started = false;
    grid.forNear(a.x, a.y, (b) => {
      if (started || b.id <= a.id || used.has(b.id)) return;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy > SOCIAL.talkDist2) return;
      let p = SOCIAL.baseChat * chatRate(a) * chatRate(b);
      if ((aff(w, a, b) + aff(w, b, a)) / 2 < -30) p *= 0.3;
      if (w.rng.next() < p) {
        startConv(w, a, b, 'chat');
        used.add(a.id);
        used.add(b.id);
        started = true;
      }
    });
  }
}
