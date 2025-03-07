import { EVENTS } from '../constants';
import { adminSetNextLayer } from '../core';
import {
  cleanHistoryFactions,
  cleanHistoryLayers,
  cleanHistoryUnitTypes,
  getHistoryFactions,
  getHistoryLayers,
  getHistoryUnitTypes,
  serverHistoryFactions,
  serverHistoryLayers,
  serverHistoryUnitTypes,
} from '../rnsdb';
import { TPluginProps, TTeamFactions } from '../types';

type TierKey = 'S' | 'A' | 'B' | 'C';

const tieredMaps: Record<TierKey, { probability: number; maps: string[] }> = {
  S: {
    probability: 50,
    maps: [
      'Narva',
      'Yehorivka',
      'Gorodok',
      'Manicouagan',
      'Harju',
      'Mutaha',
      'Fallujah',
    ],
  },
  A: {
    probability: 30,
    maps: ['AlBasrah', 'Belaya', 'Chora', 'GooseBay', 'Tallil', 'BlackCoast'],
  },
  B: {
    probability: 15,
    maps: ['Sumari', 'Kokan', 'Sanxian', 'Kohat', 'Kamdesh', 'Anvil'],
  },
  C: {
    probability: 5,
    maps: ['Lashkar', 'Mestia', 'Skorpo', 'FoolsRoad', 'Logar'],
  },
};

const tieredFactions: Record<
  TierKey,
  { probability: number; factions: string[] }
> = {
  S: {
    probability: 50,
    factions: ['RGF', 'USA', 'USMC', 'WPMC', 'CAF'],
  },
  A: {
    probability: 35,
    factions: ['INS', 'BAF', 'IMF', 'PLA'],
  },
  B: {
    probability: 15,
    factions: ['TLF', 'PLAAGF', 'PLANMC', 'VDV', 'MEA'],
  },
  C: {
    probability: 0,
    factions: [],
  },
};

const tieredSubfactions: Record<
  TierKey,
  { probability: number; subfactions: string[] }
> = {
  S: {
    probability: 50,
    subfactions: [
      'CombinedArms',
      'Armored',
      'Mechanized',
      'Support',
      'LightInfantry',
      'Motorized',
    ],
  },
  A: {
    probability: 30,
    subfactions: [],
  },
  B: {
    probability: 20,
    subfactions: ['Armored', 'Mechanized', 'AirAssault'],
  },
  C: {
    probability: 0,
    subfactions: [],
  },
};

// Функция для взвешенного случайного выбора
function weightedRandom<T>(items: { item: T; weight: number }[]): T | null {
  const totalWeight = items.reduce((sum, cur) => sum + cur.weight, 0);
  if (totalWeight === 0) return null;
  let rnd = Math.random() * totalWeight;
  for (const { item, weight } of items) {
    rnd -= weight;
    if (rnd <= 0) return item;
  }
  return null;
}

function getFactionTier(faction: string): TierKey | null {
  for (const [tierKey, tier] of Object.entries(tieredFactions) as [
    TierKey,
    { probability: number; factions: string[] },
  ][]) {
    if (tier.factions.includes(faction)) {
      return tierKey;
    }
  }
  return null;
}

function randomArrayElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Функция для выбора карты:
 * – Собираем кандидатов из всех карт, исключая те, что есть в истории.
 * – Если кандидатов нет, то можно использовать полный список (или задать значение по умолчанию).
 */
