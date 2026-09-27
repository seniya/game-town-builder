// 주민 3D 캐릭터: 모델 복제·동작 믹서·모자·손 도구·등짐·우산·낚싯줄. 시뮬레이션 상태를 동작 이름으로 옮긴다.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { JOBS } from '../data/people';
import { convById } from '../sim/social';
import type { Villager, World } from '../sim/types';
import { LOD, PRODUCE } from '../data/balance';
import { EXPRESS, faceTarget, type FaceVals, type Mood } from '../data/face';
import { happinessOf } from '../sim/stats';
import {
  LOOK,
  REST,
  STRIDE,
  smooth,
  lookYaw,
  nodPitch,
  strikeBetween,
  strikePhase,
  strikePose,
  strideTs,
  type StrikeKind,
} from '../data/motion';
import { CHAR_NAMES, model, place, type ModelName } from './assets';
import { faceMeshOf, prepareFace, setFace } from './face';
import { matLine, shareShadowDepth } from './materials';
import type { Overlay } from './overlay';
import {
  makeBagPack,
  makeFishPack,
  makeFlourPack,
  makeHat,
  makeLumberPack,
  makeWheatPack,
  makeTool,
  makeUmbrella,
  mesh,
  type ToolKind,
} from './props';

/** 주민 키(타일 단위). */
export const CHAR_H = 0.95;
/** 벤치 좌판 높이(타일 단위, Kenney stall-bench 를 0.95 로 맞췄을 때). */
const BENCH_SEAT_H = 0.2;

export interface CharView {
  v: Villager;
  root: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  cur: THREE.AnimationAction | null;
  hand: THREE.Group;
  back: THREE.Group;
  tool: THREE.Group | null;
  toolKind: ToolKind | null;
  packKey: string;
  pack: THREE.Group | null;
  umbrella: THREE.Group;
  line: THREE.Line;
  bobber: THREE.Mesh;
  yaw: number;
  spin: number;
  wt: number;
  catchT: number | null;
  lastCatch: number | null;
  bubbleRef: Villager['bubble'];
  bubbleT0: number;
  cart: THREE.Object3D | null;
  /** LOD: 아직 믹서에 넘기지 않은 동작 시간(초). */
  animHold: number;
  /** LOD: 먼 주민 갱신 차례를 세는 수. */
  lodTick: number;
  /** LOD: 지금 그림자를 드리우는가. */
  shadow: boolean;
  /** 몸짓 층(SPEC 13)이 덧입히는 뼈와 그 쉬는 자세(클립이 안 움직이는 뼈를 되돌린다). */
  rig: Rig;
  /** 화면 속도(타일/초, 고르게)와 지난 프레임 위치. */
  spd: number;
  lastX: number;
  lastZ: number;
  /** 지난 프레임의 동작 시간(치는 순간 찾기). */
  lastT: number;
  /** 표정 모프를 가진 머리 메시(없으면 표정 없음)와 지금 표정 값(SPEC 14.2). */
  face: THREE.Mesh | null;
  fv: FaceVals;
  /** 낮잠 눕기 정도(0 서 있음 ~ 1 누움)와 누웠을 때 올릴 높이·당길 거리(타일, SPEC 14.4). */
  lie: number;
  lieLift: number;
  lieShift: number;
}

/** 몸짓 층의 뼈. 없는 뼈는 null(모형이 달라도 깨지지 않게). */
interface Rig {
  head: THREE.Object3D | null;
  torso: THREE.Object3D | null;
  armR: THREE.Object3D | null;
  armL: THREE.Object3D | null;
  rest: Map<THREE.Object3D, THREE.Quaternion>;
}

