import fs from 'fs';
import path from 'path';
import { TChatMessage } from 'squad-rcon';
import { EVENTS } from '../constants';
import { adminBroadcast, adminSetNextLayer, adminWarn } from '../core';
import { TPluginProps } from '../types';

export const voteMapMods: TPluginProps = (state, options) => {
  const { listener, execute } = state;
  const { voteTick, voteDuration, onlyForVip, needVotes, mapFileName } =
    options;
  let voteReadyToStart = true;
  let voteStarting = false;
  let secondsToEnd = voteDuration / 1000;
  let timer: NodeJS.Timeout;
  let timerDelayStarting: NodeJS.Timeout | undefined = undefined;
  let timerDelayNextStart: NodeJS.Timeout | undefined = undefined;
  let vote = false;
  let historyPlayers: string[] = [];
  let votes: { [key in string]: string[] } = {
    '+': [],
    '-': [],
  };
  const filePath = path.resolve(
    __dirname,
    '../core/maps',
    `${mapFileName}.json`,
  );

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

    if (onlyForVip && !admins?.[steamID]) {
      adminWarn(execute, steamID, 'Команда доступна только Vip пользователям');
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

    const layersData = fs.readFileSync(filePath, 'utf8');
    const layersArray = JSON.parse(layersData);
    const messageToLower = message.toLowerCase().trim();
    let foundMap = false;

    layersArray.forEach((e: string) => {
      if (e.toLocaleLowerCase() === messageToLower) {
        foundMap = true;
        return;
      }
    });

    if (!foundMap || message.length === 0) {
      adminWarn(
        execute,
        steamID,
        'Неправильно указано название карты, список карт можно найти в дискорде в канале плагины!',
      );
      return;
    }

    adminBroadcast(
      execute,
      `Голосование за следующую карту ${message}!\nИспользуйте +(За) -(Против) для голосования`,
    );

    voteStarting = true;
    state.votingActive = true;
    historyPlayers.push(steamID);
    timer = setInterval(() => {
      secondsToEnd = secondsToEnd - voteTick / 1000;
      const positive = votes['+'].length;
      const negative = votes['-'].length;
      const currentVotes = positive - negative <= 0 ? 0 : positive - negative;

      if (secondsToEnd <= 0) {
        if (currentVotes >= needVotes) {
          adminBroadcast(
            execute,
            `Голосование завершено!\nСледующая карта ${message}!`,
          );
          adminBroadcast(
            execute,
            `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`,
          );

          reset();
          adminSetNextLayer(execute, messageToLower);
          vote = true;
          return;
        }

        adminBroadcast(
          execute,
          'Голосование завершено!\nНе набрано необходимое количество голосов',
        );
        adminBroadcast(
          execute,
          `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`,
        );

        reset();
      } else {
        adminBroadcast(
          execute,
          `Голосование за следующую карту ${message}!\nЗа: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`,
        );
        adminBroadcast(execute, 'Используйте +(За) -(Против) для голосования');
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

  const reset = () => {
    if (timerDelayNextStart) clearTimeout(timerDelayNextStart);
    if (timerDelayStarting) clearTimeout(timerDelayStarting);
    clearInterval(timer);
    secondsToEnd = voteDuration / 1000;
    voteStarting = false;
    state.votingActive = false;
    votes = {
      '+': [],
      '-': [],
    };
  };
};
