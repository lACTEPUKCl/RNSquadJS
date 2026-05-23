import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminKillServer } from '../core';
import { definePlugin } from '../core/plugin';
import {
  createTimeStampForRestartServer,
  getTimeStampForRestartServer,
} from '../rnsdb';
import { getPlayers } from './helpers';

const optionsSchema = z.object({
  emptyGraceMs: z.coerce.number().int().positive().default(300000),
  minUptimeMs: z.coerce.number().int().positive().default(86400000),
});

export default definePlugin({
  name: 'autorestartServers',
  description: 'Авторестарт пустого сервера раз в сутки.',
  optionsSchema,
  setup({ state, options, logger, registerDisposable }) {
    const { listener, execute, id } = state;
    const { emptyGraceMs, minUptimeMs } = options;
    let restartTimeout: NodeJS.Timeout | null = null;

    const clearRestartTimeout = () => {
      if (restartTimeout) {
        clearTimeout(restartTimeout);
        restartTimeout = null;
      }
    };

    const setRestartTimeout = () => {
      restartTimeout = setTimeout(async () => {
        restartTimeout = null;
        try {
          logger.log('Рестарт сервера...');
          await createTimeStampForRestartServer(id);
          await adminKillServer(execute);
        } catch (e) {
          logger.error(`autorestartServers: ошибка рестарта: ${String(e)}`);
        }
      }, emptyGraceMs);
    };

    const autorestart = async () => {
      const lastRestartTime = await getTimeStampForRestartServer(id);
      if (!lastRestartTime) return;
      if (Date.now() - lastRestartTime <= minUptimeMs) return;

      const players = getPlayers(state);
      if (Array.isArray(players) && players.length === 0) {
        if (!restartTimeout) {
          logger.log('Сервер пуст. Планируется рестарт');
          setRestartTimeout();
        }
      } else {
        clearRestartTimeout();
      }
    };

    listener.on(EVENTS.UPDATED_PLAYERS, autorestart);
    registerDisposable(() => listener.off(EVENTS.UPDATED_PLAYERS, autorestart));
    registerDisposable(clearRestartTimeout);
  },
});
