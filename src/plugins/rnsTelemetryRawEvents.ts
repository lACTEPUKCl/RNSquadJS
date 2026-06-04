import {
  TAdminAction,
  TAdminBroadcast,
  TFobPlaced,
  TMatchResult,
  TNextLayerSet,
  TPlayerConnected,
  TPlayerRespawn,
  TPlayerStateChanged,
  TRallyPlaced,
  TVehicleSeatChange,
} from 'squad-logs';
import { EVENTS } from '../constants';

type AppendFn = (filePath: string, header: string, cols: unknown[]) => void;
type FileFn = (type: string) => string;
type Listener = { on<T>(event: string, cb: (data: T) => void): void };

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

function isoFromLogTime(t: string): string {
  const m = (t || '').match(
    /(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):(\d{3})/,
  );
  return m
    ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`
    : new Date().toISOString();
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
  return FACTION_ABBR[(fullName || '').trim()] || (fullName || '').trim();
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
  const m = (role || '').match(/^([A-Z]+)_/);
  return m ? m[1] : '';
}

const ADMIN_ACTION_CSV: Record<string, string> = {
  kick: 'kick',
  forceTeamChange: 'force_team_change',
  disband: 'disband_squad',
  warn: 'warn',
  autoBan: 'tk_autoban',
};

export function initTelemetryRawEvents(opts: {
  listener: Listener;
  appendCsv: AppendFn;
  file: FileFn;
  serverId: string;
  playerIPs: Map<string, string>;
  getMap: () => string;
}) {
  const { listener, appendCsv, file, serverId, playerIPs, getMap } = opts;

  listener.on(EVENTS.PLAYER_CONNECTED, (data: TPlayerConnected) => {
    if (data.ip && data.steamID) playerIPs.set(data.steamID, data.ip);
    appendCsv(file('player_ips'), RAW_HEADERS.player_ips, [
      isoFromLogTime(data.time),
      serverId,
      '',
      data.steamID,
      data.eosID,
      data.playerController || '',
      data.ip || '',
      getMap(),
    ]);
  });

  listener.on(EVENTS.VEHICLE_SEAT_CHANGE, (data: TVehicleSeatChange) => {
    appendCsv(file('vehicle_usage'), RAW_HEADERS.vehicle_usage, [
      isoFromLogTime(data.time),
      serverId,
      data.action,
      data.name,
      data.steamID,
      data.eosID,
      cleanAssetName(data.vehicle),
      classifyVehicle(data.vehicle),
      data.seatNumber,
      getMap(),
    ]);
  });

  listener.on(EVENTS.FOB_PLACED, (data: TFobPlaced) => {
    appendCsv(file('fobs'), RAW_HEADERS.fobs, [
      isoFromLogTime(data.time),
      serverId,
      'fob_created',
      data.teamID,
      data.x,
      data.y,
      data.z,
      getMap(),
    ]);
  });

  listener.on(EVENTS.RALLY_PLACED, (data: TRallyPlaced) => {
    appendCsv(file('rallies'), RAW_HEADERS.rallies, [
      isoFromLogTime(data.time),
      serverId,
      'rally_created',
      data.teamID,
      data.x,
      data.y,
      data.z,
      getMap(),
    ]);
  });

  listener.on(EVENTS.PLAYER_RESPAWN, (data: TPlayerRespawn) => {
    appendCsv(file('spawns'), RAW_HEADERS.spawns, [
      isoFromLogTime(data.time),
      serverId,
      (data.playerController || '').trim(),
      data.spawn,
      classifySpawn(data.spawn),
      data.role,
      extractFactionPrefix(data.role),
      getMap(),
    ]);
  });

  listener.on(EVENTS.MATCH_RESULT, (data: TMatchResult) => {
    appendCsv(file('match_results'), RAW_HEADERS.match_results, [
      isoFromLogTime(data.time),
      serverId,
      data.teamID,
      factionAbbr(data.subfaction),
      data.result,
      data.tickets,
      (data.layer || '').trim(),
      (data.level || '').trim(),
    ]);
  });

  listener.on(EVENTS.PLAYER_STATE_CHANGED, (data: TPlayerStateChanged) => {
    appendCsv(file('player_states'), RAW_HEADERS.player_states, [
      isoFromLogTime(data.time),
      serverId,
      (data.name || '').trim(),
      data.steamID,
      data.eosID,
      data.oldState,
      data.newState,
    ]);
  });

  listener.on(EVENTS.NEXT_LAYER_SET, (data: TNextLayerSet) => {
    appendCsv(file('next_layers'), RAW_HEADERS.next_layers, [
      isoFromLogTime(data.time),
      serverId,
      data.layer,
      data.team1Faction,
      data.team1Subfaction || '',
      data.team2Faction,
      data.team2Subfaction || '',
    ]);
  });

  listener.on(EVENTS.ADMIN_ACTION, (data: TAdminAction) => {
    let name = '';
    let steam = '';
    let eos = '';
    let details = '';

    if (data.action === 'kick' || data.action === 'forceTeamChange') {
      name = (data.name || '').trim();
      steam = data.steamID || '';
      eos = data.eosID || '';
    } else if (data.action === 'disband') {
      details = `squad=${data.squadID},team=${data.teamID},name=${data.squadName}`;
    } else if (data.action === 'warn') {
      name = (data.name || '').trim();
      details = data.message || '';
    } else if (data.action === 'autoBan') {
      name = (data.name || '').trim();
      details = (data.reason || '').trim();
    }

    appendCsv(file('admin_actions'), RAW_HEADERS.admin_actions, [
      isoFromLogTime(data.time),
      serverId,
      ADMIN_ACTION_CSV[data.action] || data.action,
      name,
      steam,
      eos,
      details,
    ]);
  });

  listener.on(EVENTS.ADMIN_BROADCAST, (data: TAdminBroadcast) => {
    appendCsv(file('admin_actions'), RAW_HEADERS.admin_actions, [
      isoFromLogTime(data.time),
      serverId,
      'broadcast',
      '',
      '',
      '',
      data.message || '',
    ]);
  });
}
