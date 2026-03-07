// src/plugins/rnsTelemetryLogParser.ts
// ─────────────────────────────────────────────────────────────────────────
// Raw Log Parser — дополнение к rnsTelemetry
//
// Парсит raw SquadGame.log для данных, которые НЕ приходят через
// squad-logs события:
//   - IP-адреса игроков (PostLogin)
//   - Вход/выход из техники с номером сиденья (Seat Number)
//   - Создание FOB с координатами
//   - Создание Rally Point с координатами
//   - Респавн: тип спавна (HAB/Rally/Main) + роль
//   - Результат матча: полные названия фракций + тикеты
//   - EAC античит события (ClientActionRequired)
//   - Смена состояния игрока (Inactive/Spectating/Playing)
//   - Админ-кик/бан с EOS ID
//   - Автобан за тимкил
//   - Set next layer с фракциями
//
// Использование: вызывается из rnsTelemetry через initLogParser()
// ─────────────────────────────────────────────────────────────────────────

import { closeSync, existsSync, openSync, readSync, statSync } from 'fs';

// Функции appendCsv и esc импортируются / передаются из основного модуля
type AppendFn = (filePath: string, header: string, cols: unknown[]) => void;
type FileFn = (type: string) => string;

// ═══════════════════════════════════════════════════════════════════
// CSV headers для raw-log-only данных
// ═══════════════════════════════════════════════════════════════════

export const RAW_HEADERS = {
  player_ips:
    'timestamp,server_id,player_name,player_steam,player_eosid,player_controller,ip,map',

  vehicle_usage:
    'timestamp,server_id,event,player_name,player_steam,player_eosid,' +
    'vehicle_asset,vehicle_type,seat_number,map',

  fobs: 'timestamp,server_id,event,team_id,pos_x,pos_y,pos_z,map',

  rallies: 'timestamp,server_id,event,team_id,pos_x,pos_y,pos_z,map',

  spawns:
    'timestamp,server_id,player_name,spawn_point,spawn_type,deploy_role,faction_prefix,map',

  match_results:
    'timestamp,server_id,team_id,faction,result,tickets,layer,level',

  eac_events:
    'timestamp,server_id,event,client_handle,action,reason_code,details',

  player_states:
    'timestamp,server_id,player_name,player_steam,player_eosid,old_state,new_state',

  admin_actions:
    'timestamp,server_id,action,player_name,player_steam,player_eosid,details',

  next_layers:
    'timestamp,server_id,layer,team1_faction,team1_unit_type,team2_faction,team2_unit_type',
};

// ═══════════════════════════════════════════════════════════════════
// Regex patterns
// ═══════════════════════════════════════════════════════════════════

const RE_TS = /\[(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):(\d{3})\]/;

// PostLogin: IP + EOS + Steam
const RE_POSTLOGIN =
  /PostLogin:.*?BP_PlayerController_C\s+\S+\s+\(IP:\s*([\d.]+)\s*\|\s*Online IDs:\s*EOS:\s*(\w+)\s+steam:\s*(\d+)\)/;

// Vehicle Enter with Seat Number
const RE_VEH_ENTER =
  /OnPossess\(\):\s*PC=(.+?)\s+\(Online IDs:\s*EOS:\s*(\w+)\s+steam:\s*(\d+)\)\s*Entered Vehicle\s+Pawn=\S+\s+\(Asset Name\s*=\s*([^)]+)\).*?Seat Number=(\d+)/;

// Vehicle Exit with Seat Number
const RE_VEH_EXIT =
  /OnUnPossess\(\):\s*PC=(.+?)\s+\(Online IDs:\s*EOS:\s*(\w+)\s+steam:\s*(\d+)\)\s*Exited Vehicle\s+Pawn=\S+\s+\(Asset Name\s*=\s*([^)]+)\).*?Seat Number=(\d+)/;

// FOB created
const RE_FOB_CREATED =
  /SQForwardBase for team (\d+) created at X=([\d.-]+) Y=([\d.-]+) Z=([\d.-]+)/;

// Rally Point created
const RE_RALLY_CREATED =
  /SQGameRallyPoint\s+\S+\s+for team (\d+) at X=([\d.-]+) Y=([\d.-]+) Z=([\d.-]+) created/;

// RestartPlayer (spawn)
const RE_SPAWN =
  /RestartPlayer\(\):\s*On Server PC=(.+?)\s+Spawn=(\S+)\s+DeployRole=(\S+)/;

