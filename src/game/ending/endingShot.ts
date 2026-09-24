// 엔딩 카메라 샷 계산 (TASK-052). three 없이 게임 상태의 좌표만으로 시점과 주시점을 정한다. 렌더가 이 값으로 카메라를 둔다.
import { ENDING_CAMERA as C, ENDING_SHOTS, type EndingShot } from '../data/ending';
import type { Vec3 } from '../types';

/** 샷 계산에 쓰는 장면 좌표. */
export interface EndingScene {
  /** 종(광장 중심) */
  readonly bell: Vec3;
  /** 목수의 위치. 없으면 종을 본다 */
  readonly carpenter: Vec3 | null;
  /** 주민 위치들 */
  readonly residents: readonly Vec3[];
}

/** 카메라 자세. */
export interface EndingPose {
  readonly eye: Vec3;
  readonly target: Vec3;
}

/** 연출 전체 길이(초). */
export const ENDING_TOTAL_SECONDS = ENDING_SHOTS.reduce((s, x) => s + x.seconds, 0);

/** t 초의 샷과 그 샷 안의 진행도(0~1). t 가 끝을 넘으면 null. */
export function shotAt(t: number): { shot: EndingShot; index: number; u: number } | null {
  let start = 0;
  for (let i = 0; i < ENDING_SHOTS.length; i++) {
    const shot = ENDING_SHOTS[i];
    if (!shot) continue;
    if (t < start + shot.seconds)
      return { shot, index: i, u: Math.max(0, (t - start) / shot.seconds) };
    start += shot.seconds;
  }
  return null;
}

/** 부드러운 0~1 보간. */
function ease(u: number): number {
  return u * u * (3 - 2 * u);
}

/** 좌표들의 평균. 비었으면 fallback. */
function centroid(list: readonly Vec3[], fallback: Vec3): Vec3 {
  if (list.length === 0) return fallback;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of list) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  return { x: x / list.length, y: y / list.length, z: z / list.length };
}

/** 중심 둘레 궤도 위의 점. */
function orbit(center: Vec3, radius: number, height: number, angle: number): Vec3 {
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + height,
    z: center.z + Math.sin(angle) * radius,
  };
}

/** t 초의 카메라 자세. 연출이 끝났으면 null. */
export function endingPose(t: number, scene: EndingScene): EndingPose | null {
  const at = shotAt(t);
  if (!at) return null;
  const { shot, u } = at;
  const e = ease(u);
  const bell = scene.bell;
  switch (shot.kind) {
    case 'wideOrbit':
      return {
        eye: orbit(bell, C.orbitRadius, C.orbitHeight, 0.6 + C.orbitSweep * e),
        target: bell,
      };
    case 'carpenter': {
      const c = scene.carpenter ?? bell;
      // 목수를 조금씩 돌아 보며 위에서 내려다본다(벽 안쪽에 카메라가 박히지 않게 높게 둔다)
      const target = { x: c.x, y: c.y + 1, z: c.z };
      return { eye: orbit(c, C.carpenterBack, C.carpenterUp, 2.2 + 0.4 * e), target };
    }
    case 'residents': {
      const m = centroid(scene.residents, bell);
      return {
        eye: {
          x: m.x - C.residentsBack * 0.6,
          y: m.y + C.residentsUp,
          z: m.z + C.residentsBack * (0.9 - 0.2 * e),
        },
        target: m,
      };
    }
    case 'rise': {
      const h = C.riseFromHeight + (C.riseToHeight - C.riseFromHeight) * e;
      return { eye: orbit(bell, C.riseRadius, h, 3.4 + 0.5 * e), target: bell };
    }
  }
}
