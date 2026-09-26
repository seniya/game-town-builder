// 행동의 시작·이동·도착·진행·끝 (시험판 규칙 + 가꾸기·이사 행동, SPEC 3.3·4.3·4.4).
import { BAKERY, LUMBER, NEEDS } from '../data/balance';
import { FINDS } from '../data/people';
import { arriveSite, buildTick, useDecor } from './build';
import { decide, mk } from './decide';
import { getT, neighborDir, passable, tileCost } from './map';
import { findPath } from './path';
import { rumor, startConv } from './social';
import { J, NJ, NV } from './text';
import type { Act, Villager, World } from './types';
import { TILE } from './types';
import { addAff, bld, bldKind, diary, dist, emote, inSleep, log, vil, workHours } from './world';

/** 행동을 시작한다. 건물 안에 있으면 먼저 문으로 나온다. 경로 예산이 없으면 다음 틱에 경로를 구한다. */
export function startAct(w: World, v: Villager, act: Act): void {
  if (act.bld != null && act.bld === v.inside) {
    act.phase = 'do';
    act.until = w.t + act.dur;
    v.act = act;
    return;
  }
  if (v.inside != null) {
    const b = bld(w, v.inside);
    v.inside = null;
    if (b) {
      v.x = v.px = b.door.x + 0.5;
      v.y = v.py = b.door.y + 0.5;
    }
  }
  v.act = act;
  v.path = [];
  v.pi = 0;
  if (act.target != null) {
    act.repath = 0;
    return;
  }
  planPath(w, v, act);
}

/** 행동 목적지까지 경로를 구한다. 예산이 모자라면 needPath 를 켜 둔다. */
function planPath(w: World, v: Villager, act: Act): void {
  const b = bld(w, act.bld);
  const d = b ? b.door : act.dest;
  if (!d) {
    v.act = mk(w, 'idle', { phase: 'do', until: w.t + 10 });
    return;
  }
  const p = findPath(w, Math.floor(v.x), Math.floor(v.y), d.x, d.y);
  if (p === 'busy') {
    act.needPath = true;
    return;
  }
  act.needPath = false;
  if (!p) {
    v.act = mk(w, 'idle', { phase: 'do', until: w.t + 10 });
    return;
  }
  v.path = p;
  v.pi = 0;
  if (p.length === 0) arrive(w, v);
}

