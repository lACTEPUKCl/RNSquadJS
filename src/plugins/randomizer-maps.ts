import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminSetNextLayer } from '../core';
import { definePlugin } from '../core/plugin';
import {
  getHistoryFactions,
  getHistoryLayers,
  getHistoryUnitTypes,
  serverHistoryFactions,
  serverHistoryLayers,
  serverHistoryUnitTypes,
} from '../rnsdb';
import { TTeamFactions } from '../types';

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

const mapTierSchema = z.object({
  probability: z.coerce.number().min(0),
  maps: z.array(z.string()),
});
const factionTierSchema = z.object({
  probability: z.coerce.number().min(0),
  factions: z.array(z.string()),
});
const subfactionTierSchema = z.object({
  probability: z.coerce.number().min(0),
  subfactions: z.array(z.string()),
});
const tieredMapsSchema = z.object({
  S: mapTierSchema,
  A: mapTierSchema,
  B: mapTierSchema,
  C: mapTierSchema,
});
const tieredFactionsSchema = z.object({
  S: factionTierSchema,
  A: factionTierSchema,
  B: factionTierSchema,
  C: factionTierSchema,
});
const tieredSubfactionsSchema = z.object({
  S: subfactionTierSchema,
  A: subfactionTierSchema,
  B: subfactionTierSchema,
  C: subfactionTierSchema,
});

const optionsSchema = z.object({
  mode: z.string().default('AAS'),
  symmetricUnitTypes: z.boolean().default(false),
  excludeCountLayers: z.coerce.number().min(0).default(4),
  excludeCountFactions: z.coerce.number().min(0).default(3),
  excludeCountUnitTypes: z.coerce.number().min(0).default(2),
  allowSameAllianceExceptRedfor: z.boolean().default(false),
  disallowMirrorFactions: z.boolean().default(true),
  fallbackLayer: z.string().default('Narva_AAS_v1'),

  debug: z.boolean().default(false),

  tieredMaps: tieredMapsSchema.default(DEFAULT_TIERED_MAPS),
  tieredFactions: tieredFactionsSchema.default(DEFAULT_TIERED_FACTIONS),
  tieredSubfactions: tieredSubfactionsSchema.default(
    DEFAULT_TIERED_SUBFACTIONS,
  ),
});

