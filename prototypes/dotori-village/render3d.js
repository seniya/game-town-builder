// 도토리 마을 3D 렌더러: CC0 에셋(Kenney 주민, KayKit 건물·나무)으로 같은 시뮬레이션을 비스듬히 내려다본다.
// 출처와 라이선스: docs/research/2026-09-26-cc0-3d-asset-packs.md, assets/LICENSE-*.txt
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MapControls } from 'three/addons/controls/MapControls.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { S, W, H, G, JOBS, getT, hash, clamp, hourOf, bakeryOpen } from './sim.js';

const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const EMOJI_FONT = 'system-ui,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const CHAR_NAMES = ['female-a', 'male-a', 'female-b', 'male-b', 'female-c', 'male-c', 'female-d', 'male-d', 'female-e', 'male-e', 'female-f', 'male-f'];
const HOUSE_MODELS = ['building_home_A_blue', 'building_home_B_red', 'building_home_A_green', 'building_home_B_yellow', 'building_home_A_red', 'building_home_B_blue', 'building_home_A_yellow', 'building_home_B_green'];
const KK = ['building_tavern_red', 'building_market_yellow', 'building_blacksmith_blue', 'building_windmill_yellow', 'tree_single_A', 'tree_single_B',
  'rock_single_A', 'rock_single_C', 'rock_single_E', 'waterlily_A', 'waterlily_B', 'waterplant_A', 'barrel', 'sack', 'crate_A_small', 'crate_open',
  'wheelbarrow', 'bucket_water', 'resource_lumber', 'flag_red', 'flag_yellow', 'flag_blue', 'flag_green', ...HOUSE_MODELS];
const KT = ['fountain-round', 'lantern', 'stall-red', 'stall-green', 'stall-bench', 'cart'];
const CHAR_H = 0.95;          // 주민 키(타일 단위)
const DOOR_YAW = 0;           // KayKit 건물 원본의 문 방향 보정(라디안)

const M = {};                 // 이름 → 로드된 glTF
let app = null, renderer = null, scene = null, camera = null, controls = null, overlay = null, octx = null;
let world = null, sun = null, hemi = null, lampLights = [], glowTex = null;
let cw = 800, ch = 500, dpr = 1, animT = 0;
const chars = [];             // 주민별 3D 객체
const glows = [];             // 창문·등불 빛 스프라이트
const parts = [];             // 오버레이 입자
let partyDeco = null, selRing = null, hoverV = null, waterMat = null;
let portraitR = null, portraitScene = null, portraitCam = null;
const portraitCache = new Map();
const tmpV = new THREE.Vector3();

/* ---------------- 불러오기 ---------------- */
/** 모든 GLB 를 불러온다. onProgress(0~1) 로 진행률을 알린다. */
async function loadAll(onProgress) {
  const loader = new GLTFLoader();
  const list = [
    ...CHAR_NAMES.map(n => ['c:' + n, `assets/kc_character-${n}.json`]),
    ...KK.map(n => [n, `assets/kk_${n}.json`]),
    ...KT.map(n => [n, `assets/kt_${n}.json`]),
  ];
  let done = 0;
  await Promise.all(list.map(([k, url]) => loader.loadAsync(url).then(g => {
    M[k] = g; done++; onProgress(done / list.length);
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  })));
}

/** 모델 원본의 경계 상자 크기. */
function sizeOf(obj) { return new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()); }

/** 정적 모델을 복제해 발바닥이 바닥에 닿게 놓는다. fit 은 가로·세로 중 큰 쪽을 맞출 길이. */
function place(name, x, z, fit, yaw = 0, parent = world) {
  const o = M[name].scene.clone(true);
  const box = new THREE.Box3().setFromObject(o), s = box.getSize(new THREE.Vector3());
  const k = fit / Math.max(s.x, s.z);
  o.scale.setScalar(k);
  o.position.set(x, -box.min.y * k, z);
  o.rotation.y = yaw;
  parent.add(o);
  o.userData.height = s.y * k;
  return o;
}

/** 같은 모델을 여러 곳에 놓을 때 InstancedMesh 로 묶는다. items: [{x,z,s,yaw}] */
function instance(name, items, baseFit) {
  if (!items.length) return;
  const src = M[name].scene;
  src.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(src), s = box.getSize(new THREE.Vector3());
  const k0 = baseFit / Math.max(s.x, s.z);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  src.traverse(mesh => {
    if (!mesh.isMesh) return;
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, items.length);
    im.castShadow = true; im.receiveShadow = true;
    items.forEach((it, i) => {
      const k = k0 * (it.s || 1);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.yaw || 0);
      sc.setScalar(k); p.set(it.x, -box.min.y * k, it.z);
      m.compose(p, q, sc).multiply(mesh.matrixWorld);
      im.setMatrixAt(i, m);
    });
    world.add(im);
  });
}

