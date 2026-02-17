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

type TieredMapsRec = Record<TierKey, { probability: number; maps: string[] }>;
type TieredFactionsRec = Record<
  TierKey,
  { probability: number; factions: string[] }
>;
type TieredSubfactionsRec = Record<
  TierKey,
  { probability: number; subfactions: string[] }
>;

const DEFAULT_TIERED_MAPS: TieredMapsRec = {
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
    maps: [
      'Sumari',
      'AlBasrah',
      'Belaya',
      'Chora',
      'GooseBay',
      'Tallil',
      'BlackCoast',
      'Logar',
    ],
  },
  B: {
    probability: 15,
    maps: ['Kokan', 'Sanxian', 'Kohat', 'Kamdesh', 'Anvil'],
  },
  C: {
    probability: 5,
    maps: ['Lashkar', 'Mestia', 'Skorpo', 'FoolsRoad'],
  },
};

const DEFAULT_TIERED_FACTIONS: TieredFactionsRec = {
  S: {
    probability: 50,
    factions: ['RGF', 'USA', 'USMC', 'WPMC', 'CAF', 'ADF', 'GFI', 'CRF'],
  },
  A: {
    probability: 40,
    factions: ['MEI', 'BAF', 'IMF'],
  },
  B: {
    probability: 10,
    factions: ['TLF', 'PLA'],
  },
  C: {
    probability: 0,
    factions: ['PLAAGF', 'PLANMC', 'VDV'],
  },
};

const DEFAULT_TIERED_SUBFACTIONS: TieredSubfactionsRec = {
  S: {
    probability: 90,
    subfactions: ['CombinedArms', 'Support', 'LightInfantry', 'Motorized'],
  },
  A: {
    probability: 30,
    subfactions: [],
  },
  B: {
    probability: 10,
    subfactions: ['Armored', 'Mechanized', 'AirAssault', 'AmphibiousAssault'],
  },
  C: {
    probability: 0,
    subfactions: [],
  },
};

