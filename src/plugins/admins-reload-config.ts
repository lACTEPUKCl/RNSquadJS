import fs from 'fs';
import { z } from 'zod';
import { adminReloadServerConfig } from '../core/commands';
import { definePlugin } from '../core/plugin';

const optionsSchema = z.object({
  filePath: z.string().optional(),
  debounceMs: z.coerce.number().int().positive().default(1000),
});

export default definePlugin({
  name: 'adminsReloadConfig',
  description: 'AdminReloadServerConfig при изменении Admins.cfg.',
  optionsSchema,
  setup({ state, options, logger, registerDisposable }) {
    const { execute, id } = state;
    const { filePath, debounceMs } = options;

    if (!filePath) {
      logger.log(
        `adminsReloadConfig: не задан options.filePath для сервера ${id} (плагин выключен)`,
      );
      return;
    }

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

    const onChange = (curr: fs.Stats, prev: fs.Stats) => {
      if (curr.mtimeMs === prev.mtimeMs) return;
      if (timer) clearTimeout(timer);

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
    };

    fs.watchFile(filePath, { interval: 1000 }, onChange);
    registerDisposable(() => {
      fs.unwatchFile(filePath, onChange);
      if (timer) clearTimeout(timer);
    });
  },
});
