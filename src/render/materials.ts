// 재질 생성은 이 파일 한 곳에만 있다 (ARCHITECTURE 9.4, AGENTS 5). WebGPU 전환 범위를 줄이기 위해서다.
import * as THREE from 'three';
import { ATLAS_COLUMNS, ATLAS_ROWS } from './atlas';

/** 복셀 셰이더가 받는 점광원 수의 상한 (MVP_SPEC 34 performance.maxPointLights 와 같다). */
export const MAX_VOXEL_POINT_LIGHTS = 16;

/** 복셀 셰이더가 공유하는 조명 uniform. Renderer 가 광원 값으로 갱신한다. */
export interface VoxelLightingUniforms {
  readonly sunDirection: THREE.IUniform<THREE.Vector3>;
  readonly sunColor: THREE.IUniform<THREE.Color>;
  readonly skyAmbient: THREE.IUniform<THREE.Color>;
  readonly groundAmbient: THREE.IUniform<THREE.Color>;
  /** torch 점광원 (TASK-034). 쓰는 개수는 pointCount, 나머지는 무시한다 */
  readonly pointPositions: THREE.IUniform<THREE.Vector3[]>;
  readonly pointColors: THREE.IUniform<THREE.Color[]>;
  readonly pointCount: THREE.IUniform<number>;
  /** 점광원이 닿는 거리(블록) */
  readonly pointRange: THREE.IUniform<number>;
  /** 천장 걷어 내기 (MVP_SPEC 9.3): x = 켜짐(0/1), y = 천장 y, z = 수평 반경 */
  readonly cutParams: THREE.IUniform<THREE.Vector3>;
  /** 천장 걷어 내기의 수평 중심 (x, z) */
  readonly cutCenter: THREE.IUniform<THREE.Vector2>;
}

/** 조명 uniform 한 벌을 만든다. 불투명·반투명 재질이 같은 객체를 공유한다. */
export function createVoxelLighting(): VoxelLightingUniforms {
  return {
    sunDirection: { value: new THREE.Vector3(0.45, 0.8, 0.35).normalize() },
    sunColor: { value: new THREE.Color(1, 1, 1) },
    skyAmbient: { value: new THREE.Color(0.5, 0.5, 0.5) },
    groundAmbient: { value: new THREE.Color(0.3, 0.3, 0.3) },
    pointPositions: {
      value: Array.from({ length: MAX_VOXEL_POINT_LIGHTS }, () => new THREE.Vector3()),
    },
    pointColors: {
      value: Array.from({ length: MAX_VOXEL_POINT_LIGHTS }, () => new THREE.Color(0, 0, 0)),
    },
    pointCount: { value: 0 },
    pointRange: { value: 9 },
    cutParams: { value: new THREE.Vector3(0, 0, 0) },
    cutCenter: { value: new THREE.Vector2(0, 0) },
  };
}

