import axios from 'axios';
import { TChatMessage } from 'squad-rcon';
import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminBroadcast, adminForceTeamChange, adminWarn } from '../core';
import { definePlugin } from '../core/plugin';
import { getUserDataWithSteamID } from '../rnsdb';
import { getAdmins, getPlayers } from './helpers';

const msgArr = () => z.array(z.string()).default([]);

const optionsSchema = z.object({
  adminsEnable: z.boolean().default(false),
  reportEnable: z.boolean().default(false),
  reportNotifyAdmins: z.boolean().default(false),
  reportWebhookUrl: z.string().default(''),
  stvolEnable: z.boolean().default(false),
  fixEnable: z.boolean().default(false),
  discordEnable: z.boolean().default(false),
  statsEnable: z.boolean().default(false),
  rollEnable: z.boolean().default(false),
  bonusEnable: z.boolean().default(false),
  swapEnable: z.boolean().default(false),
  balanceEnable: z.boolean().default(false),
  balanceOffEnable: z.boolean().default(false),
  invEnable: z.boolean().default(false),
  helpEnable: z.boolean().default(true),
  swapOnlyForVip: z.boolean().default(false),
  swapMaxDiff: z.coerce.number().default(0),
  swapTimeout: z.coerce.number().int().nonnegative().default(600000),
  statsTimeout: z.coerce.number().int().nonnegative().default(180000),
  stvolTimeout: z.coerce.number().int().nonnegative().default(300000),
  rollTimeout: z.coerce.number().int().nonnegative().default(1000),
  invTimeout: z.coerce.number().int().nonnegative().default(60000),
  adminsMessage: msgArr(),
  reportMessage: msgArr(),
  stvolTimeOutMessage: msgArr(),
  discordMessage: msgArr(),
  statsTimeOutMessage: msgArr(),
  statsPlayerNotFoundMessage: msgArr(),
  bonusWarnMessage: msgArr(),
});

type SwapHistoryItem = {
  steamID: string;
  deletionTimer: NodeJS.Timeout;
  startTime: number;
};

