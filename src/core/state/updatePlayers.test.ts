import EventEmitter from 'events';
import { TPlayer } from 'squad-rcon';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENTS } from '../../constants';
import { serversState } from '../../serversState';
import { updatePlayers } from './updatePlayers';

const SERVER_ID = 991;

afterEach(() => {
  delete serversState[SERVER_ID];
});

describe('updatePlayers', () => {
  it('emits an identified role change as soon as ListPlayers responds', async () => {
    const coreListener = new EventEmitter();
    const previous = {
      playerID: '1',
      steamID: '76561190000000001',
      eosID: '0002aaa0000000000000000000000001',
      name: 'Pilot test',
      role: 'AFU_Rifleman_01',
      teamID: '1',
      squadID: '2',
      isLeader: false,
    } as TPlayer;
    const current = { ...previous, role: 'AFU_SLPilot_01' } as TPlayer;
    const execute = vi.fn();
    const onRoleChanged = vi.fn();

    serversState[SERVER_ID] = {
      execute,
      coreListener,
      listener: new EventEmitter(),
      players: [previous],
    } as unknown as (typeof serversState)[number];
    coreListener.on(EVENTS.PLAYER_ROLE_CHANGED, onRoleChanged);

    const updating = updatePlayers(SERVER_ID);
    expect(execute).toHaveBeenCalledWith(EVENTS.LIST_PLAYERS);

    coreListener.emit(EVENTS.LIST_PLAYERS, [current]);
    await updating;

    expect(onRoleChanged).toHaveBeenCalledOnce();
    expect(onRoleChanged).toHaveBeenCalledWith({
      player: current,
      oldRole: previous.role,
      newRole: current.role,
      isLeader: false,
    });
    expect(serversState[SERVER_ID].players?.[0].role).toBe(current.role);
  });
});
