import { TPossessedAdminCamera, TUnPossessedAdminCamera } from 'squad-rcon';
import { EVENTS } from '../constants';
import { adminRemovePlayerFromSquad, adminWarn } from '../core/commands';
import { TPlayer, TPluginProps } from '../types';
import { getAdmins, getPlayerBySteamID } from './helpers';

interface AdminCamBlockerOptions {
  cooldownDuration?: number;
  warningInterval?: number;
  warnMessage?: string;
  adminSearchKey?: string;
}

const defaultOptions: AdminCamBlockerOptions = {
  cooldownDuration: 2 * 60 * 1000,
  warningInterval: 30000,
  warnMessage:
    'Вы не можете создавать или вступать в отряды вне админ-камеры. Отряд будет распущен через {time} секунд.',
};

export const adminCamBlocker: TPluginProps = (state, options) => {
  const { listener, execute, logger } = state;
  const opts: Required<AdminCamBlockerOptions> = {
    ...defaultOptions,
    ...options,
  } as Required<AdminCamBlockerOptions>;

  const excludedAdmins: string[] = opts.adminSearchKey
    ? getAdmins(state, opts.adminSearchKey) || []
    : [];

  interface AdminState {
    isInCamera: boolean;
    cooldownTimeout: NodeJS.Timeout | null;
    warningInterval: NodeJS.Timeout | null;
    expiresAt: number;
  }

  const adminStates = new Map<string, AdminState>();
  const knownAdmins = new Set<string>();

  const isExcluded = (steamID?: string) =>
    !steamID || excludedAdmins.includes(steamID);

  const initCooldown = (steamID: string) => {
    let aState = adminStates.get(steamID);
    if (!aState) {
      aState = {
        isInCamera: false,
        cooldownTimeout: null,
        warningInterval: null,
        expiresAt: 0,
      };
      adminStates.set(steamID, aState);
    }

    if (aState.cooldownTimeout) clearTimeout(aState.cooldownTimeout);
    if (aState.warningInterval) clearInterval(aState.warningInterval);

    const cooldownMs = opts.cooldownDuration;
    aState.expiresAt = Date.now() + cooldownMs;

    adminWarn(
      execute,
      steamID,
      opts.warnMessage.replace('{time}', String(Math.ceil(cooldownMs / 1000))),
    );

    aState.warningInterval = setInterval(() => {
      const currentState = adminStates.get(steamID);
      if (!currentState) return;

      const player = getPlayerBySteamID(state, steamID);

      if (!player || !player.squadID) {
        if (currentState.cooldownTimeout)
          clearTimeout(currentState.cooldownTimeout);
        if (currentState.warningInterval)
          clearInterval(currentState.warningInterval);
        adminStates.delete(steamID);
        logger.log(
          `[admin-cam] ${steamID}: покинул отряд — таймеры остановлены`,
        );
        return;
      }

      const remainingMs = Math.max(currentState.expiresAt - Date.now(), 0);
      const remainingSec = Math.ceil(remainingMs / 1000);

      adminWarn(
        execute,
        steamID,
        opts.warnMessage.replace('{time}', String(remainingSec)),
      );
    }, opts.warningInterval);

    aState.cooldownTimeout = setTimeout(() => {
      const currentState = adminStates.get(steamID);
      if (!currentState) return;

      const player = getPlayerBySteamID(state, steamID);

      if (!player || !player.squadID) {
        if (currentState.warningInterval)
          clearInterval(currentState.warningInterval);
        adminStates.delete(steamID);
        logger.log(
          `[admin-cam] ${steamID}: к моменту распуска уже не в отряде — очистка`,
        );
        return;
      }

      adminRemovePlayerFromSquad(execute, steamID);
      if (currentState.warningInterval)
        clearInterval(currentState.warningInterval);
      adminStates.delete(steamID);

      logger.log(
        `[admin-cam] ${steamID}: удалён из отряда по истечении кулдауна`,
      );
    }, cooldownMs);

    adminStates.set(steamID, aState);
    logger.log(
      `[admin-cam] ${steamID}: старт кулдауна ${Math.ceil(cooldownMs / 1000)}s`,
    );
  };

  const onCameraPossessed = (data: TPossessedAdminCamera) => {
    if (isExcluded(data.steamID)) return;

    const steamID = data.steamID;
    knownAdmins.add(steamID);
    const prev = adminStates.get(steamID);

    if (prev?.cooldownTimeout) clearTimeout(prev.cooldownTimeout);
    if (prev?.warningInterval) clearInterval(prev.warningInterval);

    adminStates.set(steamID, {
      isInCamera: true,
      cooldownTimeout: null,
      warningInterval: null,
      expiresAt: 0,
    });

    logger.log(`[admin-cam] ${steamID}: POSSESSED (в камере)`);
  };

  const onCameraUnpossessed = (data: TUnPossessedAdminCamera) => {
    if (isExcluded(data.steamID)) return;

    const steamID = data.steamID;
    const aState = adminStates.get(steamID);
    if (!aState) {
      adminStates.set(steamID, {
        isInCamera: false,
        cooldownTimeout: null,
        warningInterval: null,
        expiresAt: 0,
      });
    } else {
      aState.isInCamera = false;
      adminStates.set(steamID, aState);
    }

    logger.log(`[admin-cam] ${steamID}: UNPOSSESSED (вышел из камеры)`);
  };

  const onSquadChanged = (data: TPlayer) => {
    const steamID = data.steamID;
    if (isExcluded(steamID)) return;
    if (!knownAdmins.has(steamID)) return;

    if (!data.squadID) {
      const s = adminStates.get(steamID);
      if (s) {
        if (s.cooldownTimeout) clearTimeout(s.cooldownTimeout);
        if (s.warningInterval) clearInterval(s.warningInterval);
        adminStates.delete(steamID);
      }
      logger.log(`[admin-cam] ${steamID}: вышел из отряда — состояние очищено`);
      return;
    }

    const s = adminStates.get(steamID);

    if (!s || (!s.cooldownTimeout && !s.isInCamera)) {
      logger.log(
        `[admin-cam] ${steamID}: создал/вступил в отряд вне камеры — запускаю кулдаун`,
      );
      initCooldown(steamID);
      return;
    }
  };

  const onNewGame = () => {
    adminStates.forEach((s) => {
      if (s.cooldownTimeout) clearTimeout(s.cooldownTimeout);
      if (s.warningInterval) clearInterval(s.warningInterval);
    });
    adminStates.clear();
    knownAdmins.clear();
    logger.log('[admin-cam] NEW_GAME: состояния и knownAdmins очищены');
  };

  listener.on(EVENTS.POSSESSED_ADMIN_CAMERA, onCameraPossessed);
  listener.on(EVENTS.UNPOSSESSED_ADMIN_CAMERA, onCameraUnpossessed);
  listener.on(EVENTS.PLAYER_SQUAD_CHANGED, onSquadChanged);
  listener.on(EVENTS.SQUAD_CREATED, onSquadChanged);
  listener.on(EVENTS.NEW_GAME, onNewGame);
};