// Match Result
const RE_MATCH_RESULT =
  /LogSquadGameEvents.*Team\s+(\d+),\s*(.+?)\s+\(\s*(.+?)\s*\)\s+has\s+(won|lost)\s+the match with\s+(\d+)\s+Tickets on layer\s+(.+?)\s+\(level\s+(.+?)\)/;

// EAC ClientActionRequired
const RE_EAC =
  /\[ClientActionRequired\]\s*Client:\s*(\S+)\s+Action:\s*(\d+)\s+ActionReason:\s*(\d+)\s+Details:\s*(.+)/;

// ChangeState
const RE_CHANGE_STATE =
  /ChangeState\(\):\s*PC=(.+?)\s+\(Online IDs:\s*EOS:\s*(\w+)\s+steam:\s*(\d+)\)\s+OldState=(\w+)\s+NewState=(\w+)/;

// Admin Kick (with EOS + Steam)
const RE_KICK =
  /ADMIN COMMAND:\s*Kicked player\s+\d+\.\s*\[Online IDs=\s*EOS:\s*(\w+)\s+steam:\s*(\d+)\]\s*(.+?)\s+from\s+RCON/;

// Admin Force Team Change
const RE_TEAMCHANGE =
  /ADMIN COMMAND:\s*Forced team change for player\s+\d+\.\s*\[Online IDs=\s*EOS:\s*(\w+)\s+steam:\s*(\d+)\]\s*(.+?)\s+from\s+RCON/;

// Admin Disband
const RE_DISBAND =
  /ADMIN COMMAND:\s*Remote admin disbanded squad\s+(\d+)\s+on team\s+(\d+),\s*named "(.+?)"/;

// TK Auto-Ban
const RE_TK_BAN = /Banning player:\s*(.+?)\s*;\s*Reason\s*=\s*(.+)/;

// Set next layer
const RE_SET_LAYER =
  /ADMIN COMMAND:\s*Set next layer to\s+(\S+)\s+(\w+)\+(\w+)\s+(\w+)\+(\w+)/;

// Change layer
const RE_CHANGE_LAYER =
  /ADMIN COMMAND:\s*Change layer to\s+(\S+)\s+(\w+)\s+(\w+)/;

// Admin Warn
const RE_WARN =
  /ADMIN COMMAND:\s*Remote admin has warned player\s+(.+?)\.\s*Message was "(.+?)"\s*from/;

