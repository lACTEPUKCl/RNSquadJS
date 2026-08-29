import axios from 'axios';
import { spawn } from 'child_process';
import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminBroadcast } from '../core';
import { definePlugin } from '../core/plugin';
import { getModLastUpdateDate, writeLastModUpdateDate } from '../rnsdb';
import { getPlayers } from './helpers';

const optionsSchema = z.object({
  // modID is kept for backwards compatibility with existing configs.
  modID: z.string().optional(),
  modIDs: z.union([z.string(), z.array(z.string())]).optional(),
  steamAPIkey: z.string().optional(),
  dockerName: z.string().optional(),
  text: z.string().default(''),
  textForceUpdate: z.string().default(''),
  intervalBroadcast: z.coerce.number().int().positive().default(300000),
  checkUpdateInterval: z.coerce.number().int().positive().default(3600000),
});

export function normalizeModIds(
  modID?: string,
  modIDs?: string | string[],
): string[] {
  const values = [
    modID ?? '',
    ...(Array.isArray(modIDs) ? modIDs : [modIDs ?? '']),
  ];

  return [
    ...new Set(
      values
        .flatMap((value) => value.split(/[\s,;]+/))
        .map((value) => value.trim())
        .filter((value) => /^\d+$/.test(value)),
    ),
  ];
}

