import {
  AnyBulkWriteOperation,
  Collection,
  Db,
  MongoClient,
  UpdateFilter,
} from 'mongodb';

export interface MatchHistoryEntry {
  matchID: string;
  layer: string | null;
  level: string | null;
  startTime: number;
  endTime: number;
  result: string;
  kills: number;
  death: number;
  revives: number;
  teamkills: number;
  kd: number;
  team1: { subfaction: string | null; tickets: number | null };
  team2: { subfaction: string | null; tickets: number | null };
}

export interface Main {
  _id: string;
  name: string;
  eosID: string;
  bonuses: number;
  kills: number;
  death: number;
  revives: number;
  teamkills: number;
  kd: number;
  exp: number;
  possess: Record<string, number>;
  roles: Record<string, number>;
  squad: {
    timeplayed: number;
    leader: number;
    cmd: number;
    seed: number;
  };
  matches: {
    matches: number;
    winrate: number;
    won: number;
    lose: number;
    cmdwon: number;
    cmdlose: number;
    cmdwinrate: number;
  };
  weapons: Record<string, number>;
  matchHistory?: MatchHistoryEntry[];
  date?: number;
  seedRole?: boolean;
}

export interface Info {
  _id: string;
  rnsHistoryLayers?: string[];
  rnsHistoryFactions?: string[];
  rnsHistoryUnitTypes?: string[];
  timeStampToRestart?: number;
  lastUpdate?: string;
  seeding?: boolean;
}

interface SocialEdge {
  _id?: unknown;
  a: string;
  b: string;
  coSquadSeconds?: number;
  coTeamSeconds?: number;
  lastSeenAt: Date;
  lastDecayAt?: Date;
}

interface ClanTagDoc {
  _id?: unknown;
  tag: string;
  totalUses: number;
  startUses: number;
  players: string[];
  cohesion?: number;
  whitelist?: boolean;
  blacklist?: boolean;
  lastSeenAt: Date;
}

interface ControlDoc {
  _id?: string;
  key: string;
  value: { date: string };
}

let db: Db;
const dbNameDefault = 'SquadJS';
const dbCollectionMain = 'mainstats';
const dbCollectionTemp = 'tempstats';
const dbCollectionServerInfo = 'serverinfo';

let collectionMain: Collection<Main>;
let collectionTemp: Collection<Main>;
let collectionServerInfo: Collection<Info>;

let collectionEdges: Collection<SocialEdge> | undefined;
let collectionClanTags: Collection<ClanTagDoc> | undefined;
let collectionControl: Collection<ControlDoc> | undefined;

let isConnected = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let dbLink = '';
let databaseName = '';

const cleaningTime = 604800000;

export async function connectToDatabase(
  dbURL: string,
  database?: string,
): Promise<void> {
  const client = new MongoClient(dbURL);
  dbLink = dbURL;
  if (database) databaseName = database;

  try {
    await client.connect();
    db = client.db(database || dbNameDefault);

    collectionMain = db.collection<Main>(dbCollectionMain);
    collectionTemp = db.collection<Main>(dbCollectionTemp);
    collectionServerInfo = db.collection<Info>(dbCollectionServerInfo);

    isConnected = true;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
    isConnected = false;
    setReconnectTimer(dbLink);
  }
}

async function setReconnectTimer(dbURL: string) {
  if (!reconnectTimer) {
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectToDatabase(dbURL, databaseName);
    }, 30000);
  }
}

async function incBoth(user: { _id: string }, incDoc: Record<string, number>) {
  if (!isConnected) return;
  await collectionMain.updateOne(user, { $inc: incDoc });
  await collectionTemp.updateOne(user, { $inc: incDoc });
}

function expDeltaForCounter(field: string): number {
  if (field === 'kills') return 2;
  if (field === 'revives') return 2;
  if (field === 'death') return -1;
  if (field === 'teamkills') return -2;
  return 0;
}

function expDeltaForSquadTime(field: string): number {
  if (field === 'timeplayed') return 1;
  if (field === 'leader') return 2;
  if (field === 'cmd') return 4;
  return 0;
}

function expDeltaForGame(field: string): number {
  if (field === 'won') return 10;
  if (field === 'lose') return -5;
  return 0;
}