/* ---------------- 지면 ---------------- */
/** 풀·길·광장·밭·모래를 칠한 지면 텍스처를 만든다. 건물과 나무는 3D 모델로 따로 놓는다. */
function paintGround() {
  const TS = 32, c = document.createElement('canvas'); c.width = W * TS; c.height = H * TS; const g = c.getContext('2d');
  g.fillStyle = '#93c979'; g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = hash(x * 131 + y * 7); g.fillStyle = k < 0.33 ? 'rgba(255,255,210,0.10)' : k < 0.66 ? 'rgba(40,90,30,0.07)' : 'rgba(0,0,0,0)'; g.fillRect(x * TS, y * TS, TS, TS);
    const t = getT(x, y);
    if (t === G.FOREST) { g.fillStyle = 'rgba(40,80,30,0.18)'; g.fillRect(x * TS, y * TS, TS, TS); }
    if (t === G.GRASS && hash(x * 17 + y * 91) < 0.3) { g.strokeStyle = 'rgba(60,120,50,0.35)'; g.lineWidth = 2; const cx = x * TS + hash(x + y * 3) * TS, cy = y * TS + hash(x * 5 + y) * TS; g.beginPath(); g.moveTo(cx - 4, cy - 5); g.lineTo(cx, cy); g.lineTo(cx + 4, cy - 5); g.stroke(); }
  }
  for (const f of S.L.farm) { const X = f.x * TS, Y = f.y * TS; g.fillStyle = '#a8784c'; g.fillRect(X, Y, TS, TS); g.fillStyle = '#946740'; g.fillRect(X, Y + TS * 0.55, TS, TS * 0.25); }
  const circ = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const t = getT(x, y); if (t === G.SAND || t === G.WATER) circ((x + .5) * TS, (y + .5) * TS, TS * 0.85, '#efd9a4'); }
  for (const w of S.L.water) circ((w.x + .5) * TS, (w.y + .5) * TS, TS * 0.78, '#3f8fb8');
  const isRoad = (x, y) => getT(x, y) === G.PATH || getT(x, y) === G.DOOR;
  g.fillStyle = '#e6cf9c';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isRoad(x, y)) continue; const cx = (x + .5) * TS, cy = (y + .5) * TS;
    g.beginPath(); g.arc(cx, cy, TS * 0.5, 0, 7); g.fill();
    for (const [dx, dy] of [[1, 0], [0, 1]]) { const t = getT(x + dx, y + dy); if (isRoad(x + dx, y + dy) || t === G.PLAZA) { if (dx) g.fillRect(cx, cy - TS * 0.5, TS, TS); else g.fillRect(cx - TS * 0.5, cy, TS, TS); } }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isRoad(x, y) && hash(x * 7 + y * 29) < 0.5) { g.fillStyle = 'rgba(150,120,70,0.25)'; g.beginPath(); g.arc(x * TS + hash(x + y) * TS, y * TS + hash(y * 3 + x) * TS, 2.2, 0, 7); g.fill(); }
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  g.fillStyle = '#e9dcc2'; rr(26 * TS + 3, 13 * TS + 3, 11 * TS - 6, 7 * TS - 6, TS * 0.8); g.fill(); g.strokeStyle = '#cdb994'; g.lineWidth = 4; g.stroke();
  g.strokeStyle = 'rgba(120,90,50,0.12)'; g.lineWidth = 1.5;
  for (let y = 13; y < 20; y++) for (let x = 26; x < 37; x++) { const o = (y % 2) * TS / 2; g.strokeRect(x * TS + o + 4, y * TS + 4, TS - 8, TS - 8); }
  g.fillStyle = '#c9a57a'; rr(21 * TS, 21 * TS + 3, 7 * TS, TS - 6, 6); g.fill();
  g.strokeStyle = 'rgba(90,60,30,0.3)'; for (let x = 21; x < 28; x++) { g.beginPath(); g.moveTo(x * TS + TS / 2, 21 * TS + 4); g.lineTo(x * TS + TS / 2, 22 * TS - 4); g.stroke(); }
  for (const t of S.L.grass) if (hash(t.x * 3 + t.y * 57) < 0.08) { const cols = ['#f7a1c4', '#ffe08a', '#ffffff', '#c9b6ff']; for (let i = 0; i < 3; i++) circ(t.x * TS + hash(t.x + i) * TS, t.y * TS + hash(t.y + i * 7) * TS, 3, cols[(t.x + i) % 4]); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

/** 물 타일 위에 반투명 수면을 깐다. */
function makeWater() {
  const pos = [];
  for (const w of S.L.water) { const x = w.x, z = w.y; pos.push(x, 0, z, x, 0, z + 1, x + 1, 0, z, x + 1, 0, z, x, 0, z + 1, x + 1, 0, z + 1); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
  waterMat = new THREE.MeshStandardMaterial({ color: 0x6cc6ec, transparent: true, opacity: 0.62, roughness: 0.15, metalness: 0.05 });
  const m = new THREE.Mesh(geo, waterMat); m.position.y = 0.04; m.receiveShadow = true; world.add(m);
}

/** 빛 번짐 스프라이트용 둥근 그라데이션 텍스처. */
function makeGlowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** 밤에만 보이는 빛 번짐을 추가한다. test() 가 참일 때 켜진다. */
function addGlow(x, y, z, size, color, test) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  sp.position.set(x, y, z); sp.scale.setScalar(size); world.add(sp); glows.push({ sp, test });
}

/* ---------------- 주민 소품 (코드로 만든 모자·도구) ---------------- */
const matCache = new Map();
/** 색별 재질을 한 번만 만든다. */
function mat(c) { if (!matCache.has(c)) matCache.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })); return matCache.get(c); }
/** 도형 하나를 만든다. */
function mesh(geo, c, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); m.castShadow = true; return m; }
/** 직업별 모자. 머리 뼈 기준 좌표(원본 모델 단위). */
function makeHat(job) {
  const g = new THREE.Group();
  switch (job) {
    case '농부': g.add(mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.03, 20), '#E9C46A', 0, 0, 0)); g.add(mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.14, 16), '#E9C46A', 0, 0.08, 0)); g.add(mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.035, 16), '#D0504A', 0, 0.03, 0)); break;
    case '제빵사': g.add(mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.14, 16), '#ffffff', 0, 0.05, 0)); g.add(mesh(new THREE.SphereGeometry(0.19, 16, 10), '#ffffff', 0, 0.19, 0)); break;
    case '어부': g.add(mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.03, 18), '#3D6FA8', 0, 0, 0)); g.add(mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.13, 16), '#3D6FA8', 0, 0.07, 0)); break;
    case '목수': g.add(mesh(new THREE.TorusGeometry(0.215, 0.03, 8, 20), '#E07A3F', 0, -0.05, 0)); g.children[0].rotation.x = Math.PI / 2; break;
    case '나무꾼': g.add(mesh(new THREE.SphereGeometry(0.225, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#B83B32', 0, -0.04, 0)); g.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), '#ffffff', 0, 0.2, 0)); break;
    case '주점 주인': g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.16, 16), '#3a2a44', 0, 0.06, 0)); g.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 18), '#3a2a44', 0, -0.02, 0)); break;
    default: g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), '#f7a1c4', 0.12, 0.02, 0.08)); g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), '#f7a1c4', 0.16, 0.02, 0.02));
  }
  return g;
}
/** 손에 드는 도구. 팔 뼈 끝(손) 기준. 손잡이는 팔 방향(-y)으로 뻗는다. */
function makeTool(kind) {
  const g = new THREE.Group(), wood = '#8a5a34', metal = '#aab3bd';
  switch (kind) {
    case 'hoe': g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 6), wood, 0, -0.18, 0)); g.add(mesh(new THREE.BoxGeometry(0.03, 0.05, 0.16), metal, 0, -0.45, 0.07)); break;
    case 'axe': g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 6), wood, 0, -0.14, 0)); g.add(mesh(new THREE.BoxGeometry(0.03, 0.12, 0.13), metal, 0, -0.32, 0.06)); break;
    case 'hammer': g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.28, 6), wood, 0, -0.1, 0)); g.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.14), '#6b7078', 0, -0.23, 0)); break;
    case 'rod': { const r = mesh(new THREE.CylinderGeometry(0.01, 0.016, 0.9, 6), '#6b4a2e', 0, 0.3, 0.25); r.rotation.x = 0.9; g.add(r); g.userData.tip = new THREE.Vector3(0, 0.62, 0.62); break; }
    case 'bread': g.add(mesh(new THREE.CapsuleGeometry(0.045, 0.1, 4, 8), '#D9A05B', 0, -0.03, 0.04)); g.children[0].rotation.z = Math.PI / 2; break;
    case 'flower': g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 4), '#5aa35a', 0, 0.06, 0.03)); g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), '#f7a1c4', 0, 0.17, 0.03)); break;
    case 'book': g.add(mesh(new THREE.BoxGeometry(0.16, 0.2, 0.03), '#C0504D', 0, -0.02, 0.06)); break;
    case 'mug': g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10), '#d9c7a0', 0, -0.02, 0.05)); g.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 10), '#fff8e6', 0, 0.035, 0.05)); break;
    case 'umbrella': { g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 6), '#5a4636', 0, 0.3, 0)); break; }
  }
  return g;
}

