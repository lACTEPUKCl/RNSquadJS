import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminDisbandSquad, adminWarn } from '../core';
import { definePlugin } from '../core/plugin';
import { updatePlayers } from '../core/state/updatePlayers';
import { TPlayer, TPlayerLeaderChanged, TPlayerRoleChanged } from '../types';
import { getAdmins } from './helpers';

const optionsSchema = z.object({
  timeDisband: z.coerce.number().int().positive().default(120000),
});

export default definePlugin({
  name: 'squadLeaderRole',
  description: 'Требование кита SL у лидера отряда, иначе роспуск.',
  optionsSchema,
  setup({ state, options, logger, registerDisposable }) {
    const { listener, execute, id } = state;
    const { timeDisband } = options;
    let trackedPlayers: Record<string, TPlayer> = {};
    const activeTimers = new Set<NodeJS.Timeout>();

    const getWarn = async (steamID: string, text: string, seconds?: number) => {
      if (!seconds) {
        return adminWarn(execute, steamID, text);
      }
      const newText = text.replace(/{{time}}/, seconds.toString());
      await adminWarn(execute, steamID, newText);
    };

    const newGame = () => {
      trackedPlayers = {};
      for (const t of activeTimers) clearInterval(t);
      activeTimers.clear();
    };

    // Лидерским считаем ТОЛЬКО SL-киты: FACTION_SL_NN, FACTION_SLPilot_NN,
    // FACTION_SLCrewman_NN. Обычные Pilot/Crewman лидеру НЕ засчитываем — он должен
    // брать SL-пилота/SL-мехвода, чтобы сохранять функции лидера. Регистронезависимо
    // (старый indexOf('SL') мог промахнуться при ином регистре). Якорь (?:^|_)
    // отсекает посторонние "sl" вроде ASLAV.
    const getIsLeaderRole = (role: string) => /(?:^|_)sl/i.test(role || '');

    const untrackPlayer = (steamID: string, reason?: string) => {
      const tracker = trackedPlayers[steamID];
      delete trackedPlayers[steamID];

      if (tracker) {
        logger.log(
          `unTracker: Name: ${tracker.name} SquadID: ${tracker.squadID} TeamID: ${
            tracker.teamID
          } Reason: ${reason || 'null'}`,
        );
      }
    };

    const leaderChanged = async (
      data: TPlayerRoleChanged | TPlayerLeaderChanged,
    ) => {
      const { player, isLeader } = data;
      if (!player) return;
      const { currentMap } = state;
      const admins = getAdmins(state, 'canseeadminchat');
      const isAdmin = admins?.includes(player.steamID);
      if (currentMap?.layer?.toLowerCase().includes('seed')) return;
      if (isAdmin) return;

      const iterationCheck = 30000;
      const messageGetRole =
        'Возьми кит лидера или сквад будет расформирован через {{time}}сек';
      const messageDisband = 'Отряд расформирован';
      const messageSuccess = 'Спасибо что взяли кит!';

      let seconds = timeDisband / 1000;
      let timer: NodeJS.Timeout | null = null;

      const stopTimer = () => {
        if (timer) {
          clearInterval(timer);
          activeTimers.delete(timer);
          timer = null;
        }
      };

      const leaderRole = getIsLeaderRole(player.role);
      if (trackedPlayers[player.steamID]) return;
      if (isLeader && leaderRole) return;
      if (isLeader && !leaderRole && !trackedPlayers[player.steamID]) {
        trackedPlayers[player.steamID] = player;
      }

      if (isLeader && !leaderRole) {
        await getWarn(player.steamID, messageGetRole, seconds);
        logger.log(
          `startTracker: Name: ${player.name} SquadID: ${player.squadID} TeamID: ${player.teamID} Seconds: ${seconds}`,
        );

        timer = setInterval(async () => {
          const updatedPlayer = state.players?.find(
            (user) => user.steamID === player.steamID,
          );
          seconds = seconds - iterationCheck / 1000;

          if (!updatedPlayer) {
            stopTimer();
            untrackPlayer(player.steamID, 'Игрок вышел');
            return;
          }

          if (!updatedPlayer.isLeader) {
            stopTimer();
            untrackPlayer(player.steamID, 'Игрок больше не лидер');
            return;
          }

          if (getIsLeaderRole(updatedPlayer.role)) {
            stopTimer();
            if (messageSuccess) {
              await getWarn(updatedPlayer.steamID, messageSuccess);
            }
            untrackPlayer(player.steamID, 'Игрок взял кит');
            return;
          }

          if (seconds > 0) {
            await getWarn(updatedPlayer.steamID, messageGetRole, seconds);
            logger.log(
              `startTracker: Name: ${player.name} SquadID: ${player.squadID} TeamID: ${player.teamID} Seconds: ${seconds}`,
            );
          }

          if (seconds <= 0) {
            stopTimer();
            await updatePlayers(id);
            const fresh = state.players?.find(
              (user) => user.steamID === player.steamID,
            );

            if (!fresh || !fresh.isLeader) {
              untrackPlayer(player.steamID, 'Игрок вышел / не лидер');
              return;
            }
            if (getIsLeaderRole(fresh.role)) {
              await getWarn(fresh.steamID, messageSuccess);
              untrackPlayer(player.steamID, 'Игрок взял кит');
              return;
            }

            untrackPlayer(player.steamID, 'Отряд распущен');
            await getWarn(fresh.steamID, messageDisband);

            if (fresh.squadID) {
              await adminDisbandSquad(execute, fresh.teamID, fresh.squadID);
            }
          }
        }, iterationCheck);
        activeTimers.add(timer);
      }
    };

    listener.on(EVENTS.NEW_GAME, newGame);
    listener.on(EVENTS.PLAYER_ROLE_CHANGED, leaderChanged);
    listener.on(EVENTS.PLAYER_LEADER_CHANGED, leaderChanged);

    registerDisposable(() => {
      listener.off(EVENTS.NEW_GAME, newGame);
      listener.off(EVENTS.PLAYER_ROLE_CHANGED, leaderChanged);
      listener.off(EVENTS.PLAYER_LEADER_CHANGED, leaderChanged);
      for (const t of activeTimers) clearInterval(t);
      activeTimers.clear();
      trackedPlayers = {};
    });
  },
});
