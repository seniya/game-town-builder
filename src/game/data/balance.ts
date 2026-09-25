// 모든 밸런스 수치의 유일한 위치. MVP_SPEC 34 장이 정본이다.
// 값을 바꿀 때는 MVP_SPEC 의 해당 표·34 장과 완료 조건을 먼저 맞춘다.
export const balance = {
  world: {
    sizeX: 128,
    sizeY: 64,
    sizeZ: 128,
    chunkSize: 16,
    seaLevel: 24,
    bellPos: { x: 64, y: 0, z: 64 }, // y 는 생성 시 지표면으로 결정
    plazaRadius: 6,
  },

  player: {
    height: 1.8,
    width: 0.6,
    walkSpeed: 4.5,
    runSpeed: 7.0,
    jumpHeight: 1.25,
    gravity: -22,
    maxFallSpeed: -30,
    maxHealth: 20,
    reachDistance: 5.0,
    attackDamage: 1,
    attackIntervalSeconds: 0.5,
    attackRange: 2.5,
    cameraDistance: 5.0,
    /** 자동으로 오르는 턱 높이 (MVP_SPEC 9.4) */
    stepUpHeight: 1.0,
    /** 시선 피치 제한. 음수가 내려다보기 (MVP_SPEC 9.3) */
    pitchMinDeg: -80,
    pitchMaxDeg: 60,
    /** 발밑 중심에서 시선 원점까지의 높이, 카메라 기준 오른쪽 어깨점 거리 (MVP_SPEC 9.3) */
    eyeHeight: 1.6,
    shoulderOffset: 0.6,
    mouseRadiansPerPixel: 0.0025,
    /** 천장 걷어 내기: 수평 반경과 머리 위 탐색 높이 (MVP_SPEC 9.3) */
    ceilingCutRadius: 7,
    ceilingSearchHeight: 6,
    /** 한 프레임 dt 의 상한. 탭 복귀 스파이크로 벽을 통과하지 않게 한다 (ARCHITECTURE 3) */
    maxFrameSeconds: 0.1,
  },

  inventory: { hotbarSlots: 9, bagSlots: 27, stackSize: 64 },

  room: {
    minFloorArea: 4,
    maxFloorArea: 100,
    minWallHeight: 2,
    detectBudgetMs: 3,
  },

  clock: {
    secondsPerGameHour: 25,
    startDay: 1,
    startHour: 7,
    lunchStartHour: 12,
    lunchEndHour: 13,
    dinnerStartHour: 18,
    dinnerEndHour: 19,
    sleepStartHour: 20,
    wakeHour: 5,
    /** 역할 작업 시작 = morning 시작 (MVP_SPEC 19.5 / 20.1) */
    workStartHour: 7,
    /** 자유 행동 시작 (MVP_SPEC 19.5) */
    freeTimeStartHour: 19,
    /** 채석장 재생 경계 (MVP_SPEC 14.3) */
    quarryRespawnHour: 5,
    /** 디버그 시간 배속 (MVP_SPEC 20.2) */
    debugTimeScales: [1, 4, 16],
  },

  farm: {
    growthStages: 3,
    hoursPerStage: 4,
    /** 심기·수확 뒤 작업 자세를 보이는 실초 (MVP_SPEC 15.4, 렌더 표현) */
    workPoseSeconds: 0.8,
    seedReturnedPerHarvest: 1,
    tutorialPlotCount: 4,
    expandedPlotCount: 8,
  },

  cooking: {
    cropPerCook: 2,
    foodPerCook: 3,
    cookHours: 1,
  },

  meal: {
    mealsPerDay: 2,
    foodPerMeal: 1,
    /** 앉아서 먹는 게임분. 음식은 앉을 때 소비하고 이 시간은 먹는 모습이다 (MVP_SPEC 17.1) */
    eatGameMinutes: 20,
  },

  worldState: {
    foodTargetDays: 2,
    happinessWeights: { food: 0.4, housing: 0.3, safety: 0.3 },
  },

  gratitude: {
    onSleep: 5,
    onCook: 3,
    onEatInDiningRoom: 2,
    onFirstRoomOfType: 20,
    onGameEvent: 15,
  },

  village: {
    levels: [
      { level: 1, cost: 0, residentCap: 3, gate: {} },
      { level: 2, cost: 80, residentCap: 4, gate: { minRooms: 2, minHousingLevel: 50 } },
      {
        level: 3,
        cost: 200,
        residentCap: 5,
        gate: { minRooms: 4, minFoodLevel: 50, minHousingLevel: 100 },
      },
    ],
  },

  npc: {
    height: 1.8,
    width: 0.6,
    moveSpeed: 3.2,
    fleeSpeed: 5.0,
    maxHealth: 10,
    stunMinutes: 30,
    threatRadius: 12,
    /** 도피 중인 주민의 위협 해제 반경. 경계에서 도피·복귀가 되풀이되지 않게 한다 (MVP_SPEC 19.4.1) */
    threatReleaseRadius: 15,
    repathMinIntervalSeconds: 0.5,
  },

  carpenter: {
    repairPerDay: 8,
    repairMinutesPerBlock: 15,
    repairStartHour: 7,
    repairEndHour: 18,
  },

  monster: {
    maxHealth: 3,
    moveSpeed: 2.6,
    attackDamage: 2,
    attackIntervalSeconds: 1.5,
    breakSpeedMultiplier: 2.0,
    spawnHour: 21,
    despawnHour: 5,
    reachedRadius: 6,
    maxDestroyedCellsPerRaid: 16,
    /** 공격 수평 사거리·높이 차 한도 (MVP_SPEC 26.1, READY-05) */
    attackRange: 1.2,
    attackHeight: 1.5,
    /** 추적 반경 (주민 위협 반경과 같다) */
    chaseRadius: 12,
    /** 추적 탐색 한 번의 누적 확장 상한 (MVP_SPEC 24.3 의 5, ADR 040) */
    chaseMaxNodes: 800,
    /** 상한·NO_PATH 로 포기한 대상을 다시 쫓기까지 실초 (MVP_SPEC 24.3 의 5) */
    chaseRetrySeconds: 3,
  },

  combat: {
    /** 플레이어 공격의 넉백 거리(칸) */
    knockback: 0.3,
    /** 부활 뒤 공격받지 않는 실초 */
    respawnGuardSeconds: 3,
    /** 부활 칸은 몬스터와 이만큼 떨어져야 한다 */
    respawnSafeDistance: 3,
  },

  raids: [
    { afterVillageLevel: 2, monsterCount: 3 },
    { afterVillageLevel: 3, monsterCount: 5 },
  ],

  resource: {
    seedDropChanceFromLeaves: 0.25,
    stoneRespawnPerDay: 8,
    treeCount: 24,
  },

  storage: { initialSeed: 3, initialCrop: 0, initialFood: 0 },

  performance: {
    chunkUploadsPerFrame: 2,
    pathfindMaxNodes: 4000,
    maxPointLights: 16,
    /** 경로가 없던 (주민, 침대) 조합을 블록 변경 뒤 다시 시도하는 최소 간격(초). 편집마다 재탐색하지 않는다 (PERF-001) */
    sleepRetrySeconds: 1,
  },

  /** 주민의 한마디 (MVP_SPEC 19.7, TASK-BARK-001). 시간은 실초다 */
  bark: {
    /** 한 주민의 두 말 사이 최소 간격. 도피·맞음·말 걸기는 무시한다 */
    npcCooldownSeconds: 10,
    /** 플레이어가 이 반경 안에 들어오면 인사한다 */
    greetRadius: 4,
    /** 인사 거리 확인 주기 */
    greetCheckSeconds: 0.5,
    greetCooldownSeconds: 120,
    /** 같은 일(농사·조리·수리)을 다시 말하기까지 */
    workCooldownSeconds: 90,
    fleeCooldownSeconds: 30,
    hitCooldownSeconds: 5,
    pokeCooldownSeconds: 1,
    /** 습격 끝·마을 레벨·새 방에 반응하는 반경 */
    reactRadius: 16,
    /** 잠에서 깨어 기상 문장을 말하는 시간대 [시작, 끝) */
    wakeStartHour: 5,
    wakeEndHour: 9,
    /** 말 걸기에서 "잘 곳 없음" 힌트를 주는 시간대 시작(끝은 wakeStartHour) */
    noBedHintStartHour: 19,
  },
} as const;

export type Balance = typeof balance;
