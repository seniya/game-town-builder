// 재질 생성은 이 파일 한 곳에만 있다 (ARCHITECTURE 9.4, AGENTS 5). WebGPU 전환 범위를 줄이기 위해서다.
import * as THREE from 'three';
import { BlockId } from '../game/data/blocks';

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
  /** 하늘 천정색·지평선색(물 반사, MVP_SPEC 45.3). DayNightVisual 이 시각마다 바꾼다 */
  readonly skyZenith: THREE.IUniform<THREE.Color>;
  readonly skyHorizon: THREE.IUniform<THREE.Color>;
  /** 실초. 물결·구름이 움직인다 */
  readonly time: THREE.IUniform<number>;
  /** 0 낮 ~ 1 밤 */
  readonly night: THREE.IUniform<number>;
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
    skyZenith: { value: new THREE.Color(0x5aa6e6) },
    skyHorizon: { value: new THREE.Color(0xd4ecf7) },
    time: { value: 0 },
    night: { value: 0 },
  };
}

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
attribute float ao;
attribute float tile;
varying vec2 vUv;
varying float vTile;
varying float vAo;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vTile = tile;
  vAo = ao;
  vNormal = normal;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 transformedNormal = normalMatrix * normal;
  // 그림자 조회 위치만 면 바깥으로 조금 띄워 자기 그림자 얼룩(acne)을 줄인다
  vec4 worldPosition = modelMatrix * vec4(position + normal * 0.04, 1.0);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <shadowmap_vertex>
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <shadowmap_pars_fragment>
uniform sampler2DArray atlas;
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
uniform vec3 skyZenith;
uniform vec3 skyHorizon;
uniform float time;
uniform float night;
varying vec2 vUv;
varying float vTile;
varying float vAo;
varying vec3 vNormal;
varying vec3 vWorld;

/** 격자 값 해시(0~1). */
float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

/** 해 그림자(1 = 빛, 0 = 그늘). 그림자 지도가 없으면 1 이다. */
float sunShadow() {
  float shadow = 1.0;
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    DirectionalLightShadow ds = directionalLightShadows[ 0 ];
    shadow = getShadow( directionalShadowMap[ 0 ], ds.shadowMapSize, ds.shadowIntensity, ds.shadowBias, ds.shadowRadius, vDirectionalShadowCoord[ 0 ] );
  #endif
  return shadow;
}