/** 주민 한 명의 3D 캐릭터를 만든다. */
export function makeChar(v: Villager, parent: THREE.Object3D): CharView {
  const src = model(`c:${CHAR_NAMES[v.look.model % CHAR_NAMES.length] ?? 'female-a'}` as ModelName);
  prepareFace(src.scene);
  const mdl = SkeletonUtils.clone(src.scene);
  const box = new THREE.Box3().setFromObject(src.scene);
  const k = CHAR_H / (box.max.y - box.min.y);
  const root = new THREE.Group();
  mdl.scale.setScalar(k);
  root.add(mdl);
  parent.add(root);
  const mixer = new THREE.AnimationMixer(mdl);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const clip of src.animations) actions.set(clip.name, mixer.clipAction(clip));
  const head = mdl.getObjectByName('head');
  const armR = mdl.getObjectByName('arm-right');
  const armL = mdl.getObjectByName('arm-left');
  const torso = mdl.getObjectByName('torso');
  const rig: Rig = {
    head: head ?? null,
    torso: torso ?? null,
    armR: armR ?? null,
    armL: armL ?? null,
    rest: new Map(),
  };
  for (const b of [head, torso, armR, armL]) if (b) rig.rest.set(b, b.quaternion.clone());
  const hat = makeHat(v.job);
  hat.position.set(0, 0.5, 0);
  (head ?? root).add(hat);
  const hand = new THREE.Group();
  hand.position.set(0, -0.32, 0.02);
  (armR ?? mdl).add(hand);
  const back = new THREE.Group();
  (torso ?? mdl).add(back);
  const umbrella = makeUmbrella(v.look.umb, CHAR_H);
  umbrella.visible = false;
  root.add(umbrella);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    matLine(0xffffff, 0.8),
  );
  line.visible = false;
  line.frustumCulled = false;
  parent.add(line);
  const bobber = mesh(new THREE.SphereGeometry(0.05, 10, 8), '#ff5a4f');
  bobber.visible = false;
  parent.add(bobber);
  shareShadowDepth(root);
  return {
    v,
    root,
    model: mdl,
    mixer,
    actions,
    cur: null,
    hand,
    back,
    tool: null,
    toolKind: null,
    packKey: '',
    pack: null,
    umbrella,
    line,
    bobber,
    yaw: 0,
    spin: 0,
    wt: 0,
    catchT: null,
    lastCatch: null,
    bubbleRef: null,
    bubbleT0: 0,
    cart: null,
    animHold: 0,
    lodTick: v.id,
    shadow: true,
    rig,
    spd: 0,
    lastX: v.x,
    lastZ: v.y,
    lastT: 0,
    face: faceMeshOf(mdl),
    fv: { blink: 0, happy: 0, open: 0, frown: 0 },
    lie: 0,
    // 누우면 모형의 z 가 높이가 된다: 가장 뒤(머리 뒤)가 땅에 닿게 올리고, 몸 가운데가 제자리에 오게 당긴다.
    lieLift: -box.min.z * k,
    lieShift: CHAR_H * 0.45,
  };
}

/** 동작 클립을 부드럽게 바꾼다. once 면 한 번 재생하고 마지막 자세에 멈춘다. */
function play(c: CharView, name: string, ts: number, once: boolean): void {
  const a = c.actions.get(name) ?? c.actions.get('idle');
  if (!a) return;
  a.timeScale = ts;
  if (c.cur === a) return;
  a.reset();
  a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  a.clampWhenFinished = once;
  a.play();
  if (c.cur) a.crossFadeFrom(c.cur, 0.22, false);
  c.cur = a;
}

/** 손에 든 도구를 바꾼다. */
function setTool(c: CharView, kind: ToolKind | null): void {
  if (c.toolKind === kind) return;
  if (c.tool) c.hand.remove(c.tool);
  c.tool = kind ? makeTool(kind) : null;
  c.toolKind = kind;
  if (c.tool) {
    if (!c.shadow) c.tool.traverse((o) => (o.castShadow = false));
    c.hand.add(c.tool);
  }
}

/** 등짐을 바꾼다(목재 개수·보따리). */
function setPack(c: CharView): void {
  const p = c.v.pack;
  const key = p ? `${p.kind}:${p.kind === 'bag' || p.kind === 'flour' ? 1 : Math.min(6, p.n)}` : '';
  if (key === c.packKey) return;
  c.packKey = key;
  if (c.pack) c.back.remove(c.pack);
  c.pack = null;
  if (!p || (p.kind !== 'bag' && p.n <= 0)) return;
  c.pack =
    p.kind === 'lumber'
      ? makeLumberPack(p.n)
      : p.kind === 'wheat'
        ? makeWheatPack(p.n)
        : p.kind === 'flour'
          ? makeFlourPack()
          : p.kind === 'fish'
            ? makeFishPack(p.n)
            : makeBagPack(c.v.look.umb);
  if (c.pack) {
    if (!c.shadow) c.pack.traverse((o) => (o.castShadow = false));
    c.back.add(c.pack);
  }
}

