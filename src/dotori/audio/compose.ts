// 배경음악 곡 짓기 (SPEC 12.2). Web Audio 를 모르는 순수 함수라 node 에서 시험한다.
// 한 곡은 4/4 박 8 마디, 짜임 A A′ B A. 박(beat) 단위 음 목록을 돌려주고, 연주는 Sound.ts 가 한다.
import { MOODS, MUSIC, RHYTHMS, type MoodDef, type MoodId } from '../data/music';

export type Part = 'lead' | 'arp' | 'pad' | 'bass' | 'bell';

export interface Note {
  /** 곡 처음에서 몇째 박. */
  beat: number;
  /** 길이(박). */
  dur: number;
  midi: number;
  part: Part;
  /** 세기(0~1). */
  vel: number;
}

export interface Song {
  mood: MoodId;
  bpm: number;
  /** 곡 길이(박). */
  beats: number;
  notes: Note[];
}

/** 0 이상 1 미만 난수. 시험에서는 시드 난수를 넣는다. */
export type Rand = () => number;

/** 게임 시각(소수 시)의 시간대. */
export function moodAt(hour: number): MoodDef {
  let m = MOODS[MOODS.length - 1] as MoodDef;
  for (const d of MOODS) if (hour >= d.from) m = d;
  if (hour < (MOODS[0] as MoodDef).from) m = MOODS[MOODS.length - 1] as MoodDef;
  return m;
}

/** 음 높이의 음이름 번호(0~11). */
function pc(m: number): number {
  return ((m % 12) + 12) % 12;
}

/** 도수 d 화음의 음이름 번호들(으뜸음·3 음·5 음·[7 음]). */
export function chordPcs(mood: MoodDef, degree: number, transpose: number): number[] {
  const n = mood.seventh ? 4 : 3;
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = degree + k * 2;
    const s = mood.scale[i % mood.scale.length] ?? 0;
    out.push(pc(mood.root + transpose + s + 12 * Math.floor(i / mood.scale.length)));
  }
  return out;
}

/** 앞소리 음역 안의 음계 음(낮은 것부터). */
export function leadPitches(mood: MoodDef, transpose: number): number[] {
  const inScale = new Set(mood.scale.map((s) => pc(mood.root + transpose + s)));
  const out: number[] = [];
  for (let m = MUSIC.leadLow; m <= MUSIC.leadHigh; m++) if (inScale.has(pc(m))) out.push(m);
  return out;
}

/** 목록에서 하나 고르기. */
function pick<T>(list: readonly T[], rand: Rand): T {
  return list[Math.floor(rand() * list.length) % list.length] as T;
}

/** pos 둘레에서 화음 구성음인 가장 가까운 자리. */
function snap(pitches: readonly number[], pos: number, chord: readonly number[]): number {
  for (let d = 0; d < pitches.length; d++)
    for (const p of [pos - d, pos + d]) {
      const m = pitches[p];
      if (m != null && chord.includes(pc(m))) return p;
    }
  return pos;
}

interface PhraseNote {
  slot: number;
  len: number;
  pos: number;
}

/** 2 마디 가락: 리듬 꼴을 고르고 음계 위를 한두 칸씩 걷는다. 강박(1·3 박)은 화음 구성음. */
function phrase(
  mood: MoodDef,
  pitches: readonly number[],
  chords: readonly (readonly number[])[],
  start: number,
  rand: Rand,
): PhraseNote[] {
  const rh = pick(RHYTHMS, rand);
  const out: PhraseNote[] = [];
  let pos = start;
  const mid = Math.floor(pitches.length / 2);
  rh.forEach((len, slot) => {
    if (!len) return;
    const long = len >= 3;
    if (slot > 0 && !long && rand() > mood.density) return;
    if (out.length) {
      // 가운데로 돌아오려는 쏠림을 준 걸음.
      const pull = pos > mid + 3 ? -1 : pos < mid - 3 ? 1 : 0;
      const step = pick([-2, -1, -1, 0, 1, 1, 2], rand) + (rand() < 0.35 ? pull : 0);
      pos = Math.max(0, Math.min(pitches.length - 1, pos + step));
    }
    if (slot % 4 === 0) pos = snap(pitches, pos, chords[slot < 8 ? 0 : 1] ?? []);
    out.push({ slot, len, pos });
  });
  return out;
}

/** 같은 리듬으로 뒤 화음에 맞춘 가락(A′). */
function refit(
  src: readonly PhraseNote[],
  pitches: readonly number[],
  chords: readonly (readonly number[])[],
): PhraseNote[] {
  return src.map((n) =>
    n.slot % 4 === 0 ? { ...n, pos: snap(pitches, n.pos, chords[n.slot < 8 ? 0 : 1] ?? []) } : n,
  );
}

