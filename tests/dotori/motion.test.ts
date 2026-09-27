// V6 살아 있는 몸짓(SPEC 13, ADR 055): 일 박자·걸음 맞추기·고개와 숨, 소리 예약이 치는 순간과 맞는지.
import { describe, expect, it } from 'vitest';
import { strikeSchedule } from '../../src/dotori/audio/mix';
import {
  LOOK,
  RHYTHM,
  STRIDE,
  lookYaw,
  nodPitch,
  strikeBetween,
  strikePhase,
  strikePose,
  strikeTimes,
  strideTs,
  type StrikeKind,
} from '../../src/dotori/data/motion';

const KINDS: StrikeKind[] = ['hammer', 'axe', 'hoe'];

describe('일 박자', () => {
  it('한 주기: 제자리 → 든 끝 → 칠 때 → 제자리, 곡선이 끊기지 않는다', () => {
    for (const k of KINDS) {
      const r = RHYTHM[k];
      expect(strikePose(k, 0).arm).toBeCloseTo(0, 6);
      expect(strikePose(k, r.raise).arm).toBeCloseTo(r.armUp, 6);
      expect(strikePose(k, r.hit).arm).toBeCloseTo(r.armDown, 6);
      expect(strikePose(k, 0.9999).arm).toBeCloseTo(0, 2);
      // 작은 걸음마다 각도가 크게 튀지 않는다(치는 구간 빼고 0.05 위상에 0.6 라디안 안)
      let prev = strikePose(k, 0);
      for (let p = 0.01; p < 1; p += 0.01) {
        const cur = strikePose(k, p);
        const jump = Math.abs(cur.arm - prev.arm);
        expect(jump).toBeLessThan(p > r.raise && p <= r.hit + 0.01 ? 0.7 : 0.25);
        expect(cur.arm).toBeGreaterThanOrEqual(Math.min(r.armUp, r.armDown, 0) - 1e-9);
        expect(cur.arm).toBeLessThanOrEqual(Math.max(r.armUp, r.armDown, 0) + 1e-9);
        prev = cur;
      }
    }
  });

  it('왼팔: 망치는 받침 고정, 도끼·괭이는 오른팔을 따라간다', () => {
    expect(strikePose('hammer', 0.3).left).toBe(RHYTHM.hammer.leftFixed);
    const a = strikePose('axe', 0.3);
    expect(a.left).toBeCloseTo(a.arm * RHYTHM.axe.leftScale, 9);
  });

  it('치는 시각은 위상이 치는 순간인 때이고, 사이에 든 것만 센다', () => {
    for (const k of KINDS) {
      const r = RHYTHM[k];
      for (const id of [0, 3, 17]) {
        const ts = strikeTimes(k, id, 10, 14);
        expect(ts.length).toBeGreaterThanOrEqual(Math.floor(4 / r.period));
        for (const s of ts) {
          expect(strikePhase(k, id, s.t + 1e-6)).toBeCloseTo(r.hit, 4);
          expect(strikeBetween(k, id, s.t - 0.001, s.t + 0.001)).toBe(true);
        }
        // 이어진 두 치는 시각의 간격은 주기다
        for (let i = 1; i < ts.length; i++)
          expect((ts[i]?.t ?? 0) - (ts[i - 1]?.t ?? 0)).toBeCloseTo(r.period, 9);
        // 치는 순간 사이에서는 false
        const a = ts[0]?.t ?? 0;
        expect(strikeBetween(k, id, a + 0.01, a + r.period - 0.01)).toBe(false);
      }
    }
  });

  it('사람마다 박자가 어긋난다', () => {
    expect(strikePhase('hammer', 1, 5)).not.toBeCloseTo(strikePhase('hammer', 2, 5), 3);
  });
});

describe('망치·도끼 소리 예약', () => {
  it('예약 시각은 그리기의 치는 순간과 같고, 같은 치기를 두 번 예약하지 않는다', () => {
    const rate = 1.25;
    const now = 20;
    const first = strikeSchedule('hammer', 5, now, rate, 1, null);
    expect(first.at.length).toBeGreaterThan(0);
    for (const dt of first.at) {
      const animAt = now + dt * rate;
      expect(strikePhase('hammer', 5, animAt + 1e-6)).toBeCloseTo(RHYTHM.hammer.hit, 4);
      expect(dt).toBeGreaterThan(0);
      expect(dt).toBeLessThanOrEqual(1 + 1e-9);
    }
    // 조금 뒤 다시 불러도 이미 예약한 치기는 빼고 새 것만
    const again = strikeSchedule('hammer', 5, now + 0.1 * rate, rate, 1, first.lastN);
    const all = [
      ...first.at.map((d) => now + d * rate),
      ...again.at.map((d) => now + 0.1 * rate + d * rate),
    ];
    expect(new Set(all.map((t) => t.toFixed(4))).size).toBe(all.length);
  });

  it('멈춤(배율 0)이면 아무것도 예약하지 않는다', () => {
    expect(strikeSchedule('axe', 1, 3, 0, 0.35, null).at).toEqual([]);
  });
});

describe('걸음 맞추기', () => {
  it('재생 빠르기 = 화면 속도 ÷ 보폭 ÷ 동작 시간 배율, 상한·하한 안', () => {
    expect(strideTs(false, 2, 1)).toBeCloseTo(2 / STRIDE.walk, 9);
    expect(strideTs(true, 3.6, 1)).toBeCloseTo(3.6 / STRIDE.sprint, 9);
    expect(strideTs(false, 2, 1.25)).toBeCloseTo(2 / STRIDE.walk / 1.25, 9);
    expect(strideTs(false, 0, 1)).toBe(STRIDE.walkTs[0]);
    expect(strideTs(false, 30, 1)).toBe(STRIDE.walkTs[1]);
    expect(strideTs(true, 60, 1.6)).toBe(STRIDE.sprintTs[1]);
  });
});

describe('고개와 숨', () => {
  it('둘러보기·끄덕임은 상한 안이고 사람마다 다르다', () => {
    let maxYaw = 0;
    let maxNod = 0;
    let diff = 0;
    for (let t = 0; t < 120; t += 0.1) {
      maxYaw = Math.max(maxYaw, Math.abs(lookYaw(4, t)));
      const n = nodPitch(4, t);
      expect(n).toBeGreaterThanOrEqual(0);
      maxNod = Math.max(maxNod, n);
      diff += Math.abs(lookYaw(4, t) - lookYaw(9, t));
    }
    expect(maxYaw).toBeLessThanOrEqual(LOOK.lookMax + 1e-9);
    expect(maxYaw).toBeGreaterThan(LOOK.lookMax * 0.5);
    expect(maxYaw).toBeLessThanOrEqual(LOOK.headYawLimit);
    expect(maxNod).toBeLessThanOrEqual(LOOK.nod + 1e-9);
    expect(maxNod).toBeLessThanOrEqual(LOOK.headPitchLimit);
    expect(diff).toBeGreaterThan(1);
  });
});