export default definePlugin({
  name: 'autoUpdateMods',
  description:
    'Автообновление Workshop-модов: пустой сервер обновляется сразу, занятый — после раунда.',
  optionsSchema,
  setup({ state, options, logger, registerDisposable }) {
    const { listener, execute } = state;
    const {
      modID,
      modIDs,
      steamAPIkey,
      text,
      dockerName,
      intervalBroadcast,
      textForceUpdate,
      checkUpdateInterval,
    } = options;
    const trackedModIds = normalizeModIds(modID, modIDs);

    if (!trackedModIds.length || !steamAPIkey || !dockerName) {
      logger.error(
        '[AutoUpdateMods] modID/modIDs, steamAPIkey или dockerName не указаны, плагин не запущен',
      );
      return;
    }

    logger.log(
      `[AutoUpdateMods] Плагин запущен. modIDs=${trackedModIds.join(',')}, интервал проверки=${checkUpdateInterval}мс`,
    );

    const pendingUpdates = new Map<string, Date>();
    let updating = false;
    let checking = false;
    let updateMsgInterval: NodeJS.Timeout | null = null;

    const onRoundEnd = () => {
      if (pendingUpdates.size > 0 && !updating) {
        void performUpdate();
      }
    };

    function clearMsgInterval() {
      if (updateMsgInterval) {
        clearInterval(updateMsgInterval);
        updateMsgInterval = null;
      }
    }

    function startMsgInterval() {
      if (updateMsgInterval || !text) return;
      adminBroadcast(execute, text);
      updateMsgInterval = setInterval(() => {
        adminBroadcast(execute, text);
      }, intervalBroadcast);
    }

    async function getWorkshopItemDetails(
      ids: string[],
    ): Promise<Map<string, Date>> {
      try {
        const params = new URLSearchParams({
          key: steamAPIkey ?? '',
          itemcount: String(ids.length),
        });
        ids.forEach((id, index) => {
          params.set(`publishedfileids[${index}]`, id);
        });

        const response = await axios.post(
          'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/',
          params.toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000,
          },
        );
        const items = response.data?.response?.publishedfiledetails;
        if (!Array.isArray(items)) {
          logger.error('[AutoUpdateMods] Steam API не вернул список модов');
          return new Map();
        }

        const versions = new Map<string, Date>();
        for (const item of items) {
          const id = String(item?.publishedfileid ?? '');
          if (!id || !item?.time_updated) {
            logger.warn(
              `[AutoUpdateMods] Для Workshop ${id || 'unknown'} не получена дата обновления`,
            );
            continue;
          }
          versions.set(id, new Date(Number(item.time_updated) * 1000));
        }
        return versions;
      } catch (error) {
        logger.error(`[AutoUpdateMods] Ошибка Steam API: ${error}`);
        return new Map();
      }
    }

    async function getLastSavedUpdate(id: string): Promise<Date | null> {
      try {
        const saved = await getModLastUpdateDate(state.id, id);
        return saved ? new Date(saved) : null;
      } catch (error) {
        logger.error(
          `[AutoUpdateMods] Ошибка чтения даты Workshop ${id}: ${error}`,
        );
        return null;
      }
    }

    async function saveLastUpdate(id: string, version: Date) {
      await writeLastModUpdateDate(state.id, id, version);
    }

    async function checkForUpdates() {
      if (checking || updating) return;
      checking = true;
      try {
        logger.log('[AutoUpdateMods] Проверка обновлений...');
        const freshVersions = await getWorkshopItemDetails(trackedModIds);

        for (const [id, freshVersion] of freshVersions) {
          const lastSavedUpdate = await getLastSavedUpdate(id);
          if (!lastSavedUpdate) {
            // Enabling the plugin must not restart an already up-to-date server.
            await saveLastUpdate(id, freshVersion);
            logger.log(
              `[AutoUpdateMods] Workshop ${id}: сохранена начальная версия ${freshVersion.toISOString()}`,
            );
            continue;
          }

          logger.log(
            `[AutoUpdateMods] Workshop ${id}: Steam=${freshVersion.toISOString()}, сохранено=${lastSavedUpdate.toISOString()}`,
          );
          if (freshVersion > lastSavedUpdate) {
            pendingUpdates.set(id, freshVersion);
          }
        }

        if (pendingUpdates.size === 0) return;

        const players = getPlayers(state) ?? [];
        logger.log(
          `[AutoUpdateMods] Ожидают установки: ${[...pendingUpdates.keys()].join(',')}; игроков=${players.length}`,
        );
        if (players.length === 0) {
          await performUpdate();
        } else {
          startMsgInterval();
        }
      } catch (error) {
        logger.error(`[AutoUpdateMods] Ошибка проверки: ${error}`);
      } finally {
        checking = false;
      }
    }

    function runCompose(args: string[]): Promise<void> {
      return new Promise((resolve, reject) => {
        const child = spawn(
          '/usr/bin/docker',
          ['compose', '--profile', 'manual-cutover', ...args],
          { cwd: '/root/host' },
        );
        let stderr = '';
        child.stderr?.on('data', (chunk) => {
          stderr += String(chunk);
        });
        child.on('exit', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(
              new Error(
                `docker compose ${args.join(' ')}: код ${code}; ${stderr.trim()}`,
              ),
            );
          }
        });
        child.on('error', reject);
      });
    }

    async function stopService() {
      logger.log(`[AutoUpdateMods] Останавливаем ${dockerName}...`);
      await runCompose(['stop', dockerName as string]);
    }

    async function startService() {
      logger.log(`[AutoUpdateMods] Запускаем ${dockerName}...`);
      await runCompose(['up', '-d', dockerName as string]);
    }

    async function performUpdate() {
      if (updating || pendingUpdates.size === 0) return;

      updating = true;
      clearMsgInterval();
      if (textForceUpdate && (getPlayers(state)?.length ?? 0) > 0) {
        adminBroadcast(execute, textForceUpdate);
      }

      const versionsToSave = new Map(pendingUpdates);
      let serviceStopped = false;
      logger.log(
        `[AutoUpdateMods] Устанавливаем Workshop: ${[...versionsToSave.keys()].join(',')}`,
      );
      try {
        await stopService();
        serviceStopped = true;
        await startService();
        serviceStopped = false;

        for (const [id, version] of versionsToSave) {
          await saveLastUpdate(id, version);
          pendingUpdates.delete(id);
        }
        logger.log('[AutoUpdateMods] Моды успешно обновлены');
      } catch (error) {
        logger.error(`[AutoUpdateMods] Ошибка при обновлении: ${error}`);
        if (serviceStopped) {
          try {
            await startService();
            logger.warn(
              '[AutoUpdateMods] Сервис снова запущен после ошибки обновления',
            );
          } catch (recoveryError) {
            logger.error(
              `[AutoUpdateMods] Не удалось восстановить сервис: ${recoveryError}`,
            );
          }
        }
      } finally {
        updating = false;
        if (pendingUpdates.size > 0 && (getPlayers(state)?.length ?? 0) > 0) {
          startMsgInterval();
        }
      }
    }

    listener.on(EVENTS.ROUND_ENDED, onRoundEnd);
    const checkTimer = setInterval(() => {
      void checkForUpdates();
    }, checkUpdateInterval);
    void checkForUpdates();

    registerDisposable(() => {
      clearInterval(checkTimer);
      clearMsgInterval();
      listener.off(EVENTS.ROUND_ENDED, onRoundEnd);
      logger.log('[AutoUpdateMods] Плагин остановлен, ресурсы очищены');
    });
  },
});
