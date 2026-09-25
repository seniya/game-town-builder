import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { lightAt, LIGHT_KEYS } from '../src/render/DayNightVisual';
import {
  createCharacterMaterial,
  createGradeMaterial,
  createOpaqueMaterial,
  createPropMaterial,
  createSkyMaterial,
  createSkyUniforms,
  createTransparentMaterial,
  createVoxelDepthMaterial,
  createVoxelLighting,
} from '../src/render/materials';
import { BLOOM } from '../src/render/PostProcessing';
import { SUN_SHADOW } from '../src/render/renderQuality';

/** 색의 밝기(선형). */
function luma(c: THREE.Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

describe('렌더 품질 (STYLE-005, MVP_SPEC 45.3)', () => {
  it('모든 조명 키가 천정색을 갖고, 낮의 천정은 지평선보다 짙다', () => {
    for (const k of LIGHT_KEYS) expect(typeof k.zenith).toBe('number');
    const noon = lightAt(12 * 60);
    expect(luma(noon.zenith)).toBeLessThan(luma(noon.sky));
    const night = lightAt(23 * 60);
    expect(luma(night.zenith)).toBeLessThan(luma(noon.zenith));
  });

  it('복셀 재질이 그림자 지도를 받고(lights) 물·창문·횃불 정의를 갖는다', () => {
    const atlas = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const lighting = createVoxelLighting();
    for (const m of [
      createOpaqueMaterial(atlas, lighting),
      createTransparentMaterial(atlas, lighting),
    ] as THREE.ShaderMaterial[]) {
      expect(m.lights).toBe(true);
      expect(m.defines['WATER_BLOCK']).toBeDefined();
      expect(m.fragmentShader).toContain('getShadow');
      // 조명 uniform 을 복제하지 않고 공유한다(시각이 바뀌면 모두 바뀐다)
      expect(m.uniforms['time']).toBe(lighting.time);
    }
  });

  it('그림자 깊이 재질이 천장 걷어 내기 uniform 을 공유한다', () => {
    const lighting = createVoxelLighting();
    const depth = createVoxelDepthMaterial(lighting);
    expect(depth.uniforms['cutParams']).toBe(lighting.cutParams);
    expect(depth.fragmentShader).toContain('discard');
  });

  it('사람·가구 재질이 복셀과 같은 밝기 규약(π 보정)을 쓴다', () => {
    for (const m of [createCharacterMaterial(0xffffff), createPropMaterial(0xffffff)]) {
      const shader = {
        uniforms: {} as Record<string, THREE.IUniform>,
        fragmentShader: 'void main() {\n#include <opaque_fragment>\n}',
        vertexShader: '',
      } as unknown as THREE.WebGLProgramParametersWithUniforms;
      // 밝기 보정은 렌더러를 쓰지 않는다. WebGL 컨텍스트 없이 셰이더 치환만 본다
      m.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      expect(shader.uniforms['lightScale']?.value).toBeCloseTo(Math.PI);
    }
  });

  it('하늘 돔은 깊이를 쓰지 않고 안개를 받지 않는다. 색 보정은 항상 불투명하게 내보낸다', () => {
    const sky = createSkyMaterial(createSkyUniforms());
    expect(sky.depthWrite).toBe(false);
    expect(sky.fog).toBe(false);
    expect(createGradeMaterial().fragmentShader).toContain('1.0);');
  });

  it('그림자·빛 번짐 수치가 명세 범위 안이다', () => {
    expect(SUN_SHADOW.nightIntensity).toBeLessThan(SUN_SHADOW.dayIntensity);
    expect(SUN_SHADOW.dayIntensity).toBeLessThan(1);
    expect(SUN_SHADOW.minRadius).toBeLessThan(SUN_SHADOW.maxRadius);
    expect(BLOOM.threshold).toBeGreaterThan(0.5);
  });
});
