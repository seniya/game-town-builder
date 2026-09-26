// 도토리 마을 시뮬레이션 (DOM·렌더러와 무관한 순수 규칙)
// 2D 판(render2d.js)과 3D 판(render3d.js)이 같은 규칙을 공유한다.
/* ================= 기본 도구 ================= */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
let rand = mulberry32(1);
const R = () => rand();
const ri = (a,b) => a + Math.floor(R()*(b-a+1));
const pick = arr => arr[Math.floor(R()*arr.length)];
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const hash = i => { const s=Math.sin(i*12.9898+78.233)*43758.5453; return s-Math.floor(s); };

function hasBatchim(w){const c=w.charCodeAt(w.length-1); if(c<0xAC00||c>0xD7A3) return false; return (c-0xAC00)%28!==0;}
const J = (w,a,b) => w + (hasBatchim(w)?b:a);
const NV = v => `<b class="vn" data-vid="${v.id}">${v.name}</b>`;
const NJ = (v,a,b) => NV(v) + (hasBatchim(v.name)?b:a);

/* ================= 데이터 ================= */
const W=64, H=40, N=30, MIN_PER_SEC=8;
const G={GRASS:0,PATH:1,WATER:2,FOREST:3,BLD:4,DOOR:5,FARM:6,PLAZA:7,SAND:8,FOUNT:9};

const TRAITS = {
  '수다쟁이':{e:'🗣️',desc:'말을 안 하면 병이 난다',talk:2.0,soc:0.14,topics:['🗣️','😂','👀']},
  '게으름뱅이':{e:'😴',desc:'어디서든 잘 수 있다',talk:0.9,soc:0.07,topics:['😪','🛌']},
  '일벌레':{e:'🔨',desc:'쉬는 법을 모른다',talk:0.6,soc:0.05,topics:['📋','💪']},
  '로맨티스트':{e:'💘',desc:'사랑에 너무 쉽게 빠진다',talk:1.3,soc:0.09,topics:['🌹','✨','🌙']},
  '투덜이':{e:'😤',desc:'모든 게 마음에 안 든다',talk:0.9,soc:0.06,topics:['😒','🌧️']},
  '겁쟁이':{e:'😱',desc:'작은 소리에도 기겁한다',talk:0.9,soc:0.08,topics:['😰','👻']},
  '먹보':{e:'🍗',desc:'늘 배가 고프다',talk:1.0,soc:0.08,topics:['🍗','🍰','🍞']},
  '호기심쟁이':{e:'🔍',desc:'안 가 본 곳이 궁금해 못 참는다',talk:1.1,soc:0.07,topics:['🔍','🗺️','🍄']},
  '파티광':{e:'🎉',desc:'모이기만 하면 신난다',talk:1.6,soc:0.11,topics:['🎉','🎶']},
  '외톨이':{e:'🌙',desc:'혼자가 제일 편하다',talk:0.35,soc:0.03,topics:['🌙','📖']},
};
const TRAIT_LIST = Object.keys(TRAITS);
const JOBS = {
  '농부':{e:'🌱',hat:'#E9C46A',hours:[6,15],place:'farm',label:'밭을 가꾸는 중'},
  '제빵사':{e:'🥖',hat:'#FFFFFF',hours:[5,13],place:'bakery',label:'빵을 굽는 중'},
  '어부':{e:'🎣',hat:'#3D6FA8',hours:[6,14],place:'shore',label:'물고기를 낚는 중'},
  '목수':{e:'🔨',hat:'#E07A3F',hours:[8,17],place:'workshop',label:'공방에서 뚝딱뚝딱'},
  '나무꾼':{e:'🪓',hat:'#B83B32',hours:[8,16],place:'forest',label:'숲에서 나무하는 중'},
  '주점 주인':{e:'🍺',hat:'#7B4E9E',hours:[16,24],place:'tavern',label:'주점에서 손님 맞는 중'},
  '한량':{e:'🌼',hat:null,hours:null,place:null,label:''},
};
const JOB_PLAN = ['농부','농부','농부','농부','농부','농부','제빵사','제빵사','어부','어부','어부','어부','목수','목수','목수','나무꾼','나무꾼','나무꾼','주점 주인','한량','한량','한량','한량','한량','한량','한량','한량','한량','한량','한량'];
const NAMES = ['보리','콩이','다온','하루','모모','두부','솔이','누리','가을','봄이','별이','치즈','호두','밤이','토리','단비','새롬','이슬','구름','마루','초코','라온','해님','달래','여름','겨울','나래','은이','푸딩','까미'];
const SKINS=['#FFE3CC','#FAD4B4','#F2C29E','#E2A882','#C88E6A'];
const HAIRS=['#3B2A22','#5E3B26','#9A5B34','#D9A64E','#2E3350','#B8563E','#EDE3D6','#7C5AA6','#E58FA8'];
const STYLES=['short','spiky','buns','long','bowl','pony'];
const ROOFS = ['#E98A7B','#7FA8D6','#E2B85A','#8FBF9A','#B39DDB','#F2A65A','#6FB3B8','#D78FB3'];
const GENERIC_TOPICS = ['🌤️','🍞','🐱','🌻','😂','🍎','🐟','🌧️','🐝','🎵'];
const REACTS = ['😄','😆','🤔','😮','👍','🙂','😂'];
const FINDS = [
  {what:'반짝이는 돌',e:'💎',kind:'find'},
  {what:'네잎클로버',e:'🍀',kind:'find'},
  {what:'오래된 보물 지도',e:'🗺️',kind:'treasure'},
  {what:'엄청 큰 버섯',e:'🍄',kind:'find'},
  {what:'정체 모를 커다란 발자국',e:'🐾',kind:'ghost'},
];

/* ================= 상태 ================= */
export let S = null;
export const tiles = new Uint8Array(W*H);
/** 렌더러·UI 가 끼워 넣는 연결점: log(소식 한 줄), fx(감정 연출) */
export const hooks = { log(){}, fx(){} };

const inb = (x,y) => x>=0&&y>=0&&x<W&&y<H;
const getT = (x,y) => inb(x,y) ? tiles[y*W+x] : G.WATER;
const setT = (x,y,v) => { if(inb(x,y)) tiles[y*W+x]=v; };
const passable = (x,y) => { const t=getT(x,y); return t!==G.WATER && t!==G.BLD && t!==G.FOUNT; };
function tcost(t){ switch(t){ case G.PATH: case G.PLAZA: case G.DOOR: return 1; case G.SAND: return 1.3; case G.GRASS: return 1.8; case G.FARM: return 2; case G.FOREST: return 5; default: return 99; } }

