// 가꾸기: 놓기 검사, 청사진, 목수의 목재 나르기와 망치질, 완성, 치우기, 장식 첫 사용 (SPEC 4).
import { BASE_CHARM, LUMBER } from '../data/balance';
import { BUILDABLES, HOUSE_ROAD_MAX, REFUND_DONE, type BuildKind } from '../data/buildables';
import type { Side } from '../data/villageMap';
import { mk } from './decide';
import { getT, inb, passableTile, recomputeLocations, setT } from './map';
import { startAct } from './act';
import { J, NJ, NV } from './text';
import type { Act, Blueprint, Building, Decor, DecorKind, Pt, Villager, World } from './types';
import { TILE } from './types';
import {
  bldKind,
  diary,
  doorOf,
  emote,
  frontOf,
  log,
  newId,
  reindexBuildings,
  sideDir,
  workHours,
} from './world';

export interface PlaceCheck {
  ok: boolean;
  /** 놓을 수 없는 이유(화면에 보인다). */
  reason: string;
  /** 집 문 앞에서 길까지 새로 깔 칸. */
  road: Pt[];
}

const DECOR_NAME: Record<DecorKind, string> = { bench: '벤치', lamp: '등불', flowerbed: '꽃밭' };

/** 사각형 둘이 겹치는가. */
function overlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

/** 칸 (x, y) 가 장식이나 청사진에 덮여 있는가. */
function covered(w: World, x: number, y: number): boolean {
  return (
    w.decor.some((d) => overlap(x, y, 1, 1, d.x, d.y, d.w, d.h)) ||
    w.blueprints.some((b) => overlap(x, y, 1, 1, b.x, b.y, b.w, b.h))
  );
}

/** 바닥 종류 이름을 타일에서 얻는다. */
function groundOf(t: number): 'grass' | 'sand' | 'forest' | null {
  return t === TILE.GRASS
    ? 'grass'
    : t === TILE.SAND
      ? 'sand'
      : t === TILE.FOREST
        ? 'forest'
        : null;
}

/** 집 크기 사각형과 문 방향으로, 문 앞에서 가장 가까운 길까지 깔 칸을 찾는다(너비 우선). */
function roadFor(w: World, x: number, y: number, bw: number, bh: number, side: Side): Pt[] | null {
  const door = doorOf(x, y, bw, bh, side);
  const d = sideDir(side);
  const start = { x: door.x + d.x, y: door.y + d.y };
  const isRoad = (t: number): boolean => t === TILE.PATH || t === TILE.PLAZA || t === TILE.DOOR;
  const inFoot = (px: number, py: number): boolean => overlap(px, py, 1, 1, x, y, bw, bh);
  if (!inb(w, start.x, start.y) || inFoot(start.x, start.y)) return null;
  if (isRoad(getT(w, start.x, start.y))) return [];
  const st = getT(w, start.x, start.y);
  if ((st !== TILE.GRASS && st !== TILE.SAND) || covered(w, start.x, start.y)) return null;
  const key = (p: Pt): number => p.y * w.W + p.x;
  const prev = new Map<number, number>([[key(start), -1]]);
  let frontier: Pt[] = [start];
  for (let step = 0; step < HOUSE_ROAD_MAX && frontier.length; step++) {
    const next: Pt[] = [];
    for (const p of frontier) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const q = { x: p.x + dx, y: p.y + dy };
        if (!inb(w, q.x, q.y) || inFoot(q.x, q.y) || prev.has(key(q))) continue;
        const t = getT(w, q.x, q.y);
        if (isRoad(t)) {
          const out: Pt[] = [];
          let c = key(p);
          while (c !== -1) {
            out.push({ x: c % w.W, y: (c / w.W) | 0 });
            c = prev.get(c) ?? -1;
          }
          return out.reverse();
        }
        if ((t === TILE.GRASS || t === TILE.SAND) && !covered(w, q.x, q.y)) {
          prev.set(key(q), key(p));
          next.push(q);
        }
      }
    }
    frontier = next;
  }
  return null;
}

