// 오른쪽 패널과 위 HUD: 주민 카드, 생각 심기 버튼 상태, 도는 소문, 마을 소식, 시계, 마을 통계, 목표.
import { ARRIVAL } from '../data/balance';
import { GOALS, RANKS, type GoalDef } from '../data/goals';
import { JOBS, TRAITS } from '../data/people';
import { loveTarget } from '../sim/commands';
import { convById, knows } from '../sim/social';
import { J, NJ, NV, dayOf, fmtClock, fmtT, hourOf, phaseName } from '../sim/text';
import type { FeedEntry, Villager, World } from '../sim/types';
import { aff, vil } from '../sim/world';

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el;
};

/** 내용이 바뀔 때만 innerHTML 을 바꿔 누르는 중인 링크가 사라지지 않게 한다. */
function setHTML(el: HTMLElement, html: string): void {
  if (el.dataset.h !== html) {
    el.innerHTML = html;
    el.dataset.h = html;
  }
}

/** 지금 하는 일을 문장으로. */
export function nowLabel(w: World, v: Villager): string {
  const conv = convById(w, v.talk);
  if (conv) {
    const o = vil(w, conv.a === v.id ? conv.b : conv.a);
    if (conv.kind === 'confess')
      return conv.a === v.id
        ? `${NV(o)}에게 고백하는 중 💌`
        : `${NJ(o, '가', '이')} 고백하는 중… 😳`;
    if (conv.kind === 'date') return `${NJ(o, '와', '과')} 데이트 중 💕`;
    if (conv.kind === 'welcome')
      return conv.a === v.id
        ? `새로 온 ${NV(o)}에게 인사하는 중 👋`
        : `${NJ(o, '가', '이')} 인사하러 왔다 👋`;
    return conv.argue
      ? `${NJ(o, '와', '과')} 말다툼 중 💢`
      : `${NJ(o, '와', '과')} 이야기하는 중 💬`;
  }
  const a = v.act;
  if (!a) return '뭘 할지 생각하는 중 💭';
  const go = a.phase === 'go';
  const rain = w.weather.rain;
  switch (a.type) {
    case 'sleep':
      return go ? '자러 집에 가는 중 🌙' : '집에서 쿨쿨 자는 중 💤';
    case 'rest':
      return go
        ? rain
          ? '비를 피해 집으로 가는 중 ☔'
          : '쉬러 집에 가는 중 🏠'
        : rain
          ? '집에서 빗소리 듣는 중 ☔'
          : '집에서 뒹구는 중 🏠';
    case 'eat':
      return a.where === 'bakery'
        ? go
          ? '빵집에 가는 중 🍞'
          : '빵집에서 빵 먹는 중 🍞'
        : go
          ? '밥 먹으러 집에 가는 중 🍚'
          : '집에서 밥 먹는 중 🍚';
    case 'work':
      return go
        ? `일하러 가는 중 ${JOBS[v.job].e}`
        : `${JOBS[v.job].label} ${JOBS[v.job].e}${v.pack?.kind === 'lumber' ? ` (목재 ${v.pack.n})` : ''}`;
    case 'social':
      return a.where === 'terrace'
        ? go
          ? '주점 앞으로 놀러 가는 중 🍻'
          : '주점 앞에서 어울리는 중 🍻'
        : a.where === 'lamp'
          ? go
            ? '등불 밑으로 가는 중 🏮'
            : '등불 아래에서 수다 떠는 중 🏮'
          : go
            ? '광장으로 가는 중 👋'
            : '광장에서 누군가 기다리는 중 👋';
    case 'visit': {
      const t = a.target != null ? vil(w, a.target) : null;
      if (!t) return '누군가를 찾는 중 🚶';
      return a.kind === 'invite'
        ? `${NV(t)}에게 파티 초대하러 가는 중 💌`
        : a.kind === 'date'
          ? `${NJ(t, '를', '을')} 만나러 가는 중 💕`
          : a.kind === 'confess'
            ? `${NV(t)}에게 고백하러 가는 중 💌`
            : a.kind === 'welcome'
              ? `새로 온 ${NV(t)}에게 인사하러 가는 중 👋`
              : `${NV(t)}에게 말 걸러 가는 중 🚶`;
    }
    case 'fun': {
      const m: Record<string, [string, string]> = {
        shore: ['호수로 낚시하러 가는 중', '호수에서 낚시하는 중 🎣'],
        forest: ['숲으로 산책 가는 중', '숲길 산책 중 🌳'],
        grass: ['꽃 따러 가는 중', '들판에서 꽃 따는 중 🌸'],
        flower: ['꽃밭으로 가는 중', '꽃밭을 거니는 중 🌷'],
        bench: ['벤치로 가는 중', '벤치에 앉아 쉬는 중 🪑'],
        plaza: ['광장 벤치로 가는 중', '광장 벤치에서 쉬는 중 🪑'],
      };
      const e = m[a.where ?? 'bench'] ?? ['놀러 가는 중', '노는 중'];
      return go ? `${e[0]} 🚶` : e[1];
    }
    case 'wander':
      return v.trait === '호기심쟁이' ? '여기저기 탐험하는 중 🔍' : '어슬렁거리는 중 🚶';
    case 'nap':
      return '아무 데서나 낮잠 자는 중 😪';
    case 'party':
      return go ? '파티에 가는 중 🎉' : '파티에서 신나게 노는 중 🎶';
    case 'hunt':
      return go ? '보물 찾으러 숲에 가는 중 🗺️' : '숲에서 보물을 찾는 중 🔍';
    case 'raindance':
      return '빗속에서 춤추는 중 💃';
    case 'flee':
      return '비명을 지르며 집으로 도망치는 중 😱';
    case 'idle':
      return '멍하니 서 있는 중 💭';
    case 'haul':
      return `야적장에 목재 ${v.pack?.n ?? 0}개를 나르는 중 🪵`;
    case 'fetch':
      return '공사에 쓸 목재를 가지러 가는 중 🪵';
    case 'deliver':
      return `공사장에 목재 ${v.pack?.n ?? 0}개를 나르는 중 🪵`;
    case 'build':
      return go ? '공사장으로 가는 중 🔨' : '뚝딱뚝딱 짓는 중 🔨';
    case 'movein':
      return '짐을 지고 새 집으로 가는 중 🧳';
  }
  return '';
}