/* ================= 지도 만들기 ================= */
function buildMap(){
  tiles.fill(G.GRASS);
  const blobs=[[7,6,9],[61,4,6],[1,21,3.5],[19,38,4],[63,17,4],[46,1,3]];
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    for(const [bx,by,r] of blobs){ const d=Math.hypot(x-bx,y-by)/r + (R()-0.5)*0.35; if(d<1) setT(x,y,G.FOREST); }
    const e=((x-53)/9)**2+((y-31)/5.5)**2;
    if(e<1) setT(x,y,G.WATER); else if(e<1.45) setT(x,y,G.SAND);
  }
  const hline=(x0,x1,y)=>{for(let x=x0;x<=x1;x++) setT(x,y,G.PATH);};
  const vline=(x,y0,y1)=>{for(let y=y0;y<=y1;y++) setT(x,y,G.PATH);};
  const rect=(x0,y0,w,h,t)=>{for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++) setT(x,y,t);};
  hline(2,61,20); vline(31,2,37); hline(15,50,9); hline(17,43,31);
  rect(4,25,13,11,G.FARM);
  rect(26,13,11,7,G.PLAZA);
  rect(21,21,7,1,G.PLAZA);
  setT(31,16,G.FOUNT);

  S.buildings=[]; S.houses=[];
  const add=(kind,x,y,w,h,side,roof,name)=>{
    for(let yy=y-1;yy<=y+h;yy++) for(let xx=x-1;xx<=x+w;xx++) if(getT(xx,yy)===G.FOREST) setT(xx,yy,G.GRASS);
    rect(x,y,w,h,G.BLD);
    const door={x:x+Math.floor(w/2), y: side==='s'? y+h-1 : y};
    const dir = side==='s'?1:-1;
    setT(door.x,door.y,G.DOOR);
    let oy=door.y+dir, steps=0;
    while(steps<6 && inb(door.x,oy) && getT(door.x,oy)!==G.PATH && getT(door.x,oy)!==G.PLAZA){ setT(door.x,oy,G.PATH); oy+=dir; steps++; }
    const b={kind,x,y,w,h,side,door,roof,name,residents:[],bread:0};
    S.buildings.push(b); if(kind==='house') S.houses.push(b);
    return b;
  };
  let hi=0;
  const house=(x,y,side)=>{ hi++; return add('house',x,y,3,3,side,ROOFS[(hi*3)%ROOFS.length],`${hi}번지`); };
  for(const x of [16,21,26,35,40,45]) house(x,5,'s');
  for(const x of [4,9,14,19]) house(x,16,'s');
  for(const x of [44,49,54,59]) house(x,16,'s');
  for(const x of [4,9,40,46]) house(x,22,'n');
  for(const x of [21,26,34,38]) house(x,32,'n');
  S.bakery = add('bakery',38,15,4,4,'s','#D9956A','빵집');
  S.tavern = add('tavern',21,22,5,3,'n','#8E6E9E','주점');
  S.workshop = add('workshop',34,22,4,3,'n','#9B8B78','공방');

  // 흩어진 나무
  for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){
    if(getT(x,y)!==G.GRASS || R()>0.035) continue;
    let near=false;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ const t=getT(x+dx,y+dy); if(t!==G.GRASS&&t!==G.FOREST) near=true; }
    if(!near) setT(x,y,G.FOREST);
  }

  const L={farm:[],forest:[],shore:[],plaza:[],terrace:[],grass:[],water:[]};
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const t=getT(x,y);
    if(t===G.FARM) L.farm.push({x,y});
    else if(t===G.FOREST) L.forest.push({x,y});
    else if(t===G.GRASS) L.grass.push({x,y});
    else if(t===G.WATER) L.water.push({x,y});
    else if(t===G.PLAZA){ if(y===21) L.terrace.push({x,y}); else if(Math.abs(x-31)+Math.abs(y-16)>1) L.plaza.push({x,y}); }
    else if(t===G.SAND){ if(getT(x+1,y)===G.WATER||getT(x-1,y)===G.WATER||getT(x,y+1)===G.WATER||getT(x,y-1)===G.WATER) L.shore.push({x,y}); }
  }
  L.forestEdge=[];
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const t=getT(x,y); if(t===G.FOREST||!passable(x,y)||t===G.DOOR) continue; if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>getT(x+dx,y+dy)===G.FOREST)) L.forestEdge.push({x,y}); }
  S.L=L;
  S.benches=[{x:27,y:14},{x:35,y:14},{x:27,y:18},{x:35,y:18}];
  // 숲까지의 거리
  const fd=new Uint8Array(W*H).fill(255); const q=[];
  for(const f of L.forest){ fd[f.y*W+f.x]=0; q.push(f.y*W+f.x); }
  for(let qi=0;qi<q.length;qi++){ const c=q[qi], cx=c%W, cy=(c/W)|0;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=cx+dx, ny=cy+dy; if(!inb(nx,ny)) continue; const ni=ny*W+nx; if(fd[ni]>fd[c]+1){ fd[ni]=fd[c]+1; q.push(ni);} } }
  S.forestDist=fd;
  S.lamps=[[26,13],[36,13],[26,19],[36,19],[21,21],[27,21],[30,9],[32,31],[18,19],[44,19],[30,4]];
}

/* ================= 길찾기 ================= */
const DIRS=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.414],[1,-1,1.414],[-1,1,1.414],[-1,-1,1.414]];
function findPath(sx,sy,tx,ty){
  if(!inb(tx,ty)||!passable(tx,ty)) return null;
  if(sx===tx&&sy===ty) return [];
  const NN=W*H, g=new Float32Array(NN).fill(1e9), came=new Int32Array(NN).fill(-1), closed=new Uint8Array(NN);
  const s=sy*W+sx, goal=ty*W+tx, heap=[];
  const oct=(x,y)=>{const dx=Math.abs(x-tx), dy=Math.abs(y-ty); return Math.max(dx,dy)+0.414*Math.min(dx,dy);};
  const push=(f,i)=>{heap.push([f,i]);let k=heap.length-1;while(k>0){const p=(k-1)>>1;if(heap[p][0]<=heap[k][0])break;const t=heap[p];heap[p]=heap[k];heap[k]=t;k=p;}};
  const pop=()=>{const top=heap[0];const last=heap.pop();if(heap.length){heap[0]=last;let k=0;for(;;){const l=2*k+1,r=l+1;let m=k;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===k)break;const t=heap[m];heap[m]=heap[k];heap[k]=t;k=m;}}return top;};
  g[s]=0; push(oct(sx,sy),s);
  while(heap.length){
    const cur=pop()[1]; if(closed[cur]) continue; if(cur===goal) break; closed[cur]=1;
    const cx=cur%W, cy=(cur/W)|0;
    for(const [dx,dy,dc] of DIRS){
      const nx=cx+dx, ny=cy+dy; if(!inb(nx,ny)||!passable(nx,ny)) continue;
      if(dx&&dy&&(!passable(cx+dx,cy)||!passable(cx,cy+dy))) continue;
      const ni=ny*W+nx; if(closed[ni]) continue;
      const ng=g[cur]+dc*tcost(tiles[ni]);
      if(ng<g[ni]){ g[ni]=ng; came[ni]=cur; push(ng+oct(nx,ny),ni); }
    }
  }
  if(came[goal]===-1) return null;
  const path=[]; let c=goal;
  while(c!==s){ path.push({x:c%W,y:(c/W)|0}); c=came[c]; if(c===-1) return null; }
  return path.reverse();
}

