// 스타일 시안 장면 부트스트랩 (STYLE-001, MVP_SPEC 45.1). main.ts 가 ?scene=style-lab 일 때만 불러온다.
// render(StyleLab) 와 ui(StyleLabPanel) 를 잇는다. 게임 월드·저장·오디오를 만들지 않는다.
//   URL: &view=0~5 (주민·가구·블록·전경·얼굴·마을 사람), &pose=idle|walk|cook|sit|work, &steps=2|3, &outline=0|1, &dpr=
import { StyleLab, type LabPose } from './render/style/StyleLab';
import { StyleLabPanel } from './ui/StyleLabPanel';

const LAB_POSES: readonly LabPose[] = ['idle', 'walk', 'cook', 'sit', 'work'];

/** URL 의 자세 값. 모르는 값이면 서기다. */
function poseFromParam(v: string | null): LabPose {
  return LAB_POSES.find((p) => p === v) ?? 'idle';
}

/** 시안 장면을 시작한다. */
export function startStyleLab(canvas: HTMLCanvasElement, params: URLSearchParams): void {
  const lab = new StyleLab(canvas, { maxPixelRatio: Number(params.get('dpr') ?? 2) });
  const panel = new StyleLabPanel(lab, {
    pose: poseFromParam(params.get('pose')),
    steps: params.get('steps') === '2' ? 2 : 3,
    outline: params.get('outline') !== '0',
    view: Math.max(0, Math.min(5, Number(params.get('view') ?? 0) || 0)),
  });

  // 끌어서 돌리기·휠 확대
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    lab.rotateBy(e.clientX - drag.x, e.clientY - drag.y);
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', () => (drag = null));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    lab.zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1);
  });

  let last = performance.now();
  let reported = false;
  let sinceStats = 0;
  const probe = { styleLab: lab.stats() };
  (window as unknown as { __gtb: unknown }).__gtb = probe;
  /** 한 프레임: 진행 → 그리기 → 이름표·계측. */
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    lab.update(dt);
    lab.render();
    panel.updateLabels(lab.labels());
    sinceStats += dt;
    if (sinceStats > 0.5) {
      sinceStats = 0;
      const s = lab.stats();
      probe.styleLab = s;
      const v = s.variants;
      panel.setStats(
        `드로우콜 ${s.drawCalls} · 한 명: 지금 ${s.currentFigureDrawCalls} / 시안 A ${v.A.drawCalls} (삼각형 ${v.A.triangles})`,
      );
      if (!reported && now > 3000) {
        reported = true;
        console.info('[gtb] STYLE-LAB 계측', JSON.stringify(s));
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
