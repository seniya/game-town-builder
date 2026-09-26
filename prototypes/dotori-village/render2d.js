// 도토리 마을 2D 렌더러: 위에서 내려다본 지도 + 코드로 그린 머리 큰 캐릭터와 행동 동작.
import { S, W, H, G, JOBS, getT, hash, clamp, hourOf, darkness, bakeryOpen } from './sim.js';

const TS = 24;   // 정적 지형 캔버스의 타일 한 칸 픽셀
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
let staticCanvas = null;

/* ================= 그리기: 정적 지형 ================= */
/** 지형·건물·나무를 한 장의 캔버스로 미리 그린다. */
function renderStatic(){
  const c=document.createElement('canvas'); c.width=W*TS; c.height=H*TS; const g=c.getContext('2d');
  g.fillStyle='#9fd081'; g.fillRect(0,0,c.width,c.height);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const k=hash(x*131+y*7); g.fillStyle=k<0.33?'rgba(255,255,220,0.10)':k<0.66?'rgba(40,90,30,0.06)':'rgba(0,0,0,0)'; g.fillRect(x*TS,y*TS,TS,TS);
    if(getT(x,y)===G.GRASS&&hash(x*17+y*91)<0.25){ g.strokeStyle='rgba(60,120,50,0.35)'; g.lineWidth=1.4; const cx=x*TS+hash(x+y*3)*TS, cy=y*TS+hash(x*5+y)*TS; g.beginPath(); g.moveTo(cx-3,cy-4); g.lineTo(cx,cy); g.lineTo(cx+3,cy-4); g.stroke(); }
  }
  for(const f of S.L.farm){ const X=f.x*TS,Y=f.y*TS; g.fillStyle='#bb8d5f'; g.fillRect(X,Y,TS,TS); g.fillStyle='#a47449'; g.fillRect(X,Y+TS*0.58,TS,TS*0.2);
    for(let i=0;i<3;i++){ if(hash(f.x*9+f.y*13+i)<0.75){ g.fillStyle=hash(f.x+i*3+f.y)<0.5?'#6fb35a':'#86c265'; g.beginPath(); g.arc(X+TS*(0.2+i*0.3),Y+TS*0.45,TS*0.12,0,7); g.fill(); } } }
  const circ=(x,y,r,col)=>{g.fillStyle=col;g.beginPath();g.arc(x,y,r,0,7);g.fill();};
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const t=getT(x,y); if(t===G.SAND||t===G.WATER) circ((x+.5)*TS,(y+.5)*TS,TS*0.85,'#f0dcaa'); }
  for(const w of S.L.water) circ((w.x+.5)*TS,(w.y+.5)*TS,TS*0.78,'#79c0e0');
  for(const w of S.L.water){ let deep=true; for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) if(getT(w.x+dx,w.y+dy)!==G.WATER) deep=false; if(deep) circ((w.x+.5)*TS,(w.y+.5)*TS,TS*0.8,'#62b0d6'); }
  // 길: 둥근 이음
  const isRoad=(x,y)=>{const t=getT(x,y);return t===G.PATH;};
  g.fillStyle='#e9d4a3';
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){ if(!isRoad(x,y)) continue; const cx=(x+.5)*TS, cy=(y+.5)*TS;
    g.beginPath(); g.arc(cx,cy,TS*0.52,0,7); g.fill();
    for(const [dx,dy] of [[1,0],[0,1]]){ const t=getT(x+dx,y+dy); if(t===G.PATH||t===G.PLAZA){ if(dx) g.fillRect(cx,cy-TS*0.52,TS,TS*1.04); else g.fillRect(cx-TS*0.52,cy,TS*1.04,TS); } } }
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){ if(isRoad(x,y)&&hash(x*7+y*29)<0.4){ g.fillStyle='rgba(150,120,70,0.25)'; g.beginPath(); g.arc(x*TS+hash(x+y)*TS,y*TS+hash(y*3+x)*TS,1.6,0,7); g.fill(); } }
  // 광장
  const rr=(x,y,w,h,r)=>{g.beginPath();g.roundRect(x,y,w,h,r);};
  g.fillStyle='#ecdfc6'; rr(26*TS+2,13*TS+2,11*TS-4,7*TS-4,TS*0.8); g.fill();
  g.strokeStyle='#d6c4a1'; g.lineWidth=3; g.stroke();
  g.strokeStyle='rgba(120,90,50,0.08)'; g.lineWidth=1;
  for(let x=27;x<37;x++){ g.beginPath(); g.moveTo(x*TS,13*TS+6); g.lineTo(x*TS,20*TS-6); g.stroke(); }
  for(let y=14;y<20;y++){ g.beginPath(); g.moveTo(26*TS+6,y*TS); g.lineTo(37*TS-6,y*TS); g.stroke(); }
  g.fillStyle='#dcc19a'; rr(21*TS,21*TS+2,7*TS,TS-4,6); g.fill();
  g.strokeStyle='rgba(120,80,40,0.2)'; for(let x=21;x<28;x++){ g.beginPath(); g.moveTo(x*TS+TS/2,21*TS+3); g.lineTo(x*TS+TS/2,22*TS-3); g.stroke(); }
  // 분수
  circ(31.5*TS,16.5*TS,TS*1.05,'#cbbfa9'); circ(31.5*TS,16.5*TS,TS*0.8,'#8fd0ea'); circ(31.5*TS,16.5*TS,TS*0.22,'#cbbfa9');
  // 벤치·화단
  for(const [bx,by] of [[27,14],[35,14],[27,18],[35,18]]){ g.fillStyle='#a8764b'; rr(bx*TS+3,by*TS+TS*0.35,TS-6,TS*0.3,3); g.fill(); }
  for(const [fx,fy] of [[28.5,13.4],[33.5,13.4],[28.5,19.1],[33.5,19.1]]){ circ(fx*TS,fy*TS,TS*0.35,'#6fae5a'); for(let i=0;i<4;i++) circ(fx*TS+Math.cos(i*1.6)*TS*0.18,fy*TS+Math.sin(i*1.6)*TS*0.18,TS*0.09,['#f28db2','#ffd166','#fff','#f28db2'][i]); }
  // 꽃
  for(const t of S.L.grass){ if(hash(t.x*3+t.y*57)<0.07){ const cols=['#f7a1c4','#ffe08a','#ffffff','#c9b6ff']; for(let i=0;i<3;i++) circ(t.x*TS+hash(t.x+i)*TS,t.y*TS+hash(t.y+i*7)*TS,2.2,cols[(t.x+i)%4]); } }
  // 가로등 기둥
  for(const [lx,ly] of S.lamps){ circ((lx+.5)*TS,(ly+.5)*TS,TS*0.16,'#5b4a3a'); circ((lx+.5)*TS,(ly+.5)*TS,TS*0.1,'#f6e3a8'); }
  // 건물과 나무를 y 순서로
  const items=[];
  for(const b of S.buildings) items.push({y:b.y+b.h,b});
  for(const f of S.L.forest) items.push({y:f.y+1,f});
  items.sort((a,b)=>a.y-b.y);
  for(const it of items){
    if(it.b){ const b=it.b, X=b.x*TS, Y=b.y*TS, Wd=b.w*TS, Hd=b.h*TS;
      g.fillStyle='rgba(30,50,20,0.18)'; rr(X+4,Y+7,Wd,Hd,8); g.fill();
      g.fillStyle='#f5e8d4'; rr(X+2,Y+2,Wd-4,Hd-4,8); g.fill(); g.strokeStyle='#cdb694'; g.lineWidth=2; g.stroke();
      // 창문(문 쪽 벽)
      const wy = b.side==='s'? Y+Hd-TS*0.42 : Y+TS*0.14;
      g.fillStyle='#8fb3c9'; for(const ox of [-1,1]){ const wx=(b.door.x+ox)*TS; if(wx>=X&&wx<X+Wd) { rr(wx+TS*0.3,wy,TS*0.4,TS*0.28,2); g.fill(); } }
      // 지붕
      const inset=TS*0.18, ry = b.side==='s'? Y+inset*0.6 : Y+TS*0.5, rh = Hd-TS*0.5-inset*0.6;
      g.fillStyle=b.roof; rr(X+inset*0.5,ry,Wd-inset,rh,10); g.fill();
      g.fillStyle='rgba(255,255,255,0.18)'; rr(X+inset*0.5,ry,Wd-inset,rh/2,10); g.fill();
      g.strokeStyle='rgba(0,0,0,0.15)'; g.lineWidth=2; g.beginPath(); g.moveTo(X+inset+4,ry+rh/2); g.lineTo(X+Wd-inset-4,ry+rh/2); g.stroke();
      g.fillStyle='#8a6a55'; g.fillRect(X+Wd-TS*0.8,ry+4,TS*0.28,TS*0.36);
      // 문
      g.fillStyle='#8a5a3b'; const dx=b.door.x*TS; if(b.side==='s') rr(dx+TS*0.28,Y+Hd-TS*0.36,TS*0.44,TS*0.34,3); else rr(dx+TS*0.28,Y+2,TS*0.44,TS*0.34,3); g.fill();
      if(b.kind!=='house'){ g.font=`${TS*1.1}px system-ui, "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; g.textAlign='center'; g.textBaseline='middle'; g.fillText({bakery:'🍞',tavern:'🍺',workshop:'🔨'}[b.kind],X+Wd/2,ry+rh/2); }
    } else { const f=it.f, cx=(f.x+.5)*TS, cy=(f.y+.5)*TS, s=0.55+hash(f.x*3+f.y*11)*0.25;
      g.fillStyle='rgba(20,50,20,0.22)'; g.beginPath(); g.ellipse(cx+3,cy+TS*0.3,TS*s,TS*s*0.6,0,0,7); g.fill();
      const cols=['#4e9a5b','#5aa864','#468c53','#63ad63'];
      circ(cx,cy-TS*0.1,TS*s,cols[(f.x*7+f.y)%4]);
      circ(cx-TS*s*0.3,cy-TS*s*0.4,TS*s*0.45,'rgba(255,255,255,0.13)');
      if(hash(f.x*5+f.y*3)<0.12) circ(cx+TS*0.2,cy-TS*0.05,TS*0.08,'#e8574a');
    }
  }
  return c;
}

/* ================= 카메라·입력 ================= */
let cv=null, ctx=null, stage=null, app=null;
let cw=800,ch=500,dpr=1;
const cam={x:W/2,y:H/2,z:12}; let fitZ=12;
function resize(){
  const r=stage.getBoundingClientRect(); cw=Math.max(1,r.width); ch=Math.max(1,r.height); dpr=Math.min(2,window.devicePixelRatio||1);
  cv.width=Math.round(cw*dpr); cv.height=Math.round(ch*dpr);
  fitZ=Math.min(cw/W,ch/H); if(cam.z<fitZ*0.9) cam.z=fitZ; clampCam();
}
function fitCamera(initial){
  resize();
  cam.z=Math.max(fitZ,28); cam.x=31.5; cam.y=17.5;
  clampCam();
}
function clampCam(){
  cam.z=clamp(cam.z,fitZ*0.9,48);
  const hw=cw/2/cam.z, hh=ch/2/cam.z;
  cam.x = hw*2>=W ? W/2 : clamp(cam.x,hw,W-hw);
  cam.y = hh*2>=H ? H/2 : clamp(cam.y,hh,H-hh);
}
const toScreen=(wx,wy)=>[(wx-cam.x)*cam.z+cw/2,(wy-cam.y)*cam.z+ch/2];
const toWorld=(sx,sy)=>[(sx-cw/2)/cam.z+cam.x,(sy-ch/2)/cam.z+cam.y];

const pointers=new Map(); let dragMoved=0, pinch0=null, hoverV=null;
function zoomAt(sx,sy,z){ const [wx,wy]=toWorld(sx,sy); cam.z=clamp(z,fitZ*0.9,48); cam.x=wx-(sx-cw/2)/cam.z; cam.y=wy-(sy-ch/2)/cam.z; clampCam(); }
function drawPos(v,al){ return [v.px+(v.x-v.px)*al, v.py+(v.y-v.py)*al]; }
function pickVillager(sx,sy){
  const [wx,wy]=toWorld(sx,sy); let best=null,bd=Math.max(0.75*K,12/cam.z);
  for(const v of S.vs){ if(v.inside) continue; const d=Math.hypot(v.x-wx,v.y+0.28-0.62*K-wy); if(d<bd){bd=d;best=v;} }
  return best;
}

/* ================= 그리기: 매 프레임 ================= */
const EMOJI_FONT='system-ui,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
let alpha=0, animT=0;
const K=1.3;               // 캐릭터 크기(타일 단위 배율)
const R2=Math.random;       // 연출용 난수(시뮬레이션 난수와 분리)
const parts=[];
const easeInOut=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
const easeOutBack=t=>{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2);};
function rr(c,x,y,w,h,r){ c.beginPath(); c.roundRect(x,y,w,h,r); }
function heartPath(c,x,y,s){ c.beginPath(); c.moveTo(x,y+s*0.35); c.bezierCurveTo(x-s*1.1,y-s*0.35,x-s*0.45,y-s*1.05,x,y-s*0.45); c.bezierCurveTo(x+s*0.45,y-s*1.05,x+s*1.1,y-s*0.35,x,y+s*0.35); c.closePath(); }

/* ---------- 입자 ---------- */
function spawn(p){ if(parts.length<600) parts.push(Object.assign({age:0,life:1,vx:0,vy:0,g:0,size:0.1,grow:0,top:false},p)); }
function burst(type,x,y,n){ for(let i=0;i<n;i++){ const p=preset(type,x,y,i); if(p) spawn(p); } }
function preset(type,x,y,i){
  const r=R2;
  switch(type){
    case 'soil': case 'dirt': return {type:'dot',x:x+(r()-.5)*.15,y,vx:(r()-.5)*1.4,vy:-1.1-r()*1.2,g:6,life:.55,size:.045+r()*.03,color:type==='soil'?'#8a5a34':'#6e4a2c'};
    case 'chip': return {type:'rect',x,y,vx:(r()-.5)*2.4,vy:-1.4-r()*1.2,g:7,life:.6,size:.07,color:r()<.5?'#e8c48c':'#c99a5e',rot:r()*6,vr:(r()-.5)*20};
    case 'spark': return {type:'dot',x,y,vx:(r()-.5)*2.6,vy:-1-r()*1.6,g:5,life:.35,size:.035,color:'#ffd35a',top:true};
    case 'splash': return {type:'dot',x:x+(r()-.5)*.2,y,vx:(r()-.5)*1.8,vy:-1.6-r()*1.1,g:6,life:.65,size:.05,color:'#e9f8ff'};
    case 'heart': return {type:'heart',x:x+(r()-.5)*.6,y:y-r()*.2,vx:(r()-.5)*.3,vy:-.55-r()*.4,life:1.5,size:.13+r()*.07,color:r()<.5?'#ff7fa3':'#ff5c8a',top:true};
    case 'steam': return {type:'puff',x:x+(i%2?.2:-.2),y,vx:(i%2?.5:-.5),vy:-.7,life:.7,size:.07,grow:.12,color:'rgba(255,255,255,0.95)',top:true};
    case 'sweat': return {type:'drop',x:x+(i%2?.3:-.3),y,vx:(i%2?.6:-.6),vy:-.9,g:5,life:.6,size:.07,color:'#8fd3ff',top:true};
    case 'sparkle': return {type:'star',x:x+(r()-.5)*.9,y:y-r()*.6,vy:-.25,life:1,size:.1+r()*.08,color:'#fff3a0',top:true};
    case 'smoke': return {type:'puff',x:x+(r()-.5)*.08,y,vx:.12+r()*.12,vy:-.38,life:2.4,size:.09,grow:.22,color:'rgba(236,236,236,0.5)'};
    case 'note': return {type:'note',x:x+(r()-.5)*.5,y,vx:(r()-.5)*.35,vy:-.55,life:1.5,size:.3,color:['#ff7fa3','#ffb347','#5fbfff'][i%3],top:true};
    case 'z': return {type:'z',x,y,vx:.18,vy:-.3,life:1.8,size:.26,color:'#ffffff',top:true};
    case 'dust': return {type:'puff',x:x+(r()-.5)*.1,y,vx:(r()-.5)*.3,vy:-.12,life:.45,size:.05,grow:.1,color:'rgba(225,210,175,0.7)'};
  }
  return null;
}
function updateParts(dt){
  for(let i=parts.length-1;i>=0;i--){ const p=parts[i]; p.age+=dt; if(p.age>=p.life){ parts.splice(i,1); continue; }
    p.vy+=p.g*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; if(p.vr) p.rot+=p.vr*dt; }
}
function drawParts(top){
  const z=cam.z;
  for(const p of parts){ if(p.top!==top) continue;
    const [sx,sy]=toScreen(p.x,p.y); if(sx<-40||sy<-40||sx>cw+40||sy>ch+40) continue;
    const k=p.age/p.life, sz=Math.max(1,(p.size+p.grow*k)*z);
    ctx.globalAlpha=Math.min(1,(1-k)*1.6); ctx.fillStyle=p.color;
    switch(p.type){
      case 'dot': ctx.beginPath(); ctx.arc(sx,sy,sz,0,7); ctx.fill(); break;
      case 'rect': ctx.save(); ctx.translate(sx,sy); ctx.rotate(p.rot); ctx.fillRect(-sz,-sz*.45,sz*2,sz*.9); ctx.restore(); break;
      case 'puff': ctx.beginPath(); ctx.arc(sx,sy,sz,0,7); ctx.fill(); break;
      case 'heart': heartPath(ctx,sx,sy,sz); ctx.fill(); break;
      case 'drop': ctx.beginPath(); ctx.moveTo(sx,sy-sz*1.3); ctx.quadraticCurveTo(sx+sz,sy,sx,sy+sz*.7); ctx.quadraticCurveTo(sx-sz,sy,sx,sy-sz*1.3); ctx.fill(); break;
      case 'star': ctx.beginPath(); for(let j=0;j<8;j++){ const a=j*Math.PI/4, rr2=j%2?sz*.35:sz; ctx.lineTo(sx+Math.cos(a)*rr2,sy+Math.sin(a)*rr2); } ctx.closePath(); ctx.fill(); break;
      case 'note': ctx.font=`700 ${sz*1.3}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('♪',sx,sy); break;
      case 'z': ctx.font=`700 ${sz}px "Jua",sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('z',sx,sy); break;
    }
  }
  ctx.globalAlpha=1;
}

/* ---------- 자세 ---------- */
function facingOf(dx,dy){ if(Math.abs(dx)>Math.abs(dy)*1.1) return {f:'side',flip:dx<0}; return {f:dy<0?'up':'down',flip:false}; }
function basePose(){ return {f:'down',flip:false,legL:0,legR:0,legLx:0,legRx:0,bob:0,lean:0,armL:0.12,armR:0.12,crouch:0,sit:false,lying:false,tool:null,face:null,mouth:0,blush:false,sweat:false,red:false,blink:false,sq:1,umbrella:false}; }
function emotionFace(v){
  const b=v.bubble&&v.bubble.until>S.t?v.bubble.e:null;
  const map={'💔':'sad','💢':'angry','😤':'angry','😱':'scared','💘':'love','💑':'love','💕':'love','💖':'love','💗':'love','😳':'surprised','😮':'surprised','😅':'happy','🎉':'happy','😄':'happy','😆':'happy','😂':'happy','💃':'happy','🌰':'happy','🐟':'happy','💎':'surprised','🗺️':'surprised','🍀':'happy','🍄':'surprised','🐾':'scared','🙇':'sad'};
  if(b&&map[b]) return map[b];
  const a=v.act; if(a&&a.phase==='do'&&a.type==='nap') return 'sleep';
  const m=(v.hunger+v.energy+v.social+v.fun)/4;
  return m>62?'smile':m>35?'normal':'sad';
}
function lookAround(p,T){ const k=Math.floor(T/2.6)%4; p.f=['down','side','down','side'][k]; p.flip=k===3; }
function swing(p,T,period,tool,lo=0.4,hi=2.7){
  const c=(T/period)%1; let ang;
  if(c<0.55) ang=lo+(hi-lo)*easeInOut(c/0.55);
  else if(c<0.68) ang=hi-(hi-lo+0.25)*((c-0.55)/0.13);
  else ang=lo-0.25+0.25*((c-0.68)/0.32);
  p.armR=ang; p.armL=ang-0.2; p.tool=tool; p.lean=c>0.55&&c<0.85?0.14:0.02; p.swingC=c;
  if(p.f!=='side') p.f='side';
}
function fishPose(v,p,T,a){
  p.tool='rod'; p.f='side';
  const w=a.face||{x:1,y:0}; p.flip = w.x<0 || (w.x===0 && v.id%2===1);
  p.armR=1.05; p.armL=0.85;
  let bx=1.05, by=0.1+Math.sin(T*2.4)*0.02;
  if(w.x===0){ bx=0.35; by=w.y*0.7; }
  if(v.catchT!=null&&animT-v.catchT<1.3){ const k=(animT-v.catchT)/1.3; p.armR=1.05+Math.sin(Math.min(1,k*3)*Math.PI/2)*1.4; p.face='happy'; p.fish=k; p.bob=Math.sin(Math.min(1,k*2)*Math.PI)*0.08; }
  p.bobber={x:bx,y:by};
}
function dance(v,p,T,style){
  switch(style){
    case 0: { const s=Math.abs(Math.sin(T*6)); p.bob=s*0.2; p.armL=p.armR=1.5+s*1.3; break; }
    case 1: { const s=Math.sin(T*4); p.lean=s*0.2; p.armL=1.2+s*0.7; p.armR=1.2-s*0.7; p.bob=Math.abs(Math.sin(T*8))*0.04; break; }
    case 2: { const k=Math.floor(T*6)%4; p.f=['down','side','up','side'][k]; p.flip=k===3; p.armL=p.armR=1.6; p.bob=0.04; break; }
    default: { const s=Math.sin(T*8); p.armL=2.4+s*0.4; p.armR=2.4-s*0.4; p.bob=Math.abs(Math.sin(T*4))*0.06; p.legL=Math.max(0,Math.sin(T*4))*0.06; p.legR=Math.max(0,-Math.sin(T*4))*0.06; }
  }
}
function poseFor(v,partyOn){
  const a=v.act, T=animT+v.id*0.73, p=basePose();
  let d=v.dir; if(!v.talk&&a&&a.phase==='do'&&a.face) d=a.face;
  const fc=facingOf(d.x,d.y); p.f=fc.f; p.flip=fc.flip;
  p.blink=((T*0.9)%3.7)<0.12;
  p.sq=1+Math.sin(T*2.2)*0.012;
  const moving=(v.x!==v.px||v.y!==v.py);
  if(v.talk){
    const c=v.talk, o=c.a===v?c.b:c.a, f2=facingOf(o.x-v.x,o.y-v.y); p.f=f2.f; p.flip=f2.flip;
    const idx=Math.floor((S.t-c.start)/3), last=idx>=c.lines.length-1;
    if(c.argue){ p.face='angry'; p.red=true; p.bob=Math.abs(Math.sin(T*9))*0.05; p.armL=p.armR=0.45+Math.abs(Math.sin(T*9))*0.45; p.steam=true; }
    else if(c.kind==='confess'){ if(v===c.a){ p.face=last?(c.success?'love':'sad'):'love'; p.blush=true; p.armL=p.armR=0.55; p.lean=0.06; } else { p.face=last?(c.success?'love':'sad'):'surprised'; p.blush=!last||c.success; } if(last&&c.success) p.hearts=true; }
    else if(c.kind==='date'){ p.face='love'; p.blush=true; p.hearts=true; }
    if(c.speaker===v&&!c.argue){ p.mouth=Math.sin(T*14)>0?1:0.3; p.armR=0.9+Math.sin(T*5)*0.55; if(idx===0) p.armR=2.6+Math.sin(T*14)*0.3; }
    else if(!c.argue) p.bob=Math.max(0,Math.sin(T*5))*0.025;
  } else if(moving){
    const run=a&&(a.type==='flee'||a.target), ph=T*(run?15:10.5), s=Math.sin(ph);
    p.bob=Math.abs(s)*(run?0.07:0.045);
    if(p.f==='side'){ p.legLx=s*0.09; p.legRx=-s*0.09; p.armL=-s*0.8; p.armR=s*0.8; p.lean=run?0.12:0.04; }
    else { p.legL=Math.max(0,s)*0.08; p.legR=Math.max(0,-s)*0.08; p.armL=0.12+Math.max(0,-s)*0.3; p.armR=0.12+Math.max(0,s)*0.3; }
    if(a&&a.type==='flee'){ p.armL=p.armR=2.75; p.face='scared'; p.sweat=true; p.dust=true; }
    else if(run) p.dust=true;
    if(a&&a.type==='party') p.face='happy';
  } else if(a&&a.phase==='do'){
    switch(a.type){
      case 'work': { const pl=JOBS[v.job].place;
        if(pl==='farm'){ swing(p,T,1.25,'hoe'); p.strike='soil'; }
        else if(pl==='forest'){ swing(p,T,0.95,'axe'); p.strike='chip'; }
        else if(pl==='workshop'){ swing(p,T,0.5,'hammer',0.8,2.0); p.strike=v.id%2?'spark':'chip'; p.crouch=0.35; }
        else if(pl==='shore') fishPose(v,p,T,a);
        break; }
      case 'fun':
        if(a.where==='shore') fishPose(v,p,T,a);
        else if(a.where==='plaza'){ p.sit=true; p.f='down'; p.flip=false; if(v.trait==='외톨이'||v.id%3===0){ p.tool='book'; p.armR=p.armL=0.85; p.face=p.blink?'normal':'smile'; } else lookAround(p,T); if(p.f!=='down') p.f='down'; }
        else if(a.where==='grass'){ const c=(T%2.4)/2.4; p.crouch=0.8; p.lean=0.16; p.armR=c<0.5?0.4+c*1.4:1.1; p.face='smile'; p.f='side'; p.flip=v.id%2===0; if(c>0.5) p.tool='flower'; }
        else { p.face='smile'; lookAround(p,T); }
        break;
      case 'social': lookAround(p,T); if(((T*0.45)%5)<0.7) p.armR=2.6+Math.sin(T*14)*0.3; break;
      case 'party': case 'raindance': dance(v,p,T,a.type==='raindance'?2:v.id%4); p.face='happy'; if(v.trait==='파티광'||a.type==='raindance') p.notes=true; break;
      case 'nap': p.lying=true; p.face='sleep'; p.zzz=true; break;
      case 'hunt': swing(p,T,1.0,'shovel',0.4,1.7); p.crouch=0.4; p.strike='dirt'; break;
      case 'wander': if(v.trait==='호기심쟁이'){ p.tool='magnifier'; p.armR=1.45; p.lean=0.12; p.f='side'; p.flip=Math.sin(T*0.8)<0; } else lookAround(p,T); break;
      default: lookAround(p,T);
    }
  } else lookAround(p,T);
  if(!p.tool&&v.carry&&v.carry.until>S.t){ p.tool=v.carry.item; if(p.tool==='bread'){ const nib=(T%2.2)<0.45; p.armR=nib?2.15:1.15; if(nib) p.mouth=1; } else p.armR=Math.max(p.armR,1.0); }
  if(S.weather.rain&&!p.lying&&!(a&&(a.type==='raindance'||(a.type==='party'&&a.phase==='do')))&&!v.talk){ p.umbrella=true; p.armL=2.8; }
  if(!p.face) p.face=emotionFace(v);
  if(reduceMotion){ p.bob*=0.3; p.sq=1; }
  return p;
}

/* ---------- 캐릭터 그리기 (발 위치 기준, 단위 = 타일/K) ---------- */
function drawFace(c,p,hy,side){
  const f=p.face, ex=side?[0.15]:[-0.11,0.11], ey=hy+0.01;
  c.fillStyle='#2a2320'; c.strokeStyle='#2a2320'; c.lineWidth=0.034;
  if(p.scared||f==='scared'){ c.fillStyle='rgba(120,150,255,0.22)'; c.beginPath(); c.arc(0,hy,0.3,Math.PI*1.1,Math.PI*1.9); c.fill(); c.fillStyle='#2a2320'; }
  for(const x of ex){
    if(f==='sleep'||(p.blink&&f!=='happy'&&f!=='love')){ c.beginPath(); c.moveTo(x-0.045,ey); c.quadraticCurveTo(x,ey+0.03,x+0.045,ey); c.stroke(); }
    else if(f==='happy'){ c.beginPath(); c.moveTo(x-0.045,ey+0.015); c.quadraticCurveTo(x,ey-0.05,x+0.045,ey+0.015); c.stroke(); }
    else if(f==='love'){ c.fillStyle='#ff4f80'; heartPath(c,x,ey+0.01,0.055); c.fill(); c.fillStyle='#2a2320'; }
    else if(f==='surprised'||f==='scared'){ c.beginPath(); c.arc(x,ey,f==='scared'?0.032:0.05,0,7); c.fill(); if(f==='surprised'){ c.fillStyle='#fff'; c.beginPath(); c.arc(x+0.015,ey-0.017,0.017,0,7); c.fill(); c.fillStyle='#2a2320'; } }
    else { c.beginPath(); c.ellipse(x,ey,0.036,0.05,0,0,7); c.fill(); c.fillStyle='#fff'; c.beginPath(); c.arc(x+0.012,ey-0.018,0.014,0,7); c.fill(); c.fillStyle='#2a2320'; }
    if(f==='angry'||f==='sad'){ const inner=side?1:(x<0?1:-1), dy=f==='angry'?1:-1; c.beginPath(); c.moveTo(x-0.05*inner,ey-0.085-0.02*dy); c.lineTo(x+0.045*inner,ey-0.085+0.02*dy); c.stroke(); }
  }
  const mx=side?0.19:0, my=hy+0.13;
  if(p.mouth>0){ c.fillStyle='#a8414a'; c.beginPath(); c.ellipse(mx,my,0.04,0.04*p.mouth+0.01,0,0,7); c.fill(); }
  else if(f==='surprised'||f==='scared'){ c.fillStyle='#a8414a'; c.beginPath(); c.ellipse(mx,my,0.03,0.04,0,0,7); c.fill(); }
  else if(f==='angry'||f==='sad'){ c.beginPath(); c.moveTo(mx-0.05,my+0.02); c.quadraticCurveTo(mx,my-0.035,mx+0.05,my+0.02); c.stroke(); }
  else if(f==='happy'||f==='love'){ c.fillStyle='#a8414a'; c.beginPath(); c.moveTo(mx-0.06,my-0.01); c.quadraticCurveTo(mx,my+0.09,mx+0.06,my-0.01); c.closePath(); c.fill(); }
  else if(f==='normal'){ c.beginPath(); c.moveTo(mx-0.03,my); c.lineTo(mx+0.03,my); c.stroke(); }
  else if(f!=='sleep'){ c.beginPath(); c.moveTo(mx-0.045,my-0.005); c.quadraticCurveTo(mx,my+0.045,mx+0.045,my-0.005); c.stroke(); }
  if(p.blush||f==='love'||f==='happy'){ c.fillStyle='rgba(255,120,140,0.45)'; for(const x of side?[0.09]:[-0.19,0.19]){ c.beginPath(); c.ellipse(x,hy+0.08,0.05,0.03,0,0,7); c.fill(); } }
  if(f==='sad'&&!side&&((animT*0.7)%2)<1){ c.fillStyle='#8fd3ff'; c.beginPath(); c.ellipse(-0.11,ey+0.09,0.018,0.03,0,0,7); c.fill(); }
  if(p.sweat){ c.fillStyle='#8fd3ff'; c.beginPath(); c.moveTo(0.27,hy-0.2); c.quadraticCurveTo(0.33,hy-0.1,0.27,hy-0.07); c.quadraticCurveTo(0.21,hy-0.1,0.27,hy-0.2); c.fill(); }
}
function hairFront(c,L,hy,view){
  c.fillStyle=L.hair;
  if(view==='up'){ c.beginPath(); c.arc(0,hy,0.315,0,7); c.fill(); }
  else if(view==='side'){ c.beginPath(); c.arc(0,hy,0.315,Math.PI*0.5,Math.PI*1.92); c.quadraticCurveTo(0.24,hy-0.12,0.12,hy-0.07); c.quadraticCurveTo(0.02,hy-0.1,-0.04,hy+0.06); c.closePath(); c.fill(); }
  else { c.beginPath(); c.arc(0,hy,0.315,Math.PI*0.97,Math.PI*2.03); c.quadraticCurveTo(0.22,hy-0.05,0.1,hy-0.1); c.quadraticCurveTo(0.02,hy-0.03,-0.08,hy-0.11); c.quadraticCurveTo(-0.2,hy-0.03,-0.31,hy+0.02); c.closePath(); c.fill(); }
  switch(L.style){
    case 'spiky': c.beginPath(); for(let i=-1;i<=1;i++){ c.moveTo(i*0.14-0.08,hy-0.25); c.lineTo(i*0.15+0.02,hy-0.43); c.lineTo(i*0.14+0.08,hy-0.25); } c.fill(); break;
    case 'buns': for(const x of view==='side'?[-0.12]:[-0.23,0.23]){ c.beginPath(); c.arc(x,hy-0.24,0.1,0,7); c.fill(); } break;
    case 'bowl': if(view==='down'){ rr(c,-0.3,hy-0.2,0.6,0.12,0.04); c.fill(); } break;
    case 'long': if(view==='down'){ rr(c,-0.34,hy-0.08,0.11,0.36,0.05); c.fill(); rr(c,0.23,hy-0.08,0.11,0.36,0.05); c.fill(); } break;
    case 'pony': if(view==='up'){ c.beginPath(); c.ellipse(0,hy+0.22,0.09,0.17,0,0,7); c.fill(); } else if(view==='down'){ c.beginPath(); c.ellipse(0.3,hy+0.06,0.06,0.12,0.3,0,7); c.fill(); } break;
  }
  c.strokeStyle='rgba(255,255,255,0.22)'; c.lineWidth=0.035; c.beginPath(); c.arc(0,hy,0.24,Math.PI*1.2,Math.PI*1.45); c.stroke();
}
function hat(c,job,hy,view){
  switch(job){
    case '농부': c.fillStyle='#EBC766'; c.strokeStyle='rgba(120,80,20,.45)'; c.lineWidth=.025;
      c.beginPath(); c.ellipse(0,hy-0.2,0.45,0.11,0,0,7); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(0,hy-0.24,0.22,0.17,0,Math.PI,0); c.fill(); c.stroke();
      c.fillStyle='#D0504A'; c.fillRect(-0.21,hy-0.27,0.42,0.045); break;
    case '제빵사': c.fillStyle='#fff'; c.strokeStyle='rgba(0,0,0,.16)'; c.lineWidth=.022;
      for(const x of [-0.12,0,0.12]){ c.beginPath(); c.arc(x,hy-0.45,0.11,0,7); c.fill(); c.stroke(); }
      rr(c,-0.19,hy-0.42,0.38,0.2,0.05); c.fill(); c.stroke(); break;
    case '어부': c.fillStyle='#3D6FA8';
      c.beginPath(); c.moveTo(-0.22,hy-0.17); c.lineTo(-0.17,hy-0.38); c.quadraticCurveTo(0,hy-0.44,0.17,hy-0.38); c.lineTo(0.22,hy-0.17); c.fill();
      c.beginPath(); c.ellipse(0,hy-0.17,0.38,0.09,0,0,7); c.fill(); c.fillStyle='#E9C46A'; c.fillRect(-0.2,hy-0.24,0.4,0.04); break;
    case '목수': c.fillStyle='#E07A3F'; rr(c,-0.31,hy-0.17,0.62,0.075,0.03); c.fill(); if(view==='side'){ c.beginPath(); c.moveTo(-0.3,hy-0.14); c.lineTo(-0.42,hy-0.05); c.lineTo(-0.36,hy-0.18); c.fill(); } break;
    case '나무꾼': c.fillStyle='#B83B32'; c.beginPath(); c.arc(0,hy-0.04,0.325,Math.PI,0); c.fill(); c.fillStyle='#8f2a24'; rr(c,-0.335,hy-0.1,0.67,0.09,0.04); c.fill(); c.fillStyle='#fff'; c.beginPath(); c.arc(0,hy-0.39,0.07,0,7); c.fill(); break;
    case '한량': { const fx=view==='side'?-0.05:0.2, fy=hy-0.24; c.fillStyle='#f7a1c4'; for(let i=0;i<5;i++){ const a=i*1.2566; c.beginPath(); c.arc(fx+Math.cos(a)*0.05,fy+Math.sin(a)*0.05,0.04,0,7); c.fill(); } c.fillStyle='#ffd166'; c.beginPath(); c.arc(fx,fy,0.03,0,7); c.fill(); break; }
  }
}
function bodyDetail(c,v,by,view){
  const top=-0.58+by;
  switch(v.job){
    case '제빵사': if(view!=='up'){ c.fillStyle='#fff'; rr(c,view==='side'?0.03:-0.12,top+0.1,view==='side'?0.14:0.24,0.3,0.05); c.fill(); } break;
    case '농부': c.fillStyle='#4A6A9A'; rr(c,-0.18,top+0.22,0.36,0.17,0.07); c.fill(); if(view==='down'){ c.strokeStyle='#4A6A9A'; c.lineWidth=.045; c.beginPath(); c.moveTo(-0.1,top+0.03); c.lineTo(-0.09,top+0.24); c.moveTo(0.1,top+0.03); c.lineTo(0.09,top+0.24); c.stroke(); } break;
    case '목수': c.fillStyle='#7a4f2e'; c.fillRect(-0.18,top+0.26,0.36,0.05); c.fillStyle='#cfd3d8'; c.fillRect(view==='side'?-0.1:0.06,top+0.29,0.04,0.08); break;
    case '나무꾼': c.strokeStyle='rgba(80,15,15,0.3)'; c.lineWidth=.03; c.beginPath(); for(const x of [-0.08,0.08]){ c.moveTo(x,top+0.04); c.lineTo(x,top+0.36); } c.moveTo(-0.17,top+0.18); c.lineTo(0.17,top+0.18); c.stroke(); break;
    case '주점 주인': if(view!=='up'){ const bx=view==='side'?0.12:0; c.fillStyle='#7B4E9E'; c.beginPath(); c.moveTo(bx,top+0.05); c.lineTo(bx-0.07,top+0.01); c.lineTo(bx-0.07,top+0.09); c.closePath(); c.moveTo(bx,top+0.05); c.lineTo(bx+0.07,top+0.01); c.lineTo(bx+0.07,top+0.09); c.closePath(); c.fill(); } break;
    case '어부': if(view==='down'){ c.fillStyle='rgba(60,95,75,0.6)'; rr(c,-0.18,top+0.02,0.09,0.34,0.05); c.fill(); rr(c,0.09,top+0.02,0.09,0.34,0.05); c.fill(); } break;
  }
}
function drawTool(c,p,hand){
  const [hx,hy]=hand, t=p.tool;
  const ux=Math.sin(p.armR), uy=Math.cos(p.armR), fx=-uy, fy=ux;
  c.lineCap='round';
  if(t==='hoe'||t==='axe'||t==='hammer'||t==='shovel'){
    const Ln={hoe:0.48,axe:0.36,hammer:0.27,shovel:0.44}[t], tx=hx+ux*Ln, ty=hy+uy*Ln;
    c.strokeStyle='#8a5a34'; c.lineWidth=0.045; c.beginPath(); c.moveTo(hx-ux*0.06,hy-uy*0.06); c.lineTo(tx,ty); c.stroke();
    c.fillStyle='#a9b2bc'; c.strokeStyle='rgba(50,50,60,0.4)'; c.lineWidth=0.02; c.beginPath();
    if(t==='hoe'){ c.moveTo(tx,ty); c.lineTo(tx+fx*0.17,ty+fy*0.17); c.lineTo(tx+fx*0.15-ux*0.07,ty+fy*0.15-uy*0.07); c.lineTo(tx-ux*0.05,ty-uy*0.05); }
    else if(t==='axe'){ c.moveTo(tx-ux*0.02,ty-uy*0.02); c.lineTo(tx+fx*0.15+ux*0.05,ty+fy*0.15+uy*0.05); c.lineTo(tx+fx*0.15-ux*0.11,ty+fy*0.15-uy*0.11); c.lineTo(tx-ux*0.09,ty-uy*0.09); }
    else if(t==='hammer'){ c.moveTo(tx-fx*0.08-ux*0.03,ty-fy*0.08-uy*0.03); c.lineTo(tx+fx*0.09-ux*0.03,ty+fy*0.09-uy*0.03); c.lineTo(tx+fx*0.09+ux*0.04,ty+fy*0.09+uy*0.04); c.lineTo(tx-fx*0.08+ux*0.04,ty-fy*0.08+uy*0.04); }
    else { c.ellipse(tx+ux*0.06,ty+uy*0.06,0.06,0.09,Math.atan2(uy,ux)-Math.PI/2,0,7); }
    c.closePath(); c.fill(); c.stroke();
    return {x:tx+fx*0.12,y:ty+fy*0.12};
  }
  if(t==='rod'){
    const wx=0.35, wy=-0.94, n=Math.hypot(wx,wy), tx=hx+wx/n*0.8, ty=hy+wy/n*0.8;
    c.strokeStyle='#6b4a2e'; c.lineWidth=0.035; c.beginPath(); c.moveTo(hx,hy); c.lineTo(tx,ty); c.stroke();
    if(p.bobber){ const b=p.bobber;
      c.strokeStyle='rgba(255,255,255,0.8)'; c.lineWidth=0.012; c.beginPath(); c.moveTo(tx,ty); c.quadraticCurveTo((tx+b.x)/2,Math.max(ty,b.y)+0.15,b.x,b.y); c.stroke();
      if(p.fish!=null){ const k=Math.min(1,p.fish*1.6), fxp=b.x+(hx-b.x)*k, fyp=b.y+(hy-b.y)*k-Math.sin(k*Math.PI)*0.5;
        c.fillStyle='#78b8e8'; c.beginPath(); c.ellipse(fxp,fyp,0.1,0.05,Math.sin(animT*20)*0.4,0,7); c.fill(); c.beginPath(); c.moveTo(fxp-0.08,fyp); c.lineTo(fxp-0.16,fyp-0.05); c.lineTo(fxp-0.16,fyp+0.05); c.fill(); }
      else { c.fillStyle='#ff5a4f'; c.beginPath(); c.arc(b.x,b.y,0.04,Math.PI,0); c.fill(); c.fillStyle='#fff'; c.beginPath(); c.arc(b.x,b.y,0.04,0,Math.PI); c.fill();
        c.strokeStyle='rgba(255,255,255,0.5)'; c.lineWidth=0.012; c.beginPath(); c.ellipse(b.x,b.y+0.02,0.07+((animT*0.8)%1)*0.08,0.025+((animT*0.8)%1)*0.02,0,0,7); c.stroke(); }
    }
    return {x:tx,y:ty};
  }
  if(t==='bread'){ c.fillStyle='#D9A05B'; c.beginPath(); c.ellipse(hx+0.02,hy-0.02,0.085,0.05,-0.3,0,7); c.fill(); c.strokeStyle='#b07a3e'; c.lineWidth=0.015; c.beginPath(); c.moveTo(hx-0.02,hy-0.05); c.lineTo(hx,hy); c.moveTo(hx+0.03,hy-0.06); c.lineTo(hx+0.05,hy-0.01); c.stroke(); }
  else if(t==='flower'){ c.strokeStyle='#5aa35a'; c.lineWidth=0.02; c.beginPath(); c.moveTo(hx,hy); c.lineTo(hx+0.02,hy-0.18); c.stroke(); c.fillStyle='#f7a1c4'; for(let i=0;i<5;i++){ const a=i*1.2566; c.beginPath(); c.arc(hx+0.02+Math.cos(a)*0.04,hy-0.2+Math.sin(a)*0.04,0.035,0,7); c.fill(); } c.fillStyle='#ffd166'; c.beginPath(); c.arc(hx+0.02,hy-0.2,0.025,0,7); c.fill(); }
  else if(t==='book'){ c.fillStyle='#C0504D'; rr(c,hx-0.19,hy-0.13,0.2,0.14,0.02); c.fill(); c.fillStyle='#fff8e8'; rr(c,hx-0.17,hy-0.12,0.16,0.11,0.01); c.fill(); c.strokeStyle='rgba(0,0,0,0.25)'; c.lineWidth=0.01; c.beginPath(); c.moveTo(hx-0.09,hy-0.12); c.lineTo(hx-0.09,hy-0.01); c.stroke(); }
  else if(t==='magnifier'){ const tx=hx+ux*0.14, ty=hy+uy*0.14; c.strokeStyle='#6b4a2e'; c.lineWidth=0.035; c.beginPath(); c.moveTo(hx,hy); c.lineTo(tx,ty); c.stroke(); c.fillStyle='rgba(200,235,255,0.6)'; c.strokeStyle='#8a8f98'; c.lineWidth=0.025; c.beginPath(); c.arc(tx+ux*0.07,ty+uy*0.07,0.075,0,7); c.fill(); c.stroke(); }
  return null;
}
function drawUmbrella(c,col,hy){
  const top=hy-0.62;
  c.strokeStyle='#5a4636'; c.lineWidth=0.03; c.beginPath(); c.moveTo(-0.2,hy+0.3); c.lineTo(-0.02,top+0.05); c.stroke();
  c.fillStyle=col; c.beginPath(); c.ellipse(0,top+0.1,0.55,0.32,0,Math.PI,0);
  for(let i=0;i<4;i++){ const x1=0.55-i*0.275; c.quadraticCurveTo(x1-0.1375,top+0.2,x1-0.275,top+0.1); }
  c.fill();
  c.fillStyle='rgba(255,255,255,0.3)'; c.beginPath(); c.moveTo(0,top-0.22); c.quadraticCurveTo(-0.14,top-0.05,-0.14,top+0.14); c.quadraticCurveTo(-0.02,top+0.2,0.1,top+0.14); c.quadraticCurveTo(0.12,top-0.05,0,top-0.22); c.fill();
  c.fillStyle='#5a4636'; c.beginPath(); c.arc(0,top-0.23,0.03,0,7); c.fill();
}
function drawChar(c,v,p,fx,fy,s){
  const L=v.look, side=p.f==='side', back=p.f==='up';
  const by=(p.crouch||0)*0.1+(p.sit?0.15:0), hy=-0.86+by, shY=-0.5+by;
  const out='rgba(70,45,40,0.5)';
  let tip=null, hand=null;
  c.save(); c.translate(fx,fy); c.scale(s,s);
  if(p.lying){ c.translate(0.05,-0.13); c.rotate(-Math.PI/2*0.94); }
  else c.translate(0,-p.bob);
  if(p.flip) c.scale(-1,1);
  if(p.lean) c.rotate(p.lean);
  if(p.sq!==1) c.scale(1,p.sq);
  c.lineJoin='round'; c.lineCap='round';
  if(!back&&L.style==='long'){ c.fillStyle=L.hair; rr(c,-0.31,hy-0.12,0.62,0.56,0.18); c.fill(); }
  if(side&&L.style==='pony'){ c.fillStyle=L.hair; c.beginPath(); c.ellipse(-0.34,hy+0.06,0.09,0.17,0.5,0,7); c.fill(); }
  const arm=(ang,sx,sign,dark)=>{ const ex=sx+Math.sin(ang)*0.25*sign, ey=shY+Math.cos(ang)*0.25;
    c.strokeStyle=v.color; c.lineWidth=0.095; c.beginPath(); c.moveTo(sx,shY); c.lineTo(ex,ey); c.stroke();
    if(dark){ c.strokeStyle='rgba(0,0,0,0.16)'; c.stroke(); }
    c.fillStyle=L.skin; c.beginPath(); c.arc(ex,ey,0.05,0,7); c.fill(); return [ex,ey]; };
  if(side) arm(p.armL,0.0,1,true);
  const legTop=-0.24+by;
  const shoe=(x,y)=>{ c.fillStyle='#4a3a32'; c.beginPath(); c.ellipse(x,y,0.062,0.036,0,0,7); c.fill(); };
  if(p.sit){ for(const x of [-0.08,0.08]){ c.fillStyle=L.pants; rr(c,x-0.05,legTop,0.1,0.1,0.04); c.fill(); shoe(x,legTop+0.11); } }
  else if(side){ for(const [x,dk] of [[p.legLx,true],[p.legRx,false]]){ c.fillStyle=L.pants; rr(c,x-0.05,legTop,0.1,-legTop,0.04); c.fill(); if(dk){ c.fillStyle='rgba(0,0,0,0.15)'; c.fill(); } shoe(x+0.03,-0.012); } }
  else { for(const [x,lift] of [[-0.085,p.legL],[0.085,p.legR]]){ c.fillStyle=L.pants; rr(c,x-0.05,legTop,0.1,Math.max(0.04,-legTop-lift),0.04); c.fill(); shoe(x,-lift-0.012); } }
  c.fillStyle=v.color; c.strokeStyle=out; c.lineWidth=0.03; rr(c,-0.18,-0.58+by,0.36,0.37,0.12); c.fill(); c.stroke();
  bodyDetail(c,v,by,p.f);
  if(!side){ arm(p.armL,-0.17,-1,false); hand=arm(p.armR,0.17,1,false); }
  c.fillStyle=L.skin; c.strokeStyle=out; c.beginPath(); c.arc(0,hy,0.3,0,7); c.fill(); c.stroke();
  if(p.red){ c.fillStyle='rgba(255,70,50,0.22)'; c.beginPath(); c.arc(0,hy,0.3,0,7); c.fill(); }
  if(!back) drawFace(c,p,hy,side);
  hairFront(c,L,hy,p.f);
  hat(c,v.job,hy,p.f);
  if(side) hand=arm(p.armR,0.02,1,false);
  if(p.tool&&hand) tip=drawTool(c,p,hand);
  if(p.umbrella) drawUmbrella(c,L.umb,hy);
  c.restore();
  return {tip};
}

/* ---------- 매 프레임 ---------- */
function drawVillager(v,wx,wy,partyOn,dtA){
  const z=cam.z, s=z*K, fwy=wy+0.28, [fx,fy]=toScreen(wx,fwy);
  if(fx<-60||fy<-80||fx>cw+60||fy>ch+60) return;
  const p=poseFor(v,partyOn);
  ctx.fillStyle='rgba(20,40,20,0.22)'; ctx.beginPath(); ctx.ellipse(fx+(p.lying?-s*0.35:0),fy,s*(p.lying?0.55:0.25),s*0.08,0,0,7); ctx.fill();
  const res=drawChar(ctx,v,p,fx,fy,s);
  const dir=p.flip?-1:1, toW=(lx,ly)=>[wx+lx*K*dir, fwy+ly*K-(p.bob||0)*K];
  if(p.swingC!=null){ const prev=v._lc; if(prev!=null&&((prev<0.68&&p.swingC>=0.68)||(prev>p.swingC&&p.swingC>=0.68))&&res.tip&&dtA>0){ const [tx,ty]=toW(res.tip.x,res.tip.y); burst(p.strike,tx,ty,p.strike==='spark'?6:4); } v._lc=p.swingC; } else v._lc=null;
  if(v.catchT!=null&&v._cs!==v.catchT&&p.bobber){ v._cs=v.catchT; const [bx,by]=toW(p.bobber.x,p.bobber.y); burst('splash',bx,by,9); }
  const head=fwy-1.25*K;
  if(dtA>0){
    if(p.steam&&R2()<dtA*4) burst('steam',wx,head,2);
    if(p.hearts&&R2()<dtA*1.6) burst('heart',wx,head,1);
    if(p.notes&&R2()<dtA*1.3) burst('note',wx,head,1);
    if(p.zzz&&R2()<dtA*0.9) burst('z',wx-0.3,fwy-0.5,1);
    if(p.dust&&R2()<dtA*7) burst('dust',wx,fwy,1);
    if(p.sweat&&R2()<dtA*3) burst('sweat',wx,head+0.2,1);
  }
}
function render(now,dtA){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle='#78a862'; ctx.fillRect(0,0,cw,ch);
  const [ox,oy]=toScreen(0,0);
  ctx.imageSmoothingEnabled=true;
  ctx.drawImage(staticCanvas,ox,oy,W*cam.z,H*cam.z);
  const z=cam.z, h=hourOf(S.t)+alpha/60, tm=now/1000;
  // 물결
  ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=Math.max(1,z*0.07); ctx.lineCap='round';
  for(const w of S.L.water){ const ph=Math.sin(tm*1.3+w.x*0.9+w.y*1.7); if(ph<0.75) continue; const [sx,sy]=toScreen(w.x+0.3,w.y+0.5+Math.sin(tm+w.x)*0.1); ctx.globalAlpha=(ph-0.75)*4; ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx+z*0.4,sy); ctx.stroke(); }
  ctx.globalAlpha=1;
  { const [fx,fy]=toScreen(31.5,16.5); for(let i=0;i<5;i++){ const a=tm*2+i*1.26; ctx.fillStyle='rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(fx+Math.cos(a)*z*0.45,fy+Math.sin(a)*z*0.45-Math.abs(Math.sin(tm*3+i))*z*0.2,Math.max(1,z*0.06),0,7); ctx.fill(); } }
  // 굴뚝 연기
  if(dtA>0) for(const b of S.buildings){
    const occ=S.vs.some(v=>v.inside===b&&!(v.act&&v.act.type==='sleep'&&v.act.phase==='do'));
    const bake=b.kind==='bakery'&&S.vs.some(v=>v.inside===b&&v.job==='제빵사');
    if((occ||bake)&&R2()<dtA*(bake?2.6:0.9)) burst('smoke',b.x+b.w-0.66,b.side==='s'?b.y+0.45:b.y+0.85,1);
  }
  updateParts(dtA);
  drawParts(false);
  // 주민
  const vis=S.vs.filter(v=>!v.inside).map(v=>{const [x,y]=drawPos(v,alpha);return {v,x,y};}).sort((a,b)=>a.y-b.y);
  const P=S.party, partyOn=!!(P&&S.t>=P.start&&S.t<P.end);
  for(const o of vis) drawVillager(o.v,o.x,o.y,partyOn,dtA);
  // 밤·노을·비
  const dk=darkness(h);
  if(h>=17&&h<20){ ctx.fillStyle=`rgba(255,140,70,${0.16*Math.sin((h-17)/3*Math.PI)})`; ctx.fillRect(0,0,cw,ch); }
  if(h>=5&&h<7.5){ ctx.fillStyle=`rgba(255,170,190,${0.12*Math.sin((h-5)/2.5*Math.PI)})`; ctx.fillRect(0,0,cw,ch); }
  if(dk>0){ ctx.fillStyle=`rgba(22,30,76,${dk*0.9})`; ctx.fillRect(0,0,cw,ch); }
  if(S.weather.rain){ ctx.fillStyle='rgba(60,70,90,0.18)'; ctx.fillRect(0,0,cw,ch); }
  // 불빛
  const li=clamp(dk/0.35,0,1);
  if(li>0.01){
    ctx.globalCompositeOperation='lighter';
    const glow=(wx,wy,r,col,a)=>{ const [sx,sy]=toScreen(wx,wy); const gr=ctx.createRadialGradient(sx,sy,0,sx,sy,r*z); gr.addColorStop(0,`rgba(${col},${a})`); gr.addColorStop(1,`rgba(${col},0)`); ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(sx,sy,r*z,0,7); ctx.fill(); };
    for(const [lx,ly] of S.lamps) glow(lx+.5,ly+.5,2.2,'255,196,110',0.45*li);
    for(const b of S.buildings){
      const inside=S.vs.filter(v=>v.inside===b); let on=false;
      if(b.kind==='house') on=inside.some(v=>!(v.act&&v.act.type==='sleep'&&v.act.phase==='do'));
      else if(b.kind==='bakery') on=bakeryOpen(h); else if(b.kind==='tavern') on=h>=17||h<1; else on=inside.length>0;
      if(!on) continue;
      const wy=b.side==='s'?b.y+b.h:b.y;
      glow(b.door.x+.5,wy,2.4,'255,190,100',0.5*li);
      ctx.fillStyle=`rgba(255,215,130,${0.9*li})`;
      for(const oxx of [-1,1]){ const wx=b.door.x+oxx; if(wx<b.x||wx>=b.x+b.w) continue; const [sx,sy]=toScreen(wx+0.3,b.side==='s'?b.y+b.h-0.42:b.y+0.14); ctx.fillRect(sx,sy,z*0.4,z*0.28); }
    }
    if(partyOn){ for(let i=0;i<14;i++){ const x=26.5+i*(10/13); glow(x,13.3+Math.sin(i)*0.2,1.2,['255,120,150','255,220,120','140,220,255'][i%3],0.7*li); glow(x,19.7,1.2,['140,220,255','255,120,150','255,220,120'][i%3],0.7*li); } }
    ctx.globalCompositeOperation='source-over';
  }
  if(partyOn){
    for(let i=0;i<14;i++){ const col=['#ff7896','#ffd166','#7fd6ff'][i%3]; for(const yy of [13.3+Math.sin(i)*0.2,19.7]){ const [sx,sy]=toScreen(26.5+i*(10/13),yy); ctx.fillStyle=col; ctx.beginPath(); ctx.arc(sx,sy,Math.max(2,z*0.12),0,7); ctx.fill(); } }
    if(!reduceMotion){ for(let i=0;i<50;i++){ const fx=26+hash(i)*11, fy=13+((tm*0.12+hash(i*7))%1)*7; const [sx,sy]=toScreen(fx+Math.sin(tm*2+i)*0.2,fy); ctx.fillStyle=['#ff7896','#ffd166','#7fd6ff','#b7f07a'][i%4]; ctx.save(); ctx.translate(sx,sy); ctx.rotate(tm*3+i); ctx.fillRect(-z*0.08,-z*0.04,z*0.16,z*0.08); ctx.restore(); } }
  }
  // 잠든 집의 Z
  if(h>=21||h<7){ ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.textAlign='center'; ctx.textBaseline='middle';
    for(const b of S.houses){ if(!S.vs.some(v=>v.inside===b&&v.act&&v.act.type==='sleep'&&v.act.phase==='do')) continue;
      for(let k=0;k<2;k++){ const p=(tm*0.35+k*0.5+hash(b.x))%1; const [sx,sy]=toScreen(b.x+b.w*0.7+p*0.6,b.y+0.4-p*1.2); ctx.globalAlpha=Math.sin(p*Math.PI); ctx.font=`700 ${Math.max(9,z*(0.4+p*0.3))}px "Jua",sans-serif`; ctx.fillText('z',sx,sy); } }
    ctx.globalAlpha=1; }
  drawParts(true);
  // 비
  if(S.weather.rain){ ctx.strokeStyle='rgba(210,225,255,0.45)'; ctx.lineWidth=1; ctx.beginPath(); const n=reduceMotion?60:160; for(let i=0;i<n;i++){ const x=(hash(i)*cw+tm*60)%cw, y=((hash(i*3)+tm*1.6)%1)*ch; ctx.moveTo(x,y); ctx.lineTo(x-3,y+10); } ctx.stroke(); }
  // 선택·말풍선·이름
  const s=z*K;
  for(const o of vis){ const v=o.v; const [fx,fy]=toScreen(o.x,o.y+0.28);
    if(v===app.sel){ ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.setLineDash([4,3]); ctx.beginPath(); ctx.ellipse(fx,fy,s*0.36,s*0.13,0,0,7); ctx.stroke(); ctx.setLineDash([]); }
    const live=v.bubble&&v.bubble.until>S.t;
    if(v.bubble!==v._bo){ v._bo=v.bubble; v._bt0=animT; }
    let bub=live?v.bubble.e:null;
    if(!bub&&v===app.sel&&v.act&&v.act.phase==='do') bub=actEmoji(v);
    if(bub) drawBubble(fx,fy-s*1.28-4,bub,v===app.sel||live,live?v._bt0:null);
    if(v===app.sel||v===hoverV||z>=40) drawName(fx,fy+12,v.name,v===app.sel);
  }
}
function drawBubble(x,y,e,strong,t0){
  const k=t0==null?1:clamp((animT-t0)/0.22,0,1), sc=Math.max(0.01,easeOutBack(k));
  const fs=clamp(cam.z*0.55,11,22), w=fs*1.5, hgt=fs*1.35;
  ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
  ctx.fillStyle=strong?'rgba(255,255,255,0.96)':'rgba(255,255,255,0.8)'; ctx.strokeStyle='rgba(60,50,40,0.25)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(-w/2,-hgt,w,hgt,hgt/2.2); ctx.moveTo(-3,0); ctx.lineTo(0,4); ctx.lineTo(3,0); ctx.fill(); ctx.stroke();
  ctx.font=`${fs}px ${EMOJI_FONT}`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#000'; ctx.fillText(e,0,-hgt/2+1);
  ctx.restore();
}
function drawName(x,y,name,strong){
  ctx.font=`${strong?'700 ':''}12px "Gowun Dodum",sans-serif`; const w=ctx.measureText(name).width+10;
  ctx.fillStyle=strong?'rgba(47,125,109,0.95)':'rgba(30,40,40,0.7)'; ctx.beginPath(); ctx.roundRect(x-w/2,y-8,w,16,8); ctx.fill();
  ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(name,x,y);
}
function actEmoji(v){
  const a=v.act; if(!a) return null;
  switch(a.type){ case 'work': return JOBS[v.job].e; case 'fun': return {shore:'🎣',forest:'🌳',grass:'🌸',plaza:'🪑'}[a.where]||'🙂'; case 'social': return '👋'; case 'nap': return '💤'; case 'party': return '🎶'; case 'hunt': return '🔍'; case 'wander': return v.trait==='호기심쟁이'?'🔍':null; case 'idle': return '💭'; }
  return null;
}

/** 입력 이벤트를 캔버스에 연결한다. */
function bindInput(){
cv.addEventListener('pointerdown',e=>{ cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); dragMoved=0; if(pointers.size===2){ const [a,b]=[...pointers.values()]; pinch0={d:Math.hypot(a.x-b.x,a.y-b.y),z:cam.z}; } });
cv.addEventListener('pointermove',e=>{
  const r=cv.getBoundingClientRect(), sx=e.clientX-r.left, sy=e.clientY-r.top;
  if(!pointers.has(e.pointerId)){ hoverV=pickVillager(sx,sy); cv.classList.toggle('hover',!!hoverV); return; }
  const p=pointers.get(e.pointerId); const dx=e.clientX-p.x, dy=e.clientY-p.y; p.x=e.clientX; p.y=e.clientY;
  if(pointers.size===2&&pinch0){ const [a,b]=[...pointers.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y); const mx=(a.x+b.x)/2-r.left, my=(a.y+b.y)/2-r.top; zoomAt(mx,my,pinch0.z*d/pinch0.d); dragMoved+=99; return; }
  dragMoved+=Math.abs(dx)+Math.abs(dy);
  if(dragMoved>5){ cv.classList.add('drag'); cam.x-=dx/cam.z; cam.y-=dy/cam.z; app.stopFollow(); clampCam(); }
});
const endPtr=e=>{ const r=cv.getBoundingClientRect();
  if(pointers.size===1&&dragMoved<=5){ const v=pickVillager(e.clientX-r.left,e.clientY-r.top); if(v) app.select(v,false); }
  pointers.delete(e.pointerId); if(pointers.size<2) pinch0=null; cv.classList.remove('drag'); };
cv.addEventListener('pointerup',endPtr); cv.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);pinch0=null;});
cv.addEventListener('wheel',e=>{ e.preventDefault(); const r=cv.getBoundingClientRect(); zoomAt(e.clientX-r.left,e.clientY-r.top,cam.z*Math.exp(-e.deltaY*0.0015)); },{passive:false});
}

/** ui.js 가 쓰는 2D 렌더러 인터페이스. */
export function createRenderer2D(){
  return {
    /** 캔버스를 잡고 입력을 연결한다. */
    init(a){ app=a; cv=document.getElementById('world'); ctx=cv.getContext('2d'); stage=document.getElementById('stage'); new ResizeObserver(()=>resize()).observe(stage); bindInput(); resize(); },
    /** 새 마을의 지형을 다시 그린다. */
    onWorld(){ staticCanvas=renderStatic(); parts.length=0; },
    /** 카메라를 마을 광장이 보이는 기본 위치로 둔다. */
    fit(){ fitCamera(true); },
    /** 카메라를 주민에게 옮긴다(집 안이면 문 앞). */
    centerOn(v){ if(!v) return; const vp=v.inside?{x:v.inside.door.x+.5,y:v.inside.door.y+.5}:v; if(cam.z<24) cam.z=Math.max(cam.z,24); cam.x=vp.x; cam.y=vp.y; clampCam(); },
    /** 감정 연출: 하트·김·땀·반짝이·물고기 낚기. */
    fx(v,fx){ if(fx==='catch'){ v.catchT=animT; return; } burst(fx,v.x,v.y+0.28-1.25*K,fx==='heart'?6:fx==='sparkle'?7:3); },
    /** 패널 초상화를 같은 캐릭터 그림으로 그린다. */
    drawPortrait(canvas,v){ const g=canvas.getContext('2d'); g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,canvas.width,canvas.height); const pp=basePose(); pp.face=emotionFace(v); if(v.crush!=null||v.partner!=null) pp.blush=true; drawChar(g,v,pp,canvas.width/2,canvas.height*1.36,canvas.width*1.1); },
    /** 한 프레임 그리기. 따라가기 중이면 카메라가 주민을 부드럽게 쫓는다. */
    frame(now,dt,dtA){
      alpha=app.alpha; animT+=dtA;
      const sel=app.sel;
      if(app.follow&&sel){ const vp=sel.inside?{x:sel.inside.door.x+.5,y:sel.inside.door.y+.5}:{x:drawPos(sel,alpha)[0],y:drawPos(sel,alpha)[1]}; cam.x+=(vp.x-cam.x)*0.12; cam.y+=(vp.y-cam.y)*0.12; clampCam(); }
      render(now,dtA);
    },
  };
}

