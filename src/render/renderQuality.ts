// 렌더 품질 수치 (STYLE-005, MVP_SPEC 45.3, ADR 046). 렌더 전용 값이며 게임 규칙과 무관하다.

/** 해 그림자 지도 값(MVP_SPEC 45.3). */
export const SUN_SHADOW = {
  mapSize: 2048,
  /** 카메라가 보는 곳 주변 반경(칸)의 하한·상한. 멀리서 볼수록 넓힌다 */
  minRadius: 28,
  maxRadius: 70,
  /** 해 쪽으로 떨어진 광원 거리(칸) */
  distance: 90,
  /** 낮·밤 그림자 세기 */
  dayIntensity: 0.62,
  nightIntensity: 0.35,
} as const;
