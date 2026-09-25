// 부트스트랩. game 과 render 를 함께 아는 유일한 위치다 (MVP_SPEC 33, ARCHITECTURE 3).
// ?scene= 으로 장면을 고른다: 기본은 고정 섬 (TASK-008), mesh-edit (TASK-006) / house (TASK-007) 는 시각 검증용.
import * as THREE from 'three';
import { balance } from './game/data/balance';
import {
  meshEditCells,
  meshEditFixture,
  kitchenLabFixture,
  ROOM_LAB_KIT,
  roomLabFixture,
  SLEEP_LAB_KIT,
  sleepLabFixture,
  smallHouseFixture,
  type VisualFixture,
} from './game/data/visualFixtures';
import { BLOCKS, BlockId } from './game/data/blocks';
import { GameWorld } from './game/GameWorld';
import { buildIsland, ISLAND_REGIONS, islandPlayerSpawn } from './game/data/island';
import { perfFixture } from './game/data/perfFixture';
import {
  applyRoleLoad,
  prepareMvpPerf,
  writeMvpPerfRooms,
  writeRoleLoad,
  type RoleLoad,
} from './game/perfLoad';
import { formatClock, MINUTES_PER_DAY } from './game/systems/GameClockSystem';
import { CameraController, HIDE_PLAYER_BELOW } from './render/CameraController';
import { PlayerView } from './render/EntityView';
import { Highlight } from './render/Highlight';
import { FurnitureView } from './render/FurnitureView';
import { GrassView } from './render/GrassView';
import { createItemIconProvider } from './render/itemIcons';
import { createModelIconSource } from './render/modelIcons';
import { Renderer } from './render/Renderer';
import { RoomLabelView } from './render/RoomLabelView';
import { BarkBubbleView } from './render/BarkBubbleView';
import { GratitudePopupView } from './render/GratitudePopupView';
import { DayNightVisual } from './render/DayNightVisual';
import { NavOverlayView } from './render/NavOverlayView';
import { NpcViews } from './render/NpcView';
import { MonsterViews } from './render/MonsterView';
import { PropView } from './render/PropView';
import { CropView } from './render/CropView';
import { DishView } from './render/DishView';
import { CeilingCapView } from './render/CeilingCapView';
import { RoomOverlayView } from './render/RoomOverlayView';
import { blockItem } from './game/systems/InventorySystem';
import type { BlockPos } from './game/types';
import { BellPanel } from './ui/BellPanel';
import { DialogueBox } from './ui/DialogueBox';
import { ClockHud } from './ui/ClockHud';
import { InteractPrompt } from './ui/InteractPrompt';
import { endingPose, type EndingScene } from './game/ending/endingShot';
import { ArrivalToast } from './ui/ArrivalToast';
import { EndingOverlay } from './ui/EndingOverlay';
import { ObjectivePanel } from './ui/ObjectivePanel';
import { IndexedDbSaveStore } from './ui/IndexedDbSaveStore';
import { SaveIndicator } from './ui/SaveIndicator';
import { applySave, SaveRejectedError } from './game/save/saveData';
import { HealthHud } from './ui/HealthHud';
import { DamageReportPanel } from './ui/DamageReportPanel';
import { DamageMarkView } from './render/DamageMarkView';
import { BellRingView } from './render/BellRingView';
import { donate } from './game/systems/donation';
import { findInteractTarget, type InteractTarget } from './game/systems/interaction';
import { GratitudeHud } from './ui/GratitudeHud';
import { Crosshair } from './ui/Crosshair';
import { DebugPanel } from './ui/DebugPanel';
import { itemLabel } from './ui/itemLabels';
import { Hotbar } from './ui/Hotbar';
import { bindDomInput } from './ui/domInput';
import { InventoryPanel } from './ui/InventoryPanel';
import { bindModalKeys, requestCanvasLock, ScreenStateMachine } from './ui/ModalController';
import { PauseMenu } from './ui/PauseMenu';
import { RoomDiagnosticPanel } from './ui/RoomDiagnosticPanel';
import { AudioEngine } from './ui/audio/AudioEngine';
import { GameSounds } from './ui/audio/GameSounds';

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

/**
 * 섬의 좌표 정보(종·주민 시작 칸·채석장 후보). buildIsland 는 결정적이므로(ARCHITECTURE 24)
 * 쓰기 없이 한 번 더 불러 월드를 만들기 전에 얻는다.
 */
const islandData = buildIsland(() => undefined);

/** 고정 섬 장면. 블록은 buildIsland 가 쓰고 크기는 balance.world 다. */
const islandScene: VisualFixture = {
  size: balance.world,
  build: (write) => void buildIsland(write),
  objects: [],
  playerSpawn: islandPlayerSpawn(),
  views: ISLAND_VIEWS,
  quarryCandidates: islandData.quarryRespawnCandidates,
  plazaCenter: islandData.bellPos,
  arrivalCell: islandData.residentArrival,
  monsterSpawns: islandData.monsterSpawns,
  residents: [
    { role: 'farmer', cell: islandData.npcSpawns.farmer },
    { role: 'cook', cell: islandData.npcSpawns.cook },
    { role: 'carpenter', cell: islandData.npcSpawns.carpenter },
  ],
};

