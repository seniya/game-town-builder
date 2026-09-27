// 살아 있는 몸짓 수치 (SPEC 13, ADR 055). 그리기와 소리가 함께 읽는다(박자를 같게 하려고). three 를 쓰지 않는다.

/** 보폭: 재생 빠르기 1 에서 1 초에 가는 타일(SPEC 13.2). */
export const STRIDE = {
  walk: 1.12,
  sprint: 1.72,
  /** 재생 빠르기 자르기. */
  walkTs: [0.5, 2.6],
  sprintTs: [0.6, 2.8],
  /** 화면 속도를 고르게 하는 시간(초). */
  smooth: 0.25,
  /** 무거운 짐을 지고 걸을 때 몸통 숙임, 손수레를 밀 때 두 팔. */
  heavyLean: 0.14,
  cartArms: -0.9,
} as const;

export type StrikeKind = 'hammer' | 'axe' | 'hoe';

/** 일 박자 한 가지(SPEC 13.3 표). 위상 단위는 주기에 대한 비율(0~1). */
export interface Rhythm {
  /** 주기(동작 초). */
  period: number;
  /** 들어 올림이 끝나는 위상. */
  raise: number;
  /** 치는 순간의 위상. */
  hit: number;
  /** 오른팔 각도: 든 끝, 칠 때. */
  armUp: number;
  armDown: number;
  /** 몸통 각도: 든 끝, 칠 때. */
  torsoUp: number;
  torsoDown: number;
  /** 왼팔: 오른팔에 곱하는 비율(두 손), 또는 받침 고정각(null 이면 비율을 쓴다). */
  leftScale: number;
  leftFixed: number | null;
}

export const RHYTHM: Readonly<Record<StrikeKind, Rhythm>> = {
  hammer: {
    period: 0.55,
    raise: 0.45,
    hit: 0.55,
    armUp: -1.9,
    armDown: -0.35,
    torsoUp: -0.05,
    torsoDown: 0.18,
    leftScale: 0,
    leftFixed: -0.4,
  },
  axe: {
    period: 0.8,
    raise: 0.5,
    hit: 0.6,
    armUp: -2.5,
    armDown: -0.6,
    torsoUp: -0.12,
    torsoDown: 0.3,
    leftScale: 0.8,
    leftFixed: null,
  },
  hoe: {
    period: 1.0,
    raise: 0.5,
    hit: 0.6,
    armUp: -2.2,
    armDown: -0.2,
    torsoUp: -0.1,
    torsoDown: 0.35,
    leftScale: 0.8,
    leftFixed: null,
  },
};

/** 치는 순간 뒤 멈추는 길이(위상), 사람마다 박자를 어긋나게 하는 시간(동작 초 × id). */
export const STRIKE_HOLD = 0.12;
export const STRIKE_OFFSET = 0.37;

/** 고개와 숨(SPEC 13.4). */
export const LOOK = {
  breath: 0.025,
  breathPeriod: 3.2,
  lookMax: 0.55,
  /** 둘러보기의 두 느린 사인 주기(초). */
  lookPeriods: [17, 48],
  talkBob: 0.06,
  talkHz: 1.4,
  nod: 0.2,
  nodEvery: 2.2,
  nodLen: 0.4,
  headYawLimit: 0.6,
  headPitchLimit: 0.25,
} as const;

/** 앉기와 낮잠 눕기(SPEC 14.3·14.4). 팔 "모으기" 는 몸 쪽으로 드는 각도(앞축), 앞뒤는 13.1 과 같다. */
export const REST = {
  sitArmsIn: 0.9,
  sitArmsFwd: -0.35,
  bookArms: -0.9,
  bookHead: 0.2,
  /** 눕고 일어나는 시간(초). */
  lieTime: 0.6,
  /** 누운 팔: 몸을 따라 두고 살짝 들어 모은다(하늘로 들지 않게). */
  lieArms: -0.1,
  lieArmsIn: 0.3,
  lieBreath: 0.04,
  lieBreathPeriod: 4.2,
} as const;

