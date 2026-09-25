// 시안 가구 모형 (STYLE-001, MVP_SPEC 45.1, ADR 044 / 045): 화덕·물 항아리. 기능이 한눈에 읽히는 모형이 목표다.
// 화덕은 아궁이의 불·장작과 윗면의 냄비(국), 물 항아리는 넓은 입구와 물빛·국자로 읽힌다.
// 모형 원점은 블록 칸의 바닥 가운데이고 앞은 −z 다. 한 칸(1 × 1 × 1) 안에 든다.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CuteMaterials } from './cuteFigure';

/** 부품 지오메트리에 한 색을 칠한다(정점 색). uv 는 뺀다. */
function paint(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  g.deleteAttribute('uv');
  return g;
}

/** 부품을 옮기고 돌리고 늘린다. */
function place(
  g: THREE.BufferGeometry,
  pos: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
  return g.applyMatrix4(m);
}

/** 색칠한 부품들을 합친다. 인덱스 없는 부품(RoundedBox)은 인덱스를 맞춘다. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const indexed = parts.map((p) => (p.index ? p : withIndex(p)));
  const merged = mergeGeometries(indexed, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('시안 가구 부품의 속성이 맞지 않는다');
  return merged;
}

/** 인덱스 없는 지오메트리에 0..n−1 인덱스를 붙인다(합치기 전 형식 맞춤). */
function withIndex(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** 회전체 옆모습 점. */
function profile(points: [number, number][]): THREE.Vector2[] {
  return points.map(([x, y]) => new THREE.Vector2(x, y));
}

/** 툰 메시와 외곽선 메시를 함께 붙인다. */
function addToon(parent: THREE.Object3D, g: THREE.BufferGeometry, m: CuteMaterials): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m.toon);
  parent.add(mesh, new THREE.Mesh(g, m.outline));
  return mesh;
}

/** 시안 화덕. flames 는 흔들림 연출용(y 로 늘였다 줄인다), steamFrom 은 김이 오르는 냄비 윗면 높이다. */
export interface StoveModel {
  readonly object3d: THREE.Group;
  readonly flames: readonly THREE.Mesh[];
  readonly steamFrom: number;
}

/** 시안 화덕: 둥근 돌 몸체·윗판, 앞의 아치 아궁이(장작·불), 윗면의 쇠 냄비와 국. */
export function buildStoveModel(
  m: CuteMaterials,
  flameOuter: THREE.Material,
  flameInner: THREE.Material,
): StoveModel {
  const g = new THREE.Group();
  // 몸체를 조금 뒤로 물려 앞으로 나온 불·장작까지 한 칸(±0.5) 안에 든다
  const back = 0.05;
  const front = back - 0.402;
  const mouthY = 0.26;
  const potY = 0.75;
  addToon(
    g,
    merge([
      place(paint(new RoundedBoxGeometry(0.9, 0.66, 0.8, 3, 0.09), 0xc6b29a), [0, 0.33, back]),
      place(paint(new RoundedBoxGeometry(0.96, 0.09, 0.86, 2, 0.035), 0x8e7a66), [0, 0.705, back]),
      // 돌 줄눈 느낌의 모서리 돌 넷
      ...[-1, 1].flatMap((sx) =>
        [0.16, 0.5].map((y) =>
          place(paint(new RoundedBoxGeometry(0.2, 0.14, 0.05, 2, 0.02), 0xb09b84), [
            sx * 0.33,
            y,
            front - 0.005,
          ]),
        ),
      ),
      // 아궁이 테(밝은 돌 아치)
      place(paint(new THREE.TorusGeometry(0.2, 0.04, 6, 18, Math.PI), 0xe2d3bf), [
        0,
        mouthY,
        front - 0.01,
      ]),
      place(paint(new THREE.BoxGeometry(0.06, 0.2, 0.06), 0xe2d3bf), [
        -0.2,
        mouthY - 0.1,
        front - 0.01,
      ]),
      place(paint(new THREE.BoxGeometry(0.06, 0.2, 0.06), 0xe2d3bf), [
        0.2,
        mouthY - 0.1,
        front - 0.01,
      ]),
      // 쇠 냄비(회전체) + 손잡이 둘
      place(
        paint(
          new THREE.LatheGeometry(
            profile([
              [0, 0],
              [0.15, 0],
              [0.2, 0.05],
              [0.215, 0.13],
              [0.205, 0.19],
              [0.228, 0.205],
              [0.22, 0.222],
              [0.19, 0.215],
              [0.185, 0.19],
            ]),
            20,
          ),
          0x4d4852,
        ),
        [0, potY, 0],
      ),
      place(
        paint(new THREE.TorusGeometry(0.05, 0.016, 6, 10), 0x3a3640),
        [-0.235, potY + 0.15, 0],
        [0, Math.PI / 2, 0],
      ),
      place(
        paint(new THREE.TorusGeometry(0.05, 0.016, 6, 10), 0x3a3640),
        [0.235, potY + 0.15, 0],
        [0, Math.PI / 2, 0],
      ),
      // 장작 둘(엇갈려 앞으로 조금 나온다)
      place(
        paint(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 8), 0x7a4f2e),
        [0, 0.09, front - 0.03],
        [0, 0.35, Math.PI / 2],
      ),
      place(
        paint(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 8), 0x8a5b35),
        [0, 0.12, front - 0.05],
        [0, -0.35, Math.PI / 2],
      ),
    ]),
    m,
  );
  // 아궁이 속(어둠)과 국(외곽선 없음)
  const flat = new THREE.Mesh(
    merge([
      place(
        paint(new THREE.CircleGeometry(0.2, 18, 0, Math.PI), 0x2e1d18),
        [0, mouthY, front - 0.004],
        [0, Math.PI, 0],
      ),
      place(
        paint(new THREE.PlaneGeometry(0.4, mouthY), 0x2e1d18),
        [0, mouthY / 2, front - 0.004],
        [0, Math.PI, 0],
      ),
      place(
        paint(new THREE.CircleGeometry(0.188, 20), 0xf0a94a),
        [0, potY + 0.2, 0],
        [-Math.PI / 2, 0, 0],
      ),
      place(
        paint(new THREE.SphereGeometry(0.03, 8, 6), 0xd9643f),
        [0.06, potY + 0.2, 0.04],
        [0, 0, 0],
        [1, 0.4, 1],
      ),
      place(
        paint(new THREE.SphereGeometry(0.03, 8, 6), 0x7fb24a),
        [-0.07, potY + 0.2, -0.03],
        [0, 0, 0],
        [1, 0.4, 1],
      ),
    ]),
    m.toon,
  );
  g.add(flat);
  // 불: 바깥 주황 · 안쪽 노랑 원뿔 셋씩(명암 없이 빛난다)
  const cones = (r: number, h: number, color: number) =>
    merge(
      [-0.08, 0, 0.08].map((x, i) =>
        place(
          paint(
            new THREE.ConeGeometry(r * (i === 1 ? 1.2 : 0.9), h * (i === 1 ? 1.25 : 0.9), 8),
            color,
          ),
          [x, 0.1 + (h * (i === 1 ? 1.25 : 0.9)) / 2, front - 0.06],
        ),
      ),
    );
  const outer = new THREE.Mesh(cones(0.07, 0.2, 0xffffff), flameOuter);
  const inner = new THREE.Mesh(cones(0.04, 0.12, 0xffffff), flameInner);
  inner.position.z = -0.01;
  g.add(outer, inner);
  return { object3d: g, flames: [outer, inner], steamFrom: potY + 0.22 };
}