/** MVP 성능 측정 장면의 방·객체 (MVP_SPEC 36, TASK-053). 쓰기 없이 한 번 불러 객체 목록을 얻는다. */
const mvpPerfObjects = writeMvpPerfRooms(() => undefined, islandData.bellPos);

/** MVP 성능 측정 장면: 초기 섬 + 네 방·광원 16 + 주민 다섯, 20:58 시작(곧 2 차 습격 몬스터 다섯). 측정 전용이다. */
const mvpPerfScene: VisualFixture = {
  ...islandScene,
  build: (write) => {
    buildIsland(write);
    writeMvpPerfRooms(write, islandData.bellPos);
  },
  objects: mvpPerfObjects,
  residents: [
    ...(islandScene.residents ?? []),
    { role: 'villager', cell: islandData.residentArrival },
    { role: 'villager', cell: islandData.residentArrival },
  ],
  defaultStartHour: 20 + 58 / 60,
};

/**
 * ?time=시(소수 가능, 19.5 = 19:30) 를 시작 gameMinutes 로 바꾼다. 07:00 이후면 Day 1, 이전이면 Day 2 의 그 시각이다.
 * 관찰 장면용 시작 조건이며 게임 규칙이 아니다.
 */
function startMinutesFromParam(value: string | null, fallbackHour?: number): number {
  if (value === null && fallbackHour === undefined) return 0;
  const hours = value === null ? (fallbackHour ?? 0) : Number(value);
  if (!(hours >= 0 && hours < 24)) return 0;
  const target = Math.round(hours * 60);
  const start = balance.clock.startHour * 60;
  return (((target - start) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** 장면 이름 → 장면. */
function pickFixture(name: string | null): VisualFixture {
  if (name === 'mesh-edit') return meshEditFixture;
  if (name === 'house') return smallHouseFixture;
  if (name === 'room-lab') return roomLabFixture;
  if (name === 'sleep-lab') return sleepLabFixture;
  if (name === 'kitchen-lab') return kitchenLabFixture;
  if (name === 'perf') return perfFixture;
  if (name === 'mvp-perf') return mvpPerfScene;
  return islandScene;
}

/** 고정 장면의 index 번째 시점. 없으면 첫 시점이다. */
function pickView(fixture: VisualFixture, index: number): VisualFixture['views'][number] {
  const view = fixture.views[index] ?? fixture.views[0];
  if (!view) throw new Error('고정 장면에 시점이 없다');
  return view;
}

/** 고정 장면으로 GameWorld 를 만든다. 다중 칸 객체는 editObject 로 놓는다. */
function createWorld(
  fixture: VisualFixture,
  play: boolean,
  startGameMinutes: number,
  residentLimit: number,
  roleLoad = 0,
  saveStore: IndexedDbSaveStore | null = null,
): GameWorld {
  const world = new GameWorld({
    storage: { ...balance.storage, ...fixture.startStorage },
    worldSize: fixture.size,
    startGameMinutes,
    ...(fixture.plazaCenter ? { plazaCenter: fixture.plazaCenter } : {}),
    ...(fixture.arrivalCell ? { arrivalCell: fixture.arrivalCell } : {}),
    ...(fixture.monsterSpawns ? { monsterSpawns: fixture.monsterSpawns } : {}),
    ...(saveStore ? { saveStore } : {}),
    ...(fixture.quarryCandidates ? { quarryCandidates: fixture.quarryCandidates } : {}),
    ...(play && fixture.playerSpawn ? { playerSpawn: fixture.playerSpawn } : {}),
  });
  const t0 = performance.now();
  fixture.build((x, y, z, id) => world.voxels.writeInitial(x, y, z, id));
  // PERF-002: ?load=n 이면 역할 후보 n 건을 넣는다(시험 장면 전용)
  const load: RoleLoad | null =
    roleLoad > 0
      ? writeRoleLoad((x, y, z, id) => world.voxels.writeInitial(x, y, z, id), roleLoad)
      : null;
  console.info(`[gtb] 월드 생성 ${(performance.now() - t0).toFixed(1)} ms`);
  for (const o of fixture.objects) {
    const placed = world.voxels.editObject(
      { kind: 'place', object: { id: world.voxels.placements.allocateId(), ...o } },
      'player',
    );
    if (!placed) console.warn('고정 장면 객체 배치 실패', o);
  }
  world.voxels.markAllDirty();
  // 장면에 미리 지어 둔 방은 로드처럼 조용히 인식한다(인식 연출·보상 이벤트 없음)
  world.rooms.rebuildAll();
  if (load) applyRoleLoad(world, load);
  const kit =
    fixture === roomLabFixture
      ? ROOM_LAB_KIT
      : fixture === sleepLabFixture || fixture === kitchenLabFixture
        ? SLEEP_LAB_KIT
        : [];
  if (world.player) {
    for (const k of kit) world.inventory.add([{ item: blockItem(k.blockId), count: k.count }]);
  }
  for (const r of (fixture.residents ?? []).slice(0, residentLimit)) {
    world.spawnResident(r.role, r.cell);
  }
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

/** 조작 모드의 프레임 훅. update 는 world.update 뒤·렌더 전, paused 면 world.update 를 건너뛴다. */
/** 엔딩 샷에 쓸 장면 좌표(종·목수·주민). 렌더는 게임 상태를 읽기만 한다. */
function endingScene(world: GameWorld): EndingScene {
  const c = world.plazaCenter;
  const bell = c
    ? { x: c.x + 0.5, y: c.y, z: c.z + 0.5 }
    : (world.player?.body.pos ?? { x: 0, y: 0, z: 0 });
  const npcs = [...world.registry.npcs.values()];
  const carpenter = npcs.find((n) => n.role === 'carpenter');
  return {
    bell,
    carpenter: carpenter ? carpenter.body.pos : null,
    residents: npcs.map((n) => n.body.pos),
  };
}

interface PlayView {
  readonly update: () => void;
  readonly paused: () => boolean;
  /** 일시정지 메뉴에 소리 켜기/끄기 버튼을 붙인다 (TASK-050) */
  readonly addMuteToggle: (audio: AudioEngine) => void;
  /** 일시정지 메뉴에 "새로 시작" 버튼을 붙인다 (TASK-051) */
  readonly addNewGameButton: (onClick: () => void) => void;
}

/**
 * 조작 모드의 입력·화면 상태·카메라·플레이어 모형·조준 표시·HUD 를 연결한다 (TASK-010~015).
 */
function createPlayView(world: GameWorld, renderer: Renderer): PlayView {
  const player = world.player;
  const blockEdit = world.blockEdit;
  if (!player || !blockEdit) throw new Error('조작 모드에는 플레이어가 필요하다');
  const canvas = renderer.webgl.domElement;
  bindDomInput(canvas, world.input);
  const camera = new CameraController(renderer.camera, world.voxels, player, renderer.lighting);
  const body = new PlayerView();
  // 플레이어 동작(TASK-ANIM-001): 직접 놓은 블록·몬스터 타격에 한 번 휘두른다
  world.events.on('BLOCK_CHANGED', (c) => {
    if (c.by === 'player' && c.to !== BlockId.air) body.playSwing('place');
  });
  world.events.on('COMBAT_HIT', (h) => {
    if (h.target === 'monster') body.playSwing('attack');
  });
  const caps = new CeilingCapView(world.voxels);
  renderer.scene.add(caps.object3d);
  let lastUpdate = performance.now();
  const highlight = new Highlight();
  const crosshair = new Crosshair(document.body);
  const iconFor = createItemIconProvider(createModelIconSource(renderer.webgl));
  new Hotbar(document.body, world.events, world.inventory, iconFor, balance.inventory.hotbarSlots);
  let machine: ScreenStateMachine | null = null;
  const menu = new PauseMenu(document.body, () => machine?.resumeFromMenu());
  const inventoryPanel = new InventoryPanel(
    document.body,
    world.events,
    {
      slotCount: balance.inventory.hotbarSlots + balance.inventory.bagSlots,
      hotbarSlots: balance.inventory.hotbarSlots,
      slot: (i) => world.inventory.slot(i),
      recipes: () => world.crafting.statuses(),
      craft: (id) => void world.crafting.craft(id),
      swap: (a, b) => world.inventory.swap(a, b),
      requestClose: () => machine?.close(true),
    },
    iconFor,
  );
  const bellPanel = new BellPanel(document.body, {
    evaluate: () => world.village.evaluate(),
    ring: () => world.village.ring(),
    storage: () => world.storage.snapshot(),
    carried: (mat) => world.inventory.count({ kind: 'material', material: mat }),
    donate: (mat, amount) => donate(world.inventory, world.storage, mat, amount),
    requestClose: () => machine?.close(true),
  });
  const prompt = new InteractPrompt(document.body);
  const damageReport = new DamageReportPanel(document.body, world.events, () =>
    machine?.close(true),
  );
  const endingOverlay = new EndingOverlay(
    document.body,
    () => machine?.close(true),
    () => world.ending.finish(),
  );
  /** F 로 고른 대화 상대. DialogueBox 가 열릴 때 읽는다 */
  let talkTarget: string | null = null;
  const speakerNames: Record<string, string> = {
    farmer: '농부',
    cook: '요리사',
    carpenter: '목수',
    villager: '주민',
  };
  const dialogueBox = new DialogueBox(document.body, {
    begin: () => {
      const npc = talkTarget ? world.registry.npcs.get(talkTarget) : undefined;
      return npc ? world.dialogue.begin(npc) : null;
    },
    advance: () => world.dialogue.advance(),
    abort: () => world.dialogue.abort(),
    speakerName: (id) => speakerNames[world.registry.npcs.get(id)?.role ?? 'villager'] ?? '주민',
    requestClose: () => machine?.close(true),
  });
  /** 이 주민이 지금 대화할 수 있는가. */
  const talkable = (npcId: string): boolean => {
    const npc = world.registry.npcs.get(npcId);
    return npc !== undefined && world.dialogue.hasDialogue(npc);
  };
  /** 지금 F 로 열 대상 (READY-07). */
  const interactTarget = (): InteractTarget | null =>
    findInteractTarget(world.voxels, player, world.registry.npcs.values());
  machine = new ScreenStateMachine(
    {
      requestLock: () => requestCanvasLock(canvas),
      exitLock: () => document.exitPointerLock(),
      setGameplayBlocked: (b) => world.input.setGameplayBlocked(b),
      showMenu: () => menu.show(),
      hideMenu: () => menu.hide(),
    },
    {
      inventory: inventoryPanel,
      bell: bellPanel.bellView,
      storage: bellPanel.storageView,
      dialogue: dialogueBox,
      damageReport,
      ending: endingOverlay,
    },
    () => {
      const t = interactTarget();
      if (t?.kind === 'bell') return 'bell';
      if (t?.kind === 'chest') return 'storage';
      if (t?.kind === 'npc' && talkable(t.npcId)) {
        talkTarget = t.npcId;
        return 'dialogue';
      }
      // 들을 대사가 없는 주민은 한마디만 한다(모달 없음, MVP_SPEC 19.7)
      if (t?.kind === 'npc') world.barks.poke(t.npcId);
      return null;
    },
  );
  world.events.on('VILLAGE_LEVEL_UP', () => camera.shake(0.9));
  // 쓰러지면 열린 모달을 닫고 흔든다(부활은 CombatSystem 이 한다, MVP_SPEC 26.1)
  world.events.on('PLAYER_DOWN', () => {
    if (machine?.state.kind === 'modal') machine.close(true);
    camera.shake(0.5);
  });
  const healthHud = new HealthHud(
    document.body,
    () => player.health,
    balance.player.maxHealth,
    world.events,
  );
  bindModalKeys(canvas, machine);
  const diagnosticPanel = new RoomDiagnosticPanel(document.body, {
    active: () => world.roomSystem.diagnosisActive,
    diagnosis: () => world.rooms.getDiagnosis(),
  });
  renderer.scene.add(body.object3d, highlight.object3d);
  const screen = machine;
  (window as unknown as { __gtbScreen: unknown }).__gtbScreen = screen;
  return {
    paused: () => screen.paused,
    addNewGameButton: (onClick) => menu.addButton('새로 시작', onClick),
    addMuteToggle: (audio) => {
      const render = menu.addToggle(
        (on) => (on ? '소리 켜기 (M)' : '소리 끄기 (M)'),
        () => audio.muted,
        (on) => audio.setMuted(on),
      );
      audio.onMuteChange(() => render());
    },
    update: () => {
      const now = performance.now();
      const realDt = (now - lastUpdate) / 1000;
      // 엔딩 연출 중에는 샷 계산이 카메라를 옮긴다 (TASK-052)
      endingOverlay.update(realDt);
      const pose = endingOverlay.isOpen
        ? endingPose(endingOverlay.elapsed, endingScene(world))
        : null;
      if (pose) camera.showPose(pose.eye, pose.target);
      else camera.update(realDt);
      caps.update(realDt, camera.ceilingCut);
      lastUpdate = now;
      body.syncFrom(player, camera.distance >= HIDE_PLAYER_BELOW, realDt, {
        breaking: blockEdit.breakingPos !== null,
      });
      const target = screen.state.kind === 'playing' ? blockEdit.target : null;
      highlight.show(target ? target.pos : null, world.voxels.placements, blockEdit.breakProgress);
      crosshair.update(target !== null, screen.state.kind === 'playing');
      const it = screen.state.kind === 'playing' ? interactTarget() : null;
      prompt.update(
        it?.kind === 'bell'
          ? '[F] 종'
          : it?.kind === 'chest'
            ? '[F] 저장소'
            : it?.kind === 'npc' && talkable(it.npcId)
              ? '[F] 대화하기'
              : it?.kind === 'npc' && world.barks.canPoke(it.npcId)
                ? '[F] 말 걸기'
                : null,
      );
      bellPanel.update(now);
      // 엔딩은 조작 중일 때 연다. 같은 아침의 피해 보고는 엔딩 뒤에 연다 (MVP_SPEC 25.4 / 28)
      if (world.ending.pending && screen.state.kind === 'playing') screen.open('ending');
      else if (damageReport.pending && screen.state.kind === 'playing') screen.open('damageReport');
      healthHud.update();
      diagnosticPanel.update();
    },
  };
}

/** PERF-001 한 프레임 표본. */
interface PerfSample {
  frameMs: number;
  updateMs: number;
  npcMs: number;
  navMs: number;
  roomMs: number;
  renderMs: number;
  draws: number;
  nodes: number;
  pathPending: number;
  oldestWait: number;
  roomQueue: number;
  roomFrameMs: number;
  meshPending: number;
  uploads: number;
}

/** 배열의 p 분위수(0~1). */
function quantile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
}

/**
 * TASK-PERF-001 구동기. 측정 구간(워밍업 뒤 seconds 초) 동안
 * 0 / 40 초에 20:00 직전, 20 초에 05:00 직전으로 시각을 옮겨 전원 동시 경로 요청을 만들고,
 * 앞 30 초는 초당 10 칸 편집(국소: 광장 옆 방 안 / 경계: 청크 경계 x = 127·128), 뒤 30 초는 편집 없이 큐 소진을 본다.
 * 끝나면 `[gtb] PERF 결과` 한 줄을 콘솔에 남긴다.
 */
function createPerfDriver(
  world: GameWorld,
  renderer: Renderer,
  seconds: number,
  /** false 면 시각을 옮기지 않는다(PERF-002: 역할 작업 시간 그대로 잰다) */
  timeJumps = true,
): { frame: (sinceWarmMs: number, dtMs: number, renderMs: number) => void; result: () => unknown } {
  world.profile = true;
  const samples: PerfSample[] = [];
  const visibleChunks: number[] = [];
  const visibleNpcs: number[] = [];
  let bursts = 0;
  let editBudget = 0;
  let edits = 0;
  let done: unknown = null;
  const frustum = new THREE.Frustum();
  const m = new THREE.Matrix4();
  const plaza = world.plazaCenter ?? { x: 0, y: 0, z: 0 };
  // 국소 편집: 광장 북동쪽 방 안 한 칸, 경계 편집: 청크 경계 두 칸(길 위)
  const room = world.rooms.findContaining({ x: plaza.x + 7, y: plaza.y, z: plaza.z - 7 });
  const local =
    room?.shape.interior.find((c) => world.voxels.getBlock(c.x, c.y, c.z) === BlockId.air) ?? null;
  const boundary = [
    { x: 127, y: plaza.y, z: plaza.z + 2 },
    { x: 128, y: plaza.y, z: plaza.z + 2 },
  ];
  const slot = (name: Parameters<typeof world.slotMs.get>[0]): number =>
    world.slotMs.get(name) ?? 0;
  return {
    frame(since, dtMs, renderMs) {
      if (done) return;
      const t = since / 1000;
      if (!timeJumps) {
        bursts = 3;
      } else if (bursts === 0 && t >= 0) {
        world.clock.advanceTo(19, 58);
        bursts = 1;
      } else if (bursts === 1 && t >= 20) {
        world.clock.advanceTo(4, 58);
        bursts = 2;
      } else if (bursts === 2 && t >= 40) {
        world.clock.advanceTo(19, 58);
        bursts = 3;
      }
      if (t < 30) {
        editBudget += (dtMs / 1000) * 10;
        while (editBudget >= 1) {
          editBudget -= 1;
          const c = edits % 2 === 0 && local ? local : (boundary[edits % 2] ?? boundary[0]);
          if (c) {
            const cur = world.voxels.getBlock(c.x, c.y, c.z);
            world.voxels.setBlock(
              c.x,
              c.y,
              c.z,
              cur === BlockId.air ? BlockId.plank : BlockId.air,
              'player',
            );
          }
          edits += 1;
        }
      }
      const paths = world.paths.stats;
      const rooms = world.rooms.stats;
      const mesh = renderer.chunks.stats;
      let updateMs = 0;
      for (const v of world.slotMs.values()) updateMs += v;
      samples.push({
        frameMs: dtMs,
        updateMs,
        npcMs: slot('npcDecision') + slot('npc'),
        navMs: slot('nav'),
        roomMs: slot('room'),
        renderMs,
        draws: renderer.drawCalls,
        nodes: paths.lastFrameNodes,
        pathPending: paths.pending,
        oldestWait: paths.oldestWaitFrames,
        roomQueue: rooms.queueLength,
        roomFrameMs: rooms.lastFrameMs,
        meshPending: mesh.pending + mesh.inFlight,
        uploads: mesh.uploadsThisFrame,
      });
      if (samples.length % 30 === 0) {
        const cam = renderer.camera;
        m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        frustum.setFromProjectionMatrix(m);
        visibleChunks.push(renderer.chunks.countVisible(frustum));
        let n = 0;
        for (const npc of world.registry.npcs.values()) {
          const p = npc.body.pos;
          if (frustum.containsPoint(new THREE.Vector3(p.x, p.y + 1, p.z))) n += 1;
        }
        visibleNpcs.push(n);
      }
      if (t < seconds) return;
      const col = (k: keyof PerfSample): number[] => samples.map((x) => x[k]);
      const avg = (a: number[]): number => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
      const frames = col('frameMs');
      const worst = [...frames]
        .sort((a, b) => b - a)
        .slice(0, Math.max(1, Math.floor(frames.length / 100)));
      const half = (k: keyof PerfSample, second: boolean): number[] =>
        samples.filter((_, i) => i >= samples.length / 2 === second).map((x) => x[k]);
      const all = world.voxels.allChunkCoords();
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      done = {
        seconds,
        frames: frames.length,
        avgFps: 1000 / avg(frames),
        low1Fps: 1000 / avg(worst),
        frameP95: quantile(frames, 0.95),
        frameMax: Math.max(...frames),
        updateAvg: avg(col('updateMs')),
        updateP95: quantile(col('updateMs'), 0.95),
        updateMax: Math.max(...col('updateMs')),
        npcAvg: avg(col('npcMs')),
        npcMax: Math.max(...col('npcMs')),
        navAvg: avg(col('navMs')),
        navMax: Math.max(...col('navMs')),
        roomMax: Math.max(...col('roomMs')),
        roomFrameMax: Math.max(...col('roomFrameMs')),
        renderAvg: avg(col('renderMs')),
        renderP95: quantile(col('renderMs'), 0.95),
        drawsAvg: avg(col('draws')),
        drawsMax: Math.max(...col('draws')),
        nodesMax: Math.max(...col('nodes')),
        pathPendingMax: Math.max(...col('pathPending')),
        oldestWaitMax: Math.max(...col('oldestWait')),
        maxCompletedWaitFrames: world.paths.stats.maxCompletedWaitFrames,
        pathPendingEnd: world.paths.stats.pending,
        roomQueueMaxEdit: Math.max(...half('roomQueue', false)),
        roomQueueMaxDrain: Math.max(...half('roomQueue', true)),
        roomQueueEnd: world.rooms.stats.queueLength,
        meshPendingMaxEdit: Math.max(...half('meshPending', false)),
        meshPendingEnd: renderer.chunks.stats.pending + renderer.chunks.stats.inFlight,
        uploadsMax: Math.max(...col('uploads')),
        edits,
        chunksTotal: all.length,
        chunksResident: all.filter((c) => world.voxels.getChunk(c.cx, c.cy, c.cz) !== undefined)
          .length,
        chunksMeshed: renderer.chunks.stats.meshedChunks,
        visibleChunksAvg: avg(visibleChunks),
        npcs: world.registry.npcs.size,
        npcsDetailed: world.registry.npcs.size,
        visibleNpcsAvg: avg(visibleNpcs),
        rooms: world.rooms.stats.rooms,
        roomsByType: world.rooms.stats.byType,
        objects: world.voxels.placements.all().length,
        bedsAssigned: world.sleep.stats.assigned,
        heapMB: memory ? memory.usedJSHeapSize / 1048576 : null,
      };
      console.info('[gtb] PERF 결과', JSON.stringify(done));
    },
    result: () => done,
  };
}

/** 앱을 시작한다. */
async function start(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const sceneName = params.get('scene');
  // 스타일 시안 장면은 게임 월드 없이 따로 돈다 (STYLE-001, MVP_SPEC 45.1)
  if (sceneName === 'style-lab') {
    const { startStyleLab } = await import('./styleLabMain');
    startStyleLab(getCanvas(), params);
    return;
  }
  const fixture = pickFixture(sceneName);
  // 자동 저장은 고정 섬(기본 장면)에서만 한다. 시험 장면은 저장하지 않는다
  const saveStore =
    sceneName === null && typeof indexedDB !== 'undefined' ? new IndexedDbSaveStore() : null;
  // ?view= 가 있으면 고정 시점 관찰(측정) 모드, 없고 시작 칸이 있으면 조작 모드다
  const play = fixture.playerSpawn !== undefined && !params.has('view');
  const world = createWorld(
    fixture,
    play,
    startMinutesFromParam(params.get('time'), fixture.defaultStartHour),
    Number(params.get('residents') ?? Number.POSITIVE_INFINITY),
    sceneName === 'perf' ? Number(params.get('load') ?? 0) : 0,
    saveStore,
  );
  // MVP 성능 측정 장면: 레벨 3·1 차 습격 종료로 두어 21:00 에 몬스터 다섯이 온다 (MVP_SPEC 36, TASK-053)
  if (sceneName === 'mvp-perf') prepareMvpPerf(world);
  // 저장이 있으면 이어서 한다(섬 장면만, ?new=1 이면 새로 시작). 버전이 맞지 않으면 조용히 깨지지 않고 알린다 (TASK-051)
  let loadNote: string | null = null;
  if (saveStore && !params.has('new')) {
    try {
      const saved = await saveStore.read();
      if (saved) {
        const t0 = performance.now();
        applySave(world, saved);
        console.info(`[gtb] 불러오기 ${(performance.now() - t0).toFixed(0)} ms`);
        loadNote = '저장한 곳에서 이어 합니다';
      }
    } catch (e) {
      loadNote =
        e instanceof SaveRejectedError
          ? `저장을 불러올 수 없어 새로 시작합니다: ${e.message}`
          : '저장을 읽지 못해 새로 시작합니다';
      console.warn('[gtb] 불러오기 실패', e);
    }
  }
  const renderer = new Renderer(getCanvas(), world.voxels, {
    workerCount: Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1)),
    chunkUploadsPerFrame: balance.performance.chunkUploadsPerFrame,
    maxPixelRatio: Number(params.get('dpr') ?? 2),
    quality: params.get('quality') === 'low' ? 'low' : 'high',
  });
  const view = pickView(fixture, Number(params.get('view') ?? 0));
  const playView = world.player ? createPlayView(world, renderer) : null;
  const roomOverlay = new RoomOverlayView(world.rooms, world.events);
  renderer.scene.add(roomOverlay.object3d);
  const roomLabels = new RoomLabelView(document.body, world.rooms, world.events, renderer.camera);
  const gratitudePopups = new GratitudePopupView(document.body, world.events, renderer.camera);
  const barkBubbles = new BarkBubbleView(
    document.body,
    world.events,
    renderer.camera,
    (id) => world.registry.npcs.get(id)?.body.pos,
  );
  const gratitudeHud = new GratitudeHud(document.body, () => world.gratitude.total, world.events);
  const audio = new AudioEngine();
  const sounds = new GameSounds(audio, world.events, (id) => {
    const npc = world.registry.npcs.get(id);
    if (!npc) return null;
    const p = npc.body.pos;
    const c = renderer.camera.position;
    // 한마디 소리의 거리는 말풍선과 같이 카메라 기준이다 (TASK-BARK-002)
    return { role: npc.role, distance: Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) };
  });
  sounds.setPhase(world.clock.phase);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat) audio.setMuted(!audio.muted);
  });
  if (playView) playView.addMuteToggle(audio);
  let lastFeet: { x: number; z: number } | null = null;
  new ArrivalToast(document.body, world.events);
  const saveIndicator = new SaveIndicator(document.body, world.events);
  if (loadNote) saveIndicator.show(loadNote, '#f4efe2');
  if (playView && saveStore) {
    playView.addNewGameButton(() => {
      if (!window.confirm('저장을 지우고 처음부터 시작할까요?')) return;
      void saveStore.clear().then(() => window.location.reload());
    });
  }
  new ObjectivePanel(document.body, world.events);
  const bellRing = new BellRingView(world.plazaCenter, world.events);
  const damageMarks = new DamageMarkView(() => world.repair.pending.flatMap((e) => e.cells));
  renderer.scene.add(damageMarks.object3d);
  renderer.scene.add(bellRing.object3d);
  const clockHud = new ClockHud(document.body, world.clock, formatClock);
  if (params.get('bounds') === '1') world.debug.showRoomBounds = true;
  if (params.get('nav') === '1') world.debug.showNavCells = true;
  const navOverlay = new NavOverlayView(world.nav);
  renderer.scene.add(navOverlay.object3d);
  const npcViews = new NpcViews(() => world.registry.npcs.values(), {
    placement: (id) => world.voxels.placements.get(id),
    plazaCenter: world.plazaCenter,
    talkable: (npc) => world.dialogue.hasDialogue(npc),
  });
  renderer.scene.add(npcViews.object3d);
  const monsterViews = new MonsterViews(() => world.registry.monsters.values());
  renderer.scene.add(monsterViews.object3d);
  const props = new PropView(world.voxels.placements, () => world.characterBodies());
  renderer.scene.add(props.object3d);
  const crops = new CropView(() => world.farm.crops());
  renderer.scene.add(crops.object3d);
  const furniture = new FurnitureView(world.voxels, world.events);
  renderer.scene.add(furniture.object3d);
  const grass = new GrassView(world.voxels, renderer.lighting.time);
  renderer.scene.add(grass.mesh);
  const dishes = new DishView(() => world.registry.npcs.values());
  renderer.scene.add(dishes.object3d);
  const dayNight = new DayNightVisual(
    renderer,
    world.clock,
    world.voxels,
    world.events,
    balance.performance.maxPointLights,
  );
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
  if (params.get('unlimited') === '1') world.debug.setUnlimitedBlocks(true);
  const fpsWindow: number[] = [];
  const debugPanel = new DebugPanel(document.body, {
    game: () => world.debug.snapshot(),
    render: () => {
      const total = fpsWindow.reduce((a, b) => a + b, 0);
      const s = renderer.chunks.stats;
      return {
        fps: fpsWindow.length > 0 ? (fpsWindow.length * 1000) / total : 0,
        frameMs: fpsWindow.at(-1) ?? 0,
        maxFrameMs: fpsWindow.length > 0 ? Math.max(...fpsWindow) : 0,
        drawCalls: renderer.drawCalls,
        chunksTotal: s.totalChunks,
        chunksMeshed: s.meshedChunks,
        chunksPending: s.pending,
        chunksInFlight: s.inFlight,
        uploadsThisFrame: s.uploadsThisFrame,
      };
    },
    setUnlimitedBlocks: (on) => world.debug.setUnlimitedBlocks(on),
    setUnlimitedBlockId: (id) => world.debug.setUnlimitedBlockId(id),
    setShowRoomBounds: (on) => {
      world.debug.showRoomBounds = on;
    },
    setShowNavCells: (on) => {
      world.debug.showNavCells = on;
    },
    placeableBlocks: BLOCKS.filter((b) => b.breakSeconds !== null && b.id !== BlockId.crop).map(
      (b) => [b.id, itemLabel({ kind: 'block', blockId: b.id })] as const,
    ),
    setTimeScale: (scale) => void world.debug.setTimeScale(scale),
    advanceClockTo: (hour, minute) => world.debug.advanceClockTo(hour, minute),
    timeScales: balance.clock.debugTimeScales,
    addSeeds: (n) => world.debug.addSeeds(n),
    addCrops: (n) => world.debug.addCrops(n),
    addGratitude: (n) => world.debug.addGratitude(n),
  });
  if (params.get('debug') === '1') debugPanel.toggle();
  const measureSeconds = Number(params.get('measure') ?? 0);
  const perf =
    sceneName === 'perf' || sceneName === 'mvp-perf'
      ? createPerfDriver(
          world,
          renderer,
          Number(params.get('seconds') ?? 60),
          params.get('jumps') !== '0',
        )
      : null;
  const measured: number[] = [];
  let maxDraws = 0;
  (window as unknown as { __gtb: unknown }).__gtb = { world, renderer, probe, dayNight, perf };
  const startedAt = performance.now();
  let last = startedAt;
  let lastReport = startedAt;

  /** 한 프레임: 게임 규칙 → 렌더 (ARCHITECTURE 3). dt 는 0.1 초로 클램프한다. */
  function frame(now: number): void {
    const frameMs = now - last;
    const dt = Math.min(frameMs / 1000, balance.player.maxFrameSeconds);
    last = now;
    fpsWindow.push(frameMs);
    if (fpsWindow.length > 60) fpsWindow.shift();
    if (probe.settledAtMs !== null) {
      probe.frames += 1;
      probe.maxFrameMs = Math.max(probe.maxFrameMs, frameMs);
      if (frameMs > 33.4) {
        probe.over33ms += 1;
        probe.spikes.push([Math.round(now - startedAt - probe.settledAtMs), Math.round(frameMs)]);
      }
      if (editDriver) probe.edits += editDriver(dt);
    }
    if (!playView?.paused()) world.update(dt);
    // 메뉴(일시정지) 중에는 다른 시스템이 돌지 않아 상태가 이미 커밋되어 있다. 엔딩을 Esc 로 닫아 메뉴로 간 직후처럼
    // 일시정지 중에 들어온 저장 요청은 여기서 처리한다 (TASK-052)
    else world.saves.update();
    const t = (now - startedAt) / 1000;
    if (playView) playView.update();
    else {
      renderer.setOrbitView({
        target: view.target,
        distance: view.distance,
        yaw: view.yaw + (orbit ? t * 0.05 : 0),
        pitch: view.pitch,
      });
    }
    const diagnosing = world.roomSystem.diagnosisActive;
    roomOverlay.update(
      frameMs / 1000,
      diagnosing || world.debug.showRoomBounds,
      diagnosing ? world.rooms.getDiagnosis().result : null,
    );
    roomLabels.update(frameMs / 1000, diagnosing);
    gratitudePopups.update(frameMs / 1000);
    barkBubbles.update(frameMs / 1000);
    gratitudeHud.update(frameMs / 1000);
    npcViews.update(frameMs / 1000);
    monsterViews.update(frameMs / 1000);
    props.update(frameMs / 1000);
    crops.update(frameMs / 1000);
    furniture.update();
    grass.update(renderer.camera.position);
    bellRing.update(frameMs / 1000);
    // 발소리: 땅 위에서 걸은 수평 거리와 발밑 블록
    const pl = world.player;
    let walked = 0;
    let ground: number | null = null;
    if (pl) {
      const p = pl.body.pos;
      if (lastFeet && pl.body.onGround) walked = Math.hypot(p.x - lastFeet.x, p.z - lastFeet.z);
      lastFeet = { x: p.x, z: p.z };
      ground = world.voxels.getBlock(Math.floor(p.x), Math.floor(p.y - 0.05), Math.floor(p.z));
    }
    sounds.update(frameMs / 1000, walked < 1 ? walked : 0, ground);
    damageMarks.update(frameMs / 1000);
    dishes.update();
    dayNight.update(frameMs / 1000);
    navOverlay.update(
      frameMs / 1000,
      world.debug.showNavCells,
      world.player ? world.player.body.pos : view.target,
      [...world.registry.npcs.values()].map((n) => n.action.remainingPath ?? []),
    );
    clockHud.update();
    const renderStart = performance.now();
    renderer.render();
    const renderMs = performance.now() - renderStart;
    if (perf && probe.settledAtMs !== null) {
      const since = now - startedAt - probe.settledAtMs - MEASURE_WARMUP_MS;
      if (since >= 0) perf.frame(since, frameMs, renderMs);
    }
    debugPanel.update(now);
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

void start();
