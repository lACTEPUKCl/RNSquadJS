import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminBroadcast, adminChangeLayer, adminSetNextLayer } from '../core';
import { definePlugin } from '../core/plugin';

const optionsSchema = z.object({
  playerThreshold: z.coerce.number().int().nonnegative().default(20),
  seedLayers: z.union([z.string(), z.array(z.string())]).default([]),
  mode: z.enum(['next', 'now']).default('next'),
  seedKeyword: z.string().default('Seed'),
  countdownMs: z.coerce.number().int().nonnegative().default(30000),
  broadcastEnabled: z.boolean().default(true),
  broadcastIntervalMs: z.coerce.number().int().positive().default(10000),
  broadcastMessage: z
    .string()
    .default('Мало игроков — переход на seed-карту через {time} сек.'),
  cancelMessage: z
    .string()
    .default('Игроков снова достаточно, переход на seed отменён.'),
});

export default definePlugin({
  name: 'seed',
  description:
    'При нехватке игроков и не-seed карте переводит сервер на указанный seed-слой (с предупреждением и таймером).',
  optionsSchema,
  setup({ state, options, logger, registerDisposable }) {
    const { listener, execute } = state;
    const {
      playerThreshold,
      mode,
      seedKeyword,
      countdownMs,
      broadcastEnabled,
      broadcastIntervalMs,
      broadcastMessage,
      cancelMessage,
    } = options;

    const seedLayers = (
      Array.isArray(options.seedLayers)
        ? options.seedLayers
        : [options.seedLayers]
    ).filter(Boolean);

    if (seedLayers.length === 0) {
      logger.warn('seed: не указан seedLayers — плагин не запущен.');
      return;
    }

    let countdownTimer: ReturnType<typeof setTimeout> | null = null;
    let broadcastTimer: ReturnType<typeof setInterval> | null = null;
    let switchAt = 0;
    let switching = false;
    let handledThisRound = false;

    const playerCount = () => state.players?.length ?? 0;
    const layerIsSeed = (layer: string | null | undefined) =>
      (layer ?? '').toLowerCase().includes(seedKeyword.toLowerCase());
    const pickSeed = () =>
      seedLayers[Math.floor(Math.random() * seedLayers.length)];

    const clearTimers = () => {
      if (countdownTimer) {
        clearTimeout(countdownTimer);
        countdownTimer = null;
      }
      if (broadcastTimer) {
        clearInterval(broadcastTimer);
        broadcastTimer = null;
      }
    };

    const announce = () => {
      if (!broadcastEnabled) return;
      const secs = Math.max(0, Math.ceil((switchAt - Date.now()) / 1000));
      adminBroadcast(execute, broadcastMessage.replace('{time}', String(secs)));
    };

    const applySwitch = async () => {
      clearTimers();
      switching = false;
      handledThisRound = true;
      const layer = pickSeed();
      try {
        if (mode === 'now') {
          await adminChangeLayer(execute, layer);
          logger.log(
            `[seed] AdminChangeLayer ${layer} (игроков ${playerCount()})`,
          );
        } else {
          await adminSetNextLayer(execute, layer);
          logger.log(
            `[seed] AdminSetNextLayer ${layer} (игроков ${playerCount()})`,
          );
        }
      } catch (e) {
        logger.error(`[seed] ошибка переключения: ${String(e)}`);
      }
    };

    const startSwitch = () => {
      switching = true;
      switchAt = Date.now() + countdownMs;
      logger.log(
        `[seed] мало игроков (${playerCount()} < ${playerThreshold}), переход на seed через ${Math.round(
          countdownMs / 1000,
        )}с (режим ${mode}).`,
      );
      announce();
      if (countdownMs <= 0) {
        void applySwitch();
        return;
      }
      if (broadcastEnabled && broadcastIntervalMs < countdownMs) {
        broadcastTimer = setInterval(announce, broadcastIntervalMs);
      }
      countdownTimer = setTimeout(() => void applySwitch(), countdownMs);
    };

    const cancelSwitch = () => {
      clearTimers();
      switching = false;
      if (broadcastEnabled) adminBroadcast(execute, cancelMessage);
      logger.log('[seed] переход отменён — игроков снова достаточно.');
    };

    const evaluate = () => {
      const low = playerCount() < playerThreshold;
      if (switching) {
        if (!low) cancelSwitch();
        return;
      }
      if (handledThisRound) return;
      if (layerIsSeed(state.currentMap?.layer)) return;
      if (mode === 'next' && layerIsSeed(state.nextMap?.layer)) return;
      if (low) startSwitch();
    };

    const onNewGame = () => {
      handledThisRound = false;
      clearTimers();
      switching = false;
      evaluate();
    };

    listener.on(EVENTS.UPDATED_PLAYERS, evaluate);
    listener.on(EVENTS.NEW_GAME, onNewGame);
    registerDisposable(() => {
      listener.off(EVENTS.UPDATED_PLAYERS, evaluate);
      listener.off(EVENTS.NEW_GAME, onNewGame);
      clearTimers();
    });
  },
});
