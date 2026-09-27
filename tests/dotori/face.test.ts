// V7 표정과 쉬는 자세(SPEC 14, ADR 056): 12 종 모형에서 눈·입 찾기, 모프 모양, 표정 규칙.
import { describe, expect, it } from 'vitest';
import {
  EXPRESS,
  FACE,
  blinkAt,
  faceMorphs,
  faceTarget,
  findFaceParts,
  type FaceParts,
} from '../../src/dotori/data/face';
import { REST } from '../../src/dotori/data/motion';
import { CHAR_NAMES } from '../../src/dotori/render/assets';

interface Accessor {
  bufferView: number;
  byteOffset?: number;
  count: number;
  type: string;
  componentType: number;
}
interface Gltf {
  accessors: Accessor[];
  bufferViews: { byteOffset?: number }[];
  buffers: { uri: string }[];
  meshes: { name: string; primitives: { attributes: Record<string, number> }[] }[];
}

/** 캐릭터 에셋 JSON 원문(vite 가 문자열로 넣는다). */
const RAW = import.meta.glob<string>('../../public/dotori/assets/kc_character-*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** 에셋 JSON 에서 머리 메시의 위치·UV 를 읽는다(float 만, 이 모형은 모두 float). */
function headOf(name: string): { pos: Float32Array; uv: Float32Array } {
  const text = RAW[`../../public/dotori/assets/kc_character-${name}.json`];
  if (!text) throw new Error(`${name} 에셋이 없다`);
  const j = JSON.parse(text) as Gltf;
  const uri = j.buffers[0]?.uri ?? '';
  const raw = atob(uri.slice(uri.indexOf(',') + 1));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const bin = new DataView(bytes.buffer);
  const read = (i: number, comp: number): Float32Array => {
    const a = j.accessors[i];
    if (!a || a.componentType !== 5126) throw new Error('float 가 아니다');
    const off = (j.bufferViews[a.bufferView]?.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const out = new Float32Array(a.count * comp);
    for (let k = 0; k < out.length; k++) out[k] = bin.getFloat32(off + k * 4, true);
    return out;
  };
  const prim = j.meshes.find((m) => m.name === 'head-mesh')?.primitives[0];
  if (!prim) throw new Error('head-mesh 가 없다');
  return {
    pos: read(prim.attributes.POSITION ?? -1, 3),
    uv: read(prim.attributes.TEXCOORD_0 ?? -1, 2),
  };
}

/** 꼭짓점 묶음의 y 범위·x 가운데. */
function span(pos: ArrayLike<number>, idx: number[]) {
  const ys = idx.map((i) => pos[i * 3 + 1] ?? 0);
  const xs = idx.map((i) => pos[i * 3] ?? 0);
  return {
    h: Math.max(...ys) - Math.min(...ys),
    cx: (Math.max(...xs) + Math.min(...xs)) / 2,
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

describe('얼굴 모프 (SPEC 14.1)', () => {
  const heads = CHAR_NAMES.map((n) => ({ n, ...headOf(n) }));

  it('12 종 모두 눈 둘·입 하나를 찾는다', () => {
    for (const { n, pos, uv } of heads) {
      const p = findFaceParts(pos, uv);
      expect(p, n).not.toBeNull();
      const parts = p as FaceParts;
      expect(parts.eyeL.length, n).toBeGreaterThanOrEqual(6);
      expect(parts.eyeR.length, n).toBeGreaterThanOrEqual(6);
      expect(parts.mouth.length, n).toBeGreaterThanOrEqual(6);
      expect(span(pos, parts.eyeL).cx, n).toBeLessThan(-0.03);
      expect(span(pos, parts.eyeR).cx, n).toBeGreaterThan(0.03);
      expect(Math.abs(span(pos, parts.mouth).cx), n).toBeLessThan(0.01);
      // 입은 눈보다 아래
      expect(span(pos, parts.mouth).maxY, n).toBeLessThan(span(pos, parts.eyeL).minY);
    }
  });

  it('모프는 얼굴 꼭짓점만 옮긴다', () => {
    for (const { n, pos, uv } of heads) {
      const parts = findFaceParts(pos, uv) as FaceParts;
      const face = new Set([...parts.eyeL, ...parts.eyeR, ...parts.mouth]);
      const m = faceMorphs(pos, parts);
      for (const arr of Object.values(m))
        for (let i = 0; i < pos.length / 3; i++)
          if (!face.has(i))
            for (let k = 0; k < 3; k++) expect(arr[i * 3 + k], n).toBe(pos[i * 3 + k]);
    }
  });

  it('눈 감기는 눈 높이를 0.12 배로, 입 벌리기는 입을 늘이고, 찡그림은 두께를 지킨다', () => {
    const { pos, uv } = heads[0] ?? headOf('female-a');
    const parts = findFaceParts(pos, uv) as FaceParts;
    const m = faceMorphs(pos, parts);
    const eye0 = span(pos, parts.eyeL);
    expect(span(m.blink, parts.eyeL).h).toBeCloseTo(eye0.h * FACE.blinkSquash, 5);
    expect(span(m.happy, parts.eyeR).h).toBeLessThan(eye0.h * 0.6);
    const mouth0 = span(pos, parts.mouth);
    expect(span(m.open, parts.mouth).h).toBeCloseTo(mouth0.h * FACE.openY, 5);
    // 찡그림: 반만 섞어도 입이 납작해지지 않는다
    const half = Float32Array.from(pos, (v, i) => (v + (m.frown[i] ?? v)) / 2);
    expect(span(half, parts.mouth).h).toBeGreaterThan(mouth0.h * 0.5);
    // 입꼬리(가장 바깥 꼭짓점)는 내려가고 가운데는 올라간다
    const outer = parts.mouth.reduce((a, b) =>
      Math.abs(pos[b * 3] ?? 0) > Math.abs(pos[a * 3] ?? 0) ? b : a,
    );
    const inner = parts.mouth.reduce((a, b) =>
      Math.abs(pos[b * 3] ?? 0) < Math.abs(pos[a * 3] ?? 0) ? b : a,
    );
    expect(m.frown[outer * 3 + 1] ?? 0).toBeLessThan(pos[outer * 3 + 1] ?? 0);
    expect(m.frown[inner * 3 + 1] ?? 0).toBeGreaterThan(pos[inner * 3 + 1] ?? 0);
  });

  it('모양이 다른 모형이면 null(표정 없음)', () => {
    expect(findFaceParts(new Float32Array(9), new Float32Array(6))).toBeNull();
  });
});

describe('표정 규칙 (SPEC 14.2)', () => {
  it('잠은 눈을 감고 말해도 입을 벌리지 않는다', () => {
    const f = faceTarget('sleep', true, 3, 1.23);
    expect(f).toEqual({ blink: 1, happy: 0, open: 0, frown: 0 });
  });

  it('기쁨은 웃는 눈과 벌린 입, 찡그림·기분 나쁨은 입꼬리를 내린다', () => {
    expect(faceTarget('joy', false, 1, 0.5)).toMatchObject({
      happy: 1,
      open: EXPRESS.joyOpen,
      blink: 0,
    });
    expect(faceTarget('frown', false, 1, 0.5).frown).toBe(1);
    expect(faceTarget('sulk', false, 1, 0.5).frown).toBe(EXPRESS.sulkFrown);
    expect(faceTarget('calm', false, 1, 0.5).frown).toBe(0);
  });

  it('깜박임: 주기마다 한 번 0.14 초, 사람마다 주기와 때가 다르다', () => {
    const dt = 0.005;
    const on = (id: number): number[] => {
      const starts: number[] = [];
      let prev = 0;
      for (let t = 0; t < 30; t += dt) {
        const b = blinkAt(id, t);
        if (b > 0 && prev === 0) starts.push(t);
        prev = b;
      }
      return starts;
    };
    const a = on(0);
    const b = on(1);
    const period = (s: number[]): number => ((s.at(-1) ?? 0) - (s[0] ?? 0)) / (s.length - 1);
    expect(period(a)).toBeCloseTo(EXPRESS.blinkBase, 1);
    expect(period(b)).toBeCloseTo(EXPRESS.blinkBase + EXPRESS.blinkStep, 1);
    expect(Math.abs((a[0] ?? 0) - (b[0] ?? 0))).toBeGreaterThan(0.2);
    // 한 번의 길이
    let len = 0;
    for (let t = (a[0] ?? 0) - dt; t < (a[0] ?? 0) + 1; t += dt) if (blinkAt(0, t) > 0) len += dt;
    expect(len).toBeCloseTo(EXPRESS.blinkLen, 1);
    for (let t = 0; t < 10; t += 0.01) {
      const v = blinkAt(5, t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('웃는 눈일 때는 깜박이지 않는다', () => {
    for (let t = 0; t < 10; t += 0.01) expect(faceTarget('joy', false, 2, t).blink).toBe(0);
  });

  it('말하는 입은 0~1 에서 움직인다', () => {
    let lo = 1;
    let hi = 0;
    for (let t = 0; t < 2; t += 0.01) {
      const o = faceTarget('calm', true, 4, t).open;
      lo = Math.min(lo, o);
      hi = Math.max(hi, o);
      expect(o).toBeLessThanOrEqual(1);
    }
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThan(0.7);
    expect(faceTarget('joy', true, 4, 0.06).open).toBeLessThanOrEqual(1);
  });
});

describe('쉬는 자세 수치 (SPEC 14.3·14.4)', () => {
  it('누운 팔은 하늘로 들지 않고, 눕는 데 0.6 초', () => {
    expect(REST.lieArms).toBeGreaterThanOrEqual(-0.3);
    expect(REST.lieTime).toBe(0.6);
    expect(REST.bookArms).toBeLessThan(REST.sitArmsFwd);
  });
});
