// 부트스트랩. game 과 render 를 함께 아는 유일한 위치다 (MVP_SPEC 33, ARCHITECTURE 3).
// ?scene= 으로 장면을 고른다: 기본은 고정 섬 (TASK-008), mesh-edit (TASK-006) / house (TASK-007) 는 시각 검증용.
import { balance } from './game/data/balance';
import {
  meshEditCells,
  meshEditFixture,
  smallHouseFixture,
  type VisualFixture,
} from './game/data/visualFixtures';
import { BlockId } from './game/data/blocks';
import { GameWorld } from './game/GameWorld';
import { buildIsland, ISLAND_REGIONS } from './game/data/island';
import { Renderer } from './render/Renderer';
import type { BlockPos } from './game/types';

/** 브라우저 검증에서 읽는 계측값. 콘솔과 window.__gtb 로 공개한다. */
interface FrameProbe {
  frames: number;
  maxFrameMs: number;
  over33ms: number;
  edits: number;
  settledAtMs: number | null;
  /** 33ms 를 넘은 프레임의 [초기 메싱 완료 후 경과 ms, 프레임 ms] */
  spikes: [number, number][];
  /** ?measure=초 : 워밍업 뒤 측정 구간의 결과 (MVP_SPEC 36) */
  measure: MeasureResult | null;
}

/** 측정 구간의 평균 FPS·하위 1% FPS·최대 드로우콜. */
interface MeasureResult {
  seconds: number;
  frames: number;
  avgFps: number;
  low1Fps: number;
  maxFrameMs: number;
  maxDrawCalls: number;
  done: boolean;
}

/** 워밍업 초. 초기 메싱 완료 뒤 이만큼 기다렸다가 측정한다. */
const MEASURE_WARMUP_MS = 5000;

/** 프레임 시간 목록으로 측정 결과를 만든다. 하위 1% FPS 는 가장 느린 1% 프레임의 평균으로 계산한다. */
function summarize(
  frameMs: number[],
  seconds: number,
  maxDrawCalls: number,
  done: boolean,
): MeasureResult {
  const total = frameMs.reduce((a, b) => a + b, 0);
  const sorted = [...frameMs].sort((a, b) => b - a);
  const worst = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 100)));
  const worstAvg = worst.reduce((a, b) => a + b, 0) / worst.length;
  return {
    seconds,
    frames: frameMs.length,
    avgFps: frameMs.length / (total / 1000),
    low1Fps: 1000 / worstAvg,
    maxFrameMs: sorted[0] ?? 0,
    maxDrawCalls,
    done,
  };
}

/** 캔버스를 찾아 반환한다. 없으면 부트스트랩을 중단한다. */
function getCanvas(): HTMLCanvasElement {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('#game canvas 를 찾을 수 없다');
  }
  return canvas;
}

/** 섬의 관찰 시점. 0 전경 / 1 마을 터 / 2 채석장 / 3 숲 / 4 물가 / 5 어두운 외곽(북). */
const ISLAND_VIEWS: VisualFixture['views'] = [
  { target: { x: 64, y: 26, z: 64 }, distance: 150, yaw: 0.5, pitch: 0.72 },
  { target: { x: 64, y: 28, z: 64 }, distance: 34, yaw: 0.4, pitch: 0.45 },
  {
    target: { x: ISLAND_REGIONS.quarry.x, y: 30, z: ISLAND_REGIONS.quarry.z },
    distance: 34,
    yaw: 2.2,
    pitch: 0.5,
  },
  {
    target: { x: ISLAND_REGIONS.forest.x, y: 30, z: ISLAND_REGIONS.forest.z },
    distance: 36,
    yaw: -0.8,
    pitch: 0.5,
  },
  {
    target: { x: ISLAND_REGIONS.waterside.x, y: 26, z: ISLAND_REGIONS.waterside.z },
    distance: 30,
    yaw: 0.2,
    pitch: 0.6,
  },
  {
    target: { x: ISLAND_REGIONS.outskirtsNorth.x, y: 28, z: ISLAND_REGIONS.outskirtsNorth.z },
    distance: 30,
    yaw: 3.0,
    pitch: 0.55,
  },
];

/** 고정 섬 장면. 블록은 buildIsland 가 쓰고 크기는 balance.world 다. */
const islandScene: VisualFixture = {
  size: balance.world,
  build: (write) => void buildIsland(write),
  objects: [],
  views: ISLAND_VIEWS,
};

/** 장면 이름 → 장면. */
function pickFixture(name: string | null): VisualFixture {
  if (name === 'mesh-edit') return meshEditFixture;
  if (name === 'house') return smallHouseFixture;
  return islandScene;
}

/** 고정 장면의 index 번째 시점. 없으면 첫 시점이다. */
function pickView(fixture: VisualFixture, index: number): VisualFixture['views'][number] {
  const view = fixture.views[index] ?? fixture.views[0];
  if (!view) throw new Error('고정 장면에 시점이 없다');
  return view;
}

