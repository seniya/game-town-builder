// 둥근 SD 캐릭터 모형 (STYLE-002, MVP_SPEC 45.4, ADR 044·046). 주민 역할 넷과 플레이어.
// 한 사람을 **강체 스키닝 메시 하나 + 외곽선 메시 하나**로 그린다(그림자 포함 드로우콜 3). 부품마다 정점 색과 뼈 번호를 넣고
// 한 지오메트리로 합친다. 뼈는 ADR 041 의 관절(몸·다리 둘·팔 둘·머리)에 눈(깜빡임)·모자(벗기)를 더한 것이다.
// 게임 상태를 모른다. 자세(CharacterPose)를 받아 뼈에 입힌다. 지오메트리는 종류마다 한 번 만들어 공유한다.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { NPCRole } from '../game/types';
import { armJointRotationX, HIP_HEIGHT, type CharacterPose } from './characterPose';
import { createModelToonMaterial, createOutlineMaterial, createToonGradient } from './materials';
import { ball, capsule, faceZ, merge, paint, place, torsoProfile } from './style/cuteFigure';

/** 캐릭터 종류. */
export type CharacterKind = NPCRole | 'player';

/** 뼈 번호. 지오메트리의 skinIndex 가 이 번호를 쓴다. */
export const BONE = {
  root: 0,
  legL: 1,
  legR: 2,
  armL: 3,
  armR: 4,
  head: 5,
  eyes: 6,
  hat: 7,
} as const;
const BONE_COUNT = 8;

/** 모자 종류. */
type Hat = 'toque' | 'straw' | 'bandana' | 'none';
/** 머리 모양. */
type HairStyle = 'short' | 'bun' | 'bob' | 'spiky';

/** 옷차림과 체형. */
interface Look {
  /** 모자를 뺀 키(칸). 몸체 AABB 1.8·문 2 칸 안에 든다 */
  readonly height: number;
  readonly skin: number;
  readonly hair: number;
  readonly hairStyle: HairStyle;
  readonly shirt: number;
  readonly trousers: number;
  readonly shoes: number;
  /** 목수건·모자 띠 색. 없으면 목수건을 두르지 않는다 */
  readonly scarf?: number;
  readonly apron?: number;
  /** 멜빵 바지(앞판·끈) */
  readonly overalls?: boolean;
  /** 허리띠 색 */
  readonly belt?: number;
  readonly hat: Hat;
  readonly hatColor?: number;
  readonly hammer?: boolean;
}

/**
 * 종류별 모습(MVP_SPEC 45.4). 라벨 없이도 모자·옷·소품으로 구별된다.
 * 농부 밀짚모자·멜빵 / 요리사 요리 모자·앞치마 / 목수 붉은 두건·연장 허리띠·망치 / 주민 올림머리·노란 목수건 / 플레이어 파란 옷·붉은 목수건.
 */
export const LOOKS: Record<CharacterKind, Look> = {
  farmer: {
    height: 1.45,
    skin: 0xffd2ae,
    hair: 0x8a5230,
    hairStyle: 'bob',
    shirt: 0x8cc860,
    trousers: 0x5b86c4,
    shoes: 0x6a4630,
    overalls: true,
    hat: 'straw',
    hatColor: 0xf2cf6b,
    scarf: 0xe06a50,
  },
  cook: {
    height: 1.45,
    skin: 0xffd6b3,
    hair: 0x4a3128,
    hairStyle: 'short',
    shirt: 0xf1e8d8,
    trousers: 0x6b647a,
    shoes: 0x5a3e2e,
    scarf: 0xe0604f,
    apron: 0xffffff,
    hat: 'toque',
  },
  carpenter: {
    height: 1.45,
    skin: 0xf5c49c,
    hair: 0x3b2a1e,
    hairStyle: 'short',
    shirt: 0xe08a45,
    trousers: 0x7a6248,
    shoes: 0x4a3524,
    belt: 0x6a4428,
    hat: 'bandana',
    hatColor: 0xd84a40,
    hammer: true,
  },
  villager: {
    height: 1.42,
    skin: 0xffdcc0,
    hair: 0xb07a45,
    hairStyle: 'bun',
    shirt: 0xa68ad8,
    trousers: 0x5e5680,
    shoes: 0x6a4a3a,
    scarf: 0xf5d060,
    hat: 'none',
  },
  player: {
    height: 1.55,
    skin: 0xffd6b3,
    hair: 0x6a4028,
    hairStyle: 'spiky',
    shirt: 0x4f8fd8,
    trousers: 0x6b5a45,
    shoes: 0x5a3a26,
    scarf: 0xe04a44,
    belt: 0x5a3a26,
    hat: 'none',
  },
};

