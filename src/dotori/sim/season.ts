// 계절과 축제 (SPEC 12.4·12.5, ADR 053). 계절은 보이는 것과 행사만 바꾸고 생산·욕구 수치는 건드리지 않는다.
import {
  FESTIVAL,
  FESTIVALS,
  SEASON,
  SEASONS,
  type FestivalDef,
  type SeasonDef,
} from '../data/seasons';
import { BIRTHDAY } from '../data/story';
import { rumor } from './social';
import { dayOfYear, remember } from './story';
import { NJ, dayOf } from './text';
import type { Villager, World } from './types';
import { addAff, diary, log, vil } from './world';

/** 몇째 해(0 부터). */
export function yearOf(t: number): number {
  return Math.floor((dayOf(t) - 1) / BIRTHDAY.yearDays);
}

/** 계절 번호(0 봄 ~ 3 겨울). */
export function seasonIndex(t: number): number {
  return Math.min(SEASONS.length - 1, Math.floor((dayOfYear(t) - 1) / SEASON.days));
}

/** 지금 계절. */
export function seasonOf(t: number): SeasonDef {
  return SEASONS[seasonIndex(t)] as SeasonDef;
}

/** 계절 안에서 몇째 날(1~7). */
export function seasonDay(t: number): number {
  return ((dayOfYear(t) - 1) % SEASON.days) + 1;
}

/** 겨울에는 비 대신 눈이 온다(규칙은 같다, SPEC 12.4). */
export function isSnow(w: World): boolean {
  return w.weather.rain && seasonOf(w.t).id === 'winter';
}

/** 이번 계절의 축제. */
export function festivalOf(t: number): FestivalDef | undefined {
  const s = seasonOf(t).id;
  return FESTIVALS.find((f) => f.season === s);
}

/** 연 축제 기록 열쇠("해-이름"). */
function heldKey(t: number, f: FestivalDef): string {
  return `${yearOf(t)}-${f.id}`;
}

/** 주최: 계절에 어울리는 성격·직업 가운데 가장 먼저 온 사람, 없으면 가장 먼저 온 주민. */
function pickHost(w: World, f: FestivalDef): Villager | undefined {
  const fit = w.vs.filter(
    (v) => (f.host.trait && v.trait === f.host.trait) || (f.host.job && v.job === f.host.job),
  );
  return fit[0] ?? w.vs[0];
}

/** 06:00 아침 첫머리: 계절 첫날 소식, 축제날이면 축제를 연다. 축제를 잡았으면 true. */
export function morningSeason(w: World): boolean {
  if (seasonDay(w.t) === 1) log(w, seasonOf(w.t).arrive, [], 'day');
  const f = festivalOf(w.t);
  if (!f || seasonDay(w.t) < f.day || w.festivalsHeld.includes(heldKey(w.t, f))) return false;
  if (w.party) {
    // 파티·결혼식이 이미 잡혀 있으면 내일 다시 본다(계절이 끝나면 건너뛴다).
    if (!w.daily[`festivalWait-${f.id}`]) {
      w.daily[`festivalWait-${f.id}`] = true;
      log(w, `${f.e} 광장에 다른 잔치가 잡혀 있어 ${f.name}는 하루 미뤄졌다.`, [], 'party');
    }
    return false;
  }
  const host = pickHost(w, f);
  if (!host) return false;
  schedFestival(w, f, host);
  return true;
}

/** 축제를 잡는다: 오늘 17:00~21:00 광장, 모든 주민이 안다. */
export function schedFestival(w: World, f: FestivalDef, host: Villager): void {
  const start = Math.floor(w.t / 1440) * 1440 + FESTIVAL.startMinute;
  const r = rumor(w, host, 'party', `오늘 저녁 5시에 광장에서 ${f.name}가 열린대`, f.e, 0.95, [
    host.id,
  ]);
  for (const v of w.vs) r.knowers.add(v.id);
  r.all = true;
  w.party = {
    host: host.id,
    start,
    end: start + FESTIVAL.duration,
    rumor: r.id,
    att: new Set(),
    prepLogged: false,
    startLogged: false,
    festival: f.id,
  };
  w.festivalsHeld.push(heldKey(w.t, f));
  if (w.festivalsHeld.length > 16) w.festivalsHeld.splice(0, w.festivalsHeld.length - 16);
  log(
    w,
    `${f.e} 오늘은 ${f.name}! 저녁 5시, 광장에서 온 마을이 모인다. 올해 준비는 ${NJ(host, '가', '이')} 맡았다.`,
    [host],
    'party',
  );
  diary(w, host, `올해 ${f.name} 준비를 맡았다. 멋지게 해내야지 ${f.e}`);
}

/** id 로 축제 찾기. */
export function festivalById(id: string | undefined): FestivalDef | undefined {
  return id ? FESTIVALS.find((f) => f.id === id) : undefined;
}

/** 축제가 끝났다: 즐거움·호감·첫 축제 기억·신문 기록 (SPEC 12.5). */
export function endFestival(
  w: World,
  f: FestivalDef,
  hostId: number,
  att: readonly number[],
): void {
  const host = vil(w, hostId);
  const came = att.length;
  for (const id of att) {
    const v = vil(w, id);
    v.fun = Math.min(100, v.fun + FESTIVAL.fun);
    diary(w, v, f.diary);
    if (v !== host) addAff(w, v, host, 6);
    if (!v.memories.some((m) => m.text.includes(f.name)))
      remember(w, v, 'party', null, `첫 ${f.name}에 간 날`);
  }
  w.week.festivals.push({ id: f.id, came });
  log(
    w,
    `🎊 ${f.name}가 끝났다. ${came}명이 모여 ${came >= 8 ? '광장이 떠들썩했다!' : '오붓한 저녁을 보냈다.'}`,
    [host],
    'party',
  );
}
