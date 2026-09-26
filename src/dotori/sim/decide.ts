// 행동 고르기: 욕구·성격·시간으로 점수를 매겨(options) 가장 높은 행동을 만든다(buildAct) (SPEC 3.3, 시험판 규칙).
import { DESTINATION } from '../data/balance';
import { JOBS } from '../data/people';
import { startAct } from './act';
import { carpenterAct, hasCarpentryWork } from './build';
import { knows, rumorById } from './social';
import type { Act, ActType, Decor, Pt, Villager, World } from './types';
import {
  aff,
  bakeryOpen,
  bldKind,
  diary,
  dist,
  frontOf,
  inSleep,
  nowHour,
  tileOf,
  vil,
  workHours,
} from './world';
import { passable } from './map';

type Choice = ActType | 'date' | 'confess' | 'welcome';

/** 행동 하나를 만든다. 넘기지 않은 칸은 기본값. */
export function mk(w: World, type: ActType, o: Partial<Act> = {}): Act {
  return {
    type,
    phase: 'go',
    dest: null,
    bld: null,
    dur: 30,
    target: null,
    started: w.t,
    until: 0,
    where: null,
    kind: null,
    face: null,
    repath: 0,
    needPath: false,
    site: null,
    decor: null,
    ...o,
  };
}

/** 밖에 있는가. */
const outdoor = (v: Villager): boolean => v.inside == null;

/** 한 사람의 행동 후보와 점수. */
function options(w: World, v: Villager, h: number): [Choice, number][] {
  const tr = v.trait;
  const rain = w.weather.rain;
  const o: [Choice, number][] = [];
  const hun = 1 - v.hunger / 100;
  const tir = 1 - v.energy / 100;
  const lon = 1 - v.social / 100;
  const bor = 1 - v.fun / 100;
  const sleeping = inSleep(v, h);
  o.push([
    'sleep',
    sleeping
      ? 3 + tir * 2
      : (tir > 0.85 ? 2.2 : tir * tir * 1.1) + (v.fearGhost && h >= 19 ? 1.5 : 0),
  ]);
  o.push([
    'eat',
    Math.pow(hun, 1.4) * 3.2 * (tr === '먹보' ? 1.7 : 1) +
      (tr === '먹보' && bakeryOpen(h) && v.hunger < 80 ? 0.5 : 0),
  ]);
  if (sleeping) return o;
  if (workHours(v, h)) {
    const place = JOBS[v.job].place;
    const outdoorJob = place === 'farm' || place === 'shore' || place === 'forest';
    let s =
      (tr === '일벌레' ? 2.4 : tr === '게으름뱅이' ? 0.7 : 1.5) *
      (v.energy > 15 ? 1 : 0.2) *
      (rain && outdoorJob ? 0.6 : 1);
    // 공사가 있으면 목수는 조금 더 일하고 싶어한다(청사진이 기다리고 있다).
    if (v.job === '목수' && hasCarpentryWork(w)) s *= 1.6;
    o.push(['work', s]);
  }
  let soc =
    lon * 2 * (tr === '수다쟁이' ? 1.7 : tr === '외톨이' ? 0.35 : 1) +
    (h >= 18 && h < 23 ? 0.4 : 0) +
    (tr === '파티광' && h >= 18 ? 0.8 : 0);
  const P = w.party;
  if (P && P.host === v.id && w.t < P.start - 40) soc += 3.5;
  o.push(['social', soc * (rain ? 0.45 : 1)]);
  o.push(['fun', bor * 1.6 * (rain ? 0.4 : 1)]);
  o.push(['wander', (tr === '호기심쟁이' ? 1.1 : 0.25) * (rain ? 0.3 : 1)]);
  o.push(['rest', rain ? 1.4 : tr === '외톨이' ? 0.5 : 0.15]);
  if (v.partner != null) {
    const p = vil(w, v.partner);
    if (outdoor(p) && !(p.act && p.act.type === 'sleep'))
      o.push(['date', lon * 1.2 + (h >= 16 && h < 21 ? 0.9 : 0.2)]);
  }
  if (v.welcome != null) {
    const nb = vil(w, v.welcome);
    if (outdoor(nb) && !(nb.act && nb.act.type === 'sleep')) o.push(['welcome', 3]);
  }
  if (tr === '게으름뱅이' && h >= 11 && h < 17 && !rain) o.push(['nap', 0.35 + tir * 1.6]);
  if (v.confess != null) o.push(['confess', 4]);
  if (v.hunting && !v.fearGhost && !rain && h >= 7 && h < 18) o.push(['hunt', 1.8]);
  if (rain && tr === '로맨티스트' && !v.daily.rainDance) o.push(['raindance', 1.6]);
  if (P && w.t >= P.start - 40 && w.t < P.end - 15) {
    const pr = rumorById(w, P.rumor);
    if (P.host === v.id) o.push(['party', 10]);
    else if (pr && knows(v, pr) && w.t >= P.start - 15) {
      const base: Partial<Record<Villager['trait'], number>> = {
        파티광: 2,
        수다쟁이: 1.4,
        외톨이: 0.3,
        게으름뱅이: 0.8,
        투덜이: 0.7,
        겁쟁이: 0.9,
        로맨티스트: 1.2,
      };
      let f = base[tr] ?? 1;
      f *= 0.6 + 0.4 * Math.min(1.5, Math.max(0, (aff(w, v, vil(w, P.host)) + 50) / 100));
      if (v.energy < 25) f *= 0.5;
      if (rain) f *= 0.5;
      o.push(['party', 2.6 * f]);
    }
  }
  return o;
}

