// 코드로 만드는 소품의 재질은 여기서만 만든다(AGENTS 5 원칙을 v2 에도 적용). 같은 색은 한 번만 만든다.
import * as THREE from 'three';

const standard = new Map<string, THREE.MeshStandardMaterial>();
const basic = new Map<string, THREE.MeshBasicMaterial>();

/** 무광 표준 재질(색별 공유). */
export function matStd(color: string | number, roughness = 0.8): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}`;
  let m = standard.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness });
    standard.set(key, m);
  }
  return m;
}

/** 빛을 받지 않는 재질(전구·선택 고리 등, 색별 공유). */
export function matBasic(color: string | number, opacity = 1): THREE.MeshBasicMaterial {
  const key = `${color}|${opacity}`;
  let m = basic.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
    });
    basic.set(key, m);
  }
  return m;
}

/** 공유하지 않는 반투명 재질(청사진 발자국처럼 색·투명도를 따로 바꾸는 것). */
export function matGhost(color: string | number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
}

/** 공유하지 않는 반투명 표준 재질(수면처럼 시간에 따라 색이 바뀌는 것). */
export function matWater(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x6cc6ec,
    transparent: true,
    opacity: 0.62,
    roughness: 0.15,
    metalness: 0.05,
  });
}

/** 지면 텍스처 재질. */
export function matGround(map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map, roughness: 1 });
}

/** 빛 번짐 스프라이트 재질(밝기를 따로 바꾸므로 공유하지 않는다). */
export function matGlow(map: THREE.Texture, color: number, opacity: number): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map,
    color,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity,
  });
}

/** 선 재질(낚싯줄). */
export function matLine(color: number, opacity: number): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity });
}

/** 양면 재질(우산 천). */
export function matCloth(color: string): THREE.MeshStandardMaterial {
  const key = `cloth|${color}`;
  let m = standard.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.6 });
    standard.set(key, m);
  }
  return m;
}

/** 공사 중인 모형용: 원래 재질을 복제해 자르는 면을 준다(원본은 다른 건물과 공유하므로 바꾸지 않는다). */
export function matClipped(
  src: THREE.Material | THREE.Material[],
  plane: THREE.Plane,
): THREE.Material | THREE.Material[] {
  const one = (m: THREE.Material): THREE.Material => {
    const c = m.clone();
    c.clippingPlanes = [plane];
    c.clipShadows = true;
    c.side = THREE.DoubleSide;
    return c;
  };
  return Array.isArray(src) ? src.map(one) : one(src);
}
