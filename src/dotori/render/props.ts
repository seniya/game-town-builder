// 코드로 만드는 주민 소품: 직업 모자, 손 도구, 우산, 등짐(목재·이삿짐), 꽃밭의 꽃.
import * as THREE from 'three';
import type { JobName } from '../data/people';
import { matCloth, matStd } from './materials';

/** 도형 하나를 만든다. */
export function mesh(geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, matStd(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** 직업별 모자. 머리 뼈 기준 좌표(원본 모델 단위). */
export function makeHat(job: JobName): THREE.Group {
  const g = new THREE.Group();
  switch (job) {
    case '농부':
      g.add(mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.03, 20), '#E9C46A'));
      g.add(mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.14, 16), '#E9C46A', 0, 0.08, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.035, 16), '#D0504A', 0, 0.03, 0));
      break;
    case '제빵사':
      g.add(mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.14, 16), '#ffffff', 0, 0.05, 0));
      g.add(mesh(new THREE.SphereGeometry(0.19, 16, 10), '#ffffff', 0, 0.19, 0));
      break;
    case '어부':
      g.add(mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.03, 18), '#3D6FA8'));
      g.add(mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.13, 16), '#3D6FA8', 0, 0.07, 0));
      break;
    case '목수': {
      const band = mesh(new THREE.TorusGeometry(0.215, 0.03, 8, 20), '#E07A3F', 0, -0.05, 0);
      band.rotation.x = Math.PI / 2;
      g.add(band);
      break;
    }
    case '나무꾼':
      g.add(
        mesh(
          new THREE.SphereGeometry(0.225, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
          '#B83B32',
          0,
          -0.04,
          0,
        ),
      );
      g.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), '#ffffff', 0, 0.2, 0));
      break;
    case '주점 주인':
      g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.16, 16), '#3a2a44', 0, 0.06, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 18), '#3a2a44', 0, -0.02, 0));
      break;
    default:
      g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), '#f7a1c4', 0.12, 0.02, 0.08));
      g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), '#f7a1c4', 0.16, 0.02, 0.02));
  }
  return g;
}

export type ToolKind = 'hoe' | 'axe' | 'hammer' | 'rod' | 'bread' | 'flower' | 'book' | 'mug';

/** 손에 드는 도구. 팔 뼈 끝(손) 기준. 손잡이는 팔 방향(-y)으로 뻗는다. */
export function makeTool(kind: ToolKind): THREE.Group {
  const g = new THREE.Group();
  const wood = '#8a5a34';
  const metal = '#aab3bd';
  switch (kind) {
    case 'hoe':
      g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 6), wood, 0, -0.18, 0));
      g.add(mesh(new THREE.BoxGeometry(0.03, 0.05, 0.16), metal, 0, -0.45, 0.07));
      break;
    case 'axe':
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 6), wood, 0, -0.14, 0));
      g.add(mesh(new THREE.BoxGeometry(0.03, 0.12, 0.13), metal, 0, -0.32, 0.06));
      break;
    case 'hammer':
      g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.28, 6), wood, 0, -0.1, 0));
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.14), '#6b7078', 0, -0.23, 0));
      break;
    case 'rod': {
      const r = mesh(new THREE.CylinderGeometry(0.01, 0.016, 0.9, 6), '#6b4a2e', 0, 0.3, 0.25);
      r.rotation.x = 0.9;
      g.add(r);
      g.userData.tip = new THREE.Vector3(0, 0.62, 0.62);
      break;
    }
    case 'bread': {
      const b = mesh(new THREE.CapsuleGeometry(0.045, 0.1, 4, 8), '#D9A05B', 0, -0.03, 0.04);
      b.rotation.z = Math.PI / 2;
      g.add(b);
      break;
    }
    case 'flower':
      g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 4), '#5aa35a', 0, 0.06, 0.03));
      g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), '#f7a1c4', 0, 0.17, 0.03));
      break;
    case 'book':
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.2, 0.03), '#C0504D', 0, -0.02, 0.06));
      break;
    case 'mug':
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10), '#d9c7a0', 0, -0.02, 0.05));
      g.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 10), '#fff8e6', 0, 0.035, 0.05));
      break;
  }
  return g;
}

/** 비 올 때 머리 위에 드는 우산. charH 는 주민 키. */
export function makeUmbrella(color: string, charH: number): THREE.Group {
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.3, 12, 1, true), matCloth(color));
  canopy.position.y = charH + 0.42;
  canopy.castShadow = true;
  g.add(canopy);
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), '#5a4636', 0.12, charH + 0.1, 0.05));
  return g;
}

/** 등에 진 목재 다발(n 개까지 쌓인다). 몸통 뼈 기준, 등 쪽(-z). */
export function makeLumberPack(n: number): THREE.Group {
  const g = new THREE.Group();
  const shown = Math.max(1, Math.min(6, n));
  for (let i = 0; i < shown; i++) {
    const log = mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.62, 8),
      i % 2 ? '#b98552' : '#a8744a',
      0,
      0.2 + i * 0.1,
      -0.26,
    );
    log.rotation.z = Math.PI / 2;
    log.position.x = (i % 2 ? 0.04 : -0.04) * 0.5;
    g.add(log);
  }
  // 멜빵
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.04, 0.03), '#6b4a2e', 0, 0.26, -0.2));
  return g;
}

/** 이삿짐 보따리(몸통 뼈 기준, 등 쪽). */
export function makeBagPack(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.24, 14, 10), color, 0, 0.32, -0.3));
  const knot = mesh(new THREE.SphereGeometry(0.07, 10, 8), '#f4e3c3', 0, 0.55, -0.26);
  g.add(knot);
  return g;
}

/** 꽃밭 한 칸의 꽃(줄기+꽃송이) 색 목록. */
export const FLOWER_COLORS: readonly string[] = [
  '#f7a1c4',
  '#ffe08a',
  '#ffffff',
  '#c9b6ff',
  '#ff8a7a',
  '#9fd8ff',
];
