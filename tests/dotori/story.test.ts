// 이야기가 쌓이는 마을 시험 (TASKS DOT-040~044, SPEC 11).
import { describe, expect, it } from 'vitest';
import { BIRTHDAY, MARRIAGE } from '../../src/dotori/data/story';
import { checkPlace } from '../../src/dotori/sim/build';
import { place } from '../../src/dotori/sim/commands';
import { newWorld } from '../../src/dotori/sim/create';
import { marry, morningProposals, nestTick } from '../../src/dotori/sim/family';
import { deserialize, serialize } from '../../src/dotori/sim/save';
import { dayOfYear, remember } from '../../src/dotori/sim/story';
import { run, step } from '../../src/dotori/sim/step';
import type { Villager, World } from '../../src/dotori/sim/types';

const SEED = 20260926;

/** n 틱 돌리며 주민마다 새로 생긴 일기 줄을 모은다(일기는 14 줄에서 잘리므로). */
function runDiaries(w: World, n: number): string[][] {
  const all: string[][] = w.vs.map(() => []);
  for (let i = 0; i < n; i++) {
    step(w);
    w.vs.forEach((v, k) => {
      const list = (all[k] ??= []);
      for (const e of v.diary.filter((d) => d.t === w.t).reverse()) list.push(e.text);
    });
  }
  return all;
}

/** 첫 커플(처음 마을에 1 쌍). */
function firstCouple(w: World): [Villager, Villager] {
  const a = w.vs.find((v) => v.partner != null && v.partner > v.id);
  if (!a || a.partner == null) throw new Error('커플이 없다');
  const b = w.vs[a.partner];
  if (!b) throw new Error('짝이 없다');
  return [a, b];
}

/** 집 청사진 하나를 놓고 다 지어질 때까지 돌린다. 지은 집 id. */
function buildHouse(w: World): number {
  w.lumber = 200;
  for (let y = 22; y < 48; y += 4)
    for (let x = 44; x < 76; x += 4)
      if (checkPlace(w, 'house', x, y, 's').ok && place(w, 'house', x, y, 's').ok) {
        const id = w.blueprints[w.blueprints.length - 1]?.id;
        for (let i = 0; i < 1440 * 3 && w.blueprints.some((b) => b.id === id); i++) step(w);
        return id ?? -1;
      }
  throw new Error('집을 놓지 못했다');
}

describe('기억 (SPEC 11.1, DOT-040)', () => {
  it('함께한 기억을 남기고, 며칠 뒤 대화나 아침에 "그때" 를 꺼낸다', () => {
    const w = newWorld(SEED);
    // 모든 주민에게 사흘 전 서로 인사한 기억을 심는다(이웃마다 하나).
    w.t = 1440 * 3;
    for (const v of w.vs)
      for (const o of w.vs)
        if (o !== v && Math.abs(o.id - v.id) <= 3) {
          v.memories.unshift({
            t: 0,
            kind: 'meet',
            with: o.id,
            text: `${o.name}와 처음 인사한 날`,
          });
        }
    const all = runDiaries(w, 1440 * 2).flat();
    expect(
      all.some((s) => s.includes('그때') || s.includes('떠올랐다') || s.includes('생각났다')),
    ).toBe(true);
  });

  it('기억은 12 개를 넘지 않는다', () => {
    const w = newWorld(SEED);
    const v = w.vs[0];
    if (!v) throw new Error('주민 없음');
    for (let i = 0; i < 20; i++) remember(w, v, 'party', null, `파티 ${i} 에 간 날`);
    expect(v.memories.length).toBe(12);
    expect(v.memories[0]?.text).toBe('파티 19 에 간 날');
  });

  it('새 커플이 생기면 두 사람이 사귄 날을 기억한다(10 일)', () => {
    const w = newWorld(777);
    run(w, 1440 * 10);
    const withCouple = w.vs.filter((v) => v.memories.some((m) => m.kind === 'couple'));
    const totalMem = w.vs.reduce((s, v) => s + v.memories.length, 0);
    expect(totalMem).toBeGreaterThan(10);
    expect(withCouple.length % 2).toBe(0);
  }, 30000);
});

