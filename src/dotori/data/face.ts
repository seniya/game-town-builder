// 표정 수치와 얼굴 모프 계산 (SPEC 14.1·14.2, ADR 056). three 를 쓰지 않는다(시험으로 12 종 모형을 모두 확인한다).

/** 얼굴 도형을 고르는 조건과 모프 모양(모형 단위, SPEC 14.1). */
export const FACE = {
  /** 눈·입이 쓰는 가장 어두운 색의 색표 u 와 허용 오차. */
  darkU: 0.09375,
  uTol: 0.002,
  /** 얼굴 앞면 z 범위, 가로 한계, 세로 범위, 이 y 위는 눈. */
  zMin: 0.15,
  zMax: 0.161,
  xMax: 0.13,
  yMin: 0.39,
  yMax: 0.53,
  eyeFrom: 0.445,
  /** 눈 감기: 세로를 이만큼으로 모은다. */
  blinkSquash: 0.12,
  /** 웃는 눈: 세로를 모으고 가운데를 올려 활 모양으로. */
  happySquash: 0.18,
  happyArch: 0.016,
  /** 입 벌리기: 윗선을 기준으로 세로·가로 배율. */
  openY: 1.9,
  openX: 0.85,
  /** 찡그린 입: 가운데를 올리고 입꼬리를 내린다(두께는 그대로, 반만 섞어도 입이 사라지지 않게). */
  frownBend: 0.016,
} as const;

/** 표정 규칙 수치(SPEC 14.2). */
export const EXPRESS = {
  /** 깜박임 주기 = base + (id × step mod spread) 초, 한 번에 len 초. */
  blinkBase: 3.2,
  blinkStep: 0.61,
  blinkSpread: 2,
  blinkLen: 0.14,
  /** 말 입: 벌림 = talkOpen × max(0, sin(2π × talkHz × t + id)). */
  talkHz: 4.2,
  talkOpen: 0.75,
  /** 기쁠 때 입 벌림, 기분 나쁨의 기준 행복과 찡그림 세기. */
  joyOpen: 0.45,
  sulkBelow: 30,
  sulkFrown: 0.5,
  /** 표정 값이 따라가는 시간(초). */
  follow: 0.15,
} as const;

export const FACE_MORPHS = ['blink', 'happy', 'open', 'frown'] as const;
export type FaceMorph = (typeof FACE_MORPHS)[number];

/** 얼굴 도형의 꼭짓점 번호: 왼눈(x < 0)·오른눈·입. */
export interface FaceParts {
  eyeL: number[];
  eyeR: number[];
  mouth: number[];
}

/**
 * 머리 메시의 위치(xyz 반복)·UV(uv 반복)에서 눈·입 꼭짓점을 고른다(SPEC 14.1).
 * 눈 둘·입 하나를 모두 찾지 못하면 null(모형이 다르면 표정을 쓰지 않는다).
 */
export function findFaceParts(pos: ArrayLike<number>, uv: ArrayLike<number>): FaceParts | null {
  const parts: FaceParts = { eyeL: [], eyeR: [], mouth: [] };
  const n = Math.floor(pos.length / 3);
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3] ?? 0;
    const y = pos[i * 3 + 1] ?? 0;
    const z = pos[i * 3 + 2] ?? 0;
    const u = uv[i * 2] ?? -1;
    if (Math.abs(u - FACE.darkU) > FACE.uTol) continue;
    if (z < FACE.zMin || z > FACE.zMax || Math.abs(x) >= FACE.xMax) continue;
    if (y <= FACE.yMin || y >= FACE.yMax) continue;
    if (y < FACE.eyeFrom) parts.mouth.push(i);
    else if (x < 0) parts.eyeL.push(i);
    else parts.eyeR.push(i);
  }
  return parts.eyeL.length && parts.eyeR.length && parts.mouth.length ? parts : null;
}