async function pickRandomMap(
  id: number,
  maps: Record<string, any>,
  mode: string,
  excludeCountLayersNumber: number,
): Promise<string> {
  const recentHistory = await getHistoryLayers(id);
  const modes = mode.split(',').map((m) => m.trim());
  const candidates: { level: string; layer: string }[] = [];

  // Перебираем все категории карт
  for (const tier of Object.values(tieredMaps)) {
    for (const shortMapName of tier.maps) {
      if (recentHistory.includes(shortMapName)) continue; // исключаем использованные
      const availableKeys = Object.keys(maps).filter((key) =>
        modes.some((m) => key.startsWith(`${shortMapName}_${m}`)),
      );
      if (availableKeys.length > 0) {
        const randomKey = randomArrayElement(availableKeys);
        const layerData = maps[randomKey];
        let layerName: string = randomKey;
        if (layerData) {
          if (typeof layerData.layerName === 'string' && layerData.layerName) {
            layerName = layerData.layerName;
          } else if (
            layerData.layerName &&
            typeof layerData.layerName === 'object'
          ) {
            const keys = Object.keys(layerData.layerName);
            layerName = keys.length ? keys[0] : randomKey;
          }
        }
        candidates.push({ level: shortMapName, layer: layerName });
      }
    }
  }

  // Если кандидатов нет — можно выбрать из всех доступных или задать значение по умолчанию
  if (candidates.length === 0) {
    for (const tier of Object.values(tieredMaps)) {
      for (const shortMapName of tier.maps) {
        const availableKeys = Object.keys(maps).filter((key) =>
          modes.some((m) => key.startsWith(`${shortMapName}_${m}`)),
        );
        if (availableKeys.length > 0) {
          const randomKey = randomArrayElement(availableKeys);
          const layerData = maps[randomKey];
          let layerName: string = randomKey;
          if (layerData) {
            if (
              typeof layerData.layerName === 'string' &&
              layerData.layerName
            ) {
              layerName = layerData.layerName;
            } else if (
              layerData.layerName &&
              typeof layerData.layerName === 'object'
            ) {
              const keys = Object.keys(layerData.layerName);
              layerName = keys.length ? keys[0] : randomKey;
            }
          }
          candidates.push({ level: shortMapName, layer: layerName });
        }
      }
    }
  }

  if (candidates.length === 0) {
    return 'Narva_AAS_v1';
  }

  const chosen = randomArrayElement(candidates);
  await serverHistoryLayers(id, chosen.level);
  recentHistory.push(chosen.level);
  while (recentHistory.length > excludeCountLayersNumber) {
    recentHistory.shift();
    await cleanHistoryLayers(id);
  }
  return chosen.layer;
}

// Получаем все доступные фракции из структуры команды
function getAvailableFactions(teamObj: TTeamFactions): string[] {
  return Object.values(teamObj).flatMap((alliance) => Object.keys(alliance));
}

/**
 * Выбор фракции с учётом истории не используется.
 * (Фильтрация будет происходить в функциях ниже.)
 */
function pickRandomFaction(available: string[]): string | null {
  const weightedFactions = available
    .map((faction) => {
      const tier = getFactionTier(faction);
      const weight = tier ? tieredFactions[tier].probability : 0;
      return { item: faction, weight };
    })
    .filter((obj) => obj.weight > 0);
  return weightedRandom(weightedFactions);
}

/**
 * Модифицированная функция для выбора двух различных фракций с фильтрацией по истории.
 */
function pickTwoDistinctFactions(
  teamObj: TTeamFactions,
  factionHistory: string[],
): { team1: string; team2: string } | null {
  const availableFactions = getAvailableFactions(teamObj).filter(
    (f) => !factionHistory.includes(f),
  );
  if (availableFactions.length === 0) return null;
  const faction1 = pickRandomFaction(availableFactions);
  if (!faction1) return null;
  const alliance1 = getAllianceForFactionFromMap(teamObj, faction1);
  if (!alliance1) return null;
  const availableFactions2 = availableFactions.filter((f) => {
    const alliance = getAllianceForFactionFromMap(teamObj, f);
    return alliance && alliance !== alliance1;
  });
  if (availableFactions2.length === 0) return null;
  const faction2 = pickRandomFaction(availableFactions2);
  if (!faction2) return null;
  return { team1: faction1, team2: faction2 };
}

