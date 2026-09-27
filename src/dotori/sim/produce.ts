// 생산 사슬 (SPEC 9, ADR 050): 작물 자람, 농부의 거두기·심기·가꾸기, 방앗간, 제빵사의 밀가루 나르기와 굽기,
// 어부의 생선, 등짐 내려놓기. 재고는 건물에 있고, 사람이 등짐으로 나른다.
import { FOOD, PRODUCE } from '../data/balance';
import { PAPER } from '../data/story';
import { mk } from './decide';
import { getT } from './map';
import type { Act, Building, FoodLevel, PackKind, Pt, Villager, World } from './types';
import { TILE } from './types';
import { bldKind, diary, dist, emote, frontOf, log } from './world';
import { NJ } from './text';

/** 방앗간·빵집·주점. */
export const mill = (w: World): Building => bldKind(w, 'mill');
export const bakery = (w: World): Building => bldKind(w, 'bakery');
export const tavern = (w: World): Building => bldKind(w, 'tavern');

/** 칸 번호. */
const idx = (w: World, p: Pt): number => p.y * w.W + p.x;

/** 작물을 한 칸 정한다(단계·자람 초기화). */
export function setCrop(w: World, x: number, y: number, stage: number): void {
  const i = y * w.W + x;
  w.crop[i] = stage;
  w.growth[i] = 0;
  w.cropVersion++;
}

/** 틱마다(모아서): 1~3 단계 작물이 자란다. 비가 오면 빨리 자란다. */
export function growthTick(w: World): void {
  if (w.t % PRODUCE.growEvery !== 0) return;
  const add = Math.round(PRODUCE.growEvery * (w.weather.rain ? PRODUCE.rainGrowth : 1));
  let changed = false;
  for (const f of w.L.farm) {
    const i = idx(w, f);
    const st = w.crop[i] ?? 0;
    if (st < 1 || st >= PRODUCE.ripe) continue;
    const g = (w.growth[i] ?? 0) + add;
    if (g >= PRODUCE.stageTicks) {
      w.crop[i] = st + 1;
      w.growth[i] = 0;
      changed = true;
    } else w.growth[i] = g;
  }
  if (changed) w.cropVersion++;
}

/** 틱마다: 방앗간이 밀을 밀가루로 빻는다. */
export function millTick(w: World): void {
  if (w.t % PRODUCE.millEvery !== 0) return;
  const m = mill(w);
  if (m.wheat >= 1 && m.flour < PRODUCE.millFlourCap) {
    m.wheat -= 1;
    m.flour += 1;
  }
}