/* ================= 시간 ================= */
const dayOf = t => Math.floor(t/1440)+1;
const hourOf = t => (t%1440)/60;
const pad = n => String(n).padStart(2,'0');
const fmtClock = t => `${pad(Math.floor((t%1440)/60))}:${pad(t%60)}`;
const fmtT = t => `${dayOf(t)}일 ${fmtClock(t)}`;
function phaseName(h){ return h<5?'한밤':h<6.5?'새벽':h<11?'아침':h<17?'낮':h<20?'저녁':'밤'; }
function darkness(h){ if(h<5) return .55; if(h<7) return .55*(1-(h-5)/2); if(h<18) return 0; if(h<20.5) return .55*(h-18)/2.5; return .55; }

/* ================= 주민 ================= */
const aff = (a,b) => S.aff[a.id*N+b.id];
const addAff = (a,b,d) => { S.aff[a.id*N+b.id]=clamp(S.aff[a.id*N+b.id]+d,-100,100); };
const byId = id => S.vs[id];
const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
function diary(v,text){ v.diary.unshift({t:S.t,text}); if(v.diary.length>14) v.diary.length=14; }
const EMO_FX={'💘':'heart','💑':'heart','💕':'heart','💖':'heart','💢':'steam','😱':'sweat','💎':'sparkle','🍀':'sparkle','🗺️':'sparkle','🍄':'sparkle','🐾':'sparkle','🌰':'sparkle','🐟':'catch'};
/** 주민 머리 위 감정 말풍선을 띄우고, 렌더러에 연출(하트·김·물고기 등)을 알린다. */
function emote(v,e,dur=25){ v.bubble={e,until:S.t+dur}; const fx=EMO_FX[e]; if(fx&&!v.inside) hooks.fx(v,fx); }
function pairFlag(a,b,k){ const key=`${Math.min(a.id,b.id)}-${Math.max(a.id,b.id)}-${k}`; if(S.flags.has(key)) return true; S.flags.add(key); return false; }

function inSleep(v,h){ const s=v.sleepH, w=v.wakeH; return s<24 ? (h>=s||h<w) : (h>=s-24&&h<w); }
function workHours(v,h){ const j=JOBS[v.job]; if(!j.hours) return false; let [a,b]=j.hours; if(v.trait==='일벌레'){a-=1;b+=2;} if(v.trait==='게으름뱅이') a+=2; return h>=a&&h<b; }
const bakeryOpen = h => h>=6 && h<20;
const fearsForest = v => v.fearGhost;

function makeVillagers(){
  const traits=[]; for(const t of TRAIT_LIST) traits.push(t,t,t);
  const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  shuffle(traits); const jobs=shuffle(JOB_PLAN.slice()); const names=shuffle(NAMES.slice());
  const homes=shuffle(S.houses.slice()).slice(0,15);
  S.vs=[];
  for(let i=0;i<N;i++){
    const home=homes[i>>1]; const tr=traits[i];
    const v={id:i,name:names[i],trait:tr,job:jobs[i],home,
      color:`hsl(${(i*47+ri(0,20))%360} 58% 70%)`,
      x:home.door.x+0.5,y:home.door.y+0.5,px:0,py:0,path:[],pi:0,act:null,inside:home,
      dir:{x:0,y:1},hunger:ri(55,90),energy:ri(70,95),social:ri(40,80),fun:ri(40,80),
      crush:null,partner:null,confess:null,fearGhost:false,hunting:false,
      diary:[],talk:null,nextTalk:0,bubble:null,offx:(R()-0.5)*0.44,offy:(R()-0.5)*0.44,walk:R()*6,
      sleepH: tr==='파티광'?25: tr==='일벌레'?21.5: tr==='게으름뱅이'?22.5: 22+R()*0.8,
      wakeH: tr==='일벌레'?5: tr==='게으름뱅이'?9.5: tr==='파티광'?8.5: 6+R(),
      daily:{},carry:null,catchT:null,
      look:{skin:pick(SKINS),hair:pick(HAIRS),style:pick(STYLES),pants:pick(['#4F5D75','#6B4F3A','#3F6E5A','#7A5C8E','#5B6B8C','#8C5B5B']),umb:pick(['#FF8FA3','#FFD166','#7FD6FF','#B7F07A','#C9B6FF','#FFA36C'])}};
    v.px=v.x; v.py=v.y;
    home.residents.push(v); S.vs.push(v);
  }
  S.aff=new Float32Array(N*N);
  for(const a of S.vs) for(const b of S.vs){ if(a===b) continue; let base=(R()+R()+R()-1.5)*18; if(a.home===b.home) base=22+R()*12; S.aff[a.id*N+b.id]=base; }
  // 처음부터 있는 인연 몇 개
  const free=S.vs.filter(v=>true);
  const [c1,c2]=[free[2],free[9]]; if(c1.home!==c2.home){ c1.partner=c2.id; c2.partner=c1.id; S.aff[c1.id*N+c2.id]=75; S.aff[c2.id*N+c1.id]=72; pairFlag(c1,c2,'couple'); }
  const [e1,e2]=[free[5],free[17]]; S.aff[e1.id*N+e2.id]=-50; S.aff[e2.id*N+e1.id]=-45; pairFlag(e1,e2,'enemy');
  const s1=S.vs.find(v=>v.trait==='로맨티스트'&&v.partner==null), s2=S.vs.find(v=>v!==s1&&v.partner==null&&v.home!==s1.home);
  if(s1&&s2){ s1.crush=s2.id; S.aff[s1.id*N+s2.id]=55; }
}

/* ================= 소문 ================= */
function rumor(origin,kind,short,e,juicy,about=[]){
  const r={id:S.rid++,kind,short,e,juicy,about,knowers:new Set([origin.id]),born:S.t,active:true,half:false,all:false};
  S.rumors.unshift(r); if(S.rumors.length>30) S.rumors.length=30;
  return r;
}
const knows = (v,r) => r.knowers.has(v.id);
function learn(v,r,from){
  r.knowers.add(v.id);
  diary(v,`${J(from.name,'에게서','에게서')} 들었다: "${r.short}"`);
  if(r.kind==='ghost' && v.trait==='겁쟁이' && !v.fearGhost){ v.fearGhost=true; emote(v,'😱',30); log(`😱 겁쟁이 ${NJ(v,'가','이')} 소문을 듣고 새파랗게 질렸다. 이제 숲 근처엔 얼씬도 안 할 거다.`,[v],'funny'); }
  else if(r.kind==='ghost' && R()<0.25) v.fearGhost=true;
  if(r.kind==='treasure' && !v.hunting && (v.trait==='호기심쟁이'?R()<0.8:R()<0.15)){ v.hunting=true; }
  const n=r.knowers.size;
  if(!r.half && n>=N/2){ r.half=true; log(`📣 "${r.short}" 소문이 마을 절반에 퍼졌다.`,[],'rumor'); }
  if(!r.all && n>=N){ r.all=true; log(`📣 이제 온 마을이 안다: "${r.short}"`,[],'rumor'); }
}
function tryShare(sp,ls){
  let best=null,bj=0;
  for(const r of S.rumors){
    if(!r.active||!knows(sp,r)||knows(ls,r)) continue;
    let j=r.juicy; if(r.kind==='party'&&S.party&&S.party.host===sp) j+=3; if(r.about.includes(ls.id)) j-=0.5;
    if(j>bj){bj=j;best=r;}
  }
  if(!best) return null;
  const p = (best.kind==='party'&&S.party&&S.party.host===sp) ? 1 : best.juicy*(sp.trait==='수다쟁이'?1:sp.trait==='외톨이'?0.25:0.55);
  if(R()<p){ learn(ls,best,sp);
    if(best.kind==='party'&&S.party&&S.party.rumor===best&&S.t<S.party.start){ if(S.party.host===sp) log(`💌 ${NJ(sp,'가','이')} ${NJ(ls,'를','을')} 파티에 초대했다.`,[sp,ls],'party'); else if(R()<0.35) log(`🗣️ ${NJ(sp,'가','이')} ${NV(ls)}에게 파티 소식을 전했다.`,[sp,ls],'party'); }
    return best; }
  return null;
}