/** kind 를 (x, y)(왼쪽 위)에 문 방향 side 로 놓을 수 있는가 (SPEC 4.2). */
export function checkPlace(
  w: World,
  kind: BuildKind,
  x: number,
  y: number,
  side: Side = 's',
): PlaceCheck {
  const def = BUILDABLES[kind];
  const no = (reason: string): PlaceCheck => ({ ok: false, reason, road: [] });
  if (x < 1 || y < 1 || x + def.w > w.W - 1 || y + def.h > w.H - 1)
    return no('지도 가장자리에는 놓을 수 없어요');
  for (let yy = y; yy < y + def.h; yy++)
    for (let xx = x; xx < x + def.w; xx++) {
      const g = groundOf(getT(w, xx, yy));
      if (!g || !def.ground.includes(g)) {
        const t = getT(w, xx, yy);
        return no(
          t === TILE.PATH || t === TILE.PLAZA
            ? '길 위에는 놓을 수 없어요'
            : t === TILE.WATER
              ? '물 위에는 놓을 수 없어요'
              : t === TILE.FOREST
                ? '숲에는 놓을 수 없어요'
                : '빈 풀밭에만 놓을 수 있어요',
        );
      }
      if (covered(w, xx, yy)) return no('이미 다른 것이 있어요');
    }
  if (kind === 'house') {
    const road = roadFor(w, x, y, def.w, def.h, side);
    if (!road) return no(`문 앞에서 ${HOUSE_ROAD_MAX}칸 안에 길이 있어야 해요 (R 로 문 방향)`);
    return { ok: true, reason: '', road };
  }
  return { ok: true, reason: '', road: [] };
}

/** 청사진을 놓는다. 길·나무는 바로 생긴다. 놓았으면 청사진 id(즉시 생긴 것은 -1), 아니면 이유. */
export function placeBlueprint(
  w: World,
  kind: BuildKind,
  x: number,
  y: number,
  side: Side = 's',
): PlaceCheck & { id: number | null } {
  const chk = checkPlace(w, kind, x, y, side);
  if (!chk.ok) return { ...chk, id: null };
  const def = BUILDABLES[kind];
  if (kind === 'road') {
    setT(w, x, y, TILE.PATH);
    w.staticVersion++;
    recomputeLocations(w);
    return { ...chk, id: -1 };
  }
  if (kind === 'tree') {
    setT(w, x, y, TILE.FOREST);
    w.treesPlanted++;
    w.staticVersion++;
    recomputeLocations(w);
    return { ...chk, id: -1 };
  }
  const bp: Blueprint = {
    id: newId(w),
    kind,
    x,
    y,
    w: def.w,
    h: def.h,
    side,
    need: def.lumber,
    got: 0,
    workLeft: def.work,
    workTotal: def.work,
    road: chk.road,
    placedAt: w.t,
    startedAt: null,
  };
  if (kind === 'house')
    for (let yy = y; yy < y + def.h; yy++)
      for (let xx = x; xx < x + def.w; xx++) setT(w, xx, yy, TILE.SITE);
  w.blueprints.push(bp);
  w.staticVersion++;
  if (kind === 'house') recomputeLocations(w);
  return { ...chk, id: bp.id };
}

/** 청사진 id → 청사진. */
export function siteById(w: World, id: number | null): Blueprint | undefined {
  return id == null ? undefined : w.blueprints.find((b) => b.id === id);
}

/** 받은 목재 비율만큼만 지을 수 있다. 지금 더 지을 수 있는가. */
function canWork(bp: Blueprint): boolean {
  const done = 1 - bp.workLeft / bp.workTotal;
  const maxDone = bp.need > 0 ? bp.got / bp.need : 1;
  return done < maxDone - 1e-6;
}

/** 이 청사진으로 나르는 중인 목재(주민 등짐에서 센다). */
function incomingOf(w: World, bp: Blueprint): number {
  let n = 0;
  for (const o of w.vs)
    if (o.pack && o.pack.kind === 'lumber' && o.pack.site === bp.id) n += o.pack.n;
  return n;
}

/** 아직 날라야 할 목재. */
function lumberToBring(w: World, bp: Blueprint): number {
  return bp.need - bp.got - incomingOf(w, bp);
}

/** 이 청사진에 붙은 목수 수(v 는 빼고 센다). */
function workersOn(w: World, bp: Blueprint, except: Villager | null): number {
  let n = 0;
  for (const o of w.vs) if (o !== except && o.act && o.act.site === bp.id) n++;
  return n;
}

/** 목수가 할 공사 일이 있는가(목재가 있거나 망치질할 수 있다). */
export function hasCarpentryWork(w: World): boolean {
  return w.blueprints.some((bp) => canWork(bp) || (lumberToBring(w, bp) > 0 && w.lumber > 0));
}