/* ---------------- 주민 ---------------- */
/** 주민 한 명의 3D 캐릭터를 만든다: 모델 복제, 크기 맞춤, 동작 믹서, 모자, 도구 슬롯. */
function makeChar(v) {
  const src = M['c:' + CHAR_NAMES[v.id % CHAR_NAMES.length]];
  const model = SkeletonUtils.clone(src.scene);
  const s = sizeOf(src.scene), k = CHAR_H / s.y;
  const root = new THREE.Group(); model.scale.setScalar(k); root.add(model); world.add(root);
  const mixer = new THREE.AnimationMixer(model), actions = {};
  for (const clip of src.animations) actions[clip.name] = mixer.clipAction(clip);
  const head = model.getObjectByName('head'), armR = model.getObjectByName('arm-right'), armL = model.getObjectByName('arm-left');
  const hat = makeHat(v.job); hat.position.set(0, 0.5, 0); if (head) head.add(hat); else root.add(hat);
  const hand = new THREE.Group(); hand.position.set(0, -0.32, 0.02); (armR || model).add(hand);
  const handL = new THREE.Group(); handL.position.set(0, -0.32, 0.02); (armL || model).add(handL);
  const umbrella = makeUmbrella(v.look.umb); umbrella.visible = false; root.add(umbrella);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
  line.visible = false; line.frustumCulled = false; world.add(line);
  const bobber = mesh(new THREE.SphereGeometry(0.05, 10, 8), '#ff5a4f'); bobber.visible = false; world.add(bobber);
  return { v, root, model, mixer, actions, cur: null, hand, handL, tool: null, toolKind: null, umbrella, line, bobber, yaw: 0, spin: 0 };
}
/** 비 올 때 머리 위에 드는 우산. */
function makeUmbrella(color) {
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.3, 12, 1, true), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.6 }));
  canopy.position.y = CHAR_H + 0.42; canopy.castShadow = true; g.add(canopy);
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), '#5a4636', 0.12, CHAR_H + 0.1, 0.05));
  return g;
}
/** 동작 클립을 부드럽게 바꾼다. once 면 한 번 재생하고 마지막 자세에 멈춘다. */
function play(c, name, ts = 1, once = false) {
  const a = c.actions[name] || c.actions.idle;
  a.timeScale = ts;
  if (c.cur === a) return;
  a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.play();
  if (c.cur) a.crossFadeFrom(c.cur, 0.22, false);
  c.cur = a;
}
/** 손에 든 도구를 바꾼다. */
function setTool(c, kind) {
  if (c.toolKind === kind) return;
  if (c.tool) c.hand.remove(c.tool);
  c.tool = kind ? makeTool(kind) : null; c.toolKind = kind;
  if (c.tool) c.hand.add(c.tool);
}

