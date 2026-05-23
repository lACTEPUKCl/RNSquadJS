import chalk from 'chalk';
import { initServer, initSquadJS } from './core';
import { registerProcessHandlers } from './core/shutdown';
import { connectToDatabase } from './rnsdb';
import { TError } from './types';
import { getConfigs } from './utils';
const initial = async () => {
  registerProcessHandlers();

  const configs = getConfigs();

  if (configs?.length) {
    for (const config of configs) {
      try {
        const [rcon, logs] = await initServer(config);

        await initSquadJS({
          rcon,
          logs,
          id: config.id,
          mapsName: config.mapsName,
          plugins: config.plugins,
          database: config.database,
        });

        await connectToDatabase(config.db, config.database, config.id);

        console.log(
          chalk.yellow('[SquadJS]'),
          chalk.green(
            `Сервер ${config.id} запущен (${config.host}:${config.port}), плагинов в конфиге: ${config.plugins.length}.`,
          ),
        );
      } catch (error) {
        const err = error as TError;

        if (err?.id && err?.message) {
          console.log(
            chalk.yellow(`[SquadJS]`),
            chalk.red(`Server ${err.id} error: ${err.message}`),
          );
        } else {
          console.log(chalk.yellow(`[SquadJS]`), chalk.red(error));
        }
      }
    }
  }
};

initial();
