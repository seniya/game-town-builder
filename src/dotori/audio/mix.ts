// 환경음 크기 계산 (SPEC 12.3). World 와 카메라(듣는 자리)만 읽는 순수 함수라 node 에서 시험한다.
import { strikeTimes, type StrikeKind } from '../data/motion';
import { JOBS } from '../data/people';
import { PLAZA } from '../data/villageMap';
import { SEASON_SOUND, SOUND } from '../data/sound';
import { isSnow, seasonOf } from '../sim/season';
import { hourOf } from '../sim/text';
import type { World } from '../sim/types';

/** 듣는 자리: 카메라가 보는 점, 카메라 거리, 화면 오른쪽 방향(땅 위 단위 벡터). */
export interface Listener {
  x: number;
  z: number;
  dist: number;
  rx: number;
  rz: number;
}

/** 망치·도끼처럼 사람마다 나는 소리. */
export interface PointSound {
  kind: 'hammer' | 'axe';
  /** 주민 id(치는 박자를 사람마다 어긋나게 한다). */
  id: number;
  gain: number;
  pan: number;
}

export interface AmbienceMix {
  birds: number;
  crickets: number;
  rain: number;
  wind: number;
  water: number;
  tavern: number;
  /** 잔치 층(흔들이·박수, 배경음악에 더한다). */
  festive: number;
  points: PointSound[];
}

/** 들리는 반경과 확대 배율. */
export function hearing(l: Listener): { R: number; zoom: number } {
  const R = SOUND.hearBase + l.dist * SOUND.hearPerDist;
  const zoom = Math.min(1, Math.max(SOUND.zoomMin, SOUND.zoomTop - l.dist / SOUND.zoomDiv));
  return { R, zoom };
}

/** 한 점의 크기(거리 감쇠 × 확대 배율)와 좌우(-1~1). */
export function atten(l: Listener, x: number, z: number): { gain: number; pan: number } {
  const { R, zoom } = hearing(l);
  const dx = x - l.x;
  const dz = z - l.z;
  const d = Math.hypot(dx, dz);
  const k = Math.max(0, 1 - d / R);
  const pan = Math.max(-1, Math.min(1, (dx * l.rx + dz * l.rz) / R));
  return { gain: k * k * zoom, pan };
}

/** 시각 h 가 [a, b) 안인가(b < a 면 자정을 넘는다). */
function inHours(h: number, [a, b]: readonly [number, number]): boolean {
  return a <= b ? h >= a && h < b : h >= a || h < b;
}

/** 지금 들려야 할 환경음 크기. */
export function mixAt(w: World, l: Listener): AmbienceMix {
  const h = hourOf(w.t);
  const season = seasonOf(w.t);
  const ss = SEASON_SOUND[season.id];
  const snow = isSnow(w);
  const wet = w.weather.rain;
  const { zoom } = hearing(l);
  const birds = !wet && inHours(h, SOUND.birdHours) ? ss.birds * zoom : 0;
  const crickets = !wet && inHours(h, SOUND.cricketHours) ? ss.crickets * zoom : 0;
  const rain = wet && !snow ? SOUND.rain : 0;
  const wind = snow ? SOUND.windSnow : season.id === 'winter' ? SOUND.windWinter : SOUND.windBase;
  let water = 0;
  for (const p of w.L.water) {
    const g = atten(l, p.x + 0.5, p.y + 0.5).gain;
    if (g > water) water = g;
  }
  let tavern = 0;
  for (const b of w.buildings) {
    if (b.kind !== 'tavern') continue;
    let n = 0;
    for (const v of w.vs) if (v.inside === b.id) n++;
    if (!n) continue;
    const g = atten(l, b.x + b.w / 2, b.y + b.h / 2).gain;
    tavern = Math.max(tavern, Math.min(1, n / SOUND.tavernFull) * g);
  }
  const P = w.party;
  const festive =
    P && w.t >= P.start && w.t < P.end
      ? atten(l, PLAZA.x + PLAZA.w / 2, PLAZA.y + PLAZA.h / 2).gain
      : 0;
  const hammers: PointSound[] = [];
  const axes: PointSound[] = [];
  for (const v of w.vs) {
    const a = v.act;
    if (!a || a.phase !== 'do' || v.inside != null || v.talk != null) continue;
    const place = a.type === 'work' ? JOBS[v.job].place : null;
    const kind =
      a.type === 'build' || place === 'workshop' ? 'hammer' : place === 'forest' ? 'axe' : null;
    if (!kind) continue;
    const { gain, pan } = atten(l, v.x, v.y);
    if (gain < 0.02) continue;
    (kind === 'hammer' ? hammers : axes).push({ kind, id: v.id, gain, pan });
  }
  const top = (list: PointSound[], n: number): PointSound[] =>
    list.sort((a, b) => b.gain - a.gain).slice(0, n);
  return {
    birds,
    crickets,
    rain,
    wind,
    water,
    tavern,
    festive,
    points: [...top(hammers, SOUND.hammerMax), ...top(axes, SOUND.axeMax)],
  };
}

/**
 * 망치·도끼 소리 예약(SPEC 13.3): 그리기와 같은 박자 함수로 치는 순간을 찾는다.
 * animNow 는 지금 동작 시간, rate 는 동작 시간 배율(실제 1 초에 흐르는 동작 초), ahead 는 미리 예약할 실제 초.
 * lastN 은 이미 예약한 마지막 치는 번호(없으면 null). 돌려주는 at 은 지금부터 몇 초 뒤인지다.
 */
export function strikeSchedule(
  kind: StrikeKind,
  id: number,
  animNow: number,
  rate: number,
  ahead: number,
  lastN: number | null,
): { at: number[]; lastN: number | null } {
  if (rate <= 0) return { at: [], lastN };
  const at: number[] = [];
  let last = lastN;
  for (const s of strikeTimes(kind, id, animNow, animNow + ahead * rate)) {
    if (last != null && s.n <= last) continue;
    at.push((s.t - animNow) / rate);
    last = s.n;
  }
  return { at, lastN: last };
}