/** 고정 장면으로 GameWorld 를 만든다. 다중 칸 객체는 editObject 로 놓는다. */
function createWorld(fixture: VisualFixture): GameWorld {
  const world = new GameWorld({ storage: balance.storage, worldSize: fixture.size });
  const t0 = performance.now();
  fixture.build((x, y, z, id) => world.voxels.writeInitial(x, y, z, id));
  console.info(`[gtb] 월드 생성 ${(performance.now() - t0).toFixed(1)} ms`);
  for (const o of fixture.objects) {
    const placed = world.voxels.editObject(
      { kind: 'place', object: { id: world.voxels.placements.allocateId(), ...o } },
      'player',
    );
    if (!placed) console.warn('고정 장면 객체 배치 실패', o);
  }
  world.voxels.markAllDirty();
  return world;
}

/**
 * TASK-006 편집 구동기. 초기 메싱이 끝나면 초당 editsPerSecond 칸을 토글한다.
 * 청크 경계 x = 15 / 16 과 꼭짓점 (16, 16, 16) 주변을 포함한다. 사람의 연속 설치보다 빠른 속도로 시험한다.
 */
function createEditDriver(world: GameWorld, editsPerSecond: number): (dt: number) => number {
  const cells: BlockPos[] = meshEditCells();
  let cursor = 0;
  let budget = 0;
  return (dt) => {
    budget += dt * editsPerSecond;
    let done = 0;
    while (budget >= 1) {
      budget -= 1;
      const c = cells[cursor % cells.length] as BlockPos;
      const current = world.voxels.getBlock(c.x, c.y, c.z);
      const next =
        current === BlockId.air ? (cursor % 3 === 0 ? BlockId.window : BlockId.plank) : BlockId.air;
      world.voxels.setBlock(c.x, c.y, c.z, next, 'player');
      cursor += 1;
      done += 1;
    }
    return done;
  };
}

/** 앱을 시작한다. */
function start(): void {
  const params = new URLSearchParams(window.location.search);
  const sceneName = params.get('scene');
  const fixture = pickFixture(sceneName);
  const world = createWorld(fixture);
  const renderer = new Renderer(getCanvas(), world.voxels, {
    workerCount: Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1)),
    chunkUploadsPerFrame: balance.performance.chunkUploadsPerFrame,
    maxPixelRatio: Number(params.get('dpr') ?? 2),
  });
  const view = pickView(fixture, Number(params.get('view') ?? 0));
  const orbit = params.get('orbit') !== '0';
  const editDriver =
    sceneName === 'mesh-edit' ? createEditDriver(world, Number(params.get('eps') ?? 20)) : null;

  const probe: FrameProbe = {
    frames: 0,
    maxFrameMs: 0,
    over33ms: 0,
    edits: 0,
    settledAtMs: null,
    spikes: [],
    measure: null,
  };
  const measureSeconds = Number(params.get('measure') ?? 0);
  const measured: number[] = [];
  let maxDraws = 0;
  (window as unknown as { __gtb: unknown }).__gtb = { world, renderer, probe };
  const startedAt = performance.now();
  let last = startedAt;
  let lastReport = startedAt;

  /** 한 프레임: 게임 규칙 → 렌더 (ARCHITECTURE 3). dt 는 0.1 초로 클램프한다. */
  function frame(now: number): void {
    const frameMs = now - last;
    const dt = Math.min(frameMs / 1000, 0.1);
    last = now;
    if (probe.settledAtMs !== null) {
      probe.frames += 1;
      probe.maxFrameMs = Math.max(probe.maxFrameMs, frameMs);
      if (frameMs > 33.4) {
        probe.over33ms += 1;
        probe.spikes.push([Math.round(now - startedAt - probe.settledAtMs), Math.round(frameMs)]);
      }
      if (editDriver) probe.edits += editDriver(dt);
    }
    world.update(dt);
    const t = (now - startedAt) / 1000;
    renderer.setOrbitView({
      target: view.target,
      distance: view.distance,
      yaw: view.yaw + (orbit ? t * 0.05 : 0),
      pitch: view.pitch,
    });
    renderer.render();
    if (measureSeconds > 0 && probe.settledAtMs !== null && probe.measure?.done !== true) {
      const since = now - startedAt - probe.settledAtMs;
      if (since > MEASURE_WARMUP_MS) {
        measured.push(frameMs);
        maxDraws = Math.max(maxDraws, renderer.drawCalls);
        const elapsed = since - MEASURE_WARMUP_MS;
        probe.measure = summarize(
          measured,
          elapsed / 1000,
          maxDraws,
          elapsed >= measureSeconds * 1000,
        );
        if (probe.measure.done) console.info('[gtb] 측정 완료', JSON.stringify(probe.measure));
      }
    }
    if (probe.settledAtMs === null && renderer.chunks.settled) {
      probe.settledAtMs = now - startedAt;
      console.info(
        `[gtb] 초기 메싱 완료 ${probe.settledAtMs.toFixed(0)} ms, 메시 ${renderer.chunks.meshCount}`,
      );
    }
    if (now - lastReport > 2000) {
      lastReport = now;
      const s = renderer.chunks.stats;
      console.info(
        `[gtb] frames=${probe.frames} maxFrameMs=${probe.maxFrameMs.toFixed(1)} over33=${probe.over33ms} ` +
          `edits=${probe.edits} pending=${s.pending} inFlight=${s.inFlight} discarded=${s.discardedResults} ` +
          `meshed=${s.meshedChunks}/${s.totalChunks} draws=${renderer.drawCalls}`,
      );
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

start();