export async function writeLastModUpdateDate(modID: string, date: Date) {
  if (!isConnected) return;
  try {
    await collectionServerInfo.updateOne(
      { _id: modID },
      { $set: { lastUpdate: date.toString() } },
      { upsert: true },
    );
  } catch {
    /* no-op */
  }
}

export async function getSteamIDByEOSID(eosID: string): Promise<string | null> {
  if (!isConnected) return null;
  const trimmed = (eosID ?? '').trim();
  if (!trimmed) return null;

  const doc = await collectionMain.findOne(
    { eosID: trimmed },
    { projection: { _id: 1 } },
  );
  return doc?._id ?? null;
}

export async function getModLastUpdateDate(modID: string) {
  if (!isConnected) return;
  try {
    const modInfo = await collectionServerInfo.findOne({ _id: modID });
    return modInfo?.lastUpdate;
  } catch {
    return undefined;
  }
}

export async function createUserIfNullableOrUpdateName(
  steamID: string,
  name: string,
  eosID?: string,
): Promise<void> {
  if (!isConnected) return;

  const trimmedName = (name ?? '').trim();
  const trimmedEosID = (eosID ?? '').trim();

  const baseFields: Omit<Main, '_id'> = {
    name: trimmedName,
    eosID: trimmedEosID,
    kills: 0,
    death: 0,
    revives: 0,
    teamkills: 0,
    kd: 0,
    bonuses: 0,
    exp: 0,
    possess: {},
    roles: {},
    squad: { timeplayed: 0, leader: 0, cmd: 0, seed: 0 },
    matches: {
      matches: 0,
      winrate: 0,
      won: 0,
      lose: 0,
      cmdwon: 0,
      cmdlose: 0,
      cmdwinrate: 0,
    },
    weapons: {},
    matchHistory: [],
    seedRole: false,
  };

  const [resultMain] = await Promise.all([
    collectionMain.findOne<{ _id: string; name?: string; eosID?: string }>({
      _id: steamID,
    }),
    collectionTemp.findOne<{ _id: string }>({ _id: steamID }),
  ]);

  await Promise.all([
    collectionMain.updateOne(
      { _id: steamID },
      { $setOnInsert: baseFields },
      { upsert: true },
    ),
    collectionTemp.updateOne(
      { _id: steamID },
      { $setOnInsert: baseFields },
      { upsert: true },
    ),
  ]);

  if (resultMain) {
    const updates: Record<string, unknown> = {};
    if (trimmedName && (resultMain.name ?? '').trim() !== trimmedName) {
      updates.name = trimmedName;
    }
    if (trimmedEosID && (resultMain.eosID ?? '').trim() !== trimmedEosID) {
      updates.eosID = trimmedEosID;
    }

    if (Object.keys(updates).length > 0) {
      await Promise.all([
        collectionMain.updateOne({ _id: steamID }, { $set: updates }),
        collectionTemp.updateOne({ _id: steamID }, { $set: updates }),
      ]);
    }
  }
}

export async function updateUserBonuses(
  steamID: string,
  count: number,
  id: number,
) {
  if (!isConnected) return;

  const [userInfo, serverInfo] = await Promise.all([
    collectionMain.findOne({ _id: steamID }),
    collectionServerInfo.findOne({ _id: id.toString() }),
  ]);

  if (userInfo && userInfo.seedRole && serverInfo?.seeding) {
    count = 5;
  }

  await collectionMain.updateOne(
    { _id: steamID },
    { $inc: { bonuses: count } },
  );
}

export async function updateRoles(steamID: string, role: string) {
  if (!isConnected) return;

  const roles = [
    '_sl_',
    '_slcrewman',
    '_slpilot',
    '_pilot',
    '_medic',
    '_crewman',
    '_unarmed',
    '_ar',
    '_rifleman',
    '_marksman',
    '_lat',
    '_grenadier',
    '_hat',
    '_machinegunner',
    '_sniper',
    '_infiltrator',
    '_raider',
    '_ambusher',
    '_engineer',
    '_sapper',
    '_saboteur',
  ];
  const engineer = ['_sapper', '_saboteur'];

  let normalized = role.toLowerCase();
  for (const r of roles) {
    if (normalized.includes(r)) {
      normalized = engineer.some((el) => normalized.includes(el))
        ? '_engineer'
        : r;
      break;
    }
  }

  const rolesFilter = `roles.${normalized}`;
  await collectionMain.updateOne(
    { _id: steamID },
    { $inc: { [rolesFilter]: 1 } },
  );
}

