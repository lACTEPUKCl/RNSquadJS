import { TPossessedAdminCamera, TUnPossessedAdminCamera } from 'squad-rcon';
import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminRemovePlayerFromSquad, adminWarn } from '../core/commands';
import { definePlugin } from '../core/plugin';
import { TPlayer } from '../types';
import { getAdmins, getPlayerBySteamID } from './helpers';

const optionsSchema = z.object({
  kickDelay: z.coerce.number().int().positive().default(30000),

  cooldownDuration: z.coerce.number().int().positive().optional(),
  warningInterval: z.coerce.number().int().positive().default(10000),
  warnMessage: z
    .string()
    .default(
      'Вы заходили в админ-камеру — играть в отрядах запрещено до конца карты. Кик из отряда через {time} сек.',
    ),
  adminSearchKey: z.string().optional(),
});

export default definePlugin({
  name: 'adminCamBlocker',
  description: 'Кик из отряда за игру после захода в админ-камеру.',
  optionsSchema,
  setup({ state, options, logger, registerDisposable }) {
    const { listener, execute } = state;

    const kickDelayMs = options.cooldownDuration ?? options.kickDelay;

    const excludedAdmins: string[] = options.adminSearchKey
      ? getAdmins(state, options.adminSearchKey) || []
      : [];

    const taintedAdmins = new Set<string>();
    const activeTimers = new Map<
      string,
      {
        kickTimeout: NodeJS.Timeout;
        warnInterval: NodeJS.Timeout;
        expiresAt: number;
      }
    >();

    const isExcluded = (steamID?: string) =>
      !steamID || excludedAdmins.includes(steamID);

    const clearTimers = (steamID: string) => {
      const timers = activeTimers.get(steamID);
      if (!timers) return;
      clearTimeout(timers.kickTimeout);
      clearInterval(timers.warnInterval);
      activeTimers.delete(steamID);
    };

    const startKickSequence = (steamID: string) => {
      clearTimers(steamID);

      const kickMs = kickDelayMs;
      const expiresAt = Date.now() + kickMs;

      adminWarn(
        execute,
        steamID,
        options.warnMessage.replace('{time}', String(Math.ceil(kickMs / 1000))),
      );

      const warnInterval = setInterval(() => {
        const player = getPlayerBySteamID(state, steamID);
        if (!player?.squadID) {
          clearTimers(steamID);
          logger.log(
            `[admin-cam] ${steamID}: покинул отряд сам — таймеры сброшены`,
          );
          return;
        }

        const remainingSec = Math.max(
          Math.ceil((expiresAt - Date.now()) / 1000),
          0,
        );
        adminWarn(
          execute,
          steamID,
          options.warnMessage.replace('{time}', String(remainingSec)),
        );
      }, options.warningInterval);

      const kickTimeout = setTimeout(() => {
        clearInterval(warnInterval);
        activeTimers.delete(steamID);

        const player = getPlayerBySteamID(state, steamID);
        if (!player?.squadID) {
          logger.log(`[admin-cam] ${steamID}: к моменту кика уже не в отряде`);
          return;
        }

        adminRemovePlayerFromSquad(execute, steamID);
        logger.log(`[admin-cam] ${steamID}: кикнут из отряда (был в камере)`);
      }, kickMs);

      activeTimers.set(steamID, { kickTimeout, warnInterval, expiresAt });
      logger.log(
        `[admin-cam] ${steamID}: запущен кик-таймер (${Math.ceil(
          kickMs / 1000,
        )}s)`,
      );
    };

    const onCameraPossessed = (data: TPossessedAdminCamera) => {
      if (isExcluded(data.steamID)) return;
      taintedAdmins.add(data.steamID);
      clearTimers(data.steamID);
      logger.log(`[admin-cam] ${data.steamID}: вошёл в камеру — помечен`);
    };

    const onCameraUnpossessed = (data: TUnPossessedAdminCamera) => {
      if (isExcluded(data.steamID)) return;
      if (!taintedAdmins.has(data.steamID)) return;

      const player = getPlayerBySteamID(state, data.steamID);
      if (player?.squadID) {
        logger.log(
          `[admin-cam] ${data.steamID}: вышел из камеры, уже в отряде — запуск кика`,
        );
        startKickSequence(data.steamID);
      }

      logger.log(`[admin-cam] ${data.steamID}: вышел из камеры`);
    };

    const onSquadChanged = (data: TPlayer) => {
      if (isExcluded(data.steamID)) return;
      if (!taintedAdmins.has(data.steamID)) return;

      if (!data.squadID) {
        clearTimers(data.steamID);
        logger.log(`[admin-cam] ${data.steamID}: вышел из отряда`);
        return;
      }

      if (!activeTimers.has(data.steamID)) {
        logger.log(
          `[admin-cam] ${data.steamID}: вступил в отряд после камеры — запуск кика`,
        );
        startKickSequence(data.steamID);
      }
    };

    const onNewGame = () => {
      activeTimers.forEach((_, steamID) => clearTimers(steamID));
      activeTimers.clear();
      taintedAdmins.clear();
      logger.log('[admin-cam] NEW_GAME: всё сброшено');
    };

    listener.on(EVENTS.POSSESSED_ADMIN_CAMERA, onCameraPossessed);
    listener.on(EVENTS.UNPOSSESSED_ADMIN_CAMERA, onCameraUnpossessed);
    listener.on(EVENTS.PLAYER_SQUAD_CHANGED, onSquadChanged);
    listener.on(EVENTS.SQUAD_CREATED, onSquadChanged);
    listener.on(EVENTS.NEW_GAME, onNewGame);

    registerDisposable(() => {
      listener.off(EVENTS.POSSESSED_ADMIN_CAMERA, onCameraPossessed);
      listener.off(EVENTS.UNPOSSESSED_ADMIN_CAMERA, onCameraUnpossessed);
      listener.off(EVENTS.PLAYER_SQUAD_CHANGED, onSquadChanged);
      listener.off(EVENTS.SQUAD_CREATED, onSquadChanged);
      listener.off(EVENTS.NEW_GAME, onNewGame);
      activeTimers.forEach((_, steamID) => clearTimers(steamID));
      activeTimers.clear();
      taintedAdmins.clear();
    });
  },
});
