import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { restPose } from '../src/render/characterPose';
import { BONE, CuteCharacter, LOOKS, type CharacterKind } from '../src/render/cuteCharacter';

const KINDS = Object.keys(LOOKS) as CharacterKind[];

/** 모형 안의 메시(드로우콜 단위) 목록. */
function meshes(c: CuteCharacter): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  c.object3d.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
}

describe('둥근 SD 캐릭터 (STYLE-002, MVP_SPEC 45.4)', () => {
  it('역할 넷과 플레이어가 모두 만들어지고 키가 1.3~1.6 칸이다(몸체 AABB 1.8 안)', () => {
    expect(KINDS.sort()).toEqual(['carpenter', 'cook', 'farmer', 'player', 'villager']);
    for (const kind of KINDS) {
      const c = new CuteCharacter(kind);
      expect(c.layout.height).toBeGreaterThanOrEqual(1.3);
      expect(c.layout.height).toBeLessThanOrEqual(1.6);
      // 2.5 등신
      expect(c.layout.height / (c.layout.headRadius * 2)).toBeCloseTo(2.5);
    }
  });

  it('한 명이 스키닝 메시 하나 + 외곽선 하나다(그림자는 본체만 던진다)', () => {
    for (const kind of KINDS) {
      const c = new CuteCharacter(kind);
      const list = meshes(c);
      expect(list).toHaveLength(2);
      expect(list.every((m) => m instanceof THREE.SkinnedMesh)).toBe(true);
      expect(list.filter((m) => m.castShadow)).toHaveLength(1);
      expect(c.stats().drawCalls).toBe(2);
      expect(c.stats().bones).toBe(8);
    }
  });

  it('지오메트리는 뼈 번호·가중치 1·무조명 값을 갖고, 외곽선은 얼굴을 뺀다', () => {
    const c = new CuteCharacter('cook');
    const g = c.mesh.geometry;
    for (const name of ['skinIndex', 'skinWeight', 'unlit', 'color', 'normal']) {
      expect(g.getAttribute(name)).toBeDefined();
    }
    const w = g.getAttribute('skinWeight');
    for (let i = 0; i < w.count; i += 97) expect(w.getX(i)).toBe(1);
    const [body, outline] = meshes(c);
    expect(outline?.geometry.getAttribute('position').count ?? 0).toBeLessThan(
      body?.geometry.getAttribute('position').count ?? 0,
    );
    const unlit = g.getAttribute('unlit');
    let lit = 0;
    for (let i = 0; i < unlit.count; i++) if (unlit.getX(i) > 0.5) lit++;
    expect(lit).toBeGreaterThan(0);
  });

  it('같은 종류는 지오메트리를 함께 쓰고 뼈대는 따로 갖는다', () => {
    const a = new CuteCharacter('farmer');
    const b = new CuteCharacter('farmer');
    expect(a.mesh.geometry).toBe(b.mesh.geometry);
    expect(a.mesh.skeleton).not.toBe(b.mesh.skeleton);
  });

  it('자세를 뼈에 입히고, 눈 깜빡임·모자 벗기가 뼈 크기로 된다', () => {
    const c = new CuteCharacter('cook');
    const p = restPose();
    p.legL.x = 0.5;
    p.eyes = 0.2;
    c.applyPose(p, 0.3);
    const bones = c.mesh.skeleton.bones;
    expect(bones[BONE.legL]?.rotation.x).toBeCloseTo(0.5);
    expect(bones[BONE.head]?.rotation.x).toBeCloseTo(0.3);
    expect(bones[BONE.eyes]?.scale.y).toBeCloseTo(0.2);
    c.setHatVisible(false);
    expect(bones[BONE.hat]?.scale.x).toBeLessThan(0.01);
    c.setHatVisible(true);
    expect(bones[BONE.hat]?.scale.x).toBe(1);
  });
});
