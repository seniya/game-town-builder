// 부트스트랩. game 과 render 를 함께 아는 유일한 위치다 (MVP_SPEC 33, ARCHITECTURE 3).
// ?scene= 으로 시각 검증 장면을 고른다: mesh-edit (TASK-006) / house (TASK-007).
import { balance } from './game/data/balance';
import {
  meshEditCells,
  meshEditFixture,
  smallHouseFixture,
  type VisualFixture,
} from './game/data/visualFixtures';
import { BlockId } from './game/data/blocks';
import { GameWorld } from './game/GameWorld';
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
}

/** 캔버스를 찾아 반환한다. 없으면 부트스트랩을 중단한다. */
function getCanvas(): HTMLCanvasElement {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('#game canvas 를 찾을 수 없다');
  }
  return canvas;
}

/** 장면 이름 → 고정 장면. */
function pickFixture(name: string | null): VisualFixture {
  return name === 'mesh-edit' ? meshEditFixture : smallHouseFixture;
}

/** 고정 장면으로 GameWorld 를 만든다. 다중 칸 객체는 editObject 로 놓는다. */
function createWorld(fixture: VisualFixture): GameWorld {
  const world = new GameWorld({ storage: balance.storage, worldSize: fixture.size });
  fixture.build((x, y, z, id) => world.voxels.writeInitial(x, y, z, id));
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
  const view = fixture.view;
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
  };
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
