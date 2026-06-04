import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import {
  TApplyExplosiveDamage,
  TDeployableDamaged,
  TFobPlaced,
  TGrenadeSpawned,
  TNewGame,
  TPlayerConnected,
  TPlayerDamaged,
  TPlayerDied,
  TPlayerDisconnected,
  TPlayerPossess,
  TPlayerRespawn,
  TPlayerRevived,
  TPlayerSuicide,
  TPlayerWounded,
  TRoundTickets,
  TTickRate,
  TVehicleDamaged,
} from 'squad-logs';
import {
  TChatMessage,
  TPossessedAdminCamera,
  TSquadCreated,
  TUnPossessedAdminCamera,
} from 'squad-rcon';
import { EVENTS } from '../constants';
import { incidentAppend, incidentOpen } from '../rnsdb';
import {
  TPlayer,
  TPlayerLeaderChanged,
  TPlayerRoleChanged,
  TPlayerSquadChanged,
  TPlayerTeamChanged,
  TPluginProps,
} from '../types';
import {
  getPlayer,
  getPlayerByController,
  getPlayerByEOSID,
  getPlayerByName,
  getPlayerByPossess,
  getPlayerBySteamID,
  getSquadByID,
} from './helpers';
import { createIncidentEngine, type EngineOptions } from './incidents/engine';
import { initTelemetryRawEvents } from './rnsTelemetryRawEvents';

function esc(v: unknown): string {
  if (v == null || v === undefined) return '';
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

function csvLine(cols: unknown[]): string {
  return cols.map(esc).join(',') + '\n';
}

const _ensuredDirs = new Set<string>();
const _initedFiles = new Set<string>();

function ensureDir(d: string): void {
  if (_ensuredDirs.has(d)) return;
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  _ensuredDirs.add(d);
}

function appendCsv(filePath: string, header: string, cols: unknown[]): void {
  ensureDir(path.dirname(filePath));

  if (!_initedFiles.has(filePath)) {
    _initedFiles.add(filePath);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, header + '\n' + csvLine(cols));
      return;
    }
  }
  appendFileSync(filePath, csvLine(cols));
}

function dateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowISO(): string {
  return new Date().toISOString();
}

const H = {
  tickrate: 'timestamp,server_id,tickrate,map,layer,player_count',

  kills:
    'timestamp,server_id,map,layer,' +
    'killer_name,killer_steam,killer_eosid,killer_team,killer_squad_id,killer_squad_name,killer_role,killer_weapon,killer_possess,' +
    'victim_name,victim_steam,victim_eosid,victim_team,victim_squad_id,victim_squad_name,victim_role,victim_weapon,victim_possess,' +
    'damage,is_teamkill,is_headshot',

  wounds:
    'timestamp,server_id,map,layer,' +
    'attacker_name,attacker_steam,attacker_eosid,attacker_team,attacker_squad_id,attacker_squad_name,' +
    'victim_name,victim_steam,victim_eosid,victim_team,victim_squad_id,victim_squad_name,' +
    'damage,weapon,is_teamkill',

  revives:
    'timestamp,server_id,map,layer,' +
    'reviver_name,reviver_steam,reviver_eosid,reviver_team,reviver_squad_id,reviver_squad_name,reviver_role,' +
    'victim_name,victim_steam,victim_eosid,victim_team,victim_squad_id,victim_squad_name',

  teamkills:
    'timestamp,server_id,map,layer,' +
    'attacker_name,attacker_steam,attacker_eosid,attacker_team,attacker_squad_id,attacker_squad_name,' +
    'victim_name,victim_steam,victim_eosid,victim_team,victim_squad_id,victim_squad_name,' +
    'damage,weapon',

  damage_dealt:
    'timestamp,server_id,map,layer,' +
    'attacker_name,attacker_steam,attacker_eosid,attacker_team,attacker_squad_id,' +
    'victim_name,victim_steam,victim_eosid,victim_team,victim_squad_id,' +
    'damage,weapon',

  squads:
    'timestamp,server_id,map,layer,snapshot_type,' +
    'team_id,team_name,squad_id,squad_name,squad_size,locked,' +
    'creator_name,creator_steam,creator_eosid,' +
    'members',

  squad_scores:
    'timestamp,server_id,map,layer,' +
    'team_id,team_name,squad_id,squad_name,' +
    'kills,deaths,revives,teamkills,player_count',

  players:
    'timestamp,server_id,map,layer,event,' +
    'player_name,player_steam,player_eosid,player_team,player_squad_id,player_squad_name,player_role,is_leader,' +
    'ip,extra',

  player_sessions:
    'timestamp,server_id,event,' +
    'player_name,player_steam,player_eosid,ip,' +
    'session_duration_sec,map,layer',

  matches:
    'timestamp,server_id,event,' +
    'map,layer,level,' +
    'team1_faction,team1_subfaction,team1_tickets,' +
    'team2_faction,team2_subfaction,team2_tickets,' +
    'winner_team,duration_min,total_players',

  roles:
    'timestamp,server_id,map,layer,' +
    'player_name,player_steam,player_eosid,player_team,player_squad_id,' +
    'old_role,new_role,is_leader',

  possessions:
    'timestamp,server_id,map,layer,' +
    'player_name,player_steam,player_eosid,player_team,player_squad_id,' +
    'possess_classname,possess_type',

  vehicles:
    'timestamp,server_id,map,layer,' +
    'attacker_name,attacker_steam,attacker_eosid,attacker_team,' +
    'victim_vehicle,damage,damage_type,attacker_vehicle,health_remaining',

  deployables:
    'timestamp,server_id,map,layer,' +
    'player_name,player_steam,player_eosid,player_team,player_squad_id,' +
    'deployable,deployable_type,damage,weapon,is_friendly',

  explosives:
    'timestamp,server_id,map,layer,' +
    'player_name,player_steam,player_eosid,player_team,player_squad_id,' +
    'player_controller,deployable,locations',

  grenades:
    'timestamp,server_id,map,layer,' +
    'player_name,player_steam,player_eosid,player_team,player_squad_id,' +
    'instigator,location',

  chat:
    'timestamp,server_id,map,layer,' +
    'player_name,player_steam,player_eosid,player_team,player_squad_id,player_squad_name,player_role,' +
    'channel,message',

  events:
    'timestamp,server_id,map,layer,event,' +
    'player_name,player_steam,player_eosid,player_team,' +
    'extra',

  social:
    'timestamp,server_id,map,layer,' +
    'steam_id_1,name_1,steam_id_2,name_2,' +
    'relation_type,squad_id,squad_name,team_id,duration_sec',
} as const;

