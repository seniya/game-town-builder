// 새 주민의 이사와 이웃의 인사 (SPEC 4.4·4.5).
import { ARRIVAL, TIME } from '../data/balance';
import {
  JOB_NAMES,
  JOB_TARGET_SHARE,
  TRAIT_NAMES,
  TRAITS,
  type JobName,
  type TraitName,
} from '../data/people';
import { ENTRANCE } from '../data/villageMap';
import { startAct } from './act';
import { makeVillager, nextName } from './create';
import { mk } from './decide';
import { computeStats } from './stats';
import { J, NJ } from './text';
import type { Building, Villager, World } from './types';
import { diary, log, vil } from './world';

/** 빈 자리가 있는 집(먼저 지어진 집부터). */
export function vacantHouse(w: World): Building | undefined {
  return w.buildings
    .filter((b) => b.kind === 'house' && b.residents.length < ARRIVAL.perHouse)
    .sort((a, b) => a.builtAt - b.builtAt || a.id - b.id)[0];
}

/** 지금 가장 적은 성격 중 하나. */
function rareTrait(w: World): TraitName {
  const count = new Map<TraitName, number>(TRAIT_NAMES.map((t) => [t, 0]));
  for (const v of w.vs) count.set(v.trait, (count.get(v.trait) ?? 0) + 1);
  const min = Math.min(...count.values());
  const pool = TRAIT_NAMES.filter((t) => count.get(t) === min);
  return w.rng.pick(pool) ?? '수다쟁이';
}

/** 새 주민의 직업 (SPEC 4.5). */
function jobForNewcomer(w: World): JobName {
  const pop = w.vs.length + 1;
  const carp = w.vs.filter((v) => v.job === '목수').length;
  if (w.blueprints.length > 0 && carp < pop / 6) return '목수';
  let best: JobName = '한량';
  let gap = -Infinity;
  for (const j of JOB_NAMES) {
    const have = w.vs.filter((v) => v.job === j).length;
    const g = JOB_TARGET_SHARE[j] * pop - have;
    if (g > gap) {
      gap = g;
      best = j;
    }
  }
  return best;
}

/** 새 주민에게 인사하러 갈 이웃을 고른다(같은 집 먼저, 수다쟁이·파티광 우선). */
function pickWelcomers(w: World, nv: Villager): void {
  const [lo, hi] = ARRIVAL.welcomers;
  const want = w.rng.int(lo, hi);
  const mates = w.vs.filter((o) => o !== nv && o.home === nv.home);
  const friendly = w.vs.filter(
    (o) => o !== nv && o.home !== nv.home && (o.trait === '수다쟁이' || o.trait === '파티광'),
  );
  const others = w.rng.shuffle(
    w.vs.filter(
      (o) => o !== nv && !mates.includes(o) && !friendly.includes(o) && o.trait !== '외톨이',
    ),
  );
  const pool = [...mates, ...w.rng.shuffle(friendly), ...others];
  for (const o of pool.slice(0, want + mates.length)) o.welcome = nv.id;
}

/** 이사 조건 (SPEC 4.4). 들어올 수 있으면 빈 집, 아니면 모자란 이유. */
export function arrivalCheck(w: World): {
  home: Building | null;
  reason: 'ok' | 'noHouse' | 'unhappy' | 'charm' | 'limit';
} {
  computeStats(w);
  if (w.arrivalsToday >= ARRIVAL.maxPerDay) return { home: null, reason: 'limit' };
  const home = vacantHouse(w);
  if (!home) return { home: null, reason: 'noHouse' };
  if (w.stats.happy < ARRIVAL.minHappiness) return { home: null, reason: 'unhappy' };
  if (w.stats.charm < w.vs.length * ARRIVAL.charmPerResident)
    return { home: null, reason: 'charm' };
  return { home, reason: 'ok' };
}

/** 새 주민 한 명을 입구에 세우고 집으로 걸어가게 한다. */
export function spawnNewcomer(w: World, home: Building): Villager {
  const name = nextName(w, new Set(w.vs.map((v) => v.name)));
  const trait = rareTrait(w);
  const job = jobForNewcomer(w);
  const v = makeVillager(w, name, trait, job, home, ENTRANCE.x + 0.5, ENTRANCE.y + 0.5);
  v.pack = { kind: 'bag', n: 1, site: null };
  v.hunger = w.rng.int(70, 90);
  v.energy = w.rng.int(70, 90);
  w.arrivalsToday++;
  diary(w, v, `도토리 마을에 이사 왔다. ${home.name}이 내 집이래! 두근두근 🧳`);
  log(
    w,
    `🧳 새 주민 ${NJ(v, '가', '이')} 마을에 왔다. ${TRAITS[trait].e} ${trait}, ${job}. ${J(home.name, '로', '으로')} 이사 온대!`,
    [v],
    'arrive',
  );
  for (const id of home.residents) {
    if (id === v.id) continue;
    diary(w, vil(w, id), `${J(v.name, '가', '이')} 우리 집에 같이 살게 됐다 🏠`);
  }
  pickWelcomers(w, v);
  startAct(w, v, mk(w, 'movein', { bld: home.id, dur: 45 }));
  return v;
}

/** 이사 확인 시각이면 조건을 보고 새 주민을 들인다. 매력만 모자라면 하루 한 번 알린다. */
export function arrivalTick(w: World): void {
  const m = w.t % 1440;
  if (!TIME.arrivalMinutes.includes(m)) return;
  const chk = arrivalCheck(w);
  if (chk.home) {
    spawnNewcomer(w, chk.home);
    return;
  }
  if (chk.reason === 'charm' && !w.daily.charmHint) {
    w.daily.charmHint = true;
    log(w, '🌷 "꽃과 벤치가 더 있으면 이사 오고 싶다" 는 사람이 있다는 소문이다.', [], 'arrive');
  }
}
