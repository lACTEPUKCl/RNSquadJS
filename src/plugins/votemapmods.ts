import { TChatMessage } from 'squad-rcon';
import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminBroadcast, adminChangeLayer, adminWarn } from '../core';
import { definePlugin } from '../core/plugin';
import { getPlayers } from './helpers';

const optionsSchema = z.object({
  voteTick: z.coerce.number().int().positive().default(30000),
  voteDuration: z.coerce.number().int().positive().default(180000),
  onlyForVip: z.boolean().default(false),
  needVotes: z.coerce.number().int().positive().default(10),

  minPlayers: z.coerce.number().int().nonnegative().default(0),
});

export default definePlugin({
  name: 'voteMapMods',
  description: 'Голосование за смену карты (модовые карты).',
  optionsSchema,
  setup({ state, options, registerDisposable }) {
    const { listener, execute, maps } = state;
    const { voteTick, voteDuration, onlyForVip, needVotes, minPlayers } =
      options;

    let voteReadyToStart = true;
    let voteStarting = false;
    let secondsToEnd = voteDuration / 1000;
    let timer: NodeJS.Timeout | undefined;
    let timerDelayStarting: NodeJS.Timeout | undefined;
    let vote = false;
    let historyPlayers: string[] = [];
    let votes: { [key in string]: string[] } = { '+': [], '-': [] };
    let currentVoteMessage = '';
    let currentVoteFoundKey = '';

    const reset = () => {
      if (timerDelayStarting) clearTimeout(timerDelayStarting);
      if (timer) clearInterval(timer);
      secondsToEnd = voteDuration / 1000;
      voteStarting = false;
      state.votingActive = false;
      votes = { '+': [], '-': [] };
    };

    const tally = () => {
      const online = getPlayers(state);
      const onlineIds = new Set((online ?? []).map((p) => p.steamID));
      const positive = votes['+'].filter((id) => onlineIds.has(id)).length;
      const negative = votes['-'].filter((id) => onlineIds.has(id)).length;
      const currentVotes = Math.max(0, positive - negative);
      return { positive, negative, currentVotes };
    };

    const concludeSuccess = () => {
      const { positive, negative, currentVotes } = tally();
      adminBroadcast(
        execute,
        `Голосование завершено!\nСледующая карта ${currentVoteMessage}!`,
      );
      adminBroadcast(
        execute,
        `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`,
      );
      reset();
      adminChangeLayer(execute, currentVoteFoundKey);
      vote = true;
    };

    const concludeFail = () => {
      const { positive, negative, currentVotes } = tally();
      adminBroadcast(
        execute,
        'Голосование завершено!\nНе набрано необходимое количество голосов',
      );
      adminBroadcast(
        execute,
        `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`,
      );
      reset();
    };

    const chatCommand = (data: TChatMessage) => {
      const { steamID, message } = data;
      const { admins } = state;
      if (state.votingActive || voteStarting) {
        adminWarn(execute, steamID, 'В данный момент голосование уже идет!');
        return;
      }
      if (vote) {
        adminWarn(execute, steamID, 'Голосование уже прошло!');
        return;
      }
      if (!voteReadyToStart) {
        adminWarn(
          execute,
          steamID,
          'Голосование будет доступно через 1 минуту после старта карты!',
        );
        return;
      }
      const online = getPlayers(state);
      if (minPlayers > 0 && (!online || online.length < minPlayers)) {
        adminWarn(
          execute,
          steamID,
          `Голосование доступно от ${minPlayers} игроков на сервере.`,
        );
        return;
      }
      if (onlyForVip && !admins?.[steamID]) {
        adminWarn(
          execute,
          steamID,
          'Команда доступна только Vip пользователям',
        );
        return;
      }
      if (historyPlayers.find((i) => i === steamID)) {
        adminWarn(
          execute,
          steamID,
          'Вы уже запускали голосование, для каждого игрока доступно только одно голосование за игру!',
        );
        return;
      }

      const messageToLower = message.toLowerCase().trim();
      const foundKey = Object.keys(maps).find(
        (key) => key.toLowerCase() === messageToLower.toLowerCase(),
      );

      if (!foundKey || message.length === 0) {
        adminWarn(
          execute,
          steamID,
          'Неправильно указано название карты, список карт можно найти в дискорде в канале плагины!',
        );
        return;
      }

      adminBroadcast(
        execute,
        `Голосование за смену карты на ${message}!\nИспользуйте +(За) -(Против) для голосования`,
      );

      voteStarting = true;
      state.votingActive = true;
      currentVoteMessage = message;
      currentVoteFoundKey = foundKey;
      historyPlayers.push(steamID);
      timer = setInterval(() => {
        secondsToEnd = secondsToEnd - voteTick / 1000;
        const { positive, negative, currentVotes } = tally();

        if (secondsToEnd <= 0) {
          if (currentVotes >= needVotes) concludeSuccess();
          else concludeFail();
        } else {
          adminBroadcast(
            execute,
            `Голосование за смену карты на ${currentVoteMessage}!\nЗа: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`,
          );
          adminBroadcast(
            execute,
            'Используйте +(За) -(Против) для голосования',
          );
        }
      }, voteTick);
    };

    const chatMessage = (data: TChatMessage) => {
      if (!voteStarting) return;
      const { steamID } = data;
      const message = data.message.trim();

      if (message === '+' || message === '-') {
        for (const key in votes) {
          votes[key] = votes[key].filter((p) => p !== steamID);
        }
        votes[message].push(steamID);
        adminWarn(execute, steamID, 'Твой голос принят!');
      }
    };

    const newGame = () => {
      reset();
      vote = false;
      voteReadyToStart = false;
      historyPlayers = [];
      timerDelayStarting = setTimeout(() => {
        voteReadyToStart = true;
      }, 60000);
    };

    listener.on(EVENTS.CHAT_COMMAND_VOTEMAP, chatCommand);
    listener.on(EVENTS.CHAT_MESSAGE, chatMessage);
    listener.on(EVENTS.NEW_GAME, newGame);

    registerDisposable(() => {
      listener.off(EVENTS.CHAT_COMMAND_VOTEMAP, chatCommand);
      listener.off(EVENTS.CHAT_MESSAGE, chatMessage);
      listener.off(EVENTS.NEW_GAME, newGame);
      reset();
    });
  },
});
