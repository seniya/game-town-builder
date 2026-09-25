// WebGLRenderer / Scene / 카메라 / 광원 (ARCHITECTURE 2, 9, TASK-007). 게임 상태는 읽기만 한다.
import * as THREE from 'three';
import type { VoxelWorld } from '../game/voxel/VoxelWorld';
import { createBlockAtlas } from './atlas';
import { ChunkMeshManager } from './ChunkMeshManager';
import {
  createOpaqueMaterial,
  createTransparentMaterial,
  createVoxelDepthMaterial,
  createVoxelLighting,
} from './materials';
import { PostPipeline, type RenderQuality } from './PostProcessing';
import { SUN_SHADOW } from './renderQuality';
import { SkyDome } from './SkyDome';

/** Renderer 생성 옵션. */
export interface RendererOptions {
  readonly workerCount: number;
  readonly chunkUploadsPerFrame: number;
  /** 최대 DPR. 성능 측정은 1 로 한다 (MVP_SPEC 36) */
  readonly maxPixelRatio: number;
  /** 렌더 품질(MVP_SPEC 45.3). 기본 high */
  readonly quality?: RenderQuality;
}

/** 카메라를 대상 주위 구면 좌표로 둔다. 조작 카메라는 TASK-011 에서 만든다. */
export interface OrbitView {
  readonly target: THREE.Vector3Like;
  readonly distance: number;
  /** 라디안. 0 이면 +z 쪽에서 -z 방향을 본다 */
  readonly yaw: number;
  /** 라디안. 양수면 위에서 내려다본다 */
  readonly pitch: number;
}

/** 낮의 지평선색(안개·배경). DayNightVisual(TASK-034) 이 매 프레임 시각에 맞춰 바꾼다. */
const SKY_COLOR = 0xd4ecf7;

/** 화면 그리기의 진입점. */
export class Renderer {
  readonly webgl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly chunks: ChunkMeshManager;
  /** 해(밤에는 달빛). DayNightVisual 이 색·세기·방향을 바꾼다 */
  readonly sun: THREE.DirectionalLight;
  /** 하늘·땅 반사광 */
  readonly ambient: THREE.HemisphereLight;
  /** 복셀 셰이더 조명 uniform. 광원 값과 torch 점광원이 여기로 들어간다 */
  readonly lighting = createVoxelLighting();
  /** 하늘 돔(STYLE-005) */
  readonly sky = new SkyDome();
  readonly quality: RenderQuality;
  /** 해(달)가 있는 방향(단위 벡터). 광원 위치는 그림자 초점에서 이 방향으로 떨어뜨린다 */
  readonly sunDirection = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
  private readonly post: PostPipeline;
  /** 그림자 초점까지 카메라 앞 거리. 궤도 시점이면 궤도 거리다 */
  private focusDistance = 10;
  private lastRender = performance.now();
  private readonly lightView = new THREE.Matrix4();

  /** 캔버스에 WebGL2 컨텍스트를 만들고 청크 메시 관리자를 연결한다. */
  constructor(
    canvas: HTMLCanvasElement,
    world: VoxelWorld,
    private readonly options: RendererOptions,
  ) {
    this.quality = options.quality ?? 'high';
    // 안티에일리어싱은 후처리 렌더 타깃의 MSAA 가 맡는다(기본 프레임 버퍼에는 필요 없다)
    this.webgl = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.toneMapping = THREE.NeutralToneMapping;
    this.webgl.toneMappingExposure = 1;
    // 후처리가 한 프레임에 여러 번 그리므로 드로우콜 수는 render() 에서 직접 비운다(그림자 패스까지 합산, MVP_SPEC 45.3)
    this.webgl.info.autoReset = false;
    this.webgl.shadowMap.enabled = this.quality === 'high';
    this.webgl.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(SKY_COLOR);
    this.scene.fog = new THREE.Fog(SKY_COLOR, 90, 220);
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);

    this.sun = new THREE.DirectionalLight(0xfff1dc, 0.85);
    this.sun.castShadow = this.quality === 'high';
    const shadow = this.sun.shadow;
    shadow.mapSize.set(SUN_SHADOW.mapSize, SUN_SHADOW.mapSize);
    shadow.camera.near = 1;
    shadow.camera.far = SUN_SHADOW.distance * 2;
    shadow.bias = -0.0004;
    shadow.radius = 2.5;
    shadow.intensity = SUN_SHADOW.dayIntensity;
    this.ambient = new THREE.HemisphereLight(0xbcd7ee, 0x8a7a62, 0.62);
    this.scene.add(this.sun, this.sun.target, this.ambient, this.sky.mesh);
    this.syncLighting();

