import * as fs from 'node:fs';
import * as path from 'node:path';
import { DataTypes, Model, ModelStatic, Optional, Sequelize } from 'sequelize';
import { TPlayerConnected, TPlayerDisconnected } from 'squad-logs';
import { EVENTS } from '../constants';
import { TPluginProps } from '../types';
import { getPlayerByEOSID } from './helpers.js';

const INTERVAL_MS = 90_000;
const MIN_PLAYERS_FOR_SETTINGS = 50;
const fsp = fs.promises;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: JsonValue }
  | ReadonlyArray<JsonValue>;

const fromDbJson = (val: JsonValue | null): JsonValue | null => {
  if (val == null) return null;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as JsonValue;
    } catch {
      return val;
    }
  }
  return val;
};

const writeJsonPretty = (file: string, data: JsonValue): Promise<void> =>
  fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf8');

type KothPlayerDataAttrs = {
  id: number;
  player_id: string | null;
  lastsave: Date | null;
  serversave: number | null;
  playerdata: JsonValue | null;
};

type KothPlayerDataCreationAttrs = Optional<
  KothPlayerDataAttrs,
  'id' | 'player_id' | 'lastsave' | 'serversave' | 'playerdata'
>;

interface KothPlayerDataInstance
  extends Model<KothPlayerDataAttrs, KothPlayerDataCreationAttrs>,
    KothPlayerDataAttrs {}

const readBufSafe = async (file: string): Promise<Buffer | null> => {
  try {
    return await fsp.readFile(file);
  } catch {
    return null;
  }
};

const swapBE = (buf: Buffer): Buffer => {
  const n = buf.length & ~1;
  const out = Buffer.allocUnsafe(n);
  for (let i = 0; i < n; i += 2) {
    out[i] = buf[i + 1];
    out[i + 1] = buf[i];
  }
  return out;
};

const SAMPLE = 4096;

const decodeHeuristic = (buf: Buffer): string => {
  const len = buf.length;

  if (len >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString('utf8');
  }
  if (len >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString('utf16le');
  }
  if (len >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return swapBE(buf.subarray(2)).toString('utf16le');
  }

  let evenZeros = 0;
  let oddZeros = 0;
  let sawZero = false;
  const lim = Math.min(len, SAMPLE);

  for (let i = 0; i < lim; i++) {
    if (buf[i] === 0x00) {
      sawZero = true;
      (i & 1) === 0 ? evenZeros++ : oddZeros++;
      if (evenZeros + oddZeros >= 8) break;
    }
  }

  if (sawZero) {
    const data = oddZeros > evenZeros ? buf : swapBE(buf);
    return data.toString('utf16le');
  }

  const s = buf.toString('utf8');

  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
};

