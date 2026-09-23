// 방 진단 문구 오버레이 (TASK-022, MVP_SPEC 11.5 / 29). DOM 만 쓴다. 모달이 아니며 조작을 막지 않는다.
// 진단 결과는 게임(RoomRegistry)이 계산하고, 이 패널은 주입된 조회로 읽어 문구만 보여준다.
// 좌표 하이라이트는 render/RoomOverlayView 가 같은 결과로 그린다.
import { roomDisplayName } from '../game/data/roomRecipes';
import type { RoomDiagnostic, RoomFailure } from '../game/types';

/** 패널이 읽는 조회. */
export interface RoomDiagnosticPort {
  active(): boolean;
  diagnosis(): { pending: boolean; result: RoomDiagnostic | null };
}

/** 한 결과의 제목·설명 문구. */
export interface DiagnosticText {
  readonly title: string;
  readonly detail: string;
  readonly ok: boolean;
}

/** 실패 사유별 문구 (MVP_SPEC 11.5, GAME_DESIGN 7.4). */
function failureText(f: RoomFailure, detail: RoomDiagnostic['failureDetail']): DiagnosticText {
  switch (f.reason) {
    case 'NOT_ENCLOSED':
      if (detail === 'notWall') {
        return {
          ok: false,
          title: '이 블록은 방의 벽으로 인정되지 않습니다',
          detail: '붉은 칸을 판자·돌벽돌·창문·문으로 바꾸세요. 흙·돌 같은 지형은 벽이 아닙니다',
        };
      }
      return {
        ok: false,
        title: '공간이 열려 있거나 너무 큽니다',
        detail: '노란 점은 탐색이 밖으로 이어진 길입니다. 그 길 근처에서 빠진 벽을 찾아 막으세요',
      };
    case 'TOO_LARGE':
      return {
        ok: false,
        title: '공간이 열려 있거나 너무 큽니다',
        detail: '바닥이 100칸을 넘었습니다. 노란 점이 지나간 곳에 틈이 있거나 방이 너무 넓습니다',
      };
    case 'NO_FLOOR':
      return {
        ok: false,
        title: '바닥에 구멍이 있습니다',
        detail: '붉은 칸에 블록을 놓아 바닥을 채우세요',
      };
    case 'WALL_TOO_LOW':
      return {
        ok: false,
        title: '벽 높이가 부족합니다',
        detail: '벽은 두 칸 높이여야 합니다. 붉은 칸을 채우세요',
      };
    case 'NO_DOOR':
      return {
        ok: false,
        title: '문이 없습니다',
        detail: '벽 한 곳의 두 칸을 비우고 문을 다세요',
      };
    case 'TOO_SMALL':
      return {
        ok: false,
        title: '방이 너무 작습니다',
        detail: '바닥이 최소 2 × 2 (4칸) 이어야 합니다',
      };
  }
}

/** 진단 결과를 문구로 바꾼다. 순수 함수라 테스트할 수 있다. */
export function describeDiagnostic(d: RoomDiagnostic): DiagnosticText {
  if (!d.detection.ok) return failureText(d.detection.failure, d.failureDetail);
  const name = roomDisplayName(d.roomType ?? 'EmptyRoom');
  const area = d.detection.shape.interior.length;
  return { ok: true, title: `${name} — 방으로 인정됩니다`, detail: `바닥 ${area}칸` };
}

/** Tab 진단 오버레이. */
export class RoomDiagnosticPanel {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly detail: HTMLDivElement;
  private readonly issues: HTMLUListElement;
  private readonly hint: HTMLDivElement;
  private lastKey = '';

  /** parent 에 패널과 Tab 안내를 붙인다. */
  constructor(
    parent: HTMLElement,
    private readonly port: RoomDiagnosticPort,
  ) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '50%',
      top: '14px',
      transform: 'translateX(-50%)',
      minWidth: '320px',
      maxWidth: '560px',
      padding: '10px 16px 12px',
      borderRadius: '10px',
      background: 'rgba(20, 22, 26, 0.8)',
      color: '#f4efe2',
      font: '14px system-ui, sans-serif',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '20',
    });
    const head = document.createElement('div');
    Object.assign(head.style, { fontSize: '11px', opacity: '0.7', marginBottom: '4px' });
    head.textContent = '방 진단 (Tab 으로 닫기)';
    this.title = document.createElement('div');
    Object.assign(this.title.style, { fontSize: '17px', fontWeight: '700' });
    this.detail = document.createElement('div');
    Object.assign(this.detail.style, { marginTop: '4px', opacity: '0.9' });
    this.issues = document.createElement('ul');
    Object.assign(this.issues.style, { margin: '6px 0 0', paddingLeft: '18px', color: '#ffc27a' });
    this.root.append(head, this.title, this.detail, this.issues);
    this.hint = document.createElement('div');
    Object.assign(this.hint.style, {
      position: 'fixed',
      left: '12px',
      bottom: '12px',
      padding: '3px 8px',
      borderRadius: '6px',
      background: 'rgba(20, 22, 26, 0.5)',
      color: '#f4efe2',
      font: '12px system-ui, sans-serif',
      pointerEvents: 'none',
      zIndex: '20',
    });
    this.hint.textContent = 'Tab 방 진단';
    parent.append(this.root, this.hint);
  }

  /** 진단 상태를 반영한다. 바뀐 경우에만 DOM 을 고친다. */
  update(): void {
    const active = this.port.active();
    this.root.style.display = active ? 'block' : 'none';
    this.hint.style.display = active ? 'none' : 'block';
    if (!active) {
      this.lastKey = '';
      return;
    }
    const { pending, result } = this.port.diagnosis();
    if (!result) {
      const key = pending ? 'pending' : 'none';
      if (key === this.lastKey) return;
      this.lastKey = key;
      this.title.textContent = '살펴보는 중…';
      this.title.style.color = '#f4efe2';
      this.detail.textContent = '';
      this.issues.replaceChildren();
      return;
    }
    const text = describeDiagnostic(result);
    const key = `${text.title}|${text.detail}|${result.facilityIssues.map((i) => i.message).join('|')}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.title.textContent = text.title;
    this.title.style.color = text.ok ? '#8ff0a8' : '#ff9a8a';
    this.detail.textContent = text.detail;
    this.issues.replaceChildren(
      ...result.facilityIssues.map((i) => {
        const li = document.createElement('li');
        li.textContent = i.message;
        return li;
      }),
    );
  }
}