// Admin Broadcast
const RE_BROADCAST = /ADMIN COMMAND:\s*Message broadcasted\s*<(.+?)>\s*from/;

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function parseTs(line: string): string | null {
  const m = line.match(RE_TS);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z` : null;
}

function cleanAssetName(raw: string): string {
  return (raw || '')
    .trim()
    .replace(/^BP_/, '')
    .replace(/_C_\d+$/, '')
    .replace(/_C$/, '')
    .replace(/_/g, ' ')
    .trim();
}

function classifyVehicle(raw: string): string {
  const lc = (raw || '').toLowerCase();
  if (lc.includes('logi')) return 'logi';
  if (lc.includes('transport') || lc.includes('util')) return 'transport';
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
    lc.includes('btr') ||
    lc.includes('stryker') ||
    lc.includes('warrior') ||
    lc.includes('m113') ||
    lc.includes('bmp') ||
    lc.includes('lav') ||
    lc.includes('mt-lb') ||
    lc.includes('zbd') ||
    lc.includes('zsl') ||
    lc.includes('brdm')
  )
    return 'apc_ifv';
  if (
    lc.includes('mrap') ||
    lc.includes('matv') ||
    lc.includes('tigr') ||
    lc.includes('cpv')
  )
    return 'mrap';
  if (lc.includes('technical') || lc.includes('ural') || lc.includes('truck'))
    return 'truck';
  return 'other';
}

const FACTION_ABBR: Record<string, string> = {
  'Russian Ground Forces': 'RGF',
  'Russian Airborne Forces': 'VDV',
  'United States Army': 'USA',
  'United States Marine Corps': 'USMC',
  'British Armed Forces': 'BAF',
  'Canadian Armed Forces': 'CAF',
  'Australian Defence Force': 'ADF',
  "People's Liberation Army": 'PLA',
  'PLA Navy Marine Corps': 'PLANMC',
  'Armed Forces of Ukraine': 'AFU',
  'Turkish Land Forces': 'TLF',
  'Ground Forces of Iran': 'GFI',
  'Irregular Militia Forces': 'IMF',
  'Insurgent Forces': 'INS',
  'Middle Eastern Alliance': 'MEA',
  'Western Private Military Contractors': 'WPMC',
};

function factionAbbr(fullName: string): string {
  return FACTION_ABBR[fullName.trim()] || fullName.trim();
}

function classifySpawn(sp: string): string {
  if (!sp || sp === 'nullptr') return 'main';
  if (sp.includes('ForwardBaseSpawn') || sp.includes('HAB')) return 'hab';
  if (sp.includes('RallyPoint')) return 'rally';
  if (sp.includes('SpawnGroup') || sp.includes('Team') || sp.includes('Main'))
    return 'main';
  return 'other';
}

function extractFactionPrefix(role: string): string {
  // RGF_LAT_01 → RGF, USMC_Rifleman_01 → USMC, etc
  const m = (role || '').match(/^([A-Z]+)_/);
  return m ? m[1] : '';
}

// ═══════════════════════════════════════════════════════════════════
// Parser class
// ═══════════════════════════════════════════════════════════════════

export interface LogParserOptions {
  logFilePath: string;
  serverId: string;
  appendCsv: AppendFn;
  file: FileFn;
  playerIPs: Map<string, string>;
  currentMap: () => string;
  logger: {
    log: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}

export class RawLogParser {
  private offset = 0;
  private logFile = '';
  private opts: LogParserOptions;

  constructor(opts: LogParserOptions) {
    this.opts = opts;
  }

  /** Call periodically (e.g. every 30-60 seconds) */
  parse(): void {
    try {
      const logPath = this.opts.logFilePath;
      if (!logPath || !existsSync(logPath)) return;

      if (this.logFile !== logPath) {
        this.offset = 0;
        this.logFile = logPath;
      }

      const stat = statSync(logPath);
      if (stat.size <= this.offset) return;

      // If file got smaller (rotated), reset
      if (stat.size < this.offset) {
        this.offset = 0;
      }

      const chunkSize = Math.min(stat.size - this.offset, 4 * 1024 * 1024);
      const buf = Buffer.alloc(chunkSize);
      const fd = openSync(logPath, 'r');
      readSync(fd, buf, 0, chunkSize, this.offset);
      closeSync(fd);
      this.offset += chunkSize;

      const lines = buf
        .toString('utf8')
        .split('\n')
        .filter((l) => l.length > 20);
      this.parseLines(lines);
    } catch (err) {
      // Silent — может быть недоступен лог
    }
  }

  private parseLines(lines: string[]): void {
    const { appendCsv, file, serverId, playerIPs, currentMap, logger } =
      this.opts;
    const map = currentMap();
    let m: RegExpMatchArray | null;

    for (const line of lines) {
      const ts = parseTs(line);
      if (!ts) continue;

      // ── PostLogin: IP ──
      if ((m = line.match(RE_POSTLOGIN))) {
        const ip = m[1];
        const eosID = m[2];
        const steamID = m[3];
        playerIPs.set(steamID, ip);

        // Извлекаем PlayerController из строки
        const pcMatch = line.match(/BP_PlayerController_C\s+(\S+)/);
        const pc = pcMatch ? pcMatch[1] : '';

        appendCsv(file('player_ips'), RAW_HEADERS.player_ips, [
          ts,
          serverId,
          '',
          steamID,
          eosID,
          pc,
          ip,
          map,
        ]);
        continue;
      }

      // ── Vehicle Enter ──
      if ((m = line.match(RE_VEH_ENTER))) {
        const playerName = m[1].trim();
        const eosID = m[2];
        const steamID = m[3];
        const asset = m[4].trim();
        const seat = m[5];
        const vehType = classifyVehicle(asset);

        appendCsv(file('vehicle_usage'), RAW_HEADERS.vehicle_usage, [
          ts,
          serverId,
          'enter',
          playerName,
          steamID,
          eosID,
          cleanAssetName(asset),
          vehType,
          seat,
          map,
        ]);
        continue;
      }

      // ── Vehicle Exit ──
      if ((m = line.match(RE_VEH_EXIT))) {
        const playerName = m[1].trim();
        const eosID = m[2];
        const steamID = m[3];
        const asset = m[4].trim();
        const seat = m[5];
        const vehType = classifyVehicle(asset);

        appendCsv(file('vehicle_usage'), RAW_HEADERS.vehicle_usage, [
          ts,
          serverId,
          'exit',
          playerName,
          steamID,
          eosID,
          cleanAssetName(asset),
          vehType,
          seat,
          map,
        ]);
        continue;
      }

      // ── FOB Created ──
      if ((m = line.match(RE_FOB_CREATED))) {
        appendCsv(file('fobs'), RAW_HEADERS.fobs, [
          ts,
          serverId,
          'fob_created',
          m[1],
          m[2],
          m[3],
          m[4],
          map,
        ]);
        continue;
      }

      // ── Rally Point Created ──
      if ((m = line.match(RE_RALLY_CREATED))) {
        appendCsv(file('rallies'), RAW_HEADERS.rallies, [
          ts,
          serverId,
          'rally_created',
          m[1],
          m[2],
          m[3],
          m[4],
          map,
        ]);
        continue;
      }

      // ── Spawn/Respawn ──
      if ((m = line.match(RE_SPAWN))) {
        const playerName = m[1].trim();
        const spawnPoint = m[2];
        const deployRole = m[3];
        const spawnType = classifySpawn(spawnPoint);
        const factionPrefix = extractFactionPrefix(deployRole);

        appendCsv(file('spawns'), RAW_HEADERS.spawns, [
          ts,
          serverId,
          playerName,
          spawnPoint,
          spawnType,
          deployRole,
          factionPrefix,
          map,
        ]);
        continue;
      }

      // ── Match Result ──
      if ((m = line.match(RE_MATCH_RESULT))) {
        appendCsv(file('match_results'), RAW_HEADERS.match_results, [
          ts,
          serverId,
          m[1],
          factionAbbr(m[3]),
          m[4],
          m[5],
          m[6].trim(),
          m[7].trim(),
        ]);
        continue;
      }

      // ── EAC Anti-Cheat Events ──
      if ((m = line.match(RE_EAC))) {
        appendCsv(file('eac_events'), RAW_HEADERS.eac_events, [
          ts,
          serverId,
          'action_required',
          m[1],
          m[2],
          m[3],
          m[4].trim(),
        ]);
        continue;
      }

      // ── Player State Change ──
      if ((m = line.match(RE_CHANGE_STATE))) {
        appendCsv(file('player_states'), RAW_HEADERS.player_states, [
          ts,
          serverId,
          m[1].trim(),
          m[3],
          m[2],
          m[4],
          m[5],
        ]);
        continue;
      }

      // ── Admin Kick (with EOS + Steam) ──
      if ((m = line.match(RE_KICK))) {
        appendCsv(file('admin_actions'), RAW_HEADERS.admin_actions, [
          ts,
          serverId,
          'kick',
          m[3].trim(),
          m[2],
          m[1],
          '',
        ]);
        continue;
      }

      // ── Admin Force Team Change ──
      if ((m = line.match(RE_TEAMCHANGE))) {
        appendCsv(file('admin_actions'), RAW_HEADERS.admin_actions, [
          ts,
          serverId,
          'force_team_change',
          m[3].trim(),
          m[2],
          m[1],
          '',
        ]);
        continue;
      }

      // ── Admin Disband Squad ──
      if ((m = line.match(RE_DISBAND))) {
        appendCsv(file('admin_actions'), RAW_HEADERS.admin_actions, [
          ts,
          serverId,
          'disband_squad',
          '',
          '',
          '',
          `squad=${m[1]},team=${m[2]},name=${m[3]}`,
        ]);
        continue;
      }

      // ── TK Auto-Ban ──
      if ((m = line.match(RE_TK_BAN))) {
        appendCsv(file('admin_actions'), RAW_HEADERS.admin_actions, [
          ts,
          serverId,
          'tk_autoban',
          m[1].trim(),
          '',
          '',
          m[2].trim(),
        ]);
        continue;
      }

      // ── Set next layer ──
      if ((m = line.match(RE_SET_LAYER))) {
        appendCsv(file('next_layers'), RAW_HEADERS.next_layers, [
          ts,
          serverId,
          m[1],
          m[2],
          m[3],
          m[4],
          m[5],
        ]);
        continue;
      }

      // ── Change layer ──
      if ((m = line.match(RE_CHANGE_LAYER))) {
        appendCsv(file('next_layers'), RAW_HEADERS.next_layers, [
          ts,
          serverId,
          m[1],
          m[2],
          '',
          m[3],
          '',
        ]);
        continue;
      }

      // ── Admin Warn ──
      if ((m = line.match(RE_WARN))) {
        appendCsv(file('admin_actions'), RAW_HEADERS.admin_actions, [
          ts,
          serverId,
          'warn',
          m[1].trim(),
          '',
          '',
          m[2],
        ]);
        continue;
      }

      // ── Admin Broadcast ──
      if ((m = line.match(RE_BROADCAST))) {
        appendCsv(file('admin_actions'), RAW_HEADERS.admin_actions, [
          ts,
          serverId,
          'broadcast',
          '',
          '',
          '',
          m[1],
        ]);
        continue;
      }
    }
  }
}
