// 캐릭터 자세 계산 (TASK-ANIM-001, ADR 041, ARCHITECTURE 12.3). three 를 쓰지 않는 순수 계산이다.
// 뷰는 매 프레임 게임 상태(Action·자세·속도·접지)에서 "목표 자세"를 만들고, 자세 종류(key)가 바뀌면
// 직전에 그린 자세에서 새 목표로 짧게 교차 보간한다. 게임 상태에는 애니메이션 상태를 두지 않는다.
import { balance } from '../game/data/balance';

/**
 * 관절 하나의 회전(라디안) 또는 위치. 회전은 three 의 XYZ 오일러 순서로 입힌다.
 * 팔다리의 z 회전은 왼쪽(−x)이 음수, 오른쪽(+x)이 양수일 때 몸 바깥으로 벌어진다.
 */
export interface Joint {
  x: number;
  y: number;
  z: number;
}

/**
 * 사람형 모형 하나의 자세. 관절은 모형 기준 회전이고, figurePos 는 몸 전체의 모형 기준 이동,
 * rootOffset 은 게임 위치(body.pos)에서 모형 뿌리까지의 월드 기준 이동이다(의자·침대 위로 옮길 때).
 * eyes 는 눈 높이 비율(1 = 뜸, 작을수록 감음)이다.
 */
export interface CharacterPose {
  legL: Joint;
  legR: Joint;
  armL: Joint;
  armR: Joint;
  head: Joint;
  figureRot: Joint;
  figurePos: Joint;
  rootOffset: Joint;
  eyes: number;
}

/** 관절 이름(보간·비교에 쓴다). */
const JOINTS = [
  'legL',
  'legR',
  'armL',
  'armR',
  'head',
  'figureRot',
  'figurePos',
  'rootOffset',
] as const;

/** 선 자세(모든 관절 0, 눈 뜸). */
export function restPose(): CharacterPose {
  const j = (): Joint => ({ x: 0, y: 0, z: 0 });
  return {
    legL: j(),
    legR: j(),
    armL: j(),
    armR: j(),
    head: j(),
    figureRot: j(),
    figurePos: j(),
    rootOffset: j(),
    eyes: 1,
  };
}

/** 자세를 복사한다. */
export function copyPose(p: CharacterPose): CharacterPose {
  const out = restPose();
  for (const k of JOINTS) Object.assign(out[k], p[k]);
  out.eyes = p.eyes;
  return out;
}

/** a → b 를 w(0~1) 만큼 섞은 자세. */
export function lerpPose(a: CharacterPose, b: CharacterPose, w: number): CharacterPose {
  const out = restPose();
  for (const k of JOINTS) {
    out[k].x = a[k].x + (b[k].x - a[k].x) * w;
    out[k].y = a[k].y + (b[k].y - a[k].y) * w;
    out[k].z = a[k].z + (b[k].z - a[k].z) * w;
  }
  out.eyes = a.eyes + (b.eyes - a.eyes) * w;
  return out;
}

/** 두 자세의 관절 차이 중 가장 큰 값(시험·연속성 검사용). 깜빡임은 원래 순간적이므로 eyes 를 뺄 수 있다. */
export function poseDistance(a: CharacterPose, b: CharacterPose, includeEyes = true): number {
  let d = includeEyes ? Math.abs(a.eyes - b.eyes) : 0;
  for (const k of JOINTS) {
    d = Math.max(
      d,
      Math.abs(a[k].x - b[k].x),
      Math.abs(a[k].y - b[k].y),
      Math.abs(a[k].z - b[k].z),
    );
  }
  return d;
}

/** 0~1 을 부드럽게. */
function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** 목표 자세와 그 종류. 종류가 바뀌면 교차 보간한다. seconds 는 보간 길이다. */
export interface PoseTarget {
  readonly key: string;
  readonly pose: CharacterPose;
  readonly seconds?: number;
}

/** 기본 전환 시간(실초). */
const BLEND_SECONDS = 0.28;

/**
 * 자세 종류가 바뀌면 직전에 그린 자세를 붙잡아 두고 새 목표 쪽으로 교차 보간한다.
 * 같은 종류 안의 움직임(걸음 흔들기 등)은 목표를 그대로 따른다.
 */
export class PoseBlender {
  private key: string | null = null;
  private from: CharacterPose | null = null;
  private elapsed = 0;
  private seconds = BLEND_SECONDS;
  private last: CharacterPose = restPose();

