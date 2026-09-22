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

    // A map load/reconnect is not evidence that the server is empty.
    const graceMs = 120000;
    const lowPopulationMs = 60000;
    const staleMs = 45000;
    let graceUntil = Date.now() + graceMs;
    let betweenRounds = false;
    let lowSince: number | null = null;
    let lastSample: number | null = null;
    let lastCountedSample: number | null = null;
    let samples = 0;
    let awaitingConfirmation = false;
    let disconnected = false;

    const playerCount = () => state.players?.length ?? Number.NaN;
    const layerIsSeed = (layer: string | null | undefined) => {
      const name = (layer ?? '').trim().toLowerCase();
      const keyword = seedKeyword.trim().toLowerCase();
      return (
        !!name &&
        (seedLayers.some((seed) => seed.trim().toLowerCase() === name) ||
          (!!keyword && name.includes(keyword)))
      );
    };
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
        awaitingConfirmation = true;
        return;
      }
      if (broadcastEnabled && broadcastIntervalMs < countdownMs) {
        broadcastTimer = setInterval(announce, broadcastIntervalMs);
      }
      // Only a NEW player response after the countdown may authorize a change.
      countdownTimer = setTimeout(() => {
        awaitingConfirmation = true;
      }, countdownMs);
    };

    const cancelSwitch = () => {
      clearTimers();
      switching = false;
      if (broadcastEnabled) adminBroadcast(execute, cancelMessage);
      logger.log('[seed] переход отменён — игроков снова достаточно.');
    };

    const reset = () => {
      if (switching)
        logger.log('[seed] переход отменён — данные не подтверждены.');
      clearTimers();
      switching = false;
      awaitingConfirmation = false;
      lowSince = null;
      lastSample = null;
      lastCountedSample = null;
      samples = 0;
    };

    const evaluate = () => {
      const now = Date.now();
      if (disconnected || betweenRounds || now < graceUntil) return;
      if (lastSample !== null && now - lastSample > staleMs) reset();
      if (!Number.isFinite(playerCount()) || !state.currentMap?.layer) {
        reset();
        return;
      }
      const low = playerCount() < playerThreshold;
      if (!low) {
        if (switching) cancelSwitch();
        reset();
        return;
      }
      if (
        layerIsSeed(state.currentMap.layer) ||
        (mode === 'next' && layerIsSeed(state.nextMap?.layer))
      ) {
        reset();
        return;
      }
      // Ignore duplicate updates from concurrent refresh callers.
      if (lastCountedSample === null || now - lastCountedSample >= 5000) {
        samples++;
        lastCountedSample = now;
      }
      lastSample = now;
      if (lowSince === null) lowSince = now;
      if (switching) {
        if (awaitingConfirmation && now >= switchAt) void applySwitch();
        return;
      }
      if (handledThisRound) return;
      if (layerIsSeed(state.currentMap?.layer)) return;
      if (mode === 'next' && layerIsSeed(state.nextMap?.layer)) return;
      if (samples >= 3 && now - lowSince >= lowPopulationMs) startSwitch();
    };

    const onNewGame = () => {
      handledThisRound = false;
      betweenRounds = false;
      graceUntil = Date.now() + graceMs;
      reset();
    };
    const onRoundEnd = () => {
      betweenRounds = true;
      reset();
    };
    const onClose = () => {
      disconnected = true;
      reset();
    };
    const onConnected = () => {
      disconnected = false;
      graceUntil = Date.now() + graceMs;
      reset();
    };
    state.rcon.rconEmitter.on('close', onClose);
    state.rcon.rconEmitter.on('connected', onConnected);
    // Use the raw lifecycle event: forwarding NEW_GAME waits for RCON queries.
    state.coreListener.on(EVENTS.NEW_GAME, onNewGame);
    state.coreListener.on(EVENTS.ROUND_ENDED, onRoundEnd);
    const watchdog = setInterval(() => {
      if (lastSample !== null && Date.now() - lastSample > staleMs) reset();
    }, 1000);

    listener.on(EVENTS.UPDATED_PLAYERS, evaluate);
    listener.on(EVENTS.NEW_GAME, onNewGame);
    registerDisposable(() => {
      listener.off(EVENTS.UPDATED_PLAYERS, evaluate);
      listener.off(EVENTS.NEW_GAME, onNewGame);
      state.coreListener.off(EVENTS.NEW_GAME, onNewGame);
      state.coreListener.off(EVENTS.ROUND_ENDED, onRoundEnd);
      state.rcon.rconEmitter.off('close', onClose);
      state.rcon.rconEmitter.off('connected', onConnected);
      clearInterval(watchdog);
      clearTimers();
    });
  },
});