/** 네 욕구 평균과 최근 감정으로 기분 이모지. */
function moodEmoji(w: World, v: Villager): string {
  const m = (v.hunger + v.energy + v.social + v.fun) / 4;
  if (v.bubble && v.bubble.until > w.t && ['💔', '💢', '😱'].includes(v.bubble.e))
    return v.bubble.e;
  return m > 75 ? '😄' : m > 58 ? '🙂' : m > 42 ? '😐' : m > 28 ? '😟' : '😫';
}

/** 주민 카드와 생각 심기 버튼 상태. */
export function updatePerson(
  w: World,
  v: Villager | null,
  drawPortrait: (c: HTMLCanvasElement, v: Villager) => void,
): void {
  if (!v) return;
  drawPortrait($('pAvatar') as HTMLCanvasElement, v);
  $('pName').textContent = v.name;
  $('pTrait').textContent = `${TRAITS[v.trait].e} ${v.trait}`;
  $('pJob').textContent = `${JOBS[v.job].e} ${v.job}`;
  $('pMood').textContent = moodEmoji(w, v);
  const home = w.bmap.get(v.home);
  const mates = home ? home.residents.filter((id) => id !== v.id).map((id) => vil(w, id)) : [];
  const since = v.arrivedAt > 7 * 60 ? ` · ${dayOf(v.arrivedAt)}일째에 이사 왔다` : '';
  setHTML(
    $('pDesc'),
    `"${TRAITS[v.trait].desc}" · ${home?.name ?? '집'}에 ${mates[0] ? `${NJ(mates[0], '와', '과')} 함께 ` : ''}산다${since}`,
  );
  setHTML($('pNow'), nowLabel(w, v));
  for (const [id, val] of [
    ['bHunger', v.hunger],
    ['bEnergy', v.energy],
    ['bSocial', v.social],
    ['bFun', v.fun],
  ] as const) {
    const b = $(id);
    b.style.width = `${Math.round(val)}%`;
    b.classList.toggle('low', val < 25);
  }
  const others = w.vs.filter((o) => o !== v);
  const fr = others
    .filter((o) => aff(w, v, o) > 15 && o.id !== v.partner)
    .sort((a, b) => aff(w, v, b) - aff(w, v, a))
    .slice(0, 3);
  const en = others
    .filter((o) => aff(w, v, o) < -25)
    .sort((a, b) => aff(w, v, a) - aff(w, v, b))
    .slice(0, 2);
  const known = w.rumors.filter((r) => knows(v, r)).length;
  let rel = `<dt>짝</dt><dd>${v.partner != null ? `${NV(vil(w, v.partner))} 💑` : '없음'}</dd>`;
  if (v.crush != null)
    rel += `<dt>짝사랑</dt><dd>${NV(vil(w, v.crush))} 💘 <small style="color:var(--muted)">(비밀)</small></dd>`;
  rel += `<dt>친한 이웃</dt><dd>${fr.length ? fr.map(NV).join(', ') : '아직 없음'}</dd>`;
  if (en.length) rel += `<dt>앙숙</dt><dd>${en.map(NV).join(', ')} ⚡</dd>`;
  rel += `<dt>아는 소문</dt><dd>${known}개${v.fearGhost ? ' · 숲이 무섭다 👻' : ''}${v.hunting ? ' · 보물 찾을 생각뿐 🗺️' : ''}</dd>`;
  setHTML($('pRel'), rel);
  setHTML(
    $('pDiary'),
    v.diary.length
      ? v.diary.map((d) => `<li><time>${fmtClock(d.t)}</time>${d.text}</li>`).join('')
      : '<li class="empty">아직 쓴 일기가 없다.</li>',
  );
  $('plantWho').textContent = `${v.name}의 마음에`;
  const pb = $('plParty') as HTMLButtonElement;
  const lb = $('plLove') as HTMLButtonElement;
  const gb = $('plGhost') as HTMLButtonElement;
  pb.disabled = !!w.party;
  pb.title = w.party ? '이미 파티가 예정돼 있어요' : '';
  const target = loveTarget(w, v);
  lb.disabled = v.partner != null || !target || v.confess != null;
  lb.textContent =
    v.partner != null
      ? '💌 짝이 있어서 고백할 사람이 없어요'
      : target
        ? `💌 "${J(target.name, '에게', '에게')} 고백하고 싶어"`
        : '💌 "좋아하는 사람에게 고백하고 싶어"';
  gb.disabled = w.rumors.some((r) => r.kind === 'ghost' && r.active && r.juicy > 0.3);
}

