// 새 마을 만들기: 지형 → 건물 → 장식 → 주민 → 처음 인연 → 첫날 파티 계획 (SPEC 2·3.1).
import { START } from '../data/balance';
import {
  MORE_NAMES,
  NAME_SYLLABLES_A,
  NAME_SYLLABLES_B,
  NAMES,
  PANTS,
  SKINS,
  START_JOBS,
  TRAIT_NAMES,
  UMBRELLAS,
  type JobName,
  type TraitName,
} from '../data/people';
import { START_BENCHES, START_BUILDINGS, START_LAMPS, MAP_H, MAP_W } from '../data/villageMap';
import { Affinity } from './affinity';
import { schedParty } from './events';
import { getT, paintTerrain, recomputeLocations, scatterTrees, setT } from './map';
import { Rng } from './rng';
import { NJ, NV } from './text';
import type { Building, Villager, World } from './types';
import { TILE } from './types';
import { doorOf, log, pairFlag, reindexBuildings, sideDir, vil } from './world';
import { computeStats } from './stats';

/** 빈 World 껍데기(지형·주민 없음). 저장 불러오기도 이것에서 시작한다. */
export function emptyWorld(seed: number, W = MAP_W, H = MAP_H): World {
  return {
    seed,
    rng: new Rng(seed),
    t: 0,
    W,
    H,
    tiles: new Uint8Array(W * H),
    buildings: [],
    decor: [],
    blueprints: [],
    nextId: 1,
    vs: [],
    aff: new Affinity(32),
    rumors: [],
    rid: 0,
    convs: [],
    cid: 0,
    feed: [],
    flags: new Set(),
    weather: { rain: false, until: 0 },
    party: null,
    lastPartyCame: null,
    daily: {},
    lumber: 0,
    namesUsed: 0,
    arrivalsToday: 0,
    treesPlanted: 0,
    staticVersion: 1,
    stats: { pop: 0, beds: 0, happy: 0, charm: 0, lumber: 0, sites: 0 },
    L: {
      farm: [],
      forest: [],
      forestEdge: [],
      shore: [],
      plaza: [],
      terrace: [],
      grass: [],
      water: [],
    },
    forestDist: new Uint8Array(W * H),
    bmap: new Map(),
    out: [],
    pathBudget: 0,
  };
}

/** 처음 건물을 놓는다. 문에서 길까지 최대 6 칸을 길로 잇는다(시험판). */
function placeStartBuildings(w: World): void {
  let houseNo = 0;
  for (const s of START_BUILDINGS) {
    for (let yy = s.y - 1; yy <= s.y + s.h; yy++)
      for (let xx = s.x - 1; xx <= s.x + s.w; xx++)
        if (getT(w, xx, yy) === TILE.FOREST) setT(w, xx, yy, TILE.GRASS);
    for (let yy = s.y; yy < s.y + s.h; yy++)
      for (let xx = s.x; xx < s.x + s.w; xx++) setT(w, xx, yy, TILE.BLD);
    const door = doorOf(s.x, s.y, s.w, s.h, s.side);
    setT(w, door.x, door.y, TILE.DOOR);
    const d = sideDir(s.side);
    let ox = door.x + d.x;
    let oy = door.y + d.y;
    for (let steps = 0; steps < 6; steps++) {
      const t = getT(w, ox, oy);
      if (t === TILE.PATH || t === TILE.PLAZA || t === TILE.WATER) break;
      setT(w, ox, oy, TILE.PATH);
      ox += d.x;
      oy += d.y;
    }
    if (s.kind === 'house') houseNo++;
    const b: Building = {
      id: w.nextId++,
      kind: s.kind,
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      side: s.side,
      door,
      name: s.name ?? `${houseNo}번지`,
      residents: [],
      bread: 0,
      variant: s.kind === 'house' ? houseNo : 0,
      playerBuilt: false,
      builtAt: 0,
    };
    w.buildings.push(b);
  }
  reindexBuildings(w);
}

