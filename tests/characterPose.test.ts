import { describe, expect, it } from 'vitest';
import { balance } from '../src/game/data/balance';
import {
  armJointRotationX,
  npcPose,
  playerPose,
  PoseBlender,
  poseDistance,
  type NpcPoseInput,
  type PlayerPoseInput,
  type PoseTarget,
} from '../src/render/characterPose';

/** 주민 자세 입력 기본값. */
function npc(over: Partial<NpcPoseInput> = {}): NpcPoseInput {
  return {
    kind: 'idle',
    key: 'idle',
    onChair: false,
    rootOffset: { x: 0, y: 0, z: 0 },
    lookHeight: null,
    lookDistance: 0,
    speed: 0,
    phase: 0.9,
    time: 1.3,
    seed: 1,
    ...over,
  };
}

/** 플레이어 자세 입력 기본값. */
function player(over: Partial<PlayerPoseInput> = {}): PlayerPoseInput {
  return {
    speed: 0,
    phase: 0.9,
    time: 1.3,
    onGround: true,
    verticalSpeed: 0,
    breaking: false,
    swing: null,
    actionWeight: 0,
    ...over,
  };
}

/** 라벨 없이 구별되어야 하는 주민 동작 (TASK-ANIM-001 AC 3). */
const NPC_CASES: Record<string, NpcPoseInput> = {
  stand: npc(),
  walk: npc({ kind: 'move', speed: balance.npc.moveSpeed }),
  run: npc({ kind: 'flee', speed: balance.npc.fleeSpeed }),
  work: npc({ kind: 'plant', pose: 'work', lookHeight: 0.5, lookDistance: 1 }),
  cook: npc({ kind: 'cook', pose: 'cook', lookHeight: 1, lookDistance: 1 }),
  eatChair: npc({ kind: 'eat', pose: 'sit', onChair: true }),
  eatGround: npc({ kind: 'eat', pose: 'sit' }),
  sleep: npc({ kind: 'sleep', pose: 'lie' }),
  repair: npc({ kind: 'repair', pose: 'work', lookHeight: 1.5, lookDistance: 1 }),
  stunned: npc({ kind: 'idle', key: 'stunned', pose: 'sit' }),
  talk: npc({ kind: 'talk' }),
};

describe('캐릭터 동작 (TASK-ANIM-001, ADR 041)', () => {
  it('걷기·달리기·밭일·조리·식사·취침·수리·기절·대화가 서로 다른 자세다', () => {
    const names = Object.keys(NPC_CASES);
    const poses = names.map((n) => npcPose(NPC_CASES[n] as NpcPoseInput));
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        const a = poses[i] as PoseTarget;
        const b = poses[j] as PoseTarget;
        expect(poseDistance(a.pose, b.pose), `${names[i]} ↔ ${names[j]}`).toBeGreaterThan(0.15);
      }
    // 수리는 밭일과 같은 'work' 자세 값을 받지만 따로 그린다(허리를 굽히지 않고 망치를 든다)
    expect(npcPose(NPC_CASES.repair as NpcPoseInput).key).toBe('repair');
    expect(npcPose(NPC_CASES.stunned as NpcPoseInput).key).toBe('stunned');
  });

  it('달리면 걷기보다 몸을 앞으로 숙이고 팔다리를 크게 흔든다', () => {
    const walk = npcPose(npc({ kind: 'move', speed: balance.npc.moveSpeed, phase: Math.PI / 2 }));
    const run = npcPose(npc({ kind: 'flee', speed: balance.npc.fleeSpeed, phase: Math.PI / 2 }));
    expect(run.pose.figureRot.x).toBeLessThan(walk.pose.figureRot.x - 0.1);
    expect(Math.abs(run.pose.legL.x)).toBeGreaterThan(Math.abs(walk.pose.legL.x) + 0.2);
  });

  it('자세가 바뀌어도 관절과 뿌리 위치가 한 프레임에 튀지 않는다 (서기 → 걷기 → 앉기 → 눕기 → 기상 → 기절)', () => {
    const chair = { x: 0.2, y: 0.56, z: -0.4 };
    const bed = { x: 0.5, y: 0.6, z: 0.8 };
    const sequence: NpcPoseInput[] = [
      npc(),
      npc({ kind: 'move', speed: balance.npc.moveSpeed }),
      npc({ kind: 'eat', pose: 'sit', onChair: true, rootOffset: chair }),
      npc({ kind: 'sleep', pose: 'lie', rootOffset: bed }),
      npc({ kind: 'move', speed: balance.npc.moveSpeed }),
      npc({ kind: 'idle', key: 'stunned', pose: 'sit' }),
      npc(),
    ];
    const blender = new PoseBlender();
    const dt = 1 / 60;
    let prev = blender.apply(npcPose(sequence[0] as NpcPoseInput), dt, true);
    let time = 0;
    let worst = 0;
    let speed = 0;
    let phase = 0;
    for (const input of sequence) {
      for (let f = 0; f < 60; f++) {
        time += dt;
        // 뷰와 같이 속도를 부드럽게 따라가고 걸음 위상을 속도에 비례해 누적한다
        speed += (input.speed - speed) * Math.min(1, dt * 12);
        phase += dt * speed * 3.2;
        const cur = blender.apply(npcPose({ ...input, time, speed, phase }), dt);
        worst = Math.max(worst, poseDistance(prev, cur, false));
        prev = cur;
      }
    }
    // 60 FPS 한 프레임에 관절 0.2 rad·위치 0.2 칸을 넘게 움직이지 않는다(보간이 없으면 눕기에서 π/2 가 튄다)
    expect(worst).toBeLessThan(0.2);
  });

  it('보간이 없으면 튄다: snap 으로 바로 바꾸면 눕기에서 큰 차이가 난다(시험의 기준 확인)', () => {
    const a = npcPose(npc()).pose;
    const b = npcPose(npc({ kind: 'sleep', pose: 'lie' })).pose;
    expect(poseDistance(a, b)).toBeGreaterThan(1);
  });

  it('플레이어: 점프·낙하·파괴·설치·공격이 서 있기와 다르고, 팔 동작은 비중으로 들어오고 나간다', () => {
    const stand = playerPose(player()).pose;
    const jump = playerPose(player({ onGround: false, verticalSpeed: 5 }));
    const fall = playerPose(player({ onGround: false, verticalSpeed: -8 }));
    expect(jump.key).toBe('jump');
    expect(fall.key).toBe('fall');
    expect(poseDistance(stand, jump.pose)).toBeGreaterThan(0.5);
    expect(poseDistance(stand, fall.pose)).toBeGreaterThan(0.5);
    const mine = playerPose(player({ breaking: true, actionWeight: 1, time: 0.2 })).pose;
    expect(mine.armR.x).toBeLessThan(-1);
    const attack = playerPose(
      player({ swing: { kind: 'attack', elapsed: 0.16 }, actionWeight: 1 }),
    ).pose;
    expect(attack.armR.x).toBeLessThan(-2);
    expect(attack.figureRot.y).toBeGreaterThan(0.2);
    const place = playerPose(
      player({ swing: { kind: 'place', elapsed: 0.12 }, actionWeight: 1 }),
    ).pose;
    expect(place.armR.x).toBeLessThan(-1.2);
    // 비중 0 이면 팔 동작이 없다(시작 순간 팔이 튀지 않는다)
    const start = playerPose(player({ breaking: true, actionWeight: 0 })).pose;
    expect(poseDistance(stand, start)).toBeLessThan(1e-9);
  });

  it('플레이어가 뛰면 걷기보다 앞으로 숙인다', () => {
    const walk = playerPose(player({ speed: balance.player.walkSpeed, phase: 1 })).pose;
    const run = playerPose(player({ speed: balance.player.runSpeed, phase: 1 })).pose;
    expect(run.figureRot.x).toBeLessThan(walk.figureRot.x - 0.1);
  });
});