/** 등신비(MVP_SPEC 45.2: 2.5 등신). */
const HEADS = 2.5;

const EYE = 0x33252a;
const EYE_SHINE = 0xffffff;
const MOUTH = 0x8a3f36;
const CHEEK = 0xff9f9a;

/** 체형에서 나온 관절 높이(칸, 모형 기준 높이). */
export interface CharacterLayout {
  readonly height: number;
  readonly headRadius: number;
  readonly neck: number;
  /** 머리 구 중심의 목 기준 높이 */
  readonly headCenter: number;
  readonly hip: number;
  readonly shoulder: number;
  readonly shoulderX: number;
  readonly armLength: number;
  readonly legX: number;
  /** 눈 뼈의 목 기준 높이 */
  readonly eyeY: number;
}

/** 키에서 관절 높이를 정한다(2.5 등신). */
export function characterLayout(height: number): CharacterLayout {
  const headHeight = height / HEADS;
  const headRadius = headHeight * 0.5;
  const neck = height - headHeight;
  const hip = neck * 0.4;
  const torso = neck - hip;
  const headCenter = headRadius * 0.92;
  return {
    height,
    headRadius,
    neck,
    headCenter,
    hip,
    shoulder: hip + torso * 0.8,
    shoulderX: 0.2 * (height / 1.45),
    armLength: torso * 0.78,
    legX: 0.095,
    eyeY: headCenter - headRadius * 0.04,
  };
}

/** 부품에 뼈 번호(가중치 1)와 무조명 값을 붙인다. */
function bind(g: THREE.BufferGeometry, bone: number, unlit = 0): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const index = new Uint16Array(n * 4);
  const weight = new Float32Array(n * 4);
  const lit = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    index[i * 4] = bone;
    weight[i * 4] = 1;
    lit[i] = unlit;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(weight, 4));
  g.setAttribute('unlit', new THREE.BufferAttribute(lit, 1));
  return g;
}

/** 둥근 상자(색·크기·위치). */
function roundBox(
  size: [number, number, number],
  radius: number,
  color: number,
  pos: [number, number, number],
  rot?: [number, number, number],
): THREE.BufferGeometry {
  return place(
    paint(new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius), color),
    pos,
    [1, 1, 1],
    rot,
  );
}

/** 한 종류의 합친 지오메트리 둘(본체·외곽선)과 관절 배치. */
interface CharacterGeometry {
  readonly body: THREE.BufferGeometry;
  readonly outline: THREE.BufferGeometry;
  readonly layout: CharacterLayout;
}

/**
 * 종류 하나의 지오메트리를 만든다. 모든 부품은 **모형 공간의 기준 자세**(선 자세)로 놓고 뼈 번호를 붙인다.
 * outline 은 얼굴(눈·입·볼)을 뺀 부품이다.
 */