/** 시뮬레이션 상태를 동작 이름·도구·방향으로 옮긴다. */
function animate(c, dtA, partyOn) {
  const v = c.v, a = v.act, T = animT + v.id * 0.73;
  const moving = v.x !== v.px || v.y !== v.py;
  let clip = 'idle', ts = 1, once = false, tool = null, face = null, fish = null, spin = false;
  if (v.talk) {
    const k = v.talk, o = k.a === v ? k.b : k.a; face = { x: o.x - v.x, y: o.y - v.y };
    const idx = Math.floor((S.t - k.start) / 3), last = idx >= k.lines.length - 1;
    if (k.argue) { clip = 'emote-no'; ts = 1.5; }
    else if (k.kind === 'confess') clip = last ? (k.success ? 'jump' : (v === k.a ? 'die' : 'emote-no')) : (v === k.a ? 'holding-both' : 'idle'), once = last && !k.success && v === k.a;
    else if (k.speaker === v) { clip = idx === 0 ? 'interact-right' : 'emote-yes'; ts = 0.8; }
    else clip = 'idle';
  } else if (moving) {
    const run = a && (a.type === 'flee' || a.target);
    clip = run ? 'sprint' : 'walk'; ts = run ? 1.0 : 1.15;
  } else if (a && a.phase === 'do') {
    if (a.face) face = a.face;
    switch (a.type) {
      case 'work': {
        const pl = JOBS[v.job].place;
        if (pl === 'farm') { clip = 'attack-melee-right'; ts = 0.6; tool = 'hoe'; }
        else if (pl === 'forest') { clip = 'attack-melee-right'; ts = 0.8; tool = 'axe'; }
        else if (pl === 'workshop') { clip = 'interact-right'; ts = 1.6; tool = 'hammer'; }
        else if (pl === 'shore') { clip = 'holding-right'; tool = 'rod'; fish = a.face; }
        break;
      }
      case 'fun':
        if (a.where === 'shore') { clip = 'holding-right'; tool = 'rod'; fish = a.face; }
        else if (a.where === 'plaza') { clip = 'sit'; if (v.trait === '외톨이' || v.id % 3 === 0) tool = 'book'; face = { x: 0, y: 1 }; }
        else if (a.where === 'grass') { clip = 'pick-up'; ts = 0.6; }
        else clip = 'idle';
        break;
      case 'social': clip = ((T * 0.45) % 5) < 0.9 ? 'emote-yes' : 'idle'; break;
      case 'party': case 'raindance': {
        const st = a.type === 'raindance' ? 2 : v.id % 3;
        clip = st === 0 ? 'jump' : st === 1 ? 'emote-yes' : 'idle'; ts = st === 1 ? 1.6 : 1; spin = st === 2;
        if (v.job === '주점 주인' || v.id % 4 === 0) tool = 'mug';
        break;
      }
      case 'nap': clip = 'die'; once = true; break;
      case 'hunt': clip = 'pick-up'; ts = 0.9; break;
      case 'wander': clip = 'idle'; break;
      default: clip = 'idle';
    }
  }
  if (!tool && v.carry && v.carry.until > S.t) tool = v.carry.item;
  if (v.job === '주점 주인' && !tool && a && a.type === 'social') tool = 'mug';
  play(c, clip, ts, once);
  setTool(c, tool);
  // 방향: 걷는 방향, 대화 상대, 일하는 대상 쪽을 본다.
  const d = face || (moving ? { x: v.x - v.px, y: v.y - v.py } : v.dir);
  if (spin) c.spin += dtA * 6; else c.spin = 0;
  if (d && (d.x || d.y)) { const target = Math.atan2(d.x, d.y) + c.spin; let diff = target - c.yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); c.yaw += diff * Math.min(1, dtA * 10 + (spin ? 1 : 0)); }
  c.root.rotation.y = c.yaw;
  // 우산
  c.umbrella.visible = S.weather.rain && !(a && (a.type === 'raindance' || a.type === 'nap')) && !v.inside;
  // 낚싯줄과 찌
  if (fish && c.tool && c.tool.userData.tip) {
    const tip = c.tool.userData.tip.clone(); c.tool.localToWorld(tip);
    const bx = v.x + (fish.x || 0) * 1.1, bz = v.y + (fish.y || 0) * 1.1;
    const catching = v.catchT != null && animT - v.catchT < 1.0;
    const by = 0.06 + (catching ? 0.35 : Math.sin(T * 2.4) * 0.02);
    const g = c.line.geometry.attributes.position; g.setXYZ(0, tip.x, tip.y, tip.z); g.setXYZ(1, bx, by, bz); g.needsUpdate = true;
    c.line.visible = true; c.bobber.visible = true; c.bobber.position.set(bx, by, bz);
    if (v.catchT != null && c._cs !== v.catchT) { c._cs = v.catchT; burst('splash', bx, 0.1, bz, 10); }
  } else { c.line.visible = false; c.bobber.visible = false; }
  // 연출 입자
  if (dtA > 0 && !v.inside) {
    const hy = CHAR_H + 0.25;
    if (v.talk && v.talk.argue && Math.random() < dtA * 4) burst('steam', v.x, hy, v.y, 2);
    if (((v.talk && v.talk.kind === 'date') || (v.talk && v.talk.kind === 'confess' && v.talk.success && Math.floor((S.t - v.talk.start) / 3) >= v.talk.lines.length - 1)) && Math.random() < dtA * 1.6) burst('heart', v.x, hy, v.y, 1);
    if (a && a.phase === 'do' && (a.type === 'party' || a.type === 'raindance') && (v.trait === '파티광' || a.type === 'raindance') && Math.random() < dtA * 1.3) burst('note', v.x, hy, v.y, 1);
    if (a && a.phase === 'do' && a.type === 'nap' && Math.random() < dtA * 0.9) burst('z', v.x, 0.5, v.y, 1);
    if (moving && a && (a.type === 'flee' || a.target) && Math.random() < dtA * 7) burst('dust', v.x, 0.05, v.y, 1);
    if (a && a.type === 'flee' && Math.random() < dtA * 3) burst('sweat', v.x, hy, v.y, 1);
    if (a && a.phase === 'do' && a.type === 'work' && !v.talk) {
      const pl = JOBS[v.job].place, per = pl === 'farm' ? 1.6 : pl === 'forest' ? 1.2 : pl === 'workshop' ? 0.6 : 0;
      if (per) { c.wt = (c.wt || 0) + dtA; if (c.wt > per) { c.wt -= per; const fx = v.x + Math.sin(c.yaw) * 0.45, fz = v.y + Math.cos(c.yaw) * 0.45; burst(pl === 'farm' ? 'soil' : pl === 'forest' ? 'chip' : 'spark', fx, 0.15, fz, pl === 'workshop' ? 5 : 4); } }
    }
    if (a && a.phase === 'do' && a.type === 'hunt' && Math.random() < dtA * 1.2) burst('dirt', v.x + Math.sin(c.yaw) * 0.35, 0.1, v.y + Math.cos(c.yaw) * 0.35, 3);
  }
  c.mixer.update(dtA);
}