interface SquadScore {
  teamID: string;
  teamName: string;
  squadID: string;
  squadName: string;
  kills: number;
  deaths: number;
  revives: number;
  teamkills: number;
  players: Set<string>;
}

interface MatchTicketInfo {
  team: string;
  action: string;
  subfaction?: string;
  faction?: string;
  tickets?: number;
}

interface PlayerSession {
  name: string;
  steamID: string;
  eosID: string;
  joinTime: number;
  map: string;
  layer: string;
}

interface SquadMemberSnapshot {
  steamID: string;
  name: string;
}

function classifyDeployable(raw: string): string {
  const lc = (raw || '').toLowerCase();
  if (lc.includes('fobradio')) return 'fob';
  if (lc.includes('hab')) return 'hab';
  if (lc.includes('hesco')) return 'hesco';
  if (
    lc.includes('ammocrate') ||
    lc.includes('ammobag') ||
    lc.includes('infantryammobag')
  )
    return 'ammo';
  if (lc.includes('razorwire')) return 'razorwire';
  if (lc.includes('sandbag') || lc.includes('murder_hole')) return 'sandbag';
  if (lc.includes('repair')) return 'repair_station';
  if (lc.includes('observationtower')) return 'tower';
  if (lc.includes('bunker')) return 'bunker';
  if (lc.includes('mine') || lc.includes('ied') || lc.includes('sz1'))
    return 'explosive';
  if (lc.includes('mortar')) return 'mortar';
  if (
    lc.includes('tow') ||
    lc.includes('kornet') ||
    lc.includes('stugna') ||
    lc.includes('konkurs') ||
    lc.includes('kord') ||
    lc.includes('emplaced')
  )
    return 'emplacement';
  if (lc.includes('drone')) return 'drone';
  return 'other';
}

function classifyPossess(raw: string): string {
  const lc = (raw || '').toLowerCase();
  if (lc.includes('admincam') || lc.includes('developeradmincam'))
    return 'admin_camera';
  if (
    lc.includes('heli') ||
    lc.includes('mi8') ||
    lc.includes('uh60') ||
    lc.includes('ch146') ||
    lc.includes('sa330') ||
    lc.includes('mi17') ||
    lc.includes('z8')
  )
    return 'helicopter';
  if (
    lc.includes('tank') ||
    lc.includes('abrams') ||
    lc.includes('leopard') ||
    lc.includes('t72') ||
    lc.includes('t62') ||
    lc.includes('challenger') ||
    lc.includes('ztz')
  )
    return 'tank';
  if (
    lc.includes('apc') ||
    lc.includes('btr') ||
    lc.includes('stryker') ||
    lc.includes('warrior') ||
    lc.includes('m113') ||
    lc.includes('bmp') ||
    lc.includes('lav') ||
    lc.includes('mt-lb') ||
    lc.includes('zbd') ||
    lc.includes('zsl')
  )
    return 'apc_ifv';
  if (
    lc.includes('technical') ||
    lc.includes('ural') ||
    lc.includes('logi') ||
    lc.includes('truck') ||
    lc.includes('transport') ||
    lc.includes('mrap') ||
    lc.includes('matv') ||
    lc.includes('tigr')
  )
    return 'vehicle';
  if (
    lc.includes('kornet') ||
    lc.includes('stugna') ||
    lc.includes('tow') ||
    lc.includes('konkurs') ||
    lc.includes('kord') ||
    lc.includes('nsv') ||
    lc.includes('ags') ||
    lc.includes('spg') ||
    lc.includes('zu23') ||
    lc.includes('dshk') ||
    lc.includes('m2') ||
    lc.includes('browning')
  )
    return 'emplacement';
  if (lc.includes('mortar')) return 'mortar';
  if (lc.includes('soldier') || lc.includes('infantry')) return 'infantry';
  return 'other';
}

function isFriendlyDeployable(weapon: string, deployable: string): boolean {
  if (!weapon.match(/_Deployable_/i)) return false;
  const teamsFob: [string, string][] = [
    ['SZ1', 'RUS'],
    ['600g', 'INS'],
    ['SZ1', 'MEA'],
    ['M112', 'Woodland'],
    ['CompB', 'Woodland'],
    ['1lb', 'MIL'],
    ['IED', 'INS'],
    ['IED', 'MIL'],
    ['PLA', 'PLA'],
    ['M112', 'USA'],
    ['M112', 'USMC'],
    ['M112', 'CAF'],
    ['M112', 'GB'],
  ];
  for (const [wpnKey, depKey] of teamsFob) {
    if (weapon.includes(wpnKey) && deployable.includes(depKey)) return true;
  }
  return false;
}

