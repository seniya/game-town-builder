// 한국어 조사와 이름 링크 마크업. 소식·일기 문장에 쓴다.
import type { Villager } from './types';

/** 마지막 글자에 받침이 있는가. 한글이 아니면 없다고 본다. */
export function hasBatchim(w: string): boolean {
  const c = w.charCodeAt(w.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return false;
  return (c - 0xac00) % 28 !== 0;
}

/** 단어 + 조사. a 는 받침 없을 때, b 는 받침 있을 때(예: J('보리','가','이')). */
export function J(w: string, a: string, b: string): string {
  return w + (hasBatchim(w) ? b : a);
}

/** 이름 링크(누르면 그 주민에게 간다). */
export function NV(v: Villager): string {
  return `<b class="vn" data-vid="${v.id}">${v.name}</b>`;
}

/** 이름 링크 + 조사. */
export function NJ(v: Villager, a: string, b: string): string {
  return NV(v) + (hasBatchim(v.name) ? b : a);
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** 몇째 날(1 부터). */
export function dayOf(t: number): number {
  return Math.floor(t / 1440) + 1;
}

/** 하루 안의 시(소수). */
export function hourOf(t: number): number {
  return (t % 1440) / 60;
}

/** "07:30" 형식 시각. */
export function fmtClock(t: number): string {
  return `${pad(Math.floor((t % 1440) / 60))}:${pad(t % 60)}`;
}

/** "2일 07:30" 형식. */
export function fmtT(t: number): string {
  return `${dayOf(t)}일 ${fmtClock(t)}`;
}

/** 시간대 이름 (SPEC 1). */
export function phaseName(h: number): string {
  return h < 5
    ? '한밤'
    : h < 6.5
      ? '새벽'
      : h < 11
        ? '아침'
        : h < 17
          ? '낮'
          : h < 20
            ? '저녁'
            : '밤';
}
