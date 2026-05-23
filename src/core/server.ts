import { LogsReader, TLogReaderOptions } from 'squad-logs';
import { Rcon } from 'squad-rcon';
import { TConfig, TLogs, TRcon } from '../types';

const RCON_CONNECT_TIMEOUT = 120000;

export const initServer = async (config: TConfig) => {
  const { id, host, port, password, ftp, logFilePath, adminsFilePath } = config;

  const rcon = new Rcon({
    id,
    host,
    port,
    password,
  });

  const logsReaderConfig = ftp
    ? {
        id,
        host,
        adminsFilePath,
        autoReconnect: true,
        filePath: logFilePath,
        username: ftp.username,
        password: ftp.password,
        readType: 'remote',
      }
    : {
        id,
        filePath: logFilePath,
        adminsFilePath,
        readType: 'local',
        autoReconnect: true,
      };

  const logsReader = new LogsReader(logsReaderConfig as TLogReaderOptions);

  return Promise.all([
    new Promise<TRcon>(async (res, rej) => {
      try {
        // rcon.init() в библиотеке реджектится на ПЕРВОМ 'close' (даже если
        // это транзиентная ошибка коннекта), при этом внутренний autoReconnect
        // продолжает дожимать подключение сам. Поэтому не полагаемся на init():
        // ждём событие 'connected' (шлётся при каждом успешном коннекте), а
        // реджект init() глушим. Иначе при первой ошибке коннекта initServer
        // падал, и initSquadJS/initState/плагины не запускались вовсе.
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('RCON: не удалось подключиться за 120с')),
            RCON_CONNECT_TIMEOUT,
          );
          rcon.once('connected', () => {
            clearTimeout(timeout);
            resolve();
          });
          rcon.init().catch(() => undefined);
        });

        res({
          rconEmitter: rcon,
          close: rcon.close.bind(rcon),
          execute: rcon.execute.bind(rcon),
        });
      } catch (error) {
        rej(error);
      }
    }),
    new Promise<TLogs>(async (res, rej) => {
      try {
        await logsReader.init();
        res({
          logsEmitter: logsReader,
          getAdmins: logsReader.getAdminsFile.bind(logsReader),
          close: logsReader.close.bind(logsReader),
        });
      } catch (error) {
        rej(error);
      }
    }),
  ]);
};
