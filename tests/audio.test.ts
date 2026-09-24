import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/game/data/blocks';
import { EventBus } from '../src/game/EventBus';
import { AudioEngine } from '../src/ui/audio/AudioEngine';
import { GameSounds, isNight } from '../src/ui/audio/GameSounds';
import { soundMaterial } from '../src/ui/audio/soundMaterial';

describe('오디오 (TASK-050, MVP_SPEC 30)', () => {
  it('블록 파괴·설치 소리는 재질 4 종으로 나뉜다', () => {
    expect(soundMaterial(BlockId.plank)).toBe('wood');
    expect(soundMaterial(BlockId.door)).toBe('wood');
    expect(soundMaterial(BlockId.stone)).toBe('stone');
    expect(soundMaterial(BlockId.stone_brick)).toBe('stone');
    expect(soundMaterial(BlockId.dirt)).toBe('soil');
    expect(soundMaterial(BlockId.grass)).toBe('soil');
    expect(soundMaterial(BlockId.leaves)).toBe('soil');
    expect(soundMaterial(BlockId.window)).toBe('glass');
    const kinds = new Set(Object.values(BlockId).map((id) => soundMaterial(id)));
    expect([...kinds].sort()).toEqual(['glass', 'soil', 'stone', 'wood']);
  });

  it('밤 BGM 은 저녁·밤, 낮 BGM 은 그 밖이다', () => {
    expect(isNight('night')).toBe(true);
    expect(isNight('evening')).toBe(true);
    expect(isNight('morning')).toBe(false);
    expect(isNight('dawn')).toBe(false);
  });

  it('Web Audio 가 없는 환경에서도 소리 이벤트와 음소거가 오류 없이 지나간다', () => {
    const engine = new AudioEngine();
    const events = new EventBus();
    const sounds = new GameSounds(engine, events);
    events.emit('ROOM_REGISTERED', { roomId: 'r', type: 'Bedroom' });
    events.emit('VILLAGE_LEVEL_UP', { level: 2, unlocked: [] });
    sounds.update(1 / 30, 0.1, BlockId.grass);
    expect(engine.ctx).toBeNull();
    const seen: boolean[] = [];
    engine.onMuteChange((m) => seen.push(m));
    expect(() => engine.setMuted(true)).not.toThrow();
    expect(engine.muted).toBe(true);
    engine.setMuted(false);
    expect(seen).toEqual([true, false]);
  });
});
