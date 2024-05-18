import fs from 'fs';
import path from 'path';
import url from 'url';
import {
  TFactionUnitTypes,
  TLogger,
  TMapTeams,
  TTeamFactions,
} from '../../types';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

export const initMaps = async (mapsName: string, logger: TLogger) => {
  logger.log('Loading maps');

  const filePath = path.resolve(__dirname, mapsName);

  if (!fs.existsSync(filePath)) {
    logger.error(`Maps ${mapsName} not found`);
    process.exit(1);
  }

  return new Promise<TMapTeams>((res) => {
    const data: TMapTeams = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!data || Object.keys(data).length === 0) {
      logger.error(`Maps ${mapsName} empty or invalid`);
      process.exit(1);
    }

    const maps: TMapTeams = {};

    for (const mapName in data) {
      const teams = data[mapName];
      const teamsInfo: TTeamFactions = {};
      for (const teamName in teams) {
        const factions = teams[teamName];
        const factionsInfo: TFactionUnitTypes = {};
        for (const factionName in factions) {
          const unitTypes = factions[factionName];
          factionsInfo[factionName] = unitTypes;
        }
        teamsInfo[teamName] = factionsInfo;
      }
      maps[mapName] = teamsInfo;
    }

    logger.log('Loaded maps');

    res(maps);
  });
};
