// 하루의 사건: 아침 갱신, 날씨, 파티, 욕구 감소와 유령 공포 (SPEC 1·3.2·3.4, 시험판 규칙).
import { BAKERY, NEEDS, WEATHER } from '../data/balance';
import { TRAITS } from '../data/people';
import { endAct, startAct } from './act';
import { mk } from './decide';
import { rumor, rumorById, knows } from './social';
import { J, NJ, dayOf, hourOf } from './text';
import type { Villager, World } from './types';
import { addAff, bldKind, diary, emote, log, vil } from './world';

/** 파티를 계획한다(19:00~22:00, 광장). planted 면 플레이어가 심은 생각이라 계획 소식을 따로 남기지 않는다. */
export function schedParty(w: World, host: Villager, planted: boolean): void {
  const h = hourOf(w.t);
  const day0 = Math.floor(w.t / 1440);
  const start = (h < 17 ? day0 : day0 + 1) * 1440 + 19 * 60;
  const r = rumor(
    w,
    host,
    'party',
    `${J(host.name, '가', '이')} ${h < 17 ? '오늘' : '내일'} 밤 7시에 광장에서 파티를 연대`,
    '🎉',
    0.9,
    [host.id],
  );
  w.party = {
    host: host.id,
    start,
    end: start + 180,
    rumor: r.id,
    att: new Set(),
    prepLogged: false,
    startLogged: false,
  };
  if (!planted)
    log(
      w,
      `🎉 파티광 ${NJ(host, '가', '이')} ${h < 17 ? '오늘' : '내일'} 밤 7시에 광장에서 파티를 열기로 했다. 아직은 혼자만 아는 계획.`,
      [host],
      'party',
    );
  diary(w, host, '파티를 열 거다! 다들 불러야지 🎉');
}

/** 매일 06:00 아침 갱신. */
export function morning(w: World): void {
  w.daily = {};
  w.arrivalsToday = 0;
  for (const v of w.vs) {
    v.daily = {};
    v.welcome = null;
  }
  log(w, `☀️ ${dayOf(w.t)}일째 아침이 밝았다.`, [], 'day');
  bldKind(w, 'bakery').bread = BAKERY.morningBread;
  for (const r of w.rumors) if (r.kind !== 'party') r.juicy *= 0.8;
  w.rumors = w.rumors.filter((r) =>
    r.kind === 'party' ? r.active || w.t - r.born < 1440 : r.juicy > 0.15,
  );
  for (const v of w.vs) {
    if (v.crush != null && v.partner == null && v.confess == null && w.rng.next() < 0.3) {
      v.confess = v.crush;
      diary(w, v, '오늘은 꼭 마음을 전해야지…');
    }
  }
  if (!w.party) {
    for (const h of w.vs.filter((v) => v.trait === '파티광')) {
      if (w.rng.next() < 0.2) {
        schedParty(w, h, false);
        break;
      }
    }
  }
}

/** 한 시간마다 비가 오거나 그친다. 비가 오면 밖에서 놀던 사람들이 흩어진다. */
export function weatherTick(w: World): void {
  if (w.t % 60 !== 0) return;
  const wt = w.weather;
  if (wt.rain && w.t >= wt.until) {
    wt.rain = false;
    log(w, '🌤️ 비가 그쳤다.', [], 'weather');
  } else if (!wt.rain && w.rng.next() < WEATHER.rainChancePerHour) {
    wt.rain = true;
    wt.until = w.t + w.rng.int(WEATHER.rainMin, WEATHER.rainMax);
    log(w, '🌧️ 비가 내리기 시작했다. 다들 집으로 뛰어간다.', [], 'weather');
    for (const v of w.vs) {
      if (
        v.inside == null &&
        v.talk == null &&
        v.act &&
        ['social', 'fun', 'wander', 'idle', 'nap'].includes(v.act.type) &&
        w.rng.next() < 0.7
      )
        endAct(w, v);
    }
  }
}

