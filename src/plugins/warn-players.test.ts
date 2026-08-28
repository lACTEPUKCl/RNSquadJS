import { afterEach, describe, expect, it } from 'vitest';
import { EVENTS } from '../constants';
import { PluginManager } from '../core/plugin/manager';
import { createFakeState, makePlayer } from '../test/fakes';
import warnPlayers from './warn-players';

describe('warnPlayers role warnings', () => {
  let manager: PluginManager | null = null;

  afterEach(async () => {
    await manager?.destroyAll();
    manager = null;
  });

  it('leaves Pilot to the site automation while preserving other legacy role warnings', async () => {
    const { state, listener, commands } = createFakeState();
    manager = new PluginManager(state, state.logger);
    await manager.init([
      {
        descriptor: warnPlayers,
        enabled: true,
        rawOptions: {
          roleChangedMessage: [
            ['Pilot', 'legacy pilot warning'],
            ['Crewman', 'crewman warning'],
          ],
        },
      },
    ]);

    listener.emit(EVENTS.PLAYER_ROLE_CHANGED, {
      player: makePlayer({ role: 'AFU_SLPilot_01' }),
    });
    expect(commands).toEqual([]);

    listener.emit(EVENTS.PLAYER_ROLE_CHANGED, {
      player: makePlayer({ role: 'AFU_Crewman_01' }),
    });
    expect(commands).toEqual(['AdminWarn 7656119000000000 crewman warning']);
  });
});