/** 공사장 바로 둘레에서 설 칸 하나(지나갈 수 있는 칸). */
function workSpot(w: World, bp: Blueprint): Pt {
  const ring: Pt[] = [];
  for (let yy = bp.y - 1; yy <= bp.y + bp.h; yy++)
    for (let xx = bp.x - 1; xx <= bp.x + bp.w; xx++) {
      const inside = xx >= bp.x && xx < bp.x + bp.w && yy >= bp.y && yy < bp.y + bp.h;
      if (!inside && passableTile(getT(w, xx, yy))) ring.push({ x: xx, y: yy });
    }
  return w.rng.pick(ring) ?? { x: bp.x, y: bp.y };
}

/** 여러 사람 이름 링크를 잇고 마지막 이름에 맞는 조사를 붙인다. */
function namesJ(vs: readonly Villager[], a: string, b: string): string {
  const last = vs[vs.length - 1];
  if (!last) return '';
  return [...vs.slice(0, -1).map((o) => NV(o)), NJ(last, a, b)].join(', ');
}

/** 목수에게 공사 일을 준다: 목재 가지러 가기, 공사장에 내려놓기, 망치질. 할 일이 없으면 null. */
export function carpenterAct(w: World, v: Villager): Act | null {
  const yard = bldKind(w, 'yard');
  // 등에 목재가 있으면 먼저 공사장으로 나른다.
  if (v.pack && v.pack.kind === 'lumber' && v.pack.n > 0) {
    let bp = siteById(w, v.pack.site);
    if (!bp) {
      bp = w.blueprints.find((b) => lumberToBring(w, b) > 0);
      if (bp) v.pack.site = bp.id;
    }
    if (bp) return mk(w, 'deliver', { dest: workSpot(w, bp), dur: 1, site: bp.id });
    return null;
  }
  // 작은 장식을 먼저 짓는다(놓자마자 금방 생기는 기쁨). 같은 종류끼리는 놓은 순서.
  const order = [
    ...w.blueprints.filter((b) => b.kind !== 'house'),
    ...w.blueprints.filter((b) => b.kind === 'house'),
  ];
  for (const bp of order) {
    const def = BUILDABLES[bp.kind];
    if (workersOn(w, bp, v) >= def.maxWorkers) continue;
    const building = w.vs.some(
      (o) => o !== v && o.act && o.act.site === bp.id && o.act.type === 'build',
    );
    const fetching = w.vs.filter(
      (o) => o !== v && o.act && o.act.site === bp.id && o.act.type === 'fetch',
    ).length;
    const bring = lumberToBring(w, bp) > fetching * LUMBER.carryMax && w.lumber > 0;
    if (bring && (!canWork(bp) || building))
      return mk(w, 'fetch', { dest: frontOf(yard), dur: 1, site: bp.id });
    if (canWork(bp)) {
      const spot = workSpot(w, bp);
      const cx = bp.x + bp.w / 2 - 0.5;
      const cy = bp.y + bp.h / 2 - 0.5;
      const fx = cx - spot.x;
      const fy = cy - spot.y;
      const d = Math.hypot(fx, fy) || 1;
      return mk(w, 'build', { dest: spot, dur: 600, site: bp.id, face: { x: fx / d, y: fy / d } });
    }
  }
  return null;
}

/** 공사 행동이 목적지에 닿았을 때(가져오기·내려놓기·망치질 시작). */
export function arriveSite(w: World, v: Villager, a: Act): void {
  const bp = siteById(w, a.site);
  if (a.type === 'fetch') {
    a.until = w.t;
    if (!bp) return;
    const n = Math.min(LUMBER.carryMax, lumberToBring(w, bp), w.lumber);
    if (n <= 0) return;
    w.lumber -= n;
    v.pack = { kind: 'lumber', n, site: bp.id };
    startAct(w, v, mk(w, 'deliver', { dest: workSpot(w, bp), dur: 1, site: bp.id }));
    return;
  }
  if (a.type === 'deliver') {
    a.until = w.t;
    if (!bp || !v.pack || v.pack.kind !== 'lumber') return;
    const n = v.pack.n;
    const take = Math.min(n, bp.need - bp.got);
    bp.got += take;
    w.lumber += n - take;
    v.pack = null;
    w.out.push({ type: 'siteFx', x: bp.x + bp.w / 2, y: bp.y + bp.h / 2, fx: 'build' });
    return;
  }
  // build
  if (!bp) {
    a.until = w.t;
    return;
  }
  if (bp.startedAt == null) {
    bp.startedAt = w.t;
    const def = BUILDABLES[bp.kind];
    log(
      w,
      `🔨 목수 ${NJ(v, '가', '이')} 새 ${J(def.label, '를', '을')} 짓기 시작했다.`,
      [v],
      'build',
    );
    diary(w, v, `새 ${def.label} 공사를 시작했다. 잘 지어야지 🔨`);
  }
}