/* ---------------- 오버레이 입자·말풍선 ---------------- */
/** 입자 묶음을 띄운다. (x,z) 바닥 좌표, y 높이. */
function burst(type, x, y, z, n) { for (let i = 0; i < n; i++) { const p = preset(type, x, y, z, i); if (p && parts.length < 700) parts.push(Object.assign({ age: 0, g: 0, grow: 0, vx: 0, vz: 0 }, p)); } }
/** 입자 종류별 초기값. 크기와 속도는 월드 단위. */
function preset(type, x, y, z, i) {
  const r = Math.random, sx = (r() - .5), sz = (r() - .5);
  switch (type) {
    case 'soil': case 'dirt': return { type: 'dot', x, y, z, vx: sx * 1.4, vz: sz * 1.4, vy: 1.1 + r() * 1.2, g: -6, life: .55, size: .05, color: type === 'soil' ? '#8a5a34' : '#6e4a2c' };
    case 'chip': return { type: 'rect', x, y, z, vx: sx * 2.2, vz: sz * 2.2, vy: 1.4 + r() * 1.2, g: -7, life: .6, size: .07, color: r() < .5 ? '#e8c48c' : '#c99a5e', rot: r() * 6, vr: (r() - .5) * 20 };
    case 'spark': return { type: 'dot', x, y, z, vx: sx * 2.6, vz: sz * 2.6, vy: 1 + r() * 1.6, g: -5, life: .35, size: .035, color: '#ffd35a' };
    case 'splash': return { type: 'dot', x, y, z, vx: sx * 1.8, vz: sz * 1.8, vy: 1.6 + r() * 1.1, g: -6, life: .65, size: .05, color: '#e9f8ff' };
    case 'heart': return { type: 'heart', x: x + sx * .5, y, z: z + sz * .5, vy: .55 + r() * .4, life: 1.5, size: .13 + r() * .07, color: r() < .5 ? '#ff7fa3' : '#ff5c8a' };
    case 'steam': return { type: 'puff', x: x + (i % 2 ? .2 : -.2), y, z, vx: (i % 2 ? .5 : -.5), vy: .7, life: .7, size: .07, grow: .12, color: 'rgba(255,255,255,0.95)' };
    case 'sweat': return { type: 'drop', x: x + (i % 2 ? .25 : -.25), y, z, vx: (i % 2 ? .6 : -.6), vy: .9, g: -5, life: .6, size: .07, color: '#8fd3ff' };
    case 'sparkle': return { type: 'star', x: x + sx * .9, y: y + r() * .5, z: z + sz * .5, vy: .25, life: 1, size: .1 + r() * .08, color: '#fff3a0' };
    case 'smoke': return { type: 'puff', x: x + sx * .08, y, z, vx: .12 + r() * .12, vy: .38, life: 2.6, size: .12, grow: .3, color: 'rgba(236,236,236,0.55)' };
    case 'note': return { type: 'note', x: x + sx * .5, y, z, vx: sx * .35, vy: .55, life: 1.5, size: .3, color: ['#ff7fa3', '#ffb347', '#5fbfff'][i % 3] };
    case 'z': return { type: 'z', x, y, z, vx: .18, vy: .3, life: 1.8, size: .26, color: '#ffffff' };
    case 'dust': return { type: 'puff', x: x + sx * .1, y, z: z + sz * .1, vx: sx * .3, vy: .12, life: .45, size: .06, grow: .12, color: 'rgba(225,210,175,0.7)' };
    case 'confetti': return { type: 'rect', x, y, z, vx: sx * .6, vz: sz * .6, vy: -.4 - r() * .3, life: 3, size: .07, color: ['#ff7896', '#ffd166', '#7fd6ff', '#b7f07a'][i % 4], rot: r() * 6, vr: (r() - .5) * 10 };
  }
  return null;
}
/** 월드 좌표를 오버레이 화면 좌표로. 카메라 뒤면 null. */
function project(x, y, z) { tmpV.set(x, y, z).project(camera); if (tmpV.z > 1) return null; return [(tmpV.x + 1) / 2 * cw, (1 - tmpV.y) / 2 * ch]; }
/** 한 월드 단위가 그 위치에서 몇 픽셀인지. */
function pxPerUnit(x, y, z) { const d = camera.position.distanceTo(tmpV.set(x, y, z)); return ch / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * d); }
function heartPath(c, x, y, s) { c.beginPath(); c.moveTo(x, y + s * 0.35); c.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.45, y - s * 1.05, x, y - s * 0.45); c.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35); c.closePath(); }
/** 입자를 움직이고 오버레이에 그린다. */
function drawParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.age += dt; if (p.age >= p.life) { parts.splice(i, 1); continue; }
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.vr) p.rot += p.vr * dt;
    if (p.y < 0.02 && p.g < 0) { p.y = 0.02; p.vx *= 0.5; p.vz *= 0.5; p.vy = 0; }
    const s = project(p.x, p.y, p.z); if (!s) continue; const [sx, sy] = s;
    if (sx < -40 || sy < -40 || sx > cw + 40 || sy > ch + 40) continue;
    const k = p.age / p.life, sz = Math.max(1, (p.size + p.grow * k) * pxPerUnit(p.x, p.y, p.z));
    octx.globalAlpha = Math.min(1, (1 - k) * 1.6); octx.fillStyle = p.color;
    switch (p.type) {
      case 'dot': case 'puff': octx.beginPath(); octx.arc(sx, sy, sz, 0, 7); octx.fill(); break;
      case 'rect': octx.save(); octx.translate(sx, sy); octx.rotate(p.rot); octx.fillRect(-sz, -sz * .45, sz * 2, sz * .9); octx.restore(); break;
      case 'heart': heartPath(octx, sx, sy, sz); octx.fill(); break;
      case 'drop': octx.beginPath(); octx.moveTo(sx, sy - sz * 1.3); octx.quadraticCurveTo(sx + sz, sy, sx, sy + sz * .7); octx.quadraticCurveTo(sx - sz, sy, sx, sy - sz * 1.3); octx.fill(); break;
      case 'star': octx.beginPath(); for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4, r2 = j % 2 ? sz * .35 : sz; octx.lineTo(sx + Math.cos(a) * r2, sy + Math.sin(a) * r2); } octx.closePath(); octx.fill(); break;
      case 'note': octx.font = `700 ${sz * 1.3}px sans-serif`; octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.fillText('♪', sx, sy); break;
      case 'z': octx.font = `700 ${sz}px "Jua",sans-serif`; octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.fillText('z', sx, sy); break;
    }
  }
  octx.globalAlpha = 1;
}
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
/** 말풍선: 새 감정이면 통통 튀며 나타난다. */
function drawBubble(x, y, e, strong, t0) {
  const k = t0 == null ? 1 : clamp((animT - t0) / 0.22, 0, 1), sc = Math.max(0.01, easeOutBack(k));
  const fs = 17, w = fs * 1.5, hgt = fs * 1.35;
  octx.save(); octx.translate(x, y); octx.scale(sc, sc);
  octx.fillStyle = strong ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.82)'; octx.strokeStyle = 'rgba(60,50,40,0.25)'; octx.lineWidth = 1;
  octx.beginPath(); octx.roundRect(-w / 2, -hgt, w, hgt, hgt / 2.2); octx.moveTo(-3, 0); octx.lineTo(0, 4); octx.lineTo(3, 0); octx.fill(); octx.stroke();
  octx.font = `${fs}px ${EMOJI_FONT}`; octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.fillStyle = '#000'; octx.fillText(e, 0, -hgt / 2 + 1);
  octx.restore();
}
/** 이름표. */
function drawName(x, y, name, strong) {
  octx.font = `${strong ? '700 ' : ''}12px "Gowun Dodum",sans-serif`; const w = octx.measureText(name).width + 10;
  octx.fillStyle = strong ? 'rgba(47,125,109,0.95)' : 'rgba(30,40,40,0.7)'; octx.beginPath(); octx.roundRect(x - w / 2, y - 8, w, 16, 8); octx.fill();
  octx.fillStyle = '#fff'; octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.fillText(name, x, y);
}

/* ---------------- 하늘과 빛 ---------------- */
const C = (h) => new THREE.Color(h);
const SKY = [[0, C('#141b3a')], [5, C('#1d2750')], [6.5, C('#f2b8a6')], [8, C('#bfe3f5')], [16.5, C('#bfe3f5')], [18.5, C('#f6ad7b')], [20, C('#2a2f5c')], [24, C('#141b3a')]];
/** 시각에 따른 하늘색. */
function skyAt(h) { for (let i = 0; i < SKY.length - 1; i++) { const [a, ca] = SKY[i], [b, cb] = SKY[i + 1]; if (h >= a && h <= b) return ca.clone().lerp(cb, (h - a) / (b - a)); } return SKY[0][1].clone(); }
/** 낮밤: 해 위치·색, 하늘, 안개, 등불과 창문 빛. */
function updateSky(h) {
  const sky = skyAt(h); scene.background = sky; scene.fog.color.copy(sky);
  const day = clamp(Math.sin((h - 6) / 13 * Math.PI), 0, 1);           // 6시~19시
  const ang = (h - 6) / 13 * Math.PI;
  const cx = W / 2, cz = H / 2;
  if (day > 0.02) { sun.position.set(cx + Math.cos(ang) * 40, 8 + Math.sin(ang) * 45, cz - 22); sun.color.set(h < 8.5 || h > 16.5 ? '#ffc38a' : '#fff4e0'); sun.intensity = 0.4 + day * 2.4; }
  else { sun.position.set(cx - 20, 40, cz - 10); sun.color.set('#9fb4ff'); sun.intensity = 0.35; }
  sun.target.position.set(cx, 0, cz);
  hemi.intensity = 0.55 + day * 0.7; hemi.color.set(day > 0.1 ? '#dff1ff' : '#6f7fb8'); hemi.groundColor.set(day > 0.1 ? '#6f8f4f' : '#2a2f4a');
  const night = clamp(1 - day * 3, 0, 1);
  for (const L of lampLights) L.intensity = night * 6;
  for (const gl of glows) { const on = gl.test(h); gl.sp.material.opacity += ((on ? night : 0) - gl.sp.material.opacity) * 0.1; gl.sp.visible = gl.sp.material.opacity > 0.01; }
  if (waterMat) waterMat.color.set(day > 0.1 ? '#6cc6ec' : '#35507a');
  renderer.toneMappingExposure = 0.95 + day * 0.15;
  if (partyDeco) { const P = S.party, on = !!(P && S.t >= P.start - 40 && S.t < P.end); partyDeco.visible = on; }
}

