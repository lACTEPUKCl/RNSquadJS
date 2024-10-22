import { TPlayerConnected } from 'squad-logs';
import { EVENTS } from '../constants';
import {
  createUserIfNullableOrUpdateName,
  updateTimes,
  updateUserBonuses,
} from '../rnsdb';
import { TPluginProps } from '../types';
import { getPlayerByEOSID, getPlayerBySteamID } from './helpers';

export const bonuses: TPluginProps = (state, options) => {
  const { listener } = state;
  const { classicBonus, seedBonus } = options;
  let playersBonusesCurrentTime: Array<{
    steamID: string;
    timer: NodeJS.Timeout;
  }> = [];

  const playerConnected = async (data: TPlayerConnected) => {
    const user = getPlayerByEOSID(state, data.eosID);
    if (!user) return;
    const { steamID, name } = user;
    await createUserIfNullableOrUpdateName(steamID, name);
  };

  const updatedPlayers = () => {
    const { players, currentMap, id } = state;
    if (!players) return;
    players.forEach((e) => {
      const { steamID } = e;
      if (!steamID) return;
      const user = getPlayerBySteamID(state, steamID);
      if (!user) return;
      if (
        playersBonusesCurrentTime.find(
          (e: { steamID: string }) => e.steamID === steamID,
        )
      )
        return;
      playersBonusesCurrentTime.push({
        steamID,
        timer: setInterval(async () => {
          if (currentMap?.layer?.toLowerCase().includes('seed')) {
            await updateUserBonuses(steamID, seedBonus, id);
            await updateTimes(steamID, 'seed', user.name);
          } else {
            await updateUserBonuses(steamID, classicBonus, id);
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

      return e;
    });
  };

  listener.on(EVENTS.PLAYER_CONNECTED, playerConnected);
  listener.on(EVENTS.UPDATED_PLAYERS, updatedPlayers);
};
