// 도토리 마을 공용 UI: 오른쪽 패널, 속도 조절, 생각 심기, 메인 루프.
// 렌더러(2D/3D)는 start(renderer) 로 끼워 넣는다.
import { S, hooks, N, MIN_PER_SEC, TRAITS, JOBS, J, NV, NJ, hourOf, dayOf, fmtClock, fmtT, phaseName,
  aff, byId, knows, newWorld, step, log, diary, rumor, schedParty, endAct, loveTarget } from './sim.js';

const $ = id => document.getElementById(id);

/** 렌더러와 UI 가 함께 보는 화면 상태. */
export const app = {
  sel: null,
  follow: false,
  speed: 1,
  alpha: 0,
  renderer: null,
  /** 주민을 고른다. center 가 참이면 카메라를 그 주민에게 옮긴다. */
  select(v, center) { app.sel = v; updatePanel(); if (center && v) app.renderer.centerOn(v); },
  /** 사용자가 카메라를 직접 움직이면 따라가기를 끈다. */
  stopFollow() { if (app.follow) { app.follow = false; $('followBtn').setAttribute('aria-pressed', 'false'); } },
};

/** 내용이 바뀔 때만 innerHTML 을 바꿔 클릭 중인 링크가 사라지지 않게 한다. */
function setHTML(el, html) { if (el._h !== html) { el.innerHTML = html; el._h = html; } }

/** 선택한 주민이 지금 하는 일을 문장으로 만든다. */
function nowLabel(v) {
  if (v.talk) { const o = v.talk.a === v ? v.talk.b : v.talk.a; const k = v.talk.kind; return k === 'confess' ? (v.talk.a === v ? `${NV(o)}에게 고백하는 중 💌` : `${NJ(o, '가', '이')} 고백하는 중… 😳`) : k === 'date' ? `${NJ(o, '와', '과')} 데이트 중 💕` : v.talk.argue ? `${NJ(o, '와', '과')} 말다툼 중 💢` : `${NJ(o, '와', '과')} 이야기하는 중 💬`; }
  const a = v.act; if (!a) return '뭘 할지 생각하는 중 💭';
  const go = a.phase === 'go';
  switch (a.type) {
    case 'sleep': return go ? '자러 집에 가는 중 🌙' : '집에서 쿨쿨 자는 중 💤';
    case 'rest': return go ? (S.weather.rain ? '비를 피해 집으로 가는 중 ☔' : '쉬러 집에 가는 중 🏠') : (S.weather.rain ? '집에서 빗소리 듣는 중 ☔' : '집에서 뒹구는 중 🏠');
    case 'eat': return a.where === 'bakery' ? (go ? '빵집에 가는 중 🍞' : '빵집에서 빵 먹는 중 🍞') : (go ? '밥 먹으러 집에 가는 중 🍚' : '집에서 밥 먹는 중 🍚');
    case 'work': return go ? `일하러 가는 중 ${JOBS[v.job].e}` : `${JOBS[v.job].label} ${JOBS[v.job].e}`;
    case 'social': return go ? (a.where === 'terrace' ? '주점 앞으로 놀러 가는 중 🍻' : '광장으로 가는 중 👋') : (a.where === 'terrace' ? '주점 앞에서 어울리는 중 🍻' : '광장에서 누군가 기다리는 중 👋');
    case 'visit': return a.kind === 'invite' ? `${NV(a.target)}에게 파티 초대하러 가는 중 💌` : a.kind === 'date' ? `${NJ(a.target, '를', '을')} 만나러 가는 중 💕` : a.kind === 'confess' ? `${NV(a.target)}에게 고백하러 가는 중 💌` : `${NV(a.target)}에게 말 걸러 가는 중 🚶`;
    case 'fun': { const m = { shore: ['호수로 낚시하러 가는 중', '호수에서 낚시하는 중 🎣'], forest: ['숲으로 산책 가는 중', '숲길 산책 중 🌳'], grass: ['꽃 따러 가는 중', '들판에서 꽃 따는 중 🌸'], plaza: ['광장 벤치로 가는 중', '광장 벤치에서 쉬는 중 🪑'] }[a.where]; return go ? m[0] + ' 🚶' : m[1]; }
    case 'wander': return v.trait === '호기심쟁이' ? '여기저기 탐험하는 중 🔍' : '어슬렁거리는 중 🚶';
    case 'nap': return '아무 데서나 낮잠 자는 중 😪';
    case 'party': return go ? '파티에 가는 중 🎉' : '파티에서 신나게 노는 중 🎶';
    case 'hunt': return go ? '보물 찾으러 숲에 가는 중 🗺️' : '숲에서 보물을 찾는 중 🔍';
    case 'raindance': return '빗속에서 춤추는 중 💃';
    case 'flee': return '비명을 지르며 집으로 도망치는 중 😱';
    case 'idle': return '멍하니 서 있는 중 💭';
  }
  return '';
}

