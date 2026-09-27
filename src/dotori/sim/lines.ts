// 문장 고르기 (SPEC 11.5): 성격별 묶음에서 고르고, 같은 주민의 최근 일기와 겹치지 않게 한다.
import { LINE_POOLS, type LineKey, type LinePool } from '../data/lines';
import { LINES } from '../data/story';
import type { Villager, World } from './types';

/** 묶음 key 에서 v 에게 맞는 문장 하나를 골라 {자리} 를 채운다. */
export function say(
  w: World,
  v: Villager,
  key: LineKey,
  vars: Readonly<Record<string, string | number>> = {},
): string {
  const pool: LinePool = LINE_POOLS[key];
  const cands = [...pool.common, ...(pool[v.trait] ?? [])].map((s) =>
    s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')),
  );
  const recent = new Set(v.diary.slice(0, LINES.avoidRecent).map((e) => e.text));
  const fresh = cands.filter((s) => !recent.has(s));
  return w.rng.pick(fresh.length ? fresh : cands) ?? cands[0] ?? '';
}
