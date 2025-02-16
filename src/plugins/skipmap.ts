import { TChatMessage } from 'squad-rcon';
import { EVENTS } from '../constants';
import { adminBroadcast, adminEndMatch, adminWarn } from '../core';
import { TPluginProps } from '../types';

export const skipmap: TPluginProps = (state, options) => {
  const { listener, execute } = state;
  const {
    voteTick,
    voteDuration,
    voteRepeatDelay,
    onlyForVip,
    needVotes,
    voteTimeout,
  } = options;
  let voteReadyToStart = true;
  let voteTimeOutToStart = false;
  let voteStarting = false;
  let voteStartingRepeat = true;
  let secondsToEnd = voteDuration / 1000;
  const skipMapTimeout = voteTimeout / 1000 / 60;
  let timer: NodeJS.Timeout;
  let timerDelayStarting: NodeJS.Timeout;
  let timerDelayNextStart: NodeJS.Timeout;
  let timerVoteTimeOutToStart: NodeJS.Timeout;
  let historyPlayers: string[] = [];
  let votes: { [key: string]: string[] } = { '+': [], '-': [] };
  let voteReadyAt = Date.now();
  let skipmapRepeatAt = 0;

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
      const now = Date.now();
      const diff = voteReadyAt - now;
      if (diff > 0) {
        const secondsLeft = Math.ceil(diff / 1000);
        return `Голосование за завершение матча будет доступно через ${secondsLeft} секунд!`;
      }
      return 'Голосование за завершение матча ещё не готово!';
    }
    if (voteTimeOutToStart) {
      return `Голосование за завершение матча доступно только в первые ${skipMapTimeout} минуты после начала матча!`;
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
      const positive = votes['+'].length;
      const negative = votes['-'].length;
      const currentVotes = Math.max(positive - negative, 0);

      if (secondsToEnd <= 0) {
        if (currentVotes >= needVotes) {
          adminBroadcast(execute, 'Голосование завершено!\nМатч завершается!');
          adminBroadcast(
            execute,
            `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`,
          );
          state.skipmap = true;
          reset();
          adminEndMatch(execute);
          return;
        }

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
    }
  };

  const newGame = () => {
    reset();
    clearTimeout(timerDelayNextStart);
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

  const reset = () => {
    clearTimeout(timerDelayStarting);
    clearTimeout(timerVoteTimeOutToStart);
    clearInterval(timer);
    secondsToEnd = voteDuration / 1000;
    voteStarting = false;
    state.votingActive = false;
    votes = { '+': [], '-': [] };
  };
};
