// 가꾸기·목재·이사·치우기·저장 시험 (TASKS DOT-010~015·017).
import { describe, expect, it } from 'vitest';
import { newWorld } from '../../src/dotori/sim/create';
import { place, remove } from '../../src/dotori/sim/commands';
import { checkPlace, charmOf, finishNow } from '../../src/dotori/sim/build';
import { arrivalCheck, spawnNewcomer, vacantHouse } from '../../src/dotori/sim/arrival';
import { deserialize, serialize } from '../../src/dotori/sim/save';
import { getT } from '../../src/dotori/sim/map';
import { run } from '../../src/dotori/sim/step';
import { TILE } from '../../src/dotori/sim/types';

const SEED = 20260926;

/** null·undefined 가 아님을 확인하고 값을 돌려준다. */
function must<T>(x: T | null | undefined): T {
  expect(x).toBeDefined();
  expect(x).not.toBeNull();
  return x as T;
}

describe('놓기 검사 (SPEC 4.2)', () => {
  it('길·물·숲·가장자리·겹침은 거절하고 이유를 준다', () => {
    const w = newWorld(SEED);
    expect(checkPlace(w, 'bench', 31, 20).reason).toContain('길');
    expect(checkPlace(w, 'bench', 53, 31).reason).toContain('물');
    expect(checkPlace(w, 'bench', 0, 30).reason).toContain('가장자리');
    expect(checkPlace(w, 'bench', 5, 5).ok).toBe(false);
    expect(place(w, 'bench', 45, 22, 's').ok).toBe(true);
    expect(checkPlace(w, 'lamp', 45, 22).reason).toContain('이미');
  });

  it('집은 문 앞에서 12 칸 안에 길이 있어야 한다', () => {
    const w = newWorld(SEED);
    const ok = checkPlace(w, 'house', 50, 21, 's');
    expect(ok.ok).toBe(true);
    expect(ok.road.length).toBeGreaterThan(0);
    const far = checkPlace(w, 'house', 6, 37, 's');
    expect(far.ok).toBe(false);
  });

  it('길과 나무는 바로 생긴다', () => {
    const w = newWorld(SEED);
    expect(place(w, 'road', 45, 25, 's').ok).toBe(true);
    expect(getT(w, 45, 25)).toBe(TILE.PATH);
    const c0 = charmOf(w);
    expect(place(w, 'tree', 46, 26, 's').ok).toBe(true);
    expect(getT(w, 46, 26)).toBe(TILE.FOREST);
    expect(charmOf(w)).toBeGreaterThan(c0);
  });
});

describe('목재와 짓기 (SPEC 4.3)', () => {
  it('나무꾼이 하루 동안 야적장에 목재를 쌓는다', () => {
    const w = newWorld(SEED);
    const start = w.lumber;
    run(w, 1440);
    expect(w.lumber).toBeGreaterThan(start + 10);
  });

  it('집 청사진은 목재가 있으면 이틀 안에 완성되고 소식이 남는다', () => {
    const w = newWorld(SEED);
    const r = place(w, 'house', 50, 21, 's');
    expect(r.ok).toBe(true);
    for (let x = 50; x < 53; x++) expect(getT(w, x, 22)).toBe(TILE.SITE);
    const houses0 = w.buildings.filter((b) => b.kind === 'house').length;
    run(w, 2880);
    expect(w.blueprints.length).toBe(0);
    expect(w.buildings.filter((b) => b.kind === 'house').length).toBe(houses0 + 1);
    expect(w.feed.some((e) => e.kind === 'build' && e.html.includes('다 지어졌다'))).toBe(true);
    for (const p of r.road) expect(getT(w, p.x, p.y)).toBe(TILE.PATH);
  });

  it('벤치를 지으면 누군가 하루 안에 처음 앉는다', () => {
    const w = newWorld(SEED);
    place(w, 'bench', 45, 22, 's');
    run(w, 1440 + 600);
    const d = w.decor.find((e) => e.playerBuilt && e.kind === 'bench');
    expect(d).toBeDefined();
    expect(d?.firstUse).not.toBeNull();
  });
});

describe('이사 (SPEC 4.4)', () => {
  it('빈 집이 없으면 이사 오지 않는다', () => {
    const w = newWorld(SEED);
    expect(vacantHouse(w)).toBeUndefined();
    expect(arrivalCheck(w).reason).toBe('noHouse');
  });

  it('집이 완성되면 새 주민이 입구에서 걸어와 집에 들어가고 이웃이 인사한다', () => {
    const w = newWorld(SEED);
    const r = place(w, 'house', 50, 21, 's');
    finishNow(w, r.id as number);
    const home = vacantHouse(w);
    expect(home).toBeDefined();
    const nv = spawnNewcomer(w, must(home));
    expect(nv.pack?.kind).toBe('bag');
    expect(w.vs.some((o) => o.welcome === nv.id)).toBe(true);
    run(w, 600);
    expect(nv.inside != null || nv.act?.type !== 'movein').toBe(true);
    run(w, 900);
    expect(w.feed.some((e) => e.kind === 'arrive' && e.html.includes('인사'))).toBe(true);
  });
});

describe('치우기 (SPEC 4.1)', () => {
  it('청사진은 받은 목재를 돌려주고, 처음 건물·사는 집은 치우지 않는다', () => {
    const w = newWorld(SEED);
    const r = place(w, 'house', 50, 21, 's');
    expect(r.ok).toBe(true);
    expect(remove(w, 51, 22).ok).toBe(true);
    expect(getT(w, 51, 22)).toBe(TILE.GRASS);
    expect(remove(w, 17, 6).reason).toContain('처음');
    const r2 = place(w, 'house', 50, 21, 's');
    finishNow(w, r2.id as number);
    const home = must(vacantHouse(w));
    spawnNewcomer(w, home);
    expect(remove(w, 51, 22).reason).toContain('사는 집');
  });
});

describe('저장 (SPEC 6)', () => {
  it('저장했다 불러와 이어서 돌리면 저장 안 한 쪽과 같은 결과가 나온다', () => {
    const a = newWorld(SEED);
    place(a, 'house', 50, 21, 's');
    place(a, 'bench', 45, 22, 's');
    run(a, 700);
    const b = must(deserialize(serialize(a)));
    run(a, 900);
    run(b, 900);
    expect(b.feed[0]?.html).toBe(a.feed[0]?.html);
    expect(b.vs.map((v) => [v.x, v.y])).toEqual(a.vs.map((v) => [v.x, v.y]));
    expect(b.lumber).toBe(a.lumber);
  });

  it('판이 다르거나 깨진 저장은 null', () => {
    expect(deserialize('{"version":99}')).toBeNull();
    expect(deserialize('not json')).toBeNull();
  });
});