/** 조건에 맞는 밭 칸 중 가장 가까운 칸. 다른 농부가 가고 있는 칸은 피한다(밭은 수백 칸이라 전부 훑는다). */
function nearestField(w: World, v: Villager, pred: (stage: number) => boolean): Pt | null {
  const taken = new Set<number>();
  for (const o of w.vs)
    if (o !== v && o.act && o.act.type === 'work' && o.act.dest && o.job === '농부')
      taken.add(idx(w, o.act.dest));
  let best: Pt | null = null;
  let bd = Infinity;
  for (const f of w.L.farm) {
    const i = idx(w, f);
    if (!pred(w.crop[i] ?? 0) || taken.has(i)) continue;
    const d = Math.abs(f.x + 0.5 - v.x) + Math.abs(f.y + 0.5 - v.y);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

/** 익은 칸이 있는가(농부 일 점수). */
export function hasRipe(w: World): boolean {
  return w.L.farm.some((f) => (w.crop[idx(w, f)] ?? 0) >= PRODUCE.ripe);
}

/** 농부의 다음 밭일: 거두기 > 심기 > 가꾸기 (SPEC 9.2). */
export function farmerAct(w: World, v: Villager, prefer: Act['where'] = null): Act | null {
  if (!w.L.farm.length) return null;
  const millFull = mill(w).wheat >= PRODUCE.millWheatCap;
  const face = { x: w.rng.next() < 0.5 ? 1 : -1, y: 0 };
  // 빈 밭(새로 일군 밭)이 있으면 가끔 심기부터 한다. 이어서 일할 때는 하던 일을 계속한다.
  const wantPlant = prefer === 'plant' || (prefer == null && w.rng.next() < PRODUCE.plantChance);
  const empty = wantPlant ? nearestField(w, v, (st) => st === 0) : null;
  if (empty) return mk(w, 'work', { dest: empty, dur: PRODUCE.plantTicks, where: 'plant', face });
  const ripe = millFull ? null : nearestField(w, v, (st) => st >= PRODUCE.ripe);
  if (ripe) return mk(w, 'work', { dest: ripe, dur: PRODUCE.harvestTicks, where: 'harvest', face });
  const empty2 = nearestField(w, v, (st) => st === 0);
  if (empty2) return mk(w, 'work', { dest: empty2, dur: PRODUCE.plantTicks, where: 'plant', face });
  const any =
    nearestField(w, v, (st) => st >= 1 && st < PRODUCE.ripe) ?? w.rng.pick(w.L.farm) ?? null;
  return mk(w, 'work', { dest: any, dur: PRODUCE.tendTicks, where: 'tend', face });
}

/** 밭일을 마쳤을 때 칸에 결과를 남긴다. */
export function finishFarmWork(w: World, v: Villager, a: Act): void {
  const x = Math.floor(v.x);
  const y = Math.floor(v.y);
  if (getT(w, x, y) !== TILE.FARM) return;
  const i = y * w.W + x;
  const st = w.crop[i] ?? 0;
  if (a.where === 'harvest' && st >= PRODUCE.ripe) {
    // 거두고 그 자리에 바로 다시 심는다(빈 밭이 늘지 않게).
    setCrop(w, x, y, 1);
    if (!v.pack || v.pack.kind !== 'wheat') v.pack = { kind: 'wheat', n: 0, site: null };
    v.pack.n += 1;
    w.tally.wheat += 1;
    if (w.tally.wheat === 1 || w.tally.wheat % 50 === 0)
      log(
        w,
        `🌾 ${NJ(v, '가', '이')} 누렇게 익은 밀을 거뒀다. 올해 거둔 밀 ${w.tally.wheat} 단.`,
        [v],
        'work',
      );
  } else if (a.where === 'plant' && st === 0) setCrop(w, x, y, 1);
  else if (a.where === 'tend' && st >= 1 && st < PRODUCE.ripe)
    w.growth[i] = (w.growth[i] ?? 0) + PRODUCE.tendBoost;
}

/** 제빵사의 다음 일: 밀가루가 모자라면 방앗간에서 가져오고, 아니면 굽는다 (SPEC 9.4). */
export function bakerAct(w: World, v: Villager, dur: number): Act {
  const b = bakery(w);
  const m = mill(w);
  const someoneFetching = w.vs.some((o) => o !== v && o.act && o.act.where === 'flour');
  if (b.flour < PRODUCE.flourLow && m.flour >= 1 && !someoneFetching)
    return mk(w, 'fetch', { dest: frontOf(m), dur: 1, where: 'flour' });
  return mk(w, 'work', { bld: b.id, dur });
}

/**
 * 제빵사가 빵집에서 일하는 한 틱: 밀가루로 빵을 굽는다.
 * 밀가루가 모자라고 방앗간에 밀가루가 있으면 true(일을 끝내고 가지러 간다, SPEC 9.4).
 */
export function bakeTick(w: World, v: Villager): boolean {
  if (w.t % PRODUCE.bakeEvery !== 0) return false;
  const b = bakery(w);
  if (b.bread >= PRODUCE.breadCap) return false;
  if (b.flour >= PRODUCE.flourPerBread) {
    b.flour -= PRODUCE.flourPerBread;
    b.bread += 1;
    w.tally.bread += 1;
    return false;
  }
  if (mill(w).flour >= 1) return true;
  if (!w.daily.flourOut) {
    w.daily.flourOut = true;
    log(
      w,
      `🥖 빵집에 밀가루가 떨어졌다. 제빵사 ${NJ(v, '가', '이')} 방앗간 쪽을 바라본다.`,
      [v],
      'funny',
    );
    diary(w, v, '밀가루가 없어서 빵을 못 구웠다… 😣');
  }
  return false;
}

/** 먹거리(빵집 빵 + 주점 생선)와 여유 단계 (SPEC 10.2). */
export function foodOf(w: World): { food: number; level: FoodLevel } {
  const food = Math.floor(bakery(w).bread) + Math.floor(tavern(w).fish);
  const per = food / Math.max(1, w.vs.length);
  const level: FoodLevel =
    per < FOOD.tightBelow ? 'tight' : per >= FOOD.plentyFrom ? 'plenty' : 'ok';
  return { food, level };
}

/** 어부가 일하는 한 틱: 가끔 생선을 잡아 등짐에 넣는다. 등짐이 차면 true(일을 끝낸다). */
export function fishTick(w: World, v: Villager): boolean {
  if (w.t % PRODUCE.fishEvery !== 0 || w.rng.next() >= PRODUCE.fishChance) return false;
  emote(w, v, '🐟', 12);
  if (!v.pack || v.pack.kind !== 'fish') v.pack = { kind: 'fish', n: 0, site: null };
  // 가끔 월척이 걸린다(SPEC 11.4): 생선을 더 얻고 신문 기삿거리가 된다.
  const big = w.rng.next() < PAPER.bigFishChance;
  const n = big ? 1 + PAPER.bigFishBonus : 1;
  v.pack.n += n;
  w.tally.fish += n;
  if (big) {
    w.week.bigFish.push(v.id);
    emote(w, v, '🎣', 40);
    diary(w, v, '월척이다! 이렇게 큰 물고기는 처음이야 🎣');
    log(w, `🎣 ${NJ(v, '가', '이')} 팔뚝만 한 월척을 낚았다!`, [v], 'find');
  }
  return v.pack.n >= PRODUCE.fishPack;
}

/** 방앗간에서 밀가루를 받아 등에 진다. 빵집으로 가는 행동을 돌려준다(받을 것이 없으면 null). */
export function takeFlour(w: World, v: Villager): Act | null {
  const m = mill(w);
  const n = Math.min(PRODUCE.flourCarry, Math.floor(m.flour));
  if (n <= 0) return null;
  m.flour -= n;
  v.pack = { kind: 'flour', n, site: null };
  return mk(w, 'haul', { dest: frontOf(bakery(w)), dur: 1 });
}

/** 등짐을 내려놓을 건물(종류별). 목재는 야적장. */
export function dropTarget(w: World, kind: PackKind): Building | null {
  switch (kind) {
    case 'lumber':
      return bldKind(w, 'yard');
    case 'wheat':
      return mill(w);
    case 'flour':
      return bakery(w);
    case 'fish':
      return tavern(w);
    case 'bag':
      return null;
  }
}

/** 등짐을 건물 재고에 내려놓는다. 내려놓은 수를 돌려준다. */
export function dropPack(w: World, v: Villager): number {
  const p = v.pack;
  if (!p || p.kind === 'bag') return 0;
  const n = p.n;
  switch (p.kind) {
    case 'lumber':
      w.lumber += n;
      break;
    case 'wheat':
      mill(w).wheat += n;
      break;
    case 'flour':
      bakery(w).flour += n;
      break;
    case 'fish': {
      const t = tavern(w);
      t.fish = Math.min(PRODUCE.fishCap, t.fish + n);
      break;
    }
  }
  v.pack = null;
  return n;
}

/** 저녁상 후보 점수(0 이면 후보 아님, SPEC 9.5). */
export function supperScore(w: World, v: Villager, h: number): number {
  if (h < PRODUCE.supperFrom || h >= PRODUCE.supperTo || v.hunger >= PRODUCE.supperMaxHunger)
    return 0;
  const t = tavern(w);
  if (t.fish < 1 || dist(v, t.door) > PRODUCE.tavernMaxDist) return 0;
  return Math.pow(1 - v.hunger / 100, 1.4) * 2.6 + 0.6;
}
