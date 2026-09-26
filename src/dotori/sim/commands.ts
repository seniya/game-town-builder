// UI 가 부르는 명령: 생각 심기 세 가지, 가꾸기(놓기·치우기). World 를 바꾸는 유일한 바깥 입구다.
import type { BuildKind } from '../data/buildables';
import type { Side } from '../data/villageMap';
import { nudge } from './act';
import { placeBlueprint, removeAt, type PlaceCheck } from './build';
import { schedParty } from './events';
import { rumor } from './social';
import { computeStats } from './stats';
import { J, NV } from './text';
import type { Villager, World } from './types';
import { aff, diary, log, vil } from './world';

/** 고백 상대 후보: 짝사랑 상대, 없으면 가장 호감 가는 짝 없는 이웃. */
export function loveTarget(w: World, v: Villager): Villager | null {
  if (v.crush != null) return vil(w, v.crush);
  const c = w.vs
    .filter((o) => o !== v && o.partner == null)
    .sort((a, b) => aff(w, v, b) - aff(w, v, a));
  return c[0] ?? null;
}

/** 생각 심기 기록을 소식에 남긴다. */
function plantLog(w: World, v: Villager, txt: string): void {
  log(w, `🌱 당신이 ${NV(v)}의 마음에 생각 하나를 심었다: ${txt}`, [v], 'plant');
}

/** "광장에서 파티를 열고 싶어" — 이미 파티가 있으면 false. */
export function plantParty(w: World, v: Villager): boolean {
  if (w.party) return false;
  schedParty(w, v, true);
  plantLog(w, v, '"광장에서 파티를 열고 싶어!"');
  nudge(w, v);
  return true;
}

/** "좋아하는 사람에게 고백하고 싶어" — 짝이 있거나 상대가 없으면 false. */
export function plantLove(w: World, v: Villager): boolean {
  const t = loveTarget(w, v);
  if (!t || v.partner != null) return false;
  v.crush = t.id;
  v.confess = t.id;
  plantLog(w, v, `"${J(t.name, '에게', '에게')} 마음을 전하고 싶어."`);
  diary(w, v, `${J(t.name, '에게', '에게')} 고백할 거다. 떨린다…`);
  nudge(w, v);
  return true;
}

/** "숲에 유령이 나온대" 소문을 퍼뜨린다. 이미 도는 유령 소문이 있으면 false. */
export function plantGhost(w: World, v: Villager): boolean {
  if (w.rumors.some((r) => r.kind === 'ghost' && r.active && r.juicy > 0.3)) return false;
  rumor(w, v, 'ghost', '숲에 밤마다 유령이 나온대', '👻', 0.9);
  plantLog(w, v, '"숲에 밤마다 유령이 나온대!"');
  diary(w, v, '숲에서 유령을 본 것 같다… 👻 다들한테 말해야지');
  if (v.trait === '겁쟁이') v.fearGhost = true;
  nudge(w, v);
  return true;
}

/** 가꾸기: 놓는다. */
export function place(
  w: World,
  kind: BuildKind,
  x: number,
  y: number,
  side: Side,
): PlaceCheck & { id: number | null } {
  const r = placeBlueprint(w, kind, x, y, side);
  if (r.ok) computeStats(w);
  return r;
}

/** 가꾸기: 치운다. */
export function remove(w: World, x: number, y: number): { ok: boolean; reason: string } {
  const r = removeAt(w, x, y);
  if (r.ok) computeStats(w);
  return r;
}