// Поиск альянса для заданной фракции
function getAllianceForFactionFromMap(
  teamObj: TTeamFactions,
  faction: string,
): string | null {
  for (const [alliance, factions] of Object.entries(teamObj)) {
    if (factions.hasOwnProperty(faction)) return alliance;
  }
  return null;
}

/**
 * Выбор фракций для команд с фильтрацией по истории.
 */
function pickFactionsForTeams(
  layerKey: string,
  factionHistory: string[],
  maps: Record<string, any>,
): { team1: string; team2: string } | null {
  const layerData = maps[layerKey];
  if (!layerData) return null;
  const { ['Team1 / Team2']: combined, Team1, Team2 } = layerData;
  if (combined) {
    return pickTwoDistinctFactions(combined, factionHistory);
  } else if (Team1 && Team2) {
    const availableFactions1 = getAvailableFactions(Team1).filter(
      (f) => !factionHistory.includes(f),
    );
    const availableFactions2 = getAvailableFactions(Team2).filter(
      (f) => !factionHistory.includes(f),
    );
    if (availableFactions1.length === 0 || availableFactions2.length === 0)
      return null;
    const faction1 = pickRandomFaction(availableFactions1);
    const faction2 = pickRandomFaction(availableFactions2);
    if (!faction1 || !faction2) return null;
    return { team1: faction1, team2: faction2 };
  }
  return null;
}

/**
 * Выбор типов юнитов с учётом истории.
 * Перед выбором отфильтровываем уже использованные типы.
 */
function pickSymmetricUnitTypes(
  teamObj: TTeamFactions,
  faction1: string,
  faction2: string,
  unitTypeHistory: string[],
  symmetricUnitTypes: boolean,
): { type1: string; type2: string } | null {
  const alliance1 = getAllianceForFactionFromMap(teamObj, faction1);
  const alliance2 = getAllianceForFactionFromMap(teamObj, faction2);
  if (!alliance1 || !alliance2) return null;
  let availableTypes1: string[] = teamObj[alliance1][faction1] || [];
  let availableTypes2: string[] = teamObj[alliance2][faction2] || [];

  // Фильтруем по истории
  availableTypes1 = availableTypes1.filter((t) => !unitTypeHistory.includes(t));
  availableTypes2 = availableTypes2.filter((t) => !unitTypeHistory.includes(t));

  if (!availableTypes1.length || !availableTypes2.length) {
    // Фолбэк: если после фильтрации ничего не осталось, можно использовать полный список
    availableTypes1 = teamObj[alliance1][faction1] || [];
    availableTypes2 = teamObj[alliance2][faction2] || [];
  }

  if (symmetricUnitTypes) {
    const intersection = availableTypes1.filter((t) =>
      availableTypes2.includes(t),
    );
    if (intersection.length > 0) {
      const chosenType = pickWeightedUnitType(intersection);
      if (chosenType) {
        return { type1: chosenType, type2: chosenType };
      } else {
        const fallbackType = randomArrayElement(intersection);
        return { type1: fallbackType, type2: fallbackType };
      }
    }
  }
  const type1 = pickWeightedUnitType(availableTypes1);
  const type2 = pickWeightedUnitType(availableTypes2);
  if (!type1 || !type2) return null;
  return { type1, type2 };
}

/**
 * Выбор типа юнитов с весами.
 */
function pickWeightedUnitType(available: string[]): string | null {
  const weightedTypes = available
    .map((type) => {
      let typeWeight = 0;
      for (const [, tier] of Object.entries(tieredSubfactions) as [
        TierKey,
        { probability: number; subfactions: string[] },
      ][]) {
        if (tier.subfactions.includes(type)) {
          typeWeight = tier.probability;
          break;
        }
      }
      return { item: type, weight: typeWeight };
    })
    .filter((obj) => obj.weight > 0);
  return weightedRandom(weightedTypes);
}