/** 처음 벤치와 등불. */
function placeStartDecor(w: World): void {
  for (const [x, y] of START_BENCHES)
    w.decor.push({
      id: w.nextId++,
      kind: 'bench',
      x,
      y,
      w: 1,
      h: 1,
      playerBuilt: false,
      builtAt: 0,
      firstUse: 0,
    });
  for (const [x, y] of START_LAMPS)
    w.decor.push({
      id: w.nextId++,
      kind: 'lamp',
      x,
      y,
      w: 1,
      h: 1,
      playerBuilt: false,
      builtAt: 0,
      firstUse: 0,
    });
}

/** 다음 새 이름. 처음 목록 → 이사 목록 → 숫자 붙이기. */
export function nextName(w: World, used: ReadonlySet<string>): string {
  const all = [...NAMES, ...MORE_NAMES];
  for (let i = 0; i < all.length; i++) {
    const n = all[(w.namesUsed + i) % all.length] as string;
    if (!used.has(n)) {
      w.namesUsed++;
      return n;
    }
  }
  // 목록을 다 썼다: 두 음절을 잇는다(순서대로 훑어 쓰지 않은 이름).
  const A = NAME_SYLLABLES_A;
  const B = NAME_SYLLABLES_B;
  for (let i = 0; i < A.length * B.length; i++) {
    const k = (w.namesUsed * 7 + i) % (A.length * B.length);
    const n = `${A[k % A.length] ?? ''}${B[Math.floor(k / A.length)] ?? ''}`;
    if (!used.has(n)) {
      w.namesUsed++;
      return n;
    }
  }
  w.namesUsed++;
  return `도토리${w.namesUsed}`;
}

/** 주민 한 명을 만든다(처음 주민·새 주민 공용). 호감표 용량도 늘린다. */
export function makeVillager(
  w: World,
  name: string,
  trait: TraitName,
  job: JobName,
  home: Building,
  x: number,
  y: number,
): Villager {
  const R = w.rng;
  const id = w.vs.length;
  const v: Villager = {
    id,
    name,
    trait,
    job,
    home: home.id,
    x,
    y,
    px: x,
    py: y,
    path: [],
    pi: 0,
    act: null,
    inside: null,
    dir: { x: 0, y: 1 },
    hunger: R.int(55, 90),
    energy: R.int(70, 95),
    social: R.int(40, 80),
    fun: R.int(40, 80),
    crush: null,
    partner: null,
    confess: null,
    welcome: null,
    fearGhost: false,
    hunting: false,
    diary: [],
    talk: null,
    nextTalk: 0,
    bubble: null,
    offx: (R.next() - 0.5) * 0.44,
    offy: (R.next() - 0.5) * 0.44,
    walk: R.next() * 6,
    sleepH:
      trait === '파티광'
        ? 25
        : trait === '일벌레'
          ? 21.5
          : trait === '게으름뱅이'
            ? 22.5
            : 22 + R.next() * 0.8,
    wakeH:
      trait === '일벌레'
        ? 5
        : trait === '게으름뱅이'
          ? 9.5
          : trait === '파티광'
            ? 8.5
            : 6 + R.next(),
    daily: {},
    carry: null,
    pack: null,
    look: {
      skin: R.pick(SKINS) ?? '#FAD4B4',
      pants: R.pick(PANTS) ?? '#4F5D75',
      umb: R.pick(UMBRELLAS) ?? '#FFD166',
      model: id % 12,
    },
    arrivedAt: w.t,
  };
  home.residents.push(id);
  w.vs.push(v);
  w.aff.ensure(w.vs.length);
  // 처음 호감: 같은 집은 22~34, 다른 사람은 대략 -27~27 (시험판 분포).
  for (const o of w.vs) {
    if (o === v) continue;
    const same = o.home === v.home;
    w.aff.set(v.id, o.id, same ? 22 + R.next() * 12 : (R.next() + R.next() + R.next() - 1.5) * 18);
    w.aff.set(o.id, v.id, same ? 22 + R.next() * 12 : (R.next() + R.next() + R.next() - 1.5) * 18);
  }
  return v;
}

