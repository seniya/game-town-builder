// 진행 이벤트의 정본 순서 (MVP_SPEC 27.1). 목표는 이 순서로만 전진한다 (ARCHITECTURE 21.1, ADR 020).
import type { GameEventId } from '../types';

/** 표의 순서. */
export const GAME_EVENT_ORDER: readonly GameEventId[] = [
  'EVENT_ARRIVAL',
  'EVENT_FARM_REQUEST',
  'EVENT_KITCHEN_REQUEST',
  'EVENT_BEDROOM_REQUEST',
  'EVENT_BELL_REQUEST',
  'EVENT_WALL_REQUEST',
  'EVENT_NEW_RESIDENT',
  'EVENT_SLICE_END',
];

/** 이벤트의 순번(0 부터). */
export function eventRank(id: GameEventId): number {
  return GAME_EVENT_ORDER.indexOf(id);
}
