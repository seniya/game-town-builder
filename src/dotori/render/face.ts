// 얼굴 모프 붙이기와 세기 바꾸기 (SPEC 14.1, ADR 056). 고르는 규칙·모양 계산은 data/face.ts 의 순수 함수다.
import * as THREE from 'three';
import { FACE_MORPHS, faceMorphs, findFaceParts, type FaceVals } from '../data/face';
import { matFace } from './materials';

/** 머리 메시 이름(Kenney Mini Characters). */
const HEAD_MESH = 'head-mesh';

/**
 * 원본 모형의 머리 메시에 표정 모프 넷을 붙인다. 복제 전에 한 번만 부른다(복제본은 지오메트리를 나눠 쓴다).
 * 눈·입을 못 찾으면 아무것도 하지 않는다.
 */
export function prepareFace(scene: THREE.Object3D): void {
  const head = scene.getObjectByName(HEAD_MESH) as THREE.Mesh | undefined;
  if (!head || !head.isMesh) return;
  const g = head.geometry;
  if (g.userData.face !== undefined) return;
  g.userData.face = false;
  const pa = g.getAttribute('position');
  const ua = g.getAttribute('uv');
  if (!pa || !ua) return;
  const pos = new Float32Array(pa.count * 3);
  for (let i = 0; i < pa.count; i++) {
    pos[i * 3] = pa.getX(i);
    pos[i * 3 + 1] = pa.getY(i);
    pos[i * 3 + 2] = pa.getZ(i);
  }
  const uv = new Float32Array(ua.count * 2);
  for (let i = 0; i < ua.count; i++) {
    uv[i * 2] = ua.getX(i);
    uv[i * 2 + 1] = ua.getY(i);
  }
  const parts = findFaceParts(pos, uv);
  if (!parts) return;
  const m = faceMorphs(pos, parts);
  g.morphAttributes.position = FACE_MORPHS.map((k) => {
    const a = new THREE.Float32BufferAttribute(m[k], 3);
    a.name = k;
    return a;
  });
  g.morphTargetsRelative = false;
  head.updateMorphTargets();
  // 머리만 따로 재질을 준다(몸과 번갈아 그릴 때 셰이더를 다시 고르지 않게, ADR 056)
  if (!Array.isArray(head.material)) head.material = matFace(head.material);
  g.userData.face = true;
}

/** 복제한 캐릭터에서 표정 모프를 가진 머리 메시를 찾는다(없으면 null). */
export function faceMeshOf(model: THREE.Object3D): THREE.Mesh | null {
  const head = model.getObjectByName(HEAD_MESH) as THREE.Mesh | undefined;
  return head &&
    head.morphTargetInfluences &&
    head.morphTargetInfluences.length >= FACE_MORPHS.length
    ? head
    : null;
}

/** 모프 세기를 넣는다. */
export function setFace(head: THREE.Mesh, f: FaceVals): void {
  const inf = head.morphTargetInfluences;
  if (!inf) return;
  FACE_MORPHS.forEach((k, i) => (inf[i] = f[k]));
}
