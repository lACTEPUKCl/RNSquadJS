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
  const opts: AdminCamBlockerOptions = { ...defaultOptions, ...options };
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

  const initCooldown = (steamID: string) => {
    let adminState = adminStates.get(steamID);
    if (!adminState) {
      adminState = {
        isInCamera: false,
        cooldownTimeout: null,
        warningInterval: null,
        expiresAt: 0,
      };
      adminStates.set(steamID, adminState);
    }
    if (adminState!.cooldownTimeout) clearTimeout(adminState!.cooldownTimeout);
    if (adminState!.warningInterval) clearInterval(adminState!.warningInterval);

    const cooldownDuration = opts.cooldownDuration!;
    adminState!.expiresAt = Date.now() + cooldownDuration;

    adminWarn(
      execute,
      steamID,
      opts.warnMessage!.replace('{time}', (cooldownDuration / 1000).toString()),
    );

    adminState!.warningInterval = setInterval(() => {
      const currentState = adminStates.get(steamID);
      if (!currentState) return;
      const player = getPlayerBySteamID(state, steamID);
      if (!player || !player.squadID) {
        if (currentState.cooldownTimeout)
          clearTimeout(currentState.cooldownTimeout);
        if (currentState.warningInterval)
          clearInterval(currentState.warningInterval);
        adminStates.delete(steamID);
        knownAdmins.delete(steamID);
        logger.log(`Админ ${steamID} покинул отряд.`);
        return;
      }
      const remainingMs = Math.max(currentState.expiresAt - Date.now(), 0);
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      adminWarn(
        execute,
        steamID,
        opts.warnMessage!.replace('{time}', remainingSeconds.toString()),
      );
    }, opts.warningInterval);

    adminState!.cooldownTimeout = setTimeout(() => {
      const currentState = adminStates.get(steamID);
      if (!currentState) return;
      const player = getPlayerBySteamID(state, steamID);
      if (!player || !player.squadID) {
        if (currentState.warningInterval)
          clearInterval(currentState.warningInterval);
        adminStates.delete(steamID);
        knownAdmins.delete(steamID);
        return;
      }
      adminRemovePlayerFromSquad(execute, steamID);
      if (currentState.warningInterval)
        clearInterval(currentState.warningInterval);
      adminStates.delete(steamID);
      logger.log(`Админ ${steamID} удален из отряда.`);
    }, cooldownDuration);

    adminStates.set(steamID, adminState!);
  };

  const onCameraPossessed = (data: TPossessedAdminCamera) => {
    if (excludedAdmins.includes(data.steamID)) return;
    const steamID = data.steamID;
    knownAdmins.add(steamID);
    if (adminStates.has(steamID)) {
      const stateObj = adminStates.get(steamID)!;
      if (stateObj.cooldownTimeout) clearTimeout(stateObj.cooldownTimeout);
      if (stateObj.warningInterval) clearInterval(stateObj.warningInterval);
      adminStates.set(steamID, {
        isInCamera: true,
        cooldownTimeout: null,
        warningInterval: null,
        expiresAt: 0,
      });
    } else {
      adminStates.set(steamID, {
        isInCamera: true,
        cooldownTimeout: null,
        warningInterval: null,
        expiresAt: 0,
      });
    }
  };

  const onCameraUnpossessed = (data: TUnPossessedAdminCamera) => {
    if (excludedAdmins.includes(data.steamID)) return;
    const steamID = data.steamID;
    const stateObj = adminStates.get(steamID);
    if (!stateObj) return;
    stateObj.isInCamera = false;
    adminStates.set(steamID, stateObj);
    initCooldown(steamID);
  };

  const onSquadChanged = (data: TPlayer) => {
    const steamID = data.steamID;
    if (
      !steamID ||
      excludedAdmins.includes(steamID) ||
      !knownAdmins.has(steamID)
    )
      return;

    if (!data.squadID) {
      const stateObj = adminStates.get(steamID);
      if (stateObj) {
        if (stateObj.cooldownTimeout) clearTimeout(stateObj.cooldownTimeout);
        if (stateObj.warningInterval) clearInterval(stateObj.warningInterval);
        adminStates.delete(steamID);
      }
      knownAdmins.delete(steamID);
      logger.log(`Админ ${steamID} покинул отряд.`);
      return;
    }

    const stateObj = adminStates.get(steamID);

    if (!stateObj || (!stateObj.cooldownTimeout && !stateObj.isInCamera)) {
      logger.log(`Админ ${steamID} создал новый отряд.`);
      initCooldown(steamID);
    }
  };

  const onNewGame = () => {
    adminStates.forEach((state) => {
      if (state.cooldownTimeout) clearTimeout(state.cooldownTimeout);
      if (state.warningInterval) clearInterval(state.warningInterval);
    });
    adminStates.clear();
    knownAdmins.clear();
  };

  listener.on(EVENTS.POSSESSED_ADMIN_CAMERA, onCameraPossessed);
  listener.on(EVENTS.UNPOSSESSED_ADMIN_CAMERA, onCameraUnpossessed);
  listener.on(EVENTS.PLAYER_SQUAD_CHANGED, onSquadChanged);
  listener.on(EVENTS.SQUAD_CREATED, onSquadChanged);
  listener.on(EVENTS.NEW_GAME, onNewGame);
};
