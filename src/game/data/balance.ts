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
  },
} as const;

export type Balance = typeof balance;