/** 그림에 쓰는 시간(초)과 연출 층. */
export interface AnimCtx {
  animT: number;
  dtA: number;
  overlay: Overlay;
  /** 먼 주민(LOD): 입자를 내지 않고 동작을 띄엄띄엄 갱신한다. */
  lite: boolean;
  /** 실제 프레임 시간(초)과 동작 시간 배율(dtA ÷ dt, 멈춤이면 0). */
  dt: number;
  rate: number;
}

/** 이번 프레임에 덧입힐 각도(SPEC 13.1). */
interface Layer {
  armR: number;
  armL: number;
  /** 팔을 몸 쪽으로 모으는 각도(앞축, SPEC 14.3). */
  armInR: number;
  armInL: number;
  torso: number;
  yaw: number;
  pitch: number;
}

const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);
/** 오른팔을 몸 쪽으로 모으는 앞축 회전의 부호(왼팔은 반대). */
const IN_SIGN = 1;
const tmpQ = new THREE.Quaternion();

/** 믹서 전에: 몸짓 층 뼈를 쉬는 자세로 되돌린다(클립이 움직이지 않는 뼈에 각도가 쌓이지 않게). */
function resetRig(r: Rig): void {
  for (const [b, q] of r.rest) b.quaternion.copy(q);
}

/** 믹서 뒤에: 부모 축 기준으로 각도를 덧입힌다. */
function applyLayer(r: Rig, L: Layer): void {
  const turn = (b: THREE.Object3D | null, axis: THREE.Vector3, a: number): void => {
    if (b && a) b.quaternion.premultiply(tmpQ.setFromAxisAngle(axis, a));
  };
  turn(r.armR, AZ, IN_SIGN * L.armInR);
  turn(r.armL, AZ, -IN_SIGN * L.armInL);
  turn(r.armR, AX, L.armR);
  turn(r.armL, AX, L.armL);
  turn(r.torso, AX, L.torso);
  const yaw = Math.max(-LOOK.headYawLimit, Math.min(LOOK.headYawLimit, L.yaw));
  const pitch = Math.max(-LOOK.headPitchLimit, Math.min(LOOK.headPitchLimit, L.pitch));
  turn(r.head, AY, yaw);
  turn(r.head, AX, pitch);
}

