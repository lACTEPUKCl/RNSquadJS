import fs from 'fs/promises';
import path from 'path';
import {
  TAdminAction,
  TDeployableDamaged,
  TEacAction,
  TFobPlaced,
  TGrenadeSpawned,
  TNewGame,
  TNextLayerSet,
  TPlayerConnected,
  TPlayerDamaged,
  TPlayerDied,
  TPlayerDisconnected,
  TPlayerPossess,
  TPlayerRespawn,
  TPlayerRevived,
  TPlayerStateChanged,
  TPlayerSuicide,
  TPlayerUnpossess,
  TPlayerWounded,
  TRallyPlaced,
  TRoundTickets,
  TRoundWinner,
  TVehicleDamaged,
  TVehicleSeatChange,
} from 'squad-logs';
import {
  TChatMessage,
  TPossessedAdminCamera,
  TSquadCreated,
  TUnPossessedAdminCamera,
} from 'squad-rcon';
import { EVENTS } from '../constants';
import { TPlayer, TPlayerRoleChanged, TPluginProps } from '../types';
import {
  getPlayer,
  getPlayerByEOSID,
  getPlayerByName,
  getPlayerBySteamID,
} from './helpers';

interface LogData {
  currentTime: string;
  action: string;
  описание: string;
  [key: string]: unknown;
}

