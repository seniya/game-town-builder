// 이야기가 쌓이는 마을 (SPEC 11, ADR 052): 기억 남기기·꺼내기, 기념일, 생일, 주간 도토리 신문.
import { BUILDABLES, type BuildKind } from '../data/buildables';
import { BIRTHDAY, MEMORY, PAPER } from '../data/story';
import { emptyWeek } from './create';
import { say } from './lines';
import { J, NJ, NV, dayOf } from './text';
import type { Memory, MemoryKind, Paper, Villager, World } from './types';
import { addAff, aff, diary, emote, log, vil } from './world';

/** 기억 하나를 남긴다. 넘치면 오래된 것부터 버린다. */
export function remember(
  w: World,
  v: Villager,
  kind: MemoryKind,
  withId: number | null,
  text: string,
): void {
  v.memories.unshift({ t: w.t, kind, with: withId, text });
  if (v.memories.length > MEMORY.max) v.memories.length = MEMORY.max;
}

/** 기억이 며칠 전인가(최소 1). */
export function daysAgo(w: World, m: Memory): number {
  return Math.max(1, Math.floor((w.t - m.t) / 1440));
}

/** 대화에서 꺼낼 기억: a 가 b 와 함께한, 하루 넘은 기억. 같은 두 사람은 하루 한 번(SPEC 11.1). */
export function recallFor(w: World, a: Villager, b: Villager): Memory | null {
  const key = `recall-${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
  if (w.daily[key]) return null;
  const pool = a.memories.filter((m) => m.with === b.id && w.t - m.t >= MEMORY.recallMinAge);
  if (!pool.length || w.rng.next() >= MEMORY.recallChance) return null;
  w.daily[key] = true;
  return w.rng.pick(pool) ?? null;
}

/** 대화가 끝난 뒤: 꺼낸 기억을 일기에 남기고 호감을 조금 올린다. */
export function recallDiary(w: World, a: Villager, b: Villager, m: Memory): void {
  diary(
    w,
    a,
    say(w, a, 'recall', {
      wa: J(b.name, '와', '과'),
      ga: J(b.name, '가', '이'),
      n: daysAgo(w, m),
      mem: m.text,
    }),
  );
  addAff(w, a, b, MEMORY.recallAff);
  addAff(w, b, a, MEMORY.recallAff);
}

/** 아침: 문득 떠오르는 기억과 커플·부부의 기념일 (SPEC 11.1). */
export function morningMemories(w: World): void {
  for (const v of w.vs) {
    const old = v.memories.filter((m) => w.t - m.t >= MEMORY.morningMinAge);
    if (old.length && w.rng.next() < MEMORY.morningChance) {
      const m = w.rng.pick(old);
      if (m) diary(w, v, say(w, v, 'morningRecall', { n: daysAgo(w, m), mem: m.text }));
    }
    const p = v.partner;
    if (p == null || p < v.id || v.coupledAt == null) continue;
    const days = Math.floor((w.t - v.coupledAt) / 1440);
    if (days <= 0 || days % MEMORY.anniversaryDays !== 0) continue;
    const o = vil(w, p);
    const weeks = days / MEMORY.anniversaryDays;
    for (const x of [v, o]) {
      x.fun = Math.min(100, x.fun + MEMORY.anniversaryFun);
      emote(w, x, '💞', 30);
    }
    log(
      w,
      `💞 ${NJ(v, '와', '과')} ${NV(o)}, ${v.married ? '함께한' : '사귄'} 지 ${weeks}주가 됐다.`,
      [v, o],
      'love',
    );
  }
}

/** 올해의 날(1~28). */
export function dayOfYear(t: number): number {
  return ((dayOf(t) - 1) % BIRTHDAY.yearDays) + 1;
}

/** 아침: 오늘 생일인 주민을 알리고 친한 이웃이 축하하러 갈 준비를 한다 (SPEC 11.3). */
export function morningBirthdays(w: World): void {
  const today = dayOfYear(w.t);
  for (const v of w.vs) v.celebrate = null;
  for (const v of w.vs) {
    if (v.birthday !== today) continue;
    w.week.birthdays.push(v.id);
    log(w, `🎂 오늘은 ${NV(v)}의 생일!`, [v], 'story');
    diary(w, v, '오늘은 내 생일이다 🎂 누가 기억해 줄까?');
    const friends = w.vs
      .filter((o) => o !== v && o.celebrate == null && aff(w, o, v) >= BIRTHDAY.friendAff)
      .sort((a, b) => aff(w, b, v) - aff(w, a, v))
      .slice(0, BIRTHDAY.maxGuests);
    for (const o of friends) o.celebrate = v.id;
  }
}

/** 생일 축하 대화가 끝났을 때(a 가 축하하러 온 사람, b 가 생일인 사람). */
export function birthdayVisit(w: World, a: Villager, b: Villager): void {
  addAff(w, a, b, BIRTHDAY.visitAff);
  addAff(w, b, a, BIRTHDAY.visitAff);
  b.fun = Math.min(100, b.fun + BIRTHDAY.fun);
  b.daily[`guest-${a.id}`] = true;
  diary(w, a, `${b.name}의 생일을 축하해 줬다 🎂`);
  diary(w, b, `${J(a.name, '가', '이')} 생일을 축하해 줬다! 🎁`);
}

/** 20:00: 오늘 생일인 사람에게 몇 명이 왔는지 알리고, 많이 왔으면 기억한다. */
export function birthdaySummary(w: World): void {
  if (w.t % 1440 !== BIRTHDAY.summaryMinute) return;
  const today = dayOfYear(w.t);
  for (const v of w.vs) {
    if (v.birthday !== today) continue;
    const n = Object.keys(v.daily).filter((k) => k.startsWith('guest-')).length;
    log(
      w,
      n ? `🎂 ${NV(v)}의 생일에 ${n}명이 축하하러 왔다.` : `🎂 ${NV(v)}의 생일이 조용히 지나갔다.`,
      [v],
      'story',
    );
    if (n >= BIRTHDAY.memoryFrom)
      remember(w, v, 'birthday', null, `내 생일에 ${n}명이 축하해 준 날`);
  }
}

/** 이번 주 완공 기록. */
export function weekBuilt(w: World, kind: BuildKind): void {
  w.week.built[kind] = (w.week.built[kind] ?? 0) + 1;
}

/** 이름 목록(링크). */
function names(w: World, ids: readonly number[]): string {
  return ids.map((id) => NV(vil(w, id))).join(', ');
}

/** 한 주의 기록으로 신문 한 호를 만든다 (SPEC 11.4). */
export function makePaper(w: World): Paper {
  const k = w.week;
  const items: string[] = [];
  const ids = new Set<number>();
  const add = (s: string, who: readonly number[] = []): void => {
    items.push(s);
    for (const id of who) ids.add(id);
  };
  const pair = (p: readonly number[]): string => p.map((id) => NV(vil(w, id))).join('♥');
  for (const [a, b] of k.weddings) add(`💍 ${names(w, [a])}·${names(w, [b])} 결혼`, [a, b]);
  for (const [a, b] of k.couples) add(`💑 새 커플 ${names(w, [a])}♥${names(w, [b])}`, [a, b]);
  if (k.arrivals.length)
    add(`🧳 새 이웃 ${k.arrivals.length}명: ${names(w, k.arrivals)}`, k.arrivals);
  const built = Object.entries(k.built)
    .map(([kind, n]) => `${BUILDABLES[kind as BuildKind].label} ${n}`)
    .join(' · ');
  if (built) add(`🔨 완공: ${built}`);
  if (k.parties)
    add(
      `🎉 파티 ${k.parties}번${k.bestParty ? `, 가장 붐빈 날은 ${names(w, [k.bestParty.host])}네 ${k.bestParty.came}명` : ''}`,
      k.bestParty ? [k.bestParty.host] : [],
    );
  if (k.birthdays.length) add(`🎂 생일: ${names(w, k.birthdays)}`, k.birthdays);
  const t0 = k.tally0;
  const t = w.tally;
  add(
    `🥖 빵 ${t.bread - t0.bread}개를 굽고 ${t.breadEaten - t0.breadEaten}개를 먹었다${k.breadOutDays ? ` · 빵이 동난 날 ${k.breadOutDays}일` : ''}`,
  );
  add(
    `🌾 밀 ${t.wheat - t0.wheat}단 · 🐟 생선 ${t.fish - t0.fish}마리${k.bigFish.length ? ` · 월척 ${names(w, k.bigFish)}` : ''}`,
    k.bigFish,
  );
  for (const [a, b] of k.breakups) add(`💔 ${names(w, [a])}·${names(w, [b])} 헤어짐`, [a, b]);
  if (k.rejects.length) add(`💔 고백했다 차인 사람: ${names(w, k.rejects)}`, k.rejects);
  const top = [...w.rumors].sort((a, b) => b.knowers.size - a.knowers.size)[0];
  if (top && top.knowers.size > 3)
    add(`🗣️ 이번 주 소문: "${top.short}" (${top.knowers.size}명이 안다)`);
  const headline = k.weddings[0]
    ? `💍 ${pair(k.weddings[0])}, 광장에서 백년가약!`
    : k.couples[0]
      ? `💑 ${pair(k.couples[0])}, 사귀기 시작하다`
      : k.arrivals.length >= PAPER.arrivalsHeadline
        ? `🧳 이번 주 새 이웃 ${k.arrivals.length}명, 마을이 북적인다`
        : k.bestParty && k.bestParty.came >= PAPER.bigPartyFrom
          ? `🎉 ${names(w, [k.bestParty.host])}네 파티에 ${k.bestParty.came}명!`
          : k.breadOutDays >= PAPER.breadOutDays
            ? `🥖 빵이 동난 날이 ${k.breadOutDays}일, 빵집 앞 한숨`
            : built
              ? `🔨 새로 지은 것들: ${built}`
              : '🌰 조용하고 평화로운 한 주';
  return {
    no: w.papers.length ? (w.papers[0]?.no ?? 0) + 1 : 1,
    t: w.t,
    headline,
    items,
    ids: [...ids],
  };
}

/** 7 일째마다 20:00 에 신문을 낸다. */
export function paperTick(w: World): void {
  if (w.t % 1440 !== PAPER.minute || dayOf(w.t) % PAPER.everyDays !== 0) return;
  const p = makePaper(w);
  w.papers.unshift(p);
  if (w.papers.length > PAPER.keep) w.papers.length = PAPER.keep;
  w.week = emptyWeek(w.t, w.tally);
  log(w, `📰 도토리 신문 제${p.no}호: ${p.headline}`, [], 'story');
  w.out.push({ type: 'paper', no: p.no });
}