export async function updateTimes(
  steamID: string,
  field: string,
  name: string,
) {
  if (!isConnected) return;
  const user = { _id: steamID };

  const squadFilter = `squad.${field}`;
  const incDoc: Record<string, number> = { [squadFilter]: 1 };

  const dExp = expDeltaForSquadTime(field);
  if (dExp !== 0) incDoc.exp = dExp;

  await collectionMain.updateOne(user, { $inc: incDoc });
  await updateCollectionTemp(user, { $inc: incDoc }, name);
}

export async function updatePossess(steamID: string, field: string) {
  if (!isConnected) return;
  if (field.toLowerCase().includes('soldier')) return;

  const possessFilter = `possess.${field}`;
  await collectionMain.updateOne(
    { _id: steamID },
    { $inc: { [possessFilter]: 1 } },
  );
}

export async function getUserDataWithSteamID(steamID: string) {
  if (!isConnected) return;
  return await collectionMain.findOne({ _id: steamID });
}

export async function updateUser(
  steamID: string,
  field: string,
  weapon?: string,
) {
  if (!steamID || !field || !isConnected) return;

  const user = { _id: steamID };

  await incBoth(user, { [field]: 1 });

  if (field === 'kills' && weapon !== 'null') {
    const weaponFilter = `weapons.${weapon}`;
    await incBoth(user, { [weaponFilter]: 1 });
  }

  const dExp = expDeltaForCounter(field);
  if (dExp !== 0) {
    await incBoth(user, { exp: dExp });
  }

  const [resultMain, resultTemp] = await Promise.all([
    collectionMain.findOne(user),
    collectionTemp.findOne(user),
  ]);

  if (resultMain) {
    const kd =
      resultMain.death && Number.isFinite(resultMain.kills / resultMain.death)
        ? Number((resultMain.kills / resultMain.death).toFixed(2))
        : resultMain.kills;
    await collectionMain.updateOne(user, { $set: { kd } });
  }

  if (resultTemp) {
    const kd =
      resultTemp.death && Number.isFinite(resultTemp.kills / resultTemp.death)
        ? Number((resultTemp.kills / resultTemp.death).toFixed(2))
        : resultTemp.kills;
    await collectionTemp.updateOne(user, { $set: { kd } });
  }
}

export async function updateGames(steamID: string, field: string) {
  if (!isConnected) return;

  const user = { _id: steamID };
  const matchesFilter = `matches.${field}`;
  const incDoc: Record<string, number> = { [matchesFilter]: 1 };
  const dExp = expDeltaForGame(field);

  if (dExp !== 0) incDoc.exp = dExp;

  await collectionMain.updateOne(user, { $inc: incDoc });
  await collectionTemp.updateOne(user, { $inc: incDoc });

  if (
    field === 'won' ||
    field === 'lose' ||
    field === 'cmdwon' ||
    field === 'cmdlose'
  ) {
    await updateWinrate(user, field);
  }
}

function getWonLose(u: Main, isCmd: boolean): { won: number; lose: number } {
  return isCmd
    ? { won: u.matches.cmdwon, lose: u.matches.cmdlose }
    : { won: u.matches.won, lose: u.matches.lose };
}

