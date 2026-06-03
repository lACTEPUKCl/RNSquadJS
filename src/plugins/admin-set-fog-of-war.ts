import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminSetFogOfWar } from '../core';
import { definePlugin } from '../core/plugin';

const optionsSchema = z.object({
  value: z.coerce.number().int().min(0).max(1).default(1),
  delayMs: z.coerce.number().int().nonnegative().default(0),
});

export default definePlugin({
  name: 'adminSetFogOfWar',
  description:
    'Каждую новую игру выставляет туман войны командой AdminSetFogOfWar.',
  optionsSchema,
  setup({ state, options, logger, registerDisposable }) {
    const { listener, execute } = state;
    const { value, delayMs } = options;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const apply = async () => {
      try {
        await adminSetFogOfWar(execute, value);
        logger.log(`[adminSetFogOfWar] AdminSetFogOfWar ${value}`);
      } catch (e) {
        logger.error(`[adminSetFogOfWar] ошибка: ${String(e)}`);
      }
    };

    const onNewGame = () => {
      if (delayMs > 0) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          void apply();
        }, delayMs);
      } else {
        void apply();
      }
    };

    listener.on(EVENTS.NEW_GAME, onNewGame);
    registerDisposable(() => {
      listener.off(EVENTS.NEW_GAME, onNewGame);
      if (timer) clearTimeout(timer);
    });
  },
});