/** 목적지에 닿았다. 행동별로 한 번 일어나는 일을 한다. */
function arrive(w: World, v: Villager): void {
  const a = v.act;
  if (!a) return;
  const R = w.rng;
  const b = bld(w, a.bld);
  if (b) {
    v.inside = b.id;
    v.x = v.px = b.door.x + 0.5;
    v.y = v.py = b.door.y + 0.5;
  }
  a.phase = 'do';
  a.until = w.t + a.dur;
  if (!b) {
    const tx = Math.floor(v.x);
    const ty = Math.floor(v.y);
    const nb = (pred: (t: number) => boolean): ReturnType<typeof neighborDir> =>
      neighborDir(w, tx, ty, pred);
    if ((a.type === 'work' && v.job === '어부') || (a.type === 'fun' && a.where === 'shore'))
      a.face = nb((t) => t === TILE.WATER) ?? { x: 1, y: 0 };
    else if (
      (a.type === 'work' && v.job === '나무꾼') ||
      a.type === 'hunt' ||
      (a.type === 'fun' && a.where === 'forest')
    )
      a.face = nb((t) => t === TILE.FOREST) ?? { x: 1, y: 0 };
    else if (a.type === 'work' && v.job === '목수') a.face = { x: 0, y: 1 };
    else if (a.type === 'work' && v.job === '농부') a.face = { x: R.next() < 0.5 ? 1 : -1, y: 0 };
    else if (a.type === 'fun' && a.where === 'bench') a.face = { x: 0, y: 1 };
  }
  switch (a.type) {
    case 'eat':
      if (a.where === 'bakery') {
        const bakery = bldKind(w, 'bakery');
        const take = v.trait === '먹보' ? 3 : 1;
        bakery.bread = Math.max(0, bakery.bread - take);
        diary(
          w,
          v,
          v.trait === '먹보'
            ? '빵집에서 빵을 세 개나 먹었다 🍞🍞🍞'
            : '빵집에서 갓 구운 빵을 먹었다 🍞',
        );
        if (v.trait === '먹보' || R.next() < 0.2)
          v.carry = { item: 'bread', until: w.t + a.dur + 40 };
        if (bakery.bread === 0 && !w.daily.breadOut) {
          w.daily.breadOut = true;
          if (v.trait === '먹보') {
            log(
              w,
              `🍞 빵집 빵이 동났다! 마지막 빵을 먹은 건 먹보 ${NV(v)}. 제빵사들 표정이 굳었다.`,
              [v],
              'funny',
            );
            for (const o of w.vs) if (o.job === '제빵사') addAff(w, o, v, -12);
            rumor(w, v, 'bread', `${J(v.name, '가', '이')} 빵을 싹쓸이했대`, '🍞', 0.6, [v.id]);
          } else log(w, '🍞 빵집 빵이 동났다.', [], 'funny');
        }
      } else diary(w, v, '집에서 밥을 먹었다 🍚');
      break;
    case 'nap':
      if (!v.daily.napLog) {
        v.daily.napLog = true;
        const t = getT(w, Math.floor(v.x), Math.floor(v.y));
        if (t === TILE.PATH || t === TILE.PLAZA)
          log(
            w,
            `😪 게으름뱅이 ${NJ(v, '가', '이')} ${t === TILE.PLAZA ? '광장' : '길'} 한복판에 드러누워 낮잠을 잔다.`,
            [v],
            'funny',
          );
      }
      diary(w, v, '졸려서 그냥 누웠다 😪');
      break;
    case 'raindance':
      if (!w.weather.rain) {
        a.until = w.t;
        break;
      }
      log(w, `💃 로맨티스트 ${NJ(v, '가', '이')} 비를 맞으며 광장에서 춤을 춘다.`, [v], 'funny');
      emote(w, v, '💃', 35);
      break;
    case 'party':
      w.party?.att.add(v.id);
      break;
    case 'hunt':
      emote(w, v, '🔍', 40);
      break;
    case 'wander':
    case 'fun': {
      if (a.decor != null) useDecor(w, v, a.decor);
      if (v.trait === '호기심쟁이' && R.next() < 0.07) {
        const f = R.pick(FINDS);
        if (!f) break;
        emote(w, v, f.e, 40);
        log(
          w,
          `${f.e} 호기심쟁이 ${NJ(v, '가', '이')} ${J(f.what, '를', '을')} 발견했다!`,
          [v],
          'find',
        );
        diary(w, v, `${J(f.what, '를', '을')} 찾았다! ${f.e}`);
        if (f.kind === 'treasure')
          rumor(w, v, 'treasure', '숲 어딘가에 보물이 묻혀 있대', '🗺️', 0.8);
        else if (f.kind === 'ghost') rumor(w, v, 'ghost', '숲에 뭔가 커다란 게 산대', '🐾', 0.85);
        else
          rumor(
            w,
            v,
            'find',
            `${J(v.name, '가', '이')} ${J(f.what, '를', '을')} 주웠대`,
            f.e,
            0.5,
            [v.id],
          );
      }
      break;
    }
    case 'social':
      if (a.decor != null) useDecor(w, v, a.decor);
      break;
    case 'haul': {
      const n = v.pack?.kind === 'lumber' ? v.pack.n : 0;
      if (n > 0) {
        w.lumber += n;
        v.pack = null;
        if (!v.daily.haulLog) {
          v.daily.haulLog = true;
          diary(w, v, `야적장에 목재를 ${n}개 쌓았다 🪵`);
        }
      }
      a.until = w.t;
      break;
    }
    case 'fetch':
    case 'deliver':
    case 'build':
      arriveSite(w, v, a);
      break;
    case 'movein': {
      v.pack = null;
      const home = bld(w, v.home);
      diary(w, v, `${home ? home.name : '새 집'}에 짐을 풀었다. 오늘부터 도토리 마을 주민이다 🏡`);
      break;
    }
  }
}