async function updateWinrate(user: { _id: string }, field: string) {
  const isCmd = field.includes('cmd');

  const [resultMain, resultTemp] = await Promise.all([
    collectionMain.findOne(user),
    collectionTemp.findOne(user),
  ]);

  if (resultMain) {
    const { won, lose } = getWonLose(resultMain, isCmd);
    const matches = won + lose;
    const winrate =
      matches > 0 ? Number(((won / matches) * 100).toFixed(3)) : 0;

    if (isCmd) {
      await collectionMain.updateOne(user, {
        $set: {
          'matches.cmdmatches': matches,
          'matches.cmdwinrate': winrate,
        },
      });
    } else {
      await collectionMain.updateOne(user, {
        $set: {
          'matches.matches': matches,
          'matches.winrate': winrate,
        },
      });
    }
  }

  if (resultTemp) {
    const { won, lose } = getWonLose(resultTemp, isCmd);
    const matches = won + lose;
    const winrate =
      matches > 0 ? Number(((won / matches) * 100).toFixed(3)) : 0;

    if (isCmd) {
      await collectionTemp.updateOne(user, {
        $set: {
          'matches.cmdmatches': matches,
          'matches.cmdwinrate': winrate,
        },
      });
    } else {
      await collectionTemp.updateOne(user, {
        $set: {
          'matches.matches': matches,
          'matches.winrate': winrate,
        },
      });
    }
  }
}

export async function serverHistoryLayers(
  serverID: number,
  rnsHistoryLayers?: string,
) {
  if (!rnsHistoryLayers || !isConnected) return;
  const _id = serverID.toString();
  const server = await collectionServerInfo.findOne({ _id });
  if (!server) return;

  await collectionServerInfo.updateOne(
    { _id },
    { $push: { rnsHistoryLayers } },
  );
}

export async function getHistoryLayers(serverID: number) {
  if (!isConnected) return [];
  const result = await collectionServerInfo.findOne({
    _id: serverID.toString(),
  });
  return result?.rnsHistoryLayers || [];
}

export async function cleanHistoryLayers(serverID: number) {
  if (!isConnected) return;
  await collectionServerInfo.updateOne(
    { _id: serverID.toString() },
    { $pop: { rnsHistoryLayers: -1 } },
  );
}

export async function serverHistoryFactions(serverID: number, faction: string) {
  if (!faction || !isConnected) return;
  const _id = serverID.toString();
  const server = await collectionServerInfo.findOne({ _id });
  if (!server) return;

  await collectionServerInfo.updateOne(
    { _id },
    { $push: { rnsHistoryFactions: faction } },
  );
}

export async function getHistoryFactions(serverID: number): Promise<string[]> {
  if (!isConnected) return [];
  const result = await collectionServerInfo.findOne({
    _id: serverID.toString(),
  });
  return result?.rnsHistoryFactions || [];
}

export async function cleanHistoryFactions(serverID: number) {
  if (!isConnected) return;
  await collectionServerInfo.updateOne(
    { _id: serverID.toString() },
    { $pop: { rnsHistoryFactions: -1 } },
  );
}

export async function serverHistoryUnitTypes(
  serverID: number,
  unitType: string,
) {
  if (!unitType || !isConnected) return;
  const _id = serverID.toString();
  const server = await collectionServerInfo.findOne({ _id });
  if (!server) return;

  await collectionServerInfo.updateOne(
    { _id },
    { $push: { rnsHistoryUnitTypes: unitType } },
  );
}

export async function getHistoryUnitTypes(serverID: number): Promise<string[]> {
  if (!isConnected) return [];
  const result = await collectionServerInfo.findOne({
    _id: serverID.toString(),
  });
  return result?.rnsHistoryUnitTypes || [];
}

export async function cleanHistoryUnitTypes(serverID: number): Promise<void> {
  if (!isConnected) return;
  await collectionServerInfo.updateOne(
    { _id: serverID.toString() },
    { $pop: { rnsHistoryUnitTypes: -1 } },
  );
}

export async function getTimeStampForRestartServer(serverID: number) {
  if (!isConnected) return;
  const server = await collectionServerInfo.findOne({
    _id: serverID.toString(),
  });
  return server?.timeStampToRestart;
}

export async function createTimeStampForRestartServer(serverID: number) {
  if (!isConnected) return;
  const date = Date.now();

  await collectionServerInfo.updateOne(
    { _id: serverID.toString() },
    { $set: { timeStampToRestart: date } },
    { upsert: true },
  );
}

export async function updateCollectionTemp(
  user: { _id: string },
  doc: { $inc: Record<string, number> } | { $set: Record<string, number> },
  name: string,
) {
  const tempStats = await collectionTemp.updateOne(user, doc);
  if (tempStats.modifiedCount !== 1) {
    await createUserIfNullableOrUpdateName(user._id, '', name);
    await collectionTemp.updateOne(user, doc);
  }
}

