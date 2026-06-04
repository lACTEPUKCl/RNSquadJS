import {
  AnyBulkWriteOperation,
  Collection,
  Db,
  MongoClient,
  UpdateFilter,
} from 'mongodb';
import {
  aggregateOpponent,
  applySupportFloor,
  commanderScore,
  CommanderWeights,
  DEFAULT_GLICKO,
  DEFAULT_IMPACT_WEIGHTS,
  displayRating,
  Glicko,
  ImpactWeights,
  impactZScores,
  inflateRd,
  killValue,
  performanceToScore,
  squadLeaderScores,
  SupportFloorOpts,
  supportImpact,
  supportShare,
  SupportWeights,
  updateGlicko,
} from './core/elo';
import { createLogger } from './logger';

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

export type IncidentType =
  | 'rapid_kills'
  | 'mass_tk'
  | 'fob_grief'
  | 'headshot'
  | 'knife_spree';
export type IncidentSeverity = 'high' | 'medium' | 'low';
export type IncidentStatus =
  | 'new'
  | 'reviewing'
  | 'banned'
  | 'false'
  | 'reviewed';

export interface IncidentKill {
  ts: number;
  victim: string;
  victimSteamID?: string;
  weapon: string;
  weaponClass: string;
  damage?: number;
  hs?: boolean;
  teamkill?: boolean;
  note?: string;
}

export interface IncidentCounts {
  kills: number;
  teamkills: number;
  fobDestroyed: number;
  headshots: number;
  knifeKills: number;
}

export interface IncidentDoc {
  _id: string;
  serverId: number;
  server: string;
  steamID: string;
  name: string;
  eosID?: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  openedAt: number;
  lastEventAt: number;
  closedAt?: number | null;
  layer?: string | null;
  level?: string | null;
  flags: string[];
  killlog: IncidentKill[];
  counts: IncidentCounts;
  claimedBy?: { adminId: string; name: string; at: number } | null;
  viewedBy?: { adminId: string; name: string; at: number }[];
  comments?: { adminId: string; name: string; at: number; text: string }[];
  resolution?: {
    by: string;
    at: number;
    decision: string;
    note?: string;
  } | null;
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
  rating?: PlayerRating;
  cmdRating?: PlayerRating;
  slRating?: PlayerRating;
  date?: number;
  seedRole?: boolean;
  lastActiveAt?: number;
}