void main() {
  // 천장 걷어 내기: 지붕 밑의 플레이어 주변에서 천장 높이 이상의 면을 그리지 않는다 (MVP_SPEC 9.3).
  // 천장 y 평면의 면은 아래를 향한 면(천장 밑면)만 지우고 위를 향한 면(벽 윗면)은 남긴다
  if (cutParams.x > 0.5 && distance(vWorld.xz, cutCenter) <= cutParams.z) {
    if (vWorld.y > cutParams.y + 0.01 || (vWorld.y > cutParams.y - 0.01 && vNormal.y < -0.5)) discard;
  }
  float t = floor(vTile + 0.5);
  float block = floor(t / 3.0 + 0.01);
  // 병합된 쿼드에서도 타일이 블록마다 반복되도록 fract 한다. 밉맵 단계는 fract 전의 uv 미분으로 골라
  // 블록 경계에서 미분이 튀어 생기는 줄을 막는다 (STYLE-004)
  vec2 local = fract(vUv);
  vec4 texel = textureGrad(atlas, vec3(local, t), dFdx(vUv), dFdy(vUv));
  if (texel.a < alphaCut) discard;
  // 넓은 땅의 같은 무늬 반복이 드러나지 않게 월드 좌표의 낮은 주파수로 밝기를 조금 흔든다
  vec2 mp = vWorld.xz * 0.045 + vWorld.y * 0.03;
  vec2 mi = floor(mp);
  vec2 mf = fract(mp);
  mf = mf * mf * (3.0 - 2.0 * mf);
  float macro = mix(mix(hash12(mi), hash12(mi + vec2(1.0, 0.0)), mf.x),
                    mix(hash12(mi + vec2(0.0, 1.0)), hash12(mi + vec2(1.0, 1.0)), mf.x), mf.y);
  texel.rgb *= 0.93 + 0.14 * macro;
  // 면 방향별 기본 음영. 해가 없는 면도 형태가 읽히게 한다 (위 1.0 / 옆 0.8~0.9 / 아래 0.6)
  vec3 n = normalize(vNormal);
  float sun = max(dot(n, normalize(sunDirection)), 0.0) * sunShadow();
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
  float alpha = texel.a;
  // 스스로 빛나는 칸과 물 (MVP_SPEC 45.3)
  if (abs(block - TORCH_BLOCK) < 0.5) {
    // 불꽃은 조명과 무관하게 밝아 빛 번짐을 받는다
    color += texel.rgb * 1.6 * step(0.7, texel.r);
  } else if (abs(block - WINDOW_BLOCK) < 0.5) {
    // 창문 유리는 가까운 torch 불빛(방 안의 불)을 받아 밤에 따뜻하게 빛난다
    float glass = 1.0 - smoothstep(0.5, 0.9, texel.a);
    float glow = min(length(torch), 1.2) * (0.35 + 0.65 * night) * glass;
    color += vec3(1.0, 0.68, 0.36) * glow * 1.4;
    alpha = max(alpha, glow * 0.8);
  } else if (abs(block - WATER_BLOCK) < 0.5 && n.y > 0.5) {
    // 물: 잔물결 법선으로 하늘을 비추고(프레넬) 해 반짝임을 더한다
    vec2 p = vWorld.xz;
    vec3 wn = normalize(vec3(
      sin(p.x * 1.7 + time * 1.3) * 0.06 + sin(p.y * 2.9 - time * 1.9) * 0.04,
      1.0,
      cos(p.y * 1.5 + time * 1.1) * 0.06 + cos(p.x * 3.1 + time * 1.7) * 0.04));
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - max(dot(wn, viewDir), 0.0), 3.0);
    vec3 reflected = mix(skyHorizon, skyZenith, clamp(reflect(-viewDir, wn).y * 1.5, 0.0, 1.0));
    // 반사는 물빛과 섞어 옅은 지평선색에 물이 회색으로 바래지 않게 한다
    reflected = mix(reflected, vec3(0.16, 0.45, 0.72), 0.45) * (0.55 + 0.45 * (1.0 - night));
    color = mix(color, reflected, 0.12 + 0.45 * fresnel);
    float spec = pow(max(dot(reflect(-normalize(sunDirection), wn), viewDir), 0.0), 90.0);
    color += sunColor * spec * 2.2 * sunShadow();
    alpha = mix(alpha, 0.88, fresnel * 0.7);
  }
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** 스스로 빛나거나 따로 비추는 블록 id 를 셰이더 정의로 넘긴다. */
const VOXEL_DEFINES = {
  TORCH_BLOCK: `${BlockId.torch}.0`,
  WINDOW_BLOCK: `${BlockId.window}.0`,
  WATER_BLOCK: `${BlockId.water}.0`,
};

/**
 * 복셀 셰이더 재질 하나를 만든다. transparent 면 깊이 쓰기를 끄고 알파 혼합한다.
 * lights 를 켜 three 의 방향광 그림자 지도를 받는다(ADR 046). 광원 값 자체는 lighting uniform 으로 받는다.
 */
function createVoxelMaterial(
  atlas: THREE.Texture,
  lighting: VoxelLightingUniforms,
  transparent: boolean,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    defines: VOXEL_DEFINES,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
      atlas: { value: atlas },
      alphaCut: { value: transparent ? 0.01 : 0.5 },
      ...lighting,
    },
    fog: true,
    lights: true,
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

/**
 * 청크 메시의 그림자 깊이 재질(ADR 046). 천장 걷어 내기로 지운 면은 그림자도 던지지 않는다.
 * 그래서 집 안을 들여다보는 동안 방이 지붕 그림자로 어두워지지 않는다.
 */