/* ================= 소식 ================= */
/** 마을 소식 한 줄을 남기고 UI 에 알린다. html 은 NV/NJ 로 만든 이름 링크를 포함할 수 있다. */
function log(html,vs=[],kind=''){
  const e={t:S.t,html,ids:vs.map(v=>v.id),kind};
  S.feed.unshift(e); if(S.feed.length>120) S.feed.length=120;
  hooks.log(e);
}

/* ================= 행동 결정 ================= */
function mk(type,o){ return Object.assign({type,phase:'go',dest:null,bld:null,dur:30,target:null,started:S.t},o); }
const tileOf = v => ({x:Math.floor(v.x),y:Math.floor(v.y)});
const outdoor = v => !v.inside;

function options(v,h){
  const tr=v.trait, rain=S.weather.rain, o=[];
  const hun=1-v.hunger/100, tir=1-v.energy/100, lon=1-v.social/100, bor=1-v.fun/100;
  const sleeping=inSleep(v,h);
  o.push(['sleep', sleeping ? 3+tir*2 : (tir>0.85?2.2:tir*tir*1.1) + (v.fearGhost&&h>=19?1.5:0)]);
  o.push(['eat', Math.pow(hun,1.4)*3.2*(tr==='먹보'?1.7:1) + (tr==='먹보'&&bakeryOpen(h)&&v.hunger<80?0.5:0)]);
  if(!sleeping){
    if(workHours(v,h)) o.push(['work', (tr==='일벌레'?2.4:tr==='게으름뱅이'?0.7:1.5)*(v.energy>15?1:0.2)*(rain&&['farm','shore','forest'].includes(JOBS[v.job].place)?0.6:1)]);
    let soc=lon*2*(tr==='수다쟁이'?1.7:tr==='외톨이'?0.35:1) + (h>=18&&h<23?0.4:0) + (tr==='파티광'&&h>=18?0.8:0);
    if(S.party&&S.party.host===v&&S.t<S.party.start-40) soc+=3.5;
    o.push(['social', soc*(rain?0.45:1)]);
    o.push(['fun', bor*1.6*(rain?0.4:1)]);
    o.push(['wander', (tr==='호기심쟁이'?1.1:0.25)*(rain?0.3:1)]);
    o.push(['rest', rain?1.4:(tr==='외톨이'?0.5:0.15)]);
    if(v.partner!=null){ const p=byId(v.partner); if(outdoor(p)&&!(p.act&&p.act.type==='sleep')) o.push(['date', lon*1.2+(h>=16&&h<21?0.9:0.2)]); }
    if(tr==='게으름뱅이'&&h>=11&&h<17&&!rain) o.push(['nap', 0.35+tir*1.6]);
    if(v.confess!=null) o.push(['confess', 4]);
    if(v.hunting&&!v.fearGhost&&!rain&&h>=7&&h<18) o.push(['hunt', 1.8]);
    if(rain&&tr==='로맨티스트'&&!v.daily.rainDance) o.push(['raindance', 1.6]);
    const P=S.party;
    if(P && S.t>=P.start-40 && S.t<P.end-15){
      if(P.host===v) o.push(['party', 10]);
      else if(knows(v,P.rumor) && S.t>=P.start-15){
        let f={'파티광':2,'수다쟁이':1.4,'외톨이':0.3,'게으름뱅이':0.8,'투덜이':0.7,'겁쟁이':0.9,'로맨티스트':1.2}[tr]||1;
        f*=0.6+0.4*clamp((aff(v,P.host)+50)/100,0,1.5); if(v.energy<25) f*=0.5; if(rain) f*=0.5;
        o.push(['party', 2.6*f]);
      }
    }
  }
  return o;
}

function build(v,type,h){
  const L=S.L;
  switch(type){
    case 'sleep': return mk('sleep',{bld:v.home,dur:720});
    case 'rest': return mk('rest',{bld:v.home,dur:ri(40,90)});
    case 'eat':
      if(bakeryOpen(h)&&S.bakery.bread>0&&(v.trait==='먹보'||R()<0.6)) return mk('eat',{bld:S.bakery,dur:25,where:'bakery'});
      return mk('eat',{bld:v.home,dur:30,where:'home'});
    case 'work': {
      const j=JOBS[v.job], end=(j.hours[1]+(v.trait==='일벌레'?2:0));
      const dur=clamp(Math.round((end-h)*60),30,150);
      if(j.place==='bakery') return mk('work',{bld:S.bakery,dur});
      if(j.place==='workshop') return mk('work',{dest:{x:S.workshop.door.x+ri(-1,1),y:S.workshop.door.y-1},dur});
      if(j.place==='tavern') return mk('work',{bld:S.tavern,dur});
      if(j.place==='farm') return mk('work',{dest:pick(L.farm),dur:Math.min(dur,90)});
      if(j.place==='shore') return mk('work',{dest:pick(L.shore),dur:Math.min(dur,120)});
      if(j.place==='forest'){ if(v.fearGhost){ diary(v,'유령이 무서워서 오늘은 나무하러 못 갔다…'); return mk('rest',{bld:v.home,dur:60}); } return mk('work',{dest:pick(L.forestEdge),dur:Math.min(dur,100)}); }
      return null;
    }
    case 'social': {
      const P=S.party;
      if(P&&P.host===v&&S.t<P.start-40){
        const cand=S.vs.filter(o=>o!==v&&outdoor(o)&&!knows(o,P.rumor)&&!(o.act&&o.act.type==='sleep'));
        if(cand.length){ cand.sort((a,b)=>(dist(v,a)-aff(v,a)*0.1)-(dist(v,b)-aff(v,b)*0.1)); return mk('visit',{target:pick(cand.slice(0,3)),kind:'invite'}); }
      }
      if(R()<0.4){
        const fr=S.vs.filter(o=>o!==v&&outdoor(o)&&aff(v,o)>25&&!(o.act&&o.act.type==='sleep'));
        if(fr.length) return mk('visit',{target:pick(fr),kind:'chat'});
      }
      const night=h>=18||h<1;
      return mk('social',{dest:pick(night?L.terrace:L.plaza),dur:ri(40,90),where:night?'terrace':'plaza'});
    }
    case 'fun': {
      const opts=[['shore',1],['plaza',1],['grass',v.trait==='로맨티스트'?2:0.6],['forest',v.fearGhost?0:1]];
      if(v.trait==='외톨이') opts[0][1]=4;
      let tot=opts.reduce((s,a)=>s+a[1],0), r=R()*tot, w='plaza';
      for(const [k,p] of opts){ if((r-=p)<=0){w=k;break;} }
      return mk('fun',{dest:w==='plaza'?pick(S.benches):w==='forest'?pick(L.forestEdge):pick(L[w]),dur:ri(40,100),where:w});
    }
    case 'wander': {
      const pool=v.fearGhost?[L.grass,L.shore,L.plaza]:[L.grass,L.forestEdge,L.shore,L.plaza];
      return mk('wander',{dest:pick(pick(pool)),dur:ri(10,30)});
    }
    case 'date': { const p=byId(v.partner); return mk('visit',{target:p,kind:'date'}); }
    case 'confess': { const t=byId(v.confess); if(!outdoor(t)) return mk('social',{dest:pick(L.plaza),dur:40,where:'plaza'}); return mk('visit',{target:t,kind:'confess'}); }
    case 'nap': { const tp=tileOf(v); return mk('nap',{dest:tp,dur:ri(50,110)}); }
    case 'hunt': return mk('hunt',{dest:pick(L.forestEdge),dur:40});
    case 'raindance': v.daily.rainDance=true; return mk('raindance',{dest:pick(L.plaza),dur:35});
    case 'party': { const P=S.party; return mk('party',{dest:pick(L.plaza),dur:Math.max(20,P.end-S.t)}); }
  }
  return null;
}

