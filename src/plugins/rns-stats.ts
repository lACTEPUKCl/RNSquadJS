import { TPlayerDied, TPlayerRevived, TRoundTickets } from 'squad-logs';
import { EVENTS } from '../constants';
import { adminWarn } from '../core';
import {
  creatingTimeStamp,
  getUserDataWithSteamID,
  pushMatchHistory,
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

interface MatchPlayerStats {
  steamID: string;
  name: string;
  teamID: string;
  kills: number;
  death: number;
  revives: number;
  teamkills: number;
}

interface MatchTicketInfo {
  team: string;
  action: string;
  subfaction?: string;
  tickets?: number;
}

export const rnsStats: TPluginProps = (state) => {
  const { listener, execute, logger, id } = state;
  let playersCurrenTime: Array<{
    steamID: string;
    timer: NodeJS.Timeout;
  }> = [];
  let winner: string;

  // --- Match history in-memory state ---
  let matchStartTime: number = Date.now();
  let matchPlayerStats: Map<string, MatchPlayerStats> = new Map();
  let matchTickets: MatchTicketInfo[] = [];
  let matchCounter = 0;

  const getOrCreatePlayerStats = (
    steamID: string,
    name: string,
    teamID: string,
  ): MatchPlayerStats => {
    let stats = matchPlayerStats.get(steamID);
    if (!stats) {
      stats = {
        steamID,
        name,
        teamID,
        kills: 0,
        death: 0,
        revives: 0,
        teamkills: 0,
      };
      matchPlayerStats.set(steamID, stats);
    }
    stats.name = name;
    stats.teamID = teamID;
    return stats;
  };

  const resetMatchState = () => {
    matchStartTime = Date.now();
    matchPlayerStats = new Map();
    matchTickets = [];
  };

  const onNewGame = () => {
    resetMatchState();
  };

  const onRoundTickets = (data: TRoundTickets) => {
    const { team, action } = data;
    if (action === 'won') winner = team;

    matchTickets.push({
      team: data.team,
      action: data.action,
      subfaction: (data as Record<string, unknown>).subfaction as
        | string
        | undefined,
      tickets: (data as Record<string, unknown>).tickets as number | undefined,
    });
  };

  const onRoundEnded = async () => {
    if (state.skipmap) return;

    const { players, currentMap } = state;
    if (!players) return;

    const matchEndTime = Date.now();
    const matchID = `${id}_${matchEndTime}_${++matchCounter}`;

    const team1Info = matchTickets.find((t) => t.team === '1');
    const team2Info = matchTickets.find((t) => t.team === '2');

    const layer = currentMap?.layer || null;
    const level = currentMap?.level || null;

    const team1 = {
      subfaction: team1Info?.subfaction || null,
      tickets: team1Info?.tickets ?? null,
    };
    const team2 = {
      subfaction: team2Info?.subfaction || null,
      tickets: team2Info?.tickets ?? null,
    };

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
        const squad = getSquadByID(state, userData.squadID, userData.teamID);
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

      for (const player of players) {
        if (player.steamID) {
          getOrCreatePlayerStats(player.steamID, player.name, player.teamID);
        }
      }

      const pushPromises: Promise<void>[] = [];

      for (const [steamID, p] of matchPlayerStats) {
        const kd =
          p.death > 0 && Number.isFinite(p.kills / p.death)
            ? Number((p.kills / p.death).toFixed(2))
            : p.kills;

        const result = winner
          ? p.teamID === winner
            ? 'won'
            : 'lose'
          : 'unknown';

        pushPromises.push(
          pushMatchHistory(steamID, {
            matchID,
            layer,
            level,
            startTime: matchStartTime,
            endTime: matchEndTime,
            result,
            kills: p.kills,
            death: p.death,
            revives: p.revives,
            teamkills: p.teamkills,
            kd,
            team1,
            team2,
          }),
        );
      }

      await Promise.all(pushPromises);

      winner = '';
      resetMatchState();
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
          const squad = getSquadByID(state, user.squadID, user.teamID);
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
        `Ошибка при обновлении данных для игрока с SteamID ${steamID}: ${error}`,
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

    const killerSteamID = attackerSteamID || attacker?.steamID || '';

    try {
      if (killerSteamID && killerSteamID === victim.steamID) {
        await updateUser(victim.steamID, 'death');
        const vs = getOrCreatePlayerStats(
          victim.steamID,
          victim.name,
          victim.teamID,
        );
        vs.death++;
        return;
      }

      if (!killerSteamID && !attacker) {
        await updateUser(victim.steamID, 'death');
        const vs = getOrCreatePlayerStats(
          victim.steamID,
          victim.name,
          victim.teamID,
        );
        vs.death++;
        return;
      }

      if (
        attacker?.teamID === victim.teamID &&
        attacker?.name !== victim.name
      ) {
        if (killerSteamID) await updateUser(killerSteamID, 'teamkills');
        await updateUser(victim.steamID, 'death');
        if (killerSteamID && attacker) {
          const as = getOrCreatePlayerStats(
            killerSteamID,
            attacker.name,
            attacker.teamID,
          );
          as.teamkills++;
        }
        const vs = getOrCreatePlayerStats(
          victim.steamID,
          victim.name,
          victim.teamID,
        );
        vs.death++;
        return;
      }

      if (killerSteamID) {
        await updateUser(killerSteamID, 'kills', attacker?.weapon || 'null');
        if (attacker) {
          const as = getOrCreatePlayerStats(
            killerSteamID,
            attacker.name,
            attacker.teamID,
          );
          as.kills++;
        }
      }
      await updateUser(victim.steamID, 'death');
      const vs = getOrCreatePlayerStats(
        victim.steamID,
        victim.name,
        victim.teamID,
      );
      vs.death++;
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

      const reviver = getPlayerBySteamID(state, reviverSteamID);
      if (reviver) {
        const rs = getOrCreatePlayerStats(
          reviverSteamID,
          reviver.name,
          reviver.teamID,
        );
        rs.revives++;
      }
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
  listener.on(EVENTS.NEW_GAME, onNewGame);
};
