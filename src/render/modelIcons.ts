// 가구 아이콘 (STYLE-003, MVP_SPEC 45.6). 게임에 쓰는 같은 모형을 작은 장면에 비스듬히 놓고 한 번만 그려 그림으로 만든다.
// 게임 렌더러의 WebGL 컨텍스트를 빌려 렌더 타깃에 그리고, 끝나면 렌더 타깃·지우기 색을 되돌린다. 게임 상태를 모른다.
import * as THREE from 'three';
import { BLOCK_MODEL, modelGeometry } from './furnitureModels';
import { createModelToonMaterial, createOutlineMaterial, createToonGradient } from './materials';

/** 아이콘 한 변의 픽셀 수(UI 에서 48 px 로 줄여 보인다). */
const ICON_RENDER_PX = 96;

/** 블록 id → 아이콘 data URL. 모형이 없는 블록이면 null. 같은 블록은 한 번만 그린다. */
export type ModelIconSource = (blockId: number) => string | null;

/** 게임 렌더러를 받아 모형 아이콘 공급자를 만든다. */
export function createModelIconSource(webgl: THREE.WebGLRenderer): ModelIconSource {
  const cache = new Map<number, string>();
  let stage: {
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    target: THREE.WebGLRenderTarget;
    toon: THREE.Material;
    outline: THREE.Material;
  } | null = null;

  /** 아이콘 장면(처음 한 번). 해·반사광은 게임 낮과 비슷하게 밝다. */
  const ready = () => {
    if (stage) return stage;
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xfff4e4, 1.0);
    sun.position.set(0.6, 1, 0.8);
    scene.add(sun, new THREE.HemisphereLight(0xdfeefa, 0x9a8a72, 0.75));
    const target = new THREE.WebGLRenderTarget(ICON_RENDER_PX, ICON_RENDER_PX);
    // 렌더 타깃의 색공간이 sRGB 면 셰이더가 화면과 같은 sRGB 값으로 써 넣는다
    target.texture.colorSpace = THREE.SRGBColorSpace;
    stage = {
      scene,
      camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20),
      target,
      toon: createModelToonMaterial(createToonGradient(3)),
      outline: createOutlineMaterial(0x3b2b25, 0.02),
    };
    return stage;
  };

  return (blockId) => {
    const hit = cache.get(blockId);
    if (hit) return hit;
    const name = BLOCK_MODEL.get(blockId);
    if (!name) return null;
    const s = ready();
    const g = modelGeometry(name);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(g.body, s.toon), new THREE.Mesh(g.outline, s.outline));
    s.scene.add(group);
    // 모형 경계에 맞춰 비스듬한 정사영 카메라를 둔다(블록 아이콘과 같은 방향)
    g.body.computeBoundingBox();
    const box = g.body.boundingBox ?? new THREE.Box3();
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length() * 0.56;
    const cam = s.camera;
    cam.left = -size;
    cam.right = size;
    cam.top = size;
    cam.bottom = -size;
    cam.position.copy(center).add(new THREE.Vector3(-1, 0.9, 1.2).normalize().multiplyScalar(8));
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    // 게임 렌더러 상태를 잠시 빌린다
    const prevTarget = webgl.getRenderTarget();
    const prevColor = webgl.getClearColor(new THREE.Color());
    const prevAlpha = webgl.getClearAlpha();
    webgl.setRenderTarget(s.target);
    webgl.setClearColor(0x000000, 0);
    webgl.clear();
    webgl.render(s.scene, cam);
    const px = new Uint8Array(ICON_RENDER_PX * ICON_RENDER_PX * 4);
    webgl.readRenderTargetPixels(s.target, 0, 0, ICON_RENDER_PX, ICON_RENDER_PX, px);
    webgl.setRenderTarget(prevTarget);
    webgl.setClearColor(prevColor, prevAlpha);
    s.scene.remove(group);
    const url = pixelsToDataUrl(px, ICON_RENDER_PX);
    cache.set(blockId, url);
    return url;
  };
}

/** 렌더 타깃 픽셀(아래 행부터)을 위 행부터의 PNG data URL 로. */
function pixelsToDataUrl(px: Uint8Array, n: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.toDataURL();
  const img = ctx.createImageData(n, n);
  for (let y = 0; y < n; y++)
    img.data.set(px.subarray((n - 1 - y) * n * 4, (n - y) * n * 4), y * n * 4);
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}
