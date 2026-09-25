// STYLE-001 스타일 시안 (MVP_SPEC 45.1, ADR 045): 시안 주민 모형의 키·관절·드로우콜, 시안 타일의 결정성.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { restPose } from '../src/render/characterPose';
import {
  createFlatVertexColorMaterial,
  createOutlineMaterial,
  createToonGradient,
  createToonMaterial,
} from '../src/render/materials';
import {
  COOK_OUTFIT,
  CuteFigure,
  FIGURE_VARIANTS,
  figureLayout,
  type CuteMaterials,
  type FigureVariant,
} from '../src/render/style/cuteFigure';
import { buildStoveModel, buildWaterPotModel } from '../src/render/style/styleProps';
import { paintStyleTile, STYLE_TILE_PX, type StyleTileKind } from '../src/render/style/styleTiles';

/** 지금 요리사 모형(NpcView)의 보이는 메시 수. headless 계측(currentFigureDrawCalls)으로 잰 값이다. */
const CURRENT_FIGURE_DRAW_CALLS = 17;

/** 시험용 시안 재질 셋(materials.ts 로 만든다). */
function materials(): CuteMaterials {
  return {
    toon: createToonMaterial(createToonGradient(3)),
    flat: createFlatVertexColorMaterial(),
    outline: createOutlineMaterial(),
  };
}

const VARIANTS = Object.keys(FIGURE_VARIANTS) as FigureVariant[];

describe('시안 주민 모형', () => {
  it('등신비가 달라도 키(모자 제외)는 1.3~1.6 칸이고 관절 높이 순서가 맞다', () => {
    for (const key of VARIANTS) {
      const L = figureLayout(FIGURE_VARIANTS[key]);
      expect(L.top).toBeGreaterThanOrEqual(1.3);
      expect(L.top).toBeLessThanOrEqual(1.6);
      expect(L.hip).toBeLessThan(L.shoulder);
      expect(L.shoulder).toBeLessThan(L.neck);
      // 머리 높이 = 키 ÷ 등신비 (반올림 오차 안)
      expect((L.headRadius * 2 * FIGURE_VARIANTS[key].heads) / 1.45).toBeCloseTo(1, 5);
    }
    // 2.5 등신이 3 등신보다 머리가 크다
    expect(figureLayout(FIGURE_VARIANTS.A).headRadius).toBeGreaterThan(
      figureLayout(FIGURE_VARIANTS.B).headRadius,
    );
  });

  it('만든 모형의 실제 높이(모자 제외)가 1.3~1.6 칸이고 몸체 AABB(1.8) 안이다', () => {
    for (const key of VARIANTS) {
      const f = new CuteFigure(FIGURE_VARIANTS[key], COOK_OUTFIT, materials());
      f.applyPose(restPose());
      const parent = f.hat.parent;
      parent?.remove(f.hat);
      const body = new THREE.Box3().setFromObject(f.object3d);
      parent?.add(f.hat);
      const withHat = new THREE.Box3().setFromObject(f.object3d);
      expect(body.min.y).toBeGreaterThanOrEqual(-0.01);
      expect(body.max.y).toBeGreaterThanOrEqual(1.3);
      expect(body.max.y).toBeLessThanOrEqual(1.6);
      expect(withHat.max.y).toBeLessThan(1.8 + 0.2);
      // 폭은 한 칸 안(문·침대 통과)
      expect(body.max.x - body.min.x).toBeLessThan(0.8);
    }
  });

  it('관절은 지금 모형과 같은 여섯(다리 둘·팔 둘·머리·몸 전체)이고 자세를 입히면 관절이 돈다', () => {
    const f = new CuteFigure(FIGURE_VARIANTS.A, COOK_OUTFIT, materials());
    const p = restPose();
    p.armR.x = -1;
    p.legL.x = 0.5;
    p.head.y = 0.3;
    p.eyes = 0.15;
    f.applyPose(p);
    const figure = f.object3d.children[0];
    expect(figure).toBeDefined();
    // 몸 전체 그룹 아래: 다리 둘·팔 둘·머리 그룹 다섯과 몸통 메시(외곽선 포함)
    const groups = figure?.children.filter((c) => c instanceof THREE.Group) ?? [];
    expect(groups).toHaveLength(5);
    const rotated = groups.map((g) => Math.abs(g.rotation.x) + Math.abs(g.rotation.y));
    expect(rotated.filter((r) => r > 0)).toHaveLength(3);
  });

  it('한 명의 드로우콜(외곽선 포함)이 지금 모형보다 많지 않다', () => {
    for (const key of VARIANTS) {
      const s = new CuteFigure(FIGURE_VARIANTS[key], COOK_OUTFIT, materials()).stats();
      expect(s.meshes + s.outlineMeshes).toBeLessThanOrEqual(CURRENT_FIGURE_DRAW_CALLS);
      expect(s.triangles).toBeGreaterThan(0);
    }
  });

  it('외곽선을 끄면 외곽선 메시만 숨는다', () => {
    const m = materials();
    const f = new CuteFigure(FIGURE_VARIANTS.B, COOK_OUTFIT, m);
    f.setOutline(false);
    let hidden = 0;
    let shown = 0;
    f.object3d.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (o.material === m.outline) {
        expect(o.visible).toBe(false);
        hidden++;
      } else if (o.visible) shown++;
    });
    expect(hidden).toBe(f.stats().outlineMeshes);
    expect(shown).toBe(f.stats().meshes);
  });
});

