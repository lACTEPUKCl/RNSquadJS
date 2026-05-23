import axios from 'axios';
import { spawn } from 'child_process';
import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminBroadcast } from '../core';
import { definePlugin } from '../core/plugin';
import { getModLastUpdateDate, writeLastModUpdateDate } from '../rnsdb';
import { getPlayers } from './helpers';

const optionsSchema = z.object({
  modID: z.string().optional(),
  steamAPIkey: z.string().optional(),
  dockerName: z.string().optional(),
  text: z.string().default(''),
  textForceUpdate: z.string().default(''),
  intervalBroadcast: z.coerce.number().int().positive().default(10000),
  checkUpdateInterval: z.coerce.number().int().positive().default(3600000),
});

export default definePlugin({
  name: 'autoUpdateMods',
  description: 'Авто-обновление мода Workshop с перезапуском docker-сервиса.',
  optionsSchema,
  setup({ state, options, logger, registerDisposable }) {
    const { listener, execute } = state;
    const {
      modID,
      steamAPIkey,
      text,
      dockerName,
      intervalBroadcast,
      textForceUpdate,
      checkUpdateInterval,
    } = options;

    if (!modID || !steamAPIkey || !dockerName) {
      logger.error(
        '[AutoUpdateMods] modID, steamAPIkey или dockerName не указаны в конфиге, плагин не запущен',
      );
      return;
    }

    const dockerService: string = dockerName;
    const modIdSafe: string = modID;

    logger.log(
      `[AutoUpdateMods] Плагин запущен. modID=${modID}, интервал проверки=${checkUpdateInterval}мс`,
    );

    let newUpdate = false;
    let updating = false;
    let currentVersion: Date | null = null;
    let updateMsgInterval: NodeJS.Timeout | null = null;
    let forceMsgInterval: NodeJS.Timeout | null = null;
    let forceTimeout: NodeJS.Timeout | null = null;

    const onRoundEnd = () => {
      if (newUpdate && !updating && currentVersion) {
        performUpdate();
      }
    };

    const checkTimer = setInterval(async () => {
      try {
        logger.log('[AutoUpdateMods] Проверка обновлений...');
        const freshVersion = await getWorkshopItemDetails();
        if (!freshVersion) {
          logger.warn(
            '[AutoUpdateMods] Не удалось получить версию из Steam API',
          );
          return;
        }

        currentVersion = freshVersion;
        const lastSavedUpdate = await getLastSavedUpdate(modID);

        logger.log(
          `[AutoUpdateMods] Steam версия: ${currentVersion.toISOString()}, сохранённая: ${
            lastSavedUpdate?.toISOString() ?? 'нет'
          }`,
        );

        if (!lastSavedUpdate || currentVersion > lastSavedUpdate) {
          const players = getPlayers(state);
          logger.log(
            `[AutoUpdateMods] Доступно обновление: ${currentVersion.toLocaleString()}, игроков: ${
              players?.length ?? 0
            }`,
          );

          newUpdate = true;

          if (players && players.length < 50) {
            clearMsgInterval();
            scheduleForceUpdate();
          } else {
            clearForceTimers();
            startMsgInterval();
          }
        }
      } catch (error) {
        logger.error(`[AutoUpdateMods] Ошибка в цикле проверки: ${error}`);
      }
    }, checkUpdateInterval);

    function clearMsgInterval() {
      if (updateMsgInterval) {
        clearInterval(updateMsgInterval);
        updateMsgInterval = null;
      }
    }

    function clearForceTimers() {
      if (forceMsgInterval) {
        clearInterval(forceMsgInterval);
        forceMsgInterval = null;
      }
      if (forceTimeout) {
        clearTimeout(forceTimeout);
        forceTimeout = null;
      }
    }

    function clearAllTimers() {
      clearMsgInterval();
      clearForceTimers();
    }

    function startMsgInterval() {
      clearMsgInterval();
      updateMsgInterval = setInterval(() => {
        adminBroadcast(execute, text);
      }, intervalBroadcast);
    }

    function scheduleForceUpdate() {
      clearForceTimers();
      forceMsgInterval = setInterval(() => {
        adminBroadcast(execute, textForceUpdate);
      }, 10000);

      forceTimeout = setTimeout(async () => {
        clearForceTimers();
        if (newUpdate && !updating && currentVersion) {
          await performUpdate();
        }
      }, 60000);
    }

    async function getWorkshopItemDetails(): Promise<Date | null> {
      try {
        const response = await axios.post(
          'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/',
          `key=${steamAPIkey}&itemcount=1&publishedfileids[0]=${modID}`,
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000,
          },
        );
        const item = response.data?.response?.publishedfiledetails?.[0];
        if (!item?.time_updated) {
          logger.error(
            `[AutoUpdateMods] Некорректный ответ Steam API: ${JSON.stringify(
              response.data?.response,
            )}`,
          );
          return null;
        }
        return new Date(item.time_updated * 1000);
      } catch (error) {
        logger.error(`[AutoUpdateMods] Ошибка Steam API: ${error}`);
        return null;
      }
    }

    async function getLastSavedUpdate(id: string): Promise<Date | null> {
      try {
        const saved = await getModLastUpdateDate(state.id, id);
        return saved ? new Date(saved) : null;
      } catch (error) {
        logger.error(
          `[AutoUpdateMods] Ошибка чтения даты обновления: ${error}`,
        );
        return null;
      }
    }

    async function saveLastUpdate(version: Date) {
      try {
        await writeLastModUpdateDate(state.id, modIdSafe, version);
      } catch (error) {
        logger.error(
          `[AutoUpdateMods] Ошибка сохранения даты обновления: ${error}`,
        );
      }
    }

    function stopService(): Promise<void> {
      return new Promise((resolve, reject) => {
        logger.log(`Останавливаем сервис ${dockerService}...`);
        const child = spawn(
          '/usr/bin/docker',
          ['compose', 'down', dockerService],
          { cwd: '/root/host' },
        );
        child.on('exit', (code) => {
          if (code === 0) {
            logger.log(`Сервис ${dockerService} остановлен`);
            resolve();
          } else {
            reject(
              new Error(
                `Остановка ${dockerService} завершилась с кодом ${code}`,
              ),
            );
          }
        });
        child.on('error', (err) => reject(err));
      });
    }

    function startService(): Promise<void> {
      return new Promise((resolve, reject) => {
        logger.log(`Запускаем сервис ${dockerService}...`);
        const child = spawn(
          '/usr/bin/docker',
          ['compose', 'up', '-d', dockerService],
          { cwd: '/root/host' },
        );
        child.on('exit', (code) => {
          if (code === 0) {
            logger.log(`Сервис ${dockerService} запущен`);
            resolve();
          } else {
            reject(
              new Error(`Запуск ${dockerService} завершился с кодом ${code}`),
            );
          }
        });
        child.on('error', (err) => reject(err));
      });
    }

    async function performUpdate() {
      if (updating) {
        logger.log('[AutoUpdateMods] Обновление уже выполняется, пропускаем');
        return;
      }

      updating = true;
      logger.log('[AutoUpdateMods] Запуск обновления...');
      try {
        await stopService();
        if (currentVersion) {
          await saveLastUpdate(currentVersion);
        }
        await startService();
        logger.log('[AutoUpdateMods] Мод успешно обновлён');
      } catch (error) {
        logger.error(`[AutoUpdateMods] Ошибка при обновлении: ${error}`);
      } finally {
        newUpdate = false;
        updating = false;
        clearAllTimers();
      }
    }

    listener.on(EVENTS.ROUND_ENDED, onRoundEnd);

    registerDisposable(() => {
      clearInterval(checkTimer);
      clearAllTimers();
      listener.off(EVENTS.ROUND_ENDED, onRoundEnd);
      logger.log('[AutoUpdateMods] Плагин остановлен, ресурсы очищены');
    });
  },
});