export const randomizerMaps: TPluginProps = (state, options) => {
  const { listener, logger, maps, execute, id } = state;
  const {
    mode,
    symmetricUnitTypes,
    excludeCountLayers,
    excludeCountFactions,
    excludeCountUnitTypes,
  } = options;
  const excludeCountLayersNumber = Number(excludeCountLayers);
  const excludeCountFactionsNumber = Number(excludeCountFactions);
  const excludeCountUnitTypesNumber = Number(excludeCountUnitTypes);
  const symmetricUnitTypesBoolean = Boolean(symmetricUnitTypes) === true;

  const newGame = async () => {
    try {
      logger.log('DEBUG: [newGame] Начало генерации новой игры.');

      // Выбор карты с учётом истории
      const chosenLayer = await pickRandomMap(
        id,
        maps,
        mode,
        excludeCountLayersNumber,
      );
      logger.log(`DEBUG: [newGame] Выбран слой: ${chosenLayer}`);

      // Получаем историю для фракций
      const factionHistory = await getHistoryFactions(id);
      // Выбор фракций с фильтрацией по истории
      const candidateFactions = pickFactionsForTeams(
        chosenLayer,
        factionHistory,
        maps,
      );
      if (!candidateFactions) {
        logger.log('DEBUG: [newGame] Не удалось выбрать фракции.');
        return;
      }
      // Обновляем историю фракций
      await serverHistoryFactions(id, candidateFactions.team1);
      await serverHistoryFactions(id, candidateFactions.team2);
      factionHistory.push(candidateFactions.team1, candidateFactions.team2);
      while (factionHistory.length > excludeCountFactionsNumber) {
        factionHistory.shift();
        await cleanHistoryFactions(id);
      }
      logger.log(
        `DEBUG: [newGame] Выбраны фракции: ${candidateFactions.team1} и ${candidateFactions.team2}`,
      );

      const layerData = maps[chosenLayer];
      if (!layerData || !layerData['Team1 / Team2']) {
        logger.log(
          `DEBUG: [newGame] Данные для слоя ${chosenLayer} отсутствуют или формат не поддерживается.`,
        );
        return;
      }
      const teamObj: TTeamFactions = layerData['Team1 / Team2'];

      // Получаем историю для типов юнитов
      const unitTypeHistory = await getHistoryUnitTypes(id);
      // Выбор типов юнитов с фильтрацией по истории
      let candidateUnitTypes = pickSymmetricUnitTypes(
        teamObj,
        candidateFactions.team1,
        candidateFactions.team2,
        unitTypeHistory,
        symmetricUnitTypesBoolean,
      );
      if (!candidateUnitTypes) {
        // Фолбэк: если ничего не осталось – выбираем без фильтрации
        candidateUnitTypes = pickSymmetricUnitTypes(
          teamObj,
          candidateFactions.team1,
          candidateFactions.team2,
          [],
          symmetricUnitTypesBoolean,
        );
      }
      if (!candidateUnitTypes) {
        logger.log('DEBUG: [newGame] Не удалось выбрать типы юнитов.');
        return;
      }
      await serverHistoryUnitTypes(id, candidateUnitTypes.type1);
      await serverHistoryUnitTypes(id, candidateUnitTypes.type2);
      unitTypeHistory.push(candidateUnitTypes.type1, candidateUnitTypes.type2);
      while (unitTypeHistory.length > excludeCountUnitTypesNumber) {
        unitTypeHistory.shift();
        await cleanHistoryUnitTypes(id);
      }
      logger.log(
        `DEBUG: [newGame] Выбраны типы юнитов: ${candidateUnitTypes.type1} и ${candidateUnitTypes.type2}`,
      );

      const finalString = `${chosenLayer} ${candidateFactions.team1}+${candidateUnitTypes.type1} ${candidateFactions.team2}+${candidateUnitTypes.type2}`;
      logger.log(`DEBUG: [newGame] Следующая карта: ${finalString}`);
      adminSetNextLayer(execute, finalString);
    } catch (error) {
      logger.log(
        `DEBUG: [newGame] Ошибка: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  };

  listener.on(EVENTS.NEW_GAME, newGame);
};
