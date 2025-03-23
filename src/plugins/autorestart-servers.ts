import { EVENTS } from '../constants';
import { adminKillServer } from '../core';
import {
  createTimeStampForRestartServer,
  getTimeStampForRestartServer,
} from '../rnsdb';
import { TPluginProps } from '../types';
import { getPlayers } from './helpers';

export const autorestartServers: TPluginProps = (state) => {
  const { listener, execute, logger, id } = state;
  let restartTimeout: NodeJS.Timeout;
  let isRestartTimeoutSet = false;

  const setRestartTimeout = () => {
    restartTimeout = setTimeout(async () => {
      logger.log('Рестарт сервера...');
      await createTimeStampForRestartServer(id);
      await adminKillServer(execute);
      isRestartTimeoutSet = false;
    }, 300000);

    isRestartTimeoutSet = true;
  };

  const clearRestartTimeout = () => {
    clearTimeout(restartTimeout);
    isRestartTimeoutSet = false;
  };

  const autorestart = async () => {
    const lastRestartTime = await getTimeStampForRestartServer(id);
    if (!lastRestartTime) return;

    if (new Date().getTime() - lastRestartTime > 86400000) {
      const players = getPlayers(state);

      if (Array.isArray(players) && players.length === 0) {
        console.log(players);
        logger.log(`Сервер пуст. Планируется рестарт`);
        if (!isRestartTimeoutSet) setRestartTimeout();
      } else {
        if (isRestartTimeoutSet) clearRestartTimeout();
      }
    }
  };

  listener.on(EVENTS.UPDATED_PLAYERS, autorestart);
};
