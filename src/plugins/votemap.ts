import { TChatMessage } from 'squad-rcon';
import { EVENTS } from '../constants';
import { adminBroadcast, adminSetNextLayer, adminWarn } from '../core';
import { TMaps, TPluginProps, TTeamFactions } from '../types';

type TeamKey = 'Team1' | 'Team2' | 'Team1 / Team2';

const findFactionAlliance = (
  faction: string,
  teamData: TTeamFactions,
  subFaction: string,
): string | undefined => {
  for (const alliance in teamData) {
    if (
      teamData[alliance][faction] &&
      teamData[alliance][faction].includes(subFaction)
    ) {
      return alliance;
    }
  }
  return undefined;
};

const validateFactionSubFaction = (
  mapData: TMaps,
  mapName: string,
  teamName: TeamKey,
  faction: string,
  subFaction: string,
  tempAlliance: { current?: string },
): boolean => {
  const mapEntry = mapData[mapName];
  if (!mapEntry) return false;

  if (mapEntry['Team1 / Team2']) {
    teamName = 'Team1 / Team2';
  }

  const teamData: TTeamFactions | undefined = mapEntry[teamName];
  if (!teamData) return false;

  const alliance = findFactionAlliance(faction, teamData, subFaction);
  if (tempAlliance.current === alliance || !alliance) {
    tempAlliance.current = undefined;
    return false;
  }
  tempAlliance.current = alliance;
  return true;
};

const validateSelectedMapAndTeams = (
  mapData: TMaps,
  mapName: string,
  team1Faction: string,
  team1SubFaction: string,
  team2Faction: string,
  team2SubFaction: string,
): boolean => {
  const tempAlliance: { current?: string } = {};
  const team1Valid = validateFactionSubFaction(
    mapData,
    mapName,
    'Team1',
    team1Faction,
    team1SubFaction,
    tempAlliance,
  );
  const team2Valid = validateFactionSubFaction(
    mapData,
    mapName,
    'Team2',
    team2Faction,
    team2SubFaction,
    tempAlliance,
  );
  return team1Valid && team2Valid;
};

const parseVoteMessage = (message: string) => {
  const parts = message.split(/\s+/);
  if (parts.length < 3) return { isValid: false };

  const [layerName, team1Part, team2Part] = parts;
  const [team1Faction, team1SubFaction] = team1Part.split('+');
  const [team2Faction, team2SubFaction] = team2Part.split('+');

  if (
    !layerName ||
    !team1Faction ||
    !team1SubFaction ||
    !team2Faction ||
    !team2SubFaction
  ) {
    return { isValid: false };
  }
  return {
    isValid: true,
    mapName: layerName,
    layerName,
    team1Faction,
    team1SubFaction,
    team2Faction,
    team2SubFaction,
  };
};

export const voteMap: TPluginProps = (state, options) => {
  const { listener, execute, maps } = state;
  const { voteTick, voteDuration, onlyForVip, needVotes } = options;
  let voteReadyToStart = true;
  let voteStarting = false;
  let secondsToEnd = voteDuration / 1000;
  let timer: NodeJS.Timeout;
  let timerDelayStarting: NodeJS.Timeout;
  const timerDelayNextStart: NodeJS.Timeout = setTimeout(() => {}, 0);
  let voteCompleted = false;
  let historyPlayers: string[] = [];
  let votes: { [key: string]: string[] } = { '+': [], '-': [] };

  const updateVoteStatus = (message: string) => {
    secondsToEnd -= voteTick / 1000;
    const positive = votes['+'].length;
    const negative = votes['-'].length;
    const currentVotes = Math.max(positive - negative, 0);

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
        resetVote();
        adminSetNextLayer(execute, message);
        voteCompleted = true;
      } else {
        adminBroadcast(
          execute,
          'Голосование завершено!\nНе набрано необходимое количество голосов',
        );
        adminBroadcast(
          execute,
          `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`,
        );
        resetVote();
      }
    } else {
      adminBroadcast(
        execute,
        `Голосование за следующую карту ${message}!\nЗа: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`,
      );
      adminBroadcast(
        execute,
        'Используйте +(За) или -(Против) для голосования',
      );
    }
  };

  const resetVote = () => {
    clearTimeout(timerDelayNextStart);
    clearTimeout(timerDelayStarting);
    clearInterval(timer);
    secondsToEnd = voteDuration / 1000;
    voteStarting = false;
    state.votingActive = false;
    votes = { '+': [], '-': [] };
  };

  const handleChatCommand = (data: TChatMessage) => {
    const { steamID, message } = data;
    const { admins } = state;

    if (state.votingActive || voteStarting) {
      adminWarn(execute, steamID, 'В данный момент голосование уже идет!');
      return;
    }
    if (voteCompleted) {
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
    if (historyPlayers.includes(steamID)) {
      adminWarn(
        execute,
        steamID,
        'Вы уже запускали голосование, для каждого игрока доступно только одно голосование за игру!',
      );
      return;
    }

    const parsed = parseVoteMessage(message);
    if (!parsed.isValid) {
      adminWarn(
        execute,
        steamID,
        'Неправильный формат сообщения (Нужно указать название карты, фракции и тип войск)!',
      );
      return;
    }

    const {
      layerName,
      team1Faction,
      team1SubFaction,
      team2Faction,
      team2SubFaction,
    } = parsed;
    if (!layerName) return;

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
        'Неправильно указано название карты. Список карт можно найти в дискорд-канале discord.gg/rn-server!',
      );
      return;
    }

    adminBroadcast(
      execute,
      `Голосование за следующую карту ${message}!\nИспользуйте +(За) или -(Против) для голосования`,
    );

    voteStarting = true;
    state.votingActive = true;
    historyPlayers.push(steamID);

    timer = setInterval(() => {
      updateVoteStatus(message);
    }, voteTick);
  };

  const handleChatMessage = (data: TChatMessage) => {
    if (!voteStarting) return;
    const { steamID, message } = data;
    const trimmed = message.trim();
    if (trimmed === '+' || trimmed === '-') {
      for (const key in votes) {
        votes[key] = votes[key].filter((p) => p !== steamID);
      }
      votes[trimmed].push(steamID);
      adminWarn(execute, steamID, 'Твой голос принят!');
    }
  };

  const handleNewGame = () => {
    resetVote();
    voteCompleted = false;
    voteReadyToStart = false;
    historyPlayers = [];
    timerDelayStarting = setTimeout(() => {
      voteReadyToStart = true;
    }, 60000);
  };

  listener.on(EVENTS.CHAT_COMMAND_VOTEMAP, handleChatCommand);
  listener.on(EVENTS.CHAT_MESSAGE, handleChatMessage);
  listener.on(EVENTS.NEW_GAME, handleNewGame);
};
