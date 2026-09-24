// update 순서를 소유하는 유일한 객체 (ARCHITECTURE 4). 순서를 임의로 바꾸지 않는다 (4.1).
// 렌더는 여기서 호출하지 않는다. main.ts 가 world.update 뒤에 renderer.render 를 부른다.
import type { Action } from './actions/Action';
import { IdleAction } from './actions/IdleAction';
import type { Monster } from './entities/Monster';
import { createNPC, type NPC } from './entities/NPC';
import type { Player } from './entities/Player';
import { EntityRegistry } from './EntityRegistry';
import { EventBus } from './EventBus';
import { balance } from './data/balance';
import { BlockId } from './data/blocks';
import { ROOM_RECIPES } from './data/roomRecipes';
import { NavigationGraph } from './nav/NavigationGraph';
import { PathScheduler } from './nav/PathScheduler';
import { RoomRegistry } from './room/RoomRegistry';
import { createRoomReader } from './room/roomReader';
import { BlockEditSystem } from './systems/BlockEditSystem';
import { CookingSystem } from './systems/CookingSystem';
import { CraftingSystem } from './systems/CraftingSystem';
import { DebugSystem } from './systems/DebugSystem';
import { DialogueSystem } from './systems/DialogueSystem';
import { FarmSystem } from './systems/FarmSystem';
import { GAME_EVENTS } from './data/gameEvents';
import { GameEventSystem } from './systems/GameEventSystem';
import { GratitudeSystem } from './systems/GratitudeSystem';
import { GameClockSystem } from './systems/GameClockSystem';
import { InputSystem } from './systems/InputSystem';
import { InventorySystem } from './systems/InventorySystem';
import { MealSystem } from './systems/MealSystem';
import { MonsterSystem } from './systems/MonsterSystem';
import { ObjectiveSystem } from './systems/ObjectiveSystem';
import { NPCDecisionSystem, plazaSpots } from './systems/NPCDecisionSystem';
import { NPCSystem } from './systems/NPCSystem';
import { SleepSystem } from './systems/SleepSystem';
import { createPlayer, PlayerMovementSystem } from './systems/PlayerMovementSystem';
import { QuarryRespawnSystem } from './systems/QuarryRespawnSystem';
import { RaidSystem } from './systems/RaidSystem';
import { ResidentArrivalSystem } from './systems/ResidentArrivalSystem';
import { RoomSystem } from './systems/RoomSystem';
import { VillageLevelSystem } from './systems/VillageLevelSystem';
import { WorldStateSystem } from './systems/WorldStateSystem';
import type { AabbBody, BlockPos, GameEventDefinition, NPCRole, WorldStateData } from './types';
import { VillageStorage, type VillageStorageInit } from './VillageStorage';
import { VoxelWorld, type WorldSize } from './voxel/VoxelWorld';

/**
 * ARCHITECTURE 4.1 의 16 슬롯. 배열 순서가 곧 update 순서다.
 * 8 번(raid / arrival)과 16 번(objective / save)은 한 슬롯에 두 시스템을 순서대로 연결한다.
 */
export const UPDATE_SLOTS = [
  'clock',
  'input',
  'playerMovement',
  'blockEdit',
  'room',
  'nav',
  'farm',
  'raidArrival',
  'monster',
  'npcDecision',
  'npc',
  'combat',
  'gratitude',
  'worldState',
  'gameEvent',
  'objectiveSave',
] as const;

export type UpdateSlot = (typeof UPDATE_SLOTS)[number];

/**
 * 슬롯에 연결되는 시스템. dt 는 이번 프레임의 경과 초다.
 * 슬롯은 순서만 규정한다. 시스템은 내부 누적 시간으로 갱신 주기를 따로 가질 수 있다 (3.2).
 */
export interface SlotSystem {
  update(dt: number): void;
}