const VERTEX = /* glsl */ `
attribute float ao;
attribute float tile;
varying vec2 vUv;
varying float vTile;
varying float vAo;
varying vec3 vNormal;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vTile = tile;
  vAo = ao;
  vNormal = normal;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D atlas;
uniform vec2 atlasGrid;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 skyAmbient;
uniform vec3 groundAmbient;
uniform float alphaCut;
uniform vec3 pointPositions[16];
uniform vec3 pointColors[16];
uniform int pointCount;
uniform float pointRange;
uniform vec3 cutParams;
uniform vec2 cutCenter;
varying vec2 vUv;
varying float vTile;
varying float vAo;
varying vec3 vNormal;
varying vec3 vWorld;
#include <fog_pars_fragment>
void main() {
  // 천장 걷어 내기: 지붕 밑의 플레이어 주변에서 천장 높이 이상의 면을 그리지 않는다 (MVP_SPEC 9.3).
  // 천장 y 평면의 면은 아래를 향한 면(천장 밑면)만 지우고 위를 향한 면(벽 윗면)은 남긴다
  if (cutParams.x > 0.5 && distance(vWorld.xz, cutCenter) <= cutParams.z) {
    if (vWorld.y > cutParams.y + 0.01 || (vWorld.y > cutParams.y - 0.01 && vNormal.y < -0.5)) discard;
  }
  float t = floor(vTile + 0.5);
  float column = mod(t, atlasGrid.x);
  float row = floor(t / atlasGrid.x);
  // 병합된 쿼드에서도 타일이 블록마다 반복되도록 fract 한다. 경계 텍셀 번짐을 막기 위해 살짝 안쪽을 쓴다
  vec2 local = clamp(fract(vUv), 0.001, 0.999);
  vec4 texel = texture2D(atlas, (vec2(column, row) + local) / atlasGrid);
  if (texel.a < alphaCut) discard;
  // 면 방향별 기본 음영. 해가 없는 면도 형태가 읽히게 한다 (위 1.0 / 옆 0.8~0.9 / 아래 0.6)
  vec3 n = normalize(vNormal);
  float sun = max(dot(n, normalize(sunDirection)), 0.0);
  vec3 ambient = mix(groundAmbient, skyAmbient, n.y * 0.5 + 0.5);
  // 정점 AO 0~1 을 곡선으로 바꾼다. 한 면만 가려도 눈에 띄게 모서리가 어두워진다
  float occlusion = mix(0.2, 1.0, pow(vAo, 1.6));
  float faceShade = n.y > 0.5 ? 1.0 : (n.y < -0.5 ? 0.6 : (abs(n.x) > 0.5 ? 0.82 : 0.9));
  // torch 불빛: 거리 제곱 감쇠, 면이 불을 향할수록 밝다. 모서리 AO 는 그대로 받는다
  vec3 torch = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= pointCount) break;
    vec3 toLight = pointPositions[i] - vWorld;
    float d = length(toLight);
    float att = clamp(1.0 - d / pointRange, 0.0, 1.0);
    float facing = max(dot(n, toLight / max(d, 0.0001)), 0.0) * 0.7 + 0.3;
    torch += pointColors[i] * att * att * facing;
  }
  vec3 color = texel.rgb * (ambient + sunColor * sun + torch) * occlusion * faceShade;
  gl_FragColor = vec4(color, texel.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** 복셀 셰이더 재질 하나를 만든다. transparent 면 깊이 쓰기를 끄고 알파 혼합한다. */
function createVoxelMaterial(
  atlas: THREE.Texture,
  lighting: VoxelLightingUniforms,
  transparent: boolean,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      atlas: { value: atlas },
      atlasGrid: { value: new THREE.Vector2(ATLAS_COLUMNS, ATLAS_ROWS) },
      alphaCut: { value: transparent ? 0.01 : 0.5 },
      ...lighting,
    },
    fog: true,
    transparent,
    depthWrite: !transparent,
    side: THREE.FrontSide,
  });
}

/** 청크 불투명 메시 재질 (ARCHITECTURE 9.4). */
export function createOpaqueMaterial(
  atlas: THREE.Texture,
  lighting: VoxelLightingUniforms,
): THREE.Material {
  return createVoxelMaterial(atlas, lighting, false);
}

/** 청크 반투명 메시 재질 (water / window). 뒤가 비쳐 보인다. */
export function createTransparentMaterial(
  atlas: THREE.Texture,
  lighting: VoxelLightingUniforms,
): THREE.Material {
  return createVoxelMaterial(atlas, lighting, true);
}

/** 캐릭터 임시 모형의 단색 재질. 캐릭터 모델·애니메이션은 TASK-028 / 033 에서 다시 본다. */
export function createCharacterMaterial(color: number): THREE.Material {
  return new THREE.MeshLambertMaterial({ color });
}

/**
 * 주민 머리 위 작은 표지 스프라이트 재질(잠든 주민의 z, TASK-033). 투명도는 뷰가 바꾼다.
 * 조명의 영향을 받지 않아 밤에도 읽힌다.
 */
export function createCharacterSpriteMaterial(texture: THREE.Texture): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
}

/** 침대·문 렌더 모형의 단색 재질 (ADR 026). 캐릭터와 같이 장면 광원(해·반사광·torch)을 받는다. */
export function createPropMaterial(color: number): THREE.Material {
  return new THREE.MeshLambertMaterial({ color });
}

/**
 * 천장 걷어 내기 단면 재질 (MVP_SPEC 9.3). 윗면에 빛이 닿지 않는 밤에도 까맣게 보이지 않도록 약한 자체 밝기를 준다.
 * 색은 인스턴스 색이 곱해진다.
 */
export function createCeilingCapMaterial(): THREE.Material {
  return new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x2e261e });
}

/** 조명과 무관하게 빛나는 단색 재질(몬스터의 눈, TASK-044). 밤에도 보인다. */
export function createEmissiveMaterial(color: number): THREE.Material {
  return new THREE.MeshBasicMaterial({ color });
}

/** 종 연출의 빛 번짐 재질 (TASK-036). 가산 합성, 깊이 쓰기 없음. 투명도는 연출이 매 프레임 바꾼다. */
export function createGlowMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** 조준 블록 테두리 선 재질 (TASK-012). 깊이 검사를 켜 두어 가려진 모서리는 그리지 않는다. */
export function createHighlightMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color: 0x1b1f24, transparent: true, opacity: 0.85 });
}

/** 파괴 균열 오버레이 재질 (TASK-013). 블록 면 앞에 그리도록 polygonOffset 을 준다. */
export function createCrackMaterial(texture: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/**
 * 방 경계·진단 오버레이 재질 (TASK-021 / 022). 인스턴스 색을 쓰며 투명도는 뷰가 매 프레임 바꾼다.
 * xray 면 벽 뒤에서도 보이도록 깊이 검사를 끈다(진단의 실패 좌표·탐색 경로).
 */
export function createRoomOverlayMaterial(xray: boolean): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    depthTest: !xray,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}
