// 소리 크기 수치 (SPEC 12.1·12.3, ADR 053).
import type { SeasonId } from './seasons';

export const SOUND = {
  /** 기본 켜짐·음량과 저장 열쇠. */
  defaultOn: true,
  defaultVolume: 0.6,
  saveKey: 'dotori.sound',
  /** 전체 음량에 곱하는 배경음악·환경음 비율. */
  musicGain: 0.55,
  ambienceGain: 0.8,
  /** 들리는 반경: R = base + 카메라거리 × perDist (타일). */
  hearBase: 8,
  hearPerDist: 0.4,
  /** 확대 배율: clamp(zoomTop − 카메라거리 / zoomDiv, zoomMin, 1). */
  zoomTop: 1.3,
  zoomDiv: 60,
  zoomMin: 0.35,
  /** 늘 부는 바람, 겨울 바람, 눈 올 때 바람. */
  windBase: 0.06,
  windWinter: 0.18,
  windSnow: 0.5,
  rain: 0.8,
  /** 주점 웅성임이 가장 커지는 안의 사람 수. */
  tavernFull: 6,
  /** 점 소리: 가까운 몇 명까지. 치는 박자는 data/motion.ts 의 RHYTHM(SPEC 13.3). */
  hammerMax: 4,
  axeMax: 3,
  /** 완공 종의 최소 크기. */
  doneMin: 0.3,
  /** 새소리 시각 [시작, 끝) 과 풀벌레 시각(끝이 시작보다 작으면 자정을 넘는다). */
  birdHours: [5, 18],
  cricketHours: [19, 5],
} as const;

/** 계절별 새소리·풀벌레 크기 (SPEC 12.3). */
export const SEASON_SOUND: Record<SeasonId, { birds: number; crickets: number }> = {
  spring: { birds: 1, crickets: 0.35 },
  summer: { birds: 0.8, crickets: 1 },
  autumn: { birds: 0.5, crickets: 0.8 },
  winter: { birds: 0.15, crickets: 0 },
};
