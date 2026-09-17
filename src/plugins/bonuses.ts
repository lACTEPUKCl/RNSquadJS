import { TPlayerConnected } from 'squad-logs';
import { z } from 'zod';
import { EVENTS } from '../constants';
import { definePlugin } from '../core/plugin';
import {
  createUserIfNullableOrUpdateName,
  updateTimes,
  updateUserBonuses,
} from '../rnsdb';
import { getPlayerByEOSID, getPlayerBySteamID } from './helpers';

const optionsSchema = z.object({
  classicBonus: z.coerce.number().default(0),
  seedBonus: z.coerce.number().default(0),
});

export default definePlugin({
  name: 'bonuses',
  description: 'Начисление бонусов за время на сервере.',
  optionsSchema,
  setup({ state, options, registerDisposable }) {
    const { listener } = state;
    const { classicBonus, seedBonus } = options;
    let rosterUpdatedAt = 0;
    const disconnected = new Set<string>();
    let playersBonusesCurrentTime: Array<{
      steamID: string;
      timer: NodeJS.Timeout;
    }> = [];

    const playerConnected = async (data: TPlayerConnected) => {
      const { steamID, eosID } = data;
      if (!steamID) return;
      disconnected.delete(steamID);

      const user = getPlayerByEOSID(state, eosID);
      const name = user?.name || '';

      await createUserIfNullableOrUpdateName(state.id, steamID, name, eosID);
    };

    const updatedPlayers = () => {
      rosterUpdatedAt = Date.now();
      const { players, id } = state;
      if (!players) return;

      players.forEach((e) => {
        const { steamID } = e;
        if (!steamID) return;
        const user = getPlayerBySteamID(state, steamID);
        if (!user) return;
        if (playersBonusesCurrentTime.find((p) => p.steamID === steamID))
          return;

        playersBonusesCurrentTime.push({
          steamID,
          timer: setInterval(async () => {
            // Do not award on a stale captured player after disconnect.
            if (disconnected.has(steamID) || Date.now() - rosterUpdatedAt > 90000 || !getPlayerBySteamID(state, steamID)) return;
            try {
            const isSeed = state.currentMap?.layer
              ?.toLowerCase()
              .includes('seed');
            if (isSeed) {
              await updateUserBonuses(id, steamID, seedBonus, true);
              await updateTimes(id, steamID, 'seed', user.name);
            } else {
              await updateUserBonuses(id, steamID, classicBonus);
            }
            } catch (error) {
              console.error('[bonuses] accrual failed', id, steamID, String(error));
            }
          }, 60000),
        });
      });

      playersBonusesCurrentTime = playersBonusesCurrentTime.filter((e) => {
        const currentUser = players.find((c) => c.steamID === e.steamID);
        if (!currentUser) {
          clearInterval(e.timer);
          return false;
        }
        return true;
      });
    };

    listener.on(EVENTS.PLAYER_CONNECTED, playerConnected);
    const onDisconnected = (data: { steamID?: string; eosID?: string }) => {
      const steamID = data.steamID || (data.eosID && getPlayerByEOSID(state, data.eosID)?.steamID);
      if (steamID) disconnected.add(steamID);
    };
    listener.on(EVENTS.PLAYER_DISCONNECTED, onDisconnected);
    listener.on(EVENTS.UPDATED_PLAYERS, updatedPlayers);

    registerDisposable(() => {
      listener.off(EVENTS.PLAYER_CONNECTED, playerConnected);
      listener.off(EVENTS.PLAYER_DISCONNECTED, onDisconnected);
      listener.off(EVENTS.UPDATED_PLAYERS, updatedPlayers);
      for (const p of playersBonusesCurrentTime) clearInterval(p.timer);
      playersBonusesCurrentTime = [];
    });
  },
});