/** 행동을 한 틱 진행한다. 끝났으면 true. */
function doTick(w: World, v: Villager, a: Act, h: number): boolean {
  const R = w.rng;
  switch (a.type) {
    case 'sleep':
      v.energy += NEEDS.sleepGain;
      v.hunger += NEEDS.sleepHungerGain;
      if ((!inSleep(v, h) && v.energy > 55) || v.hunger < 6) {
        diary(w, v, v.trait === '게으름뱅이' && h > 9 ? '늦잠을 잤다. 개운하다 😌' : '잘 잤다 ☀️');
        return true;
      }
      break;
    case 'rest':
      v.energy += NEEDS.restEnergy;
      v.fun += NEEDS.restFun;
      break;
    case 'eat':
      v.hunger += NEEDS.eatGain;
      if (v.hunger >= 100) return true;
      break;
    case 'work':
      if (v.trait === '일벌레') v.fun += 0.06;
      else v.fun -= 0.02;
      v.energy -= 0.03;
      if (v.job === '제빵사' && w.t % BAKERY.bakeEvery === 0) bldKind(w, 'bakery').bread += 1;
      if (v.job === '어부' && w.t % 15 === 0 && R.next() < 0.2) emote(w, v, '🐟', 12);
      if (v.job === '나무꾼' && (w.t - a.started) % LUMBER.chopEvery === LUMBER.chopEvery - 1) {
        if (!v.pack || v.pack.kind !== 'lumber') v.pack = { kind: 'lumber', n: 0, site: null };
        v.pack.n += 1;
        if (v.pack.n >= LUMBER.packFull) return true;
      }
      if (!workHours(v, h)) return true;
      break;
    case 'build':
      return buildTick(w, v, a, h);
    case 'fun':
      v.fun += NEEDS.funGain;
      if (a.decor != null) {
        const d = w.decor.find((x) => x.id === a.decor);
        if (d && d.playerBuilt) v.fun += NEEDS.decorFunBonus;
      }
      if (a.where === 'shore' && w.t % 15 === 0 && R.next() < 0.12) {
        emote(w, v, '🐟', 15);
        diary(w, v, '물고기를 낚았다 🐟');
        if (R.next() < 0.08)
          log(w, `🐟 ${NJ(v, '가', '이')} 호수에서 팔뚝만 한 월척을 낚았다!`, [v], 'find');
      }
      if ((a.where === 'grass' || a.where === 'flower') && w.t % 20 === 0) emote(w, v, '🌸', 10);
      if (v.fun >= 100) return true;
      break;
    case 'party':
      v.fun += NEEDS.partyFun;
      v.social += NEEDS.partySocial;
      break;
    case 'nap':
      v.energy += NEEDS.napGain;
      break;
    case 'social':
      v.fun += NEEDS.socialFun;
      break;
    case 'raindance':
      v.fun += NEEDS.raindanceFun;
      if (!w.weather.rain) return true;
      break;
  }
  return w.t >= a.until;
}

/** 행동을 끝낸다. 보물찾기 결과, 꽃 따기를 정리한다. */
export function endAct(w: World, v: Villager): void {
  const a = v.act;
  if (a && a.type === 'hunt') {
    v.hunting = false;
    if (w.rng.next() < 0.25) {
      emote(w, v, '🌰', 40);
      log(w, `🌰 ${NJ(v, '가', '이')} 보물 지도를 따라가 황금 도토리를 파냈다!`, [v], 'find');
      diary(w, v, '황금 도토리를 찾았다!!! 🌰');
    } else diary(w, v, '보물을 찾아 숲을 헤맸지만 허탕이었다 😔');
  }
  if (a && a.type === 'fun' && (a.where === 'grass' || a.where === 'flower'))
    v.carry = { item: 'flower', until: w.t + 150 };
  v.act = null;
}

