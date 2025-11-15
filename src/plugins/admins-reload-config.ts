import fs from 'fs';
import { adminReloadServerConfig } from '../core/commands';
import { TPluginProps } from '../types';

export const adminsReloadConfig: TPluginProps = (state, options) => {
  const { logger, execute, id } = state;

  if (!options || !options.filePath) {
    logger.log(
      `adminsReloadConfig: не задан options.filePath для сервера ${id} (плагин выключен)`,
    );
    return;
  }

  const filePath = options.filePath;
  const debounceMs =
    typeof options.debounceMs === 'number' ? options.debounceMs : 1000;

  if (!fs.existsSync(filePath)) {
    logger.log(
      `adminsReloadConfig: файл Admins.cfg не найден по пути "${filePath}" для сервера ${id}`,
    );
    return;
  }

  logger.log(
    `adminsReloadConfig: отслеживаем изменения Admins.cfg для сервера ${id}: ${filePath}`,
  );

  let timer: NodeJS.Timeout | null = null;

  fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => {
    if (curr.mtimeMs === prev.mtimeMs) return;

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(async () => {
      try {
        logger.log(
          `adminsReloadConfig: файл изменён, отправляем AdminReloadServerConfig на сервер ${id}`,
        );
        await adminReloadServerConfig(execute);
        logger.log(
          `adminsReloadConfig: AdminReloadServerConfig успешно отправлена на сервер ${id}`,
        );
      } catch (error) {
        logger.log(
          `adminsReloadConfig: ошибка при отправке AdminReloadServerConfig на сервер ${id}: ${String(
            error,
          )}`,
        );
      }
    }, debounceMs);
  });
};
