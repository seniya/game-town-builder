// 후처리 (STYLE-005, MVP_SPEC 45.3, ADR 046): 장면 → 빛 번짐 → 출력(톤 매핑·sRGB) → SMAA → 색 보정.
// three 패키지의 examples/jsm 후처리 모듈만 쓴다. 게임 상태를 모른다.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { createGradeMaterial } from './materials';

/** 렌더 품질 단계. low 는 그림자·빛 번짐을 끈다(MVP_SPEC 45.3). */
export type RenderQuality = 'high' | 'low';

/** 빛 번짐 값(MVP_SPEC 45.3). 선형 HDR 밝기 문턱을 넘는 부분만 번진다. */
export const BLOOM = { strength: 0.35, radius: 0.5, threshold: 0.85 } as const;

/** 장면 한 장을 후처리까지 그리는 사슬. */
export class PostPipeline {
  private readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;

  /**
   * 반정밀도 렌더 타깃으로 사슬을 만든다. 안티에일리어싱은 SMAA 후처리다.
   * MSAA 렌더 타깃은 쓰지 않는다: 빛 번짐이 해상(resolve)된 뒤의 MSAA 버퍼에 더해 그리면 내용이 무효화되어
   * 화면이 검게 깨진다(STYLE-005 headless 에서 확인).
   */
  constructor(
    webgl: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    quality: RenderQuality,
  ) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(webgl, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(256, 256),
      BLOOM.strength,
      BLOOM.radius,
      BLOOM.threshold,
    );
    this.bloom.enabled = quality === 'high';
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new SMAAPass());
    this.composer.addPass(new ShaderPass(createGradeMaterial()));
  }

  /** 화면 크기가 바뀌면 부른다. 빛 번짐은 절반 해상도로 돈다(UnrealBloomPass 가 스스로 줄인다). */
  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  /** 한 프레임을 그린다. */
  render(): void {
    this.composer.render();
  }
}