/** 경로를 따라 한 틱 걷는다. 다 왔으면 true. 앞 칸이 막혔으면(공사 시작 등) 경로를 다시 구한다. */
function stepMove(w: World, v: Villager): boolean {
  if (v.pi >= v.path.length) return true;
  const a = v.act;
  const heavy = v.pack != null && (v.pack.kind === 'bag' || v.pack.n >= 6);
  const spd = a && a.type === 'flee' ? 0.42 : a && a.target != null ? 0.3 : heavy ? 0.16 : 0.2;
  let budget = spd;
  while (budget > 0.0001 && v.pi < v.path.length) {
    const n = v.path[v.pi];
    if (!n) break;
    if (!passable(w, n.x, n.y)) {
      if (a) {
        v.path = [];
        v.pi = 0;
        planPath(w, v, a);
      }
      return false;
    }
    const last = v.pi === v.path.length - 1;
    const exact = last && a != null && a.bld != null;
    const tx = n.x + 0.5 + (exact ? 0 : v.offx);
    const ty = n.y + 0.5 + (exact ? 0 : v.offy);
    const dx = tx - v.x;
    const dy = ty - v.y;
    const d = Math.hypot(dx, dy);
    const f = 1 / (0.55 + 0.45 * tileCost(w.tiles[n.y * w.W + n.x] as number));
    if (d > 0.001) {
      v.dir.x = dx / d;
      v.dir.y = dy / d;
    }
    if (d <= budget * f) {
      v.x = tx;
      v.y = ty;
      budget -= d / f;
      v.pi++;
    } else {
      v.x += (dx / d) * budget * f;
      v.y += (dy / d) * budget * f;
      budget = 0;
    }
  }
  v.walk += spd * 3;
  return v.pi >= v.path.length;
}

/** 한 사람의 한 틱: 행동이 없으면 고르고, 있으면 이동하거나 진행한다. */
export function actTick(w: World, v: Villager, h: number): void {
  if (v.talk != null) return;
  const a = v.act;
  if (!a) {
    decide(w, v);
    return;
  }
  if (a.target != null) {
    const tg = vil(w, a.target);
    if (
      tg.inside != null ||
      (tg.act && (tg.act.type === 'sleep' || tg.act.type === 'flee' || tg.act.type === 'movein')) ||
      w.t - a.started > 70
    ) {
      v.act = null;
      return;
    }
    if (dist(v, tg) < 1.6) {
      if (tg.talk == null) {
        startConv(w, v, tg, a.kind ?? 'chat');
        if (a.kind === 'welcome') v.welcome = null;
        v.act = null;
      }
      return;
    }
    if (w.t >= a.repath || v.pi >= v.path.length) {
      const p = findPath(w, Math.floor(v.x), Math.floor(v.y), Math.floor(tg.x), Math.floor(tg.y));
      if (p === null) {
        v.act = null;
        return;
      }
      if (p !== 'busy') {
        v.path = p;
        v.pi = 0;
        a.repath = w.t + 6;
      }
    }
    stepMove(w, v);
    return;
  }
  if (a.needPath) {
    planPath(w, v, a);
    return;
  }
  if (a.phase === 'go') {
    if (stepMove(w, v)) arrive(w, v);
    return;
  }
  if (doTick(w, v, a, h) || (v.hunger < 5 && a.type !== 'eat' && a.type !== 'sleep')) endAct(w, v);
}

/** 명령용: 지금 하던 일을 끝낸다(자는 중·대화 중 제외). */
export function nudge(w: World, v: Villager): void {
  if (v.talk == null && v.act && v.act.type !== 'sleep') endAct(w, v);
}
