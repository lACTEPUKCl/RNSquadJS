import { TChatMessage } from 'squad-rcon';
import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminBroadcast, adminSetNextLayer, adminWarn } from '../core';
import { definePlugin } from '../core/plugin';
import { serverHistoryLayers } from '../rnsdb';
import { TMaps, TTeamFactions } from '../types';
import { getPlayers } from './helpers';

const optionsSchema = z.object({
  voteTick: z.coerce.number().int().positive().default(30000),
  voteDuration: z.coerce.number().int().positive().default(180000),
  onlyForVip: z.boolean().default(false),
  needVotes: z.coerce.number().int().positive().default(10),
  mapMode: z.union([z.array(z.string()), z.string()]).default([]),

  minPlayers: z.coerce.number().int().nonnegative().default(0),
});

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

const parseVoteMessage = (message: string, allowedModes: string[]) => {
  const hasValidMode = allowedModes.some((mode) => message.includes(mode));
  if (!hasValidMode) {
    return { isValid: false };
  }

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

export default definePlugin({
  name: 'voteMap',
  description: 'Голосование за следующую карту (с проверкой фракций).',
  optionsSchema,
  setup({ state, options, registerDisposable }) {
    const { listener, execute, maps } = state;
    const {
      voteTick,
      voteDuration,
      onlyForVip,
      needVotes,
      mapMode,
      minPlayers,
    } = options;
    const allowedModes: string[] = Array.isArray(mapMode)
      ? mapMode
      : [String(mapMode)];
    let voteReadyToStart = true;
    let voteStarting = false;
    let secondsToEnd = voteDuration / 1000;
    let timer: NodeJS.Timeout | undefined;
    let timerDelayStarting: NodeJS.Timeout | undefined;
    let voteCompleted = false;
    let historyPlayers: string[] = [];
    let votes: { [key: string]: string[] } = { '+': [], '-': [] };
    let currentVoteMessage = '';

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
      adminBroadcast(
        execute,
        `Голосование завершено!\nСледующая карта ${currentVoteMessage}!`,
      );
      adminBroadcast(
        execute,
        `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`,
      );
      resetVote();
      const [mapLevel] = currentVoteMessage.split('_');
      serverHistoryLayers(state.id, mapLevel);
      adminSetNextLayer(execute, currentVoteMessage);
      voteCompleted = true;
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
      resetVote();
    };

    const updateVoteStatus = () => {
      secondsToEnd -= voteTick / 1000;
      const { positive, negative, currentVotes } = tally();

      if (secondsToEnd <= 0) {
        if (currentVotes >= needVotes) concludeSuccess();
        else concludeFail();
      } else {
        adminBroadcast(
          execute,
          `Голосование за следующую карту ${currentVoteMessage}!\nЗа: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`,
        );
        adminBroadcast(
          execute,
          'Используйте +(За) или -(Против) для голосования',
        );
      }
    };

    const resetVote = () => {
      if (timerDelayStarting) clearTimeout(timerDelayStarting);
      if (timer) clearInterval(timer);
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
      if (historyPlayers.includes(steamID)) {
        adminWarn(
          execute,
          steamID,
          'Вы уже запускали голосование, для каждого игрока доступно только одно голосование за игру!',
        );
        return;
      }

      const parsed = parseVoteMessage(message, allowedModes);
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
      currentVoteMessage = message;
      historyPlayers.push(steamID);

      timer = setInterval(() => {
        updateVoteStatus();
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

    registerDisposable(() => {
      listener.off(EVENTS.CHAT_COMMAND_VOTEMAP, handleChatCommand);
      listener.off(EVENTS.CHAT_MESSAGE, handleChatMessage);
      listener.off(EVENTS.NEW_GAME, handleNewGame);
      resetVote();
    });
  },
});
