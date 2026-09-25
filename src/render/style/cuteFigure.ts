// 시안 주민 모형 (STYLE-001, MVP_SPEC 45.1, ADR 044 / 045). 둥근 SD 형태이며 ADR 041 의 관절 구조를 그대로 쓴다.
// 부품(구·캡슐·회전체)에 정점 색을 넣고 관절마다 한 메시로 합친다. 외곽선은 같은 지오메트리의 반전 껍질이다.
// 게임 상태를 모른다. 자세(CharacterPose)를 받아 관절에 입힐 뿐이다. 재질은 호출자가 materials.ts 로 만들어 넘긴다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { armJointRotationX, HIP_HEIGHT, type CharacterPose } from '../characterPose';

/** 시안의 형태 변수. V1 에서 고른다(MVP_SPEC 45.2). */
export interface FigureStyle {
  /** 등신비(키 ÷ 머리 높이) */
  readonly heads: number;
  /** 큰 눈(흰 반짝임) 또는 점 눈 */
  readonly eyes: 'large' | 'dot';
}

/** 시안 A/B/C (MVP_SPEC 45.1). */
export const FIGURE_VARIANTS = {
  A: { heads: 2.5, eyes: 'large' },
  B: { heads: 3, eyes: 'large' },
  C: { heads: 2.5, eyes: 'dot' },
} as const satisfies Record<string, FigureStyle>;

export type FigureVariant = keyof typeof FIGURE_VARIANTS;

/** 모자를 뺀 키(칸). 몸체 AABB 1.8·문 2 칸 안에 든다. */
export const FIGURE_HEIGHT = 1.45;

/** 역할별 옷차림(시안). STYLE-001 은 요리사 하나만 만든다. */
export interface CuteOutfit {
  readonly skin: number;
  readonly hair: number;
  readonly shirt: number;
  readonly trousers: number;
  readonly shoes: number;
  readonly accent: number;
  readonly apron?: number;
  readonly hat: 'toque' | 'none';
}

/** 요리사 시안 옷차림: 크림색 셔츠·흰 앞치마·붉은 목수건·요리 모자. */
export const COOK_OUTFIT: CuteOutfit = {
  skin: 0xffd6b3,
  hair: 0x4a3128,
  shirt: 0xeee4d2,
  trousers: 0x6b647a,
  shoes: 0x5a3e2e,
  accent: 0xe0604f,
  apron: 0xffffff,
  hat: 'toque',
};

const EYE = 0x33252a;
const EYE_SHINE = 0xffffff;
const MOUTH = 0x8a3f36;
const CHEEK = 0xff9f9a;

/** 형태 변수에서 나온 관절 높이와 부품 크기(칸). three 없이 계산한다. */
export interface FigureLayout {
  readonly headRadius: number;
  /** 머리 피벗(목) 높이 */
  readonly neck: number;
  /** 머리 구 중심의 목 기준 높이 */
  readonly headCenter: number;
  /** 다리 피벗(엉덩이) 높이 = 다리 길이 */
  readonly hip: number;
  /** 팔 피벗(어깨) 높이 */
  readonly shoulder: number;
  readonly shoulderX: number;
  readonly armLength: number;
  readonly legX: number;
  /** 머리 꼭대기 높이(모자 제외) */
  readonly top: number;
}

/** 등신비로 관절 높이를 정한다. 머리가 클수록 몸·다리가 짧아지고 키는 FIGURE_HEIGHT 로 같다. */
export function figureLayout(style: FigureStyle): FigureLayout {
  const headHeight = FIGURE_HEIGHT / style.heads;
  const headRadius = headHeight * 0.5;
  const neck = FIGURE_HEIGHT - headHeight;
  const hip = neck * 0.4;
  const torso = neck - hip;
  return {
    headRadius,
    neck,
    headCenter: headRadius * 0.92,
    hip,
    shoulder: hip + torso * 0.8,
    shoulderX: 0.2,
    armLength: torso * 0.78,
    legX: 0.095,
    top: neck + headRadius * 1.92,
  };
}