export const rnsLogs: TPluginProps = (state, options) => {
  const { logger, listener } = state;
  const { logPath } = options;
  const opt = options as Record<string, unknown>;
  const logVehicleSeats = opt.logVehicleSeats !== false;
  const logRespawns = opt.logRespawns === true;
  const logGrenades = opt.logGrenades === true;
  const logStateChanges = opt.logStateChanges === true;

  let logData: LogData[] = [];
  const writeInterval = 6000;
  const cleanLogsInterval = 24 * 60 * 60 * 1000;
  let matchIsEnded = false;

  const lastDamageWeapon = new Map<string, string>();
  const lastDamageAttacker = new Map<string, TPlayer>();

  if (!logPath) {
    logger.error('[RnsLogs] logPath option is required but not provided');
    return;
  }

  const now = () =>
    new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const nm = (p?: TPlayer | null) => (p?.name ? p.name : 'неизвестный');
  const wp = (w?: string | null) => (w ? w : 'неизвестное оружие');

  const push = (entry: LogData) => logData.push(entry);

  async function ensureLogDir() {
    try {
      await fs.mkdir(logPath, { recursive: true });
    } catch (err) {
      logger.error('[RnsLogs] Не удалось создать директорию логов');
    }
  }

  ensureLogDir();

  async function cleanOldLogsFiles() {
    try {
      const expiryLogDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const files = await fs.readdir(logPath);
      let deletedCount = 0;
      for (const file of files) {
        try {
          const filePath = path.join(logPath, file);
          const stats = await fs.stat(filePath);
          if (stats.isFile() && stats.mtime < expiryLogDate) {
            await fs.unlink(filePath);
            deletedCount++;
          }
        } catch (err) {
          logger.error(`[CleanLogs] Error processing file ${file}`);
        }
      }
      logger.log(`[CleanLogs] Cleanup complete. Deleted ${deletedCount} files`);
    } catch (err) {
      logger.error('[CleanLogs] Fatal error during cleanup');
    }
  }

  async function writeLogToFile(tempData: LogData[]) {
    try {
      if (!tempData || tempData.length === 0) return;
      const { currentMap } = state;
      const layer = currentMap?.layer || 'Undefined';
      const logFilePath = path.join(logPath, `${layer}.json`);
      let logs: LogData[] = [];
      try {
        const data = await fs.readFile(logFilePath, 'utf-8');
        const parsed = JSON.parse(data);
        logs = Array.isArray(parsed) ? parsed : [];
      } catch {
        logs = [];
      }
      logs = logs.concat(tempData);
      await fs.writeFile(logFilePath, JSON.stringify(logs, null, 2));
    } catch (error) {
      logger.error('[RnsLogs] Error writing log file');
    }
  }

  setInterval(() => {
    if (logData.length > 0) {
      void writeLogToFile(logData);
      logData = [];
    }
  }, writeInterval);

  setInterval(() => {
    void cleanOldLogsFiles();
  }, cleanLogsInterval);

  async function renameFileLog(data: { time: string; layer: string }) {
    const { time, layer } = data;
    const currentFilePath = path.join(logPath, `${layer}.json`);
    const safeNewName = `${time}_${layer}`.replace(/[:*?"<>|]/g, '.');
    const newFilePath = path.join(logPath, `${safeNewName}.json`);
    try {
      await fs.rename(currentFilePath, newFilePath);
    } catch (err) {
      logger.error('Ошибка при переименовании файла');
    }
  }

  async function onNewGame(data: TNewGame) {
    matchIsEnded = false;
    lastDamageWeapon.clear();
    lastDamageAttacker.clear();
    const { layerClassname } = data;
    push({
      currentTime: now(),
      action: 'NewGame',
      описание: `Новая игра. Карта: ${layerClassname}`,
      layerClassname,
    });
  }

  async function onPlayerConnected(data: TPlayerConnected) {
    if (matchIsEnded) return;
    const player = getPlayerBySteamID(state, data.steamID);
    push({
      currentTime: now(),
      action: 'Connect',
      описание: `${nm(player)} зашёл на сервер`,
      player: player?.name ? player : null,
    });
  }

  async function onPlayerDisconnected(data: TPlayerDisconnected) {
    if (matchIsEnded) return;
    const player = getPlayerByEOSID(state, data.eosID);
    push({
      currentTime: now(),
      action: 'Disconnected',
      описание: `${nm(player)} вышел с сервера`,
      player: player?.name ? player : null,
    });
  }

  async function onRoundEnded() {
    matchIsEnded = true;
    const { currentMap } = state;
    const currentTime = now();
    push({
      currentTime,
      action: 'RoundEnd',
      описание: 'Раунд завершён',
    });
    await writeLogToFile(logData);
    logData = [];
    await renameFileLog({
      time: currentTime,
      layer: currentMap?.layer || 'Undefined',
    });
  }

  async function onPlayerWounded(data: TPlayerWounded) {
    if (matchIsEnded) return;
    const { attackerEOSID, victimName, damage, weapon } = data;
    if (victimName && weapon) lastDamageWeapon.set(victimName, weapon);
    const victim = getPlayerByName(state, victimName);
    const attacker = getPlayerByEOSID(state, attackerEOSID);
    const isTeam =
      attacker &&
      victim &&
      attacker.teamID === victim.teamID &&
      attacker.name !== victim.name;
    push({
      currentTime: now(),
      action: isTeam ? 'TeamKill' : 'Wound',
      описание: isTeam
        ? `${nm(attacker)} ранил СОЮЗНИКА ${nm(victim)} из ${wp(weapon)} (урон ${damage})`
        : `${nm(attacker)} ранил ${nm(victim)} из ${wp(weapon)} (урон ${damage})`,
      damage,
      weapon: weapon || null,
      attacker: attacker?.name ? attacker : null,
      victim: victim?.name ? victim : null,
    });
  }

  async function onPlayerDamaged(data: TPlayerDamaged) {
    if (matchIsEnded) return;
    const { attackerEOSID, victimName, damage, weapon } = data;
    const victim = getPlayerByName(state, victimName);
    const attacker = getPlayerByEOSID(state, attackerEOSID);
    if (victimName && weapon) lastDamageWeapon.set(victimName, weapon);
    if (victimName && attacker)
      lastDamageAttacker.set(victimName, { ...attacker });
    const isTeam =
      attacker &&
      victim &&
      attacker.teamID === victim.teamID &&
      attacker.name !== victim.name;
    push({
      currentTime: now(),
      action: isTeam ? 'TeamDamaged' : 'PlayerDamaged',
      описание: isTeam
        ? `${nm(attacker)} нанёс урон СОЮЗНИКУ ${nm(victim)} из ${wp(weapon)} (${damage})`
        : `${nm(attacker)} нанёс урон ${nm(victim)} из ${wp(weapon)} (${damage})`,
      damage,
      weapon: weapon || null,
      attacker: attacker?.name ? attacker : null,
      victim: victim?.name ? victim : null,
    });
  }

  async function onPlayerDied(data: TPlayerDied) {
    if (matchIsEnded) return;
    const { attackerEOSID, victimName, damage } = data;
    const victim = getPlayerByName(state, victimName);
    const attacker =
      getPlayerByEOSID(state, attackerEOSID) ||
      lastDamageAttacker.get(victimName) ||
      null;
    lastDamageAttacker.delete(victimName);
    const weapon = lastDamageWeapon.get(victimName) || null;
    lastDamageWeapon.delete(victimName);
    push({
      currentTime: now(),
      action: 'Died',
      описание: attacker
        ? `${nm(attacker)} убил ${nm(victim)} из ${wp(weapon)}`
        : `${nm(victim)} погиб`,
      damage,
      weapon,
      attacker: attacker?.name ? attacker : null,
      victim: victim?.name ? victim : null,
    });
  }

  async function onPlayerRevived(data: TPlayerRevived) {
    if (matchIsEnded) return;
    const { reviverEOSID, victimEOSID, victimName } = data;
    if (victimName) {
      lastDamageWeapon.delete(victimName);
      lastDamageAttacker.delete(victimName);
    }
    const reviver = getPlayerByEOSID(state, reviverEOSID);
    const victim = getPlayerByEOSID(state, victimEOSID);
    push({
      currentTime: now(),
      action: 'Revived',
      описание: `${nm(reviver)} поднял ${nm(victim)}`,
      reviver,
      victim,
    });
  }

  async function onRoleChanged(data: TPlayerRoleChanged) {
    if (matchIsEnded) return;
    const { oldRole, newRole, player } = data;
    push({
      currentTime: now(),
      action: 'RoleChanged',
      описание: `${player.name} сменил роль: ${oldRole} → ${newRole}`,
      name: player.name,
      oldRole,
      newRole,
    });
  }

  async function onDeployableDamaged(data: TDeployableDamaged) {
    if (matchIsEnded) return;
    const { deployable, damage, weapon, name, steamID, eosID } = data;
    const player = getPlayer(state, { steamID, eosID, name });
    push({
      currentTime: now(),
      action: 'DeployableDamaged',
      описание: `${nm(player)} повредил постройку ${deployable} из ${wp(weapon)} (урон ${damage})`,
      damage,
      deployable,
      weapon,
      player: player?.name ? player : null,
    });
  }

  async function onChatMessage(data: TChatMessage) {
    if (matchIsEnded) return;
    const { name, message, chat } = data;
    push({
      currentTime: now(),
      action: 'ChatMessage',
      описание: `[${chat}] ${name}: ${message}`,
      name,
      chat,
      message,
    });
  }

  async function onSquadCreated(data: TSquadCreated) {
    if (matchIsEnded) return;
    const { squadName, eosID } = data;
    const player = getPlayerByEOSID(state, eosID);
    push({
      currentTime: now(),
      action: 'SquadCreated',
      описание: `${nm(player)} создал отряд «${squadName}»`,
      squadName,
      player: player?.name ? player : null,
    });
  }

  async function onEntry(data: TPossessedAdminCamera) {
    if (matchIsEnded) return;
    push({
      currentTime: now(),
      action: 'EntryCamera',
      описание: `${data.name} зашёл в админ-камеру`,
      name: data.name,
    });
  }

  async function onExit(data: TUnPossessedAdminCamera) {
    if (matchIsEnded) return;
    push({
      currentTime: now(),
      action: 'ExitCamera',
      описание: `${data.name} вышел из админ-камеры`,
      name: data.name,
    });
  }

  async function onPlayerPossess(data: TPlayerPossess) {
    if (matchIsEnded) return;
    const { eosID, possessClassname } = data;
    const player = getPlayerByEOSID(state, eosID);
    push({
      currentTime: now(),
      action: 'Possess',
      описание: `${nm(player)} занял ${possessClassname}`,
      player: player?.name ? player : null,
      possessClassname,
    });
  }

  async function onPlayerUnpossess(data: TPlayerUnpossess) {
    if (matchIsEnded) return;
    const player = getPlayerByEOSID(state, data.eosID);
    push({
      currentTime: now(),
      action: 'Unpossess',
      описание: `${nm(player)} вышел из техники / сменил юнит`,
      player: player?.name ? player : null,
    });
  }

  async function onPlayerSuicide(data: TPlayerSuicide) {
    if (matchIsEnded) return;
    const player = getPlayerByName(state, data.name);
    push({
      currentTime: now(),
      action: 'Suicide',
      описание: `${nm(player)} покончил с собой`,
      player: player?.name ? player : null,
    });
  }

  async function onVehicleDamage(data: TVehicleDamaged) {
    if (matchIsEnded) return;
    const {
      damage,
      attackerName,
      victimVehicle,
      attackerVehicle,
      healthRemaining,
    } = data;
    push({
      currentTime: now(),
      action: 'VehicleDamage',
      описание: `${attackerName} (${attackerVehicle}) повредил технику ${victimVehicle} на ${damage} (осталось ${healthRemaining} HP)`,
      attackerName,
      victimVehicle,
      damage,
      attackerVehicle,
      healthRemaining,
    });
  }

  async function onVehicleSeat(data: TVehicleSeatChange) {
    if (matchIsEnded || !logVehicleSeats) return;
    const { name, vehicle, seatNumber, action } = data;
    push({
      currentTime: now(),
      action: 'VehicleSeat',
      описание:
        action === 'enter'
          ? `${name} сел в технику ${vehicle} (место ${seatNumber})`
          : `${name} вышел из техники ${vehicle} (место ${seatNumber})`,
      name,
      vehicle,
      seatNumber,
      seatAction: action,
    });
  }

  async function onFobPlaced(data: TFobPlaced) {
    if (matchIsEnded || data.isMain) return;
    push({
      currentTime: now(),
      action: 'FobPlaced',
      описание: `Команда ${data.teamID} построила FOB`,
      teamID: data.teamID,
      radioId: data.radioId,
      x: data.x,
      y: data.y,
      z: data.z,
    });
  }

  async function onRallyPlaced(data: TRallyPlaced) {
    if (matchIsEnded) return;
    push({
      currentTime: now(),
      action: 'RallyPlaced',
      описание: `Команда ${data.teamID} поставила точку сбора (rally)`,
      teamID: data.teamID,
      x: data.x,
      y: data.y,
      z: data.z,
    });
  }

  async function onPlayerRespawn(data: TPlayerRespawn) {
    if (matchIsEnded || !logRespawns) return;
    push({
      currentTime: now(),
      action: 'Respawn',
      описание: `Возрождение игрока (роль ${data.role}, точка ${data.spawn})`,
      playerController: data.playerController,
      spawn: data.spawn,
      role: data.role,
    });
  }

  async function onEacAction(data: TEacAction) {
    if (matchIsEnded) return;
    push({
      currentTime: now(),
      action: 'EacAction',
      описание: `Анти-чит (EAC): ${data.action} — игрок ${data.client} (${data.actionReason})`,
      client: data.client,
      eacAction: data.action,
      reason: data.actionReason,
      details: (data.details || '').trim(),
    });
  }

  async function onAdminAction(data: TAdminAction) {
    if (matchIsEnded) return;
    let описание = `Действие админа: ${data.action}`;
    let name: string | null = null;
    let details: string | null = null;
    if (data.action === 'kick') {
      name = data.name ?? null;
      описание = `Админ кикнул ${data.name}`;
    } else if (data.action === 'forceTeamChange') {
      name = data.name ?? null;
      описание = `Админ сменил команду игроку ${data.name}`;
    } else if (data.action === 'disband') {
      details = `отряд «${data.squadName}», команда ${data.teamID}`;
      описание = `Админ расформировал отряд «${data.squadName}» (команда ${data.teamID})`;
    } else if (data.action === 'warn') {
      name = data.name ?? null;
      details = data.message ?? null;
      описание = `Админ предупредил ${data.name}: ${data.message}`;
    } else if (data.action === 'autoBan') {
      name = data.name ?? null;
      details = data.reason ?? null;
      описание = `Автобан: ${data.name} (${data.reason})`;
    }
    push({
      currentTime: now(),
      action: 'AdminAction',
      описание,
      adminAction: data.action,
      name,
      details,
    });
  }

  async function onNextLayerSet(data: TNextLayerSet) {
    push({
      currentTime: now(),
      action: 'NextLayerSet',
      описание: `Следующая карта: ${data.layer} (${data.team1Faction} против ${data.team2Faction})`,
      layer: data.layer,
      team1Faction: data.team1Faction,
      team2Faction: data.team2Faction,
    });
  }

  async function onRoundTickets(data: TRoundTickets) {
    if (matchIsEnded) return;
    push({
      currentTime: now(),
      action: 'RoundTickets',
      описание: `${data.faction} (команда ${data.team}): ${data.tickets} тикетов — ${data.action}`,
      team: data.team,
      faction: data.faction,
      tickets: data.tickets,
      ticketAction: data.action,
    });
  }

  async function onRoundWinner(data: TRoundWinner) {
    push({
      currentTime: now(),
      action: 'RoundWinner',
      описание: `Победила команда ${data.winner} на карте ${data.layer}`,
      winner: data.winner,
      layer: data.layer,
    });
  }

  async function onGrenade(data: TGrenadeSpawned) {
    if (matchIsEnded || !logGrenades) return;
    push({
      currentTime: now(),
      action: 'GrenadeSpawned',
      описание: `${data.instigator} бросил гранату`,
      instigator: data.instigator,
    });
  }

  async function onStateChanged(data: TPlayerStateChanged) {
    if (matchIsEnded || !logStateChanges) return;
    push({
      currentTime: now(),
      action: 'PlayerStateChanged',
      описание: `${data.name}: состояние ${data.oldState} → ${data.newState}`,
      name: data.name,
      oldState: data.oldState,
      newState: data.newState,
    });
  }

  listener.on(EVENTS.PLAYER_CONNECTED, onPlayerConnected);
  listener.on(EVENTS.PLAYER_DISCONNECTED, onPlayerDisconnected);
  listener.on(EVENTS.PLAYER_WOUNDED, onPlayerWounded);
  listener.on(EVENTS.PLAYER_DAMAGED, onPlayerDamaged);
  listener.on(EVENTS.PLAYER_DIED, onPlayerDied);
  listener.on(EVENTS.ROUND_ENDED, onRoundEnded);
  listener.on(EVENTS.NEW_GAME, onNewGame);
  listener.on(EVENTS.PLAYER_REVIVED, onPlayerRevived);
  listener.on(EVENTS.PLAYER_ROLE_CHANGED, onRoleChanged);
  listener.on(EVENTS.DEPLOYABLE_DAMAGED, onDeployableDamaged);
  listener.on(EVENTS.CHAT_MESSAGE, onChatMessage);
  listener.on(EVENTS.SQUAD_CREATED, onSquadCreated);
  listener.on(EVENTS.POSSESSED_ADMIN_CAMERA, onEntry);
  listener.on(EVENTS.UNPOSSESSED_ADMIN_CAMERA, onExit);
  listener.on(EVENTS.PLAYER_POSSESS, onPlayerPossess);
  listener.on(EVENTS.PLAYER_UNPOSSESS, onPlayerUnpossess);
  listener.on(EVENTS.PLAYER_SUICIDE, onPlayerSuicide);
  listener.on(EVENTS.VEHICLE_DAMAGED, onVehicleDamage);
  listener.on(EVENTS.VEHICLE_SEAT_CHANGE, onVehicleSeat);
  listener.on(EVENTS.FOB_PLACED, onFobPlaced);
  listener.on(EVENTS.RALLY_PLACED, onRallyPlaced);
  listener.on(EVENTS.PLAYER_RESPAWN, onPlayerRespawn);
  listener.on(EVENTS.EAC_ACTION, onEacAction);
  listener.on(EVENTS.ADMIN_ACTION, onAdminAction);
  listener.on(EVENTS.NEXT_LAYER_SET, onNextLayerSet);
  listener.on(EVENTS.ROUND_TICKETS, onRoundTickets);
  listener.on(EVENTS.ROUND_WINNER, onRoundWinner);
  listener.on(EVENTS.GRENADE_SPAWNED, onGrenade);
  listener.on(EVENTS.PLAYER_STATE_CHANGED, onStateChanged);
};