function buildGeometry(kind: CharacterKind): CharacterGeometry {
  const look = LOOKS[kind];
  const L = characterLayout(look.height);
  const r = L.headRadius;
  const shell: THREE.BufferGeometry[] = [];
  const face: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, bone: number) => shell.push(bind(g, bone));

  // 다리: 캡슐 + 둥근 신발. 엉덩이 높이에 매달린다
  for (const [bone, side] of [
    [BONE.legL, -1],
    [BONE.legR, 1],
  ] as const) {
    const x = side * L.legX;
    const len = L.hip - 0.04;
    add(capsule(0.078, len, look.trousers, [x, L.hip - len / 2, 0]), bone);
    add(ball(0.082, look.shoes, [x, 0.05, -0.03], [1.12, 0.72, 1.5]), bone);
  }

  // 몸통: 조롱박 회전체(셔츠). 멜빵·앞치마·허리띠·목수건
  const torsoH = L.neck - L.hip + 0.04;
  const profile = torsoProfile(torsoH);
  add(
    place(
      paint(new THREE.LatheGeometry(profile, 20), look.shirt),
      [0, L.hip - 0.03, 0],
      [1, 1, 0.82],
    ),
    BONE.root,
  );
  if (look.scarf !== undefined) {
    add(
      place(
        paint(new THREE.TorusGeometry(0.1, 0.038, 8, 18), look.scarf),
        [0, L.neck - 0.02, 0],
        [1, 1, 0.85],
        [Math.PI / 2, 0, 0],
      ),
      BONE.root,
    );
  }
  /** 몸통 앞쪽 일부를 덮는 회전체(앞치마·멜빵 앞판). top 은 몸통 높이 비율 */
  const frontPanel = (color: number, top: number, arc: number, grow: number) => {
    const pts = profile
      .filter((p) => p.y <= torsoH * top)
      .map((p) => new THREE.Vector2(p.x * grow + 0.004, p.y));
    return place(
      paint(new THREE.LatheGeometry(pts, 12, Math.PI - arc / 2, arc), color),
      [0, L.hip - 0.06, 0],
      [1, 1, 0.82],
    );
  };
  if (look.apron !== undefined) add(frontPanel(look.apron, 0.78, 1.9, 1.06), BONE.root);
  if (look.overalls) {
    add(frontPanel(look.trousers, 0.62, 1.5, 1.07), BONE.root);
    add(frontPanel(look.trousers, 0.3, Math.PI * 2 - 0.01, 1.05), BONE.root);
    for (const s of [-1, 1]) {
      add(
        capsule(0.018, torsoH * 0.5, look.trousers, [s * 0.09, L.hip + torsoH * 0.72, -0.15]),
        BONE.root,
      );
    }
    add(ball(0.022, 0xf2d46a, [-0.09, L.hip + torsoH * 0.55, -0.175]), BONE.root);
    add(ball(0.022, 0xf2d46a, [0.09, L.hip + torsoH * 0.55, -0.175]), BONE.root);
  }
  if (look.belt !== undefined) {
    add(
      place(
        paint(new THREE.TorusGeometry(0.19, 0.03, 6, 20), look.belt),
        [0, L.hip + 0.05, 0],
        [1, 1, 0.84],
        [Math.PI / 2, 0, 0],
      ),
      BONE.root,
    );
    if (kind === 'carpenter') {
      add(roundBox([0.1, 0.1, 0.06], 0.02, 0x8a5a36, [0.14, L.hip + 0.0, -0.13]), BONE.root);
      add(roundBox([0.03, 0.12, 0.02], 0.008, 0xb8bcc4, [0.12, L.hip + 0.08, -0.15]), BONE.root);
    } else {
      add(roundBox([0.06, 0.05, 0.02], 0.01, 0xf2d46a, [0, L.hip + 0.05, -0.17]), BONE.root);
    }
  }

  // 팔: 소매 캡슐 + 둥근 손. 어깨에 매달린다
  for (const [bone, side] of [
    [BONE.armL, -1],
    [BONE.armR, 1],
  ] as const) {
    const x = side * L.shoulderX;
    const len = L.armLength;
    add(capsule(0.062, len, look.shirt, [x, L.shoulder - len / 2 + 0.03, 0]), bone);
    add(ball(0.07, look.skin, [x, L.shoulder - len + 0.01, 0]), bone);
  }
  // 목수의 망치: 오른손에 쥐고 앞(−z)으로 뻗는다(수리 동작이 읽히게)
  if (look.hammer) {
    const hx = L.shoulderX;
    const hy = L.shoulder - L.armLength + 0.01;
    add(
      place(
        paint(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), 0xa0703f),
        [hx, hy, -0.13],
        [1, 1, 1],
        [Math.PI / 2, 0, 0],
      ),
      BONE.armR,
    );
    add(
      roundBox([0.07, 0.07, 0.14], 0.02, 0x9aa0aa, [hx, hy + 0.0, -0.28], [0, Math.PI / 2, 0]),
      BONE.armR,
    );
  }

  // 머리: 살색 구 + 귀 + 머리카락. 얼굴은 −z
  const hy = L.neck + L.headCenter;
  add(ball(r, look.skin, [0, hy, 0], [1.05, 1, 1]), BONE.head);
  for (const s of [-1, 1])
    add(ball(r * 0.2, look.skin, [s * r, hy - r * 0.08, 0.02], [0.6, 1, 1]), BONE.head);
  const hair = look.hair;
  add(
    place(
      paint(new THREE.SphereGeometry(r * 1.08, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.36), hair),
      [0, hy, 0],
    ),
    BONE.head,
  );
  add(
    place(
      paint(
        new THREE.SphereGeometry(
          r * 1.06,
          20,
          12,
          0,
          Math.PI,
          0,
          Math.PI * (look.hairStyle === 'bob' ? 0.9 : 0.8),
        ),
        hair,
      ),
      [0, hy, 0],
    ),
    BONE.head,
  );
  const bangAngles = look.hairStyle === 'spiky' ? [-0.8, -0.4, 0, 0.4, 0.8] : [-0.55, 0, 0.55];
  for (const a of bangAngles) {
    const rr = r * 0.93;
    const spiky = look.hairStyle === 'spiky';
    add(
      ball(
        r * (spiky ? 0.26 : 0.3),
        hair,
        [Math.sin(a) * rr, hy + r * (spiky ? 0.66 : 0.6), -Math.cos(a) * rr],
        spiky ? [0.9, 0.7, 0.55] : [1.2, 0.45, 0.5],
      ),
      BONE.head,
    );
  }
  if (look.hairStyle === 'bun') {
    add(ball(r * 0.36, hair, [0, hy + r * 0.72, r * 0.62]), BONE.head);
    for (const s of [-1, 1])
      add(
        ball(r * 0.22, hair, [s * r * 0.88, hy - r * 0.3, -r * 0.12], [0.7, 1.4, 0.8]),
        BONE.head,
      );
  }
  if (look.hairStyle === 'bob') {
    for (const s of [-1, 1])
      add(ball(r * 0.3, hair, [s * r * 0.9, hy - r * 0.2, r * 0.05], [0.6, 1.3, 1]), BONE.head);
  }

  // 모자(누울 때 벗는다: 모자 뼈를 0 으로 줄인다)
  const capY = hy + r * 0.72;
  if (look.hat === 'toque') {
    add(
      place(paint(new THREE.CylinderGeometry(r * 0.8, r * 0.84, r * 0.34, 20), 0xf4efe6), [
        0,
        capY,
        0,
      ]),
      BONE.hat,
    );
    for (const [x, dy, z] of [
      [0, 0.62, 0],
      [-0.34, 0.5, 0],
      [0.34, 0.5, 0],
      [0, 0.5, -0.3],
      [0, 0.5, 0.3],
    ] as const) {
      add(ball(r * 0.46, 0xfbf8f2, [x * r, capY + dy * r, z * r]), BONE.hat);
    }
  } else if (look.hat === 'straw') {
    const straw = look.hatColor ?? 0xf2cf6b;
    add(
      place(paint(new THREE.CylinderGeometry(r * 1.75, r * 1.8, r * 0.07, 28), straw), [
        0,
        hy + r * 0.62,
        0,
      ]),
      BONE.hat,
    );
    add(
      place(
        paint(new THREE.SphereGeometry(r * 0.86, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), straw),
        [0, hy + r * 0.62, 0],
        [1, 0.8, 1],
      ),
      BONE.hat,
    );
    add(
      place(
        paint(new THREE.TorusGeometry(r * 0.86, r * 0.07, 6, 24), look.scarf ?? 0xe06a50),
        [0, hy + r * 0.7, 0],
        [1, 1, 1],
        [Math.PI / 2, 0, 0],
      ),
      BONE.hat,
    );
  } else if (look.hat === 'bandana') {
    const cloth = look.hatColor ?? 0xd84a40;
    add(
      place(
        paint(new THREE.TorusGeometry(r * 1.0, r * 0.14, 8, 26), cloth),
        [0, hy + r * 0.42, 0],
        [1.04, 1, 1],
        [Math.PI / 2 - 0.12, 0, 0],
      ),
      BONE.hat,
    );
    add(ball(r * 0.2, cloth, [0, hy + r * 0.36, r * 1.02], [1.3, 0.8, 0.8]), BONE.hat);
  }

  // 얼굴(외곽선 없음): 볼·웃는 입. 입은 무조명
  const cheekY = -r * 0.26;
  for (const s of [-1, 1]) {
    face.push(
      bind(
        ball(
          r * 0.15,
          CHEEK,
          [s * r * 0.56, hy + cheekY, faceZ(r, r * 0.56, cheekY, r * 0.02)],
          [1.15, 0.65, 0.35],
        ),
        BONE.head,
      ),
    );
  }
  const mouthY = -r * 0.34;
  face.push(
    bind(
      place(
        paint(new THREE.TorusGeometry(r * 0.1, r * 0.028, 6, 12, Math.PI), MOUTH),
        [0, hy + mouthY + r * 0.06, faceZ(r, 0, mouthY, r * 0.01)],
        [1, 1, 0.6],
        [0, 0, Math.PI],
      ),
      BONE.head,
      1,
    ),
  );
  // 눈: 큰 눈 + 흰 반짝임(무조명). 눈 뼈 높이에 두어 뼈를 y 로 줄이면 깜빡인다
  const eyeX = r * 0.36;
  const eyeLocal = -r * 0.04;
  for (const s of [-1, 1]) {
    const z = faceZ(r, eyeX, eyeLocal, r * 0.03);
    face.push(
      bind(ball(r * 0.15, EYE, [s * eyeX, L.neck + L.eyeY, z], [1, 1.5, 0.45]), BONE.eyes, 1),
    );
    face.push(
      bind(
        ball(r * 0.055, EYE_SHINE, [s * eyeX + r * 0.04, L.neck + L.eyeY + r * 0.09, z - r * 0.06]),
        BONE.eyes,
        1,
      ),
    );
  }

  const outline = merge(shell.map((g) => g.clone()));
  const body = merge([...shell, ...face]);
  return { body, outline, layout: L };
}