/** 후보 k 개를 뽑아 from 에 가장 가까운 칸을 고른다(넓은 지도에서 먼 곳만 헤매지 않게). */
function pickNear(w: World, arr: readonly Pt[], from: Pt, k: number): Pt | null {
  let best: Pt | null = null;
  let bd = Infinity;
  for (let i = 0; i < k; i++) {
    const p = w.rng.pick(arr);
    if (!p) return null;
    const d = dist(p, from);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** 장식 하나를 고른다. 플레이어가 지은 것은 더 자주 고른다(새것이 궁금하다). */
function pickDecor(w: World, arr: readonly Decor[]): Decor | undefined {
  let tot = 0;
  for (const d of arr) tot += d.playerBuilt ? DESTINATION.playerDecorWeight : 1;
  let r = w.rng.next() * tot;
  for (const d of arr) {
    r -= d.playerBuilt ? DESTINATION.playerDecorWeight : 1;
    if (r <= 0) return d;
  }
  return arr[arr.length - 1];
}

/** 장식의 칸 하나(꽃밭은 안쪽 아무 칸). */
function decorSpot(w: World, d: Decor): Pt {
  return { x: d.x + w.rng.int(0, d.w - 1), y: d.y + w.rng.int(0, d.h - 1) };
}

/** 등불 둘레에서 설 칸을 고른다. */
function nearSpot(w: World, p: Pt): Pt {
  for (let i = 0; i < 6; i++) {
    const q = { x: p.x + w.rng.int(-1, 1), y: p.y + w.rng.int(-1, 1) };
    if (passable(w, q.x, q.y)) return q;
  }
  return p;
}

/** 고른 행동을 실제 행동으로 만든다. 만들 수 없으면 null. */
function buildAct(w: World, v: Villager, type: Choice, h: number): Act | null {
  const L = w.L;
  const R = w.rng;
  const pickPt = (arr: readonly Pt[]): Pt | null => R.pick(arr) ?? null;
  switch (type) {
    case 'sleep':
      return mk(w, 'sleep', { bld: v.home, dur: 720 });
    case 'rest':
      return mk(w, 'rest', { bld: v.home, dur: R.int(60, 120) });
    case 'eat': {
      const bakery = bldKind(w, 'bakery');
      const near = dist(v, bakery.door) <= DESTINATION.bakeryMaxDist || v.trait === '먹보';
      if (near && bakeryOpen(h) && bakery.bread > 0 && (v.trait === '먹보' || R.next() < 0.6))
        return mk(w, 'eat', { bld: bakery.id, dur: 25, where: 'bakery' });
      return mk(w, 'eat', { bld: v.home, dur: 30, where: 'home' });
    }
    case 'work': {
      const j = JOBS[v.job];
      if (!j.hours) return null;
      const end = j.hours[1] + (v.trait === '일벌레' ? 2 : 0);
      const dur = Math.min(150, Math.max(30, Math.round((end - h) * 60)));
      if (j.place === 'bakery') return mk(w, 'work', { bld: bldKind(w, 'bakery').id, dur });
      if (j.place === 'workshop') {
        const site = carpenterAct(w, v);
        if (site) return site;
        const ws = bldKind(w, 'workshop');
        return mk(w, 'work', { dest: { x: ws.door.x + R.int(-1, 1), y: ws.door.y - 1 }, dur });
      }
      if (j.place === 'tavern') return mk(w, 'work', { bld: bldKind(w, 'tavern').id, dur });
      if (j.place === 'farm')
        return mk(w, 'work', { dest: pickPt(L.farm), dur: Math.min(dur, 140) });
      if (j.place === 'shore')
        return mk(w, 'work', {
          dest: pickNear(w, L.shore, v, DESTINATION.funSamples),
          dur: Math.min(dur, 150),
        });
      if (j.place === 'forest') {
        if (v.fearGhost) {
          diary(w, v, '유령이 무서워서 오늘은 나무하러 못 갔다…');
          return mk(w, 'rest', { bld: v.home, dur: 60 });
        }
        return mk(w, 'work', {
          dest: pickNear(w, L.forestEdge, frontOf(bldKind(w, 'yard')), DESTINATION.woodSamples),
          dur: Math.min(dur, 150),
        });
      }
      return null;
    }
    case 'social': {
      const P = w.party;
      if (P && P.host === v.id && w.t < P.start - 40) {
        const pr = rumorById(w, P.rumor);
        const cand = w.vs.filter(
          (o) =>
            o !== v && outdoor(o) && (!pr || !knows(o, pr)) && !(o.act && o.act.type === 'sleep'),
        );
        if (cand.length) {
          cand.sort((a, b) => dist(v, a) - aff(w, v, a) * 0.1 - (dist(v, b) - aff(w, v, b) * 0.1));
          const t = R.pick(cand.slice(0, 3));
          if (t) return mk(w, 'visit', { target: t.id, kind: 'invite' });
        }
      }
      if (R.next() < 0.4) {
        const fr = w.vs.filter(
          (o) => o !== v && outdoor(o) && aff(w, v, o) > 25 && !(o.act && o.act.type === 'sleep'),
        );
        const t = R.pick(fr);
        if (t) return mk(w, 'visit', { target: t.id, kind: 'chat' });
      }
      const night = h >= 18 || h < 1;
      if (night) {
        const lamps = w.decor.filter((d) => d.kind === 'lamp');
        const lamp = R.next() < 0.45 ? pickDecor(w, lamps) : undefined;
        if (lamp)
          return mk(w, 'social', {
            dest: nearSpot(w, lamp),
            dur: R.int(40, 90),
            where: 'lamp',
            decor: lamp.id,
          });
        return mk(w, 'social', { dest: pickPt(L.terrace), dur: R.int(50, 120), where: 'terrace' });
      }
      return mk(w, 'social', { dest: pickPt(L.plaza), dur: R.int(50, 120), where: 'plaza' });
    }
    case 'fun': {
      const benches = w.decor.filter((d) => d.kind === 'bench');
      const beds = w.decor.filter((d) => d.kind === 'flowerbed');
      const rom = v.trait === '로맨티스트';
      const opts: [string, number][] = [
        ['shore', v.trait === '외톨이' ? 4 : 1],
        [
          'bench',
          benches.length ? Math.min(3, 1 + benches.filter((d) => d.playerBuilt).length * 0.5) : 0,
        ],
        ['grass', rom ? 2 : 0.6],
        ['forest', v.fearGhost ? 0 : 1],
        ['flower', beds.length ? Math.min(3, beds.length) * (rom ? 2 : 1) : 0],
      ];
      const tot = opts.reduce((s, a) => s + a[1], 0);
      let r = R.next() * tot;
      let where = 'bench';
      for (const [k, p] of opts) {
        if ((r -= p) <= 0) {
          where = k;
          break;
        }
      }
      const dur = R.int(60, 140);
      if (where === 'bench') {
        const b = pickDecor(w, benches);
        if (b) return mk(w, 'fun', { dest: { x: b.x, y: b.y }, dur, where: 'bench', decor: b.id });
        where = 'grass';
      }
      if (where === 'flower') {
        const b = pickDecor(w, beds);
        if (b) return mk(w, 'fun', { dest: decorSpot(w, b), dur, where: 'flower', decor: b.id });
        where = 'grass';
      }
      if (where === 'forest')
        return mk(w, 'fun', {
          dest: pickNear(w, L.forestEdge, v, DESTINATION.funSamples),
          dur,
          where: 'forest',
        });
      if (where === 'shore')
        return mk(w, 'fun', {
          dest: pickNear(w, L.shore, v, DESTINATION.funSamples),
          dur,
          where: 'shore',
        });
      return mk(w, 'fun', {
        dest: pickNear(w, L.grass, v, DESTINATION.funSamples),
        dur,
        where: 'grass',
      });
    }
    case 'wander': {
      const pool = v.fearGhost
        ? [L.grass, L.shore, L.plaza]
        : [L.grass, L.forestEdge, L.shore, L.plaza];
      return mk(w, 'wander', {
        dest: pickNear(w, R.pick(pool) ?? L.grass, v, DESTINATION.wanderSamples),
        dur: R.int(10, 30),
      });
    }
    case 'date':
      return v.partner == null ? null : mk(w, 'visit', { target: v.partner, kind: 'date' });
    case 'welcome':
      return v.welcome == null ? null : mk(w, 'visit', { target: v.welcome, kind: 'welcome' });
    case 'confess': {
      if (v.confess == null) return null;
      const t = vil(w, v.confess);
      if (!outdoor(t)) return mk(w, 'social', { dest: pickPt(L.plaza), dur: 40, where: 'plaza' });
      return mk(w, 'visit', { target: t.id, kind: 'confess' });
    }
    case 'nap':
      return mk(w, 'nap', { dest: tileOf(v), dur: R.int(50, 110) });
    case 'hunt':
      return mk(w, 'hunt', { dest: pickNear(w, L.forestEdge, v, DESTINATION.funSamples), dur: 40 });
    case 'raindance':
      v.daily.rainDance = true;
      return mk(w, 'raindance', { dest: pickPt(L.plaza), dur: 35 });
    case 'party': {
      const P = w.party;
      if (!P) return null;
      return mk(w, 'party', { dest: pickPt(L.plaza), dur: Math.max(20, P.end - w.t) });
    }
  }
  return null;
}

/** 등짐이 있으면 먼저 내려놓으러 간다(목수는 공사장, 그 밖은 야적장). */
function packFirst(w: World, v: Villager, h: number): Act | null {
  if (!v.pack || v.pack.kind !== 'lumber' || v.pack.n <= 0) return null;
  if (v.job === '목수' && workHours(v, h)) {
    const a = carpenterAct(w, v);
    if (a) return a;
  }
  const yard = bldKind(w, 'yard');
  return mk(w, 'haul', { dest: frontOf(yard), dur: 1 });
}

/** 다음 행동을 고르고 시작한다. */
export function decide(w: World, v: Villager): void {
  const h = nowHour(w);
  const first = packFirst(w, v, h);
  if (first) {
    startAct(w, v, first);
    return;
  }
  let best: Choice = 'wander';
  let bs = -1;
  for (const [k, s] of options(w, v, h)) {
    const sc = s * (0.85 + w.rng.next() * 0.3);
    if (sc > bs) {
      bs = sc;
      best = k;
    }
  }
  const act =
    buildAct(w, v, best, h) ??
    mk(w, 'wander', { dest: w.rng.pick(w.L.grass) ?? tileOf(v), dur: w.rng.int(10, 20) });
  if (act.dest == null && act.bld == null && act.target == null) act.dest = tileOf(v);
  startAct(w, v, act);
}
