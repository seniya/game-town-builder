// World 조회·기록 도구: 주민·건물 찾기, 호감, 소식·일기·감정, 시간표 판정.
import { BAKERY, PERF } from '../data/balance';
import { JOBS } from '../data/people';
import type { Side } from '../data/villageMap';
import { hourOf } from './text';
import type { Building, FeedKind, FxKind, Pt, Villager, World } from './types';

/** 주민 id → 주민. id 는 배열 번호와 같다(주민은 지워지지 않는다). */
export function vil(w: World, id: number): Villager {
  const v = w.vs[id];
  if (!v) throw new Error(`주민 ${id} 없음`);
  return v;
}

/** 건물 id → 건물. 없으면 undefined(치운 건물). */
export function bld(w: World, id: number | null): Building | undefined {
  return id == null ? undefined : w.bmap.get(id);
}

/** 반드시 있는 건물. */
export function bldOf(w: World, id: number): Building {
  const b = w.bmap.get(id);
  if (!b) throw new Error(`건물 ${id} 없음`);
  return b;
}

/** 종류로 첫 건물을 찾는다(빵집·주점·공방·야적장). */
export function bldKind(w: World, kind: Building['kind']): Building {
  const b = w.buildings.find((x) => x.kind === kind);
  if (!b) throw new Error(`${kind} 없음`);
  return b;
}

/** 건물 목록이 바뀐 뒤 색인을 다시 만든다. */
export function reindexBuildings(w: World): void {
  w.bmap = new Map(w.buildings.map((b) => [b.id, b]));
}

/** 새 id(건물·장식·청사진 공용). */
export function newId(w: World): number {
  return w.nextId++;
}

/** 문 칸. */
export function doorOf(x: number, y: number, bw: number, bh: number, side: Side): Pt {
  switch (side) {
    case 's':
      return { x: x + Math.floor(bw / 2), y: y + bh - 1 };
    case 'n':
      return { x: x + Math.floor(bw / 2), y };
    case 'e':
      return { x: x + bw - 1, y: y + Math.floor(bh / 2) };
    case 'w':
      return { x, y: y + Math.floor(bh / 2) };
  }
}

/** 문에서 바깥으로 나가는 방향. */
export function sideDir(side: Side): Pt {
  return side === 's'
    ? { x: 0, y: 1 }
    : side === 'n'
      ? { x: 0, y: -1 }
      : side === 'e'
        ? { x: 1, y: 0 }
        : { x: -1, y: 0 };
}

/** 건물 문 바로 바깥 칸. */
export function frontOf(b: Building): Pt {
  const d = sideDir(b.side);
  return { x: b.door.x + d.x, y: b.door.y + d.y };
}

/** a 가 b 를 얼마나 좋아하는가. */
export function aff(w: World, a: Villager, b: Villager): number {
  return w.aff.get(a.id, b.id);
}

/** a 의 b 에 대한 호감을 d 만큼 바꾼다. */
export function addAff(w: World, a: Villager, b: Villager, d: number): void {
  w.aff.add(a.id, b.id, d);
}

/** 두 주민 사이 거리(타일). */
export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 마을 소식 한 줄을 남긴다. html 은 NV/NJ 이름 링크를 품을 수 있다. */
export function log(
  w: World,
  html: string,
  vs: readonly Villager[] = [],
  kind: FeedKind = '',
): void {
  const entry = { t: w.t, html, ids: vs.map((v) => v.id), kind };
  w.feed.unshift(entry);
  if (w.feed.length > PERF.feedMax) w.feed.length = PERF.feedMax;
  w.out.push({ type: 'log', entry });
}

/** 주민 일기 한 줄. */
export function diary(w: World, v: Villager, text: string): void {
  v.diary.unshift({ t: w.t, text });
  if (v.diary.length > PERF.diaryMax) v.diary.length = PERF.diaryMax;
}

const EMO_FX: Readonly<Record<string, FxKind>> = {
  '💘': 'heart',
  '💑': 'heart',
  '💕': 'heart',
  '💖': 'heart',
  '💢': 'steam',
  '😱': 'sweat',
  '💎': 'sparkle',
  '🍀': 'sparkle',
  '🗺️': 'sparkle',
  '🍄': 'sparkle',
  '🐾': 'sparkle',
  '🌰': 'sparkle',
  '🐟': 'catch',
  '👋': 'sparkle',
};

/** 머리 위 감정 말풍선을 띄우고, 밖에 있으면 연출을 알린다. */
export function emote(w: World, v: Villager, e: string, dur = 25): void {
  v.bubble = { e, until: w.t + dur };
  const fx = EMO_FX[e];
  if (fx && v.inside == null) w.out.push({ type: 'fx', vid: v.id, fx });
}

/** 두 사람 사이 한 번뿐인 사건 표시. 이미 있었으면 true. */
export function pairFlag(w: World, a: Villager, b: Villager, k: string): boolean {
  const key = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}-${k}`;
  if (w.flags.has(key)) return true;
  w.flags.add(key);
  return false;
}

/** 잘 시간인가. */
export function inSleep(v: Villager, h: number): boolean {
  const s = v.sleepH;
  const wk = v.wakeH;
  return s < 24 ? h >= s || h < wk : h >= s - 24 && h < wk;
}

/** 일할 시간인가(일벌레는 한 시간 먼저·두 시간 늦게, 게으름뱅이는 두 시간 늦게). */
export function workHours(v: Villager, h: number): boolean {
  const hours = JOBS[v.job].hours;
  if (!hours) return false;
  let [a, b] = hours;
  if (v.trait === '일벌레') {
    a -= 1;
    b += 2;
  }
  if (v.trait === '게으름뱅이') a += 2;
  return h >= a && h < b;
}

/** 빵집이 열었는가. */
export function bakeryOpen(h: number): boolean {
  return h >= BAKERY.openFrom && h < BAKERY.openTo;
}

/** 지금 시(소수). */
export function nowHour(w: World): number {
  return hourOf(w.t);
}

/** 주민의 타일. */
export function tileOf(v: Pt): Pt {
  return { x: Math.floor(v.x), y: Math.floor(v.y) };
}