/** GameWorld 생성에 필요한 데이터. 후속 Task 에서 섬 데이터 등이 추가된다. */
export interface GameWorldInit {
  readonly storage: VillageStorageInit;
  /** 월드 크기. MVP 는 balance.world, 시험은 작은 fixture 크기를 쓴다 */
  readonly worldSize: WorldSize;
  /** 플레이어 시작 칸(발이 놓이는 칸, MVP_SPEC 7.5). 없으면 플레이어 없는 관찰용 월드다 */
  readonly playerSpawn?: BlockPos;
  /** 채석장 재생 후보 (MVP_SPEC 14.2). 없으면 재생하지 않는 시험 월드다 */
  readonly quarryCandidates?: readonly BlockPos[];
  /** 시작 gameMinutes. 기본 0 = Day 1 07:00 (MVP_SPEC 20) */
  readonly startGameMinutes?: number;
  /** 광장 중심(종 칸). 주민이 쉬고 모이는 칸의 기준이다. 없으면 광장이 없는 시험 월드다 */
  readonly plazaCenter?: BlockPos;
  /** 새 주민이 나타나는 섬 가장자리 칸 (MVP_SPEC 19.6). 없으면 광장 남쪽에서 찾는다 */
  readonly arrivalCell?: BlockPos;
  /** 몬스터 스폰 칸(어두운 외곽). 없으면 습격하지 않는 시험 월드다 (MVP_SPEC 24.1) */
  readonly monsterSpawns?: readonly BlockPos[];
  /** 진행 이벤트 정의. 기본은 MVP_SPEC 27.1 의 8 개. 빈 배열이면 진행 이벤트가 없는 시험 월드다 */
  readonly gameEvents?: readonly GameEventDefinition[];
}

/** 게임 상태의 루트. 순수 TypeScript 이며 three 를 모른다. */
export class GameWorld {
  readonly events = new EventBus();
  /** 엔티티 목록. population 은 registry.npcs.size 다 (ARCHITECTURE 27) */
  readonly registry = new EntityRegistry<NPC<Action>, Monster>();
  /** 게임 시계 (update 1 번). 모든 판단의 기준이다 */
  readonly clock: GameClockSystem;
  /** 채석장 하루 재생 (MVP_SPEC 14.3). update 4 번의 편집 뒤 */
  readonly quarry: QuarryRespawnSystem;
  readonly storage: VillageStorage;
  readonly voxels: VoxelWorld;
  /** 입력 수집 (update 2 번). DOM 어댑터가 원시 입력을 넣는다 */
  readonly input = new InputSystem();
  /** 플레이어 인벤토리 / 핫바. 핫바 선택은 입력 슬롯에서 InputSystem 뒤에 반영한다 */
  readonly inventory: InventorySystem;
  /** 제작. 해금은 VillageLevelSystem 의 현재 레벨로 읽는다 (TASK-037) */
  readonly crafting: CraftingSystem;
  /** F3 계측과 디버그 명령 (ARCHITECTURE 26) */
  readonly debug: DebugSystem;
  /** 플레이어. playerSpawn 이 없으면 null 이다 */
  readonly player: Player | null;
  /** 조준·파괴·설치. 플레이어가 없으면 null 이다 */
  readonly blockEdit: BlockEditSystem | null;
  /** 인식된 방과 재판정 큐 (ARCHITECTURE 10.3). 방의 유일한 소유자다 */
  readonly rooms: RoomRegistry;
  /** 방 재판정 슬롯과 진단 모드(Tab) */
  readonly roomSystem: RoomSystem;
  /** 통행 그래프 (ARCHITECTURE 11.1). 블록 변경을 받는 즉시 무효화한다 */
  readonly nav: NavigationGraph;
  /** 경로 요청 스케줄러 (update 6 번). 프레임당 확장 예산을 모든 요청이 나눠 쓴다 */
  readonly paths: PathScheduler;
  /** 농사: crop 성장 상태·밭 후보·예약 (update 7 번) */
  readonly farm: FarmSystem;
  /** 대화 표시·재생·완료 (TASK-040). 대화 중 주민은 판단 2 단계로 TalkAction 을 한다 */
  readonly dialogue: DialogueSystem;
  /** 진행 이벤트 (update 15 번) */
  readonly gameEvents: GameEventSystem;
  /** 현재 목표 (update 16 번) */
  readonly objectives: ObjectiveSystem;
  /** 감사 포인트의 유일한 소유자 (update 13 번) */
  readonly gratitude: GratitudeSystem;
  /** 조리: 화덕 목록·화덕/재료 예약·결과 확정 (update 10 번, 판단 전에 목록 갱신) */
  readonly cooking: CookingSystem;
  /** 식사 구간·식사 플래그·식당 의자 후보 (update 10 번, 판단 전) */
  readonly meal: MealSystem;
  /** 침대 배정의 유일한 소유자 (update 10 번, 판단 전) */
  readonly sleep: SleepSystem;
  /** NPC 판단 (update 10 번) */
  readonly npcDecision: NPCDecisionSystem;
  /** NPC Action 실행 (update 11 번) */
  readonly npcSystem: NPCSystem;
  /** 습격 예약·시작·종료와 이력 (update 8 번, 도착보다 먼저) */
  readonly raids: RaidSystem;
  /** 몬스터 판단·이동·파괴 (update 9 번) */
  readonly monsterSystem: MonsterSystem;
  /** 새 주민 도착 예약·스폰 (update 8 번) */
  readonly arrivals: ResidentArrivalSystem;
  /** 마을 레벨의 유일한 소유자. 종 패널이 evaluate / ring 을 부른다 */
  readonly village: VillageLevelSystem;
  /** 파생 지표 (update 14 번). 저장하지 않는다 */
  readonly worldStateSystem: WorldStateSystem;
  /** 광장 중심. 없으면 null */
  readonly plazaCenter: BlockPos | null;
  /** 슬롯별 마지막 update 소요(ms). profile 이 true 일 때만 잰다 (PERF-001) */
  readonly slotMs = new Map<UpdateSlot, number>();
  /** 슬롯 계측을 켠다. 기본은 끔(계측 비용을 게임에 얹지 않는다) */
  profile = false;
  private residentCounter = 0;
  private plazaCache: { revision: number; spots: readonly BlockPos[] } | null = null;

