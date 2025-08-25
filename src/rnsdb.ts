import { AnyBulkWriteOperation, Collection, Db, MongoClient } from 'mongodb';

interface Main {
  _id: string;
  name: string;
  bonuses: number;
  kills: number;
  death: number;
  revives: number;
  teamkills: number;
  kd: number;
  exp: number;
  possess: object;
  roles: object;
  squad: object;
  matches: {
    matches: number;
    winrate: number;
    won: number;
    lose: number;
    cmdwon: number;
    cmdlose: number;
    cmdwinrate: number;
  };
  weapons: object;
  date?: number;
  seedRole?: boolean;
}

interface Info {
  _id: string;
  rnsHistoryLayers?: string[];
  rnsHistoryFactions?: string[];
  rnsHistoryUnitTypes?: string[];
  timeStampToRestart?: number;
  lastUpdate?: string;
  seeding?: boolean;
}

let db: Db;
const dbName = 'SquadJS';
const dbCollectionMain = 'mainstats';
const dbCollectionTemp = 'tempstats';
const dbCollectionServerInfo = 'serverinfo';
let collectionMain: Collection<Main>;
let collectionTemp: Collection<Main>;
let collectionServerInfo: Collection<Info>;
let isConnected = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let dbLink: string;
let databaseName: string;
const cleaningTime = 604800000;

export async function connectToDatabase(
  dbURL: string,
  database: string,
): Promise<void> {
  const client = new MongoClient(dbURL);
  dbLink = dbURL;
  if (database) databaseName = database;
  try {
    await client.connect();
    db = client.db(database || dbName);
    collectionMain = db.collection(dbCollectionMain);
    collectionTemp = db.collection(dbCollectionTemp);
    collectionServerInfo = db.collection(dbCollectionServerInfo);
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

export async function writeLastModUpdateDate(modID: string, date: Date) {
  try {
    const id = {
      _id: modID,
    };

    const data = {
      $set: {
        lastUpdate: date.toString(),
      },
    };

    await collectionServerInfo.updateOne(id, data);
  } catch (error) {}
}

export async function getModLastUpdateDate(modID: string) {
  try {
    const modInfo = await collectionServerInfo.findOne({
      _id: modID,
    });
    return modInfo?.lastUpdate;
  } catch (error) {}
}

async function setReconnectTimer(dbLink: string) {
  if (!reconnectTimer) {
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectToDatabase(dbLink, databaseName);
    }, 30000);
  }
}

export async function createUserIfNullableOrUpdateName(
  steamID: string,
  name: string,
): Promise<void> {
  if (!db || !isConnected) return;

  try {
    const resultMain = await collectionMain.findOne({ _id: steamID });
    const resultTemp = await collectionTemp.findOne({ _id: steamID });

    const fields = {
      name: name.trim(),
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
      seedRole: false,
    };

    if (!resultMain) {
      await collectionMain.updateOne(
        { _id: steamID },
        { $setOnInsert: fields },
        { upsert: true },
      );
    }

    if (!resultTemp) {
      await collectionTemp.updateOne(
        { _id: steamID },
        { $setOnInsert: fields },
        { upsert: true },
      );
    }

    if (resultMain && name.trim() !== resultMain.name.trim()) {
      await updateUserName(steamID, name.trim());
    }
  } catch (err) {
    throw err;
  }
}

async function updateUserName(steamID: string, name: string) {
  if (!isConnected) return;
  try {
    const doc = {
      $set: {
        name,
      },
    };

    const user = {
      _id: steamID,
    };

    await collectionMain.updateOne(user, doc);
    await collectionTemp.updateOne(user, doc);
  } catch (err) {
    throw err;
  }
}

export async function updateUserBonuses(
  steamID: string,
  count: number,
  id: number,
) {
  if (!isConnected) return;
  const userInfo = await collectionMain.findOne({
    _id: steamID,
  });
  const serverInfo = await collectionServerInfo.findOne({ _id: id.toString() });

  if (userInfo && userInfo.seedRole && serverInfo && serverInfo.seeding)
    count = 5;

  try {
    const doc = {
      $inc: {
        bonuses: count,
      },
    };

    const user = {
      _id: steamID,
    };

    await collectionMain.updateOne(user, doc);
  } catch (err) {
    throw err;
  }
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
  roles.forEach((e) => {
    if (role.toLowerCase().includes(e)) {
      if (engineer.some((el) => role.toLowerCase().includes(el))) {
        role = '_engineer';
        return;
      }
      role = e;
    }
  });

  const rolesFilter = `roles.${role}`;
  const doc = {
    $inc: {
      [rolesFilter]: 1,
    },
  };

  const user = {
    _id: steamID,
  };

  await collectionMain.updateOne(user, doc);
}