  /** 지금 보간 중인 비율(1 이면 목표 그대로). */
  get weight(): number {
    return this.from ? smooth(this.elapsed / this.seconds) : 1;
  }

  /** 이번 프레임에 그릴 자세. snap 이면 보간 없이 목표로 바로 간다(순간 이동·첫 프레임). */
  apply(target: PoseTarget, dt: number, snap = false): CharacterPose {
    if (snap || this.key === null) {
      this.key = target.key;
      this.from = null;
    } else if (target.key !== this.key) {
      this.key = target.key;
      this.from = copyPose(this.last);
      this.elapsed = 0;
      this.seconds = target.seconds ?? BLEND_SECONDS;
    } else {
      this.elapsed += dt;
    }
    if (this.from && this.elapsed >= this.seconds) this.from = null;
    this.last = this.from ? lerpPose(this.from, target.pose, this.weight) : copyPose(target.pose);
    return this.last;
  }
}

/** 걷기·달리기·서기 입력. */
export interface LocomotionInput {
  /** 수평 속도(칸/초, 렌더에서 부드럽게 한 값) */
  readonly speed: number;
  /** 걸음 위상(라디안). 속도에 비례해 뷰가 누적한다 */
  readonly phase: number;
  /** 뷰 시간(실초). 숨·둘러보기 박자 */
  readonly time: number;
  /** 걷기 속도와 달리기 속도. 이 사이에서 달리기 비율이 0 → 1 이 된다 */
  readonly walkSpeed: number;
  readonly runSpeed: number;
}

/** 이 속도 아래면 멈춘 것으로 본다(걸음 위상을 멈춘다). */
export const MOVING_SPEED = 0.05;

/** 달리기 비율(0 = 걷기, 1 = 달리기). */
export function runAmount(speed: number, walkSpeed: number, runSpeed: number): number {
  return smooth((speed - walkSpeed) / Math.max(0.1, runSpeed - walkSpeed));
}

/** 걸음 비중: 이 속도 구간에서 서기 → 걷기로 부드럽게 넘어간다. */
const GAIT_START = 0.15;
const GAIT_FULL = 1.2;

/**
 * 서기·걷기·달리기. 걸으면 팔다리를 흔들고 살짝 튀며, 달리면 몸을 앞으로 숙이고 크게 흔든다.
 * 멈춰 있으면 숨을 쉬고 체중을 옮기며 가끔 고개를 돌려 둘러본다. 속도에 따라 연속으로 섞여 멈추거나 출발할 때 튀지 않는다.
 */
export function locomotionPose(i: LocomotionInput): CharacterPose {
  const idle = restPose();
  const breathe = Math.sin(i.time * 2.1);
  idle.figurePos.y = breathe * 0.008;
  idle.figureRot.z = Math.sin(i.time * 0.31) * 0.025;
  idle.armL.x = breathe * 0.03;
  idle.armR.x = -breathe * 0.03;
  idle.armL.z = -0.04;
  idle.armR.z = 0.04;
  idle.head.y = Math.sin(i.time * 0.45) * Math.max(0, Math.sin(i.time * 0.17)) * 0.5;
  idle.head.x = Math.sin(i.time * 0.23) * 0.05;
  const gait = smooth((i.speed - GAIT_START) / (GAIT_FULL - GAIT_START));
  if (gait <= 0) return idle;
  const p = restPose();
  const run = runAmount(i.speed, i.walkSpeed, i.runSpeed);
  const s = Math.sin(i.phase);
  const amp = 0.6 + run * 0.35;
  p.legL.x = s * amp;
  p.legR.x = -s * amp;
  // 달리면 팔을 굽혀 앞뒤로 크게 흔든다
  p.armL.x = -s * (0.7 + run * 0.4) - run * 0.35;
  p.armR.x = s * (0.7 + run * 0.4) - run * 0.35;
  p.armL.z = -0.05 - run * 0.12;
  p.armR.z = 0.05 + run * 0.12;
  p.figurePos.y = Math.abs(s) * (0.05 + run * 0.05);
  p.figureRot.x = -0.05 - run * 0.2;
  p.figureRot.y = s * (0.06 + run * 0.04);
  p.figureRot.z = Math.cos(i.phase) * 0.03 * (1 - run);
  p.head.x = Math.sin(i.phase * 2) * 0.03 + run * 0.12;
  return gait >= 1 ? p : lerpPose(idle, p, gait);
}

