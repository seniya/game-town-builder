// WebGLRenderer / Scene / 카메라 / 광원 (ARCHITECTURE 2, 9, TASK-007). 게임 상태는 읽기만 한다.
import * as THREE from 'three';
import type { VoxelWorld } from '../game/voxel/VoxelWorld';
import { createBlockAtlas } from './atlas';
import { ChunkMeshManager } from './ChunkMeshManager';
import { createOpaqueMaterial, createTransparentMaterial, createVoxelLighting } from './materials';

/** Renderer 생성 옵션. */
export interface RendererOptions {
  readonly workerCount: number;
  readonly chunkUploadsPerFrame: number;
  /** 최대 DPR. 성능 측정은 1 로 한다 (MVP_SPEC 36) */
  readonly maxPixelRatio: number;
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

/** 낮의 하늘색. DayNightVisual(TASK-034) 이 매 프레임 시각에 맞춰 바꾼다. */
const SKY_COLOR = 0x9fcbe8;

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

  /** 캔버스에 WebGL2 컨텍스트를 만들고 청크 메시 관리자를 연결한다. */
  constructor(
    canvas: HTMLCanvasElement,
    world: VoxelWorld,
    private readonly options: RendererOptions,
  ) {
    this.webgl = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(SKY_COLOR);
    this.scene.fog = new THREE.Fog(SKY_COLOR, 90, 220);
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);

    this.sun = new THREE.DirectionalLight(0xfff1dc, 0.85);
    this.sun.position.set(0.45, 0.8, 0.35).normalize();
    this.ambient = new THREE.HemisphereLight(0xbcd7ee, 0x8a7a62, 0.62);
    this.scene.add(this.sun, this.ambient);
    this.syncLighting();

    const atlas = createBlockAtlas();
    this.chunks = new ChunkMeshManager(
      this.scene,
      world,
      options.workerCount,
      options.chunkUploadsPerFrame,
      createOpaqueMaterial(atlas, this.lighting),
      createTransparentMaterial(atlas, this.lighting),
    );
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
  }

  /** 청크 메시를 갱신하고 한 프레임을 그린다. */
  render(): void {
    this.chunks.update();
    this.webgl.render(this.scene, this.camera);
  }

  /** 마지막 프레임의 드로우콜 수. */
  get drawCalls(): number {
    return this.webgl.info.render.calls;
  }

  /** 광원 객체의 값을 복셀 셰이더 uniform 으로 옮긴다. 같은 광원을 두 경로가 다르게 쓰지 않게 한다. */
  syncLighting(): void {
    this.lighting.sunDirection.value.copy(this.sun.position).normalize();
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
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, this.options.maxPixelRatio));
    this.webgl.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
