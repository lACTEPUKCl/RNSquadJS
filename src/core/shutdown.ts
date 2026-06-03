import chalk from 'chalk';
import { getPluginManager } from '../plugins';
import { closeDatabase } from '../rnsdb';
import { serversState } from '../serversState';
import { ClosableServer, closeServers } from './close-servers';

let shuttingDown = false;

const collectServers = (): ClosableServer[] =>
  Object.keys(serversState).map((key) => {
    const state = serversState[Number(key)];
    return { id: state.id, rcon: state.rcon, logs: state.logs };
  });

export const gracefulShutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(
    chalk.yellow('[SquadJS]'),
    chalk.green(`Received ${signal}, shutting down…`),
  );

  await closeServers(collectServers(), {
    destroyManager: (id) => getPluginManager(id)?.destroyAll(),
    onError: (scope, error) =>
      console.log(
        chalk.yellow('[SquadJS]'),
        chalk.red(`Shutdown error in ${scope}: ${String(error)}`),
      ),
  });

  await closeDatabase().catch(() => {});

  process.exit(0);
};

export const registerProcessHandlers = (): void => {
  process.on('unhandledRejection', (reason) =>
    console.log(
      chalk.yellow('[SquadJS]'),
      chalk.red(`Unhandled rejection: ${String(reason)}`),
    ),
  );

  process.on('uncaughtException', (error: Error) => {
    console.log(
      chalk.yellow('[SquadJS]'),
      chalk.red(`Uncaught exception: ${error?.stack ?? String(error)}`),
    );
    process.exit(1);
  });

  (['SIGINT', 'SIGTERM'] as const).forEach((signal) =>
    process.on(signal, () => void gracefulShutdown(signal)),
  );
};
