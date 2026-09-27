// 계절과 축제 시험 (TASKS DOT-052, SPEC 12.4·12.5).
import { describe, expect, it } from 'vitest';
import { FESTIVAL } from '../../src/dotori/data/seasons';
import { newWorld } from '../../src/dotori/sim/create';
import { schedParty } from '../../src/dotori/sim/events';
import { deserialize, serialize } from '../../src/dotori/sim/save';
import { isSnow, seasonDay, seasonOf, yearOf } from '../../src/dotori/sim/season';
import { run, step } from '../../src/dotori/sim/step';
import type { World } from '../../src/dotori/sim/types';

const SEED = 20260926;
const DAY = 1440;

/** 지금 잡힌 잔치(시험에서 w.party = null 뒤 좁혀진 형을 풀려고 함수로 읽는다). */
function partyOf(w: World): World['party'] {
  return w.party;
}

/** d 일째 06:00 직전까지 돌린다(처음은 1 일째 07:00). */
function runToMorning(w: World, d: number): void {
  const target = (d - 1) * DAY + 6 * 60 - 1;
  run(w, target - w.t);
}

describe('계절 달력', () => {
  it('28 일 한 해를 7 일씩 봄·여름·가을·겨울로 나눈다', () => {
    const at = (d: number): string => seasonOf((d - 1) * DAY + 600).id;
    expect([at(1), at(7), at(8), at(14), at(15), at(21), at(22), at(28), at(29)]).toEqual([
      'spring',
      'spring',
      'summer',
      'summer',
      'autumn',
      'autumn',
      'winter',
      'winter',
      'spring',
    ]);
    expect(seasonDay(10 * DAY)).toBe(4);
    expect(yearOf(28 * DAY)).toBe(1);
  });

  it('계절 첫날 아침에 소식이 뜬다', () => {
    const w = newWorld(SEED);
    runToMorning(w, 8);
    step(w);
    expect(w.feed.some((f) => f.html.includes('여름이 왔다'))).toBe(true);
  });

  it('겨울의 비는 눈이다', () => {
    const w = newWorld(SEED);
    w.t = 23 * DAY + 600;
    w.weather.rain = true;
    expect(isSnow(w)).toBe(true);
    w.t = 3 * DAY + 600;
    expect(isSnow(w)).toBe(false);
  });
});

describe('축제', () => {
  it('봄 넷째 날에 꽃잔치가 열리고 모든 주민이 안다', () => {
    const w = newWorld(SEED);
    w.party = null;
    runToMorning(w, 4);
    w.party = null;
    step(w);
    const P = partyOf(w);
    expect(P?.festival).toBe('flower');
    expect(P?.start).toBe(3 * DAY + FESTIVAL.startMinute);
    const r = w.rumors.find((x) => x.id === P?.rumor);
    expect(r?.knowers.size).toBe(w.vs.length);
  });

  it('끝나면 신문 기록·즐거움·첫 축제 기억이 남는다', () => {
    const w = newWorld(SEED);
    runToMorning(w, 4);
    w.party = null;
    step(w);
    run(w, FESTIVAL.startMinute + FESTIVAL.duration - 6 * 60 + 5);
    expect(w.party).toBeNull();
    const rec = w.week.festivals[0];
    expect(rec?.id).toBe('flower');
    expect(rec?.came ?? 0).toBeGreaterThan(w.vs.length / 3);
    expect(w.vs.some((v) => v.memories.some((m) => m.text === '첫 꽃잔치에 간 날'))).toBe(true);
    expect(w.feed.some((f) => f.html.includes('꽃잔치가 끝났다'))).toBe(true);
  });

  it('신문 머리기사는 결혼이 없으면 축제다', () => {
    const w = newWorld(SEED);
    runToMorning(w, 4);
    w.party = null;
    step(w);
    run(w, 7 * DAY - w.t + 20 * 60 + 1);
    const p = w.papers[0];
    expect(p).toBeDefined();
    if (w.week && p && !p.headline.startsWith('💍')) expect(p.headline).toContain('꽃잔치');
    expect(p?.items.some((s) => s.includes('꽃잔치'))).toBe(true);
  });

  it('파티가 잡혀 있으면 하루 미루고, 한 해에 한 번만 연다', () => {
    const w = newWorld(SEED);
    runToMorning(w, 4);
    const host = w.vs[0];
    if (!host) throw new Error('주민 없음');
    w.party = null;
    schedParty(w, host, true);
    step(w);
    expect(partyOf(w)?.festival).toBeUndefined();
    expect(partyOf(w)).not.toBeNull();
    expect(w.feed.some((f) => f.html.includes('하루 미뤄졌다'))).toBe(true);
    // 파티가 끝난 다음 날 아침에 연다.
    run(w, DAY);
    expect(partyOf(w)?.festival).toBe('flower');
    const held = w.festivalsHeld.length;
    run(w, DAY);
    expect(w.festivalsHeld.length).toBe(held);
  });

  it('저장 왕복에서 축제와 연 기록이 이어진다', () => {
    const w = newWorld(SEED);
    runToMorning(w, 4);
    w.party = null;
    step(w);
    const b = deserialize(serialize(w));
    expect(b?.party?.festival).toBe('flower');
    expect(b?.festivalsHeld).toEqual(w.festivalsHeld);
    expect(b?.week.festivals).toEqual([]);
  });

  it('한 해(28 일)를 돌려도 오류 없이 네 축제가 열린다', () => {
    const w = newWorld(SEED);
    run(w, 28 * DAY);
    expect(w.festivalsHeld.map((k) => k.split('-')[1])).toEqual([
      'flower',
      'stars',
      'harvest',
      'lantern',
    ]);
  });
});
