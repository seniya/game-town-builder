// 낮과 밤의 표현 (MVP_SPEC 31 "밤", ARCHITECTURE 9.4, TASK-034). 게임 시계를 읽기만 한다.
// 하늘색·안개·해(달)빛·반사광을 시각 키프레임 사이에서 보간하고, torch 가까운 순으로 최대 16 개의 점광원을 켠다.
// torch 는 새로 켜거나 더하지 않는다(자동 점등 없음). 이미 놓인 torch 칸만 광원이 된다.
import * as THREE from 'three';
import { BlockId } from '../game/data/blocks';
import type { EventBus } from '../game/EventBus';
import type { GameClockReader } from '../game/types';
import type { VoxelWorld } from '../game/voxel/VoxelWorld';
import { MAX_VOXEL_POINT_LIGHTS } from './materials';
import type { Renderer } from './Renderer';

/** 시각 하나의 조명. 색은 sRGB hex, 세기는 광원 세기다. */
export interface LightKey {
  /** 그날 시각(시, 소수) */
  readonly hour: number;
  readonly sky: number;
  readonly sun: number;
  readonly sunIntensity: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly hemiIntensity: number;
  /** 0 낮 ~ 1 밤. torch 가 두드러지는 정도 */
  readonly night: number;
}

/** 하루의 조명 키프레임. 시각 순이며 24 시는 0 시와 같다. */
export const LIGHT_KEYS: readonly LightKey[] = [
  {
    hour: 0,
    sky: 0x0d1633,
    sun: 0x8fa6dc,
    sunIntensity: 0.16,
    hemiSky: 0x2b3866,
    hemiGround: 0x16161c,
    hemiIntensity: 0.42,
    night: 1,
  },
  {
    hour: 4.5,
    sky: 0x18203f,
    sun: 0x8fa6dc,
    sunIntensity: 0.18,
    hemiSky: 0x323e6c,
    hemiGround: 0x18181e,
    hemiIntensity: 0.44,
    night: 1,
  },
  {
    hour: 5.6,
    sky: 0xe3a585,
    sun: 0xffb47e,
    sunIntensity: 0.5,
    hemiSky: 0xa4acc9,
    hemiGround: 0x6b5a4f,
    hemiIntensity: 0.52,
    night: 0.35,
  },
  {
    hour: 7,
    sky: 0x9fcbe8,
    sun: 0xfff1dc,
    sunIntensity: 0.85,
    hemiSky: 0xbcd7ee,
    hemiGround: 0x8a7a62,
    hemiIntensity: 0.62,
    night: 0,
  },
  {
    hour: 16.5,
    sky: 0xa3cce6,
    sun: 0xfff0d6,
    sunIntensity: 0.85,
    hemiSky: 0xbcd7ee,
    hemiGround: 0x8a7a62,
    hemiIntensity: 0.62,
    night: 0,
  },
  {
    hour: 18.4,
    sky: 0xeea77a,
    sun: 0xffa865,
    sunIntensity: 0.6,
    hemiSky: 0xb49fae,
    hemiGround: 0x6d5344,
    hemiIntensity: 0.52,
    night: 0.25,
  },
  {
    hour: 19.6,
    sky: 0x3d3e70,
    sun: 0x8390c8,
    sunIntensity: 0.24,
    hemiSky: 0x444f80,
    hemiGround: 0x221e24,
    hemiIntensity: 0.44,
    night: 0.8,
  },
  {
    hour: 20.6,
    sky: 0x0d1633,
    sun: 0x8fa6dc,
    sunIntensity: 0.16,
    hemiSky: 0x2b3866,
    hemiGround: 0x16161c,
    hemiIntensity: 0.42,
    night: 1,
  },
];

/** 보간된 조명 값(선형 색 공간의 0~1 성분). */
export interface LightState {
  readonly sky: THREE.Color;
  readonly sun: THREE.Color;
  readonly sunIntensity: number;
  readonly hemiSky: THREE.Color;
  readonly hemiGround: THREE.Color;
  readonly hemiIntensity: number;
  readonly night: number;
  /** 해(달)의 방향. 낮에는 동에서 서로, 밤에는 달이 같은 길을 간다 */
  readonly sunDirection: THREE.Vector3;
}

