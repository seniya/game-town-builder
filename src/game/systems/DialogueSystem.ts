// 대사 (MVP_SPEC 27.4, ARCHITECTURE 21, ADR 010 / 035, TASK-040). 화자별 미완료 대사 목록과 완료 id 집합의 소유자다.
// 표시 등록은 id 로 중복을 없애고 기존 미완료 대사를 덮어쓰지 않는다. 같은 화자의 목록은 등록 순서대로 읽는다.
// 대화 종료 때 완료를 기록한 뒤 dialogueId 를 담은 DIALOGUE_ENDED 를 발행한다. 해금이나 보상을 주지 않는다.
import { dialogueById } from '../data/dialogues';
import type { EventBus } from '../EventBus';
import type { DialogueDefinition, NPCRole } from '../types';

/** 창립 주민의 역할은 화자 키가 역할 이름이다(대사 데이터가 역할로 부른다, ADR 035). */
const FOUNDER_ROLES: ReadonlySet<NPCRole> = new Set<NPCRole>(['farmer', 'cook', 'carpenter']);

/** 이 주민의 화자 키. */
export function speakerKey(npc: { readonly id: string; readonly role: NPCRole }): string {
  return FOUNDER_ROLES.has(npc.role) ? npc.role : npc.id;
}

/** 진행 중인 대화. */
export interface ActiveDialogue {
  readonly npcId: string;
  readonly dialogue: DialogueDefinition;
  readonly line: number;
}

/** 저장 단위 (SaveData.completedDialogues / availableDialogues). */
export interface DialogueSnapshot {
  readonly completed: readonly string[];
  readonly available: readonly { readonly npcId: string; readonly dialogueId: string }[];
}

/** 대화 표시·재생·완료. */
export class DialogueSystem {
  /** 화자 키 → 미완료 대사 id(등록 순서) */
  private readonly pending = new Map<string, string[]>();
  private readonly completed = new Set<string>();
  private current: ActiveDialogue | null = null;

  /** 이벤트 버스를 받는다. */
  constructor(private readonly events: EventBus) {}

  /** 진행 중인 대화. 없으면 null. */
  get active(): ActiveDialogue | null {
    return this.current;
  }

  /**
   * 대화 표시를 등록한다. 모르는 id·이미 완료·이미 등록된 id 이면 false. 기존 미완료 대사 뒤에 붙는다.
   * 화자 키는 대사 데이터의 npcId 다.
   */
  markAvailable(dialogueId: string): boolean {
    const d = dialogueById(dialogueId);
    if (!d || this.completed.has(dialogueId)) return false;
    const list = this.pending.get(d.npcId) ?? [];
    if (list.includes(dialogueId)) return false;
    list.push(dialogueId);
    this.pending.set(d.npcId, list);
    return true;
  }

  /** 이 주민에게 들을 대사가 있는가(머리 위 대화 표시). */
  hasDialogue(npc: { readonly id: string; readonly role: NPCRole }): boolean {
    return (this.pending.get(speakerKey(npc))?.length ?? 0) > 0;
  }

  /** 완료한 대사 id 집합(읽기 전용 복사본). 진행 이벤트 조건이 읽는다. */
  completedIds(): ReadonlySet<string> {
    return new Set(this.completed);
  }

  /** 완료한 대사인가. */
  isCompleted(dialogueId: string): boolean {
    return this.completed.has(dialogueId);
  }

  /**
   * 이 주민의 첫 미완료 대사를 시작한다. 대사가 없거나 이미 대화 중이면 null. DIALOGUE_STARTED 를 발행한다.
   */
  begin(npc: { readonly id: string; readonly role: NPCRole }): ActiveDialogue | null {
    if (this.current) return null;
    const id = this.pending.get(speakerKey(npc))?.[0];
    const d = id ? dialogueById(id) : undefined;
    if (!d) return null;
    this.current = { npcId: npc.id, dialogue: d, line: 0 };
    this.events.emit('DIALOGUE_STARTED', { npcId: npc.id, dialogueId: d.id, lines: [...d.lines] });
    return this.current;
  }

  /** 다음 줄로 넘긴다. 마지막 줄 뒤면 대화를 끝내고 null. */
  advance(): ActiveDialogue | null {
    const c = this.current;
    if (!c) return null;
    if (c.line + 1 < c.dialogue.lines.length) {
      this.current = { ...c, line: c.line + 1 };
      return this.current;
    }
    this.finish();
    return null;
  }

  /** 대화를 끝낸다: 미완료 목록에서 빼고 완료를 기록한 뒤 DIALOGUE_ENDED 를 발행한다. 대화 중이 아니면 아무것도 하지 않는다. */
  finish(): void {
    const c = this.current;
    if (!c) return;
    this.current = null;
    const d = c.dialogue;
    const list = (this.pending.get(d.npcId) ?? []).filter((x) => x !== d.id);
    if (list.length > 0) this.pending.set(d.npcId, list);
    else this.pending.delete(d.npcId);
    this.completed.add(d.id);
    this.events.emit('DIALOGUE_ENDED', { npcId: c.npcId, dialogueId: d.id });
  }

  /** 대화를 끝까지 읽지 않고 닫았다(Esc·기절). 완료로 기록하지 않고 대사는 미완료 목록에 남는다. */
  abort(): void {
    this.current = null;
  }

  /** 저장용 스냅샷. */
  snapshot(): DialogueSnapshot {
    const available: { npcId: string; dialogueId: string }[] = [];
    for (const [npcId, ids] of this.pending)
      for (const dialogueId of ids) available.push({ npcId, dialogueId });
    return { completed: [...this.completed], available };
  }

  /** 로드 복원. 진행 중인 대화는 버린다. */
  restore(s: DialogueSnapshot): void {
    this.current = null;
    this.completed.clear();
    for (const id of s.completed) this.completed.add(id);
    this.pending.clear();
    for (const a of s.available) {
      const list = this.pending.get(a.npcId) ?? [];
      if (!list.includes(a.dialogueId) && !this.completed.has(a.dialogueId))
        list.push(a.dialogueId);
      this.pending.set(a.npcId, list);
    }
  }
}