/** 눈 깜빡임: 3~5 초마다 0.12 초 감는다. seed 로 주민마다 박자가 다르다. */
export function blink(time: number, seed: number): number {
  const period = 3 + (seed % 5) * 0.4;
  const t = (time + seed * 0.77) % period;
  return t < 0.12 ? 0.15 : 1;
}

/** 주민 자세 입력. 모두 게임 상태(ActionView·NPC)에서 뷰가 읽은 값이다. */
export interface NpcPoseInput {
  readonly kind: string;
  readonly key: string;
  /** Action 또는 시설 사용 자세 */
  readonly pose?: 'lie' | 'sit' | 'work' | 'cook';
  /** 의자 위(usePosition)에 앉는가 */
  readonly onChair: boolean;
  /** 모형 뿌리를 옮길 월드 이동(의자·침대). 없으면 0 */
  readonly rootOffset: Joint;
  /** 바라볼 곳의 높이 차(lookAt.y − 발 높이)와 수평 거리. 없으면 null */
  readonly lookHeight: number | null;
  readonly lookDistance: number;
  readonly speed: number;
  readonly phase: number;
  readonly time: number;
  readonly seed: number;
}

/** 주민 목표 자세. 걷기·달리기·밭일·조리·식사·취침·수리·기절·대화가 서로 다르다. */
export function npcPose(i: NpcPoseInput): PoseTarget {
  const npc = balance.npc;
  const eyes = blink(i.time, i.seed);
  const withEyes = (key: string, pose: CharacterPose, seconds?: number): PoseTarget => {
    pose.rootOffset = { ...i.rootOffset };
    if (pose.eyes === 1) pose.eyes = eyes;
    return seconds === undefined ? { key, pose } : { key, pose, seconds };
  };
  if (i.key === 'stunned') return withEyes('stunned', stunnedPose(i.time), 0.35);
  if (i.kind === 'talk') return withEyes('talk', talkPose(i));
  if (i.pose === 'lie') return withEyes('lie', liePose(i.time), 0.7);
  if (i.pose === 'sit' && i.onChair)
    return withEyes('chair', chairPose(i.time, i.kind === 'eat'), 0.45);
  if (i.pose === 'sit') return withEyes('ground', groundSitPose(i.time, i.kind === 'eat'), 0.5);
  if (i.kind === 'repair') return withEyes('repair', repairPose(i));
  if (i.pose === 'work') return withEyes('work', workPose(i.time));
  if (i.pose === 'cook') return withEyes('cook', cookPose(i.time));
  const loco = locomotionPose({
    speed: i.speed,
    phase: i.phase,
    time: i.time,
    walkSpeed: npc.moveSpeed,
    runSpeed: npc.fleeSpeed,
  });
  return withEyes('locomotion', loco);
}

/** 밭일(심기·수확): 허리를 굽혀 두 팔로 땅을 고른다. */
function workPose(time: number): CharacterPose {
  const p = restPose();
  const dig = Math.sin(time * 9);
  p.legL.x = 0.25;
  p.legR.x = -0.15;
  p.armL = { x: -1.1 + dig * 0.35, y: 0, z: 0.1 };
  p.armR = { x: -1.1 + dig * 0.35, y: 0, z: -0.1 };
  p.figurePos.y = -0.04;
  p.figureRot.x = -0.42;
  p.head.x = -0.35;
  return p;
}

/**
 * 수리(목수): 곧게 서서 고칠 칸을 올려다보거나 내려다보고, 오른팔로 망치를 내리친다. 왼팔은 판자를 받친다.
 * 밭일(허리를 굽혀 땅을 고름)과 구별된다.
 */
function repairPose(i: NpcPoseInput): CharacterPose {
  const p = restPose();
  // 내리칠 때 빠르게, 들어 올릴 때 느리게
  const t = (i.time * 1.6) % 1;
  const strike = t < 0.75 ? smooth(t / 0.75) : 1 - smooth((t - 0.75) / 0.25);
  const aim =
    i.lookHeight === null ? 0 : Math.atan2(i.lookHeight - 1.3, Math.max(0.3, i.lookDistance));
  p.legL.x = 0.12;
  p.legR.x = -0.12;
  p.armR = { x: -1.4 - aim * 0.8 - strike * 1.0, y: 0, z: -0.1 };
  p.armL = { x: -1.0 - aim * 0.8, y: 0, z: 0.25 };
  p.figureRot.x = -0.05 + Math.min(0, aim) * 0.3;
  p.figureRot.y = -strike * 0.08;
  p.figurePos.y = -strike * 0.015;
  p.head.x = aim * 0.8;
  return p;
}