/** 부드러운 보간 가중치(가장자리에서 기울기 0). 전이가 갑자기 튀지 않는다. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 두 hex 색을 선형 공간에서 섞는다. */
function mixHex(a: number, b: number, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

/**
 * 그날 분(0~1440)의 조명. 앞뒤 키프레임 사이를 부드럽게 보간한다.
 * 연속 함수이므로 시각이 조금 바뀌면 값도 조금만 바뀐다.
 */
export function lightAt(minuteOfDay: number): LightState {
  const h = (((minuteOfDay / 60) % 24) + 24) % 24;
  const keys = LIGHT_KEYS;
  let i = keys.length - 1;
  for (let k = 0; k < keys.length; k++) if ((keys[k] as LightKey).hour <= h) i = k;
  const a = keys[i] as LightKey;
  const b = (keys[i + 1] ?? { ...(keys[0] as LightKey), hour: 24 }) as LightKey;
  const span = b.hour - a.hour;
  const t = smooth(span > 0 ? (h - a.hour) / span : 0);
  // 해는 06시에 동쪽(+x)에서 떠서 18시에 서쪽으로 진다. 밤에는 같은 길의 달빛이다
  const angle = (((h - 6) / 12) % 2) * Math.PI;
  const sunDirection = new THREE.Vector3(
    Math.cos(angle),
    Math.abs(Math.sin(angle)) * 0.85 + 0.25,
    0.35,
  ).normalize();
  return {
    sky: mixHex(a.sky, b.sky, t),
    sun: mixHex(a.sun, b.sun, t),
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t,
    hemiSky: mixHex(a.hemiSky, b.hemiSky, t),
    hemiGround: mixHex(a.hemiGround, b.hemiGround, t),
    hemiIntensity: a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * t,
    night: a.night + (b.night - a.night) * t,
    sunDirection,
  };
}

/** 월드의 torch 칸 목록. 처음에 한 번 훑고 이후에는 블록 변경 이벤트로만 갱신한다. */
export class TorchIndex {
  private readonly torches = new Map<string, THREE.Vector3>();

  /** 월드의 비어 있지 않은 청크만 훑어 torch 를 모으고 BLOCK_CHANGED 를 구독한다. */
  constructor(world: VoxelWorld, events: EventBus) {
    for (const coord of world.allChunkCoords()) {
      const chunk = world.getChunk(coord.cx, coord.cy, coord.cz);
      if (!chunk) continue;
      const blocks = chunk.blocks;
      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i] !== BlockId.torch) continue;
        const x = coord.cx * 16 + (i & 15);
        const z = coord.cz * 16 + ((i >> 4) & 15);
        const y = coord.cy * 16 + (i >> 8);
        if (world.getBlock(x, y, z) === BlockId.torch) this.add(x, y, z);
      }
    }
    events.on('BLOCK_CHANGED', (c) => {
      if (c.to === BlockId.torch) this.add(c.pos.x, c.pos.y, c.pos.z);
      else if (c.from === BlockId.torch) this.torches.delete(`${c.pos.x},${c.pos.y},${c.pos.z}`);
    });
  }

  /** torch 개수. */
  get size(): number {
    return this.torches.size;
  }

  /** point 에 가까운 순서로 최대 limit 개의 불꽃 위치. */
  nearest(point: THREE.Vector3, limit: number): THREE.Vector3[] {
    return [...this.torches.values()]
      .sort((a, b) => a.distanceToSquared(point) - b.distanceToSquared(point))
      .slice(0, limit);
  }

  /** 칸의 불꽃 위치(칸 가운데보다 조금 위)를 기록한다. */
  private add(x: number, y: number, z: number): void {
    this.torches.set(`${x},${y},${z}`, new THREE.Vector3(x + 0.5, y + 0.7, z + 0.5));
  }
}

/** torch 불빛 색(따뜻한 주황). */
const TORCH_COLOR = new THREE.Color(0xffb35c);

/** 시계를 읽어 하늘·광원을 바꾸고 가까운 torch 광원을 켠다. */
export class DayNightVisual {
  private readonly torches: TorchIndex;
  /** 캐릭터(Lambert 재질)를 비추는 점광원. 개수를 고정해 셰이더 재컴파일을 막는다 */
  private readonly pointLights: THREE.PointLight[] = [];
  private time = 0;
  /** 이번 프레임에 켠 torch 광원 수(계측) */
  activeLights = 0;

  /** 렌더러·시계·월드를 받는다. 점광원 16 개를 장면에 미리 둔다. */
  constructor(
    private readonly renderer: Renderer,
    private readonly clock: GameClockReader,
    world: VoxelWorld,
    events: EventBus,
    private readonly maxLights: number,
  ) {
    this.torches = new TorchIndex(world, events);
    const count = Math.min(maxLights, MAX_VOXEL_POINT_LIGHTS);
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(TORCH_COLOR, 0, 9, 1.6);
      this.pointLights.push(light);
      renderer.scene.add(light);
    }
  }

  /** torch 개수(계측). */
  get torchCount(): number {
    return this.torches.size;
  }

  /** 매 프레임 부른다. 조명을 시각에 맞추고 카메라에 가까운 torch 부터 광원을 배정한다. */
  update(dt: number): void {
    this.time += dt;
    const s = lightAt(this.clock.minuteOfDay);
    const r = this.renderer;
    const bg = r.scene.background;
    if (bg instanceof THREE.Color) bg.copy(s.sky);
    if (r.scene.fog instanceof THREE.Fog) r.scene.fog.color.copy(s.sky);
    r.sun.color.copy(s.sun);
    r.sun.intensity = s.sunIntensity;
    r.sun.position.copy(s.sunDirection);
    r.ambient.color.copy(s.hemiSky);
    r.ambient.groundColor.copy(s.hemiGround);
    r.ambient.intensity = s.hemiIntensity;
    r.syncLighting();
    // 가까운 torch 부터 최대 16 개. 밤일수록 불빛이 두드러진다. 아주 약하게 일렁인다
    const near = this.torches.nearest(r.camera.position, this.pointLights.length);
    const strength = 0.35 + 0.65 * s.night;
    const u = r.lighting;
    near.forEach((p, i) => {
      const flicker =
        1 + Math.sin(this.time * 7.3 + i * 1.7) * 0.03 + Math.sin(this.time * 13.1 + i) * 0.02;
      const light = this.pointLights[i] as THREE.PointLight;
      light.position.copy(p);
      light.intensity = 2.4 * strength * flicker;
      (u.pointPositions.value[i] as THREE.Vector3).copy(p);
      (u.pointColors.value[i] as THREE.Color)
        .copy(TORCH_COLOR)
        .multiplyScalar(1.15 * strength * flicker);
    });
    for (let i = near.length; i < this.pointLights.length; i++) {
      (this.pointLights[i] as THREE.PointLight).intensity = 0;
    }
    u.pointCount.value = near.length;
    this.activeLights = near.length;
  }
}