describe('시안 가구 모형', () => {
  it('화덕·물 항아리가 한 칸(가로·세로 ±0.5, 높이 1.1) 안에 든다', () => {
    const m = materials();
    const flame = createFlatVertexColorMaterial();
    const stove = buildStoveModel(m, flame, flame);
    const pot = buildWaterPotModel(m, flame);
    for (const g of [stove.object3d, pot.object3d]) {
      const b = new THREE.Box3().setFromObject(g);
      for (const v of [b.min.x, b.min.z]) expect(v).toBeGreaterThanOrEqual(-0.5);
      for (const v of [b.max.x, b.max.z]) expect(v).toBeLessThanOrEqual(0.5);
      expect(b.min.y).toBeGreaterThanOrEqual(-0.01);
      expect(b.max.y).toBeLessThanOrEqual(1.1);
    }
    expect(stove.flames).toHaveLength(2);
    expect(stove.steamFrom).toBeGreaterThan(0.7);
  });
});

describe('시안 블록 타일', () => {
  const KINDS: StyleTileKind[] = ['grassTop', 'grassSide', 'dirt', 'plank', 'stoneBrick', 'leaves'];

  it('64 × 64 RGBA 이고 불투명하다', () => {
    for (const k of KINDS) {
      const px = paintStyleTile(k);
      expect(px.length).toBe(STYLE_TILE_PX * STYLE_TILE_PX * 4);
      expect(STYLE_TILE_PX).toBe(64);
      for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255);
    }
  });

  it('같은 입력은 같은 픽셀, 종류가 다르면 다른 그림이다', () => {
    for (const k of KINDS) expect(paintStyleTile(k, 3)).toEqual(paintStyleTile(k, 3));
    expect(paintStyleTile('plank')).not.toEqual(paintStyleTile('stoneBrick'));
  });

  it('풀 옆면은 윗줄이 초록이고 아래가 흙색이다(흘러내린 풀 가장자리)', () => {
    const px = paintStyleTile('grassSide');
    const at = (x: number, y: number) => {
      const i = (y * STYLE_TILE_PX + x) * 4;
      return { r: px[i] ?? 0, g: px[i + 1] ?? 0 };
    };
    for (const x of [0, 13, 31, 50]) {
      expect(at(x, 1).g).toBeGreaterThan(at(x, 1).r);
      expect(at(x, 60).r).toBeGreaterThan(at(x, 60).g);
    }
  });
});

describe('툰 명암 계단', () => {
  it('2 단·3 단 텍스처의 폭이 단계 수와 같다', () => {
    expect(createToonGradient(2).image.width).toBe(2);
    expect(createToonGradient(3).image.width).toBe(3);
  });
});