/** 조리: 곧게 서서 한 팔로 냄비를 젓고 다른 팔은 앞으로 받친다. */
function cookPose(time: number): CharacterPose {
  const p = restPose();
  const stir = time * 5;
  p.armL = { x: -0.9, y: 0, z: 0.15 };
  p.armR = { x: -1.2 + Math.sin(stir) * 0.18, y: 0, z: -0.1 + Math.cos(stir) * 0.2 };
  p.figurePos.y = Math.sin(time * 2.4) * 0.01;
  p.figureRot = { x: -0.08, y: Math.sin(stir) * 0.04, z: 0 };
  p.head.x = -0.3;
  return p;
}

/** 대화: 서서 한 팔로 손짓하고 가끔 고개를 끄덕인다. */
function talkPose(i: NpcPoseInput): CharacterPose {
  const p = locomotionPose({
    speed: 0,
    phase: 0,
    time: i.time,
    walkSpeed: 1,
    runSpeed: 2,
  });
  p.armR = { x: -0.6 + Math.sin(i.time * 3) * 0.25, y: 0, z: -0.15 };
  p.head = { x: Math.max(0, Math.sin(i.time * 2.2)) * 0.12 - 0.03, y: 0, z: 0 };
  return p;
}

/** 먹는 팔: 왼팔은 앞으로 받치고 오른팔은 가끔 입으로 가져간다. 먹지 않으면 무릎 위에 둔다. */
function eatingArms(p: CharacterPose, time: number, eating: boolean): void {
  if (!eating) {
    p.armL = { x: -0.5, y: 0, z: 0 };
    p.armR = { x: -0.5, y: 0, z: 0 };
    return;
  }
  const lift = Math.max(0, Math.sin(time * 2.2));
  p.armL = { x: -0.9, y: 0, z: 0.2 };
  p.armR = { x: -0.8 - lift * 1.3, y: 0, z: -0.25 * lift };
}

/** 의자에 앉기: 다리를 의자 앞으로 내리고 식탁을 본다. 먹는 중이면 숟가락질한다. */
function chairPose(time: number, eating: boolean): CharacterPose {
  const p = restPose();
  p.legL.x = 1.25;
  p.legR.x = 1.25;
  eatingArms(p, time, eating);
  p.figurePos = { x: 0, y: -0.36 + Math.sin(time * 1.6) * 0.006, z: 0.05 };
  p.head.x = eating ? -0.25 : 0;
  return p;
}

/** 광장 바닥에 앉기: 다리를 앞으로 뻗는다. 먹는 중이면 숟가락질한다. */
function groundSitPose(time: number, eating: boolean): CharacterPose {
  const p = restPose();
  p.legL.x = Math.PI / 2;
  p.legR.x = Math.PI / 2;
  p.legL.z = -0.06;
  p.legR.z = 0.06;
  eatingArms(p, time, eating);
  p.figurePos.y = -0.36 + Math.sin(time * 1.6) * 0.006;
  p.head.x = Math.sin(time * 0.5) * 0.08;
  return p;
}

/** 기절: 바닥에 털썩 주저앉아 고개를 떨구고 팔을 늘어뜨린 채 머리가 빙빙 돈다. 쉬기(앉기)와 구별된다. */
function stunnedPose(time: number): CharacterPose {
  const p = restPose();
  p.legL = { x: 1.35, y: 0, z: -0.35 };
  p.legR = { x: 1.35, y: 0, z: 0.35 };
  p.armL = { x: -0.15, y: 0, z: -0.45 };
  p.armR = { x: -0.15, y: 0, z: 0.45 };
  p.figurePos.y = -0.38;
  p.figureRot = { x: -0.32, y: 0, z: Math.sin(time * 2.6) * 0.06 };
  p.head = { x: -0.5, y: Math.sin(time * 2.6) * 0.2, z: Math.cos(time * 2.6) * 0.12 };
  p.eyes = 0.2;
  return p;
}