function decide(v){
  const h=hourOf(S.t);
  let best=null, bs=-1;
  for(const [k,s] of options(v,h)){ const sc=s*(0.85+R()*0.3); if(sc>bs){bs=sc;best=k;} }
  const act=build(v,best,h) || mk('wander',{dest:pick(S.L.grass),dur:ri(10,20)});
  startAct(v,act);
}

function startAct(v,act){
  if(act.bld && act.bld===v.inside){ act.phase='do'; act.until=S.t+act.dur; v.act=act; return; }
  if(v.inside){ const b=v.inside; v.inside=null; v.x=v.px=b.door.x+0.5; v.y=v.py=b.door.y+0.5; }
  v.act=act; v.path=[]; v.pi=0;
  if(act.target){ act.repath=0; return; }
  const d=act.bld?act.bld.door:act.dest;
  const p=findPath(Math.floor(v.x),Math.floor(v.y),d.x,d.y);
  if(!p){ v.act=mk('idle',{phase:'do',until:S.t+10}); return; }
  v.path=p;
  if(p.length===0) arrive(v);
}

function arrive(v){
  const a=v.act; const h=hourOf(S.t);
  if(a.bld){ v.inside=a.bld; v.x=v.px=a.bld.door.x+0.5; v.y=v.py=a.bld.door.y+0.5; }
  a.phase='do'; a.until=S.t+a.dur;
  if(!a.bld){ const tx=Math.floor(v.x), ty=Math.floor(v.y);
    const nb=pred=>{ for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if(pred(getT(tx+dx,ty+dy))) return {x:dx,y:dy}; return null; };
    if((a.type==='work'&&v.job==='어부')||(a.type==='fun'&&a.where==='shore')) a.face=nb(t=>t===G.WATER)||{x:1,y:0};
    else if((a.type==='work'&&v.job==='나무꾼')||a.type==='hunt'||(a.type==='fun'&&a.where==='forest')) a.face=nb(t=>t===G.FOREST)||{x:1,y:0};
    else if(a.type==='work'&&v.job==='목수') a.face={x:0,y:1};
    else if(a.type==='work'&&v.job==='농부') a.face={x:R()<0.5?1:-1,y:0};
    else if(a.type==='fun'&&a.where==='plaza') a.face={x:0,y:1};
  }
  switch(a.type){
    case 'eat':
      if(a.where==='bakery'){
        const take = v.trait==='먹보'?3:1; S.bakery.bread=Math.max(0,S.bakery.bread-take);
        diary(v, v.trait==='먹보'?'빵집에서 빵을 세 개나 먹었다 🍞🍞🍞':'빵집에서 갓 구운 빵을 먹었다 🍞'); if(v.trait==='먹보'||R()<0.2) v.carry={item:'bread',until:S.t+a.dur+40};
        if(S.bakery.bread===0&&!S.daily.breadOut){ S.daily.breadOut=true;
          if(v.trait==='먹보'){ log(`🍞 빵집 빵이 동났다! 마지막 빵을 먹은 건 먹보 ${NV(v)}. 제빵사들 표정이 굳었다.`,[v],'funny'); for(const b of S.vs) if(b.job==='제빵사') addAff(b,v,-12); rumor(v,'bread',`${J(v.name,'가','이')} 빵을 싹쓸이했대`,'🍞',0.6,[v.id]); }
          else log(`🍞 빵집 빵이 동났다.`,[],'funny');
        }
      } else diary(v,'집에서 밥을 먹었다 🍚');
      break;
    case 'nap':
      if(!v.daily.napLog){ v.daily.napLog=true; const t=getT(Math.floor(v.x),Math.floor(v.y));
        if(t===G.PATH||t===G.PLAZA) log(`😪 게으름뱅이 ${NJ(v,'가','이')} ${t===G.PLAZA?'광장':'길'} 한복판에 드러누워 낮잠을 잔다.`,[v],'funny'); }
      diary(v,'졸려서 그냥 누웠다 😪'); break;
    case 'raindance': if(!S.weather.rain){ a.until=S.t; break; } log(`💃 로맨티스트 ${NJ(v,'가','이')} 비를 맞으며 광장에서 춤을 춘다.`,[v],'funny'); emote(v,'💃',35); break;
    case 'party': S.party&&S.party.att.add(v.id); break;
    case 'hunt': emote(v,'🔍',40); break;
    case 'wander': case 'fun': {
      if(v.trait==='호기심쟁이'&&R()<0.07){
        const f=pick(FINDS); emote(v,f.e,40);
        log(`${f.e} 호기심쟁이 ${NJ(v,'가','이')} ${J(f.what,'를','을')} 발견했다!`,[v],'find');
        diary(v,`${J(f.what,'를','을')} 찾았다! ${f.e}`);
        if(f.kind==='treasure') rumor(v,'treasure','숲 어딘가에 보물이 묻혀 있대','🗺️',0.8);
        else if(f.kind==='ghost') rumor(v,'ghost','숲에 뭔가 커다란 게 산대','🐾',0.85);
        else rumor(v,'find',`${J(v.name,'가','이')} ${J(f.what,'를','을')} 주웠대`,f.e,0.5,[v.id]);
      }
      break;
    }
  }
}

