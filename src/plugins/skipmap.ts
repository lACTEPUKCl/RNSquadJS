import { TChatMessage } from 'squad-rcon';
import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminBroadcast, adminEndMatch, adminWarn } from '../core';
import { definePlugin } from '../core/plugin';
import { getPlayers } from './helpers';

const optionsSchema = z.object({
  voteTick: z.coerce.number().int().positive().default(30000),
  voteDuration: z.coerce.number().int().positive().default(120000),
  voteRepeatDelay: z.coerce.number().int().nonnegative().default(900000),
  onlyForVip: z.boolean().default(false),
  needVotes: z.coerce.number().int().positive().default(15),
  voteTimeout: z.coerce.number().int().positive().default(999999999),
  minPlayers: z.coerce.number().int().nonnegative().default(0),
});

export default definePlugin({
  name: 'skipmap',
  description: 'Голосование за пропуск текущей карты.',
  optionsSchema,
  setup({ state, options, registerDisposable }) {
    const { listener, execute } = state;
    const {
      voteTick,
      voteDuration,
      voteRepeatDelay,
      onlyForVip,
      needVotes,
      voteTimeout,
      minPlayers,
    } = options;

    let voteReadyToStart = true;
    let voteTimeOutToStart = false;
    let voteStarting = false;
    let voteStartingRepeat = true;
    let secondsToEnd = voteDuration / 1000;
    const skipMapTimeout = voteTimeout / 1000 / 60;
    let timer: NodeJS.Timeout | undefined;
    let timerDelayStarting: NodeJS.Timeout | undefined;
    let timerDelayNextStart: NodeJS.Timeout | undefined;
    let timerVoteTimeOutToStart: NodeJS.Timeout | undefined;
    let historyPlayers: string[] = [];
    let votes: { [key: string]: string[] } = { '+': [], '-': [] };
    let voteReadyAt = Date.now();
    let skipmapRepeatAt = 0;

    const reset = () => {
      if (timerDelayStarting) clearTimeout(timerDelayStarting);
      if (timerVoteTimeOutToStart) clearTimeout(timerVoteTimeOutToStart);
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
      const currentVotes = Math.max(positive - negative, 0);
      return { positive, negative, currentVotes };
    };

    const concludeSuccess = () => {
      const { positive, negative, currentVotes } = tally();
      adminBroadcast(execute, 'Голосование завершено!\nМатч завершается!');
      adminBroadcast(
        execute,
        `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`,
      );
      state.skipmap = true;
      reset();
      adminEndMatch(execute);
    };

    const concludeFail = () => {
      const { positive, negative, currentVotes } = tally();
      skipmapRepeatAt = Date.now() + voteRepeatDelay;
      timerDelayNextStart = setTimeout(() => {
        voteStartingRepeat = true;
      }, voteRepeatDelay);

      adminBroadcast(
        execute,
        'Голосование завершено!\nНе набрано необходимое количество голосов за пропуск текущей карты',
      );
      adminBroadcast(
        execute,
        `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`,
      );
      reset();
    };

    const getSkipmapVoteErrorMessage = (steamID: string): string | null => {
      const { admins } = state;
      if (state.votingActive || voteStarting) {
        return 'В данный момент голосование уже идет!';
      }
      if (!voteStartingRepeat) {
        const diffMs = skipmapRepeatAt - Date.now();
        if (diffMs > 0) {
          const diffMin = Math.ceil(diffMs / 1000 / 60);
          return `До повторного голосования осталось ${diffMin} минут(ы)!`;
        }
        return 'Должно пройти 15 минут после последнего использования skipmap!';
      }
      if (!voteReadyToStart) {
        const diff = voteReadyAt - Date.now();
        if (diff > 0) {
          const secondsLeft = Math.ceil(diff / 1000);
          return `Голосование за завершение матча будет доступно через ${secondsLeft} секунд!`;
        }
        return 'Голосование за завершение матча ещё не готово!';
      }
      if (voteTimeOutToStart) {
        return `Голосование за завершение матча доступно только в первые ${skipMapTimeout} минуты после начала матча!`;
      }
      const currentPlayers = getPlayers(state)?.length ?? 0;
      if (minPlayers && currentPlayers < minPlayers) {
        return `Для запуска голосования необходимо минимум ${minPlayers} игроков на сервере! Сейчас: ${currentPlayers}`;
      }
      if (onlyForVip && !admins?.[steamID]) {
        return 'Команда доступна только Vip пользователям';
      }
      if (historyPlayers.includes(steamID)) {
        return 'Вы уже запускали голосование, для каждого игрока доступно только одно голосование за игру!';
      }
      return null;
    };

    const chatCommand = (data: TChatMessage) => {
      const { steamID } = data;
      const errorMsg = getSkipmapVoteErrorMessage(steamID);
      if (errorMsg) {
        adminWarn(execute, steamID, errorMsg);
        return;
      }

      adminBroadcast(
        execute,
        'Голосование за пропуск текущей карты!\nИспользуйте +(За) или -(Против) для голосования',
      );

      historyPlayers.push(steamID);
      state.votingActive = true;
      voteStarting = true;
      voteStartingRepeat = false;

      timer = setInterval(() => {
        secondsToEnd -= voteTick / 1000;
        const { positive, negative, currentVotes } = tally();

        if (secondsToEnd <= 0) {
          if (currentVotes >= needVotes) concludeSuccess();
          else concludeFail();
        } else {
          adminBroadcast(
            execute,
            `Голосование за пропуск текущей карты!\nЗа: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`,
          );
          adminBroadcast(
            execute,
            'Используйте +(За) или -(Против) для голосования',
          );
        }
      }, voteTick);
    };

    const chatMessage = (data: TChatMessage) => {
      if (!voteStarting) return;
      const { steamID } = data;
      const msg = data.message.trim();

      if (msg === '+' || msg === '-') {
        for (const key in votes) {
          votes[key] = votes[key].filter((p) => p !== steamID);
        }
        votes[msg].push(steamID);
        adminWarn(execute, steamID, 'Твой голос принят!');

        if (tally().currentVotes >= needVotes) concludeSuccess();
      }
    };

    const newGame = () => {
      reset();
      if (timerDelayNextStart) clearTimeout(timerDelayNextStart);
      historyPlayers = [];
      voteReadyToStart = false;
      voteStartingRepeat = true;
      voteTimeOutToStart = false;
      state.skipmap = false;
      secondsToEnd = voteDuration / 1000;
      voteReadyAt = Date.now() + 60000;
      timerDelayStarting = setTimeout(() => {
        voteReadyToStart = true;
      }, 60000);

      timerVoteTimeOutToStart = setTimeout(() => {
        voteTimeOutToStart = true;
      }, voteTimeout);
    };

    listener.on(EVENTS.CHAT_COMMAND_SKIPMAP, chatCommand);
    listener.on(EVENTS.CHAT_MESSAGE, chatMessage);
    listener.on(EVENTS.NEW_GAME, newGame);

    registerDisposable(() => {
      listener.off(EVENTS.CHAT_COMMAND_SKIPMAP, chatCommand);
      listener.off(EVENTS.CHAT_MESSAGE, chatMessage);
      listener.off(EVENTS.NEW_GAME, newGame);
      reset();
      if (timerDelayNextStart) clearTimeout(timerDelayNextStart);
    });
  },
});