/** 망치질 한 틱. 끝났으면 true (완성·목재 부족·퇴근). */
export function buildTick(w: World, v: Villager, a: Act, h: number): boolean {
  const bp = siteById(w, a.site);
  if (!bp || !workHours(v, h)) return true;
  if (!canWork(bp)) return true;
  const rate =
    v.trait === '일벌레'
      ? LUMBER.workRateWorkaholic
      : v.trait === '게으름뱅이'
        ? LUMBER.workRateLazy
        : LUMBER.workRate;
  bp.workLeft -= rate;
  v.energy -= 0.03;
  if (bp.workLeft <= 0) {
    completeBlueprint(w, bp, v);
    return true;
  }
  return false;
}

/** 다 지은 집 수(번지 이름용). */
function nextHouseNo(w: World): number {
  return w.buildings.filter((b) => b.kind === 'house').length + 1;
}

/** 청사진을 완성한다. 집은 건물이 되고, 장식은 장식이 된다. */
export function completeBlueprint(w: World, bp: Blueprint, by: Villager | null): void {
  w.blueprints = w.blueprints.filter((b) => b !== bp);
  const builders = w.vs.filter((o) => o.act && o.act.site === bp.id);
  if (by && !builders.includes(by)) builders.push(by);
  const def = BUILDABLES[bp.kind];
  if (bp.kind === 'house') {
    for (let yy = bp.y; yy < bp.y + bp.h; yy++)
      for (let xx = bp.x; xx < bp.x + bp.w; xx++) setT(w, xx, yy, TILE.BLD);
    const door = doorOf(bp.x, bp.y, bp.w, bp.h, bp.side);
    setT(w, door.x, door.y, TILE.DOOR);
    for (const p of bp.road) setT(w, p.x, p.y, TILE.PATH);
    const no = nextHouseNo(w);
    const b: Building = {
      id: bp.id,
      kind: 'house',
      x: bp.x,
      y: bp.y,
      w: bp.w,
      h: bp.h,
      side: bp.side,
      door,
      name: `${no}번지`,
      residents: [],
      bread: 0,
      variant: no,
      playerBuilt: true,
      builtAt: w.t,
    };
    w.buildings.push(b);
    reindexBuildings(w);
    recomputeLocations(w);
    log(
      w,
      `🏠 새 집 ${J(b.name, '가', '이')} 다 지어졌다! ${builders.length ? `${builders.map((o) => NV(o)).join(', ')}의 솜씨다. ` : ''}이제 두 사람이 더 살 수 있다.`,
      builders,
      'build',
    );
  } else if (bp.kind === 'bench' || bp.kind === 'lamp' || bp.kind === 'flowerbed') {
    const d: Decor = {
      id: bp.id,
      kind: bp.kind,
      x: bp.x,
      y: bp.y,
      w: bp.w,
      h: bp.h,
      playerBuilt: true,
      builtAt: w.t,
      firstUse: null,
    };
    w.decor.push(d);
    log(
      w,
      `${def.e} 새 ${J(def.label, '가', '이')} 생겼다.${builders.length ? ` ${namesJ(builders, '가', '이')} 만들었다.` : ''}`,
      builders,
      'build',
    );
  }
  for (const o of builders) {
    diary(w, o, `${J(def.label, '를', '을')} 다 지었다! 뿌듯하다 ${def.e}`);
    emote(w, o, '✨', 20);
  }
  w.out.push({ type: 'siteFx', x: bp.x + bp.w / 2, y: bp.y + bp.h / 2, fx: 'done' });
  w.staticVersion++;
}