/** 도는 소문. */
export function updateRumors(w: World): void {
  const N = w.vs.length;
  $('rumorHead').textContent = `아는 사람 / ${N}`;
  const list = w.rumors
    .filter((r) => r.active && (r.kind === 'party' || r.juicy > 0.15))
    .slice(0, 6);
  setHTML(
    $('rumorList'),
    list.length
      ? list
          .map((r) => {
            const n = r.knowers.size;
            return `<li>${r.e} ${r.short}<div class="rb"><i><b style="width:${Math.round((n / N) * 100)}%"></b></i><small>${n}/${N}</small></div></li>`;
          })
          .join('')
      : '<li class="empty">아직 도는 소문이 없다.</li>',
  );
}

/** 시계. */
export function updateClock(w: World): void {
  const h = hourOf(w.t);
  $('clock').innerHTML =
    `${dayOf(w.t)}일째 ${fmtClock(w.t)} <small>${phaseName(h)} ${w.weather.rain ? '🌧️' : h >= 6 && h < 19 ? '☀️' : '🌙'}</small>`;
}

/** 목표 판정에 쓰는 값. */
function goalValue(w: World, stat: GoalDef['stat']): number {
  switch (stat) {
    case 'playerHouses':
      return w.buildings.filter((b) => b.kind === 'house' && b.playerBuilt).length;
    case 'arrivals':
      return w.vs.filter((v) => v.arrivedAt > 7 * 60).length;
    case 'flowerbeds':
      return w.decor.filter((d) => d.kind === 'flowerbed' && d.playerBuilt).length;
    case 'benches':
      return w.decor.filter((d) => d.kind === 'bench' && d.playerBuilt && d.firstUse != null)
        .length;
    case 'pop':
      return w.vs.length;
    case 'charm':
      return w.stats.charm;
    case 'couples':
      return w.vs.filter((v) => v.partner != null).length / 2;
  }
}

