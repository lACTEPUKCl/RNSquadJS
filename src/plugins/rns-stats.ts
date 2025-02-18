import { TPlayerDied, TPlayerRevived, TRoundTickets } from 'squad-logs';
import { EVENTS } from '../constants';
import { adminWarn } from '../core';
import {
  creatingTimeStamp,
  getUserDataWithSteamID,
  updateGames,
  updatePossess,
  updateRoles,
  updateTimes,
  updateUser,
} from '../rnsdb';
import { TPlayer, TPluginProps } from '../types';
import {
  getPlayerByEOSID,
  getPlayerByName,
  getPlayerBySteamID,
  getSquadByID,
} from './helpers';

export const rnsStats: TPluginProps = (state) => {
  const { listener, execute, logger, id } = state;
  let playersCurrenTime: Array<{
    steamID: string;
    timer: NodeJS.Timeout;
  }> = [];
  let winner: string;

  const onRoundTickets = (data: TRoundTickets) => {
    const { team, action } = data;
    if (action === 'won') winner = team;
  };

  const onRoundEnded = async () => {
    if (state.skipmap) return;

    const { players } = state;
    if (!players) return;

    const updatePlayerGames = async (player: TPlayer) => {
      const { teamID, steamID, possess } = player;

      const user = await getUserDataWithSteamID(steamID);
      const userData = getPlayerBySteamID(state, steamID);

      if (user) {
        adminWarn(
          execute,
          steamID,
          `Игрок: ${user.name}\nУбийств: ${user.kills}\nСмертей: ${user.death}\nПомощь: ${user.revives}\nТимкилы: ${user.teamkills}\nK/D: ${user.kd}`,
        );
      }

      if (possess?.toLowerCase().includes('developeradmincam')) return;

      if (!winner) return;

      const gameResult = teamID === winner ? 'won' : 'lose';
      await updateGames(steamID, gameResult);

      if (userData && userData.isLeader && userData.squadID) {
        const squad = getSquadByID(state, userData.squadID);
        if (
          squad &&
          (squad.squadName === 'CMD Squad' ||
            squad.squadName === 'Command Squad')
        ) {
          const cmdGameResult = teamID === winner ? 'cmdwon' : 'cmdlose';
          await updateGames(steamID, cmdGameResult);
        }
      }
    };

    try {
      await Promise.all(players.map(updatePlayerGames));
      winner = '';
      await creatingTimeStamp();
    } catch (error) {
      logger.error(`Произошла ошибка при обновлении данных игрока: ${error}`);
    }
  };

  const updatePlayerData = async (steamID: string) => {
    try {
      const user = getPlayerBySteamID(state, steamID);

      if (user) {
        if (user.possess) {
          await updatePossess(steamID, user.possess);
        }

        if (user.role) {
          await updateRoles(steamID, user.role);
        }

        if (user.isLeader && user.squadID) {
          await updateTimes(steamID, 'leader', user.name);
          const squad = getSquadByID(state, user.squadID);
          if (
            squad &&
            (squad.squadName === 'CMD Squad' ||
              squad.squadName === 'Command Squad')
          ) {
            await updateTimes(steamID, 'cmd', user.name);
          }
        }

        await updateTimes(steamID, 'timeplayed', user.name);
      }
    } catch (error) {
      logger.error(
        `Ошибка при обновлении данных для игрока с SteamID ${steamID}:,
        ${error}`,
      );
    }
  };

  const updatedPlayers = () => {
    const { players } = state;
    if (!players) return;

    players.forEach((e) => {
      const { steamID } = e;
      if (!steamID) return;
      if (playersCurrenTime.find((p) => p.steamID === steamID)) return;

      playersCurrenTime.push({
        steamID,
        timer: setInterval(() => updatePlayerData(steamID), 60000),
      });
    });

    playersCurrenTime = playersCurrenTime.filter((e) => {
      const currentUser = players.find((c) => c.steamID === e.steamID);

      if (!currentUser) {
        clearInterval(e.timer);
        return false;
      }

      return true;
    });
  };

  const onDied = async (data: TPlayerDied) => {
    const { currentMap } = state;
    if (!currentMap?.layer) return;

    if (currentMap.layer.toLowerCase().includes('seed')) return;

    const { attackerSteamID, victimName, attackerEOSID } = data;
    const attacker = getPlayerByEOSID(state, attackerEOSID);
    const victim = getPlayerByName(state, victimName);
    if (!victim) return;

    try {
      if (
        attacker?.teamID === victim?.teamID &&
        attacker.name !== victim.name
      ) {
        await updateUser(attackerSteamID, 'teamkills');
      } else {
        await updateUser(attackerSteamID, 'kills', victim.weapon || 'null');
        await updateUser(victim.steamID, 'death');
      }
    } catch (error) {
      logger.error(`Ошибка при обновлении данных игрока: ${error}`);
    }
  };

  const onRevived = async (data: TPlayerRevived) => {
    try {
      const { currentMap } = state;

      if (!currentMap?.layer) return;

      if (currentMap.layer.toLowerCase().includes('seed')) return;

      const { reviverSteamID } = data;

      await updateUser(reviverSteamID, 'revives');
    } catch (error) {
      logger.error(
        `Ошибка при обновлении данных пользователя на возрождение: ${error}`,
      );
    }
  };

  listener.on(EVENTS.UPDATED_PLAYERS, updatedPlayers);
  listener.on(EVENTS.PLAYER_DIED, onDied);
  listener.on(EVENTS.PLAYER_REVIVED, onRevived);
  listener.on(EVENTS.ROUND_ENDED, onRoundEnded);
  listener.on(EVENTS.ROUND_TICKETS, onRoundTickets);
};