  private readonly slots = new Map<UpdateSlot, SlotSystem[]>(
    UPDATE_SLOTS.map((slot) => [slot, []]),
  );

  /** 초기 데이터를 주입해 상태 소유자들을 만든다. */
  constructor(init: GameWorldInit) {
    this.storage = new VillageStorage(this.events, init.storage);
    this.voxels = new VoxelWorld(init.worldSize, this.events);
    this.clock = new GameClockSystem(this.events, init.startGameMinutes ?? 0);
    this.attach('clock', this.clock);
    this.inventory = new InventorySystem(this.events, this.input);
    // 제작 해금은 VillageLevelSystem 의 현재 레벨로 판단한다 (TASK-037). village 는 아래에서 만들며 호출은 그 뒤다
    this.crafting = new CraftingSystem(this.inventory, () => this.village.level);
    this.attach('input', this.input);
    this.attach('input', this.inventory);
    this.player = init.playerSpawn ? createPlayer(init.playerSpawn) : null;
    const player = this.player;
    // 설치 칸 점유 검사 대상. NPC·몬스터 몸체는 해당 엔티티가 생기는 TASK-028 / 045 에서 더한다
    this.blockEdit = player
      ? new BlockEditSystem(this.voxels, player, this.inventory, this.input, this.events, {
          occupants: () => [...this.characterBodies()],
        })
      : null;
    const reader = createRoomReader(this.voxels);
    this.rooms = new RoomRegistry(reader, this.events, {
      limits: balance.room,
      recipes: ROOM_RECIPES,
      now: () => performance.now(),
      listDoors: () =>
        this.voxels.placements
          .all()
          .filter((o) => o.blockId === BlockId.door)
          .map((o) => o.anchor),
    });
    this.roomSystem = new RoomSystem(
      this.rooms,
      this.events,
      reader,
      balance.room.detectBudgetMs,
      player ? { input: this.input, player } : null,
    );
    this.debug = new DebugSystem(
      this.player,
      this.blockEdit,
      this.rooms,
      this.roomSystem,
      this.clock,
    );
    if (this.player && this.blockEdit) {
      this.attach('playerMovement', new PlayerMovementSystem(this.voxels, this.player, this.input));
      this.attach('blockEdit', this.blockEdit);
    }
    this.quarry = new QuarryRespawnSystem({
      voxels: this.voxels,
      clock: this.clock,
      candidates: init.quarryCandidates ?? [],
      bodies: () => this.characterBodies(),
    });
    this.attach('blockEdit', this.quarry);
    this.attach('room', this.roomSystem);
    this.nav = new NavigationGraph(this.voxels);
    this.events.on('BLOCK_CHANGED', (c) => this.nav.invalidate(c.pos));
    this.paths = new PathScheduler(this.nav, balance.performance.pathfindMaxNodes);
    this.attach('nav', this.paths);
    this.debug.navSources = { nav: this.nav, paths: this.paths };
    this.plazaCenter = init.plazaCenter ?? null;
    this.farm = new FarmSystem({
      voxels: this.voxels,
      clock: this.clock,
      storage: this.storage,
      nav: this.nav,
      events: this.events,
    });
    this.attach('farm', this.farm);
    this.debug.farmSources = { farm: () => this.farm.stats, storage: this.storage };
    const npcs = (): Iterable<NPC<Action>> => this.registry.npcs.values();
    this.dialogue = new DialogueSystem(this.events);
    this.objectives = new ObjectiveSystem(this.events, {
      farmland: () => this.farm.stats.farmland,
    });
    this.gratitude = new GratitudeSystem({
      events: this.events,
      clock: this.clock,
      room: (id) => this.rooms.getById(id),
    });
    const gain = this.gratitude.gain.bind(this.gratitude);
    this.cooking = new CookingSystem({
      rooms: () => this.rooms.getAll(),
      storage: this.storage,
      events: this.events,
      blockAt: (p) => this.voxels.getBlock(p.x, p.y, p.z),
      facilityTaken: (o, n) => this.npcSystem.facilityTaken(o, n),
      gratitude: gain,
    });
    this.debug.cookingSources = { cooking: () => this.cooking.stats, storage: this.storage };
    this.meal = new MealSystem({
      clock: this.clock,
      npcs,
      npcById: (id) => this.registry.npcs.get(id),
      storage: this.storage,
      events: this.events,
      rooms: () => this.rooms.getAll(),
      blockAt: (p) => this.voxels.getBlock(p.x, p.y, p.z),
      facilityTaken: (o, n) => this.npcSystem.facilityTaken(o, n),
      gratitude: gain,
    });
    this.debug.mealSources = { meal: () => this.meal.stats };
    this.sleep = new SleepSystem({
      events: this.events,
      rooms: () => this.rooms.getAll(),
      placement: (id) => this.voxels.placements.get(id),
      npcs,
      nav: this.nav,
      paths: this.paths,
    });
    this.npcSystem = new NPCSystem({
      npcs,
      world: this.voxels,
      nav: this.nav,
      paths: this.paths,
      rooms: this.rooms,
      clock: this.clock,
      events: this.events,
      services: {
        gratitude: { gain },
        sleep: { isAssigned: (n, b) => this.sleep.isAssigned(n, b) },
        farm: { plant: (t) => this.farm.plant(t), harvest: (t) => this.farm.harvest(t) },
        cooking: {
          begin: (n, s) => this.cooking.begin(n, s),
          isCooking: (n, s) => this.cooking.isCooking(n, s),
          complete: (n, s, at) => this.cooking.complete(n, s, at),
        },
        meal: {
          eat: (n, s, at) => this.meal.eat(n, s, at),
          isSeatUsable: (s) => this.meal.isSeatUsable(s),
          active: () => this.meal.active,
        },
      },
      onBedUnreachable: (n, b) => this.sleep.reportUnreachable(n, b),
      farmClaims: {
        claim: (n, t) => this.farm.claim(n, t),
        release: (n, t) => this.farm.release(n, t),
      },
      releaseIngredients: (n) => this.cooking.release(n),
    });
    this.npcDecision = new NPCDecisionSystem(
      {
        npcs,
        clock: this.clock,
        storage: () => this.storage.snapshot(),
        worldState: () => this.worldStateSystem.current,
        talkingTo: (id) =>
          this.dialogue.active?.npcId === id && this.player ? this.player.body.pos : null,
        assignedBed: (id) => this.sleep.assignedBed(id),
        plazaSpots: () => this.currentPlazaSpots(),
        assign: (id, plan) => this.npcSystem.assign(id, plan),
        farmCandidate: (id, cell) => this.farm.candidateFor(id, cell),
        cookCandidate: (id, cell) => this.cooking.candidateFor(id, cell),
        mealActive: () => this.meal.active,
        diningSeat: (id, cell) => this.meal.seatFor(id, cell),
      },
      [this.meal, this.sleep, this.cooking],
    );
    this.attach('npcDecision', this.npcDecision);
    this.attach('npc', this.npcSystem);
    this.attach('gratitude', this.gratitude);
    this.attach('objectiveSave', this.objectives);
    this.debug.gratitudeSource = () => this.gratitude.total;
    this.raids = new RaidSystem({
      events: this.events,
      clock: this.clock,
      villageLevel: () => this.village.level,
      monsters: this.registry.monsters,
      spawnCells: init.monsterSpawns ?? [],
    });
    this.worldStateSystem = new WorldStateSystem({
      events: this.events,
      population: () => this.registry.npcs.size,
      food: () => this.storage.get('food'),
      accessibleBeds: () =>
        this.rooms.getByType('Bedroom').reduce((n, r) => n + r.facilities.beds.length, 0),
      lastRaid: () => this.raids.lastResult,
    });
    this.attach('worldState', this.worldStateSystem);
    this.debug.worldStateSource = () => this.worldStateSystem.current;
    this.monsterSystem = new MonsterSystem({
      monsters: () => this.registry.monsters.values(),
      world: this.voxels,
      nav: this.nav,
      paths: this.paths,
      bell: this.plazaCenter,
      raid: this.raids,
    });
    this.attach('monster', this.monsterSystem);
    const arrivalCell = init.arrivalCell ?? null;
    this.arrivals = new ResidentArrivalSystem({
      events: this.events,
      clock: this.clock,
      arrivalCells: () => this.arrivalCells(arrivalCell),
      spawn: (id, cell) => void this.spawnResident('villager', cell, id),
    });
    // 8 번 슬롯: 습격 다음 도착 순서 (ARCHITECTURE 4.1)
    this.attach('raidArrival', this.raids);
    this.attach('raidArrival', this.arrivals);
    const bell = this.plazaCenter;
    this.gameEvents = new GameEventSystem({
      events: this.events,
      definitions: init.gameEvents ?? GAME_EVENTS,
      context: () => ({
        clock: this.clock,
        storage: this.storage.snapshot(),
        worldState: this.worldStateSystem.current,
        rooms: this.rooms.getAll(),
        gratitude: this.gratitude.total,
        bellWorldCenter: bell
          ? { x: bell.x + 0.5, y: bell.y + 1.6, z: bell.z + 0.5 }
          : { x: 0, y: 0, z: 0 },
        villageLevel: this.village.level,
        raidResults: this.raids.results,
        dialogueCompleted: this.dialogue.completedIds(),
      }),
      ports: {
        setObjective: (o) => void this.objectives.apply(o),
        markDialogueAvailable: (_npcId, id) => void this.dialogue.markAvailable(id),
        gainGratitude: (s, n, at) => void this.gratitude.gain(s, n, at),
        playCutscene: (id) => this.events.emit('CUTSCENE_REQUESTED', { id }),
      },
    });
    this.attach('gameEvent', this.gameEvents);
    this.village = new VillageLevelSystem({
      events: this.events,
      gratitude: this.gratitude,
      rooms: () => this.rooms.getAll(),
      population: () => this.registry.npcs.size,
      food: () => this.storage.get('food'),
    });
    this.debug.npcSources = { npcs, sleep: this.sleep };
  }