describe('팔 방향 (오너 확인 2026-09-25: 파괴·요리 팔이 반대로 보였다)', () => {
  /** 팔 x(자세 기준)를 모형에 입혔을 때 손끝의 z. 모형은 -z 를 보므로 음수가 앞이다. */
  // 아래로 늘어진 팔 (0, -1, 0) 을 x 축으로 r 만큼 돌리면 z = -sin(r)
  const handZ = (poseX: number) => -Math.sin(armJointRotationX(poseX));

  it('팔 x 가 음수면 손이 앞(-z)으로 간다', () => {
    expect(handZ(-1.2)).toBeLessThan(0);
    expect(handZ(0.5)).toBeGreaterThan(0);
  });

  it('블록을 부술 때 오른팔이 앞으로 들린다', () => {
    const t = playerPose(player({ breaking: true, actionWeight: 1 }));
    expect(handZ(t.pose.armR.x)).toBeLessThan(-0.5);
  });

  it('조리할 때 두 팔이 화덕(앞) 쪽이다', () => {
    const t = npcPose(npc({ kind: 'cook', key: 'cook', pose: 'cook' }));
    expect(handZ(t.pose.armL.x)).toBeLessThan(0);
    expect(handZ(t.pose.armR.x)).toBeLessThan(0);
  });

  it('걸을 때 팔은 같은 쪽 다리와 반대로 흔든다', () => {
    const t = playerPose(player({ speed: balance.player.walkSpeed, phase: Math.PI / 2 }));
    // 왼다리가 앞(+x 회전)이면 왼팔은 뒤(+z)
    expect(t.pose.legL.x).toBeGreaterThan(0);
    expect(handZ(t.pose.armL.x)).toBeGreaterThan(0);
    expect(handZ(t.pose.armR.x)).toBeLessThan(0);
  });
});

describe('밭일 자세 (HR-013: 허리를 굽힌다)', () => {
  it('몸을 크게 숙이고 다리는 거의 곧게 서며 발은 땅에 붙어 있다', () => {
    const p = npcPose(npc({ kind: 'farm', key: 'farm', pose: 'work' })).pose;
    expect(p.figureRot.x).toBeLessThan(-0.6);
    // 다리의 월드 기울기 = 몸 기울기 + 다리 회전 ≈ 0
    expect(Math.abs(p.figureRot.x + (p.legL.x + p.legR.x) / 2)).toBeLessThan(0.1);
    // 엉덩이(높이 0.42) 아래 발이 원래 자리(z≈0, y≈0) 근처에 있다
    const hipZ = p.figurePos.z + 0.42 * Math.sin(p.figureRot.x);
    const hipY = p.figurePos.y + 0.42 * Math.cos(p.figureRot.x);
    expect(Math.abs(hipZ)).toBeLessThan(0.05);
    expect(Math.abs(hipY - 0.42)).toBeLessThan(0.05);
  });
});
