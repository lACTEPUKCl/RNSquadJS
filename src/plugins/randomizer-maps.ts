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
  for (const [, tier] of tiers) {
    if (tier.factions.includes(faction)) {
      return tiers.find(([, t]) => t.factions.includes(faction))?.[0] || null;
    }
  }
  return null;
}

function randomArrayElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function isExcludedByHistory(
  history: string[],
  excludeCount: number,
  candidate: string,
): boolean {
  return history.slice(-excludeCount).includes(candidate);
}

export const randomizerMaps: TPluginProps = (state, options) => {
  const { listener, logger, maps, execute, nextMap } = state;
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

  async function pickRandomMap(): Promise<string> {
    const recentHistory = await getHistoryLayers(state.id);
    const maxAttempts = 10;
    let attempt = 0;
    let chosenMap: string | null = null;

    while (attempt < maxAttempts && !chosenMap) {
      const layerObj = getRandomLayerTiered();
      if (!layerObj) {
        chosenMap = 'Narva_AAS_v1';
        break;
      }
      const { level, layer } = layerObj;
      if (isExcludedByHistory(recentHistory, excludeCountLayersNumber, level)) {
        attempt++;
        continue;
      }

      await serverHistoryLayers(state.id, level);
      recentHistory.push(level);
      while (recentHistory.length > excludeCountLayersNumber) {
        recentHistory.shift();
        await cleanHistoryLayers(state.id);
      }
      chosenMap = layer;
    }

    if (!chosenMap) {
      logger.log(
        'Превышено число попыток выбора карты, используется Narva_AAS_v1.',
      );
      chosenMap = 'Narva_AAS_v1';
    }
    return chosenMap;
  }

  function getRandomLayerTiered(): { layer: string; level: string } | null {
    const tiers = Object.entries(tieredMaps) as [
      TierKey,
      { probability: number; maps: string[] },
    ][];
    const totalProb = tiers.reduce(
      (acc, [, tier]) => acc + tier.probability,
      0,
    );
    const rnd = Math.random() * totalProb;
    let cumulative = 0;
    for (const [, tier] of tiers) {
      cumulative += tier.probability;
      if (rnd <= cumulative) {
        const mapsInTier = tier.maps;
        if (mapsInTier.length === 0) return null;
        const shortMapName = randomArrayElement(mapsInTier);
        const modes = mode.split(',').map((m) => m.trim());
        const availableKeys = Object.keys(maps).filter((key) =>
          modes.some((m) => key.startsWith(`${shortMapName}_${m}`)),
        );
        if (availableKeys.length === 0) return null;
        const randomKey = randomArrayElement(availableKeys);
        const layerData = maps[randomKey];
        if (!layerData) return null;
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
        return { level: shortMapName, layer: layerName };
      }
    }
    return null;
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
    return weightedRandom(weightedFactions);
  }

  function getAllianceForFactionFromMap(
    teamObj: TTeamFactions,
    faction: string,
  ): string | null {
    for (const [alliance, factions] of Object.entries(teamObj)) {
      if (factions.hasOwnProperty(faction)) return alliance;
    }
    logger.log(`Фракция "${faction}" не найдена ни в одном альянсе.`);
    return null;
  }

  function pickTwoDistinctFactions(
    teamObj: TTeamFactions,
  ): { team1: string; team2: string } | null {
    const availableFactions = getAvailableFactions(teamObj);
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

  function pickFactionsForTeams(
    layerKey: string,
  ): { team1: string; team2: string } | null {
    const layerData = maps[layerKey];
    if (!layerData) return null;
    const { ['Team1 / Team2']: combined, Team1, Team2 } = layerData;
    if (combined) {
      return pickTwoDistinctFactions(combined);
    } else if (Team1 && Team2) {
      const faction1 = pickRandomFaction(getAvailableFactions(Team1));
      const faction2 = pickRandomFaction(getAvailableFactions(Team2));
      if (!faction1 || !faction2) return null;
      return { team1: faction1, team2: faction2 };
    } else {
      logger.log(
        `Ни формат "Team1 / Team2", ни отдельные Team1 и Team2 не найдены в карте ${layerKey}`,
      );
      return null;
    }
  }

  function pickSymmetricUnitTypes(
    teamObj: TTeamFactions,
    faction1: string,
    faction2: string,
  ): { type1: string; type2: string } | null {
    const alliance1 = getAllianceForFactionFromMap(teamObj, faction1);
    const alliance2 = getAllianceForFactionFromMap(teamObj, faction2);
    if (!alliance1 || !alliance2) return null;
    const availableTypes1: string[] = teamObj[alliance1][faction1];
    const availableTypes2: string[] = teamObj[alliance2][faction2];
    if (!availableTypes1?.length || !availableTypes2?.length) return null;

    if (symmetricUnitTypes) {
      const intersection = availableTypes1.filter((type) =>
        availableTypes2.includes(type),
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

  const newGame = async () => {
    try {
      const chosenLayer = await pickRandomMap();
      const factionHistory = await getHistoryFactions(state.id);
      let factions: { team1: string; team2: string } | null = null;
      while (true) {
        const candidateFactions = pickFactionsForTeams(chosenLayer);
        if (!candidateFactions) {
          continue;
        }
        if (
          isExcludedByHistory(
            factionHistory,
            excludeCountLayersNumber,
            candidateFactions.team1,
          ) ||
          isExcludedByHistory(
            factionHistory,
            excludeCountLayersNumber,
            candidateFactions.team2,
          )
        ) {
          continue;
        }
        factions = candidateFactions;
        await serverHistoryFactions(state.id, factions.team1);
        await serverHistoryFactions(state.id, factions.team2);
        factionHistory.push(factions.team1, factions.team2);
        while (factionHistory.length > excludeCountFactionsNumber) {
          factionHistory.shift();
          await cleanHistoryFactions(state.id);
        }
        break;
      }

      const layerData = maps[chosenLayer];
      if (!layerData) {
        logger.log(`Данные для слоя ${chosenLayer} не найдены.`);
        return;
      }
      if (!layerData['Team1 / Team2']) {
        logger.log(
          `Карта ${chosenLayer} не поддерживает формат "Team1 / Team2".`,
        );
        return;
      }
      const teamObj: TTeamFactions = layerData['Team1 / Team2'];
      const unitTypeHistory = await getHistoryUnitTypes(state.id);
      let unitTypes: { type1: string; type2: string } | null = null;
      while (true) {
        const candidateUnitTypes = pickSymmetricUnitTypes(
          teamObj,
          factions.team1,
          factions.team2,
        );
        if (!candidateUnitTypes) {
          continue;
        }
        if (
          isExcludedByHistory(
            unitTypeHistory,
            excludeCountUnitTypesNumber,
            candidateUnitTypes.type1,
          ) ||
          isExcludedByHistory(
            unitTypeHistory,
            excludeCountUnitTypesNumber,
            candidateUnitTypes.type2,
          )
        ) {
          continue;
        }
        unitTypes = candidateUnitTypes;
        await serverHistoryUnitTypes(state.id, candidateUnitTypes.type1);
        await serverHistoryUnitTypes(state.id, candidateUnitTypes.type2);
        unitTypeHistory.push(
          candidateUnitTypes.type1,
          candidateUnitTypes.type2,
        );
        while (unitTypeHistory.length > excludeCountUnitTypesNumber) {
          unitTypeHistory.shift();
          await cleanHistoryUnitTypes(state.id);
        }
        break;
      }

      const finalString = `${chosenLayer} ${factions.team1}+${unitTypes.type1} ${factions.team2}+${unitTypes.type2}`;
      logger.log(`Следующая карта: ${finalString}`);
      adminSetNextLayer(execute, finalString);
    } catch (error) {
      logger.log(
        `Ошибка в newGame: ${error instanceof Error ? error.message : error}`,
      );
    }
  };

  listener.on(EVENTS.NEW_GAME, newGame);
};