function doTick(v,a,h){
  switch(a.type){
    case 'sleep': v.energy+=0.24; v.hunger+=0.035; if((!inSleep(v,h)&&v.energy>55)||v.hunger<6){ diary(v, v.trait==='게으름뱅이'&&h>9?'늦잠을 잤다. 개운하다 😌':'잘 잤다 ☀️'); return true; } break;
    case 'rest': v.energy+=0.05; v.fun+=0.06; break;
    case 'eat': v.hunger+=3.2; if(v.hunger>=100) return true; break;
    case 'work':
      if(v.trait==='일벌레') v.fun+=0.06; else v.fun-=0.02;
      v.energy-=0.03;
      if(v.job==='제빵사'&&S.t%10===0) S.bakery.bread+=1;
      if(v.job==='어부'&&S.t%15===0&&R()<0.2){ emote(v,'🐟',12); }
      if(!workHours(v,h)) return true; break;
    case 'fun': v.fun+=0.32;
      if(a.where==='shore'&&S.t%15===0&&R()<0.12){ emote(v,'🐟',15); diary(v,'물고기를 낚았다 🐟'); if(R()<0.08) log(`🐟 ${NJ(v,'가','이')} 호수에서 팔뚝만 한 월척을 낚았다!`,[v],'find'); }
      if(a.where==='grass'&&S.t%20===0) emote(v,'🌸',10);
      if(v.fun>=100) return true; break;
    case 'party': v.fun+=0.3; v.social+=0.12; break;
    case 'nap': v.energy+=0.16; break;
    case 'social': v.fun+=0.03; break;
    case 'raindance': v.fun+=0.5; if(!S.weather.rain) return true; break;
  }
  return S.t>=a.until;
}

function endAct(v){
  const a=v.act;
  if(a&&a.type==='hunt'){
    v.hunting=false;
    if(R()<0.25){ emote(v,'🌰',40); log(`🌰 ${NJ(v,'가','이')} 보물 지도를 따라가 황금 도토리를 파냈다!`,[v],'find'); diary(v,'황금 도토리를 찾았다!!! 🌰'); }
    else diary(v,'보물을 찾아 숲을 헤맸지만 허탕이었다 😔');
  }
  if(a&&a.type==='fun'&&a.where==='grass') v.carry={item:'flower',until:S.t+150};
  v.act=null;
}

/* ================= 이동 ================= */
function stepMove(v){
  if(v.pi>=v.path.length) return true;
  const spd=(v.act&&v.act.type==='flee')?0.42:(v.act&&v.act.target)?0.3:0.2;
  let budget=spd;
  while(budget>0.0001&&v.pi<v.path.length){
    const n=v.path[v.pi], last=v.pi===v.path.length-1;
    const exact=last&&v.act&&v.act.bld;
    const tx=n.x+0.5+(exact?0:v.offx), ty=n.y+0.5+(exact?0:v.offy);
    const dx=tx-v.x, dy=ty-v.y, d=Math.hypot(dx,dy);
    const f=1/(0.55+0.45*tcost(tiles[n.y*W+n.x]));
    if(d>0.001){ v.dir.x=dx/d; v.dir.y=dy/d; }
    if(d<=budget*f){ v.x=tx; v.y=ty; budget-=d/f; v.pi++; }
    else { v.x+=dx/d*budget*f; v.y+=dy/d*budget*f; budget=0; }
  }
  v.walk+=spd*3;
  return v.pi>=v.path.length;
}

function actTick(v,h){
  if(v.talk) return;
  const a=v.act;
  if(!a){ decide(v); return; }
  if(a.target){
    const tg=a.target;
    if(tg.inside||(tg.act&&(tg.act.type==='sleep'||tg.act.type==='flee'))||S.t-a.started>70){ v.act=null; return; }
    if(dist(v,tg)<1.6){ if(!tg.talk){ startConv(v,tg,a.kind); v.act=null; } return; }
    if(S.t>=a.repath||v.pi>=v.path.length){ const p=findPath(Math.floor(v.x),Math.floor(v.y),Math.floor(tg.x),Math.floor(tg.y)); if(!p){v.act=null;return;} v.path=p; v.pi=0; a.repath=S.t+6; }
    stepMove(v); return;
  }
  if(a.phase==='go'){ if(stepMove(v)) arrive(v); return; }
  if(a.phase==='do'){
    if(doTick(v,a,h)||(v.hunger<5&&a.type!=='eat'&&a.type!=='sleep')) endAct(v);
  }
}

/* ================= 대화 ================= */
function compat(a,b){
  let c=0; const A=a.trait,B=b.trait;
  if(A===B) c+=A==='투덜이'?-2:3;
  const P={'수다쟁이|외톨이':-4,'일벌레|게으름뱅이':-4,'파티광|외톨이':-3,'파티광|수다쟁이':3,'호기심쟁이|겁쟁이':-2,'로맨티스트|파티광':2,'게으름뱅이|먹보':2};
  c+=(P[A+'|'+B]||P[B+'|'+A]||0);
  if(A==='투덜이'||B==='투덜이') c-=2;
  if(a.home===b.home) c+=2;
  if(a.job===b.job&&a.job!=='한량') c+=2;
  return c;
}
function topic(v){ const pool=TRAITS[v.trait].topics.concat(GENERIC_TOPICS,[JOBS[v.job].e]); return pick(pool); }

function startConv(a,b,kind){
  const c={a,b,kind,start:S.t,lines:[],argue:false,success:false,r1:null,r2:null};
  if(kind!=='confess'){
    let pa=0.04; if(a.trait==='투덜이'||b.trait==='투덜이') pa+=0.22;
    if((aff(a,b)+aff(b,a))/2<-20) pa+=0.3; if(kind==='date'||kind==='invite') pa*=0.4;
    c.argue=R()<pa;
  }
  if(!c.argue){ c.r1=tryShare(a,b); c.r2=tryShare(b,a); }
  if(kind==='confess'){
    c.success = b.partner==null && (b.crush===a.id || aff(b,a) > 18+R()*40);
    c.lines=[[a,'💌'],[b,'😳'],[a,'💗'],[b,c.success?'💖':'🙇']];
  } else if(c.argue){
    c.topic=topic(a); c.lines=[[a,c.topic],[b,'😤'],[a,'💢'],[b,'💢']];
  } else {
    c.topic=c.r1?c.r1.e:topic(a);
    c.lines=[[a,c.topic],[b,c.r1?'😮':pick(REACTS)],[b,c.r2?c.r2.e:topic(b)],[a,c.r2?'😮':pick(REACTS)]];
    if(kind==='date') c.lines.unshift([a,'💕'],[b,'💕']);
  }
  if(kind==='date'&&a.carry&&a.carry.item==='flower'){ a.carry=null; b.carry={item:'flower',until:S.t+150}; emote(b,'💖',20); diary(a,`${NV(b).replace(/<[^>]+>/g,'')}에게 꽃을 줬다 💐`); diary(b,`${J(a.name,'가','이')} 꽃을 줬다 💐`); log(`💐 ${NJ(a,'가','이')} ${NV(b)}에게 들꽃을 건넸다.`,[a,b],'love'); }
  const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy)||1;
  a.dir={x:dx/d,y:dy/d}; b.dir={x:-dx/d,y:-dy/d};
  c.until=S.t+c.lines.length*3;
  a.talk=b.talk=c; S.convs.push(c);
}

