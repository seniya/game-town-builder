// 하늘 돔 (STYLE-005, MVP_SPEC 45.3, ADR 046). 카메라를 따라다니는 큰 구의 안쪽에 하늘을 그린다.
// 색·해 방향은 DayNightVisual 이 uniform 으로 넣는다. 게임 상태를 모른다.
import * as THREE from 'three';
import { createSkyMaterial, createSkyUniforms, type SkyUniforms } from './materials';

/** 돔 반지름. 카메라 먼 평면(500)보다 안쪽이어야 한다(정점은 셰이더가 먼 평면에 붙인다). */
const SKY_RADIUS = 400;

/** 하늘 돔 한 개. */
export class SkyDome {
  readonly uniforms: SkyUniforms = createSkyUniforms();
  readonly mesh: THREE.Mesh;

  /** 돔 메시를 만든다. 가장 먼저 그리고 절두체 컬링을 끈다. */
  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(SKY_RADIUS, 32, 16),
      createSkyMaterial(this.uniforms),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.matrixAutoUpdate = false;
  }

  /** 매 프레임 카메라 위치로 옮기고 시간을 흐르게 한다. */
  follow(camera: THREE.Camera, dt: number): void {
    this.mesh.position.copy(camera.position);
    this.mesh.updateMatrix();
    this.uniforms.time.value += dt;
  }
}