export async function creatingTimeStamp() {
  const date = Date.now();
  const userTemp = { _id: 'dateTemp' };
  const dateTemp = { $set: { date } };

  const timeTemp = await collectionMain.findOne({ _id: 'dateTemp' });
  if (!timeTemp || !timeTemp.date) return;
  const checkOutOfDate = date - timeTemp.date;
  if (checkOutOfDate > cleaningTime) {
    console.log('Статистика очищена');
    await collectionTemp.deleteMany({});
    await collectionMain.updateOne(userTemp, dateTemp);
  }
}

export async function pushMatchHistory(
  steamID: string,
  entry: MatchHistoryEntry,
): Promise<void> {
  if (!isConnected) return;

  try {
    await collectionMain.updateOne(
      { _id: steamID },
      {
        $push: {
          matchHistory: {
            $each: [entry],
            $slice: -5,
          },
        } as any,
      },
    );
  } catch (error) {
    console.error('Error pushing match history:', error);
  }
}

export async function sbEnsureSmartBalance(
  retentionDays: number,
): Promise<void> {
  if (!isConnected || !db) return;

  collectionEdges = db.collection<SocialEdge>('social_edges');
  collectionClanTags = db.collection<ClanTagDoc>('clan_tags');
  collectionControl = db.collection<ControlDoc>('smart_balance_control');

  await collectionEdges
    .createIndex({ a: 1, b: 1 }, { unique: true, name: 'ab_unique' })
    .catch(() => {});
  await collectionClanTags
    .createIndex({ tag: 1 }, { unique: true, name: 'tag_unique' })
    .catch(() => {});

  const ttl = Math.max(1, retentionDays) * 86400;
  await collectionEdges.dropIndex('ttl_lastSeenAt').catch(() => {});
  await collectionEdges
    .createIndex(
      { lastSeenAt: 1 },
      { name: 'ttl_lastSeenAt', expireAfterSeconds: ttl },
    )
    .catch(() => {});
}

export async function sbUpsertSocialEdges(
  batch: Readonly<Record<string, { sq?: number; tm?: number; at: Date }>>,
): Promise<void> {
  if (!isConnected || !collectionEdges) return;
  const ops: AnyBulkWriteOperation<SocialEdge>[] = [];

  for (const k of Object.keys(batch)) {
    const [a, b] = k.split('|');
    const incSq = batch[k].sq ?? 0;
    const incTm = batch[k].tm ?? 0;
    const incDoc: Partial<
      Pick<SocialEdge, 'coSquadSeconds' | 'coTeamSeconds'>
    > = {};
    if (incSq) incDoc.coSquadSeconds = incSq;
    if (incTm) incDoc.coTeamSeconds = incTm;

    ops.push({
      updateOne: {
        filter: { a, b },
        update: {
          $setOnInsert: { a, b },
          $set: { lastSeenAt: batch[k].at },
          ...(Object.keys(incDoc).length
            ? { $inc: incDoc as Record<string, number> }
            : {}),
        },
        upsert: true,
      },
    });
  }

  if (ops.length) {
    await collectionEdges.bulkWrite(ops, { ordered: false }).catch(() => {});
  }
}