/* ---------------- 마을 짓기 ---------------- */
/** 새 마을의 3D 장면을 만든다. */
function buildWorld() {
  if (world) scene.remove(world);   // 모델 기하는 원본과 공유하므로 dispose 하지 않는다
  world = new THREE.Group(); scene.add(world);
  chars.length = 0; glows.length = 0; parts.length = 0; portraitCache.clear();
  for (const L of lampLights) scene.remove(L); lampLights = [];
  // 지면과 물
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: paintGround(), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, 0, H / 2); ground.receiveShadow = true; world.add(ground);
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(W + 80, H + 80), new THREE.MeshStandardMaterial({ color: '#7fb466', roughness: 1 }));
  skirt.rotation.x = -Math.PI / 2; skirt.position.set(W / 2, -0.02, H / 2); skirt.receiveShadow = true; world.add(skirt);
  makeWater();
  // 건물
  let hi = 0;
  for (const b of S.buildings) {
    const cx = b.x + b.w / 2, cz = b.y + b.h / 2, yaw = (b.side === 's' ? 0 : Math.PI) + DOOR_YAW;
    let o;
    if (b.kind === 'house') o = place(HOUSE_MODELS[(hi++ * 3 + (S.seed | 0)) % HOUSE_MODELS.length], cx, cz, Math.min(b.w, b.h) * 0.92, yaw);
    else if (b.kind === 'bakery') o = place('building_market_yellow', cx, cz, b.w * 0.95, yaw);
    else if (b.kind === 'tavern') o = place('building_tavern_red', cx, cz, b.w * 0.8, yaw);
    else o = place('building_blacksmith_blue', cx, cz, b.w * 0.9, yaw);
    b.h3 = o.userData.height;
    const dz = b.side === 's' ? b.y + b.h + 0.05 : b.y - 0.05;
    const lit = b.kind === 'bakery' ? (h => bakeryOpen(h)) : b.kind === 'tavern' ? (h => h >= 17 || h < 1) : (() => S.vs.some(v => v.inside === b && !(v.act && v.act.type === 'sleep' && v.act.phase === 'do')));
    addGlow(b.door.x + 0.5, 0.7, dz, 2.6, 0xffc070, lit);
  }
  // 풍차와 소품
  place('building_windmill_yellow', 19.6, 27.4, 2.2, 0.4);
  place('wheelbarrow', 17.5, 25.3, 0.8, 1.2);
  place('sack', 17.2, 24.6, 0.35, 0.3); place('sack', 17.7, 24.5, 0.35, 1.1);
  place('barrel', 20.5, 21.4, 0.45); place('barrel', 20.4, 22.0, 0.45, 0.7); place('crate_A_small', 28.4, 21.5, 0.45, 0.3);
  place('crate_open', 33.3, 21.4, 0.7, 0.2); place('resource_lumber', 38.6, 21.5, 1.1, 1.57); place('bucket_water', 42.6, 30.6, 0.3);
  place('stall-red', 37.5, 13.4, 1.4, Math.PI); place('stall-green', 24.6, 14.2, 1.4, Math.PI / 2);
  place('cart', 43.2, 21.4, 1.1, 1.3);
  place('fountain-round', 31.5, 16.5, 2.4);
  addGlow(31.5, 0.6, 16.5, 2.2, 0x9fdcff, () => true);
  for (const bn of S.benches) place('stall-bench', bn.x + 0.5, bn.y + 0.5, 0.95, Math.PI / 2);
  // 등불(밤에 빛)
  for (const [lx, ly] of S.lamps) {
    place('lantern', lx + 0.5, ly + 0.5, 0.2);
    addGlow(lx + 0.5, 1.25, ly + 0.5, 2.4, 0xffc070, () => true);
  }
  for (const [lx, ly] of [[26, 13], [36, 19], [21, 21], [31, 31], [44, 19]]) { const L = new THREE.PointLight(0xffb866, 0, 7, 1.6); L.position.set(lx + 0.5, 1.3, ly + 0.5); scene.add(L); lampLights.push(L); }
  // 나무·바위·연꽃·작물
  const treesA = [], treesB = [];
  for (const f of S.L.forest) (hash(f.x * 13 + f.y * 7) < 0.5 ? treesA : treesB).push({ x: f.x + 0.5 + (hash(f.x + f.y * 3) - 0.5) * 0.4, z: f.y + 0.5 + (hash(f.x * 5 + f.y) - 0.5) * 0.4, s: 0.85 + hash(f.x * 3 + f.y * 11) * 0.5, yaw: hash(f.x + f.y) * 6 });
  instance('tree_single_A', treesA, 1.25); instance('tree_single_B', treesB, 1.25);
  const rocks = S.L.grass.filter(t => hash(t.x * 29 + t.y * 3) < 0.012).map(t => ({ x: t.x + 0.5, z: t.y + 0.5, s: 0.8 + hash(t.x) * 0.8, yaw: hash(t.y) * 6 }));
  instance('rock_single_C', rocks, 0.32);
  instance('waterlily_A', S.L.water.filter(t => hash(t.x * 7 + t.y * 5) < 0.12).map(t => ({ x: t.x + 0.5, z: t.y + 0.5, s: 1, yaw: hash(t.x) * 6 })), 0.45);
  instance('waterplant_A', S.L.shore.filter(t => hash(t.x * 11 + t.y) < 0.15).map(t => ({ x: t.x + 0.5, z: t.y + 0.5, s: 1, yaw: hash(t.y) * 6 })), 0.4);
  const crop = new THREE.InstancedMesh(new THREE.ConeGeometry(0.09, 0.32, 5), mat('#8cc063'), S.L.farm.length * 3);
  const m4 = new THREE.Matrix4(); let ci = 0;
  for (const f of S.L.farm) for (let i = 0; i < 3; i++) { m4.makeTranslation(f.x + 0.2 + i * 0.3, 0.16, f.y + 0.42); crop.setMatrixAt(ci++, m4); }
  crop.castShadow = true; world.add(crop);
  // 밭 울타리(코드로 만든 말뚝과 가로대)
  const posts = [], fx0 = 4, fx1 = 17, fz0 = 25, fz1 = 36;
  for (let x = fx0; x <= fx1; x++) { posts.push([x, fz0]); posts.push([x, fz1]); }
  for (let z = fz0 + 1; z < fz1; z++) { posts.push([fx0, z]); if (z !== 31) posts.push([fx1, z]); }
  const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.45, 0.08), mat('#9a6a3c'), posts.length);
  posts.forEach(([x, z], i) => { m4.makeTranslation(x, 0.22, z); post.setMatrixAt(i, m4); }); post.castShadow = true; world.add(post);
  // 파티 장식(깃발과 전구 줄)
  partyDeco = new THREE.Group(); world.add(partyDeco);
  const flags = ['flag_red', 'flag_yellow', 'flag_blue', 'flag_green'];
  [[26.3, 13.3], [36.7, 13.3], [26.3, 19.7], [36.7, 19.7], [31.5, 13.2], [31.5, 19.8]].forEach(([x, z], i) => place(flags[i % 4], x, z, 0.9, i, partyDeco));
  for (let i = 0; i < 16; i++) for (const zz of [13.3, 19.7]) {
    const col = [0xff7896, 0xffd166, 0x7fd6ff][i % 3], x = 26.5 + i * (10 / 15);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: col })); bulb.position.set(x, 1.5 - Math.sin(i / 15 * Math.PI) * 0.25, zz); partyDeco.add(bulb);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 })); sp.position.copy(bulb.position); sp.scale.setScalar(0.8); partyDeco.add(sp);
  }
  // 선택 고리
  selRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
  selRing.rotation.x = -Math.PI / 2; selRing.position.y = 0.03; world.add(selRing);
  // 주민
  for (const v of S.vs) chars.push(makeChar(v));
}