  /** 마지막으로 계산한 파생 지표 (ARCHITECTURE 3 의 worldState). 읽기 전용이다. */
  get worldState(): WorldStateData {
    return this.worldStateSystem.current;
  }

  /** 플레이어·NPC·몬스터의 현재 충돌 몸체. 설치·재생 칸 점유 검사에 쓴다. */
  *characterBodies(): Generator<AabbBody> {
    if (this.player) yield this.player.body;
    for (const npc of this.registry.npcs.values()) yield npc.body;
  }

  /**
   * 주민 한 명을 칸에 세운다. 주민 수를 제한하지 않는다(콘텐츠의 정원은 VillageLevelSystem 이 정한다).
   * 새 주민에게는 다음 판단에서 침대를 찾는다 (MVP_SPEC 18.1).
   */
  spawnResident(role: NPCRole, cell: BlockPos, id?: string): NPC<Action> {
    this.residentCounter += 1;
    const npc = createNPC(id ?? `${role}-${this.residentCounter}`, role, cell, new IdleAction());
    this.registry.npcs.add(npc);
    this.sleep.markDirty();
    return npc;
  }

  /**
   * 도착 칸과 그 옆 칸(같은 아침 두 번째 주민). 지정이 없으면 광장 중심 남쪽 8 칸 부근의 설 수 있는 칸, 그것도 없으면 광장 칸 (ADR 034).
   */
  private arrivalCells(given: BlockPos | null): BlockPos[] {
    const base = given ?? this.defaultArrival();
    if (!base) return [];
    const out = [base];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
    ] as const) {
      const c = { x: base.x + dx, y: base.y, z: base.z + dz };
      if (this.nav.isStandable(c, 'npc')) out.push(c);
    }
    return out;
  }

  /** 광장 남쪽 8 칸 부근의 설 수 있는 칸. 없으면 첫 광장 칸. */
  private defaultArrival(): BlockPos | null {
    const c = this.plazaCenter;
    if (!c) return null;
    for (const dy of [0, 1, -1, 2, -2]) {
      const p = { x: c.x, y: c.y + dy, z: c.z + 8 };
      if (this.nav.isStandable(p, 'npc')) return p;
    }
    return this.currentPlazaSpots()[0] ?? null;
  }

  /** 광장 칸 목록. 통행이 바뀌었을 때만 다시 계산한다. */
  private currentPlazaSpots(): readonly BlockPos[] {
    if (!this.plazaCenter) return [];
    const rev = this.nav.revision;
    if (!this.plazaCache || this.plazaCache.revision !== rev) {
      this.plazaCache = { revision: rev, spots: plazaSpots(this.nav, this.plazaCenter) };
    }
    return this.plazaCache.spots;
  }

  /** 시스템을 슬롯에 연결한다. 같은 슬롯 안에서는 연결한 순서대로 실행한다. */
  attach(slot: UpdateSlot, system: SlotSystem): void {
    this.slotList(slot).push(system);
  }

  /** 한 프레임을 16 슬롯 순서대로 진행한다. 비어 있는 슬롯은 건너뛴다. */
  update(dt: number): void {
    for (const slot of UPDATE_SLOTS) {
      const t0 = this.profile ? performance.now() : 0;
      for (const system of this.slotList(slot)) system.update(dt);
      if (this.profile) this.slotMs.set(slot, performance.now() - t0);
    }
  }

  /** 슬롯의 시스템 목록. 생성자에서 모든 슬롯을 만들었으므로 항상 존재한다. */
  private slotList(slot: UpdateSlot): SlotSystem[] {
    const list = this.slots.get(slot);
    if (!list) throw new Error(`알 수 없는 update 슬롯: ${slot}`);
    return list;
  }
}
