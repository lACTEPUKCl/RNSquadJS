import axios from 'axios';
import { spawn } from 'child_process';
import { EVENTS } from '../constants';
import { adminBroadcast } from '../core';
import { getModLastUpdateDate, writeLastModUpdateDate } from '../rnsdb';
import { TPluginProps } from '../types';
import { getPlayers } from './helpers';

export const autoUpdateMods: TPluginProps = async (state, options) => {
  const { listener, execute, logger } = state;
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
  listener.on(EVENTS.ROUND_ENDED, onRoundEnd);

  const checkTimer = setInterval(async () => {
    try {
      logger.log('[AutoUpdateMods] Проверка обновлений...');
      const freshVersion = await getWorkshopItemDetails();
      if (!freshVersion) {
        logger.warn('[AutoUpdateMods] Не удалось получить версию из Steam API');
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
  }, Number(checkUpdateInterval));

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
    }, Number(intervalBroadcast));
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
          `[AutoUpdateMods] Некорректный ответ Steam API: ${JSON.stringify(response.data?.response)}`,
        );
        return null;
      }
      return new Date(item.time_updated * 1000);
    } catch (error) {
      logger.error(`[AutoUpdateMods] Ошибка Steam API: ${error}`);
      return null;
    }
  }

  async function getLastSavedUpdate(modID: string): Promise<Date | null> {
    try {
      const saved = await getModLastUpdateDate(modID);
      return saved ? new Date(saved) : null;
    } catch (error) {
      logger.error(`[AutoUpdateMods] Ошибка чтения даты обновления: ${error}`);
      return null;
    }
  }

  async function saveLastUpdate(version: Date) {
    try {
      await writeLastModUpdateDate(modID, version);
    } catch (error) {
      logger.error(
        `[AutoUpdateMods] Ошибка сохранения даты обновления: ${error}`,
      );
    }
  }

  function stopService(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.log(`Останавливаем сервис ${dockerName}...`);
      const child = spawn('/usr/bin/docker', ['compose', 'down', dockerName], {
        cwd: '/root/host',
      });
      child.on('exit', (code) => {
        if (code === 0) {
          logger.log(`Сервис ${dockerName} остановлен`);
          resolve();
        } else {
          reject(
            new Error(`Остановка ${dockerName} завершилась с кодом ${code}`),
          );
        }
      });
      child.on('error', (err) => reject(err));
    });
  }

  function startService(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.log(`Запускаем сервис ${dockerName}...`);
      const child = spawn(
        '/usr/bin/docker',
        ['compose', 'up', '-d', dockerName],
        {
          cwd: '/root/host',
        },
      );
      child.on('exit', (code) => {
        if (code === 0) {
          logger.log(`Сервис ${dockerName} запущен`);
          resolve();
        } else {
          reject(new Error(`Запуск ${dockerName} завершился с кодом ${code}`));
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

  const cleanup = () => {
    clearInterval(checkTimer);
    clearAllTimers();
    listener.off(EVENTS.ROUND_ENDED, onRoundEnd);
    logger.log('[AutoUpdateMods] Плагин остановлен, ресурсы очищены');
  };

  return cleanup;
};