export const officialKothDb: TPluginProps = (state, options) => {
  const { listener, logger } = state;
  const kothFolderPath: string =
    typeof options.kothFolderPath === 'string' && options.kothFolderPath.trim()
      ? options.kothFolderPath
      : './SquadGame/Saved/KOTH/';
  const syncEnabled: boolean =
    typeof options.syncEnabled === 'boolean' ? options.syncEnabled : true;
  const serverId: number =
    typeof options.serverId === 'number' && Number.isFinite(options.serverId)
      ? options.serverId
      : 1;

  type DbFields = {
    url?: string;
    dialect?: 'mariadb';
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
  };

  const dbCfg: DbFields = (options.db || {}) as DbFields;
  let sequelize: Sequelize;

  if (dbCfg.url && dbCfg.url.trim()) {
    sequelize = new Sequelize(dbCfg.url, { logging: false });
  } else {
    sequelize = new Sequelize(
      dbCfg.database || 'database',
      dbCfg.username || 'username',
      dbCfg.password || 'password',
      {
        host: dbCfg.host || '127.0.0.1',
        port: typeof dbCfg.port === 'number' ? dbCfg.port : 3306,
        dialect: dbCfg.dialect || 'mariadb',
        logging: false,
      },
    );
  }

  const KothPlayerData: ModelStatic<KothPlayerDataInstance> =
    sequelize.define<KothPlayerDataInstance>(
      'KOTH_PlayerData',
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        player_id: {
          type: DataTypes.STRING(255),
          allowNull: true,
          unique: true,
        },
        lastsave: { type: DataTypes.DATE, allowNull: true },
        serversave: { type: DataTypes.INTEGER, allowNull: true },
        playerdata: { type: DataTypes.JSON, allowNull: true },
      },
      { tableName: 'KOTH_PlayerData', timestamps: false },
    );

  const resolvedKothPath = path.isAbsolute(kothFolderPath)
    ? kothFolderPath
    : path.resolve(process.cwd(), kothFolderPath);
  const playerFilePath = (steamID: string) =>
    path.join(resolvedKothPath, `${steamID}.json`);
  const serverSettingsPath = path.join(resolvedKothPath, 'ServerSettings.json');
  const playerListPath = path.join(resolvedKothPath, 'PlayerList.json');

  const ensureKothDir = async (): Promise<void> => {
    try {
      await fsp.mkdir(resolvedKothPath, { recursive: true });
    } catch {
      logger.error(
        `[KothDb] Failed to create KOTH directory at ${resolvedKothPath}`,
      );
    }
  };

  const readPlayerListFlexible = async (): Promise<string[]> => {
    const buf = await readBufSafe(playerListPath);

    if (!buf) return [];

    const raw = decodeHeuristic(buf);
    let json: JsonValue | null = null;

    try {
      json = JSON.parse(raw) as JsonValue;
    } catch {
      return [];
    }

    if (!json || typeof json !== 'object' || Array.isArray(json)) return [];

    const root = json as { readonly [k: string]: JsonValue };
    const players = root['players'];

    if (!Array.isArray(players)) return [];

    const result: string[] = [];

    for (const v of players) if (typeof v === 'string' && v) result.push(v);

    return result;
  };

  const syncServerSettingsFromDB = async (): Promise<void> => {
    try {
      const row = await KothPlayerData.findOne({
        where: { player_id: 'ServerSettings' },
      });

      if (!row || row.playerdata == null) return;

      const data = fromDbJson(row.playerdata) ?? ({} as JsonValue);

      await writeJsonPretty(serverSettingsPath, data);
    } catch {
      logger.error(`[KothDb] Error syncing ServerSettings`);
    }
  };

  type NonNullJson = Exclude<JsonValue, null>;

  const upsertPlayer = async (
    steamID: string,
    json: NonNullJson,
  ): Promise<void> => {
    try {
      await KothPlayerData.upsert({
        player_id: steamID.trim(),
        lastsave: new Date(),
        serversave: Number.isFinite(serverId) ? serverId : 0,
        playerdata: json,
      });
    } catch (err) {
      logger.error(
        `[KothDb] DB upsert failed for ${steamID}: ${(err as Error).message}`,
      );
    }
  };

  const periodicSync = async (): Promise<void> => {
    try {
      const steamIDs = await readPlayerListFlexible();

      if (steamIDs.length >= MIN_PLAYERS_FOR_SETTINGS && syncEnabled) {
        await syncServerSettingsFromDB();
      }

      if (steamIDs.length === 0) {
        logger.log(`[KothDb] No connected players found in PlayerList.json`);
      }

      let synced = 0,
        missing = 0,
        invalid = 0;

      for (const steamID of steamIDs) {
        const pfile = playerFilePath(steamID);
        const buf = await readBufSafe(pfile);

        if (!buf) {
          missing++;
          continue;
        }

        const raw = decodeHeuristic(buf);

        try {
          const json = JSON.parse(raw) as JsonValue;

          if (json == null) {
            invalid++;
            logger.warn(`[KothDb] Null JSON in ${pfile}, skipping`);
            continue;
          }

          await upsertPlayer(steamID, json as NonNullJson);

          synced++;
        } catch {
          logger.warn(`[KothDb] Invalid JSON in ${pfile}, skipping`);
          invalid++;
        }
      }

      logger.log(
        `[KothDb] Periodic sync: total=${steamIDs.length}, synced=${synced}, missing=${missing}, invalid=${invalid}`,
      );
    } catch {
      logger.error(`[KothDb] Periodic sync error`);
    }
  };

  const onPlayerConnected = async (data: TPlayerConnected): Promise<void> => {
    const steamID = data.steamID;

    if (!steamID) return;

    const row = await KothPlayerData.findOne({
      where: { player_id: steamID },
      attributes: ['playerdata'],
    });

    if (!row || row.playerdata == null) return;

    const pdata = fromDbJson(row.playerdata) ?? ({} as JsonValue);

    await writeJsonPretty(playerFilePath(steamID), pdata);
  };

  const onPlayerDisconnected = async (
    data: TPlayerDisconnected,
  ): Promise<void> => {
    const player = getPlayerByEOSID(state, data.eosID);
    const steamID = player?.steamID;

    if (!steamID) return;

    const pfile = playerFilePath(steamID);
    const buf = await readBufSafe(pfile);

    if (!buf) return;

    const raw = decodeHeuristic(buf);

    try {
      const json = JSON.parse(raw) as JsonValue;

      if (json == null) {
        logger.warn(`[KothDb] Null JSON in ${pfile}, skipping`);
        return;
      }

      await upsertPlayer(steamID, json as NonNullJson);
    } catch {
      logger.warn(`[KothDb] Invalid JSON in ${pfile}, skipping`);
    }
  };

  listener.on(EVENTS.PLAYER_CONNECTED, onPlayerConnected);
  listener.on(EVENTS.PLAYER_DISCONNECTED, onPlayerDisconnected);

  (async () => {
    try {
      logger.log(`[KothDb] Resolved KOTH path: ${resolvedKothPath}`);

      await ensureKothDir();
      await sequelize.authenticate();
      await KothPlayerData.sync();

      logger.log(`[KothDb] DB connected & KOTH_PlayerData ready`);

      await syncServerSettingsFromDB();
      await periodicSync();

      if (syncEnabled) {
        setInterval(periodicSync, INTERVAL_MS);
        logger.log(`[KothDb] Started periodic sync every 90 seconds`);
      } else {
        logger.log(`[KothDb] Periodic sync disabled`);
      }
    } catch {
      logger.error(`[KothDb] Bootstrap failed`);
    }
  })();
};