/** 부품 지오메트리에 한 색을 칠한다(정점 색, 선형 색공간). uv 는 쓰지 않으므로 뺀다. */
function paint(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  g.deleteAttribute('uv');
  return g;
}

/** 부품을 옮기고 돌리고 늘린다(법선도 함께 바뀐다). */
function place(
  g: THREE.BufferGeometry,
  pos: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
  rot: [number, number, number] = [0, 0, 0],
): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
  return g.applyMatrix4(m);
}

/** 부품들을 한 지오메트리로 합친다. 합친 뒤 원본은 버린다. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('시안 모형 부품의 속성이 맞지 않는다');
  return merged;
}

/** 구(색·위치·늘림). */
function ball(
  r: number,
  color: number,
  pos: [number, number, number],
  scale?: [number, number, number],
) {
  return place(paint(new THREE.SphereGeometry(r, 18, 12), color), pos, scale);
}

/** 캡슐: 가운데가 pos, 전체 길이 length(양끝 반구 포함). */
function capsule(r: number, length: number, color: number, pos: [number, number, number]) {
  return place(
    paint(new THREE.CapsuleGeometry(r, Math.max(0.01, length - 2 * r), 6, 12), color),
    pos,
  );
}

/** 머리 구 표면(앞 −z)의 z. 얼굴 부품을 표면에 붙인다. */
function faceZ(r: number, x: number, y: number, inset = 0): number {
  return -Math.sqrt(Math.max(0, r * r - x * x - y * y)) + inset;
}

/** 시안 모형 재질 셋. materials.ts 로 만든다. */
export interface CuteMaterials {
  /** 툰 명암 정점 색 */
  readonly toon: THREE.Material;
  /** 명암 없는 정점 색(눈) */
  readonly flat: THREE.Material;
  /** 반전 껍질 외곽선 */
  readonly outline: THREE.Material;
}

/** 모형 통계(드로우콜 판단 자료, MVP_SPEC 45.1). */
export interface FigureStats {
  readonly meshes: number;
  readonly outlineMeshes: number;
  readonly triangles: number;
}

/** 둥근 SD 주민 한 명. 관절 이름·피벗 방향은 NpcView 와 같다(모형은 −z 를 본다). */
export class CuteFigure {
  readonly object3d = new THREE.Group();
  readonly layout: FigureLayout;
  private readonly figure = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly eyes: THREE.Mesh;
  /** 모자. 누울 때 숨긴다 */
  readonly hat = new THREE.Group();
  private readonly outlines: THREE.Mesh[] = [];
  private readonly meshes: THREE.Mesh[] = [];

