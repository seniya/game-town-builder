// CC0 에셋 불러오기와 놓기 도구. 출처와 라이선스: docs/research/2026-09-26-cc0-3d-asset-packs.md, public/dotori/assets/LICENSE-*.txt
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Kenney Mini Characters 12 종(주민 겉모습 번호 순서). */
export const CHAR_NAMES = [
  'female-a',
  'male-a',
  'female-b',
  'male-b',
  'female-c',
  'male-c',
  'female-d',
  'male-d',
  'female-e',
  'male-e',
  'female-f',
  'male-f',
] as const;

/** 집 모델(겉모습 변형 번호로 고른다). */
export const HOUSE_MODELS = [
  'building_home_A_blue',
  'building_home_B_red',
  'building_home_A_green',
  'building_home_B_yellow',
  'building_home_A_red',
  'building_home_B_blue',
  'building_home_A_yellow',
  'building_home_B_green',
] as const;

const KAYKIT = [
  'building_tavern_red',
  'building_market_yellow',
  'building_blacksmith_blue',
  'building_windmill_yellow',
  'building_scaffolding',
  'building_lumbermill_yellow',
  'building_well_blue',
  'tree_single_A',
  'tree_single_B',
  'tree_single_A_cut',
  'trees_A_small',
  'trees_B_medium',
  'rock_single_A',
  'rock_single_C',
  'rock_single_E',
  'waterlily_A',
  'waterlily_B',
  'waterplant_A',
  'barrel',
  'sack',
  'crate_A_small',
  'crate_open',
  'crate_long_A',
  'pallet',
  'wheelbarrow',
  'bucket_water',
  'resource_lumber',
  'fence_wood_straight',
  'flag_red',
  'flag_yellow',
  'flag_blue',
  'flag_green',
  ...HOUSE_MODELS,
] as const;
const TOWN = [
  'fountain-round',
  'lantern',
  'stall-red',
  'stall-green',
  'stall-bench',
  'stall-stool',
  'cart',
  'hedge',
] as const;

export type ModelName =
  (typeof KAYKIT)[number] | (typeof TOWN)[number] | `c:${(typeof CHAR_NAMES)[number]}`;

/** 이름 → 불러온 glTF. */
export const MODELS = new Map<ModelName, GLTF>();

/** 반드시 불러온 모델. */
export function model(name: ModelName): GLTF {
  const g = MODELS.get(name);
  if (!g) throw new Error(`모델 ${name} 을 불러오지 않았다`);
  return g;
}

/**
 * glTF JSON(버퍼를 data URI 로 품음)을 받아 메모리에서 GLB 로 다시 조립해 파싱한다.
 * 아티팩트 보기 화면의 보안 정책은 data:·blob: 주소로의 fetch 를 막는다. 그래서 GLTFLoader 가 data URI 버퍼를
 * 직접 읽지 못한다("Failed to load buffer"). 같은 출처의 .json 은 fetch 할 수 있으므로 버퍼를 직접 풀어 넘긴다(시험판과 같다).
 */
async function loadGltf(loader: GLTFLoader, url: string): Promise<GLTF> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} (${res.status})`);
  const j = (await res.json()) as { buffers: { uri?: string }[] };
  const buf0 = j.buffers[0];
  if (!buf0 || !buf0.uri) throw new Error(`${url}: 버퍼가 없다`);
  const uri = buf0.uri;
  delete buf0.uri;
  const raw = atob(uri.slice(uri.indexOf(',') + 1));
  const bin = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
  const js = new TextEncoder().encode(JSON.stringify(j));
  const jsLen = Math.ceil(js.length / 4) * 4;
  const binLen = Math.ceil(bin.length / 4) * 4;
  const out = new Uint8Array(12 + 8 + jsLen + 8 + binLen);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, out.length, true);
  dv.setUint32(12, jsLen, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.fill(0x20, 20, 20 + jsLen);
  out.set(js, 20);
  dv.setUint32(20 + jsLen, binLen, true);
  dv.setUint32(24 + jsLen, 0x004e4942, true);
  out.set(bin, 28 + jsLen);
  return loader.parseAsync(out.buffer, '');
}

/** 모든 모델을 불러온다. base 는 에셋 폴더 주소, onProgress(0~1) 로 진행률을 알린다. */
export async function loadAll(base: string, onProgress: (p: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  // 텍스처를 <img>(blob: 주소)로 읽게 한다. 기본 ImageBitmapLoader 는 blob: 주소를 fetch 해서 보안 정책에 막힌다.
  loader.register((parser) => {
    // three 의 형 정의에는 textureLoader 가 공개돼 있지 않다. 시험판에서 확인한 우회라 형을 좁혀 대입한다.
    (parser as unknown as { textureLoader: THREE.Loader }).textureLoader = new THREE.TextureLoader(
      parser.options.manager,
    );
    return { name: 'dotori_img_textures' };
  });
  const list: [ModelName, string][] = [
    ...CHAR_NAMES.map((n): [ModelName, string] => [`c:${n}`, `${base}/kc_character-${n}.json`]),
    ...KAYKIT.map((n): [ModelName, string] => [n, `${base}/kk_${n}.json`]),
    ...TOWN.map((n): [ModelName, string] => [n, `${base}/kt_${n}.json`]),
  ];
  let done = 0;
  await Promise.all(
    list.map(([k, url]) =>
      loadGltf(loader, url).then((g) => {
        MODELS.set(k, g);
        done++;
        onProgress(done / list.length);
        g.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
      }),
    ),
  );
}

/** 모델 원본의 경계 상자 크기. */
export function sizeOf(obj: THREE.Object3D): THREE.Vector3 {
  return new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
}

/** 정적 모델을 복제해 발바닥이 바닥에 닿게 놓는다. fit 은 가로·세로 중 큰 쪽을 맞출 길이. */
export function place(
  name: ModelName,
  x: number,
  z: number,
  fit: number,
  yaw: number,
  parent: THREE.Object3D,
): THREE.Object3D {
  const o = model(name).scene.clone(true);
  const box = new THREE.Box3().setFromObject(o);
  const s = box.getSize(new THREE.Vector3());
  const k = fit / Math.max(s.x, s.z);
  o.scale.setScalar(k);
  o.position.set(x, -box.min.y * k, z);
  o.rotation.y = yaw;
  o.userData.height = s.y * k;
  parent.add(o);
  return o;
}

export interface InstanceItem {
  x: number;
  z: number;
  s?: number;
  yaw?: number;
}

/** 같은 모델을 여러 곳에 놓을 때 InstancedMesh 로 묶는다. */
export function instance(
  name: ModelName,
  items: readonly InstanceItem[],
  baseFit: number,
  parent: THREE.Object3D,
): void {
  if (!items.length) return;
  const src = model(name).scene;
  src.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(src);
  const s = box.getSize(new THREE.Vector3());
  const k0 = baseFit / Math.max(s.x, s.z);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  src.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, items.length);
    im.castShadow = true;
    im.receiveShadow = true;
    items.forEach((it, i) => {
      const k = k0 * (it.s ?? 1);
      q.setFromAxisAngle(up, it.yaw ?? 0);
      sc.setScalar(k);
      p.set(it.x, -box.min.y * k, it.z);
      m.compose(p, q, sc).multiply(mesh.matrixWorld);
      im.setMatrixAt(i, m);
    });
    parent.add(im);
  });
}
