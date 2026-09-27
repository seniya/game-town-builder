// 결혼과 한 집 살림 (SPEC 11.2, ADR 052): 청혼 결심, 광장 결혼식(파티 규칙 재사용), 부부의 신혼집 이사.
import { MARRIAGE } from '../data/story';
import { startAct } from './act';
import { mk } from './decide';
import { rumor } from './social';
import { remember } from './story';
import { J, NJ, NV } from './text';
import type { Building, Villager, World } from './types';
import { addAff, aff, bld, diary, emote, log, pairFlag, vil } from './world';

/** 결혼할 수 있는 커플인가. */
export function canMarry(w: World, a: Villager, b: Villager): boolean {
  return (
    a.partner === b.id &&
    b.partner === a.id &&
    !a.married &&
    a.coupledAt != null &&
    w.t - a.coupledAt >= MARRIAGE.minTogether &&
    aff(w, a, b) >= MARRIAGE.minAff &&
    aff(w, b, a) >= MARRIAGE.minAff
  );
}

/** 오늘 저녁 결혼식을 잡는다(파티와 같은 자리를 쓴다). */
export function schedWedding(w: World, a: Villager, b: Villager): void {
  const start = Math.floor(w.t / 1440) * 1440 + MARRIAGE.startMinute;
  const r = rumor(
    w,
    a,
    'party',
    `${J(a.name, '와', '과')} ${J(b.name, '가', '이')} 오늘 저녁 광장에서 결혼식을 올린대`,
    '💍',
    0.95,
    [a.id, b.id],
  );
  r.knowers.add(b.id);
  w.party = {
    host: a.id,
    start,
    end: start + MARRIAGE.duration,
    rumor: r.id,
    att: new Set(),
    prepLogged: false,
    startLogged: false,
    wedding: [a.id, b.id],
  };
  diary(w, a, `${b.name}에게 청혼했다. "응!" 이라고 했다 💍`);
  diary(w, b, `${J(a.name, '가', '이')} 청혼했다! 오늘 저녁 결혼식이다 💍`);
  log(
    w,
    `💍 ${NJ(a, '가', '이')} ${NV(b)}에게 청혼했다! 오늘 저녁 5시, 광장에서 결혼식이 열린다.`,
    [a, b],
    'love',
  );
}

/** 아침: 오래 사귄 커플 중 한 쌍이 청혼을 결심한다(하루 한 쌍, 파티가 잡혀 있으면 미룬다). */
export function morningProposals(w: World): void {
  if (w.party) return;
  const last = Math.max(
    -Infinity,
    ...w.vs.flatMap((v) => v.memories.filter((m) => m.kind === 'wedding').map((m) => m.t)),
  );
  if (w.t - last < MARRIAGE.gap) return;
  for (const a of w.vs) {
    if (a.partner == null || a.partner < a.id) continue;
    const b = vil(w, a.partner);
    if (!canMarry(w, a, b) || w.rng.next() >= MARRIAGE.proposeChance) continue;
    schedWedding(w, a, b);
    return;
  }
}

/** 결혼식이 끝났다: 부부가 되고 하객과 함께 기억한다. */
export function marry(w: World, a: Villager, b: Villager, guests: readonly number[]): void {
  a.married = b.married = true;
  emote(w, a, '💍', 60);
  emote(w, b, '💍', 60);
  remember(w, a, 'wedding', b.id, `${J(b.name, '와', '과')} 결혼한 날`);
  remember(w, b, 'wedding', a.id, `${J(a.name, '와', '과')} 결혼한 날`);
  for (const id of guests) {
    if (id === a.id || id === b.id) continue;
    const g = vil(w, id);
    remember(w, g, 'guest', a.id, `${a.name}·${b.name} 결혼식에 간 날`);
    addAff(w, g, a, MARRIAGE.guestAff);
    addAff(w, g, b, MARRIAGE.guestAff);
    diary(w, g, `${a.name}·${b.name} 결혼식에 다녀왔다. 행복해 보였다 💐`);
  }
  w.week.weddings.push([a.id, b.id]);
  log(
    w,
    `💍 ${NJ(a, '와', '과')} ${NJ(b, '가', '이')} 부부가 됐다! 하객 ${guests.filter((id) => id !== a.id && id !== b.id).length}명이 축하했다.`,
    [a, b],
    'love',
  );
  nestTick(w);
}

/** 따로 사는 부부 수(마을 카드 안내). */
export function couplesApart(w: World): number {
  return w.vs.filter(
    (v) => v.married && v.partner != null && v.partner > v.id && vil(w, v.partner).home !== v.home,
  ).length;
}

/** 아무도 살지 않는 집(먼저 지은 집부터). */
function emptyHouse(w: World): Building | undefined {
  return w.buildings
    .filter((x) => x.kind === 'house' && x.residents.length === 0)
    .sort((p, q) => p.builtAt - q.builtAt || p.id - q.id)[0];
}

/** 주민의 집을 바꾼다(건물 거주자 목록도 함께). */
function moveHome(w: World, v: Villager, to: Building): void {
  const from = bld(w, v.home);
  if (from) from.residents = from.residents.filter((id) => id !== v.id);
  to.residents.push(v.id);
  v.home = to.id;
}

/**
 * 따로 사는 부부가 빈 집으로 함께 옮긴다(새 주민보다 먼저, SPEC 11.2).
 * 빈 집이 없으면 한 쌍에 한 번 신혼집을 찾는다는 소식을 남긴다.
 */
export function nestTick(w: World): void {
  for (const a of w.vs) {
    if (!a.married || a.partner == null || a.partner < a.id) continue;
    const b = vil(w, a.partner);
    if (a.home === b.home) continue;
    const to = emptyHouse(w);
    if (!to) {
      // 한 쌍에 한 번만 알린다. 그 뒤로는 마을 카드 안내가 대신한다.
      if (!pairFlag(w, a, b, 'nest'))
        log(
          w,
          `💍 ${NJ(a, '와', '과')} ${NJ(b, '가', '이')} 둘만의 신혼집을 찾는다. 빈 집이 있으면 좋겠다.`,
          [a, b],
          'story',
        );
      continue;
    }
    moveHome(w, a, to);
    moveHome(w, b, to);
    for (const v of [a, b]) {
      v.pack = { kind: 'bag', n: 1, site: null };
      diary(w, v, `${to.name}로 신혼살림을 옮겼다 🏡`);
      if (v.talk == null && !(v.act && v.act.type === 'sleep'))
        startAct(w, v, mk(w, 'movein', { bld: to.id, dur: 30 }));
    }
    log(
      w,
      `🏡 ${NJ(a, '와', '과')} ${NJ(b, '가', '이')} ${J(to.name, '로', '으로')} 신혼살림을 옮겼다. 두 집에 빈 자리가 생겼다.`,
      [a, b],
      'arrive',
    );
  }
}
