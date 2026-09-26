// 3D 판 시작점: 에셋을 모두 불러온 뒤 시작한다.
import { start } from './ui.js';
import { createRenderer3D } from './render3d.js';

const r = createRenderer3D();
const pct = document.getElementById('loadPct');
try {
  await r.load(p => { pct.textContent = Math.round(p * 100) + '%'; });
  document.getElementById('loading').hidden = true;
  start(r);
} catch (e) {
  document.getElementById('loading').textContent = '3D 모델을 불러오지 못했어요: ' + e.message;
  throw e;
}