  /** 형태 변수·옷차림·재질로 모형을 만든다. */
  constructor(
    readonly style: FigureStyle,
    outfit: CuteOutfit,
    private readonly materials: CuteMaterials,
  ) {
    const L = figureLayout(style);
    this.layout = L;
    const r = L.headRadius;

    // 다리: 짧은 캡슐 + 둥근 신발. 피벗(엉덩이)에서 아래로
    for (const [leg, side] of [
      [this.legL, -1],
      [this.legR, 1],
    ] as const) {
      leg.position.set(side * L.legX, L.hip, 0);
      const len = L.hip - 0.04;
      this.addMesh(
        leg,
        merge([
          capsule(0.078, len, outfit.trousers, [0, -len / 2, 0]),
          ball(0.08, outfit.shoes, [0, -L.hip + 0.05, -0.03], [1.12, 0.72, 1.5]),
        ]),
        true,
      );
    }

    // 몸통: 아래가 넓은 조롱박 회전체 + 앞치마 + 목수건
    const torsoH = L.neck - L.hip + 0.04;
    const profile = torsoProfile(torsoH);
    const body: THREE.BufferGeometry[] = [
      place(
        paint(new THREE.LatheGeometry(profile, 20), outfit.shirt),
        [0, L.hip - 0.03, 0],
        [1, 1, 0.82],
      ),
      place(
        paint(new THREE.TorusGeometry(0.1, 0.035, 8, 18), outfit.accent),
        [0, L.neck - 0.02, 0],
        [1, 1, 0.85],
        [Math.PI / 2, 0, 0],
      ),
    ];
    if (outfit.apron !== undefined) {
      const apron = profile
        .filter((p) => p.y <= torsoH * 0.78)
        .map((p) => new THREE.Vector2(p.x * 1.06 + 0.004, p.y));
      body.push(
        place(
          paint(new THREE.LatheGeometry(apron, 12, Math.PI - 0.95, 1.9), outfit.apron),
          [0, L.hip - 0.06, 0],
          [1, 1, 0.82],
        ),
      );
    }
    this.addMesh(this.figure, merge(body), true);

    // 팔: 소매 캡슐 + 둥근 손. 피벗(어깨)에서 아래로
    for (const [arm, side] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      arm.position.set(side * L.shoulderX, L.shoulder, 0);
      const len = L.armLength;
      this.addMesh(
        arm,
        merge([
          capsule(0.062, len, outfit.shirt, [0, -len / 2 + 0.03, 0]),
          ball(0.07, outfit.skin, [0, -len + 0.01, 0]),
        ]),
        true,
      );
    }

    // 머리: 살색 구 + 귀 + 머리카락(윗머리 · 뒷머리 · 앞머리 세 덩이). 얼굴은 −z
    this.head.position.set(0, L.neck, 0);
    const c = L.headCenter;
    const hairTop = place(
      paint(
        new THREE.SphereGeometry(r * 1.08, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.36),
        outfit.hair,
      ),
      [0, c, 0],
    );
    const hairBack = place(
      paint(new THREE.SphereGeometry(r * 1.06, 20, 12, 0, Math.PI, 0, Math.PI * 0.8), outfit.hair),
      [0, c, 0],
    );
    const bangs = [-0.55, 0, 0.55].map((a) => {
      const rr = r * 0.93;
      return ball(
        r * 0.3,
        outfit.hair,
        [Math.sin(a) * rr, c + r * 0.6, -Math.cos(a) * rr],
        [1.2, 0.45, 0.5],
      );
    });
    this.addMesh(
      this.head,
      merge([
        ball(r, outfit.skin, [0, c, 0], [1.05, 1, 1]),
        ball(r * 0.2, outfit.skin, [-r * 1.0, c - r * 0.08, 0.02], [0.6, 1, 1]),
        ball(r * 0.2, outfit.skin, [r * 1.0, c - r * 0.08, 0.02], [0.6, 1, 1]),
        hairTop,
        hairBack,
        ...bangs,
      ]),
      true,
    );

    // 얼굴(외곽선 없음): 볼·웃는 입
    const cheekY = -r * 0.26;
    const face = [-1, 1].map((s) =>
      ball(
        r * 0.15,
        CHEEK,
        [s * r * 0.56, c + cheekY, faceZ(r, r * 0.56, cheekY, r * 0.02)],
        [1.15, 0.65, 0.35],
      ),
    );
    const mouthY = -r * 0.34;
    face.push(
      place(
        paint(new THREE.TorusGeometry(r * 0.1, r * 0.028, 6, 12, Math.PI), MOUTH),
        [0, c + mouthY + r * 0.06, faceZ(r, 0, mouthY, r * 0.01)],
        [1, 1, 0.6],
        [0, 0, Math.PI],
      ),
    );
    this.addMesh(this.head, merge(face), false);

    // 눈: 두 눈을 한 메시로. 메시를 눈 높이에 두어 y 로 줄이면 깜빡인다
    const eyeY = -r * 0.04;
    const eyeX = r * 0.36;
    const eyeParts: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const z = faceZ(r, eyeX, eyeY, r * 0.03);
      if (style.eyes === 'large') {
        eyeParts.push(
          ball(r * 0.15, EYE, [s * eyeX, 0, z], [1, 1.5, 0.45]),
          ball(r * 0.055, EYE_SHINE, [s * eyeX + r * 0.04, r * 0.09, z - r * 0.06]),
        );
      } else {
        eyeParts.push(ball(r * 0.075, EYE, [s * eyeX, 0, z], [1, 1.2, 0.5]));
      }
    }
    this.eyes = new THREE.Mesh(merge(eyeParts), materials.flat);
    this.eyes.position.set(0, c + eyeY, 0);
    this.head.add(this.eyes);
    this.meshes.push(this.eyes);

