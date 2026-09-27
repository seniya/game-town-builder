// 배경음악 재료 (SPEC 12.2, ADR 053): 시간대별 조·화음 진행·빠르기·악기, 리듬 꼴. 곡은 audio/compose.ts 가 짓는다.
import type { SeasonId } from './seasons';

export type MoodId = 'morning' | 'day' | 'evening' | 'night';
export type LeadInst = 'marimba' | 'flute' | 'musicbox';
export type ArpInst = 'harp' | 'marimba' | 'none';

export interface MoodDef {
  id: MoodId;
  /** 시작 시(게임 시각). 다음 시간대 시작 전까지. */
  from: number;
  bpm: number;
  /** 으뜸음(MIDI, 봄 기준). */
  root: number;
  /** 음계(으뜸음에서 반음 간격). */
  scale: readonly number[];
  /** 마디마다 화음(음계 도수, 0 부터). 8 마디 곡에서 앞 4 마디·뒤 4 마디에 되풀이한다. */
  prog: readonly number[];
  /** 7 화음(네 음)으로 쌓는가. */
  seventh: boolean;
  lead: LeadInst;
  /** 앞소리 음 밀도(0~1): 리듬 꼴에서 음을 남길 확률. */
  density: number;
  arp: ArpInst;
  /** 분산화음 박 나눔: 2 면 8 분음표, 1 이면 4 분음표. */
  arpDiv: number;
  pad: boolean;
  bass: boolean;
  /** 앞소리·반주 크기(0~1). */
  leadVel: number;
  arpVel: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const;

/** 시각 순서대로. 밤은 20 시부터 다음 날 5 시까지. */
export const MOODS: readonly MoodDef[] = [
  {
    id: 'morning',
    from: 5,
    bpm: 88,
    root: 60,
    scale: MAJOR,
    prog: [0, 4, 5, 3],
    seventh: false,
    lead: 'marimba',
    density: 0.75,
    arp: 'harp',
    arpDiv: 2,
    pad: false,
    bass: true,
    leadVel: 0.55,
    arpVel: 0.28,
  },
  {
    id: 'day',
    from: 11,
    bpm: 96,
    root: 65,
    scale: MAJOR,
    prog: [0, 3, 1, 4],
    seventh: false,
    lead: 'flute',
    density: 0.7,
    arp: 'marimba',
    arpDiv: 2,
    pad: false,
    bass: true,
    leadVel: 0.42,
    arpVel: 0.24,
  },
  {
    id: 'evening',
    from: 17,
    bpm: 76,
    root: 58,
    scale: MAJOR,
    prog: [0, 5, 3, 4],
    seventh: true,
    lead: 'flute',
    density: 0.55,
    arp: 'harp',
    arpDiv: 2,
    pad: true,
    bass: true,
    leadVel: 0.36,
    arpVel: 0.24,
  },
  {
    id: 'night',
    from: 20,
    bpm: 60,
    root: 63,
    scale: MAJOR,
    prog: [0, 3, 0, 3],
    seventh: true,
    lead: 'musicbox',
    density: 0.35,
    arp: 'none',
    arpDiv: 1,
    pad: true,
    bass: false,
    leadVel: 0.6,
    arpVel: 0,
  },
];

/** 계절 조 옮김(반음). */
export const SEASON_TRANSPOSE: Record<SeasonId, number> = {
  spring: 0,
  summer: 2,
  autumn: -2,
  winter: -4,
};

/**
 * 2 마디(8 분음표 16 칸) 리듬 꼴. 숫자는 그 칸에서 시작하는 음의 길이(8 분음표 수), 0 은 쉼 또는 앞 음이 이어짐.
 * 모두 첫 칸에서 시작하고 마지막 칸 둘레에서 숨을 쉰다.
 */
export const RHYTHMS: readonly (readonly number[])[] = [
  [2, 0, 1, 1, 2, 0, 2, 0, 3, 0, 0, 1, 4, 0, 0, 0],
  [1, 1, 1, 1, 2, 0, 2, 0, 1, 1, 2, 0, 4, 0, 0, 0],
  [3, 0, 0, 1, 2, 0, 2, 0, 3, 0, 0, 1, 2, 0, 2, 0],
  [2, 0, 2, 0, 1, 1, 2, 0, 6, 0, 0, 0, 0, 0, 1, 1],
  [4, 0, 0, 0, 2, 0, 1, 1, 4, 0, 0, 0, 2, 0, 2, 0],
  [1, 1, 2, 0, 1, 1, 2, 0, 2, 0, 1, 1, 4, 0, 0, 0],
];

export const MUSIC = {
  /** 한 곡의 마디 수와 되풀이 수. */
  bars: 8,
  repeats: 2,
  /** 시간대가 바뀔 때 엇갈려 바꾸는 시간(초). */
  crossfade: 4,
  /** 앞소리 음역(MIDI): 이 범위 안에서 걷는다. */
  leadLow: 67,
  leadHigh: 86,
  /** 겨울 종소리 반짝임 확률(마디마다). */
  winterBell: 0.3,
} as const;