/** 시뮬레이션 상태를 동작·도구·방향·연출로 옮긴다. */
export function animate(w: World, c: CharView, ctx: AnimCtx): void {
  const { animT, dtA, overlay, lite } = ctx;
  const v = c.v;
  const a = v.act;
  const T = animT + v.id * 0.73;
  const moving = v.x !== v.px || v.y !== v.py;
  // 화면 속도(SPEC 13.2): 뿌리 위치가 실제 1 초에 움직인 타일, 0.25 초로 고르게.
  if (ctx.dt > 0) {
    const px = c.root.position.x;
    const pz = c.root.position.z;
    const inst = Math.hypot(px - c.lastX, pz - c.lastZ) / ctx.dt;
    c.lastX = px;
    c.lastZ = pz;
    const k = Math.min(1, ctx.dt / STRIDE.smooth);
    c.spd += (Math.min(inst, 40) - c.spd) * k;
  }
  let strike: StrikeKind | null = null;
  let clip = 'idle';
  let ts = 1;
  let once = false;
  let tool: ToolKind | null = null;
  let face: { x: number; y: number } | null = null;
  let fish: { x: number; y: number } | null = null;
  let spin = false;
  const conv = convById(w, v.talk);
  if (conv) {
    const o = w.vs[conv.a === v.id ? conv.b : conv.a];
    if (o) face = { x: o.x - v.x, y: o.y - v.y };
    const idx = Math.floor((w.t - conv.start) / 3);
    const last = idx >= conv.lines.length - 1;
    if (conv.argue) {
      clip = 'emote-no';
      ts = 1.5;
    } else if (conv.kind === 'confess') {
      clip = last
        ? conv.success
          ? 'jump'
          : v.id === conv.a
            ? 'die'
            : 'emote-no'
        : v.id === conv.a
          ? 'holding-both'
          : 'idle';
      once = last && !conv.success && v.id === conv.a;
    } else if (conv.kind === 'welcome') {
      clip = conv.speaker === v.id ? (idx === 0 ? 'interact-right' : 'emote-yes') : 'emote-yes';
      ts = 0.9;
    } else if (conv.speaker === v.id) {
      clip = idx === 0 ? 'interact-right' : 'emote-yes';
      ts = 0.8;
    }
  } else if (moving) {
    const run = a && (a.type === 'flee' || a.target != null);
    clip = run ? 'sprint' : 'walk';
    ts = strideTs(!!run, c.spd, ctx.rate || 1);
  } else if (a && a.phase === 'do') {
    if (a.face) face = a.face;
    switch (a.type) {
      case 'work': {
        const pl = JOBS[v.job].place;
        if (pl === 'farm') {
          // 거두기·심기는 허리를 굽혀 줍는 동작, 가꾸기는 괭이질(SPEC 9.2).
          if (a.where === 'harvest' || a.where === 'plant') {
            clip = 'pick-up';
            ts = a.where === 'harvest' ? 0.9 : 0.7;
          } else {
            clip = 'idle';
            tool = 'hoe';
            strike = 'hoe';
          }
        } else if (pl === 'forest') {
          clip = 'idle';
          tool = 'axe';
          strike = 'axe';
        } else if (pl === 'workshop') {
          clip = 'idle';
          tool = 'hammer';
          strike = 'hammer';
        } else if (pl === 'shore') {
          clip = 'holding-right';
          tool = 'rod';
          fish = a.face;
        }
        break;
      }
      case 'build':
        clip = (T * 0.7) % 6 < 0.8 ? 'crouch' : 'idle';
        tool = 'hammer';
        strike = 'hammer';
        break;
      case 'fun':
        if (a.where === 'shore') {
          clip = 'holding-right';
          tool = 'rod';
          fish = a.face;
        } else if (a.where === 'bench' || a.where === 'plaza') {
          clip = 'sit';
          if (v.trait === '외톨이' || v.id % 3 === 0) tool = 'book';
          face = a.face ?? { x: 0, y: 1 };
          // 앉기 동작은 엉덩이를 바닥 높이에 둔다. 벤치 자리 가운데로 옮기고 좌판 높이만큼 올린다.
          const bench = a.decor != null ? w.decor.find((d) => d.id === a.decor) : undefined;
          if (bench) c.root.position.set(bench.x + 0.5, BENCH_SEAT_H, bench.y + 0.5);
        } else if (a.where === 'grass' || a.where === 'flower') {
          clip = (T * 0.3) % 4 < 2.4 ? 'pick-up' : 'idle';
          ts = 0.6;
        }
        break;
      case 'social':
        clip = (T * 0.45) % 5 < 0.9 ? 'emote-yes' : 'idle';
        break;
      case 'party':
      case 'raindance': {
        const st = a.type === 'raindance' ? 2 : v.id % 3;
        clip = st === 0 ? 'jump' : st === 1 ? 'emote-yes' : 'idle';
        ts = st === 1 ? 1.6 : 1;
        spin = st === 2;
        if (v.job === '주점 주인' || v.id % 4 === 0) tool = 'mug';
        break;
      }
      case 'nap':
        // 낮잠은 서 있는 동작 위에서 모형을 눕힌다(SPEC 14.4, `die` 클립을 쓰지 않는다).
        clip = 'idle';
        break;
      case 'hunt':
        clip = 'pick-up';
        ts = 0.9;
        break;
      default:
        clip = 'idle';
    }
  }
  if (!tool && v.carry && v.carry.until > w.t) tool = v.carry.item;
  if (v.job === '주점 주인' && !tool && a && a.type === 'social') tool = 'mug';
  play(c, clip, ts, once);
  setTool(c, tool);
  setPack(c);
  // 무거운 밀·밀가루는 손수레에 싣고 민다(SPEC 9.2).
  const cart =
    moving &&
    v.pack != null &&
    (v.pack.kind === 'wheat' || v.pack.kind === 'flour') &&
    v.pack.n >= PRODUCE.cartFrom;
  if (cart && !c.cart) {
    c.cart = place('wheelbarrow', 0, 0.62, 0.62, 0, c.root);
  }
  if (c.cart) c.cart.visible = cart;
  if (c.pack) c.pack.visible = !cart;
  // 방향: 걷는 방향, 대화 상대, 일하는 대상 쪽을 본다.
  const d = face ?? (moving ? { x: v.x - v.px, y: v.y - v.py } : v.dir);
  if (spin) c.spin += dtA * 6;
  else c.spin = 0;
  if (d.x || d.y) {
    const target = Math.atan2(d.x, d.y) + c.spin;
    let diff = target - c.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    c.yaw += diff * Math.min(1, dtA * 10 + (spin ? 1 : 0));
  }
  c.root.rotation.y = c.yaw;
  c.umbrella.visible =
    w.weather.rain && !(a && (a.type === 'raindance' || a.type === 'nap')) && v.inside == null;
  // 낚싯줄과 찌
  const tip0 = c.tool?.userData.tip as THREE.Vector3 | undefined;
  if (fish && c.tool && tip0) {
    const tip = tip0.clone();
    c.tool.localToWorld(tip);
    const bx = v.x + (fish.x || 0) * 1.1;
    const bz = v.y + (fish.y || 0) * 1.1;
    const catching = c.catchT != null && animT - c.catchT < 1.0;
    const by = 0.06 + (catching ? 0.35 : Math.sin(T * 2.4) * 0.02);
    const g = c.line.geometry.attributes.position as THREE.BufferAttribute;
    g.setXYZ(0, tip.x, tip.y, tip.z);
    g.setXYZ(1, bx, by, bz);
    g.needsUpdate = true;
    c.line.visible = true;
    c.bobber.visible = true;
    c.bobber.position.set(bx, by, bz);
    if (!lite && c.catchT != null && c.lastCatch !== c.catchT) {
      c.lastCatch = c.catchT;
      overlay.burst('splash', bx, 0.1, bz, 10);
    }
  } else {
    c.line.visible = false;
    c.bobber.visible = false;
  }
  // 연출 입자
  if (!lite && dtA > 0 && v.inside == null) {
    const hy = CHAR_H + 0.25;
    const R = Math.random;
    if (conv && conv.argue && R() < dtA * 4) overlay.burst('steam', v.x, hy, v.y, 2);
    const confessOk =
      conv &&
      conv.kind === 'confess' &&
      conv.success &&
      Math.floor((w.t - conv.start) / 3) >= conv.lines.length - 1;
    if (((conv && conv.kind === 'date') || confessOk) && R() < dtA * 1.6)
      overlay.burst('heart', v.x, hy, v.y, 1);
    if (
      a &&
      a.phase === 'do' &&
      (a.type === 'party' || a.type === 'raindance') &&
      (v.trait === '파티광' || a.type === 'raindance') &&
      R() < dtA * 1.3
    )
      overlay.burst('note', v.x, hy, v.y, 1);
    if (a && a.phase === 'do' && a.type === 'nap' && R() < dtA * 0.9) {
      // 누운 얼굴 위에서 오른다(머리는 몸 가운데에서 뒤쪽으로 반 키쯤)
      const hd = (CHAR_H * 0.75 - c.lieShift) * c.lie;
      overlay.burst(
        'z',
        v.x - Math.sin(c.yaw) * hd,
        0.5 - 0.2 * c.lie,
        v.y - Math.cos(c.yaw) * hd,
        1,
      );
    }
    if (moving && a && (a.type === 'flee' || a.target != null) && R() < dtA * 7)
      overlay.burst('dust', v.x, 0.05, v.y, 1);
    if (a && a.type === 'flee' && R() < dtA * 3) overlay.burst('sweat', v.x, hy, v.y, 1);
    if (a && a.phase === 'do' && !conv && (a.type === 'work' || a.type === 'build')) {
      const pl = a.type === 'build' ? 'build' : JOBS[v.job].place;
      const per =
        pl === 'farm'
          ? 1.6
          : pl === 'forest'
            ? 1.2
            : pl === 'workshop'
              ? 0.6
              : pl === 'build'
                ? 0.55
                : 0;
      // 치는 일은 치는 순간에(SPEC 13.3), 줍는 일(거두기·심기)은 전처럼 일정 간격으로 흙을 튀긴다.
      let fire = false;
      if (strike) fire = strikeBetween(strike, v.id, c.lastT, animT);
      else if (per) {
        c.wt += dtA;
        if (c.wt > per) {
          c.wt -= per;
          fire = true;
        }
      }
      if (fire) {
        {
          const fx = v.x + Math.sin(c.yaw) * 0.45;
          const fz = v.y + Math.cos(c.yaw) * 0.45;
          if (pl === 'build') {
            overlay.burst('sawdust', fx, 0.35, fz, 4);
            overlay.burst('spark', fx, 0.4, fz, 2);
          } else
            overlay.burst(
              pl === 'farm' ? 'soil' : pl === 'forest' ? 'chip' : 'spark',
              fx,
              0.15,
              fz,
              pl === 'workshop' ? 5 : 4,
            );
        }
      }
    }
    if (a && a.phase === 'do' && a.type === 'hunt' && R() < dtA * 1.2)
      overlay.burst('dirt', v.x + Math.sin(c.yaw) * 0.35, 0.1, v.y + Math.cos(c.yaw) * 0.35, 3);
  }
  c.lastT = animT;
  // 낮잠 눕기(SPEC 14.4): 모형 전체를 옆축으로 눕힌다. 먼 주민도 한다(변환 하나라 싸다).
  const napping = !!a && a.phase === 'do' && a.type === 'nap' && !moving;
  if (dtA > 0) c.lie = Math.min(1, Math.max(0, c.lie + (napping ? 1 : -1) * (dtA / REST.lieTime)));
  const e = smooth(c.lie);
  c.model.rotation.x = (-Math.PI / 2) * e;
  c.model.position.set(0, c.lieLift * e, c.lieShift * e);
  c.animHold += dtA;
  if (!lite || ++c.lodTick % LOD.farEvery === 0) {
    resetRig(c.rig);
    c.mixer.update(c.animHold);
    c.animHold = 0;
    // 몸짓 층(SPEC 13·14): 가까운 주민은 모두, 먼 주민은 일 박자의 팔·몸통만(SPEC 14.5).
    if (!lite) applyLayer(c.rig, layerFor(w, c, clip, strike, conv, moving, cart, animT));
    else if (strike) applyLayer(c.rig, strikeLayer(strike, v.id, animT));
  }
  // 표정(SPEC 14.2): 가까운 주민만.
  if (c.face && !lite && dtA > 0) {
    const f = faceTarget(moodOf(v, conv, w.t), !!conv && conv.speaker === v.id, v.id, animT);
    const k = Math.min(1, dtA / EXPRESS.follow);
    c.fv.blink = f.blink;
    c.fv.happy += (f.happy - c.fv.happy) * k;
    c.fv.open += (f.open - c.fv.open) * k;
    c.fv.frown += (f.frown - c.fv.frown) * k;
    setFace(c.face, c.fv);
  }
}