/** 종류별 지오메트리 저장소(한 번만 만든다). */
const geometries = new Map<CharacterKind, CharacterGeometry>();
function geometryFor(kind: CharacterKind): CharacterGeometry {
  let g = geometries.get(kind);
  if (!g) {
    g = buildGeometry(kind);
    geometries.set(kind, g);
  }
  return g;
}

/** 모든 캐릭터가 함께 쓰는 재질(툰 3 단·외곽선, MVP_SPEC 45.2). */
let shared: { toon: THREE.Material; outline: THREE.Material } | null = null;
function materials(): { toon: THREE.Material; outline: THREE.Material } {
  shared ??= {
    toon: createModelToonMaterial(createToonGradient(3)),
    outline: createOutlineMaterial(0x3b2b25, 0.011),
  };
  return shared;
}

/** 모형 통계(시험·계측). */
export interface CharacterStats {
  /** 그림자를 뺀 드로우콜(본체 + 외곽선) */
  readonly drawCalls: number;
  readonly triangles: number;
  readonly bones: number;
}

/** 둥근 SD 캐릭터 한 명. 모형은 −z 를 본다. */
export class CuteCharacter {
  readonly object3d = new THREE.Group();
  readonly layout: CharacterLayout;
  readonly mesh: THREE.SkinnedMesh;
  private readonly outline: THREE.SkinnedMesh;
  private readonly bones: THREE.Bone[];
  private readonly restPositions: THREE.Vector3[];

