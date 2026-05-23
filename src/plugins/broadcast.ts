import { z } from 'zod';
import { adminBroadcast } from '../core';
import { definePlugin } from '../core/plugin';
import { getPlayers } from './helpers';

const optionsSchema = z.object({
  texts: z.array(z.string()).default([]),
  interval: z.coerce.number().int().positive().default(180000),
});

export default definePlugin({
  name: 'broadcast',
  description: 'Периодическая рассылка сообщений в эфир сервера.',
  optionsSchema,
  setup({ state, options, logger, registerDisposable }) {
    const { execute } = state;
    const { texts, interval } = options;

    if (texts.length === 0) {
      logger.warn('broadcast: список "texts" пуст — рассылка не запущена.');
      return;
    }

    let index = 0;
    const printText = () => {
      const players = getPlayers(state);
      if (!players || players.length === 0) return;

      adminBroadcast(execute, texts[index]);

      index = (index + 1) % texts.length;
    };

    const timer = setInterval(printText, interval);
    registerDisposable(() => clearInterval(timer));
  },
});