export default definePlugin({
  name: 'chatCommands',
  description: 'Чат-команды игроков и админов.',
  optionsSchema,
  setup({ state, options, registerDisposable }) {
    const { listener, execute, id } = state;
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
      invEnable,
      helpEnable,
      swapTimeout,
      statsTimeout,
      stvolTimeout,
      rollTimeout,
      invTimeout,
      adminsMessage,
      reportMessage,
      stvolTimeOutMessage,
      discordMessage,
      statsTimeOutMessage,
      statsPlayerNotFoundMessage,
      bonusWarnMessage,
      swapMaxDiff,
      reportNotifyAdmins,
      reportWebhookUrl,
    } = options;

    let stvolPlayers: string[] = [];
    let rollPlayers: string[] = [];
    let timeoutPlayers: string[] = [];
    let invTimeoutPlayers: string[] = [];
    const swapHistory: SwapHistoryItem[] = [];

    const timers = new Set<NodeJS.Timeout>();
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
      return t;
    };

    const sendWarningMessages = (steamID: string, messages: string[]) => {
      for (const message of messages) adminWarn(execute, steamID, message);
    };

    const admins = (data: TChatMessage) => {
      if (!adminsEnable) return;
      sendWarningMessages(data.steamID, adminsMessage);
    };

    const report = (data: TChatMessage) => {
      if (!reportEnable) return;
      const { steamID, name, message } = data;
      const reportText = message.trim() || 'Без текста';

      sendWarningMessages(steamID, reportMessage);

      if (reportNotifyAdmins) {
        const onlineAdmins = getAdmins(state, 'cameraman');
        const onlinePlayers = getPlayers(state);
        if (onlineAdmins && onlinePlayers) {
          const onlineAdminSteamIDs = onlinePlayers
            .filter((p) => onlineAdmins.includes(p.steamID))
            .map((p) => p.steamID);

          for (const adminSteamID of onlineAdminSteamIDs) {
            adminWarn(execute, adminSteamID, `${name} отправил репорт!`);
            adminWarn(execute, adminSteamID, reportText);
          }
        }
      }

      if (reportWebhookUrl) {
        const currentMap = state.currentMap;
        const now = new Date().toLocaleString('ru-RU', {
          timeZone: 'Europe/Moscow',
        });

        axios
          .post(reportWebhookUrl, {
            embeds: [
              {
                title: 'Новый репорт',
                color: 0xff4444,
                fields: [
                  { name: `Сервер #${id}` },
                  { name: 'Игрок', value: name, inline: true },
                  { name: 'SteamID', value: steamID, inline: true },
                  {
                    name: 'Карта',
                    value: `${currentMap?.level || 'Неизвестно'} (${
                      currentMap?.layer || '—'
                    })`,
                    inline: true,
                  },
                  { name: 'Текст репорта', value: reportText },
                  { name: 'Время', value: now, inline: true },
                ],
              },
            ],
          })
          .catch(() => {});
      }
    };

    const stvol = (data: TChatMessage) => {
      if (!stvolEnable) return;
      const { name, steamID } = data;

      if (stvolPlayers.includes(steamID)) {
        sendWarningMessages(steamID, stvolTimeOutMessage);
        return;
      }

      const range = Math.floor(Math.random() * 31 + 1);
      adminBroadcast(execute, `У ${name} ствол ${range}см`);
      stvolPlayers.push(steamID);

      later(() => {
        stvolPlayers = stvolPlayers.filter((player) => player !== steamID);
      }, stvolTimeout);
    };

    const roll = (data: TChatMessage) => {
      if (!rollEnable) return;
      const { name, steamID } = data;

      if (rollPlayers.includes(steamID)) {
        sendWarningMessages(steamID, stvolTimeOutMessage);
        return;
      }

      const range = Math.floor(Math.random() * 99 + 1);
      adminBroadcast(execute, `${name} заролил ${range}`);
      rollPlayers.push(steamID);

      later(() => {
        rollPlayers = rollPlayers.filter((player) => player !== steamID);
      }, rollTimeout);
    };

    const help = (data: TChatMessage) => {
      if (!helpEnable) return;
      const cmds: string[] = [];
      if (statsEnable) cmds.push('!stats — ваша статистика');
      if (bonusEnable) cmds.push('!bonus — ваши бонусы');
      if (reportEnable) cmds.push('!report <текст> — репорт админам');
      if (stvolEnable) cmds.push('!ствол — рулетка ствола');
      if (rollEnable) cmds.push('!roll — случайное число');
      if (discordEnable) cmds.push('!discord — ссылка на Discord');
      if (fixEnable) cmds.push('!fix — починить застрявшего бойца');
      if (swapEnable) cmds.push('!swap — сменить команду');
      if (invEnable) cmds.push('!inv <номер отряда> — попроситься в отряд');
      if (adminsEnable) cmds.push('!admins — связь с админами');

      if (cmds.length === 0) {
        adminWarn(execute, data.steamID, 'Команды сейчас недоступны.');
        return;
      }
      for (const c of cmds) adminWarn(execute, data.steamID, c);
    };

    const fix = (data: TChatMessage) => {
      if (!fixEnable) return;
      adminForceTeamChange(execute, data.steamID);
      adminForceTeamChange(execute, data.steamID);
    };

    const discord = (data: TChatMessage) => {
      if (!discordEnable) return;
      sendWarningMessages(data.steamID, discordMessage);
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
        user = await getUserDataWithSteamID(state.id, steamID);
      } else {
        const list = getPlayers(state);
        const getPlayer = list?.find((p) =>
          p.name.trim().toLowerCase().includes(message.trim().toLowerCase()),
        );
        if (!getPlayer) {
          sendWarningMessages(steamID, statsPlayerNotFoundMessage);
        } else {
          user = await getUserDataWithSteamID(state.id, getPlayer.steamID);
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
      later(() => {
        timeoutPlayers = timeoutPlayers.filter((p) => p !== steamID);
      }, statsTimeout);
    };

    const bonus = async (data: TChatMessage) => {
      if (!bonusEnable) return;
      const { steamID } = data;

      const user = await getUserDataWithSteamID(state.id, steamID);
      if (!user) return;
      adminWarn(execute, steamID, `У вас бонусов ${user.bonuses || 0}`);
      sendWarningMessages(steamID, bonusWarnMessage);
    };

    const swap = async (data: TChatMessage) => {
      if (!swapEnable) return;
      const { steamID } = data;

      const list = getPlayers(state);
      const player = list?.find((p) => p.steamID === steamID);
      if (!list || !player) return;

      const team1 = list.filter((p) => p.teamID === '1').length;
      const team2 = list.filter((p) => p.teamID === '2').length;
      const playerTeam = player.teamID;

      const newTeam1 = playerTeam === '1' ? team1 - 1 : team1 + 1;
      const newTeam2 = playerTeam === '2' ? team2 - 1 : team2 + 1;
      const newDiff = Math.abs(newTeam1 - newTeam2);

      const currentDiff = Math.abs(team1 - team2);
      const isBalancing = newDiff < currentDiff;

      const maxDiff = swapMaxDiff || 0;

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

      const cooldown = swapTimeout || 600000;
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

    const inv = (data: TChatMessage) => {
      if (!invEnable) return;
      const { steamID, name, message } = data;

      const squadNumber = message.trim().match(/\d+/)?.[0];
      if (!squadNumber) {
        adminWarn(execute, steamID, 'Укажите номер отряда: !inv <номер>');
        return;
      }

      const list = getPlayers(state);
      const requester = list?.find((p) => p.steamID === steamID);
      if (!list || !requester) return;

      if (invTimeoutPlayers.includes(steamID)) {
        adminWarn(
          execute,
          steamID,
          'Запрос можно отправлять не чаще раза в минуту.',
        );
        return;
      }

      if (requester.squadID === squadNumber) {
        adminWarn(execute, steamID, 'Вы уже состоите в этом отряде.');
        return;
      }

      const leader = list.find(
        (p) =>
          p.teamID === requester.teamID &&
          p.squadID === squadNumber &&
          p.isLeader,
      );

      if (!leader) {
        adminWarn(
          execute,
          steamID,
          `Отряд ${squadNumber} не найден или у него нет лидера.`,
        );
        return;
      }

      adminWarn(
        execute,
        leader.steamID,
        `Игрок ${name} просится к вам в отряд ${squadNumber}. Примите его, если есть место.`,
      );
      adminWarn(
        execute,
        steamID,
        `Запрос отправлен лидеру отряда ${squadNumber}.`,
      );

      invTimeoutPlayers.push(steamID);
      later(() => {
        invTimeoutPlayers = invTimeoutPlayers.filter((p) => p !== steamID);
      }, invTimeout);
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

    const subscriptions: Array<[string, (...args: never[]) => void]> = [
      [EVENTS.CHAT_COMMAND_ADMINS, admins],
      [EVENTS.CHAT_COMMAND_REPORT, report],
      [EVENTS.CHAT_COMMAND_R, report],
      [EVENTS.CHAT_COMMAND_STVOL, stvol],
      [EVENTS.CHAT_COMMAND_ROLL, roll],
      [EVENTS.CHAT_COMMAND_FIX, fix],
      [EVENTS.CHAT_COMMAND_BONUS, bonus],
      [EVENTS.CHAT_COMMAND_STATS, stats],
      [EVENTS.CHAT_COMMAND_HELP, help],
      [EVENTS.CHAT_COMMAND_DISCORD, discord],
      [EVENTS.CHAT_COMMAND_SWITCH, swap],
      [EVENTS.CHAT_COMMAND_SWAP, swap],
      [EVENTS.CHAT_COMMAND_SW, swap],
      [EVENTS.CHAT_COMMAND_BALANCE, balanceOn],
      [EVENTS.CHAT_COMMAND_BALANCE_OFF, balanceOff],
      [EVENTS.CHAT_COMMAND_INV, inv],
    ];

    for (const [event, handler] of subscriptions) {
      listener.on(event, handler as (...args: unknown[]) => void);
    }

    registerDisposable(() => {
      for (const [event, handler] of subscriptions) {
        listener.off(event, handler as (...args: unknown[]) => void);
      }
      for (const t of timers) clearTimeout(t);
      timers.clear();
      for (const item of swapHistory) clearTimeout(item.deletionTimer);
      swapHistory.length = 0;
    });
  },
});