/** 표정의 바탕 상태를 시뮬레이션 상태에서 고른다(SPEC 14.2 표, 위에서부터 먼저 맞는 것). */
function moodOf(v: Villager, conv: ReturnType<typeof convById>, t: number): Mood {
  const a = v.act;
  if (a && a.phase === 'do' && a.type === 'nap') return 'sleep';
  const lastLine = !!conv && Math.floor((t - conv.start) / 3) >= conv.lines.length - 1;
  if (a && a.phase === 'do' && (a.type === 'party' || a.type === 'raindance')) return 'joy';
  if (conv && !conv.argue) {
    if (conv.kind === 'date' || conv.kind === 'welcome' || conv.kind === 'birthday') return 'joy';
    if (conv.kind === 'confess' && lastLine) return conv.success ? 'joy' : 'frown';
  }
  if ((conv && conv.argue) || (a && a.type === 'flee')) return 'frown';
  if (happinessOf(v) < EXPRESS.sulkBelow) return 'sulk';
  return 'calm';
}

/** 일 박자의 팔·몸통만 입힌 층(먼 주민, SPEC 14.5). */
function strikeLayer(kind: StrikeKind, id: number, t: number): Layer {
  const p = strikePose(kind, strikePhase(kind, id, t));
  return { armR: p.arm, armL: p.left, armInR: 0, armInL: 0, torso: p.torso, yaw: 0, pitch: 0 };
}