export async function updateTimes(
  steamID: string,
  field: string,
  name: string,
) {
  if (!isConnected) return;
  const squadFilter = `squad.${field}`;
  const doc = {
    $inc: {
      [squadFilter]: 1,
    },
  };

  const user = {
    _id: steamID,
  };

  await collectionMain.updateOne(user, doc);
  await updateCollectionTemp(user, doc, name);
}

export async function updatePossess(steamID: string, field: string) {
  if (!isConnected) return;
  if (field.toLowerCase().includes('soldier')) return;
  const possessFilter = `possess.${field}`;
  const doc = {
    $inc: {
      [possessFilter]: 1,
    },
  };

  const user = {
    _id: steamID,
  };

  await collectionMain.updateOne(user, doc);
}

export async function getUserDataWithSteamID(steamID: string) {
  if (!isConnected) return;
  const result = await collectionMain.findOne({
    _id: steamID,
  });

  if (!result) return;

  return result;
}

export async function updateUser(
  steamID: string,
  field: string,
  weapon?: string,
) {
  if (!steamID || !field || !isConnected) return;
  const doc = {
    $inc: {
      [field]: 1,
    },
  };

  const user = {
    _id: steamID,
  };

  await collectionMain.updateOne(user, doc);
  await collectionTemp.updateOne(user, doc);

  if (field === 'kills' && weapon !== 'null') {
    const weaponFilter = `weapons.${weapon}`;
    const doc = {
      $inc: {
        [weaponFilter]: 1,
      },
    };

    const user = {
      _id: steamID,
    };
    await collectionMain.updateOne(user, doc);
    await collectionTemp.updateOne(user, doc);
  }

  if (field === 'kills' || field === 'death') {
    const resultMain = await collectionMain.findOne({
      _id: steamID,
    });

    const resultTemp = await collectionTemp.findOne({
      _id: steamID,
    });

    if (resultMain) {
      let kd;
      if (resultMain.death && isFinite(resultMain.kills / resultMain.death)) {
        kd = Number((resultMain.kills / resultMain.death).toFixed(2));
      } else {
        kd = resultMain.kills;
      }

      const doc = {
        $set: {
          kd: kd,
        },
      };
      await collectionMain.updateOne(user, doc);
    }

    if (resultTemp) {
      let kd;
      if (resultTemp.death && isFinite(resultTemp.kills / resultTemp.death)) {
        kd = Number((resultTemp.kills / resultTemp.death).toFixed(2));
      } else {
        kd = resultTemp.kills;
      }

      const doc = {
        $set: {
          kd: kd,
        },
      };
      await collectionTemp.updateOne(user, doc);
    }
  }
}

export async function updateGames(steamID: string, field: string) {
  if (!isConnected) return;

  const matchesFilter = `matches.${field}`;
  const doc = {
    $inc: {
      [matchesFilter]: 1,
    },
  };

  const user = {
    _id: steamID,
  };

  try {
    await collectionMain.updateOne(user, doc);
    await collectionTemp.updateOne(user, doc);

    if (['won', 'lose', 'cmdwon', 'cmdlose'].includes(field)) {
      await updateWinrate(user, field);
    }
  } catch (error) {
    console.error(
      `Ошибка при обновлении игр для пользователя ${steamID}:`,
      error,
    );
  }
}

async function updateWinrate(user: { _id: string }, field: string) {
  try {
    const isCmd = field.includes('cmd');
    const fieldPrefix = isCmd ? 'cmd' : '';

    const resultMain = await collectionMain.findOne(user);
    const resultTemp = await collectionTemp.findOne(user);

    const matchesMain =
      (resultMain?.matches[`${fieldPrefix}won`] || 0) +
      (resultMain?.matches[`${fieldPrefix}lose`] || 0);

    const matchesTemp =
      (resultTemp?.matches[`${fieldPrefix}won`] || 0) +
      (resultTemp?.matches[`${fieldPrefix}lose`] || 0);

    if (resultMain) {
      const winrateMain =
        matchesMain > 0
          ? Number(
              (
                (resultMain.matches[`${fieldPrefix}won`] / matchesMain) *
                100
              ).toFixed(3),
            )
          : 0;
      const docMain = {
        $set: {
          [`matches.${fieldPrefix}matches`]: matchesMain,
          [`matches.${fieldPrefix}winrate`]: winrateMain,
        },
      };
      await collectionMain.updateOne(user, docMain);
    }

    if (resultTemp) {
      const winrateTemp =
        matchesTemp > 0
          ? Number(
              (
                (resultTemp.matches[`${fieldPrefix}won`] / matchesTemp) *
                100
              ).toFixed(3),
            )
          : 0;
      const docTemp = {
        $set: {
          [`matches.${fieldPrefix}matches`]: matchesTemp,
          [`matches.${fieldPrefix}winrate`]: winrateTemp,
        },
      };
      await collectionTemp.updateOne(user, docTemp);
    }
  } catch (error) {
    console.error(
      `Ошибка при обновлении коэффициента побед для пользователя ${user._id}:`,
      error,
    );
  }
}