/** 시안 물 항아리. water 는 물결 연출용이다. */
export interface WaterPotModel {
  readonly object3d: THREE.Group;
  readonly water: THREE.Mesh;
}

/** 시안 물 항아리: 불룩한 질그릇·파란 띠·넓은 입구의 물빛·걸친 나무 국자. */
export function buildWaterPotModel(m: CuteMaterials, waterMaterial: THREE.Material): WaterPotModel {
  const g = new THREE.Group();
  addToon(
    g,
    merge([
      place(
        paint(
          new THREE.LatheGeometry(
            profile([
              [0, 0],
              [0.17, 0],
              [0.25, 0.08],
              [0.31, 0.26],
              [0.3, 0.44],
              [0.24, 0.58],
              [0.19, 0.64],
              [0.2, 0.68],
              [0.235, 0.705],
              [0.225, 0.73],
              [0.19, 0.725],
              [0.175, 0.69],
            ]),
            22,
          ),
          0xd8895a,
        ),
        [0, 0, 0],
      ),
      place(
        paint(new THREE.TorusGeometry(0.308, 0.022, 6, 28), 0x4f86c6),
        [0, 0.3, 0],
        [Math.PI / 2, 0, 0],
      ),
      place(
        paint(new THREE.TorusGeometry(0.296, 0.014, 6, 28), 0xf3e2c4),
        [0, 0.37, 0],
        [Math.PI / 2, 0, 0],
      ),
      // 나무 국자: 입구에 비스듬히 걸친 자루와 둥근 머리
      place(
        paint(new THREE.CylinderGeometry(0.018, 0.018, 0.46, 8), 0x9a6a3c),
        [0.1, 0.76, 0.03],
        [0.25, 0, -0.55],
      ),
      place(
        paint(new THREE.SphereGeometry(0.05, 10, 8), 0xa87846),
        [0.225, 0.965, 0.085],
        [0, 0, 0],
        [1, 0.7, 1],
      ),
    ]),
    m,
  );
  const water = new THREE.Mesh(
    merge([
      place(paint(new THREE.CircleGeometry(0.18, 22), 0x69c4ee), [0, 0, 0], [-Math.PI / 2, 0, 0]),
      place(
        paint(new THREE.RingGeometry(0.08, 0.1, 22), 0xe4f7ff),
        [0, 0.002, 0],
        [-Math.PI / 2, 0, 0],
      ),
    ]),
    waterMaterial,
  );
  water.position.y = 0.675;
  g.add(water);
  return { object3d: g, water };
}
