import EventEmitter from 'events';
import { afterEach, expect, it, vi } from 'vitest';
import { EVENTS, UPDATERS_REJECT_TIMEOUT } from '../../constants';
import { updateCurrentMap } from './updateCurrentMap';
const fake = vi.hoisted(() => ({ state: null as any }));
vi.mock('../../serversState', () => ({ getServersState: () => fake.state }));
afterEach(() => vi.useRealTimers());
it('captures a synchronous map reply before sending and leaves no listener', async () => {
  const emitter = new EventEmitter();
  const map = { level: 'Sumari Bala', layer: 'Sumari_Seed_v1' };
  fake.state = {
    currentMap: { level: 'Narva', layer: 'Narva_AAS_v1' },
    coreListener: emitter,
    logger: { log: vi.fn() },
    execute: vi.fn(() => {
      emitter.emit(EVENTS.SHOW_CURRENT_MAP, map);
      return Promise.resolve('');
    }),
  };
  expect(await updateCurrentMap(1)).toBe(true);
  expect(fake.state.currentMap).toEqual(map);
  expect(emitter.listenerCount(EVENTS.SHOW_CURRENT_MAP)).toBe(0);
});
it('timeout clears obsolete map, removes subscription and permits a fresh retry', async () => {
  vi.useFakeTimers();
  const emitter = new EventEmitter();
  fake.state = {
    currentMap: { level: 'Narva', layer: 'Narva_AAS_v1' },
    coreListener: emitter,
    logger: { log: vi.fn() },
    execute: vi.fn(() => Promise.resolve('')),
  };
  const pending = updateCurrentMap(1);
  await vi.advanceTimersByTimeAsync(UPDATERS_REJECT_TIMEOUT);
  expect(await pending).toBe(false);
  expect(fake.state.currentMap.layer).toBeNull();
  expect(emitter.listenerCount(EVENTS.SHOW_CURRENT_MAP)).toBe(0);
  const retry = updateCurrentMap(1);
  emitter.emit(EVENTS.SHOW_CURRENT_MAP, {
    level: 'Sumari Bala',
    layer: 'Sumari_Seed_v1',
  });
  expect(await retry).toBe(true);
});