/** 이번 프레임에 덧입힐 각도를 정한다(SPEC 13.2~13.4). */
function layerFor(
  w: World,
  c: CharView,
  clip: string,
  strike: StrikeKind | null,
  conv: ReturnType<typeof convById>,
  moving: boolean,
  cart: boolean,
  t: number,
): Layer {
  const v = c.v;
  if (strike) return strikeLayer(strike, v.id, t);
  const L: Layer = { armR: 0, armL: 0, armInR: 0, armInL: 0, torso: 0, yaw: 0, pitch: 0 };
  if (moving) {
    const p = v.pack;
    if (cart) L.armR = L.armL = STRIDE.cartArms;
    else if (p && (p.kind === 'bag' || p.n >= 6)) L.torso = STRIDE.heavyLean;
    return L;
  }
  // 낮잠: 두 팔을 배 위로, 배로 느리게 숨 쉰다(SPEC 14.4). 고개는 돌리지 않는다.
  if (c.lie > 0) {
    const e = smooth(c.lie);
    L.armR = L.armL = REST.lieArms * e;
    L.armInR = L.armInL = REST.lieArmsIn * e;
    L.torso = REST.lieBreath * Math.sin((t / REST.lieBreathPeriod) * Math.PI * 2 + v.id) * e;
    return L;
  }
  // 서 있거나 앉아 있으면 숨 쉰다
  if (clip === 'idle' || clip === 'sit' || clip === 'holding-right')
    L.torso = LOOK.breath * Math.sin((t / LOOK.breathPeriod) * Math.PI * 2 + v.id);
  const reading = clip === 'sit' && c.toolKind === 'book';
  // 앉기(SPEC 14.3): 두 팔을 모아 손을 무릎에, 책은 앞에 들고 고개를 숙인다.
  if (clip === 'sit') {
    L.armInR = L.armInL = REST.sitArmsIn;
    L.armR = L.armL = reading ? REST.bookArms : REST.sitArmsFwd;
    if (reading) L.pitch = REST.bookHead;
  }
  if (conv) {
    if (conv.speaker === v.id) L.pitch = LOOK.talkBob * Math.sin(t * LOOK.talkHz * Math.PI * 2);
    else if (!conv.argue) L.pitch = nodPitch(v.id, t);
  } else if ((clip === 'idle' || clip === 'sit') && !reading) L.yaw = lookYaw(v.id, t);
  void w;
  return L;
}

/** 화면 밖 주민: 그리지 않고, 동작 시간만 모아 둔다(돌아오면 한 번에 넘긴다). */
export function hold(c: CharView, dtA: number): void {
  c.animHold = Math.min(LOD.maxHold, c.animHold + dtA);
}

/** 그림자를 켜고 끈다(먼 주민은 끈다). 바뀔 때만 모든 메시를 돈다. */
export function setShadow(c: CharView, on: boolean): void {
  if (c.shadow === on) return;
  c.shadow = on;
  c.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = on;
  });
}

/** 캐릭터를 장면에서 뺀다(새 마을·불러오기). */
export function disposeChar(c: CharView): void {
  c.root.removeFromParent();
  c.line.removeFromParent();
  c.bobber.removeFromParent();
  c.mixer.stopAllAction();
}