    const atlas = createBlockAtlas();
    this.chunks = new ChunkMeshManager(
      this.scene,
      world,
      options.workerCount,
      options.chunkUploadsPerFrame,
      createOpaqueMaterial(atlas, this.lighting),
      createTransparentMaterial(atlas, this.lighting),
      createVoxelDepthMaterial(this.lighting),
    );
    this.post = new PostPipeline(this.webgl, this.scene, this.camera, this.quality);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** 카메라를 궤도 시점에 둔다. */
  setOrbitView(view: OrbitView): void {
    const c = Math.cos(view.pitch);
    this.camera.position.set(
      view.target.x + Math.sin(view.yaw) * c * view.distance,
      view.target.y + Math.sin(view.pitch) * view.distance,
      view.target.z + Math.cos(view.yaw) * c * view.distance,
    );
    this.camera.lookAt(view.target.x, view.target.y, view.target.z);
    this.focusDistance = view.distance;
  }

  /** 조작 카메라처럼 궤도 시점을 쓰지 않을 때 그림자 초점까지의 카메라 앞 거리를 정한다. */
  setFocusDistance(distance: number): void {
    this.focusDistance = distance;
  }

  /** 청크 메시를 갱신하고 한 프레임을 (후처리까지) 그린다. */
  render(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastRender) / 1000);
    this.lastRender = now;
    this.chunks.update();
    this.lighting.time.value += dt;
    this.sky.follow(this.camera, dt);
    this.updateShadowFocus();
    this.webgl.info.reset();
    this.post.render();
  }

  /**
   * 그림자 지도를 카메라가 보는 곳에 맞춘다. 초점은 카메라 앞 focusDistance 지점이고, 멀리 볼수록 범위를 넓힌다.
   * 초점을 그림자 지도 텍셀 격자에 맞춰 옮겨 카메라가 움직일 때 그림자 가장자리가 떨리지 않게 한다.
   */
  private updateShadowFocus(): void {
    if (!this.sun.castShadow) return;
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    const focus = this.camera.position.clone().addScaledVector(forward, this.focusDistance);
    const radius = THREE.MathUtils.clamp(
      this.focusDistance * 0.9,
      SUN_SHADOW.minRadius,
      SUN_SHADOW.maxRadius,
    );
    const cam = this.sun.shadow.camera;
    if (cam.right !== radius) {
      cam.left = -radius;
      cam.right = radius;
      cam.top = radius;
      cam.bottom = -radius;
      cam.updateProjectionMatrix();
    }
    // 광원 공간에서 초점을 텍셀 크기로 반올림한다
    const texel = (radius * 2) / SUN_SHADOW.mapSize;
    this.lightView.lookAt(this.sunDirection, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    const inv = this.lightView.clone().invert();
    const local = focus.clone().applyMatrix4(inv);
    local.x = Math.round(local.x / texel) * texel;
    local.y = Math.round(local.y / texel) * texel;
    focus.copy(local.applyMatrix4(this.lightView));
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDirection, SUN_SHADOW.distance);
    this.sun.target.updateMatrixWorld();
  }

  /** 마지막 프레임의 드로우콜 수. */
  get drawCalls(): number {
    return this.webgl.info.render.calls;
  }

  /** 광원 객체의 값을 복셀 셰이더 uniform 으로 옮긴다. 같은 광원을 두 경로가 다르게 쓰지 않게 한다. */
  syncLighting(): void {
    this.lighting.sunDirection.value.copy(this.sunDirection);
    this.sky.uniforms.sunDirection.value.copy(this.sunDirection);
    // 그림자를 쓰지 않을 때도 three 재질(캐릭터·가구)이 같은 방향의 빛을 받도록 광원을 초점 없이 방향만 둔다
    if (!this.sun.castShadow) this.sun.position.copy(this.sunDirection);
    this.lighting.sunColor.value.copy(this.sun.color).multiplyScalar(this.sun.intensity);
    this.lighting.skyAmbient.value.copy(this.ambient.color).multiplyScalar(this.ambient.intensity);
    this.lighting.groundAmbient.value
      .copy(this.ambient.groundColor)
      .multiplyScalar(this.ambient.intensity);
  }

  /** 캔버스 크기에 맞춰 해상도와 종횡비를 갱신한다. */
  private resize(): void {
    const canvas = this.webgl.domElement;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio, this.options.maxPixelRatio);
    this.webgl.setPixelRatio(ratio);
    this.webgl.setSize(width, height, false);
    this.post.setSize(width, height, ratio);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