export interface PlayerRating {
  mu: number;
  rd: number;
  sigma: number;
  games: number;
  peak: number;
  lastAt: number;
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
  matchesTogether?: number;
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

const dbNameDefault = 'SquadJS';
const dbCollectionMain = 'mainstats';
const dbCollectionTemp = 'tempstats';
const dbCollectionServerInfo = 'serverinfo';

interface DbHandle {
  client: MongoClient;
  db: Db;
  url: string;
  databaseName: string;
  main: Collection<Main>;
  temp: Collection<Main>;
  serverInfo: Collection<Info>;
  edges?: Collection<SocialEdge>;
  clanTags?: Collection<ClanTagDoc>;
  control?: Collection<ControlDoc>;
  incidents?: Collection<IncidentDoc>;
}

const handlesByKey = new Map<string, DbHandle>();
const keyByServer = new Map<number, string>();
const reconnectByServer = new Map<number, NodeJS.Timeout>();

const dbLog = createLogger('DB');

const WEEKLY_RESET_DAY = 1;
const WEEKLY_RESET_HOUR = 6;

const connKey = (url: string, database?: string) => `${url}::${database ?? ''}`;

function handle(serverId: number): DbHandle | undefined {
  const key = keyByServer.get(serverId);
  return key ? handlesByKey.get(key) : undefined;
}

async function ensureIndexes(h: DbHandle): Promise<void> {
  try {
    await h.main.createIndex({ eosID: 1 }, { name: 'eosID_1' });
  } catch (err) {
    dbLog.warn(`Не удалось создать индекс eosID: ${String(err)}`);
  }
  try {
    await h.incidents?.createIndex(
      { status: 1, lastEventAt: -1 },
      { name: 'status_lastEventAt' },
    );
    await h.incidents?.createIndex(
      { steamID: 1, openedAt: -1 },
      { name: 'steamID_openedAt' },
    );
  } catch (err) {
    dbLog.warn(`Не удалось создать индексы incidents: ${String(err)}`);
  }
}

export async function connectToDatabase(
  dbURL: string,
  database: string | undefined,
  serverId: number,
): Promise<void> {
  if (!dbURL) return;

  const key = connKey(dbURL, database);

  const existing = handlesByKey.get(key);
  if (existing) {
    keyByServer.set(serverId, key);
    return;
  }

  const client = new MongoClient(dbURL);
  try {
    await client.connect();
    const db = client.db(database || dbNameDefault);
    const h: DbHandle = {
      client,
      db,
      url: dbURL,
      databaseName: database ?? '',
      main: db.collection<Main>(dbCollectionMain),
      temp: db.collection<Main>(dbCollectionTemp),
      serverInfo: db.collection<Info>(dbCollectionServerInfo),
      incidents: db.collection<IncidentDoc>('incidents'),
    };
    handlesByKey.set(key, h);
    keyByServer.set(serverId, key);
    await ensureIndexes(h);

    const t = reconnectByServer.get(serverId);
    if (t) {
      clearTimeout(t);
      reconnectByServer.delete(serverId);
    }
    dbLog.log(
      `Сервер ${serverId}: подключено к MongoDB (${database || dbNameDefault}).`,
    );
  } catch (err) {
    dbLog.error(
      `Сервер ${serverId}: ошибка подключения к MongoDB: ${String(err)}`,
    );
    setReconnectTimer(dbURL, database, serverId);
  }
}

export async function closeDatabase(): Promise<void> {
  for (const t of reconnectByServer.values()) clearTimeout(t);
  reconnectByServer.clear();
  for (const h of handlesByKey.values()) {
    await h.client.close().catch(() => {});
  }
  handlesByKey.clear();
  keyByServer.clear();
  dbLog.log('Все соединения с MongoDB закрыты.');
}

function setReconnectTimer(
  dbURL: string,
  database: string | undefined,
  serverId: number,
) {
  if (reconnectByServer.has(serverId)) return;
  dbLog.warn(`Сервер ${serverId}: повторное подключение к MongoDB через 30с…`);
  const t = setTimeout(() => {
    reconnectByServer.delete(serverId);
    connectToDatabase(dbURL, database, serverId);
  }, 30000);
  reconnectByServer.set(serverId, t);
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

export async function writeLastModUpdateDate(
  serverId: number,
  modID: string,
  date: Date,
) {
  const h = handle(serverId);
  if (!h) return;
  try {
    await h.serverInfo.updateOne(
      { _id: modID },
      { $set: { lastUpdate: date.toString() } },
      { upsert: true },
    );
  } catch {}
}

export async function getSteamIDByEOSID(
  serverId: number,
  eosID: string,
): Promise<string | null> {
  const h = handle(serverId);
  if (!h) return null;
  const trimmed = (eosID ?? '').trim();
  if (!trimmed) return null;

  const doc = await h.main.findOne(
    { eosID: trimmed },
    { projection: { _id: 1 } },
  );
  return doc?._id ?? null;
}

export async function getModLastUpdateDate(serverId: number, modID: string) {
  const h = handle(serverId);
  if (!h) return;
  try {
    const modInfo = await h.serverInfo.findOne({ _id: modID });
    return modInfo?.lastUpdate;
  } catch {
    return undefined;
  }
}

export async function createUserIfNullableOrUpdateName(
  serverId: number,
  steamID: string,
  name: string,
  eosID?: string,
): Promise<void> {
  const h = handle(serverId);
  if (!h) return;
  await createUserOnHandle(h, steamID, name, eosID);
}

async function createUserOnHandle(
  h: DbHandle,
  steamID: string,
  name: string,
  eosID?: string,
): Promise<void> {
  const collectionMain = h.main;
  const collectionTemp = h.temp;

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
    rating: {
      mu: DEFAULT_GLICKO.mu,
      rd: DEFAULT_GLICKO.rd,
      sigma: DEFAULT_GLICKO.sigma,
      games: 0,
      peak: 0,
      lastAt: 0,
    },
    cmdRating: {
      mu: DEFAULT_GLICKO.mu,
      rd: DEFAULT_GLICKO.rd,
      sigma: DEFAULT_GLICKO.sigma,
      games: 0,
      peak: 0,
      lastAt: 0,
    },
    slRating: {
      mu: DEFAULT_GLICKO.mu,
      rd: DEFAULT_GLICKO.rd,
      sigma: DEFAULT_GLICKO.sigma,
      games: 0,
      peak: 0,
      lastAt: 0,
    },
    seedRole: false,
    lastActiveAt: undefined,
  };

  const [resultMain] = await Promise.all([
    collectionMain.findOne<{
      _id: string;
      name?: string;
      eosID?: string;
      rating?: unknown;
      cmdRating?: unknown;
      slRating?: unknown;
    }>({ _id: steamID }),
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

    // Бэкофилл полей рейтинга для старых документов, созданных до их
    // появления ($setOnInsert их не добавляет к существующим докам).
    if (!resultMain.rating) updates.rating = baseFields.rating;
    if (!resultMain.cmdRating) updates.cmdRating = baseFields.cmdRating;
    if (!resultMain.slRating) updates.slRating = baseFields.slRating;

    if (Object.keys(updates).length > 0) {
      await Promise.all([
        collectionMain.updateOne({ _id: steamID }, { $set: updates }),
        collectionTemp.updateOne({ _id: steamID }, { $set: updates }),
      ]);
    }
  }

  await collectionMain.updateOne(
    { _id: steamID },
    { $set: { lastActiveAt: Date.now() } },
  );
}

export async function updateUserBonuses(
  serverId: number,
  steamID: string,
  count: number,
) {
  const h = handle(serverId);
  if (!h) return;
  const collectionMain = h.main;
  const collectionServerInfo = h.serverInfo;

  const [userInfo, serverInfo] = await Promise.all([
    collectionMain.findOne({ _id: steamID }),
    collectionServerInfo.findOne({ _id: serverId.toString() }),
  ]);

  if (userInfo && userInfo.seedRole && serverInfo?.seeding) {
    count = 5;
  }

  await collectionMain.updateOne(
    { _id: steamID },
    { $inc: { bonuses: count } },
  );
}

const ROLE_KEYS = [
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
const ENGINEER_KEYS = ['_sapper', '_saboteur'];

export function normalizeRole(role: string): string {
  let normalized = role.toLowerCase();
  for (const r of ROLE_KEYS) {
    if (normalized.includes(r)) {
      normalized = ENGINEER_KEYS.some((el) => normalized.includes(el))
        ? '_engineer'
        : r;
      break;
    }
  }
  return normalized;
}

export async function updateRoles(
  serverId: number,
  steamID: string,
  role: string,
) {
  const h = handle(serverId);
  if (!h) return;

  const rolesFilter = `roles.${normalizeRole(role)}`;
  await h.main.updateOne({ _id: steamID }, { $inc: { [rolesFilter]: 1 } });
}

export async function updateTimes(
  serverId: number,
  steamID: string,
  field: string,
  name: string,
) {
  const h = handle(serverId);
  if (!h) return;
  const user = { _id: steamID };

  const squadFilter = `squad.${field}`;
  const incDoc: Record<string, number> = { [squadFilter]: 1 };

  const dExp = expDeltaForSquadTime(field);
  if (dExp !== 0) incDoc.exp = dExp;

  await h.main.updateOne(user, { $inc: incDoc });
  await updateCollectionTemp(h, user, { $inc: incDoc }, name);
}

export async function updatePossess(
  serverId: number,
  steamID: string,
  field: string,
) {
  const h = handle(serverId);
  if (!h) return;
  if (field.toLowerCase().includes('soldier')) return;

  const possessFilter = `possess.${field}`;
  await h.main.updateOne({ _id: steamID }, { $inc: { [possessFilter]: 1 } });
}

export type MinutePlayer = {
  steamID: string;
  name: string;
  possess?: string;
  role?: string;
  leader?: boolean;
  cmd?: boolean;
};

function tempInsertDefaults(name: string): Record<string, unknown> {
  return {
    name: (name ?? '').trim(),
    eosID: '',
    kills: 0,
    death: 0,
    revives: 0,
    teamkills: 0,
    kd: 0,
    bonuses: 0,
    possess: {},
    roles: {},
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
    lastActiveAt: undefined,
  };
}

export async function bulkUpdatePlayerMinute(
  serverId: number,
  players: MinutePlayer[],
): Promise<void> {
  const h = handle(serverId);
  if (!h || players.length === 0) return;
  const collectionMain = h.main;
  const collectionTemp = h.temp;

  const mainOps: AnyBulkWriteOperation<Main>[] = [];
  const tempOps: AnyBulkWriteOperation<Main>[] = [];

  for (const p of players) {
    if (!p.steamID) continue;

    const mainInc: Record<string, number> = {};
    if (p.possess && !p.possess.toLowerCase().includes('soldier')) {
      const k = `possess.${p.possess}`;
      mainInc[k] = (mainInc[k] ?? 0) + 1;
    }
    if (p.role) {
      const k = `roles.${normalizeRole(p.role)}`;
      mainInc[k] = (mainInc[k] ?? 0) + 1;
    }

    let exp = 1;
    mainInc['squad.timeplayed'] = (mainInc['squad.timeplayed'] ?? 0) + 1;
    if (p.leader) {
      mainInc['squad.leader'] = (mainInc['squad.leader'] ?? 0) + 1;
      exp += 2;
    }
    if (p.cmd) {
      mainInc['squad.cmd'] = (mainInc['squad.cmd'] ?? 0) + 1;
      exp += 4;
    }
    mainInc['exp'] = (mainInc['exp'] ?? 0) + exp;

    mainOps.push({
      updateOne: { filter: { _id: p.steamID }, update: { $inc: mainInc } },
    });

    const tempInc: Record<string, number> = { 'squad.timeplayed': 1, exp };
    if (p.leader) tempInc['squad.leader'] = 1;
    if (p.cmd) tempInc['squad.cmd'] = 1;

    tempOps.push({
      updateOne: {
        filter: { _id: p.steamID },
        update: { $inc: tempInc, $setOnInsert: tempInsertDefaults(p.name) },
        upsert: true,
      },
    });
  }

  await Promise.all([
    mainOps.length
      ? collectionMain.bulkWrite(mainOps, { ordered: false })
      : Promise.resolve(),
    tempOps.length
      ? collectionTemp.bulkWrite(tempOps, { ordered: false })
      : Promise.resolve(),
  ]);
}

export interface EloParticipant {
  steamID: string;
  teamID: string;
  squadID?: string;
  win: boolean;
  kills: number;
  death: number;
  revives: number;
  teamkills: number;
  vehicleKills?: number;
  downs?: number;
  victims?: string[];
  downedVictims?: string[];
  supportSeconds?: number;
  crewSeconds?: number;
  crewAssists?: number;
  wasCommander?: boolean;
  wasSquadLeader?: boolean;
}

export interface EloOptions {
  weights?: ImpactWeights;
  perfSpread?: number;
  winNudge?: number;
  tau?: number;
  displayMode?: 'conservative' | 'mu';
  inactivityPeriodDays?: number;
  supportWeights?: SupportWeights;
  supportFloor?: SupportFloorOpts;
  matchSeconds?: number;
  winnerTickets?: number;
  loserTickets?: number;
  team1Fobs?: number;
  team2Fobs?: number;
  commanderWeights?: CommanderWeights;
}

export async function applyMatchElo(
  serverId: number,
  participants: EloParticipant[],
  opts: EloOptions = {},
): Promise<void> {
  const h = handle(serverId);
  if (!h || participants.length < 2) return;
  const collectionMain = h.main;

  const {
    weights = {},
    perfSpread = 0.45,
    winNudge = 0.05,
    tau = 0.5,
    displayMode = 'conservative',
    inactivityPeriodDays = 30,
    supportWeights = {},
    supportFloor = {},
    matchSeconds = 0,
    winnerTickets = 0,
    loserTickets = 0,
    team1Fobs = 0,
    team2Fobs = 0,
    commanderWeights = {},
  } = opts;

  const ids = participants.map((p) => p.steamID);
  const docs = await collectionMain
    .find(
      { _id: { $in: ids } },
      { projection: { rating: 1, cmdRating: 1, slRating: 1 } },
    )
    .toArray();
  const ratingById = new Map<string, PlayerRating>();
  const cmdRatingById = new Map<string, PlayerRating>();
  const slRatingById = new Map<string, PlayerRating>();
  for (const d of docs) {
    const dd = d as unknown as {
      _id: string;
      rating?: PlayerRating;
      cmdRating?: PlayerRating;
      slRating?: PlayerRating;
    };
    if (dd.rating) ratingById.set(dd._id, dd.rating);
    if (dd.cmdRating) cmdRatingById.set(dd._id, dd.cmdRating);
    if (dd.slRating) slRatingById.set(dd._id, dd.slRating);
  }

  const now = Date.now();
  const toGlicko = (r: PlayerRating | undefined): Glicko => {
    if (!r) return { ...DEFAULT_GLICKO };
    const days = r.lastAt ? (now - r.lastAt) / 86_400_000 : 0;
    return inflateRd(
      { mu: r.mu, rd: r.rd, sigma: r.sigma },
      days,
      inactivityPeriodDays,
    );
  };
  const glickoOf = (steamID: string): Glicko =>
    toGlicko(ratingById.get(steamID));

  const cur = participants.map((p) => ({ p, g: glickoOf(p.steamID) }));

  const field = aggregateOpponent(cur.map((c) => c.g));

  const W = { ...DEFAULT_IMPACT_WEIGHTS, ...weights };
  const muOf = (sid: string) => ratingById.get(sid)?.mu ?? DEFAULT_GLICKO.mu;
  const impactOf = (p: EloParticipant): number => {
    const wk =
      p.victims && p.victims.length
        ? p.victims.reduce((s, v) => s + killValue(muOf(v)), 0)
        : p.kills;
    const wd =
      p.downedVictims && p.downedVictims.length
        ? p.downedVictims.reduce((s, v) => s + killValue(muOf(v)), 0)
        : (p.downs ?? 0);
    const combat =
      W.kill * wk +
      W.vehicleKill * (p.vehicleKills ?? 0) +
      W.down * wd +
      W.revive * p.revives -
      W.death * p.death -
      W.teamkill * p.teamkills;

    return combat + supportImpact(p, supportWeights);
  };

  const zs = impactZScores(cur.map((c) => impactOf(c.p)));

  const scores = cur.map((c, i) => {
    const s0 = performanceToScore(zs[i], c.p.win, { perfSpread, winNudge });
    const share = supportShare(c.p, matchSeconds);
    return applySupportFloor(s0, c.p.win, share, c.p.teamkills, supportFloor);
  });

  const ops: AnyBulkWriteOperation<Main>[] = [];
  const ratingSet = (field: string, sid: string, ng: Glicko, disp: number) => {
    ops.push({
      updateOne: {
        filter: { _id: sid },
        update: {
          $set: {
            [`${field}.mu`]: ng.mu,
            [`${field}.rd`]: ng.rd,
            [`${field}.sigma`]: ng.sigma,
            [`${field}.lastAt`]: now,
          },
          $inc: { [`${field}.games`]: 1 },
          $max: { [`${field}.peak`]: disp },
        },
      },
    });
  };

  cur.forEach((c, i) => {
    const ng = updateGlicko(c.g, field.mu, field.rd, scores[i], tau);
    ratingSet('rating', c.p.steamID, ng, displayRating(ng, displayMode));
  });

  const teamSquadSum: Record<string, { sum: number; n: number }> = {};
  cur.forEach((c, i) => {
    const sq = c.p.squadID;
    if (!sq || sq === '0') return;
    const t = c.p.teamID;
    if (!teamSquadSum[t]) teamSquadSum[t] = { sum: 0, n: 0 };
    teamSquadSum[t].sum += scores[i];
    teamSquadSum[t].n += 1;
  });
  const teamSquadAvg = (t: string) => {
    const e = teamSquadSum[t];
    return e && e.n > 0 ? e.sum / e.n : 0.5;
  };
  const teamFobs = (t: string) =>
    t === '1' ? team1Fobs : t === '2' ? team2Fobs : 0;

  const commanders = cur.filter((c) => c.p.wasCommander);
  for (const x of commanders) {
    const me = toGlicko(cmdRatingById.get(x.p.steamID));
    const others = commanders
      .filter((y) => y.p.steamID !== x.p.steamID)
      .map((y) => toGlicko(cmdRatingById.get(y.p.steamID)));
    const opp = others.length
      ? aggregateOpponent(others)
      : { mu: DEFAULT_GLICKO.mu, rd: DEFAULT_GLICKO.rd };
    const enemyTeam = x.p.teamID === '1' ? '2' : '1';
    const sc = commanderScore(
      {
        win: x.p.win,
        winnerTickets,
        loserTickets,
        myFobs: teamFobs(x.p.teamID),
        enemyFobs: teamFobs(enemyTeam),
        mySquadAvg: teamSquadAvg(x.p.teamID),
        enemySquadAvg: teamSquadAvg(enemyTeam),
      },
      commanderWeights,
    );
    const ng = updateGlicko(me, opp.mu, opp.rd, sc, tau);
    ratingSet('cmdRating', x.p.steamID, ng, displayRating(ng, displayMode));
  }

  const slScores = squadLeaderScores(
    cur.map((c, i) => ({
      steamID: c.p.steamID,
      teamID: c.p.teamID,
      squadID: c.p.squadID ?? '',
      score: scores[i],
      win: c.p.win,
      wasSquadLeader: !!c.p.wasSquadLeader || !!c.p.wasCommander,
    })),
    { perfSpread, winNudge },
  );
  if (slScores.size) {
    const slIds = [...slScores.keys()];
    const slField = aggregateOpponent(
      slIds.map((sid) => toGlicko(slRatingById.get(sid))),
    );
    for (const sid of slIds) {
      const me = toGlicko(slRatingById.get(sid));
      const ng = updateGlicko(
        me,
        slField.mu,
        slField.rd,
        slScores.get(sid) as number,
        tau,
      );
      ratingSet('slRating', sid, ng, displayRating(ng, displayMode));
    }
  }

  if (ops.length) await collectionMain.bulkWrite(ops, { ordered: false });
}

export async function getUserDataWithSteamID(
  serverId: number,
  steamID: string,
) {
  const h = handle(serverId);
  if (!h) return null;
  return await h.main.findOne({ _id: steamID });
}

async function incAndRecalcKd(
  h: DbHandle,
  coll: Collection<Main>,
  steamID: string,
  inc: Record<string, number>,
  ensure: boolean,
): Promise<void> {
  const opts = {
    returnDocument: 'after' as const,
    projection: { kills: 1, death: 1 },
  };
  let doc = await coll.findOneAndUpdate({ _id: steamID }, { $inc: inc }, opts);
  if (!doc && ensure) {
    const mainUser = await h.main.findOne(
      { _id: steamID },
      { projection: { name: 1 } },
    );
    await createUserOnHandle(h, steamID, mainUser?.name ?? '');
    doc = await coll.findOneAndUpdate({ _id: steamID }, { $inc: inc }, opts);
  }
  if (!doc) return;

  const kills = Number(doc.kills ?? 0);
  const death = Number(doc.death ?? 0);
  const kd =
    death > 0 && Number.isFinite(kills / death)
      ? Number((kills / death).toFixed(2))
      : kills;
  await coll.updateOne({ _id: steamID }, { $set: { kd } });
}

export async function updateUser(
  serverId: number,
  steamID: string,
  field: string,
  weapon?: string,
) {
  const h = handle(serverId);
  if (!steamID || !field || !h) return;

  const inc: Record<string, number> = { [field]: 1 };
  const dExp = expDeltaForCounter(field);
  if (dExp !== 0) inc.exp = dExp;
  if (field === 'kills' && weapon && weapon !== 'null') {
    inc[`weapons.${weapon}`] = 1;
  }

  await Promise.all([
    incAndRecalcKd(h, h.main, steamID, inc, false),
    incAndRecalcKd(h, h.temp, steamID, inc, true),
  ]);
}

export async function updateGames(
  serverId: number,
  steamID: string,
  field: string,
) {
  const h = handle(serverId);
  if (!h) return;
  const collectionMain = h.main;
  const collectionTemp = h.temp;

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
    await updateWinrate(h, user, field);
  }
}

function getWonLose(u: Main, isCmd: boolean): { won: number; lose: number } {
  return isCmd
    ? { won: u.matches.cmdwon, lose: u.matches.cmdlose }
    : { won: u.matches.won, lose: u.matches.lose };
}

async function updateWinrate(
  h: DbHandle,
  user: { _id: string },
  field: string,
) {
  const collectionMain = h.main;
  const collectionTemp = h.temp;
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

function buildHistoryPush(items: string[], cap?: number) {
  return typeof cap === 'number' && cap >= 0
    ? { $each: items, $slice: -cap }
    : { $each: items };
}

function toHistoryItems(value?: string | string[]): string[] {
  return (Array.isArray(value) ? value : value == null ? [] : [value]).filter(
    Boolean,
  );
}

export async function serverHistoryLayers(
  serverID: number,
  value?: string | string[],
  cap?: number,
) {
  const h = handle(serverID);
  const items = toHistoryItems(value);
  if (items.length === 0 || !h) return;
  const _id = serverID.toString();
  const server = await h.serverInfo.findOne({ _id });
  if (!server) return;
  await h.serverInfo.updateOne(
    { _id },
    { $push: { rnsHistoryLayers: buildHistoryPush(items, cap) } },
  );
}

export async function getHistoryLayers(serverID: number) {
  const h = handle(serverID);
  if (!h) return [];
  const result = await h.serverInfo.findOne({ _id: serverID.toString() });
  return result?.rnsHistoryLayers || [];
}

export async function serverHistoryFactions(
  serverID: number,
  value?: string | string[],
  cap?: number,
) {
  const h = handle(serverID);
  const items = toHistoryItems(value);
  if (items.length === 0 || !h) return;
  const _id = serverID.toString();
  const server = await h.serverInfo.findOne({ _id });
  if (!server) return;
  await h.serverInfo.updateOne(
    { _id },
    { $push: { rnsHistoryFactions: buildHistoryPush(items, cap) } },
  );
}

export async function getHistoryFactions(serverID: number): Promise<string[]> {
  const h = handle(serverID);
  if (!h) return [];
  const result = await h.serverInfo.findOne({ _id: serverID.toString() });
  return result?.rnsHistoryFactions || [];
}

export async function serverHistoryUnitTypes(
  serverID: number,
  value?: string | string[],
  cap?: number,
) {
  const h = handle(serverID);
  const items = toHistoryItems(value);
  if (items.length === 0 || !h) return;
  const _id = serverID.toString();
  const server = await h.serverInfo.findOne({ _id });
  if (!server) return;
  await h.serverInfo.updateOne(
    { _id },
    { $push: { rnsHistoryUnitTypes: buildHistoryPush(items, cap) } },
  );
}

export async function getHistoryUnitTypes(serverID: number): Promise<string[]> {
  const h = handle(serverID);
  if (!h) return [];
  const result = await h.serverInfo.findOne({ _id: serverID.toString() });
  return result?.rnsHistoryUnitTypes || [];
}

export async function getTimeStampForRestartServer(serverID: number) {
  const h = handle(serverID);
  if (!h) return;
  const server = await h.serverInfo.findOne({ _id: serverID.toString() });
  return server?.timeStampToRestart;
}

export async function createTimeStampForRestartServer(serverID: number) {
  const h = handle(serverID);
  if (!h) return;
  const date = Date.now();

  await h.serverInfo.updateOne(
    { _id: serverID.toString() },
    { $set: { timeStampToRestart: date } },
    { upsert: true },
  );
}

async function updateCollectionTemp(
  h: DbHandle,
  user: { _id: string },
  doc: { $inc: Record<string, number> } | { $set: Record<string, number> },
  name: string,
) {
  const tempStats = await h.temp.updateOne(user, doc);
  if (tempStats.modifiedCount !== 1) {
    await createUserOnHandle(h, user._id, name);
    await h.temp.updateOne(user, doc);
  }
}

function getLastMondayReset(): number {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  const daysBack =
    day === WEEKLY_RESET_DAY && hour >= WEEKLY_RESET_HOUR
      ? 0
      : (day - WEEKLY_RESET_DAY + 7) % 7 || 7;

  const lastReset = new Date(now);
  lastReset.setDate(now.getDate() - daysBack);
  lastReset.setHours(WEEKLY_RESET_HOUR, 0, 0, 0);
  return lastReset.getTime();
}

export async function creatingTimeStamp(serverId: number) {
  const h = handle(serverId);
  if (!h) return;
  const collectionMain = h.main;
  const collectionTemp = h.temp;

  const userTemp = { _id: 'dateTemp' };
  const timeTemp = await collectionMain.findOne({ _id: 'dateTemp' });
  const lastResetTime = (timeTemp as { date?: number } | null)?.date ?? 0;
  const expectedReset = getLastMondayReset();

  if (lastResetTime < expectedReset) {
    dbLog.log(
      `Сервер ${serverId}: недельная статистика очищена (понедельник ${new Date(expectedReset).toLocaleString('ru-RU')})`,
    );
    await collectionTemp.deleteMany({});
    await collectionMain.updateOne(
      userTemp,
      { $set: { date: Date.now() } },
      { upsert: true },
    );
  }
}

export async function pushMatchHistory(
  serverId: number,
  steamID: string,
  entry: MatchHistoryEntry,
): Promise<void> {
  const h = handle(serverId);
  if (!h) return;

  try {
    await h.main.updateOne(
      { _id: steamID },
      {
        $push: {
          matchHistory: {
            $each: [entry],
            $slice: -5,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      },
    );
  } catch (error) {
    dbLog.error(`Ошибка записи истории матчей: ${String(error)}`);
  }
}

export async function incidentOpen(
  serverId: number,
  doc: IncidentDoc,
): Promise<void> {
  const h = handle(serverId);
  if (!h?.incidents) return;
  const { _id, ...rest } = doc;
  try {
    await h.incidents.updateOne(
      { _id },
      { $setOnInsert: rest },
      { upsert: true },
    );
  } catch (error) {
    dbLog.error(`incidentOpen: ${String(error)}`);
  }
}

export async function incidentAppend(
  serverId: number,
  id: string,
  opts: {
    kills?: IncidentKill[];
    countsInc?: Partial<IncidentCounts>;
    severity?: IncidentSeverity;
    addFlags?: string[];
    lastEventAt: number;
    cap?: number;
  },
): Promise<void> {
  const h = handle(serverId);
  if (!h?.incidents) return;

  const set: Record<string, unknown> = { lastEventAt: opts.lastEventAt };
  if (opts.severity) set.severity = opts.severity;

  const inc: Record<string, number> = {};
  for (const [k, v] of Object.entries(opts.countsInc ?? {})) {
    if (v) inc[`counts.${k}`] = v;
  }

  const update: UpdateFilter<IncidentDoc> = { $set: set };
  if (Object.keys(inc).length) update.$inc = inc;
  if (opts.addFlags?.length) {
    update.$addToSet = { flags: { $each: opts.addFlags } };
  }
  if (opts.kills?.length) {
    update.$push = {
      killlog: { $each: opts.kills, $slice: -(opts.cap ?? 200) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  try {
    await h.incidents.updateOne({ _id: id }, update);
  } catch (error) {
    dbLog.error(`incidentAppend: ${String(error)}`);
  }
}

export async function sbEnsureSmartBalance(
  serverId: number,
  retentionDays: number,
): Promise<void> {
  const h = handle(serverId);
  if (!h) return;

  const collectionEdges = h.db.collection<SocialEdge>('social_edges');
  const collectionClanTags = h.db.collection<ClanTagDoc>('clan_tags');
  h.edges = collectionEdges;
  h.clanTags = collectionClanTags;
  h.control = h.db.collection<ControlDoc>('smart_balance_control');

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
  serverId: number,
  batch: Readonly<Record<string, { sq?: number; mt?: number; at: Date }>>,
): Promise<void> {
  const collectionEdges = handle(serverId)?.edges;
  if (!collectionEdges) return;
  const ops: AnyBulkWriteOperation<SocialEdge>[] = [];

  for (const k of Object.keys(batch)) {
    const [a, b] = k.split('|');
    const incDoc: Record<string, number> = {};
    if (batch[k].sq) incDoc.coSquadSeconds = batch[k].sq as number;
    if (batch[k].mt) incDoc.matchesTogether = batch[k].mt as number;

    ops.push({
      updateOne: {
        filter: { a, b },
        update: {
          $setOnInsert: { a, b },
          $set: { lastSeenAt: batch[k].at },
          ...(Object.keys(incDoc).length ? { $inc: incDoc } : {}),
        },
        upsert: true,
      },
    });
  }

  if (ops.length) {
    await collectionEdges.bulkWrite(ops, { ordered: false }).catch(() => {});
  }
}

export function splitDenseParties(
  comp: readonly string[],
  weight: (a: string, b: string) => number,
  maxParty: number,
): string[][] {
  if (comp.length < 2) return [];
  if (comp.length <= maxParty) return [[...comp]];

  const remaining = new Set(comp);
  const out: string[][] = [];

  while (remaining.size >= 2) {
    const arr = [...remaining];
    let seedA = '';
    let seedB = '';
    let best = -1;
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++) {
        const w = weight(arr[i], arr[j]);
        if (w > best) {
          best = w;
          seedA = arr[i];
          seedB = arr[j];
        }
      }
    if (best <= 0) break;

    const group = new Set([seedA, seedB]);
    remaining.delete(seedA);
    remaining.delete(seedB);

    while (group.size < maxParty) {
      let bestNode = '';
      let bestSum = 0;
      for (const c of remaining) {
        let s = 0;
        for (const g of group) s += weight(c, g);
        if (s > bestSum) {
          bestSum = s;
          bestNode = c;
        }
      }
      if (!bestNode || bestSum <= 0) break;
      group.add(bestNode);
      remaining.delete(bestNode);
    }
    out.push([...group]);
  }
  return out;
}

export async function sbGetActivePartiesOnline(
  serverId: number,
  onlineIDs: readonly string[],
  windowDays: number,
  minSec: number,
  minMatches: number,
  maxParty: number,
): Promise<string[][]> {
  const collectionEdges = handle(serverId)?.edges;
  if (!collectionEdges || onlineIDs.length === 0) return [];
  const onlineSet = new Set(onlineIDs);
  const cutoff = new Date(Date.now() - windowDays * 86400_000);

  const cursor = collectionEdges.find(
    { lastSeenAt: { $gte: cutoff }, coSquadSeconds: { $gte: minSec } },
    {
      projection: { a: 1, b: 1, coSquadSeconds: 1, matchesTogether: 1, _id: 0 },
    },
  );

  const adj = new Map<string, Set<string>>();
  const wMap = new Map<string, number>();
  const wKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const ensure = (x: string) => {
    if (!adj.has(x)) adj.set(x, new Set());
  };

  while (await cursor.hasNext()) {
    const e = await cursor.next();
    if (!e) break;
    if (!onlineSet.has(e.a) || !onlineSet.has(e.b)) continue;
    if ((e.matchesTogether ?? 0) < minMatches) continue;
    ensure(e.a);
    ensure(e.b);
    adj.get(e.a)!.add(e.b);
    adj.get(e.b)!.add(e.a);
    wMap.set(wKey(e.a, e.b), e.coSquadSeconds ?? 0);
  }

  const weight = (a: string, b: string) => wMap.get(wKey(a, b)) ?? 0;

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
    for (const party of splitDenseParties(comp, weight, maxParty))
      if (party.length >= 2) parties.push(party);
  }
  return parties;
}

export async function sbDailyDecayEdges(
  serverId: number,
  factor: number,
): Promise<void> {
  const h = handle(serverId);
  const collectionEdges = h?.edges;
  const collectionControl = h?.control;
  if (!collectionEdges || !collectionControl) return;

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
    { projection: { _id: 1, coSquadSeconds: 1 } },
  );
  const ops: AnyBulkWriteOperation<SocialEdge>[] = [];

  while (await cursor.hasNext()) {
    const e = await cursor.next();
    if (!e) break;
    const sq = Math.floor((e.coSquadSeconds ?? 0) * factor);
    ops.push({
      updateOne: {
        filter: { _id: e._id },
        update: {
          $set: {
            coSquadSeconds: sq,
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
  serverId: number,
  stats: Array<{
    tag: string;
    totalInc: number;
    startInc: number;
    steamIDs: string[];
  }>,
): Promise<number> {
  const collectionClanTags = handle(serverId)?.clanTags;
  if (!collectionClanTags || stats.length === 0) return 0;

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

export async function sbGetClanTagDocs(
  serverId: number,
  tags: string[],
): Promise<ClanTagDoc[]> {
  const collectionClanTags = handle(serverId)?.clanTags;
  if (!collectionClanTags || !tags.length) return [];
  const arr = await collectionClanTags.find({ tag: { $in: tags } }).toArray();
  return arr;
}

export async function sbUpdateClanCohesion(
  serverId: number,
  tag: string,
  cohesion: number,
): Promise<void> {
  const collectionClanTags = handle(serverId)?.clanTags;
  if (!collectionClanTags) return;
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
