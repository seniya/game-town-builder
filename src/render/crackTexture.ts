// 파괴 진행 균열 8 단계 (MVP_SPEC 31, TASK-013). 코드로 결정적으로 그린 16px 타일 8 장을 가로로 붙인다.
// 단계 k(1~8)는 균열 선분의 앞쪽 k/8 을 그린다. 같은 입력은 항상 같은 그림이다.
import * as THREE from 'three';

/** 균열 단계 수. */
export const CRACK_STAGES = 8;
const PX = 16;

/** 결정적 해시 (0~1). */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** 중심에서 뻗는 균열 경로의 픽셀 목록. 앞쪽일수록 먼저 드러난다. */
function crackPixels(): [number, number][] {
  const out: [number, number][] = [];
  const seen = new Set<string>();
  const branches = 6;
  for (let b = 0; b < branches; b++) {
    let x = 7.5 + (hash(b * 7 + 1) - 0.5) * 2;
    let y = 7.5 + (hash(b * 7 + 2) - 0.5) * 2;
    let angle = (b / branches) * Math.PI * 2 + hash(b * 7 + 3);
    for (let step = 0; step < 10; step++) {
      angle += (hash(b * 31 + step) - 0.5) * 1.1;
      x += Math.cos(angle);
      y += Math.sin(angle);
      const px = Math.round(x);
      const py = Math.round(y);
      if (px < 0 || py < 0 || px >= PX || py >= PX) break;
      const key = `${px},${py}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push([px, py]);
      }
    }
  }
  // 가지를 번갈아 드러내도록 단계 순서로 섞는다(가지별 앞쪽이 먼저)
  return out;
}

/** 8 단계 균열 텍스처. 가로 128 × 세로 16, 단계 k 는 u ∈ [(k-1)/8, k/8). */
export function createCrackTexture(): THREE.DataTexture {
  const width = PX * CRACK_STAGES;
  const data = new Uint8Array(width * PX * 4);
  const pixels = crackPixels();
  for (let stage = 1; stage <= CRACK_STAGES; stage++) {
    const shown = Math.ceil((pixels.length * stage) / CRACK_STAGES);
    for (let i = 0; i < shown; i++) {
      const p = pixels[i];
      if (!p) continue;
      const gx = (stage - 1) * PX + p[0];
      const gy = PX - 1 - p[1];
      data.set([24, 18, 14, 200], (gy * width + gx) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, width, PX, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