  /** 종류에 맞는 지오메트리(공유)와 제 뼈대로 모형을 만든다. */
  constructor(readonly kind: CharacterKind) {
    const g = geometryFor(kind);
    const L = g.layout;
    this.layout = L;
    // 뼈의 기준 위치(모형 공간): 뼈대 계층은 몸 → 다리·팔·머리 → 눈·모자
    const world: [number, number, number][] = [
      [0, 0, 0],
      [-L.legX, L.hip, 0],
      [L.legX, L.hip, 0],
      [-L.shoulderX, L.shoulder, 0],
      [L.shoulderX, L.shoulder, 0],
      [0, L.neck, 0],
      [0, L.neck + L.eyeY, 0],
      [0, L.neck, 0],
    ];
    const parent = [-1, 0, 0, 0, 0, 0, BONE.head, BONE.head];
    this.bones = world.map(() => new THREE.Bone());
    this.restPositions = world.map((p, i) => {
      const pi = parent[i] ?? -1;
      const base = pi >= 0 ? (world[pi] ?? [0, 0, 0]) : [0, 0, 0];
      return new THREE.Vector3(p[0] - (base[0] ?? 0), p[1] - (base[1] ?? 0), p[2] - (base[2] ?? 0));
    });
    this.bones.forEach((b, i) => {
      b.position.copy(this.restPositions[i] as THREE.Vector3);
      const pi = parent[i] ?? -1;
      if (pi >= 0) (this.bones[pi] as THREE.Bone).add(b);
    });
    const root = this.bones[BONE.root] as THREE.Bone;
    this.object3d.add(root);
    this.object3d.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(this.bones);
    const m = materials();
    this.mesh = new THREE.SkinnedMesh(g.body, m.toon);
    this.outline = new THREE.SkinnedMesh(g.outline, m.outline);
    for (const mesh of [this.mesh, this.outline]) {
      mesh.bind(skeleton, new THREE.Matrix4());
      // 자세에 따라 경계가 크게 바뀌지 않는 작은 모형이라 절두체 검사는 뿌리 기준으로 충분하다
      mesh.frustumCulled = false;
      this.object3d.add(mesh);
    }
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.outline.castShadow = false;
  }