    // 요리 모자: 띠 + 부푼 윗부분(구 다섯)
    if (outfit.hat === 'toque') {
      const y = c + r * 0.72;
      const puffs = (
        [
          [0, 0.62, 0],
          [-0.34, 0.5, 0],
          [0.34, 0.5, 0],
          [0, 0.5, -0.3],
          [0, 0.5, 0.3],
        ] as const
      ).map(([x, dy, z]) => ball(r * 0.46, 0xfbf8f2, [x * r, y + dy * r, z * r]));
      this.addMesh(
        this.hat,
        merge([
          place(paint(new THREE.CylinderGeometry(r * 0.8, r * 0.84, r * 0.34, 20), 0xf4efe6), [
            0,
            y,
            0,
          ]),
          ...puffs,
        ]),
        true,
      );
      this.head.add(this.hat);
    }

    this.figure.add(this.legL, this.legR, this.armL, this.armR, this.head);
    this.object3d.add(this.figure);
  }

  /**
   * 자세를 관절에 입힌다(NpcView.applyPose 와 같은 규칙, 뿌리 이동·방향은 호출자가 한다).
   * 자세 표의 몸 이동은 엉덩이 높이 HIP_HEIGHT 모형 기준이라 이 모형의 엉덩이 높이 비율로 늘여 입힌다(앉기·밭일에서 발이 땅에 붙게).
   */
  applyPose(d: CharacterPose): void {
    const k = this.layout.hip / HIP_HEIGHT;
    this.figure.position.set(d.figurePos.x * k, d.figurePos.y * k, d.figurePos.z * k);
    this.figure.rotation.set(d.figureRot.x, d.figureRot.y, d.figureRot.z);
    this.legL.rotation.set(d.legL.x, d.legL.y, d.legL.z);
    this.legR.rotation.set(d.legR.x, d.legR.y, d.legR.z);
    this.armL.rotation.set(armJointRotationX(d.armL.x), d.armL.y, d.armL.z);
    this.armR.rotation.set(armJointRotationX(d.armR.x), d.armR.y, d.armR.z);
    this.head.rotation.set(d.head.x, d.head.y, d.head.z);
    this.eyes.scale.y = Math.max(0.1, d.eyes);
  }

  /** 외곽선을 켜고 끈다. */
  setOutline(on: boolean): void {
    for (const m of this.outlines) m.visible = on;
  }

  /** 메시·외곽선 수와 삼각형 수. */
  stats(): FigureStats {
    const tri = (m: THREE.Mesh) => (m.geometry.index?.count ?? 0) / 3;
    return {
      meshes: this.meshes.length,
      outlineMeshes: this.outlines.length,
      triangles: this.meshes.reduce((s, m) => s + tri(m), 0),
    };
  }

  /** 관절 그룹에 합친 메시를 붙인다. outline 이면 같은 지오메트리로 외곽선 메시도 붙인다. */
  private addMesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, outline: boolean): void {
    const mesh = new THREE.Mesh(geometry, this.materials.toon);
    parent.add(mesh);
    this.meshes.push(mesh);
    if (!outline) return;
    const hull = new THREE.Mesh(geometry, this.materials.outline);
    parent.add(hull);
    this.outlines.push(hull);
  }
}

/** 몸통 회전체의 옆모습(반지름, 높이): 아래가 넓고 어깨가 둥근 조롱박. */
function torsoProfile(h: number): THREE.Vector2[] {
  const pts: [number, number][] = [
    [0, 0],
    [0.12, 0.005],
    [0.185, 0.04],
    [0.205, 0.12],
    [0.2, h * 0.45],
    [0.185, h * 0.7],
    [0.16, h * 0.86],
    [0.11, h * 0.96],
    [0, h],
  ];
  return pts.map(([x, y]) => new THREE.Vector2(x, y));
}
