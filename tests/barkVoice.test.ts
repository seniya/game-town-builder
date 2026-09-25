import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/game/EventBus';
import { AudioEngine } from '../src/ui/audio/AudioEngine';
import {
  BARK_HEAR_DISTANCE,
  barkBlips,
  BarkVoiceLimiter,
  barkVolume,
  voiceBase,
} from '../src/ui/audio/barkVoice';
import { GameSounds } from '../src/ui/audio/GameSounds';

describe('주민의 한마디 소리 (TASK-BARK-002, MVP_SPEC 19.7 / 30)', () => {
  it('음 개수는 글자 두 자마다 하나(1~6)이고, 같은 문장·주민이면 같은 음 목록이다', () => {
    expect(barkBlips('아야!', 'farmer', 'f', 'hit')).toHaveLength(1);
    expect(barkBlips('잘 잤다!', 'farmer', 'f', 'wake')).toHaveLength(2); // 글자 3 자
    expect(barkBlips('흙 냄새가 좋아.', 'farmer', 'f', 'idle')).toHaveLength(3); // 6 자
    expect(barkBlips('앉아서 먹을 데가 있으면 좋겠다.', 'cook', 'c', 'eatPlaza')).toHaveLength(6);
    expect(barkBlips('…', 'cook', 'c', 'idle')).toHaveLength(1);
    const a = barkBlips('오늘도 평화롭다.', 'villager', 'villager-4', 'idle');
    expect(barkBlips('오늘도 평화롭다.', 'villager', 'villager-4', 'idle')).toEqual(a);
    // 같은 높이만 이어지지 않는다
    const c = barkBlips('간은 내가 잘 맞춰.', 'cook', 'c', 'idle');
    expect(new Set(c.map((b) => b.freq.toFixed(1))).size).toBeGreaterThan(1);
    // 음은 시간 순서로 겹치지 않는다
    for (let i = 1; i < a.length; i++) {
      const prev = a[i - 1];
      const cur = a[i];
      if (!prev || !cur) throw new Error('음 없음');
      expect(cur.at).toBeGreaterThanOrEqual(prev.at + prev.length);
    }
  });

  it('역할마다 기본 음높이가 다르고(목수 < 농부 < 요리사), 역할 없는 주민은 id 마다 조금 다르다', () => {
    expect(voiceBase('carpenter', 'k')).toBeLessThan(voiceBase('farmer', 'f'));
    expect(voiceBase('farmer', 'f')).toBeLessThan(voiceBase('cook', 'c'));
    const villagers = new Set(
      ['villager-4', 'villager-5', 'villager-6', 'villager-7', 'villager-8'].map((id) =>
        voiceBase('villager', id).toFixed(1),
      ),
    );
    expect(villagers.size).toBeGreaterThan(1);
  });

  it('도피·맞음은 빠르고 높게, 기절은 내려가고, "?" 로 끝나면 끝음이 오른다', () => {
    const text = '몬스터다 숨어라';
    const calm = barkBlips(text, 'farmer', 'f', 'idle');
    const flee = barkBlips(text, 'farmer', 'f', 'flee');
    const mean = (xs: { freq: number }[]): number => xs.reduce((s, x) => s + x.freq, 0) / xs.length;
    expect(mean(flee)).toBeGreaterThan(mean(calm));
    expect(flee.at(-1)?.at ?? 0).toBeLessThan(calm.at(-1)?.at ?? 0);
    const dazed = barkBlips('눈앞이 빙빙 돌아…', 'farmer', 'f', 'stunned');
    for (let i = 1; i < dazed.length; i++) {
      expect(dazed[i]?.freq ?? 0).toBeLessThan(dazed[i - 1]?.freq ?? 0);
    }
    const plain = barkBlips('아직 안 자', 'cook', 'c', 'greet');
    const asks = barkBlips('아직 안 자?', 'cook', 'c', 'greet');
    expect(asks.at(-1)?.freq ?? 0).toBeGreaterThan(plain.at(-1)?.freq ?? 0);
    expect(asks.slice(0, -1)).toEqual(plain.slice(0, -1));
  });

  it('거리에 따라 음량이 줄고 22 칸 밖은 0 이다', () => {
    expect(barkVolume(0)).toBe(1);
    expect(barkVolume(5)).toBeGreaterThan(barkVolume(12));
    expect(barkVolume(12)).toBeGreaterThan(barkVolume(20));
    expect(barkVolume(20)).toBeGreaterThan(0);
    expect(barkVolume(BARK_HEAR_DISTANCE)).toBe(0);
    expect(barkVolume(40)).toBe(0);
    expect(barkVolume(Number.NaN)).toBe(0);
  });

  it('동시에 두 주민까지만 웅얼거린다. 끝난 자리는 다시 쓴다', () => {
    const lim = new BarkVoiceLimiter(2);
    expect(lim.tryStart(0, 0.5)).toBe(true);
    expect(lim.tryStart(0.1, 0.4)).toBe(true);
    expect(lim.tryStart(0.2, 0.6)).toBe(false);
    expect(lim.tryStart(0.45, 0.8)).toBe(true); // 두 번째가 끝났다
    expect(lim.tryStart(0.46, 0.9)).toBe(false);
  });

  it('Web Audio 가 없거나 음소거여도 한마디 이벤트가 오류 없이 지나간다', async () => {
    const engine = new AudioEngine();
    const events = new EventBus();
    new GameSounds(engine, events, () => ({ role: 'farmer', distance: 3 }));
    engine.setMuted(true);
    expect(() =>
      events.emit('NPC_BARK', { npcId: 'f', topic: 'greet', text: '안녕!' }),
    ).not.toThrow();
    await Promise.resolve(); // 소리는 마이크로태스크로 미룬다
    expect(engine.ctx).toBeNull();
  });
});
