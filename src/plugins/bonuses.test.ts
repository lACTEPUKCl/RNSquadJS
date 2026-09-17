import { afterEach, expect, it, vi } from 'vitest';
import { EVENTS } from '../constants';
import { createFakeState, makePlayer } from '../test/fakes';
import plugin from './bonuses';
import { updateUserBonuses } from '../rnsdb';
vi.mock('../rnsdb', () => ({ createUserIfNullableOrUpdateName: vi.fn(), updateTimes: vi.fn(), updateUserBonuses: vi.fn() }));
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.clearAllMocks(); });
function setup() {
  vi.useFakeTimers();
  const player = makePlayer();
  const f = createFakeState({ players: [player], currentMap: { level: 'Sumari', layer: 'Sumari_Seed_v1' } });
  plugin.setup({ state: f.state, options: { classicBonus: 1, seedBonus: 2 }, logger: f.state.logger, registerDisposable: () => {} } as any);
  f.listener.emit(EVENTS.UPDATED_PLAYERS);
  return { ...f, player };
}
it('pays one full minute with current seed map', async () => {
  const f = setup();
  await vi.advanceTimersByTimeAsync(60000);
  expect(updateUserBonuses).toHaveBeenCalledWith(1, f.player.steamID, 2, true);
});
it('disconnect suppresses payment even before roster refresh', async () => {
  const f = setup();
  f.listener.emit(EVENTS.PLAYER_DISCONNECTED, { eosID: f.player.eosID });
  await vi.advanceTimersByTimeAsync(60000);
  expect(updateUserBonuses).not.toHaveBeenCalled();
});
it('does not keep paying when roster updates stop', async () => {
  setup();
  await vi.advanceTimersByTimeAsync(180000);
  expect(updateUserBonuses).toHaveBeenCalledTimes(1);
});
