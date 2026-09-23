// 재질 생성은 이 파일 한 곳에만 있다 (ARCHITECTURE 9.4, AGENTS 5). WebGPU 전환 범위를 줄이기 위해서다.
import * as THREE from 'three';
import { ATLAS_COLUMNS, ATLAS_ROWS } from './atlas';

/** 복셀 셰이더가 공유하는 조명 uniform. Renderer 가 광원 값으로 갱신한다. */
export interface VoxelLightingUniforms {
  readonly sunDirection: THREE.IUniform<THREE.Vector3>;
  readonly sunColor: THREE.IUniform<THREE.Color>;
  readonly skyAmbient: THREE.IUniform<THREE.Color>;
  readonly groundAmbient: THREE.IUniform<THREE.Color>;
}

/** 조명 uniform 한 벌을 만든다. 불투명·반투명 재질이 같은 객체를 공유한다. */
export function createVoxelLighting(): VoxelLightingUniforms {
  return {
    sunDirection: { value: new THREE.Vector3(0.45, 0.8, 0.35).normalize() },
    sunColor: { value: new THREE.Color(1, 1, 1) },
    skyAmbient: { value: new THREE.Color(0.5, 0.5, 0.5) },
    groundAmbient: { value: new THREE.Color(0.3, 0.3, 0.3) },
  };
}

const VERTEX = /* glsl */ `
attribute float ao;
attribute float tile;
varying vec2 vUv;
varying float vTile;
varying float vAo;
varying vec3 vNormal;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vTile = tile;
  vAo = ao;
  vNormal = normal;
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
varying vec2 vUv;
varying float vTile;
varying float vAo;
varying vec3 vNormal;
#include <fog_pars_fragment>
void main() {
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
  vec3 color = texel.rgb * (ambient + sunColor * sun) * occlusion * faceShade;
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