/** 위 HUD 의 마을 통계와 마을 카드(이름 등급·목표 세 개). */
export function updateStats(w: World): void {
  const s = w.stats;
  const needCharm = Math.ceil(s.pop * ARRIVAL.charmPerResident);
  const vacant = s.beds - s.pop;
  const charmLow = vacant > 0 && s.charm < needCharm;
  const happyLow = vacant > 0 && s.happy < ARRIVAL.minHappiness;
  setHTML(
    $('stats'),
    [
      `<span class="stat" title="주민 / 잘 자리">👥<b>${s.pop}</b>/${s.beds}</span>`,
      `<span class="stat${happyLow ? ' warn' : ''}" title="마을 행복(이사 조건 ${ARRIVAL.minHappiness} 이상)">😊<b>${s.happy}</b></span>`,
      `<span class="stat${charmLow ? ' warn' : ''}" title="마을 매력(이사 조건: 주민 수 × ${ARRIVAL.charmPerResident} = ${needCharm})">🌷<b>${s.charm}</b>/${needCharm}</span>`,
      `<span class="stat" title="야적장 목재">🪵<b>${w.lumber}</b></span>`,
      s.sites ? `<span class="stat" title="공사 중">🔨<b>${s.sites}</b></span>` : '',
    ].join(''),
  );
  const rank = RANKS.find(([n]) => s.pop < n)?.[1] ?? '';
  $('villageRank').textContent = `${rank} · 주민 ${s.pop}명`;
  const open = GOALS.filter((g) => goalValue(w, g.stat) < g.target).slice(0, 3);
  const hint =
    vacant > 0
      ? charmLow
        ? '빈 집이 있지만 매력이 모자라요. 꽃밭·벤치를 놓아 보세요.'
        : happyLow
          ? '빈 집이 있지만 주민들이 지쳐 있어요.'
          : '빈 집이 있어요. 아침 9시나 오후 3시에 누군가 이사 올지도 몰라요.'
      : '빈 집이 없어요. 집을 지으면 새 주민이 이사 와요.';
  setHTML(
    $('goals'),
    `<p class="goal"><small>${hint}</small></p>` +
      open
        .map((g) => {
          const v = Math.min(g.target, Math.floor(goalValue(w, g.stat) * 10) / 10);
          return `<p class="goal">${g.label} <small>${v}/${g.target}</small></p>`;
        })
        .join(''),
  );
}

/** 소식 한 줄을 목록 맨 위에 붙인다. */
export function appendFeed(e: FeedEntry): void {
  const feedEl = $('feed');
  const li = document.createElement('li');
  li.className = `k-${e.kind}`;
  li.innerHTML = `<time>${fmtT(e.t)}</time>${e.html}`;
  feedEl.prepend(li);
  while (feedEl.children.length > 120) feedEl.lastChild?.remove();
}

/** 소식 목록을 World 의 소식으로 다시 채운다(새 마을·불러오기). */
export function resetFeed(w: World): void {
  $('feed').innerHTML = '';
  for (const e of [...w.feed].reverse()) appendFeed(e);
}