/** (x, y) 에 있는 플레이어가 놓은 것을 치운다 (SPEC 4.1). */
export function removeAt(w: World, x: number, y: number): { ok: boolean; reason: string } {
  const bp = w.blueprints.find((b) => overlap(x, y, 1, 1, b.x, b.y, b.w, b.h));
  if (bp) {
    w.blueprints = w.blueprints.filter((b) => b !== bp);
    w.lumber += bp.got;
    if (bp.kind === 'house')
      for (let yy = bp.y; yy < bp.y + bp.h; yy++)
        for (let xx = bp.x; xx < bp.x + bp.w; xx++) setT(w, xx, yy, TILE.GRASS);
    for (const o of w.vs) {
      if (o.act && o.act.site === bp.id) o.act = null;
      if (o.pack && o.pack.site === bp.id) o.pack.site = null;
    }
    w.staticVersion++;
    recomputeLocations(w);
    return { ok: true, reason: '' };
  }
  const d = w.decor.find((e) => overlap(x, y, 1, 1, e.x, e.y, e.w, e.h));
  if (d) {
    if (!d.playerBuilt) return { ok: false, reason: '처음부터 있던 것은 치울 수 없어요' };
    w.decor = w.decor.filter((e) => e !== d);
    w.lumber += Math.floor(BUILDABLES[d.kind].lumber * REFUND_DONE);
    for (const o of w.vs) if (o.act && o.act.decor === d.id) o.act.decor = null;
    w.staticVersion++;
    return { ok: true, reason: '' };
  }
  const b = w.buildings.find((e) => overlap(x, y, 1, 1, e.x, e.y, e.w, e.h));
  if (b) {
    if (!b.playerBuilt) return { ok: false, reason: '처음부터 있던 건물은 치울 수 없어요' };
    if (b.residents.length) return { ok: false, reason: '사람이 사는 집은 치울 수 없어요' };
    w.buildings = w.buildings.filter((e) => e !== b);
    reindexBuildings(w);
    for (let yy = b.y; yy < b.y + b.h; yy++)
      for (let xx = b.x; xx < b.x + b.w; xx++) setT(w, xx, yy, TILE.GRASS);
    w.lumber += Math.floor(BUILDABLES.house.lumber * REFUND_DONE);
    w.staticVersion++;
    recomputeLocations(w);
    return { ok: true, reason: '' };
  }
  return { ok: false, reason: '치울 것이 없어요' };
}

/** 장식을 쓴다. 플레이어가 지은 장식을 처음 쓰면 소식을 남긴다. */
export function useDecor(w: World, v: Villager, id: number): void {
  const d = w.decor.find((e) => e.id === id);
  if (!d || !d.playerBuilt) return;
  const name = DECOR_NAME[d.kind];
  if (d.firstUse == null) {
    d.firstUse = w.t;
    emote(w, v, '😊', 30);
    const what =
      d.kind === 'bench'
        ? `새 벤치에 처음 앉았다`
        : d.kind === 'flowerbed'
          ? `새 꽃밭을 처음 거닐었다`
          : `새 등불 아래에서 처음 수다를 떨었다`;
    log(w, `${BUILDABLES[d.kind].e} ${NJ(v, '가', '이')} ${what}.`, [v], 'build');
    diary(
      w,
      v,
      d.kind === 'bench'
        ? '새로 생긴 벤치에 앉아 봤다. 여기 좋다 😊'
        : d.kind === 'flowerbed'
          ? '새 꽃밭에 꽃이 한가득이다 🌷'
          : '새 등불 아래가 아늑하다 🏮',
    );
    return;
  }
  if (w.rng.next() < 0.2)
    diary(
      w,
      v,
      d.kind === 'bench'
        ? `${name}에 앉아 쉬었다 🪑`
        : d.kind === 'flowerbed'
          ? `꽃밭에서 꽃향기를 맡았다 🌸`
          : `등불 아래에서 이야기를 나눴다 🏮`,
    );
}

/** 마을 매력 = 분수 + 장식 + 심은 나무 (SPEC 4.1). */
export function charmOf(w: World): number {
  let c = BASE_CHARM.fountain + w.treesPlanted * BUILDABLES.tree.charm;
  for (const d of w.decor) c += BUILDABLES[d.kind].charm;
  return Math.round(c * 10) / 10;
}

/** 시험·명령용: 청사진 하나를 즉시 완성한다. */
export function finishNow(w: World, id: number): boolean {
  const bp = siteById(w, id);
  if (!bp) return false;
  bp.got = bp.need;
  bp.workLeft = 0;
  completeBlueprint(w, bp, null);
  return true;
}

/** 새 주민이 목수를 맡을지 판단할 때 쓴다(남은 청사진 수). */
export function openSites(w: World): number {
  return w.blueprints.length;
}