export async function sbGetActivePartiesOnline(
  onlineIDs: readonly string[],
  windowDays: number,
  minSec: number,
  maxParty: number,
): Promise<string[][]> {
  if (!isConnected || !collectionEdges || onlineIDs.length === 0) return [];
  const onlineSet = new Set(onlineIDs);
  const cutoff = new Date(Date.now() - windowDays * 86400_000);

  const cursor = collectionEdges.find(
    { lastSeenAt: { $gte: cutoff }, coSquadSeconds: { $gte: minSec } },
    { projection: { a: 1, b: 1, _id: 0 } },
  );

  const adj = new Map<string, Set<string>>();
  const ensure = (x: string) => {
    if (!adj.has(x)) adj.set(x, new Set());
  };

  while (await cursor.hasNext()) {
    const e = await cursor.next();
    if (!e) break;
    if (!onlineSet.has(e.a) || !onlineSet.has(e.b)) continue;
    ensure(e.a);
    ensure(e.b);
    adj.get(e.a)!.add(e.b);
    adj.get(e.b)!.add(e.a);
  }

  const seen = new Set<string>();
  const parties: string[][] = [];
  for (const node of adj.keys()) {
    if (seen.has(node)) continue;
    const q: string[] = [node];
    const comp: string[] = [];
    seen.add(node);
    while (q.length) {
      const v = q.shift()!;
      comp.push(v);
      for (const w of adj.get(v) ?? []) {
        if (!seen.has(w)) {
          seen.add(w);
          q.push(w);
        }
      }
    }
    for (let i = 0; i < comp.length; i += maxParty) {
      const chunk = comp.slice(i, i + maxParty);
      if (chunk.length >= 2) parties.push(chunk);
    }
  }
  return parties;
}

export async function sbDailyDecayEdges(factor: number): Promise<void> {
  if (!isConnected || !collectionEdges || !collectionControl) return;

  const today = new Date();
  const todayISO = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).toISOString();

  const doc = await collectionControl.findOne({ key: 'decay-last' });
  if (doc?.value?.date === todayISO) return;

  const cursor = collectionEdges.find(
    {},
    { projection: { _id: 1, coSquadSeconds: 1, coTeamSeconds: 1 } },
  );
  const ops: AnyBulkWriteOperation<SocialEdge>[] = [];

  while (await cursor.hasNext()) {
    const e = await cursor.next();
    if (!e) break;
    const sq = Math.floor((e.coSquadSeconds ?? 0) * factor);
    const tm = Math.floor((e.coTeamSeconds ?? 0) * factor);
    ops.push({
      updateOne: {
        filter: { _id: e._id },
        update: {
          $set: {
            coSquadSeconds: sq,
            coTeamSeconds: tm,
            lastDecayAt: new Date(),
          },
        },
      },
    });
    if (ops.length >= 1000) {
      await collectionEdges.bulkWrite(ops, { ordered: false });
      ops.length = 0;
    }
  }
  if (ops.length) await collectionEdges.bulkWrite(ops, { ordered: false });

  await collectionControl.updateOne(
    { key: 'decay-last' },
    { $set: { key: 'decay-last', value: { date: todayISO } } },
    { upsert: true },
  );
}

export async function sbUpdateClanTagCounters(
  stats: Array<{
    tag: string;
    totalInc: number;
    startInc: number;
    steamIDs: string[];
  }>,
): Promise<number> {
  if (!isConnected || !collectionClanTags || stats.length === 0) return 0;

  const now = new Date();

  const ops: AnyBulkWriteOperation<ClanTagDoc>[] = stats.map((s) => {
    const update: UpdateFilter<ClanTagDoc> = {
      $setOnInsert: {
        tag: s.tag,
        totalUses: 0,
        startUses: 0,
        players: [] as string[],
        lastSeenAt: now,
      },
      $inc: {
        totalUses: s.totalInc,
        startUses: s.startInc,
      },
      $addToSet: {
        players: { $each: s.steamIDs },
      },
      $set: { lastSeenAt: now },
    };

    return {
      updateOne: {
        filter: { tag: s.tag },
        update,
        upsert: true,
      },
    };
  });

  const res = await collectionClanTags.bulkWrite(ops, { ordered: false });
  return (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0);
}

export async function sbGetClanTagDocs(tags: string[]): Promise<ClanTagDoc[]> {
  if (!isConnected || !collectionClanTags || !tags.length) return [];
  const arr = await collectionClanTags.find({ tag: { $in: tags } }).toArray();
  return arr;
}

export async function sbUpdateClanCohesion(
  tag: string,
  cohesion: number,
): Promise<void> {
  if (!isConnected || !collectionClanTags) return;
  await collectionClanTags.updateOne(
    { tag },
    {
      $setOnInsert: {
        tag,
        totalUses: 0,
        startUses: 0,
        players: [] as string[],
        lastSeenAt: new Date(),
        cohesion: 0,
      },
      $max: { cohesion },
      $set: { lastSeenAt: new Date() },
    },
    { upsert: true },
  );
}