/** 꼭짓점 묶음의 경계 상자(가운데·반폭·위아래). */
function boxOf(pos: ArrayLike<number>, idx: readonly number[]) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const i of idx) {
    const x = pos[i * 3] ?? 0;
    const y = pos[i * 3 + 1] ?? 0;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hw: Math.max(1e-6, (x1 - x0) / 2), top: y1 };
}

/**
 * 네 모프의 꼭짓점 위치(절대값, 원래 위치를 복사해 얼굴 꼭짓점만 옮긴다, SPEC 14.1).
 * 눈 감기·웃는 눈은 눈마다 제 가운데로 모으고, 입 벌리기는 윗선 기준으로 늘이고, 찡그림은 입꼬리를 내리게 휜다.
 */
export function faceMorphs(
  pos: ArrayLike<number>,
  parts: FaceParts,
): Record<FaceMorph, Float32Array> {
  const make = (): Float32Array => Float32Array.from(pos);
  const out: Record<FaceMorph, Float32Array> = {
    blink: make(),
    happy: make(),
    open: make(),
    frown: make(),
  };
  for (const eye of [parts.eyeL, parts.eyeR]) {
    const b = boxOf(pos, eye);
    for (const i of eye) {
      const x = pos[i * 3] ?? 0;
      const y = pos[i * 3 + 1] ?? 0;
      out.blink[i * 3 + 1] = b.cy + (y - b.cy) * FACE.blinkSquash;
      const dx = Math.min(1, Math.abs(x - b.cx) / b.hw);
      out.happy[i * 3 + 1] = b.cy + (y - b.cy) * FACE.happySquash + FACE.happyArch * (1 - dx * dx);
    }
  }
  const m = boxOf(pos, parts.mouth);
  for (const i of parts.mouth) {
    const x = pos[i * 3] ?? 0;
    const y = pos[i * 3 + 1] ?? 0;
    out.open[i * 3] = m.cx + (x - m.cx) * FACE.openX;
    out.open[i * 3 + 1] = m.top - (m.top - y) * FACE.openY;
    const dx = Math.min(1, Math.abs(x - m.cx) / m.hw);
    out.frown[i * 3 + 1] = y + FACE.frownBend * (1 - 2 * dx * dx);
  }
  return out;
}

/** 표정의 바탕 상태(SPEC 14.2 표). */
export type Mood = 'sleep' | 'joy' | 'frown' | 'sulk' | 'calm';

/** 모프 세기(0~1). */
export type FaceVals = Record<FaceMorph, number>;

/** 이 사람이 지금 깜박이는 정도(0~1, 반달 모양). */
export function blinkAt(id: number, t: number): number {
  const period = EXPRESS.blinkBase + ((id * EXPRESS.blinkStep) % EXPRESS.blinkSpread);
  const u = (((t + id * 1.3) % period) + period) % period;
  if (u > EXPRESS.blinkLen) return 0;
  return Math.sin((u / EXPRESS.blinkLen) * Math.PI);
}

/** 상태·말하기에서 이번 프레임의 목표 표정(깜박임 포함, SPEC 14.2). */
export function faceTarget(mood: Mood, speaking: boolean, id: number, t: number): FaceVals {
  const f: FaceVals = { blink: 0, happy: 0, open: 0, frown: 0 };
  if (mood === 'sleep') f.blink = 1;
  else if (mood === 'joy') {
    f.happy = 1;
    f.open = EXPRESS.joyOpen;
  } else {
    if (mood === 'frown') f.frown = 1;
    else if (mood === 'sulk') f.frown = EXPRESS.sulkFrown;
    f.blink = blinkAt(id, t);
  }
  if (speaking && mood !== 'sleep')
    f.open = Math.min(
      1,
      f.open + EXPRESS.talkOpen * Math.max(0, Math.sin(2 * Math.PI * EXPRESS.talkHz * t + id)),
    );
  return f;
}