export const randomizerMaps: TPluginProps = (state, options) => {
  const { id, listener, logger, maps, execute } = state;
  const {
    mode,
    symmetricUnitTypes,
    excludeCountLayers,
    excludeCountFactions,
    excludeCountUnitTypes,
    allowSameAllianceExceptRedfor,
  } = options;

  const tieredMaps: TieredMapsRec =
    (options as { tieredMaps?: TieredMapsRec }).tieredMaps ??
    DEFAULT_TIERED_MAPS;

  const tieredFactions: TieredFactionsRec =
    (options as { tieredFactions?: TieredFactionsRec }).tieredFactions ??
    DEFAULT_TIERED_FACTIONS;

  const tieredSubfactions: TieredSubfactionsRec =
    (options as { tieredSubfactions?: TieredSubfactionsRec })
      .tieredSubfactions ?? DEFAULT_TIERED_SUBFACTIONS;

  const excludeCountLayersNumber = Number(excludeCountLayers);
  const excludeCountFactionsNumber = Number(excludeCountFactions);
  const excludeCountUnitTypesNumber = Number(excludeCountUnitTypes);
  const allowSameAllianceExceptRedforBoolean =
    Boolean(allowSameAllianceExceptRedfor) === true;
  const symmetricUnitTypesBoolean = Boolean(symmetricUnitTypes) === true;

  function normalizeAllianceKey(alliance: string | null): string {
    return (alliance ?? '').trim().toUpperCase();
  }

  function isRedforAlliance(alliance: string | null): boolean {
    return normalizeAllianceKey(alliance).startsWith('REDFOR');
  }

  function isAllianceMatchAllowed(
    alliance1: string | null,
    alliance2: string | null,
  ): boolean {
    const a1 = normalizeAllianceKey(alliance1);
    const a2 = normalizeAllianceKey(alliance2);

    if (!a1 || !a2) return false;

    if (a1 !== a2) return true;

    if (!allowSameAllianceExceptRedforBoolean) return false;

    return !isRedforAlliance(a1);
  }

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
    const tiers = Object.entries(tieredFactions) as [
      TierKey,
      { probability: number; factions: string[] },
    ][];
    for (const [tierKey, tier] of tiers) {
      if (tier.factions.includes(faction)) return tierKey;
    }
    return null;
  }

  function randomArrayElement<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  function getAvailableFactions(teamObj: TTeamFactions): string[] {
    return Object.values(teamObj).flatMap((alliance) => Object.keys(alliance));
  }

  function pickRandomFaction(available: string[]): string | null {
    const weightedFactions = available
      .map((faction) => {
        const tier = getFactionTier(faction);
        const weight = tier ? tieredFactions[tier].probability : 0;
        return { item: faction, weight };
      })
      .filter((obj) => obj.weight > 0);
    const chosen = weightedRandom(weightedFactions);
    logger.log(
      `DEBUG: [pickRandomFaction] Из доступных фракций [${available.join(
        ', ',
      )}] выбрана: ${chosen}`,
    );
    return chosen;
  }

  function getAllianceForFactionFromMap(
    teamObj: TTeamFactions,
    faction: string,
  ): string | null {
    for (const [alliance, factions] of Object.entries(teamObj)) {
      if (factions.hasOwnProperty(faction)) return alliance;
    }
    logger.log(
      `DEBUG: [getAllianceForFactionFromMap] Фракция "${faction}" не найдена ни в одном альянсе.`,
    );
    return null;
  }

  function pickTwoDistinctFactions(
    teamObj: TTeamFactions,
    factionHistory: string[],
  ): { team1: string; team2: string } | null {
    let availableFactions = getAvailableFactions(teamObj).filter(
      (f) => !factionHistory.includes(f),
    );
    const faction1 = pickRandomFaction(availableFactions);
    if (!faction1) return null;
    const alliance1 = getAllianceForFactionFromMap(teamObj, faction1);
    if (!alliance1) return null;
    let availableFactions2 = availableFactions.filter((f) => {
      const alliance = getAllianceForFactionFromMap(teamObj, f);
      return isAllianceMatchAllowed(alliance1, alliance);
    });
    if (availableFactions2.length === 0) {
      logger.log(
        `DEBUG: [pickTwoDistinctFactions] Недостаточно фракций для второй команды после фильтрации, пробуем игнорировать историю.`,
      );
      availableFactions2 = getAvailableFactions(teamObj).filter((f) =>
        isAllianceMatchAllowed(
          alliance1,
          getAllianceForFactionFromMap(teamObj, f),
        ),
      );
      if (availableFactions2.length === 0) return null;
    }
    const faction2 = pickRandomFaction(availableFactions2);
    if (!faction2) return null;
    logger.log(
      `DEBUG: [pickTwoDistinctFactions] Выбраны фракции: ${faction1} (альянс: ${alliance1}) и ${faction2}`,
    );
    return { team1: faction1, team2: faction2 };
  }

  function pickFactionsForTeams(
    layerKey: string,
    factionHistory: string[],
  ): { team1: string; team2: string } | null {
    const layerData = maps[layerKey];
    if (!layerData) return null;

    if (layerData['Team1 / Team2']) {
      const combined = layerData['Team1 / Team2'];
      if (!combined) return null;

      let factions = pickTwoDistinctFactions(combined, factionHistory);
      if (!factions) {
        logger.log(
          'DEBUG: [pickFactionsForTeams] Не удалось выбрать фракции с учетом истории, пробуем игнорировать историю.',
        );
        factions = pickTwoDistinctFactions(combined, []);
      }
      return factions;
    } else if (layerData.Team1 && layerData.Team2) {
      const team1Data = layerData.Team1;
      const team2Data = layerData.Team2;

      let availableTeam1 = getAvailableFactions(team1Data).filter(
        (f) => !factionHistory.includes(f),
      );
      let faction1 = pickRandomFaction(availableTeam1);

      if (!faction1) {
        logger.log(
          'DEBUG: [pickFactionsForTeams] Не удалось выбрать фракцию Team1 с учетом истории, пробуем игнорировать историю.',
        );
        faction1 = pickRandomFaction(getAvailableFactions(team1Data));
      }
      if (!faction1) return null;

      const alliance1 = getAllianceForFactionFromMap(team1Data, faction1);

      let availableTeam2 = getAvailableFactions(team2Data)
        .filter((f) => !factionHistory.includes(f))
        .filter((f) => {
          const alliance2 = getAllianceForFactionFromMap(team2Data, f);
          return isAllianceMatchAllowed(alliance1, alliance2);
        });

      let faction2 = pickRandomFaction(availableTeam2);
      if (!faction2) {
        logger.log(
          'DEBUG: [pickFactionsForTeams] Не удалось выбрать фракцию Team2 с учетом истории и альянса, пробуем игнорировать историю.',
        );
        availableTeam2 = getAvailableFactions(team2Data).filter((f) => {
          const alliance2 = getAllianceForFactionFromMap(team2Data, f);
          return isAllianceMatchAllowed(alliance1, alliance2);
        });
        faction2 = pickRandomFaction(availableTeam2);
      }

      if (!faction2) return null;
      return { team1: faction1, team2: faction2 };
    }

    return null;
  }

  function pickWeightedUnitType(
    available: string[],
    unitTypeHistory: string[],
  ): string | null {
    const filtered = available.filter((t) => !unitTypeHistory.includes(t));
    if (filtered.length === 0) {
      logger.log(
        `DEBUG: [pickWeightedUnitType] Нет доступных типов. Доступные: [${available.join(
          ', ',
        )}], история: [${unitTypeHistory.join(', ')}]`,
      );
      return null;
    }

    const weighted = filtered.map((t) => {
      let w = 0;
      for (const [, tier] of Object.entries(tieredSubfactions) as [
        'S' | 'A' | 'B' | 'C',
        { probability: number; subfactions: string[] },
      ][]) {
        if (tier.subfactions.includes(t)) {
          w = tier.probability;
          break;
        }
      }
      if (w <= 0) w = 1;
      return { item: t, weight: w };
    });

    const chosen = weightedRandom(weighted);
    if (!chosen) {
      return filtered[Math.floor(Math.random() * filtered.length)];
    }
    logger.log(
      `DEBUG: [pickWeightedUnitType] Из [${available.join(
        ', ',
      )}] (filtered: [${filtered.join(', ')}]) выбран тип: ${chosen}`,
    );
    return chosen;
  }

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

    const availableTypes1: string[] = teamObj[alliance1][faction1] ?? [];
    const availableTypes2: string[] = teamObj[alliance2][faction2] ?? [];
    if (!availableTypes1.length || !availableTypes2.length) return null;

    const mustAsymmetric =
      availableTypes1.length <= 1 || availableTypes2.length <= 1;

    if (symmetricUnitTypes && !mustAsymmetric) {
      let intersection = availableTypes1.filter(
        (t) => availableTypes2.includes(t) && !unitTypeHistory.includes(t),
      );
      if (intersection.length > 0) {
        const chosenType = pickWeightedUnitType(intersection, unitTypeHistory);
        if (chosenType) {
          logger.log(
            `DEBUG: [pickSymmetricUnitTypes] Симметрия (с историей): ${chosenType}`,
          );
          return { type1: chosenType, type2: chosenType };
        }
      }
      intersection = availableTypes1.filter((t) => availableTypes2.includes(t));
      if (intersection.length > 0) {
        const chosenType = pickWeightedUnitType(intersection, []);
        if (chosenType) {
          logger.log(
            `DEBUG: [pickSymmetricUnitTypes] Симметрия (без истории): ${chosenType}`,
          );
          return { type1: chosenType, type2: chosenType };
        }
      }

      logger.log(
        `DEBUG: [pickSymmetricUnitTypes] Пересечение пусто — переключаемся на асимметрию.`,
      );
    } else if (symmetricUnitTypes && mustAsymmetric) {
      logger.log(
        `DEBUG: [pickSymmetricUnitTypes] У одной из фракций ≤1 типа — принудительно асимметрия.`,
      );
    }

    let type1 = pickWeightedUnitType(
      availableTypes1.filter((t) => !unitTypeHistory.includes(t)),
      unitTypeHistory,
    );
    let type2 = pickWeightedUnitType(
      availableTypes2.filter((t) => !unitTypeHistory.includes(t)),
      unitTypeHistory,
    );

    if (!type1) type1 = pickWeightedUnitType(availableTypes1, []);
    if (!type2) type2 = pickWeightedUnitType(availableTypes2, []);
    if (!type1 || !type2) return null;

    logger.log(
      `DEBUG: [pickSymmetricUnitTypes] Асимметрия: ${faction1}=${type1}, ${faction2}=${type2}`,
    );
    return { type1, type2 };
  }

  function pickUnitTypesForSeparateTeams(
    team1Data: TTeamFactions,
    team2Data: TTeamFactions,
    faction1: string,
    faction2: string,
    unitTypeHistory: string[],
    symmetricUnitTypes: boolean,
  ): { type1: string; type2: string } | null {
    const alliance1 = getAllianceForFactionFromMap(team1Data, faction1);
    const alliance2 = getAllianceForFactionFromMap(team2Data, faction2);
    if (!alliance1 || !alliance2) return null;
    const availableTypes1: string[] = team1Data[alliance1][faction1];
    const availableTypes2: string[] = team2Data[alliance2][faction2];
    if (!availableTypes1?.length || !availableTypes2?.length) return null;

    if (symmetricUnitTypes) {
      let intersection = availableTypes1.filter(
        (type) =>
          availableTypes2.includes(type) && !unitTypeHistory.includes(type),
      );
      if (intersection.length > 0) {
        const chosenType = pickWeightedUnitType(intersection, unitTypeHistory);
        if (chosenType) {
          logger.log(
            `DEBUG: [pickUnitTypesForSeparateTeams] (с историей) Выбран единый тип: ${chosenType} из пересечения: [${intersection.join(
              ', ',
            )}]`,
          );
          return { type1: chosenType, type2: chosenType };
        }
      }
      intersection = availableTypes1.filter((type) =>
        availableTypes2.includes(type),
      );
      if (intersection.length > 0) {
        const chosenType = pickWeightedUnitType(intersection, []);
        if (chosenType) {
          logger.log(
            `DEBUG: [pickUnitTypesForSeparateTeams] (без истории) Выбран единый тип: ${chosenType} из пересечения: [${intersection.join(
              ', ',
            )}]`,
          );
          return { type1: chosenType, type2: chosenType };
        }
      }
    }

    let type1 = pickWeightedUnitType(
      availableTypes1.filter((t) => !unitTypeHistory.includes(t)),
      unitTypeHistory,
    );
    let type2 = pickWeightedUnitType(
      availableTypes2.filter((t) => !unitTypeHistory.includes(t)),
      unitTypeHistory,
    );
    if (!type1) {
      logger.log(
        `DEBUG: [pickUnitTypesForSeparateTeams] Не удалось выбрать тип для ${faction1} с учетом истории, игнорируем историю.`,
      );
      type1 = pickWeightedUnitType(availableTypes1, []);
    }
    if (!type2) {
      logger.log(
        `DEBUG: [pickUnitTypesForSeparateTeams] Не удалось выбрать тип для ${faction2} с учетом истории, игнорируем историю.`,
      );
      type2 = pickWeightedUnitType(availableTypes2, []);
    }
    if (!type1 || !type2) return null;
    logger.log(
      `DEBUG: [pickUnitTypesForSeparateTeams] Итоговый выбор: type1=${type1}, type2=${type2}.`,
    );
    return { type1, type2 };
  }

  async function pickRandomMap(): Promise<string> {
    const recentHistory = await getHistoryLayers(id);
    const modes = mode.split(',').map((m) => m.trim());
    let candidates: {
      level: string;
      layer: string;
      tierProbability: number;
    }[] = [];

    for (const [tierKey, tier] of Object.entries(tieredMaps) as [
      TierKey,
      { probability: number; maps: string[] },
    ][]) {
      for (const shortMapName of tier.maps) {
        if (recentHistory.includes(shortMapName)) continue;
        const availableKeys = Object.keys(maps).filter((key) =>
          modes.some((m) => key.startsWith(`${shortMapName}_${m}`)),
        );
        if (availableKeys.length === 0) {
          logger.log(
            `DEBUG: [pickRandomMap] Для карты "${shortMapName}" не найдены ключи с режимами [${modes.join(
              ', ',
            )}].`,
          );
          continue;
        }
        const randomKey = randomArrayElement(availableKeys);
        const layerData = maps[randomKey];
        if (!layerData) continue;
        let layerName: string;
        if (typeof layerData.layerName === 'string' && layerData.layerName) {
          layerName = layerData.layerName;
        } else if (
          layerData.layerName &&
          typeof layerData.layerName === 'object'
        ) {
          const keys = Object.keys(layerData.layerName);
          layerName = keys.length ? keys[0] : randomKey;
        } else {
          layerName = randomKey;
        }
        candidates.push({
          level: shortMapName,
          layer: layerName,
          tierProbability: tier.probability,
        });
      }
    }

    if (candidates.length === 0) {
      logger.log(
        `DEBUG: [pickRandomMap] Нет доступных карт после фильтрации по истории, пробуем игнорировать историю.`,
      );
      for (const [tierKey, tier] of Object.entries(tieredMaps) as [
        TierKey,
        { probability: number; maps: string[] },
      ][]) {
        for (const shortMapName of tier.maps) {
          const availableKeys = Object.keys(maps).filter((key) =>
            modes.some((m) => key.startsWith(`${shortMapName}_${m}`)),
          );
          if (availableKeys.length === 0) continue;
          const randomKey = randomArrayElement(availableKeys);
          const layerData = maps[randomKey];
          if (!layerData) continue;
          let layerName: string;
          if (typeof layerData.layerName === 'string' && layerData.layerName) {
            layerName = layerData.layerName;
          } else if (
            layerData.layerName &&
            typeof layerData.layerName === 'object'
          ) {
            const keys = Object.keys(layerData.layerName);
            layerName = keys.length ? keys[0] : randomKey;
          } else {
            layerName = randomKey;
          }
          candidates.push({
            level: shortMapName,
            layer: layerName,
            tierProbability: tier.probability,
          });
        }
      }
      if (candidates.length === 0) {
        logger.log(
          `DEBUG: [pickRandomMap] Нет доступных карт даже без фильтрации, устанавливаем карту по умолчанию.`,
        );
        return 'Narva_AAS_v1';
      }
    }

    const chosenCandidate = weightedRandom(
      candidates.map((c) => ({ item: c, weight: c.tierProbability })),
    );
    if (!chosenCandidate) {
      logger.log(
        `DEBUG: [pickRandomMap] Выбор карты завершился неудачей, устанавливаем карту по умолчанию.`,
      );
      return 'Narva_AAS_v1';
    }

    await serverHistoryLayers(id, chosenCandidate.level);
    recentHistory.push(chosenCandidate.level);
    while (recentHistory.length > excludeCountLayersNumber) {
      recentHistory.shift();
      await cleanHistoryLayers(id);
    }
    logger.log(
      `DEBUG: [pickRandomMap] Выбрана карта: ${chosenCandidate.layer} (уровень: ${chosenCandidate.level})`,
    );
    return chosenCandidate.layer;
  }

  const newGame = async () => {
    try {
      logger.log('DEBUG: [newGame] Начало генерации новой игры.');

      const chosenLayer = await pickRandomMap();
      logger.log(`DEBUG: [newGame] Выбран слой: ${chosenLayer}`);

      const factionHistory = await getHistoryFactions(id);
      let factions = pickFactionsForTeams(chosenLayer, factionHistory);
      if (!factions) {
        logger.log(
          `DEBUG: [newGame] Не удалось выбрать фракции с учётом истории.`,
        );
        return;
      }
      await serverHistoryFactions(id, factions.team1);
      await serverHistoryFactions(id, factions.team2);
      factionHistory.push(factions.team1, factions.team2);
      while (factionHistory.length > excludeCountFactionsNumber) {
        factionHistory.shift();
        await cleanHistoryFactions(id);
      }
      logger.log(
        `DEBUG: [newGame] Выбраны фракции: ${factions.team1} и ${factions.team2}`,
      );

      const layerData = maps[chosenLayer];
      if (!layerData) {
        logger.log(
          `DEBUG: [newGame] Данные для слоя ${chosenLayer} не найдены.`,
        );
        return;
      }

      let unitTypes: { type1: string; type2: string } | null = null;

      if (layerData['Team1 / Team2']) {
        const teamObj: TTeamFactions = layerData['Team1 / Team2'];
        unitTypes = pickSymmetricUnitTypes(
          teamObj,
          factions.team1,
          factions.team2,
          await getHistoryUnitTypes(id),
          symmetricUnitTypesBoolean,
        );
      } else if (layerData.Team1 && layerData.Team2) {
        unitTypes = pickUnitTypesForSeparateTeams(
          layerData.Team1,
          layerData.Team2,
          factions.team1,
          factions.team2,
          await getHistoryUnitTypes(id),
          symmetricUnitTypesBoolean,
        );
      } else {
        logger.log(
          `DEBUG: [newGame] Карта ${chosenLayer} не поддерживает требуемый формат фракций.`,
        );
        return;
      }

      if (!unitTypes) {
        logger.log(
          `DEBUG: [newGame] Не удалось выбрать типы юнитов с учётом истории.`,
        );
        return;
      }
      const unitTypeHistory = await getHistoryUnitTypes(id);
      await serverHistoryUnitTypes(id, unitTypes.type1);
      await serverHistoryUnitTypes(id, unitTypes.type2);
      unitTypeHistory.push(unitTypes.type1, unitTypes.type2);
      while (unitTypeHistory.length > excludeCountUnitTypesNumber) {
        unitTypeHistory.shift();
        await cleanHistoryUnitTypes(id);
      }
      logger.log(
        `DEBUG: [newGame] Выбраны типы юнитов: ${unitTypes.type1} и ${unitTypes.type2}`,
      );

      const finalString = `${chosenLayer} ${factions.team1}+${unitTypes.type1} ${factions.team2}+${unitTypes.type2}`;
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
