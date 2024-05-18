import { TChatMessage } from 'squad-rcon';
import { EVENTS } from '../constants';
import { adminBroadcast, adminSetNextLayer, adminWarn } from '../core';
import { TMapTeams, TPluginProps } from '../types';

export const voteMap: TPluginProps = (state, options) => {
  const { listener, execute, maps } = state;
  const { voteTick, voteDuration, onlyForVip, needVotes } = options;
  let voteReadyToStart = true;
  let voteStarting = false;
  let secondsToEnd = voteDuration / 1000;
  let timer: NodeJS.Timeout;
  let timerDelayStarting: NodeJS.Timeout;
  let timerDelayNextStart: NodeJS.Timeout;
  let tempAlliance: string | undefined;
  let vote = false;
  let historyPlayers: string[] = [];
  let votes: { [key in string]: string[] } = {
    '+': [],
    '-': [],
  };

  const findFactionAlliance = (
    faction: string,
    teamData: any,
    subFaction: string,
  ): string | undefined => {
    for (const alliance in teamData) {
      if (teamData[alliance][faction]) {
        if (teamData[alliance][faction].includes(subFaction)) {
          return alliance;
        }
        return;
      }
    }
    return undefined;
  };

  const validateFactionSubFaction = (
    mapData: TMapTeams,
    mapName: string,
    teamName: string,
    faction: string,
    subFaction: string,
  ): boolean => {
    if (Object.keys(mapData[mapName])[0].includes('Team 1 / Team 2')) {
      teamName = 'Team 1 / Team 2';
    }

    const teamData = mapData[mapName]?.[teamName];
    const alliance = findFactionAlliance(faction, teamData, subFaction);

    if (tempAlliance === alliance) {
      tempAlliance = '';
      return false;
    }
    if (!alliance) {
      tempAlliance = '';
      return false;
    }
    tempAlliance = alliance;

    return true;
  };

  const validateSelectedMapAndTeams = (
    mapData: TMapTeams,
    mapName: string,
    team1Faction: string,
    team1SubFaction: string,
    team2Faction: string,
    team2SubFaction: string,
  ): boolean => {
    const team1Valid = validateFactionSubFaction(
      mapData,
      mapName,
      'Team 1',
      team1Faction,
      team1SubFaction,
    );

    const team2Valid = validateFactionSubFaction(
      mapData,
      mapName,
      'Team 2',
      team2Faction,
      team2SubFaction,
    );

    if (team1Valid && team2Valid) {
      return true;
    }

    return false;
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

    const parseMessage = (message: string) => {
      const [layerName, team1, team2] = message.split(/\s+/);

      if (!layerName || !team1 || !team2) {
        throw new Error('Неправильный формат сообщения');
      }

      const [mapName] = layerName.split('_');

      const [team1Faction, team1SubFaction] = team1.split('+');
      const [team2Faction, team2SubFaction] = team2.split('+');

      return {
        mapName,
        layerName,
        team1Faction,
        team1SubFaction,
        team2Faction,
        team2SubFaction,
      };
    };

    // Пример использования функции parseMessage
    const parsedMessage = parseMessage(message);
    const {
      layerName,
      team1Faction,
      team1SubFaction,
      team2Faction,
      team2SubFaction,
    } = parsedMessage;

    const isValidMapAndTeams = validateSelectedMapAndTeams(
      maps,
      layerName,
      team1Faction,
      team1SubFaction,
      team2Faction,
      team2SubFaction,
    );

    if (!isValidMapAndTeams || message.length === 0) {
      adminWarn(
        execute,
        steamID,
        'Неправильно указано название карты, список карт можно найти в дискорд канале discord.gg/rn-server плагины!',
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
          adminSetNextLayer(execute, message);
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
    clearTimeout(timerDelayNextStart);
    clearTimeout(timerDelayStarting);
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