export interface NewWorldOptions {
  /** 처음 주민 수(기본 SPEC 3.1 의 20 명). 집이 모자라면 한 집에 여럿이 산다. */
  residents?: number;
}

/** 시드로 새 마을을 만든다. */
export function newWorld(seed: number, opts: NewWorldOptions = {}): World {
  const w = emptyWorld(seed);
  paintTerrain(w);
  placeStartBuildings(w);
  scatterTrees(w);
  placeStartDecor(w);
  recomputeLocations(w);
  w.t = 7 * 60;
  w.lumber = START.lumber;
  const N = opts.residents ?? START.residents;
  const R = w.rng;
  const traits: TraitName[] = [];
  for (let i = 0; i < N; i++) traits.push(TRAIT_NAMES[i % TRAIT_NAMES.length] as TraitName);
  R.shuffle(traits);
  const jobs: JobName[] = [];
  for (let i = 0; i < N; i++) jobs.push(START_JOBS[i % START_JOBS.length] as JobName);
  R.shuffle(jobs);
  const houses = R.shuffle(w.buildings.filter((b) => b.kind === 'house'));
  const used = new Set<string>();
  const shuffledNames = R.shuffle([...NAMES]);
  for (let i = 0; i < N; i++) {
    const home = houses[Math.floor(i / 2) % houses.length] as Building;
    const name = i < shuffledNames.length ? (shuffledNames[i] as string) : nextName(w, used);
    used.add(name);
    const v = makeVillager(
      w,
      name,
      traits[i] as TraitName,
      jobs[i] as JobName,
      home,
      home.door.x + 0.5,
      home.door.y + 0.5,
    );
    v.inside = home.id;
  }
  w.namesUsed = 0;
  // 처음 인연(시험판): 커플 한 쌍, 앙숙 한 쌍, 로맨티스트의 짝사랑.
  const vs = w.vs;
  const c1 = vs[2];
  const c2 = vs[9];
  if (c1 && c2 && c1.home !== c2.home) {
    c1.partner = c2.id;
    c2.partner = c1.id;
    w.aff.set(c1.id, c2.id, 75);
    w.aff.set(c2.id, c1.id, 72);
    pairFlag(w, c1, c2, 'couple');
  }
  const e1 = vs[5];
  const e2 = vs[17];
  if (e1 && e2) {
    w.aff.set(e1.id, e2.id, -50);
    w.aff.set(e2.id, e1.id, -45);
    pairFlag(w, e1, e2, 'enemy');
  }
  const s1 = vs.find((v) => v.trait === '로맨티스트' && v.partner == null);
  const s2 = s1 ? vs.find((v) => v !== s1 && v.partner == null && v.home !== s1.home) : undefined;
  if (s1 && s2) {
    s1.crush = s2.id;
    w.aff.set(s1.id, s2.id, 55);
  }
  log(w, '☀️ 1일째 아침. 도토리 마을에 해가 떴다.', [], 'day');
  const c = vs.find((v) => v.partner != null);
  if (c && c.partner != null)
    log(
      w,
      `💑 ${NJ(c, '와', '과')} ${NV(vil(w, c.partner))}, 마을이 다 아는 커플.`,
      [c, vil(w, c.partner)],
      'love',
    );
  const cr = vs.find((v) => v.crush != null);
  if (cr && cr.crush != null)
    log(
      w,
      `💘 로맨티스트 ${NJ(cr, '는', '은')} ${NV(vil(w, cr.crush))}에게 마음이 있다. 본인만 안다고 생각하지만.`,
      [cr, vil(w, cr.crush)],
      'love',
    );
  const host = vs.find((v) => v.trait === '파티광');
  if (host) schedParty(w, host, false);
  w.out.length = 0;
  computeStats(w);
  return w;
}