/* ---------------- 카메라·입력 ---------------- */
/** 창 크기에 맞춰 렌더러와 오버레이 크기를 바꾼다. */
function resize() {
  const stage = document.getElementById('stage'), r = stage.getBoundingClientRect();
  cw = Math.max(1, r.width); ch = Math.max(1, r.height); dpr = Math.min(2, window.devicePixelRatio || 1);
  renderer.setPixelRatio(dpr); renderer.setSize(cw, ch, false);
  overlay.width = Math.round(cw * dpr); overlay.height = Math.round(ch * dpr);
  camera.aspect = cw / ch; camera.updateProjectionMatrix();
}
/** 카메라가 보는 점을 마을 안으로 제한한다. */
function clampTarget() {
  const t = controls.target, ox = clamp(t.x, 2, W - 2) - t.x, oz = clamp(t.z, 2, H - 2) - t.z;
  if (ox || oz || t.y) { t.x += ox; t.z += oz; camera.position.x += ox; camera.position.z += oz; camera.position.y -= t.y; t.y = 0; }
}
/** 카메라를 (x,z) 로 옮긴다. 보는 각도와 거리는 그대로. */
function lookAt(x, z, k = 1) {
  const dx = (x - controls.target.x) * k, dz = (z - controls.target.z) * k;
  controls.target.x += dx; controls.target.z += dz; camera.position.x += dx; camera.position.z += dz;
}
/** 화면 좌표에서 가장 가까운 주민을 고른다. */
function pickAt(sx, sy) {
  let best = null, bd = 34;
  for (const c of chars) { if (c.v.inside) continue; const p = project(c.root.position.x, CHAR_H * 0.5, c.root.position.z); if (!p) continue; const d = Math.hypot(p[0] - sx, p[1] - sy); if (d < bd) { bd = d; best = c.v; } }
  return best;
}
/** 클릭(끌지 않은 짧은 누름)으로 주민을 고르고, 끌면 따라가기를 끈다. */
function bindInput(el) {
  let down = null;
  el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) app.stopFollow();
    if (!down) { hoverV = pickAt(e.clientX - r.left, e.clientY - r.top); el.style.cursor = hoverV ? 'pointer' : 'grab'; }
  });
  el.addEventListener('pointerup', e => {
    const r = el.getBoundingClientRect();
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 6) { const v = pickAt(e.clientX - r.left, e.clientY - r.top); if (v) app.select(v, false); }
    down = null;
  });
}

