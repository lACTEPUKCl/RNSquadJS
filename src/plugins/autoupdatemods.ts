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

  let newUpdate = false;
  let currentVersion: Date | null = null;
  let updateMessage: NodeJS.Timeout;
  let intervalMessage: NodeJS.Timeout;

  listener.on(EVENTS.ROUND_ENDED, endMatch);

  setInterval(async () => {
    currentVersion = await getWorkshopItemDetails();

    if (currentVersion) {
      const lastSavedUpdate = await getLastSavedUpdate(modID);

      if (!lastSavedUpdate || currentVersion > lastSavedUpdate) {
        const players = getPlayers(state);

        logger.log(
          'Доступно новое обновление:',
          currentVersion.toLocaleString(),
        );

        if (players && players.length < 50) {
          newUpdate = true;
          scheduleUpdate();
          return;
        }

        newUpdate = true;
        updateMessage = setInterval(() => {
          adminBroadcast(execute, text);
        }, Number(intervalBroadcast));
      }
    }
  }, checkUpdateInterval);

  async function endMatch() {
    if (newUpdate && currentVersion) {
      await performUpdate();
    }
  }

  async function getWorkshopItemDetails(): Promise<Date | null> {
    try {
      const response = await axios.post(
        'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/',
        `key=${steamAPIkey}&itemcount=1&publishedfileids[0]=${modID}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const itemDetails = response.data.response.publishedfiledetails[0];
      return new Date(itemDetails.time_updated * 1000);
    } catch (error) {
      logger.error(`Ошибка при получении деталей воркшопа: ${error}`);
      return null;
    }
  }

  async function getLastSavedUpdate(modID: string): Promise<Date | null> {
    try {
      const savedTime = await getModLastUpdateDate(modID);
      return savedTime ? new Date(savedTime) : null;
    } catch (error) {
      logger.error(`Ошибка при чтении времени последнего обновления: ${error}`);
      return null;
    }
  }

  async function saveLastUpdate(currentVersion: Date) {
    try {
      await writeLastModUpdateDate(modID, currentVersion);
    } catch (error) {
      logger.error(
        `Ошибка при сохранении времени последнего обновления: ${error}`,
      );
    }
  }

  async function stopService() {
    try {
      logger.log('Попытка остановить сервис:', dockerName);
      const child = spawn('/usr/bin/docker', ['compose', 'down', dockerName], {
        cwd: '/root/servers',
      });

      child.on('exit', async (code) => {
        if (code === 0) {
          logger.log(`Сервис ${dockerName} успешно остановлен.`);
          await startService();
        } else {
          logger.error(
            `Ошибка при остановке сервиса ${dockerName}, код выхода: ${code}`,
          );
        }
      });

      child.on('error', (error) => {
        logger.error(`Ошибка при остановке сервиса ${dockerName}: ${error}`);
      });
    } catch (error) {
      logger.error(`Ошибка при остановке сервиса: ${error}`);
    }
  }

  async function startService() {
    try {
      logger.log('Попытка запустить сервис:', dockerName);
      const child = spawn(
        '/usr/bin/docker',
        ['compose', 'up', '-d', dockerName],
        {
          cwd: '/root/servers',
        },
      );

      child.on('exit', (code) => {
        if (code === 0) {
          logger.log(`Сервис ${dockerName} успешно запущен.`);
          logger.log('Мод обновлен...');
        } else {
          logger.error(
            `Ошибка при запуске сервиса ${dockerName}, код выхода: ${code}`,
          );
        }
      });

      child.on('error', (error) => {
        logger.error(`Ошибка при запуске сервиса ${dockerName}: ${error}`);
      });
    } catch (error) {
      logger.error(`Ошибка при запуске сервиса: ${error}`);
    }
  }

  async function performUpdate() {
    logger.log('Обновление мода...');
    try {
      await stopService();
      if (currentVersion) {
        await saveLastUpdate(currentVersion);
      }
      clearInterval(updateMessage);
      newUpdate = false;
    } catch (error) {
      logger.error(`Ошибка при обновлении мода:' ${error}`);
    }
  }

  function scheduleUpdate() {
    intervalMessage = setInterval(() => {
      adminBroadcast(execute, textForceUpdate);
    }, 10000);

    setTimeout(async () => {
      clearInterval(intervalMessage);
      if (newUpdate && currentVersion) {
        await performUpdate();
      }
    }, 60000);
  }
};
