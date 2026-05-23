import { TPlayerConnected, TPlayerDisconnected } from 'squad-logs';
import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminKick, adminWarn } from '../core';
import { definePlugin } from '../core/plugin';
import { updatePlayers } from '../core/state/updatePlayers';
import { TPlayer, TPlayerSquadChanged } from '../types';
import { getAdmins, getPlayerByEOSID, getPlayers } from './helpers';

const optionsSchema = z.object({
  minPlayersForAfkKick: z.coerce.number().int().default(98),
  kickTimeout: z.coerce.number().int().positive().default(300000),
  warningInterval: z.coerce.number().int().positive().default(30000),
  gracePeriod: z.coerce.number().int().positive().default(900000),

  connectGraceMs: z.coerce.number().int().nonnegative().default(120000),
});

interface PlayerTracker extends TPlayer {
  warnings: number;
  startTime: number;
  warnTimerID?: NodeJS.Timeout;
  kickTimerID?: NodeJS.Timeout;
}

export default definePlugin({
  name: 'autoKickUnassigned',
  description: 'Кик игроков без отряда (AFK) после предупреждений.',
  optionsSchema,
  setup({ state, options, logger, registerDisposable }) {
    const { listener, execute, id } = state;
    const {
      minPlayersForAfkKick,
      kickTimeout,
      warningInterval,
      gracePeriod,
      connectGraceMs,
    } = options;
    const trackedPlayers: Record<string, PlayerTracker> = {};

    const connectedAt = new Map<string, number>();
    let betweenRounds = false;
    const trackingListUpdateFrequency = 60 * 1000;
    let graceTimer: NodeJS.Timeout | null = null;

    const newGame = () => {
      betweenRounds = true;
      updateTrackingList();
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = setTimeout(() => {
        betweenRounds = false;
      }, gracePeriod);
    };

    const onPlayerSquadChange = (data: TPlayerSquadChanged) => {
      // Событие приходит как { player, oldSquadID, newSquadID }, а не голым
      // TPlayer. Снимаем с трекинга, когда игрок ВСТУПИЛ в отряд.
      const sid = data.player?.steamID;
      if (sid && sid in trackedPlayers && data.newSquadID != null) {
        untrackPlayer(sid, 'Вступил в отряд');
      }
    };

    const onPlayerConnected = (data: TPlayerConnected) => {
      if (data.steamID) connectedAt.set(data.steamID, Date.now());
    };

    const clearDisconnectedPlayers = (data: TPlayerDisconnected) => {
      // Событие дисконнекта несёт только eosID. Матчим трекер по eosID
      // напрямую, а не через state — игрока в state уже могло вычистить,
      // тогда таймеры трекера зависали бы (утечка + холостые варны).
      const player = getPlayerByEOSID(state, data.eosID);
      if (player?.steamID) connectedAt.delete(player.steamID);
      for (const [steamID, tracker] of Object.entries(trackedPlayers)) {
        if (tracker.eosID === data.eosID || steamID === player?.steamID) {
          untrackPlayer(steamID, 'Игрок ливнул');
        }
      }
    };

    const untrackPlayer = (steamID: string, reason?: string) => {
      const tracker = trackedPlayers[steamID];
      delete trackedPlayers[steamID];
      if (!tracker) return;
      clearInterval(tracker.warnTimerID);
      clearTimeout(tracker.kickTimerID);
      logger.log(
        `unTracker: Name: ${tracker.name} Reason: ${reason || 'null'}`,
      );
    };

    const updateTrackingList = () => {
      const admins = getAdmins(state, 'cameraman');
      const players = getPlayers(state);

      if (!players) return;
      const run = !(betweenRounds || players.length < minPlayersForAfkKick);
      logger.log(
        `Update Tracking List? ${run} (Between rounds: ${betweenRounds}, Below player threshold: ${
          players.length < minPlayersForAfkKick
        })`,
      );

      if (!run) {
        for (const steamID of Object.keys(trackedPlayers))
          untrackPlayer(steamID, 'Очистка списка');
        return;
      }

      for (const player of players) {
        const { steamID, squadID } = player;
        const isTracked = steamID in trackedPlayers;
        const isUnassigned = squadID === null;
        const isAdmin = admins?.includes(steamID);

        if (!isUnassigned && isTracked)
          untrackPlayer(player.steamID, 'Вступил в отряд');

        if (!isUnassigned) continue;

        if (isAdmin) logger.log(`Admin is Unassigned: ${player.name}`);
        if (isAdmin) continue;

        if (!isTracked) {
          const connectedTs = connectedAt.get(steamID);
          if (connectedTs && Date.now() - connectedTs < connectGraceMs)
            continue;
          trackedPlayers[steamID] = trackPlayer(player);
        }
      }
    };

    const msFormat = (ms: number) => {
      const min = Math.floor((ms / 1000 / 60) << 0);
      const sec = Math.floor((ms / 1000) % 60);
      const minTxt = ('' + min).padStart(2, '0');
      const secTxt = ('' + sec).padStart(2, '0');
      return `${minTxt}:${secTxt}`;
    };

    const trackPlayer = (player: TPlayer): PlayerTracker => {
      const { name, eosID, steamID, teamID, role, isLeader, squadID } = player;
      const tracker: PlayerTracker = {
        name,
        eosID,
        steamID,
        teamID,
        role,
        isLeader,
        squadID,
        warnings: 0,
        startTime: Date.now(),
      };

      tracker.warnTimerID = setInterval(async () => {
        const msLeft = kickTimeout - warningInterval * (tracker.warnings + 1);

        if (msLeft < warningInterval + 1) clearInterval(tracker.warnTimerID);

        const timeLeft = msFormat(msLeft);
        adminWarn(
          execute,
          steamID,
          `Вступите в отряд или будете кикнуты через - ${timeLeft}`,
        );
        logger.log(`Warning: ${player.name} (${timeLeft})`);
        tracker.warnings++;
      }, warningInterval);

      tracker.kickTimerID = setTimeout(async () => {
        // Перед киком тянем СВЕЖИЙ список из RCON: state обновляется раз в
        // ~30с, и игрок мог войти в отряд за пару секунд до таймера. Без
        // этого кикали бы уже вступившего в отряд. updatePlayers заодно
        // эмитит PLAYER_SQUAD_CHANGED → трекер снимется сам.
        await updatePlayers(id);
        updateTrackingList();

        if (!(tracker.steamID in trackedPlayers)) return;

        adminKick(execute, player.steamID, 'AFK');

        logger.log(`Kicked: ${player.name}`);
        untrackPlayer(tracker.steamID, 'Игрок кикнут');
      }, kickTimeout);

      return tracker;
    };

    const mainInterval = setInterval(
      () => updateTrackingList(),
      trackingListUpdateFrequency,
    );

    listener.on(EVENTS.NEW_GAME, newGame);
    listener.on(EVENTS.PLAYER_CONNECTED, onPlayerConnected);
    listener.on(EVENTS.PLAYER_DISCONNECTED, clearDisconnectedPlayers);
    listener.on(EVENTS.PLAYER_SQUAD_CHANGED, onPlayerSquadChange);

    registerDisposable(() => {
      listener.off(EVENTS.NEW_GAME, newGame);
      listener.off(EVENTS.PLAYER_CONNECTED, onPlayerConnected);
      listener.off(EVENTS.PLAYER_DISCONNECTED, clearDisconnectedPlayers);
      listener.off(EVENTS.PLAYER_SQUAD_CHANGED, onPlayerSquadChange);
      clearInterval(mainInterval);
      connectedAt.clear();
      if (graceTimer) clearTimeout(graceTimer);
      for (const steamID of Object.keys(trackedPlayers)) {
        const t = trackedPlayers[steamID];
        clearInterval(t.warnTimerID);
        clearTimeout(t.kickTimerID);
        delete trackedPlayers[steamID];
      }
    });
  },
});