  /**
   * 자세를 뼈에 입힌다(NpcView 의 이전 관절 규칙과 같다). 뿌리 이동·방향은 호출자가 object3d 에 한다.
   * 자세 표의 몸 이동은 엉덩이 높이 HIP_HEIGHT 모형 기준이라 이 모형의 엉덩이 높이 비율로 늘여 입는다.
   * headPitch 는 플레이어 시선처럼 자세 위에 더하는 고개 끄덕임이다.
   */
  applyPose(d: CharacterPose, headPitch = 0): void {
    const k = this.layout.hip / HIP_HEIGHT;
    const b = this.bones;
    const root = b[BONE.root] as THREE.Bone;
    root.position.set(d.figurePos.x * k, d.figurePos.y * k, d.figurePos.z * k);
    root.rotation.set(d.figureRot.x, d.figureRot.y, d.figureRot.z);
    (b[BONE.legL] as THREE.Bone).rotation.set(d.legL.x, d.legL.y, d.legL.z);
    (b[BONE.legR] as THREE.Bone).rotation.set(d.legR.x, d.legR.y, d.legR.z);
    (b[BONE.armL] as THREE.Bone).rotation.set(armJointRotationX(d.armL.x), d.armL.y, d.armL.z);
    (b[BONE.armR] as THREE.Bone).rotation.set(armJointRotationX(d.armR.x), d.armR.y, d.armR.z);
    (b[BONE.head] as THREE.Bone).rotation.set(d.head.x + headPitch, d.head.y, d.head.z);
    (b[BONE.eyes] as THREE.Bone).scale.set(1, Math.max(0.1, d.eyes), 1);
  }

  /** 모자를 쓰고 벗는다(모자 뼈를 0 으로 줄여 머리 속에 숨긴다). */
  setHatVisible(on: boolean): void {
    (this.bones[BONE.hat] as THREE.Bone).scale.setScalar(on ? 1 : 0.0001);
  }

  /** 외곽선을 켜고 끈다(원거리 단순화용). */
  setOutline(on: boolean): void {
    this.outline.visible = on;
  }

  /** 드로우콜·삼각형·뼈 수. */
  stats(): CharacterStats {
    return {
      drawCalls: 2,
      triangles: (this.mesh.geometry.index?.count ?? 0) / 3,
      bones: BONE_COUNT,
    };
  }
}