/** 네 욕구 평균과 최근 감정으로 기분 이모지를 고른다. */
function moodEmoji(v) { const m = (v.hunger + v.energy + v.social + v.fun) / 4; if (v.bubble && v.bubble.until > S.t && ['💔', '💢', '😱'].includes(v.bubble.e)) return v.bubble.e; return m > 75 ? '😄' : m > 58 ? '🙂' : m > 42 ? '😐' : m > 28 ? '😟' : '😫'; }

/** 선택한 주민 카드와 생각 심기 버튼 상태를 갱신한다. */
function updatePanel() {
  const v = app.sel; if (!v || !S) return;
  app.renderer.drawPortrait($('pAvatar'), v);
  $('pName').textContent = v.name;
  $('pTrait').textContent = `${TRAITS[v.trait].e} ${v.trait}`;
  $('pJob').textContent = `${JOBS[v.job].e} ${v.job}`;
  $('pMood').textContent = moodEmoji(v);
  const mates = v.home.residents.filter(o => o !== v);
  setHTML($('pDesc'), `"${TRAITS[v.trait].desc}" · ${v.home.name}에 ${mates.length ? `${NJ(mates[0], '와', '과')} 함께 ` : ''}산다`);
  setHTML($('pNow'), nowLabel(v));
  for (const [id, val] of [['bHunger', v.hunger], ['bEnergy', v.energy], ['bSocial', v.social], ['bFun', v.fun]]) { const b = $(id); b.style.width = Math.round(val) + '%'; b.classList.toggle('low', val < 25); }
  const others = S.vs.filter(o => o !== v);
  const fr = others.filter(o => aff(v, o) > 15 && o.id !== v.partner).sort((a, b) => aff(v, b) - aff(v, a)).slice(0, 3);
  const en = others.filter(o => aff(v, o) < -25).sort((a, b) => aff(v, a) - aff(v, b)).slice(0, 2);
  const known = S.rumors.filter(r => knows(v, r)).length;
  let rel = `<dt>짝</dt><dd>${v.partner != null ? NV(byId(v.partner)) + ' 💑' : '없음'}</dd>`;
  if (v.crush != null) rel += `<dt>짝사랑</dt><dd>${NV(byId(v.crush))} 💘 <small style="color:var(--muted)">(비밀)</small></dd>`;
  rel += `<dt>친한 이웃</dt><dd>${fr.length ? fr.map(NV).join(', ') : '아직 없음'}</dd>`;
  if (en.length) rel += `<dt>앙숙</dt><dd>${en.map(NV).join(', ')} ⚡</dd>`;
  rel += `<dt>아는 소문</dt><dd>${known}개${v.fearGhost ? ' · 숲이 무섭다 👻' : ''}${v.hunting ? ' · 보물 찾을 생각뿐 🗺️' : ''}</dd>`;
  setHTML($('pRel'), rel);
  setHTML($('pDiary'), v.diary.length ? v.diary.map(d => `<li><time>${fmtClock(d.t)}</time>${d.text}</li>`).join('') : '<li class="empty">아직 쓴 일기가 없다.</li>');
  $('plantWho').textContent = `${v.name}의 마음에`;
  const pb = $('plParty'), lb = $('plLove'), gb = $('plGhost');
  pb.disabled = !!S.party; pb.title = S.party ? '이미 파티가 예정돼 있어요' : '';
  const target = loveTarget(v); lb.disabled = v.partner != null || !target || v.confess != null;
  lb.textContent = v.partner != null ? '💌 짝이 있어서 고백할 사람이 없어요' : target ? `💌 "${J(target.name, '에게', '에게')} 고백하고 싶어"` : '💌 "좋아하는 사람에게 고백하고 싶어"';
  gb.disabled = S.rumors.some(r => r.kind === 'ghost' && r.active && r.juicy > 0.3);
}

/** 도는 소문과 아는 사람 수 막대를 갱신한다. */
function updateRumors() {
  const list = S.rumors.filter(r => r.active && (r.kind === 'party' || r.juicy > 0.15)).slice(0, 6);
  setHTML($('rumorList'), list.length ? list.map(r => { const n = r.knowers.size; return `<li>${r.e} ${r.short}<div class="rb"><i><b style="width:${Math.round(n / N * 100)}%"></b></i><small>${n}/30</small></div></li>`; }).join('') : '<li class="empty">아직 도는 소문이 없다.</li>');
}

/** 화면 왼쪽 위 시계를 갱신한다. */
function updateClock() {
  const h = hourOf(S.t);
  $('clock').innerHTML = `${dayOf(S.t)}일째 ${fmtClock(S.t)} <small>${phaseName(h)} ${S.weather.rain ? '🌧️' : h >= 6 && h < 19 ? '☀️' : '🌙'}</small>`;
}

/** 소식 한 줄을 목록 맨 위에 붙인다. */
function appendFeed(e) {
  const feedEl = $('feed');
  const li = document.createElement('li'); li.className = 'k-' + e.kind;
  li.innerHTML = `<time>${fmtT(e.t)}</time>${e.html}`;
  feedEl.prepend(li); while (feedEl.children.length > 120) feedEl.lastChild.remove();
}