export function createVoxelDepthMaterial(lighting: VoxelLightingUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { cutParams: lighting.cutParams, cutCenter: lighting.cutCenter },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vNy;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vNy = normal.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 cutParams;
      uniform vec2 cutCenter;
      varying vec3 vWorld;
      varying float vNy;
      void main() {
        if (cutParams.x > 0.5 && distance(vWorld.xz, cutCenter) <= cutParams.z) {
          if (vWorld.y > cutParams.y + 0.01 || (vWorld.y > cutParams.y - 0.01 && vNy < -0.5)) discard;
        }
        gl_FragColor = vec4(1.0);
      }
    `,
  });
}

/**
 * 캐릭터 임시 모형의 단색 재질. 캐릭터 모델·애니메이션은 TASK-028 / 033 에서 다시 본다.
 * 밝기는 복셀 셰이더 규약에 맞춘다(MVP_SPEC 45.3, liftToVoxelLighting).
 */
export function createCharacterMaterial(color: number): THREE.Material {
  const material = new THREE.MeshLambertMaterial({ color });
  liftToVoxelLighting(material, 0);
  return material;
}

/**
 * 주민 머리 위 작은 표지 스프라이트 재질(잠든 주민의 z, TASK-033). 투명도는 뷰가 바꾼다.
 * 조명의 영향을 받지 않아 밤에도 읽힌다.
 */
export function createCharacterSpriteMaterial(texture: THREE.Texture): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
}

/**
 * 침대·문 렌더 모형의 단색 재질 (ADR 026). 캐릭터와 같이 장면 광원(해·반사광·torch)을 받는다.
 * 밝기는 복셀 셰이더 규약에 맞춘다(MVP_SPEC 45.3).
 */
export function createPropMaterial(color: number): THREE.Material {
  const material = new THREE.MeshLambertMaterial({ color });
  liftToVoxelLighting(material, 0);
  return material;
}

/**
 * 천장 걷어 내기 단면 재질 (MVP_SPEC 9.3). 윗면에 빛이 닿지 않는 밤에도 까맣게 보이지 않도록 약한 자체 밝기를 준다.
 * 색은 인스턴스 색이 곱해진다.
 */
export function createCeilingCapMaterial(): THREE.Material {
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x2e261e });
  liftToVoxelLighting(material, 0);
  return material;
}

/** 조명과 무관하게 빛나는 단색 재질(몬스터의 눈, TASK-044). 밤에도 보인다. */
export function createEmissiveMaterial(color: number): THREE.Material {
  return new THREE.MeshBasicMaterial({ color });
}

/** 미수리 피해 표시 재질 (TASK-049). 붉은 반투명, 깊이 쓰기 없음. */
export function createDamageMarkMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xff3b2f,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
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

// ── 확장 X0 시안 재질 (STYLE-001, ADR 045) ─────────────────────────────────────

/**
 * 툰 명암 계단 텍스처. steps 단계로 빛을 끊는다(2 = 그늘·빛, 3 = 그늘·중간·빛).
 * 가장 어두운 단도 너무 까맣지 않게 둔다(반사광이 더해진다).
 */
export function createToonGradient(steps: 2 | 3): THREE.DataTexture {
  const levels = steps === 2 ? [150, 255] : [120, 195, 255];
  const data = new Uint8Array(levels.length * 4);
  levels.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const texture = new THREE.DataTexture(data, levels.length, 1, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * three 표준 재질의 빛을 복셀 셰이더 규약에 맞춘다(STYLE-001 에서 확인).
 * 복셀 셰이더는 `albedo × (반사광 + 해 × cosθ)` 이고 three 의 Lambert·Toon 은 같은 광원 값을 π 로 나눈다.
 * 그래서 같은 광원 아래 캐릭터·가구가 블록보다 어둡게 보인다. 시안 재질은 π 를 곱해 블록과 같은 밝기로 그린다.
 * rim 이 0 보다 크면 시선과 거의 직각인 가장자리를 밝혀 둥근 덩어리가 배경에서 떠 보이게 한다.
 */
function liftToVoxelLighting(material: THREE.Material, rim: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms['lightScale'] = { value: Math.PI };
    shader.uniforms['rimStrength'] = { value: rim };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform float lightScale;\nuniform float rimStrength;\nvoid main() {',
      )
      .replace(
        '#include <opaque_fragment>',
        [
          'outgoingLight *= lightScale;',
          'float rimDot = 1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0);',
          'outgoingLight += diffuseColor.rgb * rimStrength * smoothstep(0.62, 0.9, rimDot);',
          '#include <opaque_fragment>',
        ].join('\n'),
      );
  };
}

/**
 * 시안 캐릭터·소품 재질: 정점 색 + 툰 명암 + 가장자리 밝힘(rim). gradientMap 을 바꾸면 명암 단계가 바뀐다.
 * 밝기는 복셀 셰이더 규약에 맞춘다(liftToVoxelLighting).
 */
export function createToonMaterial(gradient: THREE.Texture, rim = 0.22): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
  liftToVoxelLighting(material, rim);
  return material;
}

/**
 * 반전 껍질(inverted hull) 외곽선 재질. 뒷면만 그리며 정점을 법선 방향으로 thickness 만큼 부풀린다.
 * 같은 지오메트리를 한 번 더 그려 실루엣 둘레에 선이 생긴다.
 */
export function createOutlineMaterial(color = 0x3b2b25, thickness = 0.011): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { outlineColor: { value: new THREE.Color(color) }, thickness: { value: thickness } },
    // 스키닝(사람, STYLE-002)과 인스턴싱(가구, STYLE-003) 메시에도 쓴다. three 가 메시 종류에 맞춰 정의를 켠다
    vertexShader: [
      '#include <common>',
      '#include <skinning_pars_vertex>',
      'uniform float thickness;',
      'void main() {',
      '  vec3 objectNormal = normal;',
      '  #include <skinbase_vertex>',
      '  #include <skinnormal_vertex>',
      '  vec3 transformed = position;',
      '  #include <skinning_vertex>',
      '  transformed += normalize(objectNormal) * thickness;',
      '  vec4 p = vec4(transformed, 1.0);',
      '  #ifdef USE_INSTANCING',
      '    p = instanceMatrix * p;',
      '  #endif',
      '  gl_Position = projectionMatrix * modelViewMatrix * p;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 outlineColor;',
      'void main() {',
      '  gl_FragColor = vec4(outlineColor, 1.0);',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
    side: THREE.BackSide,
  });
}

/**
 * 사람·가구 모형 재질(STYLE-002·003): 정점 색 + 툰 명암 + 가장자리 밝힘 + 무조명 부위.
 * 지오메트리의 `unlit` 속성이 1 인 정점(눈·입)은 명암 없이 제 색으로, 2 인 정점(불꽃)은 스스로 빛난다.
 * 한 캐릭터를 메시 하나로 그리기 위해 눈·입을 따로 떼지 않는다. 밝기는 복셀 셰이더 규약을 따른다.
 */
export function createModelToonMaterial(
  gradient: THREE.Texture,
  rim = 0.2,
): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
  material.onBeforeCompile = (shader) => {
    shader.uniforms['lightScale'] = { value: Math.PI };
    shader.uniforms['rimStrength'] = { value: rim };
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      'attribute float unlit;\nvarying float vUnlit;\nvoid main() {\n  vUnlit = unlit;',
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform float lightScale;\nuniform float rimStrength;\nvarying float vUnlit;\nvoid main() {',
      )
      .replace(
        '#include <opaque_fragment>',
        [
          'outgoingLight *= lightScale;',
          'float rimDot = 1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0);',
          'outgoingLight += diffuseColor.rgb * rimStrength * smoothstep(0.62, 0.9, rimDot);',
          // 무조명 부위(1)는 제 색, 빛나는 부위(2, 불꽃)는 제 색의 3 배라 빛 번짐 문턱을 넘는다
          'outgoingLight = mix(outgoingLight, diffuseColor.rgb * 0.95, min(vUnlit, 1.0));',
          'outgoingLight *= 1.0 + max(vUnlit - 1.0, 0.0) * 2.0;',
          '#include <opaque_fragment>',
        ].join('\n'),
      );
  };
  return material;
}

/** 시안 캐릭터의 눈·입처럼 명암 없이 또렷해야 하는 부분(정점 색). */
export function createFlatVertexColorMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ vertexColors: true });
}

/** 시안 블록 타일 재질(STYLE-001). 지금 블록과 같은 방향광·반사광을 같은 밝기 규약으로 받는다. */
export function createStyleBlockMaterial(texture: THREE.Texture): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ map: texture });
  liftToVoxelLighting(material, 0);
  return material;
}

// ── 렌더 품질 (STYLE-005, MVP_SPEC 45.3, ADR 046) ────────────────────────────────

/** 하늘 돔 uniform. DayNightVisual 이 시각마다 값을 바꾼다. */
export interface SkyUniforms {
  readonly zenith: THREE.IUniform<THREE.Color>;
  readonly horizon: THREE.IUniform<THREE.Color>;
  /** 해(밤에는 달)의 방향 */
  readonly sunDirection: THREE.IUniform<THREE.Vector3>;
  readonly sunColor: THREE.IUniform<THREE.Color>;
  /** 0 낮 ~ 1 밤. 별과 달의 세기 */
  readonly night: THREE.IUniform<number>;
  /** 실초. 구름이 흐른다 */
  readonly time: THREE.IUniform<number>;
}

/** 하늘 돔 uniform 한 벌. */
export function createSkyUniforms(): SkyUniforms {
  return {
    zenith: { value: new THREE.Color(0x5aa6e6) },
    horizon: { value: new THREE.Color(0xd4ecf7) },
    sunDirection: { value: new THREE.Vector3(0.45, 0.8, 0.35).normalize() },
    sunColor: { value: new THREE.Color(1, 0.95, 0.85) },
    night: { value: 0 },
    time: { value: 0 },
  };
}

/**
 * 하늘 돔 재질: 천정 ↔ 지평선 그라데이션, 해 광륜, 흐르는 구름, 밤의 별과 달.
 * 돔 안쪽만 그리고 깊이를 쓰지 않으며 안개를 받지 않는다(지평선색이 곧 안개색이다).
 */
export function createSkyMaterial(uniforms: SkyUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 sunDirection;
      uniform vec3 sunColor;
      uniform float night;
      uniform float time;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      // 옥타브마다 축을 돌려 값 잡음의 네모난 격자가 드러나지 않게 한다
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p * 2.03 + 17.1; a *= 0.5; }
        return v;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -1.0, 1.0);
        // 지평선 가까이 넓게 밝은 띠, 위로 갈수록 천정색
        vec3 col = mix(horizon, zenith, pow(smoothstep(-0.02, 0.9, h), 0.62));
        // 지평선 아래는 지평선색으로 둔다(섬 밖 안개와 이어진다)
        col = mix(horizon, col, smoothstep(-0.12, 0.02, h));
        vec3 s = normalize(sunDirection);
        float cosSun = max(dot(d, s), 0.0);
        // 해(밤에는 달): 원판과 넓은 광륜
        float disc = smoothstep(0.9993, 0.9997, cosSun);
        float glow = pow(cosSun, 12.0) * 0.35 + pow(cosSun, 180.0) * 0.6;
        vec3 discColor = mix(sunColor * 5.0, vec3(0.95, 0.97, 1.0) * 2.2, night);
        col += sunColor * glow * (1.0 - night * 0.7) + discColor * disc;
        // 별: 밤에만, 위쪽 하늘에 드문 점
        if (night > 0.01 && h > 0.0) {
          vec2 g = d.xz / (d.y + 0.4) * 180.0;
          vec2 cell = floor(g);
          float star = step(0.9975, hash(cell)) * smoothstep(0.5, 0.0, length(fract(g) - 0.5));
          float twinkle = 0.7 + 0.3 * sin(time * 2.0 + hash(cell + 3.1) * 40.0);
          col += vec3(0.9, 0.93, 1.0) * star * twinkle * night * smoothstep(0.0, 0.3, h) * 1.4;
        }
        // 구름: 하늘 평면에 투영한 잡음, 천천히 흐른다. 해 쪽은 밝게 물든다
        if (h > 0.0) {
          vec2 uv = d.xz / (d.y + 0.18) * 2.2 + vec2(time * 0.006, time * 0.002);
          // 한 번 휘게 한 좌표로 뭉게구름 가장자리를 부드럽게 만든다
          uv += vec2(fbm(uv * 0.7 + 3.0), fbm(uv * 0.7 - 5.0)) * 0.9;
          float c = smoothstep(0.5, 0.74, fbm(uv));
          c *= smoothstep(0.0, 0.22, h);
          vec3 cloudLit = mix(vec3(1.0), sunColor, 0.35) * (1.0 - night * 0.82);
          vec3 cloud = mix(cloudLit, horizon * 1.1, 0.25) + sunColor * pow(cosSun, 6.0) * 0.4;
          col = mix(col, cloud, c * 0.85);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

/**
 * 색 보정 재질(후처리 마지막 단계, sRGB 화면 값): 가벼운 비네트, 따뜻한 쪽 색 균형, 채도 살짝 올림.
 * tDiffuse 는 ShaderPass 가 채운다.
 */
export function createGradeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      vignette: { value: 0.22 },
      warmth: { value: 0.035 },
      saturation: { value: 1.06 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float vignette;
      uniform float warmth;
      uniform float saturation;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 col = mix(vec3(l), c.rgb, saturation);
        col += vec3(warmth, warmth * 0.35, -warmth * 0.6) * (1.0 - l * 0.5);
        vec2 q = vUv - 0.5;
        col *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
        // 화면은 항상 불투명하다. 반투명 물·빛 번짐 합성이 남긴 알파가 페이지 배경을 비추지 않게 한다
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
}
