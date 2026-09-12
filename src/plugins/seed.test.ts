import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTS } from '../constants';
import { createFakeState, makePlayer } from '../test/fakes';
import seed from './seed';

const setup = (mode = 'now') => {
  const f = createFakeState({
    currentMap: { layer: 'Narva_AAS_v1', level: 'Narva' },
  });
  let dispose = () => {};
  seed.setup({
    state: f.state,
    options: seed.optionsSchema!.parse({
      mode,
      seedLayers: ['Sumari_Seed_v1'],
      broadcastEnabled: false,
    }),
    logger: f.state.logger,
    registerDisposable: (fn) => {
      dispose =
        typeof fn === 'function'
          ? fn
          : () => {
              void fn.dispose();
            };
    },
  });
  const sample = (count = 0) => {
    f.state.players = Array.from({ length: count }, () => makePlayer());
    f.listener.emit(EVENTS.UPDATED_PLAYERS, f.state.players);
  };
  const low = () => {
    vi.advanceTimersByTime(120000);
    sample();
    vi.advanceTimersByTime(30000);
    sample();
    vi.advanceTimersByTime(30000);
    sample();
  };
  const changes = () =>
    f.commands.filter((c) => /^Admin(Change|SetNext)Layer/.test(c));
  return { ...f, sample, low, changes, dispose: () => dispose() };
};

describe('seed safety', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  it('accepts frequent valid updates without counting duplicate bursts', () => {
    const f = setup();
    vi.advanceTimersByTime(120000);
    for (let i = 0; i < 95; i++) {
      f.sample();
      vi.advanceTimersByTime(1000);
    }
    expect(f.changes()).toHaveLength(1);
  });
  it.each(['now', 'next'])(
    'requires stable low population and a fresh final response (%s)',
    (mode) => {
      const f = setup(mode);
      f.low();
      vi.advanceTimersByTime(30001);
      expect(f.changes()).toEqual([]);
      f.sample();
      expect(f.changes()).toHaveLength(1);
      f.sample();
      expect(f.changes()).toHaveLength(1);
    },
  );
  it('ignores zero while a full server loads a new round', () => {
    const f = setup();
    f.sample(100);
    f.state.coreListener.emit(EVENTS.NEW_GAME);
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(30000);
      f.sample();
    }
    f.sample(100);
    vi.advanceTimersByTime(120000);
    expect(f.changes()).toEqual([]);
  });
  it('cancels the countdown when players recover', () => {
    const f = setup();
    f.low();
    f.sample(100);
    vi.advanceTimersByTime(30001);
    f.sample(100);
    expect(f.changes()).toEqual([]);
  });
  it('never switches using stale data after polling stops', () => {
    const f = setup();
    f.low();
    vi.advanceTimersByTime(90000);
    f.sample();
    expect(f.changes()).toEqual([]);
  });
  it('cancels immediately on RCON close and waits after reconnect', () => {
    const f = setup();
    f.low();
    f.state.rcon.rconEmitter.emit('close');
    vi.advanceTimersByTime(30001);
    f.sample();
    f.state.rcon.rconEmitter.emit('connected');
    f.sample();
    vi.advanceTimersByTime(60000);
    f.sample();
    expect(f.changes()).toEqual([]);
  });
  it('blocks between rounds and resets before delayed NEW_GAME forwarding', () => {
    const f = setup();
    f.low();
    f.state.coreListener.emit(EVENTS.ROUND_ENDED);
    vi.advanceTimersByTime(30001);
    f.sample();
    f.state.coreListener.emit(EVENTS.NEW_GAME);
    f.sample();
    expect(f.changes()).toEqual([]);
  });
  it('does not treat unavailable players or map as an empty server', () => {
    const f = setup();
    f.low();
    vi.advanceTimersByTime(30001);
    f.state.currentMap = undefined;
    f.sample();
    expect(f.changes()).toEqual([]);
  });
  it('rechecks the seed layer and removes timers/listeners on disposal', () => {
    const f = setup();
    f.low();
    vi.advanceTimersByTime(30001);
    f.state.currentMap = { level: 'Sumari', layer: 'Sumari_Seed_v1' };
    f.sample();
    expect(f.changes()).toEqual([]);
    f.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(f.state.rcon.rconEmitter.listenerCount('close')).toBe(0);
    expect(f.state.coreListener.listenerCount(EVENTS.NEW_GAME)).toBe(0);
  });
});