function couple(x,y){
  x.partner=y.id; y.partner=x.id; x.crush=y.crush=null; x.confess=y.confess=null;
  addAff(x,y,15); addAff(y,x,15); pairFlag(x,y,'couple');
  emote(x,'💑',50); emote(y,'💑',50);
  diary(x,`${J(y.name,'와','과')} 사귀기 시작했다 💑`); diary(y,`${J(x.name,'와','과')} 사귀기 시작했다 💑`);
  rumor(x,'love',`${J(x.name,'와','과')} ${J(y.name,'가','이')} 사귄대`,'💑',0.85,[x.id,y.id]);
  for(const z of S.vs){ if(z!==x&&z!==y&&(z.crush===x.id||z.crush===y.id)){ const who=byId(z.crush); z.crush=null; z.confess=null; z.fun-=30; emote(z,'💔',40); diary(z,`${J(who.name,'가','이')} 다른 사람이랑 사귄대… 💔`); log(`💔 ${J(who.name,'를','을')} 몰래 좋아하던 ${NJ(z,'가','이')} 시무룩해졌다.`,[z],'love'); } }
}

function resolveConv(c){
  const {a,b,kind}=c;
  a.talk=b.talk=null;
  const cool=v=>S.t+(v.trait==='수다쟁이'?ri(15,40):ri(30,90));
  a.nextTalk=cool(a); b.nextTalk=cool(b);
  if(kind==='confess'){
    if(c.success){ couple(a,b); log(`💑 ${NJ(a,'가','이')} ${NV(b)}에게 고백했다. 대답은… 좋아! 둘이 사귀기 시작했다.`,[a,b],'love'); }
    else {
      a.crush=null; a.confess=null; a.fun-=40; emote(a,'💔',60); emote(b,'😅',20); addAff(a,b,-5);
      diary(a,`${NV(b).replace(/<[^>]+>/g,'')}에게 고백했다가 차였다… 💔`); diary(b,`${J(a.name,'가','이')} 고백했는데, 거절했다 😅`);
      log(`💔 ${NJ(a,'가','이')} ${NV(b)}에게 고백했다가 정중하게 차였다.`,[a,b],'love');
      rumor(b,'reject',`${J(a.name,'가','이')} ${b.name}에게 차였대`,'💔',0.95,[a.id,b.id]);
    }
    return;
  }
  let d;
  if(c.argue){ d=-(10+R()*10); a.fun-=8; b.fun-=8; emote(a,'💢',20); emote(b,'💢',20); }
  else { d=compat(a,b)+2+R()*6; if(kind==='date') d+=6; }
  addAff(a,b,d*(a.trait==='투덜이'?0.6:1)); addAff(b,a,d*(b.trait==='투덜이'?0.6:1));
  a.social+=a.trait==='외톨이'?12:24; b.social+=b.trait==='외톨이'?12:24; a.fun+=4; b.fun+=4;
  const verb=c.argue?'말다툼을 했다 💢':kind==='date'?'데이트를 했다 💕':`수다를 떨었다 ${c.topic}`;
  diary(a,`${J(b.name,'와','과')} ${verb}`); diary(b,`${J(a.name,'와','과')} ${verb}`);

  const partners=a.partner===b.id;
  if(c.argue){
    if(partners){
      if(aff(a,b)<15||aff(b,a)<15){ a.partner=b.partner=null; log(`💔 ${NJ(a,'와','과')} ${NJ(b,'가','이')} 크게 싸우고 헤어졌다.`,[a,b],'love'); rumor(a,'breakup',`${J(a.name,'와','과')} ${J(b.name,'가','이')} 헤어졌대`,'💔',0.9,[a.id,b.id]); }
      else if(R()<0.5) log(`💢 ${NJ(a,'와','과')} ${NJ(b,'가','이')} 사랑싸움을 했다.`,[a,b],'fight');
    } else if(aff(a,b)<=-40&&aff(b,a)<=-40&&!pairFlag(a,b,'enemy')) log(`⚡ ${NJ(a,'와','과')} ${NV(b)}, 이제 둘은 앙숙이다.`,[a,b],'fight');
    else if(R()<0.3) log(`💢 ${NJ(a,'와','과')} ${NJ(b,'가','이')} ${c.topic} 이야기로 말다툼을 했다.`,[a,b],'fight');
    return;
  }
  if(aff(a,b)>=52&&aff(b,a)>=52&&!partners&&!pairFlag(a,b,'friend')) log(`🤝 ${NJ(a,'와','과')} ${NJ(b,'가','이')} 친구가 됐다.`,[a,b]);
  if(a.crush===b.id&&b.crush===a.id&&a.partner==null&&b.partner==null){ couple(a,b); log(`💑 ${NJ(a,'와','과')} ${NJ(b,'가','이')} 서로 좋아한다는 걸 알게 됐다. 사귀기 시작했다!`,[a,b],'love'); return; }
  for(const [x,y] of [[a,b],[b,a]]){
    if(x.partner!=null||y.partner!=null||x.crush!=null) continue;
    const rom=x.trait==='로맨티스트';
    if(aff(x,y)>=(rom?38:60)&&R()<(rom?0.35:0.08)){
      x.crush=y.id; emote(x,'💘',40); diary(x,`요즘 ${J(y.name,'가','이')} 자꾸 생각난다…`);
      log(`💘 ${NJ(x,'가','이')} ${NJ(y,'를','을')} 좋아하게 된 것 같다.`,[x,y],'love');
      if(rom) x.confess=y.id;
    }
  }
}

function convTick(){
  for(let i=S.convs.length-1;i>=0;i--){
    const c=S.convs[i];
    const idx=Math.floor((S.t-c.start)/3);
    if(S.t>=c.until){ S.convs.splice(i,1); resolveConv(c); continue; }
    const [sp,e]=c.lines[Math.min(idx,c.lines.length-1)];
    c.speaker=sp; if(!sp.bubble||sp.bubble.e!==e||sp.bubble.until<S.t) sp.bubble={e,until:S.t+2}; else sp.bubble.until=S.t+2;
  }
}

function canChat(v){ if(v.inside||v.talk||S.t<v.nextTalk) return false; const a=v.act; if(!a) return true; return !['sleep','nap','flee','rest'].includes(a.type); }
function chatRate(v){ const a=v.act; let r=TRAITS[v.trait].talk; if(a){ if(a.type==='social'||a.type==='party') r*=5; else if(a.type==='work') r*=0.4; else if(a.phase==='go') r*=0.5; } return r; }
function socialTick(){
  const out=S.vs.filter(canChat), used=new Set();
  for(let i=0;i<out.length;i++){ const a=out[i]; if(used.has(a)) continue;
    for(let j=i+1;j<out.length;j++){ const b=out[j]; if(used.has(b)) continue;
      const dx=a.x-b.x, dy=a.y-b.y; if(dx*dx+dy*dy>2.9) continue;
      let p=0.02*chatRate(a)*chatRate(b); if((aff(a,b)+aff(b,a))/2<-30) p*=0.3;
      if(R()<p){ startConv(a,b,'chat'); used.add(a); used.add(b); break; }
    }
  }
}