export const rnsTelemetry: TPluginProps = (state, options) => {
  const { logger, listener, id } = state;
  const csvPath = options.csvPath || options.logPath || '/srv/telemetry';
  const serverId = options.serverId || String(id);
  const snapshotIntervalMs = Number(options.snapshotInterval) || 60000;
  const retentionDays = Number(options.retentionDays) || 30;
  const cleanupIntervalMs = 60 * 60 * 1000;

  const HEADSHOT_DAMAGE_MIN = Number(options.headshotDamageMin) || 100;
  const HEADSHOT_WEAPON_BLACKLIST = String(
    options.headshotWeaponBlacklist ||
      'Projectile|Rocket|BM21|RPG|SPG|C90|2A72|2A42|2A70|2A28|ZTM|KPVT|Kord|DSHK|DShK|NSV|PKT|RHIB|MI8|Mi24|Mi8|Mortar|VOG|40MM|Frag|Grenade|Deployable|Mine|SV98|SVD|BMP|BMD|BTR|BRDM|MTLB|Tigr|Kozak|Arbalet|Kamaz|Kraz|Quadbike|Cannon|Coax|Autocannon|Sniper|M110|SR25|M2_|Browning|Maxim',
  );
  const headshotBlacklistRe = new RegExp(HEADSHOT_WEAPON_BLACKLIST, 'i');

  const srvDir = path.join(csvPath, serverId);
  ensureDir(srvDir);

  logger.log(`[rnsTelemetry] CSV → ${srvDir}, server=${serverId}`);

  let matchIsEnded = false;
  let matchStartTime = Date.now();
  let winner = '';
  let matchTickets: MatchTicketInfo[] = [];
  let squadScores = new Map<string, SquadScore>();

  const activeSessions = new Map<string, PlayerSession>();

  const fobTeam = new Map<string, string>();

  // Пробрасываем настраиваемые пороги детектора из конфига плагина в движок.
  // Без этого server-specific тюнинг (rapidKillThreshold и т.п.) молча игнорируется.
  const num = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const engineOptions: Partial<EngineOptions> = {};
  const setOpt = <K extends keyof EngineOptions>(
    key: K,
    value: number | undefined,
  ) => {
    if (value !== undefined) engineOptions[key] = value as EngineOptions[K];
  };
  setOpt('rapidCount', num(options.rapidKillThreshold));
  const rapidWinSec = num(options.rapidKillWindowSec);
  setOpt(
    'rapidWindowMs',
    rapidWinSec !== undefined ? rapidWinSec * 1000 : undefined,
  );
  setOpt('directTkTrigger', num(options.massTkThreshold));
  const massTkWinSec = num(options.massTkWindowSec);
  setOpt(
    'directTkWindowMs',
    massTkWinSec !== undefined ? massTkWinSec * 1000 : undefined,
  );
  setOpt('knifeSpreeCount', num(options.knifeSpreeThreshold));
  const knifeWinSec = num(options.knifeSpreeWindowSec);
  setOpt(
    'knifeWindowMs',
    knifeWinSec !== undefined ? knifeWinSec * 1000 : undefined,
  );
  setOpt('hsRatio', num(options.headshotRatioThreshold));
  setOpt('hsMinKills', num(options.headshotRatioMinKills));

  const incidents = createIncidentEngine(
    {
      open: (d) => void incidentOpen(id, d),
      append: (i, o) => void incidentAppend(id, i, o),
    },
    engineOptions,
  );
  incidents.setContext({ serverId: id, server: serverId });

  const squadMemberships = new Map<string, Map<string, SquadMemberSnapshot>>();
  let lastSocialFlush = Date.now();

  const lastDamageWeapon = new Map<string, string>();

  const lastDamageAttacker = new Map<string, TPlayer>();

  /* Жертвы с «висящим» ранением: уже посчитаны как тейкдаун на PLAYER_WOUNDED.
     Их последующий PLAYER_DIED не считаем повторно. Воскрешение снимает флаг —
     тогда добивание поднятого придёт как die без wound и будет засчитано. */
  const pendingWound = new Set<string>();

  const playerIPs = new Map<string, string>();

  initTelemetryRawEvents({
    listener,
    appendCsv,
    file,
    serverId,
    playerIPs,
    getMap: () => state.currentMap?.level || '',
  });

  function mapInfo() {
    return {
      map: state.currentMap?.level || '',
      layer: state.currentMap?.layer || '',
    };
  }

  function pi(p: TPlayer | null) {
    if (!p)
      return {
        name: '',
        steam: '',
        eosid: '',
        team: '',
        squadID: '',
        squadName: '',
        role: '',
        isLeader: false,
        weapon: '',
        possess: '',
      };
    const sq = p.squadID ? getSquadByID(state, p.squadID, p.teamID) : null;
    return {
      name: p.name || '',
      steam: p.steamID || '',
      eosid: p.eosID || '',
      team: p.teamID || '',
      squadID: p.squadID || '',
      squadName: sq?.squadName || '',
      role: p.role || '',
      isLeader: p.isLeader || false,
      weapon: p.weapon || '',
      possess: p.possess || '',
    };
  }

  function file(type: string): string {
    return path.join(srvDir, `${dateStr()}_${type}.csv`);
  }

  function getOrCreateSquadScore(
    teamID: string,
    squadID: string | null | undefined,
  ): SquadScore | null {
    if (!teamID || !squadID) return null;
    const key = `${teamID}:${squadID}`;
    if (!squadScores.has(key)) {
      const sq = getSquadByID(state, squadID, teamID);
      squadScores.set(key, {
        teamID,
        teamName: sq?.teamName || '',
        squadID,
        squadName: sq?.squadName || '',
        kills: 0,
        deaths: 0,
        revives: 0,
        teamkills: 0,
        players: new Set(),
      });
    }
    return squadScores.get(key)!;
  }

  function resetMatchState() {
    matchStartTime = Date.now();
    winner = '';
    matchTickets = [];
    squadScores = new Map();
    fobTeam.clear();
    squadMemberships.clear();
    lastDamageWeapon.clear();
    lastDamageAttacker.clear();
    pendingWound.clear();
  }

  function getPlayerIP(steamID: string): string {
    return playerIPs.get(steamID) || '';
  }

  function trackSquadMembership(player: TPlayer) {
    if (!player.squadID || !player.teamID || !player.steamID) return;
    const key = `${player.teamID}:${player.squadID}`;
    if (!squadMemberships.has(key)) squadMemberships.set(key, new Map());
    const members = squadMemberships.get(key)!;
    if (!members.has(player.steamID)) {
      members.set(player.steamID, {
        steamID: player.steamID,
        name: player.name,
      });
    }
  }

  function flushSocialLinks() {
    const { map, layer } = mapInfo();
    const ts = nowISO();
    const elapsed = Math.round((Date.now() - lastSocialFlush) / 1000);

    for (const [key, members] of squadMemberships) {
      if (members.size < 2) continue;
      const [teamID, squadID] = key.split(':');
      const sq = getSquadByID(state, squadID, teamID);
      const squadName = sq?.squadName || '';
      const arr = [...members.values()];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          appendCsv(file('social'), H.social, [
            ts,
            serverId,
            map,
            layer,
            arr[i].steamID,
            arr[i].name,
            arr[j].steamID,
            arr[j].name,
            'squad_mate',
            squadID,
            squadName,
            teamID,
            elapsed,
          ]);
        }
      }
    }
    lastSocialFlush = Date.now();
  }

  function onTickRate(data: TTickRate) {
    const { map, layer } = mapInfo();
    appendCsv(file('tickrate'), H.tickrate, [
      nowISO(),
      serverId,
      data.tickRate,
      map,
      layer,
      state.players?.length || 0,
    ]);
  }

  function onNewGame(data: TNewGame) {
    matchIsEnded = false;
    setTimeout(() => {
      const { map, layer } = mapInfo();
      incidents.setContext({
        serverId: id,
        server: serverId,
        layer,
        level: state.currentMap?.level ?? null,
      });
      appendCsv(file('matches'), H.matches, [
        nowISO(),
        serverId,
        'match_start',
        map,
        layer,
        data.layerClassname || '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        state.players?.length || 0,
      ]);
    }, 5000);
    resetMatchState();
  }

  function onRoundTickets(data: TRoundTickets) {
    const { team, action } = data;
    const extra = data as Record<string, unknown>;
    if (action === 'won') winner = team;
    matchTickets.push({
      team,
      action,
      subfaction: extra.subfaction as string | undefined,
      faction: extra.faction as string | undefined,
      tickets: extra.tickets as number | undefined,
    });
  }

  function onRoundEnded() {
    matchIsEnded = true;
    const { map, layer } = mapInfo();
    const durationMin = Math.round((Date.now() - matchStartTime) / 60000);
    const t1 = matchTickets.find((t) => t.team === '1');
    const t2 = matchTickets.find((t) => t.team === '2');

    appendCsv(file('matches'), H.matches, [
      nowISO(),
      serverId,
      'match_end',
      map,
      layer,
      state.currentMap?.level || '',
      t1?.faction || t1?.subfaction || '',
      t1?.subfaction || '',
      t1?.tickets ?? '',
      t2?.faction || t2?.subfaction || '',
      t2?.subfaction || '',
      t2?.tickets ?? '',
      winner,
      durationMin,
      state.players?.length || 0,
    ]);

    writeSquadScoresSnapshot();
    writeSquadCompositionSnapshot('match_end');
    flushSocialLinks();
    incidents.onRoundEnd();
  }

  function onPlayerConnected(data: TPlayerConnected) {
    const { map, layer } = mapInfo();
    const player = getPlayerBySteamID(state, data.steamID);
    const p = pi(player);
    const ip = getPlayerIP(data.steamID);

    activeSessions.set(data.steamID, {
      name: p.name,
      steamID: data.steamID,
      eosID: data.eosID || p.eosid,
      joinTime: Date.now(),
      map,
      layer,
    });

    appendCsv(file('players'), H.players, [
      nowISO(),
      serverId,
      map,
      layer,
      'connected',
      p.name,
      data.steamID,
      p.eosid || data.eosID,
      p.team,
      p.squadID,
      p.squadName,
      p.role,
      p.isLeader,
      ip,
      '',
    ]);

    appendCsv(file('player_sessions'), H.player_sessions, [
      nowISO(),
      serverId,
      'join',
      p.name,
      data.steamID,
      p.eosid || data.eosID,
      ip,
      '',
      map,
      layer,
    ]);
  }

  function onPlayerDisconnected(data: TPlayerDisconnected) {
    const { map, layer } = mapInfo();
    const player = getPlayerByEOSID(state, data.eosID);
    const p = pi(player);
    const session = activeSessions.get(p.steam);
    const duration = session
      ? Math.round((Date.now() - session.joinTime) / 1000)
      : 0;
    const ip = getPlayerIP(p.steam);
    if (p.steam) activeSessions.delete(p.steam);

    appendCsv(file('players'), H.players, [
      nowISO(),
      serverId,
      map,
      layer,
      'disconnected',
      p.name,
      p.steam,
      p.eosid || data.eosID,
      p.team,
      p.squadID,
      p.squadName,
      p.role,
      p.isLeader,
      ip,
      `session_sec=${duration}`,
    ]);

    appendCsv(file('player_sessions'), H.player_sessions, [
      nowISO(),
      serverId,
      'leave',
      p.name,
      p.steam,
      p.eosid || data.eosID,
      ip,
      duration,
      map,
      layer,
    ]);
  }

  function onPlayerWounded(data: TPlayerWounded) {
    if (matchIsEnded) return;
    const { map, layer } = mapInfo();
    const { attackerEOSID, victimName, damage } = data;
    const dExtra = data as Record<string, unknown>;
    const weapon = (dExtra.weapon as string) || '';

    if (victimName && weapon) {
      lastDamageWeapon.set(victimName, weapon);
    }
    const victim = getPlayerByName(state, victimName);
    const attacker = getPlayerByEOSID(state, attackerEOSID);
    const ap = pi(attacker);
    const vp = pi(victim);
    const isTK = !!(
      attacker &&
      victim &&
      attacker.teamID === victim.teamID &&
      attacker.name !== victim.name
    );

    appendCsv(file('wounds'), H.wounds, [
      nowISO(),
      serverId,
      map,
      layer,
      ap.name,
      ap.steam,
      ap.eosid,
      ap.team,
      ap.squadID,
      ap.squadName,
      vp.name,
      vp.steam,
      vp.eosid,
      vp.team,
      vp.squadID,
      vp.squadName,
      damage,
      weapon,
      isTK,
    ]);

    if (isTK && attacker) {
      appendCsv(file('teamkills'), H.teamkills, [
        nowISO(),
        serverId,
        map,
        layer,
        ap.name,
        ap.steam,
        ap.eosid,
        ap.team,
        ap.squadID,
        ap.squadName,
        vp.name,
        vp.steam,
        vp.eosid,
        vp.team,
        vp.squadID,
        vp.squadName,
        damage,
        weapon,
      ]);
    }

    /* Тейкдаун считаем здесь — в момент ранения (реальный темп «уронил»).
       die того же игрока не двоим (см. pendingWound в onPlayerDied). */
    const killerSteam = ap.steam;
    if (killerSteam) {
      const hs =
        !headshotBlacklistRe.test(weapon) &&
        Number(damage) >= HEADSHOT_DAMAGE_MIN &&
        !isTK;
      incidents.onKill({
        ts: Date.now(),
        attacker: {
          steamID: killerSteam,
          name: ap.name,
          eosID: ap.eosid,
          teamID: ap.team,
        },
        victimName: vp.name,
        victimSteamID: vp.steam || undefined,
        victimTeamID: vp.team || undefined,
        weapon,
        damage: Number(damage) || undefined,
        hs,
      });
    }
    if (victimName) pendingWound.add(victimName);
  }

  function onPlayerDamaged(data: TPlayerDamaged) {
    if (matchIsEnded) return;
    const { map, layer } = mapInfo();
    const { attackerEOSID, victimName, damage } = data;
    const dExtra = data as Record<string, unknown>;
    const weapon = (dExtra.weapon as string) || '';
    const victim = getPlayerByName(state, victimName);
    const attacker = getPlayerByEOSID(state, attackerEOSID);
    const ap = pi(attacker);
    const vp = pi(victim);

    if (victimName && weapon) {
      lastDamageWeapon.set(victimName, weapon);
    }

    if (victimName && attacker) {
      lastDamageAttacker.set(victimName, { ...attacker });
    }

    appendCsv(file('damage_dealt'), H.damage_dealt, [
      nowISO(),
      serverId,
      map,
      layer,
      ap.name,
      ap.steam,
      ap.eosid,
      ap.team,
      ap.squadID,
      vp.name,
      vp.steam,
      vp.eosid,
      vp.team,
      vp.squadID,
      damage,
      weapon,
    ]);
  }

  function onPlayerDied(data: TPlayerDied) {
    if (matchIsEnded) return;
    const { map, layer } = mapInfo();
    const { attackerEOSID, victimName, damage, attackerSteamID } = data;
    const dExtra = data as Record<string, unknown>;
    const dieWeapon = (dExtra.weapon as string) || '';

    const weapon = lastDamageWeapon.get(victimName) || dieWeapon;
    lastDamageWeapon.delete(victimName);
    const victim = getPlayerByName(state, victimName);

    const attacker =
      getPlayerByEOSID(state, attackerEOSID) ||
      lastDamageAttacker.get(victimName) ||
      null;
    lastDamageAttacker.delete(victimName);
    const ap = pi(attacker);
    const vp = pi(victim);
    const isTK = !!(
      attacker &&
      victim &&
      attacker.teamID === victim.teamID &&
      attacker.name !== victim.name
    );
    const hs =
      !headshotBlacklistRe.test(weapon) &&
      Number(damage) >= HEADSHOT_DAMAGE_MIN &&
      !isTK;

    appendCsv(file('kills'), H.kills, [
      nowISO(),
      serverId,
      map,
      layer,
      ap.name,
      ap.steam || attackerSteamID || '',
      ap.eosid,
      ap.team,
      ap.squadID,
      ap.squadName,
      ap.role,
      weapon,
      ap.possess,
      vp.name,
      vp.steam,
      vp.eosid,
      vp.team,
      vp.squadID,
      vp.squadName,
      vp.role,
      vp.weapon,
      vp.possess,
      damage,
      isTK,
      hs,
    ]);

    /* Тейкдаун уже посчитан на PLAYER_WOUNDED. Здесь считаем только добивание:
       жертва без «висящего» ранения — её воскресили и добили либо она умерла
       сразу без wound. Иначе wound→die одного игрока дал бы двойной счёт. */
    const killerSteam = ap.steam || attackerSteamID || '';
    if (killerSteam && !pendingWound.has(victimName)) {
      incidents.onKill({
        ts: Date.now(),
        attacker: {
          steamID: killerSteam,
          name: ap.name,
          eosID: ap.eosid,
          teamID: ap.team,
        },
        victimName: vp.name,
        victimSteamID: vp.steam || undefined,
        victimTeamID: vp.team || undefined,
        weapon,
        damage: Number(damage) || undefined,
        hs,
      });
    }
    pendingWound.delete(victimName);

    if (attacker && !isTK) {
      const aS = getOrCreateSquadScore(attacker.teamID, attacker.squadID);
      if (aS) {
        aS.kills++;
        aS.players.add(attacker.steamID);
      }
    }
    if (attacker && isTK) {
      const aS = getOrCreateSquadScore(attacker.teamID, attacker.squadID);
      if (aS) aS.teamkills++;
    }
    if (victim) {
      const vS = getOrCreateSquadScore(victim.teamID, victim.squadID);
      if (vS) {
        vS.deaths++;
        vS.players.add(victim.steamID);
      }
    }
  }

  function onPlayerRevived(data: TPlayerRevived) {
    if (matchIsEnded) return;
    const { map, layer } = mapInfo();
    const reviver = getPlayerByEOSID(state, data.reviverEOSID);
    const victim = getPlayerByEOSID(state, data.victimEOSID);
    const rp = pi(reviver);
    const vp = pi(victim);

    if (data.victimName) {
      lastDamageWeapon.delete(data.victimName);
      lastDamageAttacker.delete(data.victimName);
      /* Воскрешён — снимаем флаг: добивание после подъёма придёт как die
         без wound и будет засчитано как отдельный тейкдаун. */
      pendingWound.delete(data.victimName);
    }

    appendCsv(file('revives'), H.revives, [
      nowISO(),
      serverId,
      map,
      layer,
      rp.name,
      rp.steam,
      rp.eosid,
      rp.team,
      rp.squadID,
      rp.squadName,
      rp.role,
      vp.name,
      vp.steam,
      vp.eosid,
      vp.team,
      vp.squadID,
      vp.squadName,
    ]);

    if (reviver) {
      const rS = getOrCreateSquadScore(reviver.teamID, reviver.squadID);
      if (rS) {
        rS.revives++;
        rS.players.add(reviver.steamID);
      }
    }
  }

  function onPlayerSuicide(data: TPlayerSuicide) {
    if (matchIsEnded) return;
    const { map, layer } = mapInfo();
    const player = getPlayerByName(state, data.name);
    const p = pi(player);

    appendCsv(file('events'), H.events, [
      nowISO(),
      serverId,
      map,
      layer,
      'suicide',
      p.name || data.name,
      p.steam,
      p.eosid,
      p.team,
      '',
    ]);

    if (player) {
      const s = getOrCreateSquadScore(player.teamID, player.squadID);
      if (s) {
        s.deaths++;
        s.players.add(player.steamID);
      }
    }
  }

  function onRoleChanged(data: TPlayerRoleChanged) {
    if (matchIsEnded) return;
    const { map, layer } = mapInfo();
    const { player, oldRole, newRole, isLeader } = data;
    const p = pi(player);
    appendCsv(file('roles'), H.roles, [
      nowISO(),
      serverId,
      map,
      layer,
      p.name,
      p.steam,
      p.eosid,
      p.team,
      p.squadID,
      oldRole,
      newRole,
      isLeader,
    ]);
  }

  function onPlayerPossess(data: TPlayerPossess) {
    if (matchIsEnded) return;
    const { map, layer } = mapInfo();
    const player = getPlayerByEOSID(state, data.eosID);
    const p = pi(player);
    const possessType = classifyPossess(data.possessClassname || '');
    appendCsv(file('possessions'), H.possessions, [
      nowISO(),
      serverId,
      map,
      layer,
      p.name,
      p.steam,
      p.eosid,
      p.team,
      p.squadID,
      data.possessClassname || '',
      possessType,
    ]);
  }

  function onVehicleDamaged(data: TVehicleDamaged) {
    if (matchIsEnded) return;
    const { map, layer } = mapInfo();
    const {
      damage,
      attackerName,
      victimVehicle,
      attackerVehicle,
      healthRemaining,
    } = data;
    const dExtra = data as Record<string, unknown>;
    const player = getPlayerByName(state, attackerName);
    const p = pi(player);
    appendCsv(file('vehicles'), H.vehicles, [
      nowISO(),
      serverId,
      map,
      layer,
      p.name || attackerName,
      p.steam,
      p.eosid,
      p.team,
      victimVehicle,
      damage,
      (dExtra.damageType as string) || '',
      attackerVehicle,
      healthRemaining,
    ]);
  }

  function onFobPlaced(data: TFobPlaced) {
    if (data.isMain || !data.radioId) return;
    fobTeam.set(data.radioId, data.teamID);
  }

  function onDeployableDamaged(data: TDeployableDamaged) {
    if (matchIsEnded) return;
    const { map, layer } = mapInfo();
    const { deployable, damage, weapon, name, steamID, eosID } = data;
    const player = getPlayer(state, { steamID, eosID, name });
    const p = pi(player);
    const deployableType = classifyDeployable(deployable);

    const radioId = deployable.match(/_C_(\d+)/)?.[1] ?? '';
    let isFriendly: boolean;
    if (/FOBRadio/i.test(deployable) && radioId && fobTeam.has(radioId)) {
      isFriendly =
        /_Deployable_/i.test(weapon) && fobTeam.get(radioId) === p.team;
    } else {
      isFriendly = isFriendlyDeployable(weapon, deployable);
    }

    appendCsv(file('deployables'), H.deployables, [
      nowISO(),
      serverId,
      map,
      layer,
      p.name || name,
      p.steam,
      p.eosid,
      p.team,
      p.squadID,
      deployable,
      deployableType,
      damage,
      weapon,
      isFriendly,
    ]);

    const isOwnFobByExplosive =
      /FOBRadio/i.test(deployable) &&
      !!radioId &&
      fobTeam.get(radioId) === p.team &&
      /_Deployable_/i.test(weapon);
    if (isOwnFobByExplosive && p.steam) {
      incidents.onFobGrief(
        {
          steamID: p.steam,
          name: p.name || name,
          eosID: p.eosid,
          teamID: p.team,
        },
        Date.now(),
        { weapon, damage: Number(damage) || 0 },
      );
    }
  }

  function onExplosiveDamaged(data: TApplyExplosiveDamage) {
    if (matchIsEnded) return;
    const { map, layer } = mapInfo();
    const dAny = data as Record<string, unknown>;
    const pc = (dAny.playerController as string) || '';
    const player = getPlayerByController(state, pc);
    const p = pi(player);
    appendCsv(file('explosives'), H.explosives, [
      nowISO(),
      serverId,
      map,
      layer,
      p.name,
      p.steam,
      p.eosid,
      p.team,
      p.squadID,
      pc,
      dAny.deployable || '',
      String(dAny.locations || ''),
    ]);
  }

  function onGrenadeSpawned(data: TGrenadeSpawned) {
    if (matchIsEnded) return;
    const { map, layer } = mapInfo();
    const dAny = data as Record<string, unknown>;
    const instigator = String(dAny.instigator || '');
    const player = getPlayerByPossess(state, instigator);
    const p = pi(player);
    appendCsv(file('grenades'), H.grenades, [
      nowISO(),
      serverId,
      map,
      layer,
      p.name,
      p.steam,
      p.eosid,
      p.team,
      p.squadID,
      instigator,
      String(dAny.location || ''),
    ]);
  }

  function onChatMessage(data: TChatMessage) {
    if (matchIsEnded) return;
    const { map, layer } = mapInfo();
    const { name, message, chat } = data;
    const player = getPlayerByName(state, name);
    const p = pi(player);
    appendCsv(file('chat'), H.chat, [
      nowISO(),
      serverId,
      map,
      layer,
      p.name || name,
      p.steam,
      p.eosid,
      p.team,
      p.squadID,
      p.squadName,
      p.role,
      chat,
      message,
    ]);
  }

  function onSquadCreated(data: TSquadCreated) {
    if (matchIsEnded) return;
    const { map, layer } = mapInfo();
    const { squadName, eosID } = data;
    const dExtra = data as Record<string, unknown>;
    const player = getPlayerByEOSID(state, eosID);
    const p = pi(player);
    appendCsv(file('events'), H.events, [
      nowISO(),
      serverId,
      map,
      layer,
      'squad_created',
      p.name,
      p.steam,
      p.eosid || eosID,
      p.team,
      `squad_name=${squadName}|squad_id=${(dExtra.squadID as string) || ''}`,
    ]);
  }

  function onAdminCamEntry(data: TPossessedAdminCamera) {
    const { map, layer } = mapInfo();
    appendCsv(file('events'), H.events, [
      nowISO(),
      serverId,
      map,
      layer,
      'admin_cam_enter',
      data.name,
      '',
      '',
      '',
      '',
    ]);
  }

  function onAdminCamExit(data: TUnPossessedAdminCamera) {
    const { map, layer } = mapInfo();
    appendCsv(file('events'), H.events, [
      nowISO(),
      serverId,
      map,
      layer,
      'admin_cam_exit',
      data.name,
      '',
      '',
      '',
      '',
    ]);
  }

  function onPlayerTeamChanged(data: TPlayerTeamChanged) {
    if (matchIsEnded) return;
    const { map, layer } = mapInfo();
    const { player, oldTeamID, newTeamID } = data;
    const p = pi(player);
    appendCsv(file('players'), H.players, [
      nowISO(),
      serverId,
      map,
      layer,
      'team_changed',
      p.name,
      p.steam,
      p.eosid,
      p.team,
      p.squadID,
      p.squadName,
      p.role,
      p.isLeader,
      getPlayerIP(p.steam),
      `old_team=${oldTeamID}|new_team=${newTeamID}`,
    ]);
  }

  function onPlayerSquadChanged(data: TPlayerSquadChanged) {
    if (matchIsEnded) return;
    const { map, layer } = mapInfo();
    const { player, oldSquadID, newSquadID } = data;
    const p = pi(player);
    appendCsv(file('players'), H.players, [
      nowISO(),
      serverId,
      map,
      layer,
      'squad_changed',
      p.name,
      p.steam,
      p.eosid,
      p.team,
      p.squadID,
      p.squadName,
      p.role,
      p.isLeader,
      getPlayerIP(p.steam),
      `old_squad=${oldSquadID || ''}|new_squad=${newSquadID || ''}`,
    ]);
  }

  function onPlayerLeaderChanged(data: TPlayerLeaderChanged) {
    if (matchIsEnded) return;
    const { map, layer } = mapInfo();
    const { player, isLeader } = data;
    const p = pi(player);
    appendCsv(file('events'), H.events, [
      nowISO(),
      serverId,
      map,
      layer,
      'leader_changed',
      p.name,
      p.steam,
      p.eosid,
      p.team,
      `squad_id=${p.squadID}|squad_name=${p.squadName}|is_leader=${isLeader}`,
    ]);
  }

  function onUpdatedPlayers() {
    const { players } = state;
    if (!players) return;
    for (const p of players) {
      if (p.squadID && p.teamID) trackSquadMembership(p);
    }
  }

  function writeSquadCompositionSnapshot(snapshotType: string) {
    const { map, layer } = mapInfo();
    const ts = nowISO();
    const squads = state.squads;
    const players = state.players;
    if (!squads || !players) return;

    for (const squad of squads) {
      const members = players
        .filter((p) => p.squadID === squad.squadID && p.teamID === squad.teamID)
        .map((p) => {
          const ip = getPlayerIP(p.steamID);
          return `${p.name}(${p.steamID}|${p.eosID}|${p.role}${p.isLeader ? '|SL' : ''}${ip ? '|' + ip : ''})`;
        })
        .join(';');

      appendCsv(file('squads'), H.squads, [
        ts,
        serverId,
        map,
        layer,
        snapshotType,
        squad.teamID,
        squad.teamName,
        squad.squadID,
        squad.squadName,
        squad.size,
        squad.locked,
        squad.creatorName,
        squad.creatorSteamID,
        squad.creatorEOSID,
        members,
      ]);
    }
  }

  function writeSquadScoresSnapshot() {
    const { map, layer } = mapInfo();
    const ts = nowISO();
    for (const [, score] of squadScores) {
      appendCsv(file('squad_scores'), H.squad_scores, [
        ts,
        serverId,
        map,
        layer,
        score.teamID,
        score.teamName,
        score.squadID,
        score.squadName,
        score.kills,
        score.deaths,
        score.revives,
        score.teamkills,
        score.players.size,
      ]);
    }
  }

  setInterval(() => {
    if (matchIsEnded) return;
    if (!state.players || state.players.length === 0) return;
    writeSquadCompositionSnapshot('periodic');
    writeSquadScoresSnapshot();
    if (Date.now() - lastSocialFlush >= 300000) flushSocialLinks();
  }, snapshotIntervalMs);

  setInterval(() => {
    (async () => {
      try {
        const cutoff = Date.now() - retentionDays * 86400000;
        const entries = await fs.readdir(srvDir, { withFileTypes: true });
        let deleted = 0;
        for (const ent of entries) {
          if (!ent.isFile() || !ent.name.endsWith('.csv')) continue;
          const dm = ent.name.match(/^(\d{4}-\d{2}-\d{2})/);
          if (dm && new Date(dm[1]).getTime() < cutoff) {
            await fs.unlink(path.join(srvDir, ent.name));
            deleted++;
          }
        }
        if (deleted > 0)
          logger.log(`[rnsTelemetry] Cleanup: deleted ${deleted} old files`);
      } catch {
        logger.error('[rnsTelemetry] Cleanup error');
      }
    })();
  }, cleanupIntervalMs);

  function onPlayerRespawnInc(data: TPlayerRespawn) {
    if (matchIsEnded) return;
    const player = getPlayerByController(state, data.playerController);
    if (!player?.steamID) return;
    const hab = /ForwardBase|Hab|FOB/i.test(data.spawn || '');
    incidents.onRespawn(player.steamID, Date.now(), hab);
  }

  listener.on(EVENTS.TICK_RATE, onTickRate);
  listener.on(EVENTS.PLAYER_RESPAWN, onPlayerRespawnInc);
  listener.on(EVENTS.NEW_GAME, onNewGame);
  listener.on(EVENTS.ROUND_TICKETS, onRoundTickets);
  listener.on(EVENTS.ROUND_ENDED, onRoundEnded);
  listener.on(EVENTS.PLAYER_CONNECTED, onPlayerConnected);
  listener.on(EVENTS.PLAYER_DISCONNECTED, onPlayerDisconnected);
  listener.on(EVENTS.PLAYER_WOUNDED, onPlayerWounded);
  listener.on(EVENTS.PLAYER_DAMAGED, onPlayerDamaged);
  listener.on(EVENTS.PLAYER_DIED, onPlayerDied);
  listener.on(EVENTS.PLAYER_REVIVED, onPlayerRevived);
  listener.on(EVENTS.PLAYER_SUICIDE, onPlayerSuicide);
  listener.on(EVENTS.PLAYER_ROLE_CHANGED, onRoleChanged);
  listener.on(EVENTS.PLAYER_POSSESS, onPlayerPossess);
  listener.on(EVENTS.VEHICLE_DAMAGED, onVehicleDamaged);
  listener.on(EVENTS.FOB_PLACED, onFobPlaced);
  listener.on(EVENTS.DEPLOYABLE_DAMAGED, onDeployableDamaged);
  listener.on(EVENTS.EXPLOSIVE_DAMAGED, onExplosiveDamaged);
  listener.on(EVENTS.GRENADE_SPAWNED, onGrenadeSpawned);
  listener.on(EVENTS.CHAT_MESSAGE, onChatMessage);
  listener.on(EVENTS.SQUAD_CREATED, onSquadCreated);
  listener.on(EVENTS.POSSESSED_ADMIN_CAMERA, onAdminCamEntry);
  listener.on(EVENTS.UNPOSSESSED_ADMIN_CAMERA, onAdminCamExit);
  listener.on(EVENTS.PLAYER_TEAM_CHANGED, onPlayerTeamChanged);
  listener.on(EVENTS.PLAYER_SQUAD_CHANGED, onPlayerSquadChanged);
  listener.on(EVENTS.PLAYER_LEADER_CHANGED, onPlayerLeaderChanged);
  listener.on(EVENTS.UPDATED_PLAYERS, onUpdatedPlayers);

  logger.log(
    '[rnsTelemetry] v2 initialized — 21 CSV + raw log parser, anti-cheat, social tracking',
  );
};
