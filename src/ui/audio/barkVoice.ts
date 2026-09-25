// 주민의 한마디 소리: 짧은 웅얼거림의 음 목록 (MVP_SPEC 19.7 / 30, TASK-BARK-002, ADR 042 보완).
// 실제 말소리가 아니라 글자 두 자마다 짧은 음 하나를 낸다. Web Audio 를 모르는 순수 함수라 시험할 수 있다.
// 같은 문장·주민이면 같은 음 목록이다(무작위 없음). 재생은 GameSounds 가 한다.
import type { BarkTopic, NPCRole } from '../../game/types';

/** 음 하나. at 은 웅얼거림 시작부터의 초다. */
export interface BarkBlip {
  readonly at: number;
  readonly freq: number;
  readonly length: number;
}

/** 역할별 기본 음높이(Hz). 목수 낮게 · 농부 중간 · 요리사 높게. */
const ROLE_BASE: Readonly<Record<NPCRole, number>> = {
  carpenter: 196,
  farmer: 262,
  cook: 349,
  villager: 294,
};
/** 글자 코드와 순서로 고르는 오르내림(반음). */
const STEPS = [-2, 0, 2, 3, 5];
/** 음 사이 간격(초)과 음 길이(초). */
const BEAT = 0.085;
const BLIP = 0.07;
/** 한마디의 최대 음 수. */
const MAX_BLIPS = 6;
/** 이 거리(칸) 밖은 소리를 내지 않는다(말풍선 표시 거리와 같다). */
export const BARK_HEAR_DISTANCE = 22;

/** 문자열 해시(FNV-1a 32 비트). */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 반음 수만큼 올린 주파수. */
function semitone(freq: number, steps: number): number {
  return freq * 2 ** (steps / 12);
}

/** 주민의 목소리 기본 음높이. 역할 없는 주민은 id 마다 −2~+2 반음 다르다. */
export function voiceBase(role: NPCRole, npcId: string): number {
  const base = ROLE_BASE[role];
  return role === 'villager' ? semitone(base, (hash(npcId) % 5) - 2) : base;
}

/**
 * 한마디의 음 목록. 글자(공백·문장부호 제외) 두 자마다 하나, 1~6 개.
 * 도피·맞음은 빠르고 높게, 기절은 느리게 내려가고, "?" 로 끝나면 끝음이 오른다.
 */
export function barkBlips(
  text: string,
  role: NPCRole,
  npcId: string,
  topic: BarkTopic,
): BarkBlip[] {
  const letters = [...text].filter((c) => /[\p{L}\p{N}]/u.test(c));
  const count = Math.max(1, Math.min(MAX_BLIPS, Math.ceil(letters.length / 2)));
  const urgent = topic === 'flee' || topic === 'hit';
  const dazed = topic === 'stunned';
  const beat = urgent ? BEAT * 0.7 : dazed ? BEAT * 1.6 : BEAT;
  const length = urgent ? BLIP * 0.8 : dazed ? BLIP * 1.5 : BLIP;
  const base = semitone(voiceBase(role, npcId), urgent ? 4 : 0);
  const asks = text.trimEnd().endsWith('?');
  const out: BarkBlip[] = [];
  for (let i = 0; i < count; i++) {
    const c = letters[i * 2] ?? letters[0] ?? 'a';
    // 글자 코드에 순서를 더해 같은 높이만 이어지지 않게 한다
    let step = STEPS[(c.charCodeAt(0) + i * 2) % STEPS.length] as number;
    if (dazed) step = -i * 2;
    if (asks && i === count - 1) step += 4;
    out.push({ at: i * beat, freq: semitone(base, step), length });
  }
  return out;
}

/** 듣는 위치까지 거리 → 음량 비율(0~1). 가까울수록 크고 BARK_HEAR_DISTANCE 밖은 0. */
export function barkVolume(distance: number): number {
  if (!(distance >= 0) || distance >= BARK_HEAR_DISTANCE) return 0;
  const t = 1 - distance / BARK_HEAR_DISTANCE;
  return Math.min(1, t * t * 1.4);
}

/** 동시에 웅얼거리는 주민 수를 묶는다. 시각은 AudioContext 초다. */
export class BarkVoiceLimiter {
  private ends: number[] = [];

  /** 동시에 낼 수 있는 수를 받는다. */
  constructor(private readonly voices: number) {}

  /** now 에 end 까지 이어지는 웅얼거림을 시작해도 되는가. 되면 자리를 잡고 true. */
  tryStart(now: number, end: number): boolean {
    this.ends = this.ends.filter((e) => e > now);
    if (this.ends.length >= this.voices) return false;
    this.ends.push(end);
    return true;
  }
}
