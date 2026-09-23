// 게임 시계 (MVP_SPEC 20, ARCHITECTURE 4.1 의 1 번, 15). 시간은 gameMinutes 단일 누적값이다.
// 모든 시각·날·시간대는 여기의 순수 함수로 파생한다. 시간은 앞으로만 간다 (MVP_SPEC 20.3).
import { balance } from '../data/balance';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type { DayPhase, GameClockReader } from '../types';

const C = balance.clock;
/** 하루의 분. */
export const MINUTES_PER_DAY = 24 * 60;
/** gameMinutes=0 의 시각(그날 00:00 부터의 분). */
const START_MINUTE_OF_DAY = C.startHour * 60;

/** 시작일 00:00 부터의 분. gameMinutes=0 은 startDay 의 startHour 다 (MVP_SPEC 20). */
export function absoluteMinutes(gameMinutes: number): number {
  return START_MINUTE_OF_DAY + gameMinutes;
}

/** gameMinutes 의 날 번호. Day 1 부터 시작한다. */
export function dayOf(gameMinutes: number): number {
  return C.startDay + Math.floor(absoluteMinutes(gameMinutes) / MINUTES_PER_DAY);
}

/** gameMinutes 의 그날 00:00 부터의 분 (0 이상 1440 미만). */
export function minuteOfDayOf(gameMinutes: number): number {
  const m = absoluteMinutes(gameMinutes) % MINUTES_PER_DAY;
  return m < 0 ? m + MINUTES_PER_DAY : m;
}

/** 시간대의 시작 시각(시) 표. 시각 순서이며 night 는 자정을 넘어 dawn 앞까지 이어진다 (MVP_SPEC 20.1). */
const PHASE_STARTS: readonly (readonly [DayPhase, number])[] = [
  ['dawn', C.wakeHour],
  ['morning', C.workStartHour],
  ['noon', C.lunchStartHour],
  ['afternoon', C.lunchEndHour],
  ['evening', C.dinnerStartHour],
  ['night', C.sleepStartHour],
];

/** 그날 분(minuteOfDay)의 시간대. */
export function phaseAt(minuteOfDay: number): DayPhase {
  let phase: DayPhase = 'night';
  for (const [p, hour] of PHASE_STARTS) {
    if (minuteOfDay >= hour * 60) phase = p;
  }
  return phase;
}

/**
 * gameMinutes 이전(같은 시각 포함)의 가장 최근 hour:00 경계가 속한 날 번호.
 * 경계 시각을 막 넘은 순간 그날 번호가 되고, 다음 날 같은 시각 전까지 유지된다.
 * 채석장 재생 키(MVP_SPEC 14.3)와 nightId(20:00 의 day, MVP_SPEC 22) 가 이 함수를 쓴다.
 */
export function latestBoundaryDay(gameMinutes: number, hour: number): number {
  return C.startDay + Math.floor((absoluteMinutes(gameMinutes) - hour * 60) / MINUTES_PER_DAY);
}

/**
 * from 뒤에 처음 오는 (hour, minute) 까지의 gameMinutes. 이미 그 시각이면 다음 날이다.
 * 시각 강제 설정은 앞으로만 간다 (MVP_SPEC 20.3).
 */
export function nextOccurrence(from: number, hour: number, minute = 0): number {
  const target = hour * 60 + minute;
  let delta = target - minuteOfDayOf(from);
  if (delta <= 0) delta += MINUTES_PER_DAY;
  return from + delta;
}

/** "Day N HH:MM" 표시 (MVP_SPEC 29). 분은 내림한다. */
export function formatClock(gameMinutes: number): string {
  const m = Math.floor(minuteOfDayOf(gameMinutes));
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `Day ${dayOf(gameMinutes)} ${hh}:${mm}`;
}

/** 허용된 디버그 배속 (MVP_SPEC 20.2). */
export type TimeScale = (typeof C.debugTimeScales)[number];

/** 시간을 진행시키고 시간대가 바뀔 때만 DAY_PHASE_CHANGED 를 발행한다. */
export class GameClockSystem implements SlotSystem, GameClockReader {
  private minutes: number;
  private currentPhase: DayPhase;
  private scale: TimeScale = 1;

  /** 이벤트 버스와 시작 gameMinutes(기본 0 = Day 1 07:00)를 받는다. 생성 시에는 발행하지 않는다. */
  constructor(
    private readonly events: EventBus,
    startGameMinutes = 0,
  ) {
    if (!(startGameMinutes >= 0))
      throw new RangeError(`시작 시각이 잘못되었다: ${startGameMinutes}`);
    this.minutes = startGameMinutes;
    this.currentPhase = phaseAt(minuteOfDayOf(startGameMinutes));
  }

  /** 누적 게임분. */
  get gameMinutes(): number {
    return this.minutes;
  }

  /** 날 번호. */
  get day(): number {
    return dayOf(this.minutes);
  }

  /** 그날 분. */
  get minuteOfDay(): number {
    return minuteOfDayOf(this.minutes);
  }

  /** 현재 시간대. */
  get phase(): DayPhase {
    return this.currentPhase;
  }

  /** 디버그 배속. */
  get timeScale(): TimeScale {
    return this.scale;
  }

  /** 디버그 배속을 바꾼다. 허용 목록(1 / 4 / 16) 밖이면 거부한다. */
  setTimeScale(scale: number): boolean {
    const allowed = C.debugTimeScales.find((s) => s === scale);
    if (allowed === undefined) return false;
    this.scale = allowed;
    return true;
  }

  /** 실시간 dt 초만큼 진행한다. 25 실초 = 1 게임시간 (MVP_SPEC 20). */
  update(dt: number): void {
    if (!(dt > 0)) return;
    this.setMinutes(this.minutes + (dt * this.scale * 60) / C.secondsPerGameHour);
  }

  /**
   * 디버그 시각 강제 설정: 다음 도래하는 hour:minute 로 앞당긴다 (MVP_SPEC 20.3).
   * 여러 시간대를 지나도 최종 시간대로 한 번만 발행한다.
   */
  advanceTo(hour: number, minute = 0): void {
    this.setMinutes(nextOccurrence(this.minutes, hour, minute));
  }

  /**
   * 로드 복원. 저장된 gameMinutes 로 바꾸고 시간대를 조용히 맞춘다 (로드 중 이벤트 없음, ARCHITECTURE 23.4).
   * 로드는 다른 슬롯이므로 앞으로만 가는 규칙의 예외다.
   */
  restore(gameMinutes: number): void {
    if (!(gameMinutes >= 0)) throw new RangeError(`저장된 시각이 잘못되었다: ${gameMinutes}`);
    this.minutes = gameMinutes;
    this.currentPhase = phaseAt(minuteOfDayOf(gameMinutes));
  }

  /** 시각을 앞으로 바꾸고 시간대 전이를 발행한다. */
  private setMinutes(next: number): void {
    if (next < this.minutes) throw new RangeError('게임 시간은 앞으로만 간다 (MVP_SPEC 20.3)');
    this.minutes = next;
    const phase = phaseAt(minuteOfDayOf(next));
    if (phase !== this.currentPhase) {
      this.currentPhase = phase;
      this.events.emit('DAY_PHASE_CHANGED', { phase });
    }
  }
}