/** 부드럽게 들고 놓기(0~1 → 0~1). */
export function smooth(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** 이 사람의 이 일에서 지금 위상(0~1). */
export function strikePhase(kind: StrikeKind, id: number, animT: number): number {
  const r = RHYTHM[kind];
  const u = (animT + id * STRIKE_OFFSET) / r.period;
  return u - Math.floor(u);
}

/** 위상에서의 자세: 오른팔·왼팔·몸통 각도(SPEC 13.3 곡선). */
export function strikePose(
  kind: StrikeKind,
  phase: number,
): { arm: number; left: number; torso: number } {
  const r = RHYTHM[kind];
  let k: number; // 0 = 제자리, 1 = 든 끝, 2 = 칠 때
  if (phase < r.raise) k = smooth(phase / r.raise);
  else if (phase < r.hit) {
    const x = (phase - r.raise) / (r.hit - r.raise);
    k = 1 + x * x; // 내려칠수록 빨라진다
  } else if (phase < r.hit + STRIKE_HOLD) k = 2;
  else k = 2 * (1 - smooth((phase - r.hit - STRIKE_HOLD) / (1 - r.hit - STRIKE_HOLD)));
  // k 를 각도로: 0→1 은 제자리→위, 1→2 는 위→아래, 돌아올 때(2→0)는 아래→제자리
  const back = phase >= r.hit + STRIKE_HOLD;
  const lerp3 = (rest: number, up: number, down: number): number =>
    back
      ? rest + (down - rest) * (k / 2)
      : k <= 1
        ? rest + (up - rest) * k
        : up + (down - up) * (k - 1);
  const arm = lerp3(0, r.armUp, r.armDown);
  const torso = lerp3(0, r.torsoUp, r.torsoDown);
  const left = r.leftFixed ?? arm * r.leftScale;
  return { arm, left, torso };
}

/** 동작 시간 t0 < 치는 시각 ≤ t1 이면 true(그 프레임에 입자를 낸다). */
export function strikeBetween(kind: StrikeKind, id: number, t0: number, t1: number): boolean {
  if (t1 <= t0) return false;
  const r = RHYTHM[kind];
  const n0 = Math.floor((t0 + id * STRIKE_OFFSET) / r.period - r.hit);
  const n1 = Math.floor((t1 + id * STRIKE_OFFSET) / r.period - r.hit);
  return n1 > n0;
}

/** 치는 순간의 동작 시각들: 번호 n 의 치는 시각 = (n + hit) × 주기 − id × 0.37. from 보다 뒤, to 이하. */
export function strikeTimes(
  kind: StrikeKind,
  id: number,
  from: number,
  to: number,
): { n: number; t: number }[] {
  const r = RHYTHM[kind];
  const off = id * STRIKE_OFFSET;
  const out: { n: number; t: number }[] = [];
  let n = Math.floor((from + off) / r.period - r.hit) + 1;
  for (;;) {
    const t = (n + r.hit) * r.period - off;
    if (t > to) break;
    if (t > from) out.push({ n, t });
    n++;
  }
  return out;
}

/** 둘러보기 머리 돌림(라디안, SPEC 13.4). 두 느린 사인의 곱이라 가끔만 크게 돈다. */
export function lookYaw(id: number, t: number): number {
  const [p1, p2] = LOOK.lookPeriods;
  const a = Math.sin((t / p1) * Math.PI * 2 + id * 1.7);
  const b = Math.sin((t / p2) * Math.PI * 2 + id * 0.9);
  return LOOK.lookMax * a * Math.abs(b);
}

/** 듣는 쪽 끄덕임(라디안, 0 이상). nodEvery 마다 nodLen 동안 반달 모양. */
export function nodPitch(id: number, t: number): number {
  const u = (t + id * 0.61) % LOOK.nodEvery;
  if (u > LOOK.nodLen) return 0;
  return LOOK.nod * Math.sin((u / LOOK.nodLen) * Math.PI);
}

/** 걷기·달리기 재생 빠르기(SPEC 13.2). speed 는 화면 속도(타일/초), animRate 는 동작 시간 배율. */
export function strideTs(run: boolean, speed: number, animRate: number): number {
  const base = run ? STRIDE.sprint : STRIDE.walk;
  const [lo, hi] = run ? STRIDE.sprintTs : STRIDE.walkTs;
  const ts = speed / base / Math.max(0.01, animRate);
  return Math.min(hi, Math.max(lo, ts));
}