describe('결혼과 한 집 살림 (SPEC 11.2, DOT-041)', () => {
  it('오래 사귄 커플이 청혼하고 저녁 결혼식 뒤 부부가 된다', () => {
    const w = newWorld(SEED);
    const [a, b] = firstCouple(w);
    w.party = null;
    a.coupledAt = b.coupledAt = w.t - MARRIAGE.minTogether - 1;
    w.aff.set(a.id, b.id, 95);
    w.aff.set(b.id, a.id, 95);
    for (let i = 0; i < 40 && !w.party; i++) morningProposals(w);
    expect((w.party as World['party'])?.wedding).toEqual([a.id, b.id]);
    run(w, 1440);
    expect(a.married && b.married).toBe(true);
    expect(w.feed.some((e) => e.html.includes('부부가 됐다'))).toBe(true);
    expect(a.memories.some((m) => m.kind === 'wedding')).toBe(true);
  });

  it('부부는 빈 집으로 함께 옮기고, 떠난 두 집에 빈 자리가 생긴다', () => {
    const w = newWorld(SEED);
    const [a, b] = firstCouple(w);
    if (a.home === b.home) {
      // 같은 집이면 다른 집 주민과 짝을 바꿔 따로 살게 한다.
      const other = w.vs.find((v) => v.home !== a.home && v.partner == null);
      if (!other) throw new Error('다른 집 주민 없음');
      b.partner = null;
      a.partner = other.id;
      other.partner = a.id;
    }
    const p = w.vs[a.partner ?? -1];
    if (!p) throw new Error('짝 없음');
    const oldA = a.home;
    const oldP = p.home;
    const house = buildHouse(w);
    const empty = w.buildings.find((x) => x.id === house);
    expect(empty?.residents.length).toBe(0);
    marry(w, a, p, []);
    expect(a.home).toBe(house);
    expect(p.home).toBe(house);
    for (const id of [oldA, oldP])
      expect(w.buildings.find((x) => x.id === id)?.residents.length).toBeLessThan(2);
  }, 30000);

  it('빈 집이 없으면 신혼집을 찾는다는 소식을 남긴다', () => {
    const w = newWorld(SEED);
    const [a, b] = firstCouple(w);
    const other = w.vs.find((v) => v.home !== a.home && v !== b);
    if (!other) throw new Error('다른 주민 없음');
    b.partner = null;
    a.partner = other.id;
    other.partner = a.id;
    a.married = other.married = true;
    nestTick(w);
    expect(w.feed.some((e) => e.html.includes('신혼집을 찾는다'))).toBe(true);
  });
});

describe('생일 (SPEC 11.3, DOT-042)', () => {
  it('생일에 친한 이웃이 축하하러 오고 저녁에 소식이 남는다', () => {
    const w = newWorld(SEED);
    const v = w.vs[3];
    if (!v) throw new Error('주민 없음');
    v.birthday = dayOfYear(w.t + 1440);
    for (const o of w.vs) if (o !== v) w.aff.set(o.id, v.id, BIRTHDAY.friendAff + 10);
    run(w, 1440 + 20 * 60 - (w.t % 1440) + 1);
    expect(w.feed.some((e) => e.html.includes('의 생일!'))).toBe(true);
    const summary = w.feed.find((e) => e.html.includes('명이 축하하러 왔다'));
    expect(summary).toBeDefined();
  });
});

describe('도토리 신문 (SPEC 11.4, DOT-043)', () => {
  it('7 일째 저녁에 신문이 나오고 한 주의 빵·밀·생선이 실린다', () => {
    const w = newWorld(SEED);
    let got = false;
    for (let i = 0; i < 1440 * 7 && !got; i++) {
      step(w);
      if (w.out.some((e) => e.type === 'paper')) got = true;
      w.out.length = 0;
    }
    expect(got).toBe(true);
    const p = w.papers[0];
    expect(p?.no).toBe(1);
    expect(p?.headline.length).toBeGreaterThan(3);
    expect(p?.items.some((s) => s.startsWith('🥖 빵'))).toBe(true);
    expect(p?.items.some((s) => s.startsWith('🌾 밀'))).toBe(true);
  }, 30000);
});

describe('문장 늘리기 (SPEC 11.5, DOT-044)', () => {
  it('5 일 동안 바로 앞과 같은 일기 줄이 바꾸기 전(60 줄)의 절반 이하다', () => {
    const w = newWorld(SEED);
    const all = runDiaries(w, 1440 * 5);
    let same = 0;
    let total = 0;
    for (const list of all)
      for (let i = 0; i < list.length; i++) {
        total++;
        if (i > 0 && list[i] === list[i - 1]) same++;
      }
    expect(total).toBeGreaterThan(500);
    expect(same).toBeLessThanOrEqual(30);
  }, 30000);
});

describe('저장 (SPEC 11.6)', () => {
  it('기억·생일·부부·신문이 왕복하고, 예전 저장도 읽는다', () => {
    const w = newWorld(SEED);
    run(w, 1440 * 7 + 60);
    const b = deserialize(serialize(w));
    if (!b) throw new Error('불러오기 실패');
    expect(b.papers.length).toBe(w.papers.length);
    expect(b.vs.map((v) => v.memories.length)).toEqual(w.vs.map((v) => v.memories.length));
    expect(b.vs.map((v) => v.birthday)).toEqual(w.vs.map((v) => v.birthday));
    const raw = JSON.parse(serialize(w)) as { vs: Record<string, unknown>[]; papers?: unknown };
    for (const v of raw.vs) {
      delete v.memories;
      delete v.birthday;
      delete v.married;
    }
    delete raw.papers;
    const old = deserialize(JSON.stringify(raw));
    expect(old?.vs.every((v) => Array.isArray(v.memories) && v.birthday >= 1)).toBe(true);
    expect(old?.papers).toEqual([]);
  }, 30000);
});