/** 새 마을을 만들고 화면을 다시 준비한다. */
function startWorld(seed) {
  $('feed').innerHTML = '';
  const host = newWorld(seed);
  app.renderer.onWorld();
  $('intro').innerHTML = `주민 30명이 제 성격대로 알아서 사는 작은 마을이에요. 오늘 밤 7시, 파티광 ${NJ(host, '가', '이')} 광장에서 파티를 열고 싶어 해요. 아직 아무도 모르지만요.`;
  app.follow = false; $('followBtn').setAttribute('aria-pressed', 'false');
  app.select(host, false);
  app.renderer.fit();
  updateRumors();
}

/** 생각 심기 기록을 소식에 남긴다. */
function plantLog(v, txt) { log(`🌱 당신이 ${NV(v)}의 마음에 생각 하나를 심었다: ${txt}`, [v], 'plant'); }

/** 생각을 심은 주민이 곧 반응하도록 지금 하던 일을 끝낸다(자는 중·대화 중 제외). */
function nudge(v) { if (!v.talk && v.act && v.act.type !== 'sleep') endAct(v); updatePanel(); }

/** 버튼과 키보드를 연결한다. */
function bindControls() {
  document.querySelector('.side').addEventListener('click', e => { const t = e.target.closest('[data-vid]'); if (t) app.select(byId(+t.dataset.vid), true); });
  $('followBtn').addEventListener('click', () => { app.follow = !app.follow; $('followBtn').setAttribute('aria-pressed', String(app.follow)); if (app.follow) app.renderer.centerOn(app.sel); });
  $('plParty').addEventListener('click', () => { const v = app.sel; if (!v || S.party) return; schedParty(v, true); plantLog(v, '"광장에서 파티를 열고 싶어!"'); nudge(v); });
  $('plLove').addEventListener('click', () => { const v = app.sel; if (!v) return; const t = loveTarget(v); if (!t) return; v.crush = t.id; v.confess = t.id; plantLog(v, `"${J(t.name, '에게', '에게')} 마음을 전하고 싶어."`); diary(v, `${J(t.name, '에게', '에게')} 고백할 거다. 떨린다…`); nudge(v); });
  $('plGhost').addEventListener('click', () => { const v = app.sel; if (!v) return; rumor(v, 'ghost', '숲에 밤마다 유령이 나온대', '👻', 0.9); plantLog(v, '"숲에 밤마다 유령이 나온대!"'); diary(v, '숲에서 유령을 본 것 같다… 👻 다들한테 말해야지'); if (v.trait === '겁쟁이') v.fearGhost = true; nudge(v); updateRumors(); });
  let lastSpeed = 1;
  const setSpeed = s => { app.speed = s; for (const [id, val] of [['sp0', 0], ['sp1', 1], ['sp3', 3], ['sp8', 8]]) $(id).setAttribute('aria-pressed', String(val === s)); };
  $('sp0').addEventListener('click', () => { if (app.speed) lastSpeed = app.speed; setSpeed(0); });
  $('sp1').addEventListener('click', () => setSpeed(1)); $('sp3').addEventListener('click', () => setSpeed(3)); $('sp8').addEventListener('click', () => setSpeed(8));
  $('reset').addEventListener('click', () => startWorld((Math.random() * 1e9) | 0));
  window.addEventListener('keydown', e => { if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); if (app.speed) { lastSpeed = app.speed; setSpeed(0); } else setSpeed(lastSpeed || 1); } });
}

/** 렌더러를 붙이고 마을을 시작한다. 시뮬레이션은 1× 에서 실제 1초에 게임 8분 흐른다. */
export function start(renderer, seed = 20260926) {
  app.renderer = renderer;
  hooks.log = appendFeed;
  hooks.fx = (v, fx) => renderer.fx(v, fx);
  renderer.init(app);
  bindControls();
  startWorld(seed);
  // 개발 확인용: 주소에 ?ff=분 을 붙이면 그만큼 미리 진행한다(아티팩트에서는 쓰이지 않는다).
  const ff = +new URLSearchParams(location.search).get('ff') || 0;
  for (let i = 0; i < ff; i++) step();
  let last = performance.now(), acc = 0, lastUI = 0, lastR = 0;
  /** 한 프레임: 시뮬레이션 진행 → 그리기 → 패널 갱신. */
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (app.speed > 0) { acc += dt * app.speed * MIN_PER_SEC; let n = 0; while (acc >= 1 && n < 200) { step(); acc -= 1; n++; } if (n >= 200) acc = 0; }
    app.alpha = acc;
    const dtA = app.speed > 0 ? dt * (app.speed >= 8 ? 1.6 : app.speed >= 3 ? 1.25 : 1) : 0;
    renderer.frame(now, dt, dtA);
    if (now - lastUI > 250) { lastUI = now; updateClock(); updatePanel(); }
    if (now - lastR > 1000) { lastR = now; updateRumors(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