export async function serverHistoryLayers(
  serverID: number,
  rnsHistoryLayers?: string,
) {
  if (!rnsHistoryLayers || !isConnected) return;
  const server = await collectionServerInfo.findOne({
    _id: serverID.toString(),
  });
  if (!server) return;

  const data = {
    $push: {
      rnsHistoryLayers,
    },
  };
  await collectionServerInfo.updateOne(server, data);
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
  const server = await collectionServerInfo.findOne({
    _id: serverID.toString(),
  });
  if (!server) return;

  const data = {
    $push: {
      rnsHistoryFactions: faction,
    },
  };
  await collectionServerInfo.updateOne({ _id: serverID.toString() }, data);
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
  const server = await collectionServerInfo.findOne({
    _id: serverID.toString(),
  });
  if (!server) return;

  const data = {
    $push: {
      rnsHistoryUnitTypes: unitType,
    },
  };
  await collectionServerInfo.updateOne({ _id: serverID.toString() }, data);
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
  const date: number = new Date().getTime();

  const id = {
    _id: serverID.toString(),
  };

  const data = {
    $set: {
      timeStampToRestart: date,
    },
  };

  await collectionServerInfo.updateOne(id, data);
}

export async function updateCollectionTemp(
  user: { _id: string },
  doc: object,
  name: string,
) {
  const tempStats = await collectionTemp.updateOne(user, doc);
  if (tempStats.modifiedCount !== 1) {
    await createUserIfNullableOrUpdateName(user._id, name);
    await collectionTemp.updateOne(user, doc);
  }
}

export async function creatingTimeStamp() {
  const date = new Date().getTime();
  const userTemp = {
    _id: 'dateTemp',
  };
  const dateTemp = {
    $set: {
      date,
    },
  };

  const timeTemp = await collectionMain.findOne({
    _id: 'dateTemp',
  });
  if (!timeTemp || !timeTemp.date) return;
  const checkOutOfDate = date - timeTemp.date;
  if (checkOutOfDate > cleaningTime) {
    console.log('Статистика очищена');
    await collectionTemp.deleteMany({});
    await collectionMain.updateOne(userTemp, dateTemp);
  }
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
  players: string[]; // для подсчёта unique
  cohesion?: number; // 0..1
  whitelist?: boolean;
  blacklist?: boolean;
  lastSeenAt: Date;
}

let collectionEdges: Collection<SocialEdge> | undefined;
let collectionClanTags: Collection<ClanTagDoc> | undefined;
let collectionControl: Collection<{ key: string; value: any }> | undefined;

export async function sbEnsureSmartBalance(
  retentionDays: number,
): Promise<void> {
  if (!isConnected || !db) return;

  collectionEdges = db.collection<SocialEdge>('social_edges');
  collectionClanTags = db.collection<ClanTagDoc>('clan_tags');
  collectionControl = db.collection('smart_balance_control');

  await collectionEdges
    .createIndex({ a: 1, b: 1 }, { unique: true, name: 'ab_unique' })
    .catch(() => {});

  await collectionClanTags
    .createIndex({ tag: 1 }, { unique: true, name: 'tag_unique' })
    .catch(() => {});

  const ttl = Math.max(1, retentionDays) * 86400;

  const indexes = await collectionEdges.indexes().catch(() => []);
  const sameKey = (indexes as any[]).find(
    (i) => i.key && i.key.lastSeenAt === 1,
  );

  if (sameKey && sameKey.expireAfterSeconds !== ttl) {
    await collectionEdges.dropIndex(sameKey.name).catch(() => {});
  }

  const needCreate = !sameKey || sameKey.expireAfterSeconds !== ttl;

  if (needCreate) {
    await collectionEdges.createIndex(
      { lastSeenAt: 1 },
      { name: 'ttl_lastSeenAt', expireAfterSeconds: ttl },
    );
  }
}