export default definePlugin({
  name: 'randomizerMaps',
  description: 'Рандомизация карт, фракций и типов юнитов на новой игре.',
  optionsSchema,
  setup({ state, options, registerDisposable }) {
    const { id, listener, logger, maps, execute } = state;
    const {
      mode,
      symmetricUnitTypes,
      excludeCountLayers,
      excludeCountFactions,
      excludeCountUnitTypes,
      allowSameAllianceExceptRedfor,
      disallowMirrorFactions,
      fallbackLayer,
      debug,
      tieredMaps,
      tieredFactions,
      tieredSubfactions,
    } = options;

    const dbg = (m: string) => {
      if (debug) logger.log(m);
    };

    function normalizeAllianceKey(alliance: string | null): string {
      return (alliance ?? '').trim().toUpperCase();
    }

    function isRedforAlliance(alliance: string | null): boolean {
      return normalizeAllianceKey(alliance).startsWith('REDFOR');
    }

    function isPacAlliance(alliance: string | null): boolean {
      return normalizeAllianceKey(alliance).startsWith('PAC');
    }

    function isAllianceMatchAllowed(
      alliance1: string | null,
      alliance2: string | null,
    ): boolean {
      const a1 = normalizeAllianceKey(alliance1);
      const a2 = normalizeAllianceKey(alliance2);

      if (!a1 || !a2) return false;

      if (a1 !== a2) return true;

      if (!allowSameAllianceExceptRedfor) return false;

      return !isRedforAlliance(a1) && !isPacAlliance(a1);
    }

    function filterMirrorFactions(
      factions: string[],
      faction1: string,
    ): string[] {
      if (!disallowMirrorFactions) return factions;
      return factions.filter((f) => f !== faction1);
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

    function weightByTier<T>(
      items: T[],
      meta: (item: T) => { prob: number; tier: string } | null,
    ): { item: T; weight: number }[] {
      const picked = items
        .map((it) => ({ it, m: meta(it) }))
        .filter(
          (x): x is { it: T; m: { prob: number; tier: string } } =>
            x.m !== null && x.m.prob > 0,
        );
      const counts = new Map<string, number>();
      for (const x of picked)
        counts.set(x.m.tier, (counts.get(x.m.tier) ?? 0) + 1);
      return picked.map((x) => ({
        item: x.it,
        weight: x.m.prob / (counts.get(x.m.tier) ?? 1),
      }));
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
      return Object.values(teamObj).flatMap((alliance) =>
        Object.keys(alliance),
      );
    }

    function pickRandomFaction(available: string[]): string | null {
      const weightedFactions = weightByTier(available, (faction) => {
        const tier = getFactionTier(faction);
        return tier ? { prob: tieredFactions[tier].probability, tier } : null;
      });
      const chosen = weightedRandom(weightedFactions);
      dbg(
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
      dbg(
        `DEBUG: [getAllianceForFactionFromMap] Фракция "${faction}" не найдена ни в одном альянсе.`,
      );
      return null;
    }

    function pickTwoDistinctFactions(
      teamObj: TTeamFactions,
      factionHistory: string[],
    ): { team1: string; team2: string } | null {
      const availableFactions = getAvailableFactions(teamObj).filter(
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
      availableFactions2 = filterMirrorFactions(availableFactions2, faction1);
      if (availableFactions2.length === 0) {
        dbg(
          `DEBUG: [pickTwoDistinctFactions] Недостаточно фракций для второй команды после фильтрации, пробуем игнорировать историю.`,
        );
        availableFactions2 = getAvailableFactions(teamObj).filter((f) =>
          isAllianceMatchAllowed(
            alliance1,
            getAllianceForFactionFromMap(teamObj, f),
          ),
        );
        availableFactions2 = filterMirrorFactions(availableFactions2, faction1);
        if (availableFactions2.length === 0) return null;
      }
      const faction2 = pickRandomFaction(availableFactions2);
      if (!faction2) return null;
      dbg(
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
          dbg(
            'DEBUG: [pickFactionsForTeams] Не удалось выбрать фракции с учетом истории, пробуем игнорировать историю.',
          );
          factions = pickTwoDistinctFactions(combined, []);
        }
        return factions;
      } else if (layerData.Team1 && layerData.Team2) {
        const team1Data = layerData.Team1;
        const team2Data = layerData.Team2;

        const availableTeam1 = getAvailableFactions(team1Data).filter(
          (f) => !factionHistory.includes(f),
        );
        let faction1 = pickRandomFaction(availableTeam1);

        if (!faction1) {
          dbg(
            'DEBUG: [pickFactionsForTeams] Не удалось выбрать фракцию Team1 с учетом истории, пробуем игнорировать историю.',
          );
          faction1 = pickRandomFaction(getAvailableFactions(team1Data));
        }
        if (!faction1) return null;

        const alliance1 = getAllianceForFactionFromMap(team1Data, faction1);

        let availableTeam2 = filterMirrorFactions(
          getAvailableFactions(team2Data)
            .filter((f) => !factionHistory.includes(f))
            .filter((f) => {
              const alliance2 = getAllianceForFactionFromMap(team2Data, f);
              return isAllianceMatchAllowed(alliance1, alliance2);
            }),
          faction1,
        );

        let faction2 = pickRandomFaction(availableTeam2);
        if (!faction2) {
          dbg(
            'DEBUG: [pickFactionsForTeams] Не удалось выбрать фракцию Team2 с учетом истории и альянса, пробуем игнорировать историю.',
          );
          availableTeam2 = filterMirrorFactions(
            getAvailableFactions(team2Data).filter((f) => {
              const alliance2 = getAllianceForFactionFromMap(team2Data, f);
              return isAllianceMatchAllowed(alliance1, alliance2);
            }),
            faction1,
          );
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
        dbg(
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
      dbg(
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
          const chosenType = pickWeightedUnitType(
            intersection,
            unitTypeHistory,
          );
          if (chosenType) {
            dbg(
              `DEBUG: [pickSymmetricUnitTypes] Симметрия (с историей): ${chosenType}`,
            );
            return { type1: chosenType, type2: chosenType };
          }
        }
        intersection = availableTypes1.filter((t) =>
          availableTypes2.includes(t),
        );
        if (intersection.length > 0) {
          const chosenType = pickWeightedUnitType(intersection, []);
          if (chosenType) {
            dbg(
              `DEBUG: [pickSymmetricUnitTypes] Симметрия (без истории): ${chosenType}`,
            );
            return { type1: chosenType, type2: chosenType };
          }
        }

        dbg(
          `DEBUG: [pickSymmetricUnitTypes] Пересечение пусто — переключаемся на асимметрию.`,
        );
      } else if (symmetricUnitTypes && mustAsymmetric) {
        dbg(
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

      dbg(
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
          const chosenType = pickWeightedUnitType(
            intersection,
            unitTypeHistory,
          );
          if (chosenType) {
            dbg(
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
            dbg(
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
        dbg(
          `DEBUG: [pickUnitTypesForSeparateTeams] Не удалось выбрать тип для ${faction1} с учетом истории, игнорируем историю.`,
        );
        type1 = pickWeightedUnitType(availableTypes1, []);
      }
      if (!type2) {
        dbg(
          `DEBUG: [pickUnitTypesForSeparateTeams] Не удалось выбрать тип для ${faction2} с учетом истории, игнорируем историю.`,
        );
        type2 = pickWeightedUnitType(availableTypes2, []);
      }
      if (!type1 || !type2) return null;
      dbg(
        `DEBUG: [pickUnitTypesForSeparateTeams] Итоговый выбор: type1=${type1}, type2=${type2}.`,
      );
      return { type1, type2 };
    }

    function resolveLayerName(
      layerData: { layerName?: unknown },
      fallbackKey: string,
    ): string {
      const ln = layerData.layerName;
      if (typeof ln === 'string' && ln) return ln;
      if (ln && typeof ln === 'object') {
        const keys = Object.keys(ln as Record<string, unknown>);
        return keys.length ? keys[0] : fallbackKey;
      }
      return fallbackKey;
    }

    type MapCandidate = { level: string; layer: string; tier: TierKey };

    function buildMapCandidates(
      recentHistory: string[],
      useHistory: boolean,
    ): MapCandidate[] {
      const modes = mode.split(',').map((m) => m.trim());
      const out: MapCandidate[] = [];
      for (const [tier, tierData] of Object.entries(tieredMaps) as [
        TierKey,
        { probability: number; maps: string[] },
      ][]) {
        for (const shortMapName of tierData.maps) {
          if (useHistory && recentHistory.includes(shortMapName)) continue;
          const availableKeys = Object.keys(maps).filter((key) =>
            modes.some((m) => key.startsWith(`${shortMapName}_${m}`)),
          );
          if (availableKeys.length === 0) {
            dbg(
              `DEBUG: [buildMapCandidates] Для карты "${shortMapName}" не найдены ключи с режимами [${modes.join(
                ', ',
              )}].`,
            );
            continue;
          }
          const randomKey = randomArrayElement(availableKeys);
          const layerData = maps[randomKey];
          if (!layerData) continue;
          out.push({
            level: shortMapName,
            layer: resolveLayerName(layerData, randomKey),
            tier,
          });
        }
      }
      return out;
    }

    async function pickRandomMap(): Promise<string> {
      const recentHistory = await getHistoryLayers(id);
      let candidates = buildMapCandidates(recentHistory, true);
      if (candidates.length === 0) {
        dbg(
          `DEBUG: [pickRandomMap] Нет карт после фильтра по истории, игнорируем историю.`,
        );
        candidates = buildMapCandidates(recentHistory, false);
      }
      if (candidates.length === 0) {
        dbg(
          `DEBUG: [pickRandomMap] Нет доступных карт, фолбэк: ${fallbackLayer}.`,
        );
        return fallbackLayer;
      }

      const chosen = weightedRandom(
        weightByTier(candidates, (c) => ({
          prob: tieredMaps[c.tier].probability,
          tier: c.tier,
        })),
      );
      if (!chosen) {
        dbg(
          `DEBUG: [pickRandomMap] Выбор не удался, фолбэк: ${fallbackLayer}.`,
        );
        return fallbackLayer;
      }

      await serverHistoryLayers(id, chosen.level, excludeCountLayers);
      dbg(
        `DEBUG: [pickRandomMap] Выбрана карта: ${chosen.layer} (уровень: ${chosen.level}, тир: ${chosen.tier})`,
      );
      return chosen.layer;
    }

    const newGame = async () => {
      try {
        dbg('DEBUG: [newGame] Начало генерации новой игры.');

        const chosenLayer = await pickRandomMap();
        dbg(`DEBUG: [newGame] Выбран слой: ${chosenLayer}`);

        const factionHistory = await getHistoryFactions(id);
        const factions = pickFactionsForTeams(chosenLayer, factionHistory);
        if (!factions) {
          dbg(`DEBUG: [newGame] Не удалось выбрать фракции с учётом истории.`);
          return;
        }
        await serverHistoryFactions(
          id,
          [factions.team1, factions.team2],
          excludeCountFactions,
        );
        dbg(
          `DEBUG: [newGame] Выбраны фракции: ${factions.team1} и ${factions.team2}`,
        );

        const layerData = maps[chosenLayer];
        if (!layerData) {
          dbg(`DEBUG: [newGame] Данные для слоя ${chosenLayer} не найдены.`);
          return;
        }

        const unitTypeHistory = await getHistoryUnitTypes(id);
        let unitTypes: { type1: string; type2: string } | null = null;

        if (layerData['Team1 / Team2']) {
          unitTypes = pickSymmetricUnitTypes(
            layerData['Team1 / Team2'],
            factions.team1,
            factions.team2,
            unitTypeHistory,
            symmetricUnitTypes,
          );
        } else if (layerData.Team1 && layerData.Team2) {
          unitTypes = pickUnitTypesForSeparateTeams(
            layerData.Team1,
            layerData.Team2,
            factions.team1,
            factions.team2,
            unitTypeHistory,
            symmetricUnitTypes,
          );
        } else {
          dbg(
            `DEBUG: [newGame] Карта ${chosenLayer} не поддерживает требуемый формат фракций.`,
          );
          return;
        }

        if (!unitTypes) {
          dbg(
            `DEBUG: [newGame] Не удалось выбрать типы юнитов с учётом истории.`,
          );
          return;
        }
        await serverHistoryUnitTypes(
          id,
          [unitTypes.type1, unitTypes.type2],
          excludeCountUnitTypes,
        );
        dbg(
          `DEBUG: [newGame] Выбраны типы юнитов: ${unitTypes.type1} и ${unitTypes.type2}`,
        );

        const finalString = `${chosenLayer} ${factions.team1}+${unitTypes.type1} ${factions.team2}+${unitTypes.type2}`;
        logger.log(`[randomizerMaps] Следующий слой: ${finalString}`);
        adminSetNextLayer(execute, finalString);
      } catch (error) {
        logger.error(
          `[randomizerMaps] Ошибка генерации новой игры: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    };

    listener.on(EVENTS.NEW_GAME, newGame);

    registerDisposable(() => {
      listener.off(EVENTS.NEW_GAME, newGame);
    });
  },
});