/** 눕기: 등을 대고 누워 숨을 쉰다. 뿌리 이동·방향은 뷰가 침대에서 계산해 rootOffset 으로 넘긴다. */
function liePose(time: number): CharacterPose {
  const p = restPose();
  p.figureRot.x = Math.PI / 2;
  p.figurePos = { x: 0, y: 0.17 + Math.sin(time * 1.2) * 0.006, z: -0.62 };
  p.armL.z = 0.12;
  p.armR.z = -0.12;
  p.head.x = -0.25;
  p.eyes = 0.15;
  return p;
}

/** 플레이어 자세 입력. */
export interface PlayerPoseInput {
  readonly speed: number;
  readonly phase: number;
  readonly time: number;
  readonly onGround: boolean;
  /** 수직 속도(칸/초). 양수면 오르는 중 */
  readonly verticalSpeed: number;
  /** 블록을 부수는 중인가(좌클릭 유지) */
  readonly breaking: boolean;
  /** 한 번 휘두르기(설치·공격) 경과 실초와 종류. 없으면 null */
  readonly swing: { readonly kind: 'place' | 'attack'; readonly elapsed: number } | null;
  /**
   * 팔 동작을 얼마나 덮을지(0~1). 뷰가 동작이 있으면 1, 없으면 0 쪽으로 빠르게 옮겨
   * 팔 동작이 시작·끝날 때 팔이 튀지 않게 한다
   */
  readonly actionWeight: number;
}

/** 한 번 휘두르기 길이(실초). */
export const SWING_SECONDS = { place: 0.25, attack: 0.32 } as const;

/**
 * 플레이어 목표 자세: 걷기·달리기·점프·낙하 위에 팔 동작(파괴 반복·설치·공격)을 겹친다.
 * 팔 동작은 오른팔(과 공격 때 몸통 비틀기)만 덮으므로 걸으면서 부술 수 있다.
 */
export function playerPose(i: PlayerPoseInput): PoseTarget {
  const pl = balance.player;
  let key: string;
  let p: CharacterPose;
  if (!i.onGround && i.verticalSpeed > 0.5) {
    key = 'jump';
    p = restPose();
    p.legL.x = -0.7;
    p.legR.x = 0.25;
    p.armL = { x: -2.0, y: 0, z: -0.25 };
    p.armR = { x: -2.0, y: 0, z: 0.25 };
    p.figureRot.x = -0.08;
  } else if (!i.onGround && i.verticalSpeed < -2) {
    key = 'fall';
    p = restPose();
    p.legL = { x: -0.25, y: 0, z: -0.12 };
    p.legR = { x: 0.2, y: 0, z: 0.12 };
    p.armL = { x: -0.4, y: 0, z: -0.9 };
    p.armR = { x: -0.4, y: 0, z: 0.9 };
    p.head.x = -0.2;
  } else {
    key = 'locomotion';
    p = locomotionPose({
      speed: i.speed,
      phase: i.phase,
      time: i.time,
      walkSpeed: pl.walkSpeed,
      runSpeed: pl.runSpeed,
    });
  }
  const w = Math.min(1, Math.max(0, i.actionWeight));
  let arm: Joint | null = null;
  let twist = 0;
  if (i.swing) {
    const t = Math.min(1, i.swing.elapsed / SWING_SECONDS[i.swing.kind]);
    // 빠르게 들어 올렸다가 내리친다
    const arc = Math.sin(t * Math.PI);
    if (i.swing.kind === 'attack') {
      arm = { x: -0.4 - arc * 2.0, y: 0, z: -0.15 - arc * 0.3 };
      twist = arc * 0.35;
    } else {
      arm = { x: -0.5 - arc * 1.1, y: 0, z: -0.1 };
    }
  } else if (i.breaking) {
    const hit = Math.abs(Math.sin(i.time * 9));
    arm = { x: -1.1 - hit * 0.9, y: 0, z: -0.12 };
    twist = -hit * 0.06;
  }
  if (arm && w > 0) {
    p.armR = {
      x: p.armR.x + (arm.x - p.armR.x) * w,
      y: p.armR.y + (arm.y - p.armR.y) * w,
      z: p.armR.z + (arm.z - p.armR.z) * w,
    };
    p.figureRot.y += (twist - p.figureRot.y) * w;
  }
  return { key, pose: p, seconds: key === 'locomotion' ? 0.18 : 0.12 };
}