/** пакетно инкрементируем пары "в одном скваде" */
export async function sbUpsertSocialEdges(
  batch: Readonly<Record<string, { sq?: number; tm?: number; at: Date }>>,
): Promise<void> {
  if (!isConnected || !collectionEdges) return;
  const ops: AnyBulkWriteOperation<SocialEdge>[] = [];
  for (const k of Object.keys(batch)) {
    const [a, b] = k.split('|');
    const incSq = batch[k].sq ?? 0;
    const incTm = batch[k].tm ?? 0;
    const $inc: Partial<Record<'coSquadSeconds' | 'coTeamSeconds', number>> =
      {};
    if (incSq) $inc.coSquadSeconds = incSq;
    if (incTm) $inc.coTeamSeconds = incTm;
    ops.push({
      updateOne: {
        filter: { a, b },
        update: {
          $setOnInsert: { a, b },
          $set: { lastSeenAt: batch[k].at },
          ...(Object.keys($inc).length > 0 ? { $inc } : {}),
        },
        upsert: true,
      },
    });
  }
  if (ops.length)
    await collectionEdges.bulkWrite(ops, { ordered: false }).catch(() => {});
}

/** получить «пати» среди onlineIDs за окно времени */
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
    { projection: { a: 1, b: 1 } },
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
    const q = [node];
    const comp: string[] = [];
    seen.add(node);
    while (q.length) {
      const v = q.shift()!;
      comp.push(v);
      for (const w of adj.get(v) || [])
        if (!seen.has(w)) {
          seen.add(w);
          q.push(w);
        }
    }
    for (let i = 0; i < comp.length; i += maxParty) {
      const chunk = comp.slice(i, i + maxParty);
      if (chunk.length >= 2) parties.push(chunk);
    }
  }
  return parties;
}

/** ежедневный decay для ко-времени */
export async function sbDailyDecayEdges(factor: number): Promise<void> {
  if (!isConnected || !collectionEdges || !collectionControl) return;
  const todayISO = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate(),
  ).toISOString();
  const doc = await collectionControl
    .findOne({ key: 'decay-last' as const })
    .catch(() => null);
  if ((doc as any)?.value?.date === todayISO) return;

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
    { key: 'decay-last' as const },
    { $set: { key: 'decay-last', value: { date: todayISO } } },
    { upsert: true },
  );
}

/** обновить счётчики по префиксам */
export async function sbUpdateClanTagCounters(
  stats: Array<{
    tag: string;
    totalInc: number;
    startInc: number;
    steamIDs: string[];
  }>,
): Promise<number> {
  if (!isConnected || !collectionClanTags || !stats.length) return 0;

  const now = new Date();
  const ops: AnyBulkWriteOperation<ClanTagDoc>[] = stats.map((s) => ({
    updateOne: {
      filter: { tag: s.tag },
      update: {
        $setOnInsert: {
          tag: s.tag,
          totalUses: 0,
          startUses: 0,
          players: [],
          lastSeenAt: now,
        },
        $inc: { totalUses: s.totalInc, startUses: s.startInc },
        $addToSet: { players: { $each: s.steamIDs } },
        $set: { lastSeenAt: now },
      },
      upsert: true,
    },
  }));

  if (!ops.length) return 0;
  const res = await collectionClanTags.bulkWrite(ops, { ordered: false });
  return (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0);
}

/** получить документы по тегам */
export async function sbGetClanTagDocs(tags: string[]): Promise<ClanTagDoc[]> {
  if (!isConnected || !collectionClanTags || !tags.length) return [];
  return (await collectionClanTags
    .find({ tag: { $in: tags } })
    .toArray()
    .catch(() => [])) as ClanTagDoc[];
}

/** обновить когезию для тега (берём максимум) */
export async function sbUpdateClanCohesion(
  tag: string,
  cohesion: number,
): Promise<void> {
  if (!isConnected || !collectionClanTags) return;
  await collectionClanTags
    .updateOne(
      { tag },
      {
        $setOnInsert: {
          tag,
          totalUses: 0,
          startUses: 0,
          players: [],
          lastSeenAt: new Date(),
          cohesion: 0,
        },
        $max: { cohesion },
        $set: { lastSeenAt: new Date() },
      },
      { upsert: true },
    )
    .catch(() => {});
}