/** 한 곡을 짓는다. transpose 는 계절 조 옮김, bell 은 겨울 종소리. */
export function composeSong(mood: MoodDef, transpose: number, rand: Rand, bell = false): Song {
  const notes: Note[] = [];
  const bars = MUSIC.bars;
  const prog = mood.prog;
  const chordOf = (bar: number): number[] =>
    chordPcs(mood, prog[bar % prog.length] ?? 0, transpose);
  const pitches = leadPitches(mood, transpose);
  const hum = (v: number): number => Math.max(0.05, Math.min(1, v * (0.88 + rand() * 0.24)));
  // 앞소리: A A′ B A.
  const start = snap(pitches, Math.floor(pitches.length / 2) - 1, chordOf(0));
  const A = phrase(mood, pitches, [chordOf(0), chordOf(1)], start, rand);
  const A2 = refit(A, pitches, [chordOf(2), chordOf(3)]);
  const B = phrase(
    mood,
    pitches,
    [chordOf(4), chordOf(5)],
    Math.min(pitches.length - 1, start + 2),
    rand,
  );
  const A3 = refit(A, pitches, [chordOf(6), chordOf(7)]);
  const rootPc = pc(mood.root + transpose);
  // 끝 음은 으뜸음으로 길게.
  const last = A3[A3.length - 1];
  if (last) {
    let p = last.pos;
    for (let d = 0; d < pitches.length; d++) {
      const up = pitches[last.pos + d];
      const dn = pitches[last.pos - d];
      if (dn != null && pc(dn) === rootPc) {
        p = last.pos - d;
        break;
      }
      if (up != null && pc(up) === rootPc) {
        p = last.pos + d;
        break;
      }
    }
    A3[A3.length - 1] = { slot: last.slot, len: 16 - last.slot, pos: p };
  }
  [A, A2, B, A3].forEach((ph, k) => {
    for (const n of ph)
      notes.push({
        beat: k * 8 + n.slot / 2,
        dur: n.len / 2,
        midi: pitches[n.pos] ?? 72,
        part: 'lead',
        vel: hum(mood.leadVel * (n.slot % 4 === 0 ? 1 : 0.85)),
      });
  });
  // 반주: 분산화음·패드·베이스·겨울 종.
  const base = mood.root + transpose - 12;
  for (let bar = 0; bar < bars; bar++) {
    const ch = chordOf(bar);
    const voiced = ch.map((c) => {
      let m = base + pc(c - base);
      if (m < base) m += 12;
      return m;
    });
    voiced.sort((a, b) => a - b);
    const b0 = bar * 4;
    if (mood.arp !== 'none') {
      const up = voiced.length === 4 ? [0, 1, 2, 3, 2, 1, 2, 1] : [0, 1, 2, 1, 0, 1, 2, 1];
      const steps = 4 * mood.arpDiv;
      for (let i = 0; i < steps; i++) {
        const idx = up[i % up.length] ?? 0;
        const top = i === steps - 2 && rand() < 0.3;
        notes.push({
          beat: b0 + i / mood.arpDiv,
          dur: 1.5 / mood.arpDiv,
          midi: (voiced[idx] ?? base) + (top ? 12 : 0),
          part: 'arp',
          vel: hum(mood.arpVel * (i % mood.arpDiv === 0 ? 1 : 0.8)),
        });
      }
    }
    if (mood.pad)
      for (const m of voiced) notes.push({ beat: b0, dur: 4, midi: m, part: 'pad', vel: 0.22 });
    if (mood.bass) {
      const r = base - 12 + pc((ch[0] ?? 0) - base);
      const fifth = base - 12 + pc((ch[2] ?? 0) - base);
      notes.push({ beat: b0, dur: 2, midi: r, part: 'bass', vel: hum(0.5) });
      notes.push({
        beat: b0 + 2,
        dur: 2,
        midi: fifth < r ? fifth + 12 : fifth,
        part: 'bass',
        vel: hum(0.4),
      });
    }
    if (bell && rand() < MUSIC.winterBell) {
      const m = (voiced[Math.floor(rand() * voiced.length)] ?? base) + 36;
      notes.push({
        beat: b0 + Math.floor(rand() * 4),
        dur: 3,
        midi: m,
        part: 'bell',
        vel: hum(0.25),
      });
    }
  }
  notes.sort((a, b) => a.beat - b.beat);
  return { mood: mood.id, bpm: mood.bpm, beats: bars * 4, notes };
}

/** MIDI 번호 → 주파수(Hz). */
export function midiHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