/** 파티 준비·시작·끝. */
export function partyTick(w: World): void {
  const P = w.party;
  if (!P) return;
  const host = vil(w, P.host);
  const pr = rumorById(w, P.rumor);
  if (!P.prepLogged && w.t >= P.start - 40) {
    P.prepLogged = true;
    log(w, `🏮 ${NJ(host, '가', '이')} 광장에 등불을 걸며 파티 준비를 한다.`, [host], 'party');
    if (host.talk == null && host.act && host.act.type !== 'party') endAct(w, host);
  }
  if (!P.startLogged && w.t >= P.start) {
    P.startLogged = true;
    log(
      w,
      `🎉 파티가 시작됐다! 소식을 들은 사람은 ${(pr?.knowers.size ?? 1) - 1}명.`,
      [host],
      'party',
    );
    for (const v of w.vs) {
      if (
        v !== host &&
        pr &&
        knows(v, pr) &&
        v.talk == null &&
        v.act &&
        v.act.type !== 'sleep' &&
        v.act.type !== 'party' &&
        w.rng.next() < 0.75
      )
        endAct(w, v);
    }
  }
  if (w.t >= P.end) {
    const invited = (pr?.knowers.size ?? 1) - 1;
    const came = [...P.att].filter((id) => id !== P.host).length;
    const verdict =
      came >= invited * 0.6 && came > 3 ? ' 대성공!' : came <= 2 ? ' 조금 쓸쓸한 밤이었다.' : '';
    log(
      w,
      `🎉 파티가 끝났다. 소식을 들은 ${invited}명 중 ${came}명이 왔다.${verdict}`,
      [host],
      'party',
    );
    diary(
      w,
      host,
      came > 3 ? `파티에 ${came}명이나 왔다! 최고의 밤 🎉` : `파티에 ${came}명밖에 안 왔다… 🥲`,
    );
    for (const id of P.att) {
      const v = vil(w, id);
      if (v === host) continue;
      diary(w, v, `${host.name}네 파티에 다녀왔다 🎉`);
      addAff(w, v, host, 6);
    }
    if (pr) pr.active = false;
    w.lastPartyCame = came;
    w.party = null;
  }
}

/** 욕구가 줄어든다. 유령을 무서워하는 사람은 밤 숲 근처에서 비명을 지르며 집으로 도망친다. */
export function needsTick(w: World, v: Villager, h: number): void {
  const T = TRAITS[v.trait];
  const asleep = v.act && v.act.phase === 'do' && (v.act.type === 'sleep' || v.act.type === 'nap');
  v.hunger -= v.trait === '먹보' ? NEEDS.hungerDecayGlutton : NEEDS.hungerDecay;
  if (!asleep) v.energy -= NEEDS.energyDecay;
  v.social -= T.soc;
  v.fun -= NEEDS.funDecay;
  const cl = (x: number): number => (x < 0 ? 0 : x > 100 ? 100 : x);
  v.hunger = cl(v.hunger);
  v.energy = cl(v.energy);
  v.social = cl(v.social);
  v.fun = cl(v.fun);
  if (
    v.fearGhost &&
    v.inside == null &&
    v.talk == null &&
    (h >= 19 || h < 5) &&
    (w.forestDist[Math.floor(v.y) * w.W + Math.floor(v.x)] ?? 255) <= 2 &&
    !(v.act && v.act.type === 'flee')
  ) {
    emote(w, v, '😱', 30);
    if (!v.daily.fleeLog) {
      v.daily.fleeLog = true;
      log(
        w,
        `😱 ${NJ(v, '가', '이')} 어두운 숲 근처에서 비명을 지르며 집으로 달려갔다.`,
        [v],
        'funny',
      );
    }
    diary(w, v, '숲에서 무슨 소리가 났다!!! 😱');
    v.act = null;
    startAct(w, v, mk(w, 'flee', { bld: v.home, dur: 60 }));
  }
}
