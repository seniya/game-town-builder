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

/** 나뭇잎 계절 색 셰이더가 함께 읽는 값(SPEC 12.4). 색 셋 중 하나를 나무마다 고르고, 초록 부분만 amt 만큼 섞는다. */
export const FOLIAGE_UNIFORMS = {
  uTint0: { value: new THREE.Color('#5fae4a') },
  uTint1: { value: new THREE.Color('#5fae4a') },
  uTint2: { value: new THREE.Color('#5fae4a') },
  uSplit: { value: new THREE.Vector2(1, 1) },
  uAmt: { value: 0 },
};

/** 상록수(침엽수) 몫. 봄 꽃·가을 단풍 없이 초록 짙기와 겨울 눈만 바뀐다. */
export const EVERGREEN_UNIFORMS = {
  uTint0: { value: new THREE.Color('#4f8f4a') },
  uTint1: { value: new THREE.Color('#4f8f4a') },
  uTint2: { value: new THREE.Color('#4f8f4a') },
  uSplit: { value: new THREE.Vector2(1, 1) },
  uAmt: { value: 0 },
};

const foliage = new Map<THREE.Material, THREE.Material>();
const evergreen = new Map<THREE.Material, THREE.Material>();

/** 활엽수 모형 재질: 복제해 계절 색 셰이더를 붙인다(원본은 다른 모형과 공유하므로 바꾸지 않는다). */
export function matFoliage(src: THREE.Material): THREE.Material {
  return seasonal(src, foliage, FOLIAGE_UNIFORMS, 'dotori-foliage');
}

/** 상록수 모형 재질. */
export function matEvergreen(src: THREE.Material): THREE.Material {
  return seasonal(src, evergreen, EVERGREEN_UNIFORMS, 'dotori-evergreen');
}

/** 계절 색 셰이더를 붙인 복제 재질(원본별 한 번만 만든다). */
function seasonal(
  src: THREE.Material,
  cache: Map<THREE.Material, THREE.Material>,
  uniforms: typeof FOLIAGE_UNIFORMS,
  key: string,
): THREE.Material {
  let m = cache.get(src);
  if (m) return m;
  m = src.clone();
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSeasonVar;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
vSeasonVar = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
#else
vSeasonVar = 0.0;
#endif`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vSeasonVar;
uniform vec3 uTint0;
uniform vec3 uTint1;
uniform vec3 uTint2;
uniform vec2 uSplit;
uniform float uAmt;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float gr = diffuseColor.g - max(diffuseColor.r, diffuseColor.b);
  float leaf = smoothstep(0.015, 0.1, gr);
  vec3 tint = vSeasonVar < uSplit.x ? uTint0 : (vSeasonVar < uSplit.y ? uTint1 : uTint2);
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  vec3 seasonal = tint * (0.55 + lum * 1.2);
  diffuseColor.rgb = mix(diffuseColor.rgb, seasonal, leaf * uAmt);
}`,
      );
  };
  m.customProgramCacheKey = () => key;
  cache.set(src, m);
  return m;
}

const depth = new Map<string, THREE.MeshDepthMaterial>();

/** 그림자 패스에서 셰이더가 바뀌는 조건(스킨·인스턴스·색·텍스처·알파 자르기·면)을 한 줄로 만든다. */
function depthKey(o: THREE.Mesh, mat: THREE.Material): string {
  const inst = o as THREE.InstancedMesh;
  const map = (mat as THREE.MeshStandardMaterial).map;
  return [
    (o as THREE.SkinnedMesh).isSkinnedMesh ? 's' : '',
    inst.isInstancedMesh ? 'i' : '',
    inst.isInstancedMesh && inst.instanceColor ? 'c' : '',
    map ? 'm' : '',
    mat.alphaTest > 0 ? 'a' : '',
    mat.shadowSide ?? mat.side,
  ].join('');
}

/**
 * 그림자 패스의 깊이 재질을 메시 종류별로 나눠 준다(SPEC 7, ADR 054).
 * three 는 따로 정하지 않은 메시 모두에 깊이 재질 하나를 돌려 쓴다. 그래서 스킨 메시·인스턴스·텍스처 모형이
 * 섞여 그려지면 물체마다 셰이더를 다시 고른다(주민 100 명에서 CPU 의 약 8 %). 종류마다 하나씩 주면 고르지 않는다.
 * 보통 메시(스킨·인스턴스·텍스처 없음, 앞면)는 기본 재질에 그대로 두고, 자르는 면이 있는 재질(공사 중)은 three 에 맡긴다.
 */
export function shareShadowDepth(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const o = obj as THREE.Mesh;
    if (!o.isMesh || !o.castShadow || o.customDepthMaterial) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const first = mats[0];
    if (!first || mats.some((m) => m.clippingPlanes && m.clippingPlanes.length > 0)) return;
    const key = depthKey(o, first);
    if (mats.some((m) => depthKey(o, m) !== key)) return;
    if (key === String(THREE.FrontSide)) return;
    let d = depth.get(key);
    if (!d) {
      d = new THREE.MeshDepthMaterial();
      depth.set(key, d);
    }
    o.customDepthMaterial = d;
  });
}
