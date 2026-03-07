import { TPossessedAdminCamera, TUnPossessedAdminCamera } from 'squad-rcon';
import { EVENTS } from '../constants';
import { adminRemovePlayerFromSquad, adminWarn } from '../core/commands';
import { TPlayer, TPluginProps } from '../types';
import { getAdmins, getPlayerBySteamID } from './helpers';

interface AdminCamBlockerOptions {
  kickDelay?: number;
  warningInterval?: number;
  warnMessage?: string;
  adminSearchKey?: string;
}

const defaultOptions: AdminCamBlockerOptions = {
  kickDelay: 30_000,
  warningInterval: 10_000,
  warnMessage:
    'Вы заходили в админ-камеру — играть в отрядах запрещено до конца карты. Кик из отряда через {time} сек.',
};

export const adminCamBlocker: TPluginProps = (state, options) => {
  const { listener, execute, logger } = state;
  const opts = {
    ...defaultOptions,
    ...options,
  } as Required<AdminCamBlockerOptions>;

  const excludedAdmins: string[] = opts.adminSearchKey
    ? getAdmins(state, opts.adminSearchKey) || []
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

    const kickMs = opts.kickDelay;
    const expiresAt = Date.now() + kickMs;

    adminWarn(
      execute,
      steamID,
      opts.warnMessage.replace('{time}', String(Math.ceil(kickMs / 1000))),
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
        opts.warnMessage.replace('{time}', String(remainingSec)),
      );
    }, opts.warningInterval);

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
      `[admin-cam] ${steamID}: запущен кик-таймер (${Math.ceil(kickMs / 1000)}s)`,
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
};