/* ================= 하루·날씨·파티 ================= */
function schedParty(host,planted){
  const h=hourOf(S.t), day0=Math.floor(S.t/1440);
  const start=(h<17?day0:day0+1)*1440+19*60;
  const r=rumor(host,'party',`${J(host.name,'가','이')} ${h<17?'오늘':'내일'} 밤 7시에 광장에서 파티를 연대`,'🎉',0.9,[host.id]);
  S.party={host,start,end:start+180,rumor:r,att:new Set(),prepLogged:false,startLogged:false};
  if(!planted) log(`🎉 파티광 ${NJ(host,'가','이')} 오늘 밤 7시에 광장에서 파티를 열기로 했다. 아직은 혼자만 아는 계획.`,[host],'party');
  diary(host,'파티를 열 거다! 다들 불러야지 🎉');
}
function morning(){
  S.daily={}; for(const v of S.vs) v.daily={};
  log(`☀️ ${dayOf(S.t)}일째 아침이 밝았다.`,[],'day');
  S.bakery.bread=24;
  for(const r of S.rumors){ if(r.kind!=='party') r.juicy*=0.8; }
  S.rumors=S.rumors.filter(r=>r.kind==='party'?r.active||S.t-r.born<1440:r.juicy>0.15);
  for(const v of S.vs){ if(v.crush!=null&&v.partner==null&&v.confess==null&&R()<0.3){ v.confess=v.crush; diary(v,'오늘은 꼭 마음을 전해야지…'); } }
  if(!S.party){ const hosts=S.vs.filter(v=>v.trait==='파티광'); for(const h of hosts){ if(R()<0.2){ schedParty(h,false); break; } } }
}
function weatherTick(){
  if(S.t%60!==0) return;
  const w=S.weather;
  if(w.rain&&S.t>=w.until){ w.rain=false; log('🌤️ 비가 그쳤다.',[],'weather'); }
  else if(!w.rain&&R()<0.035){ w.rain=true; w.until=S.t+ri(60,180); log('🌧️ 비가 내리기 시작했다. 다들 집으로 뛰어간다.',[],'weather');
    for(const v of S.vs){ if(!v.inside&&!v.talk&&v.act&&['social','fun','wander','idle','nap'].includes(v.act.type)&&R()<0.7) endAct(v); } }
}
function partyTick(){
  const P=S.party; if(!P) return;
  if(!P.prepLogged&&S.t>=P.start-40){ P.prepLogged=true; log(`🏮 ${NJ(P.host,'가','이')} 광장에 등불을 걸며 파티 준비를 한다.`,[P.host],'party'); if(!P.host.talk&&P.host.act&&P.host.act.type!=='party') endAct(P.host); }
  if(!P.startLogged&&S.t>=P.start){ P.startLogged=true; log(`🎉 파티가 시작됐다! 소식을 들은 사람은 ${P.rumor.knowers.size-1}명.`,[P.host],'party');
    for(const v of S.vs){ if(v!==P.host&&knows(v,P.rumor)&&!v.talk&&v.act&&v.act.type!=='sleep'&&v.act.type!=='party'&&R()<0.75) endAct(v); } }
  if(S.t>=P.end){
    const invited=P.rumor.knowers.size-1, came=[...P.att].filter(id=>id!==P.host.id).length;
    log(`🎉 파티가 끝났다. 소식을 들은 ${invited}명 중 ${came}명이 왔다.${came>=invited*0.6&&came>3?' 대성공!':came<=2?' 조금 쓸쓸한 밤이었다.':''}`,[P.host],'party');
    diary(P.host, came>3?`파티에 ${came}명이나 왔다! 최고의 밤 🎉`:`파티에 ${came}명밖에 안 왔다… 🥲`);
    for(const id of P.att){ const v=byId(id); if(v!==P.host){ diary(v,`${P.host.name}네 파티에 다녀왔다 🎉`); addAff(v,P.host,6); } }
    P.rumor.active=false; S.lastParty=P; S.party=null;
  }
}
function needsTick(v,h){
  const T=TRAITS[v.trait]; const asleep=v.act&&v.act.phase==='do'&&(v.act.type==='sleep'||v.act.type==='nap');
  v.hunger-=v.trait==='먹보'?0.11:0.07;
  if(!asleep) v.energy-=0.055;
  v.social-=T.soc; v.fun-=0.045;
  v.hunger=clamp(v.hunger,0,100); v.energy=clamp(v.energy,0,100); v.social=clamp(v.social,0,100); v.fun=clamp(v.fun,0,100);
  if(v.fearGhost&&!v.inside&&!v.talk&&(h>=19||h<5)&&S.forestDist[Math.floor(v.y)*W+Math.floor(v.x)]<=2&&!(v.act&&v.act.type==='flee')){
    emote(v,'😱',30); if(!v.daily.fleeLog){ v.daily.fleeLog=true; log(`😱 ${NJ(v,'가','이')} 어두운 숲 근처에서 비명을 지르며 집으로 달려갔다.`,[v],'funny'); }
    diary(v,'숲에서 무슨 소리가 났다!!! 😱'); v.act=null; startAct(v,mk('flee',{bld:v.home,dur:60}));
  }
}

function step(){
  S.t++;
  const h=hourOf(S.t);
  if(S.t%1440===360) morning();
  weatherTick(); partyTick();
  for(const v of S.vs){ v.px=v.x; v.py=v.y; needsTick(v,h); }
  for(const v of S.vs) actTick(v,h);
  socialTick(); convTick();
}


/* ================= 새 마을 ================= */
/** 시드로 새 마을을 만든다. 첫날 파티 계획까지 심고 파티 주인을 돌려준다. */
function newWorld(seed){
  rand=mulberry32(seed);
  S={t:7*60,rid:0,rumors:[],convs:[],feed:[],flags:new Set(),weather:{rain:false,until:0},party:null,lastParty:null,daily:{},seed};
  buildMap(); makeVillagers();
  S.bakery.bread=24;
  const host=S.vs.find(v=>v.trait==='파티광');
  log(`☀️ 1일째 아침. 도토리 마을에 해가 떴다.`,[],'day');
  const c=S.vs.find(v=>v.partner!=null); if(c) log(`💑 ${NJ(c,'와','과')} ${NV(byId(c.partner))}, 마을이 다 아는 커플.`,[c,byId(c.partner)],'love');
  const cr=S.vs.find(v=>v.crush!=null); if(cr) log(`💘 로맨티스트 ${NJ(cr,'는','은')} ${NV(byId(cr.crush))}에게 마음이 있다. 본인만 안다고 생각하지만.`,[cr,byId(cr.crush)],'love');
  schedParty(host,false);
  for(const v of S.vs) v.act=null;
  return host;
}
/** 고백 상대 후보: 짝사랑 상대, 없으면 가장 호감 가는 짝 없는 이웃. */
function loveTarget(v){ if(v.crush!=null) return byId(v.crush); const c=S.vs.filter(o=>o!==v&&o.partner==null).sort((a,b)=>aff(v,b)-aff(v,a)); return c[0]||null; }

export { W,H,N,G,MIN_PER_SEC,TRAITS,JOBS,clamp,hash,J,NV,NJ,getT,passable,
  hourOf,dayOf,fmtClock,fmtT,phaseName,darkness,aff,byId,knows,inSleep,bakeryOpen,
  newWorld,step,log,diary,rumor,schedParty,endAct,loveTarget };