/* ---------------- 초상화 ---------------- */
/** 패널 초상화: 같은 캐릭터를 따로 한 번 찍어 캐시한다. */
function portraitOf(v) {
  if (portraitCache.has(v.id)) return portraitCache.get(v.id);
  if (!portraitR) {
    const pc = document.createElement('canvas'); pc.width = pc.height = 112;
    portraitR = new THREE.WebGLRenderer({ canvas: pc, alpha: true, antialias: true, preserveDrawingBuffer: true });
    portraitR.outputColorSpace = THREE.SRGBColorSpace;
    portraitScene = new THREE.Scene();
    portraitScene.add(new THREE.HemisphereLight(0xffffff, 0x88aa77, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(1, 2, 3); portraitScene.add(d);
    portraitCam = new THREE.PerspectiveCamera(30, 1, 0.1, 20); portraitCam.position.set(0, CHAR_H * 0.78, 1.55); portraitCam.lookAt(0, CHAR_H * 0.68, 0);
  }
  const src = M['c:' + CHAR_NAMES[v.id % CHAR_NAMES.length]];
  const model = SkeletonUtils.clone(src.scene); model.scale.setScalar(CHAR_H / sizeOf(src.scene).y);
  const mixer = new THREE.AnimationMixer(model); const idle = src.animations.find(a => a.name === 'idle'); if (idle) { mixer.clipAction(idle).play(); mixer.update(0.3); }
  const head = model.getObjectByName('head'); const hat = makeHat(v.job); hat.position.set(0, 0.5, 0); (head || model).add(hat);
  model.rotation.y = -0.35;
  portraitScene.add(model); portraitR.render(portraitScene, portraitCam); portraitScene.remove(model);
  const img = document.createElement('canvas'); img.width = img.height = 112; img.getContext('2d').drawImage(portraitR.domElement, 0, 0);
  portraitCache.set(v.id, img); return img;
}

/* ---------------- 인터페이스 ---------------- */
/** ui.js 가 쓰는 3D 렌더러. 먼저 load() 를 기다린 뒤 start() 에 넘긴다. */
export function createRenderer3D() {
  return {
    load: loadAll,
    /** WebGL 렌더러, 카메라, 조작, 오버레이를 만든다. */
    init(a) {
      app = a;
      const cv = document.getElementById('world');
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
      scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xbfe3f5, 55, 130);
      camera = new THREE.PerspectiveCamera(34, 1, 0.5, 400);
      hemi = new THREE.HemisphereLight(0xdff1ff, 0x6f8f4f, 1.1); scene.add(hemi);
      sun = new THREE.DirectionalLight(0xfff4e0, 2.4); sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 30, bottom: -30, near: 1, far: 140 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
      scene.add(sun); scene.add(sun.target);
      glowTex = makeGlowTex();
      controls = new MapControls(camera, cv);
      Object.assign(controls, { enableDamping: true, dampingFactor: 0.12, screenSpacePanning: false, minDistance: 7, maxDistance: 75, maxPolarAngle: 1.22, minPolarAngle: 0.3, zoomSpeed: 1.1 });
      overlay = document.createElement('canvas'); overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
      cv.after(overlay); octx = overlay.getContext('2d');
      new ResizeObserver(resize).observe(document.getElementById('stage')); resize();
      bindInput(cv);
    },
    /** 새 마을의 장면을 짓는다. */
    onWorld() { buildWorld(); },
    /** 광장을 비스듬히 내려다보는 기본 시점. */
    fit() { controls.target.set(31.5, 0, 19); camera.position.set(31.5, 26, 42); controls.update(); },
    /** 카메라를 주민에게 옮긴다(집 안이면 문 앞). */
    centerOn(v) { if (!v) return; const p = v.inside ? { x: v.inside.door.x + 0.5, y: v.inside.door.y + 0.5 } : v; lookAt(p.x, p.y); },
    /** 감정 연출. */
    fx(v, fx) { if (fx === 'catch') { v.catchT = animT; return; } burst(fx, v.x, CHAR_H + 0.3, v.y, fx === 'heart' ? 6 : fx === 'sparkle' ? 7 : 3); },
    /** 패널 초상화. */
    drawPortrait(canvas, v) { if (canvas._pv === v.id) return; canvas._pv = v.id; const g = canvas.getContext('2d'); g.clearRect(0, 0, canvas.width, canvas.height); g.drawImage(portraitOf(v), 0, 0, canvas.width, canvas.height); },
    /** 한 프레임: 주민 갱신 → 하늘 → 3D 그리기 → 오버레이. */
    frame(now, dt, dtA) {
      animT += dtA;
      const al = app.alpha, h = hourOf(S.t) + al / 60;
      const P = S.party, partyOn = !!(P && S.t >= P.start && S.t < P.end);
      for (const c of chars) {
        const v = c.v; c.root.visible = !v.inside;
        if (v.inside) { c.line.visible = c.bobber.visible = false; continue; }
        c.root.position.set(v.px + (v.x - v.px) * al, 0, v.py + (v.y - v.py) * al);
        animate(c, dtA, partyOn);
      }
      const sel = app.sel;
      if (app.follow && sel) { const p = sel.inside ? { x: sel.inside.door.x + 0.5, y: sel.inside.door.y + 0.5 } : { x: sel.px + (sel.x - sel.px) * al, y: sel.py + (sel.y - sel.py) * al }; lookAt(p.x, p.y, 0.12); }
      controls.update(); clampTarget();
      selRing.visible = !!(sel && !sel.inside); if (selRing.visible) selRing.position.set(sel.px + (sel.x - sel.px) * al, 0.03, sel.py + (sel.y - sel.py) * al);
      updateSky(h);
      if (waterMat) waterMat.opacity = 0.6 + Math.sin(now / 900) * 0.04;
      // 굴뚝 연기와 파티 꽃가루
      if (dtA > 0) {
        for (const b of S.buildings) {
          const occ = S.vs.some(v => v.inside === b && !(v.act && v.act.type === 'sleep' && v.act.phase === 'do'));
          if (occ && Math.random() < dtA * (b.kind === 'bakery' ? 2.4 : 0.9)) burst('smoke', b.x + b.w * 0.68, (b.h3 || 2.5) * 0.95, b.y + b.h * 0.4, 1);
        }
        if (partyOn && !reduceMotion && Math.random() < dtA * 14) burst('confetti', 26.5 + Math.random() * 10, 2.6, 13.5 + Math.random() * 6, 1);
      }
      renderer.render(scene, camera);
      // 오버레이
      octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, cw, ch);
      if (S.weather.rain) { octx.fillStyle = 'rgba(60,70,90,0.16)'; octx.fillRect(0, 0, cw, ch); }
      drawParts(dtA);
      if (h >= 21 || h < 7) {
        octx.fillStyle = 'rgba(255,255,255,0.9)'; octx.textAlign = 'center'; octx.textBaseline = 'middle';
        for (const b of S.houses) {
          if (!S.vs.some(v => v.inside === b && v.act && v.act.type === 'sleep' && v.act.phase === 'do')) continue;
          for (let k = 0; k < 2; k++) { const p = (now / 1000 * 0.35 + k * 0.5 + hash(b.x)) % 1; const s = project(b.x + b.w * 0.6 + p * 0.5, (b.h3 || 2.5) + p * 1.1, b.y + b.h * 0.5); if (!s) continue; octx.globalAlpha = Math.sin(p * Math.PI); octx.font = `700 ${12 + p * 8}px "Jua",sans-serif`; octx.fillText('z', s[0], s[1]); }
        }
        octx.globalAlpha = 1;
      }
      if (S.weather.rain) { octx.strokeStyle = 'rgba(210,225,255,0.45)'; octx.lineWidth = 1; octx.beginPath(); const tm = now / 1000, n = reduceMotion ? 60 : 180; for (let i = 0; i < n; i++) { const x = (hash(i) * cw + tm * 60) % cw, y = ((hash(i * 3) + tm * 1.6) % 1) * ch; octx.moveTo(x, y); octx.lineTo(x - 3, y + 10); } octx.stroke(); }
      for (const c of chars) {
        const v = c.v; if (v.inside) continue;
        const p = project(c.root.position.x, CHAR_H + 0.35, c.root.position.z); if (!p) continue;
        const live = v.bubble && v.bubble.until > S.t;
        if (v.bubble !== c._bo) { c._bo = v.bubble; c._bt0 = animT; }
        if (live) drawBubble(p[0], p[1], v.bubble.e, v === sel, c._bt0);
        if (v === sel || v === hoverV) { const q = project(c.root.position.x, 0, c.root.position.z); if (q) drawName(q[0], q[1] + 14, v.name, v === sel); }
      }
    },
  };
}
