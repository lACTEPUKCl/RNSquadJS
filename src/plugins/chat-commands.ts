import { TChatMessage } from 'squad-rcon';
import { EVENTS } from '../constants';
import { adminBroadcast, adminForceTeamChange, adminWarn } from '../core';
import { getUserDataWithSteamID } from '../rnsdb';
import { TPluginProps } from '../types';
import { getAdmins, getPlayers } from './helpers';

export const chatCommands: TPluginProps = (state, options) => {
  const { listener, execute } = state;
  const {
    adminsEnable,
    reportEnable,
    stvolEnable,
    fixEnable,
    discordEnable,
    statsEnable,
    bonusEnable,
    rollEnable,
    swapEnable,
    balanceEnable,
    balanceOffEnable,
    swapTimeout,
    statsTimeout,
    stvolTimeout,
    rollTimeout,
    adminsMessage,
    reportMessage,
    stvolTimeOutMessage,
    discordMessage,
    statsTimeOutMessage,
    statsPlayerNotFoundMessage,
    bonusWarnMessage,
    swapOnlyForVip,
    swapMaxDiff,
  } = options;
  type SwapHistoryItem = {
    steamID: string;
    deletionTimer: NodeJS.Timeout;
    startTime: number;
  };
  let players: string[] = [];
  let timeoutPlayers: string[] = [];
  const swapHistory: SwapHistoryItem[] = [];

  const sendWarningMessages = (steamID: string, messages: string) => {
    for (const message of messages) {
      adminWarn(execute, steamID, message);
    }
  };

  const admins = (data: TChatMessage) => {
    if (!adminsEnable) return;
    const { steamID } = data;
    sendWarningMessages(steamID, adminsMessage);
  };

  const report = (data: TChatMessage) => {
    if (!reportEnable) return;
    sendWarningMessages(data.steamID, reportMessage);
  };

  const stvol = (data: TChatMessage) => {
    if (!stvolEnable) return;
    const { name, steamID } = data;

    if (players.find((player) => player === steamID)) {
      sendWarningMessages(steamID, stvolTimeOutMessage);
      return;
    }

    const range = Math.floor(Math.random() * 31 + 1);

    adminBroadcast(execute, `У ${name} ствол ${range}см`);

    players.push(steamID);

    setTimeout(() => {
      players = players.filter((player) => player !== steamID);
    }, parseInt(stvolTimeout));
  };

  const roll = (data: TChatMessage) => {
    if (!rollEnable) return;
    const { name, steamID } = data;

    if (players.find((player) => player === steamID)) {
      sendWarningMessages(steamID, stvolTimeOutMessage);
      return;
    }

    const range = Math.floor(Math.random() * 99 + 1);

    adminBroadcast(execute, `${name} заролил ${range}`);

    players.push(steamID);

    setTimeout(() => {
      players = players.filter((player) => player !== steamID);
    }, parseInt(rollTimeout));
  };

  const fix = (data: TChatMessage) => {
    if (!fixEnable) return;
    adminForceTeamChange(execute, data.steamID);
    adminForceTeamChange(execute, data.steamID);
  };

  const discord = (data: TChatMessage) => {
    if (!discordEnable) return;
    const { steamID } = data;
    sendWarningMessages(steamID, discordMessage);
  };

  const stats = async (data: TChatMessage) => {
    if (!statsEnable) return;
    const { steamID, message } = data;
    let user;
    if (timeoutPlayers.find((p) => p === steamID)) {
      sendWarningMessages(steamID, statsTimeOutMessage);
      return;
    }
    if (message.length === 0) {
      user = await getUserDataWithSteamID(steamID);
    } else {
      const players = getPlayers(state);
      const getPlayer = players?.find((p) =>
        p.name.trim().toLowerCase().includes(message.trim().toLowerCase()),
      );
      if (!getPlayer) {
        sendWarningMessages(steamID, statsPlayerNotFoundMessage);
      } else {
        user = await getUserDataWithSteamID(getPlayer.steamID);
      }
    }
    if (!user) return;
    const { name, kills, death, revives, teamkills, kd } = user;

    adminWarn(
      execute,
      steamID,
      `Игрок: ${name}\nУбийств: ${kills}\nСмертей: ${death}\nПомощь: ${revives}\nТимкилы: ${teamkills}\nK/D: ${kd}
       `,
    );
    timeoutPlayers.push(steamID);
    setTimeout(() => {
      timeoutPlayers = timeoutPlayers.filter((p) => p !== steamID);
    }, parseInt(statsTimeout));
  };

  const bonus = async (data: TChatMessage) => {
    if (!bonusEnable) return;
    const { steamID } = data;

    const user = await getUserDataWithSteamID(steamID);
    if (!user) return;
    const bonus = user.bonuses;
    adminWarn(execute, steamID, `У вас бонусов ${bonus || 0}`);
    sendWarningMessages(steamID, bonusWarnMessage);
  };

  const swap = async (data: TChatMessage) => {
    if (!swapEnable) return;

    const { steamID } = data;

    const players = getPlayers(state);
    const player = players?.find((p) => p.steamID === steamID);

    if (!players || !player) return;

    const team1 = players.filter((p) => p.teamID === '1').length;
    const team2 = players.filter((p) => p.teamID === '2').length;

    const playerTeam = player.teamID;

    const newTeam1 = playerTeam === '1' ? team1 - 1 : team1 + 1;
    const newTeam2 = playerTeam === '2' ? team2 - 1 : team2 + 1;
    const newDiff = Math.abs(newTeam1 - newTeam2);

    const currentDiff = Math.abs(team1 - team2);
    const isBalancing = newDiff < currentDiff;

    const maxDiff = Number(swapMaxDiff) || 0;

    if (!isBalancing) {
      if (maxDiff > 0 && newDiff > maxDiff) {
        adminWarn(
          execute,
          steamID,
          `Свап заблокирован: дисбаланс после перехода ${newDiff} (макс ${maxDiff}). Сейчас ${team1} vs ${team2}.`,
        );
        return;
      }
    }

    const cooldown = Number(swapTimeout) || 600000;
    const existing = swapHistory.find((p) => p.steamID === steamID);

    if (existing && !isBalancing) {
      const remaining = Math.max(
        0,
        cooldown - (Date.now() - existing.startTime),
      );
      const minutes = Math.ceil(remaining / 60000);

      adminWarn(
        execute,
        steamID,
        `Команда будет доступна через ${minutes} мин.`,
      );
      return;
    }

    adminForceTeamChange(execute, steamID);

    if (isBalancing) return;

    const timer = setTimeout(() => {
      const index = swapHistory.findIndex((p) => p.steamID === steamID);
      if (index !== -1) swapHistory.splice(index, 1);
    }, cooldown);

    swapHistory.push({
      steamID,
      deletionTimer: timer,
      startTime: Date.now(),
    });
  };

  const isAdminSteam = (steamID: string): boolean => {
    const set = new Set<string>([
      ...(getAdmins(state, 'forceteamchange') || []),
    ]);
    return set.has(steamID);
  };

  const balanceOn = async (data: TChatMessage) => {
    if (!balanceEnable) return;
    if (!isAdminSteam(data.steamID)) {
      adminWarn(
        execute,
        data.steamID,
        'Команда доступна только администраторам',
      );
      return;
    }
    state.listener.emit(EVENTS.SMART_BALANCE_ON, {
      by: data.steamID,
      source: 'chat',
    });
    await adminBroadcast(
      execute,
      'Автобаланс активирован - команды будут сбалансированы в конце игры.',
    );
  };

  const balanceOff = async (data: TChatMessage) => {
    if (!balanceOffEnable) return;
    if (!isAdminSteam(data.steamID)) {
      adminWarn(
        execute,
        data.steamID,
        'Команда доступна только администраторам',
      );
      return;
    }
    state.listener.emit(EVENTS.SMART_BALANCE_OFF, {
      by: data.steamID,
      source: 'chat',
    });
    await adminBroadcast(execute, 'Автобаланс отключен.');
  };

  listener.on(EVENTS.CHAT_COMMAND_ADMINS, admins);
  listener.on(EVENTS.CHAT_COMMAND_REPORT, report);
  listener.on(EVENTS.CHAT_COMMAND_R, report);
  listener.on(EVENTS.CHAT_COMMAND_STVOL, stvol);
  listener.on(EVENTS.CHAT_COMMAND_ROLL, roll);
  listener.on(EVENTS.CHAT_COMMAND_FIX, fix);
  listener.on(EVENTS.CHAT_COMMAND_BONUS, bonus);
  listener.on(EVENTS.CHAT_COMMAND_STATS, stats);
  listener.on(EVENTS.CHAT_COMMAND_DISCORD, discord);
  listener.on(EVENTS.CHAT_COMMAND_SWITCH, swap);
  listener.on(EVENTS.CHAT_COMMAND_SWAP, swap);
  listener.on(EVENTS.CHAT_COMMAND_SW, swap);
  listener.on(EVENTS.CHAT_COMMAND_BALANCE, balanceOn);
  listener.on(EVENTS.CHAT_COMMAND_BALANCE_OFF, balanceOff);
};
