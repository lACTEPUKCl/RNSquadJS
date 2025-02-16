import fs from 'fs';
import path from 'path';
import url from 'url';
import { TLogger, TMaps } from '../../types';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

export const initMaps = async (
  mapsName: string,
  logger: TLogger,
): Promise<TMaps> => {
  logger.log('Loading maps');

  const filePath = path.resolve(__dirname, mapsName);

  if (!fs.existsSync(filePath)) {
    logger.error(`Maps file "${mapsName}" not found`);
    process.exit(1);
  }

  let rawData: string;
  try {
    rawData = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    logger.error(`Error reading file "${mapsName}": ${err}`);
    process.exit(1);
  }

  let data: unknown;
  try {
    data = JSON.parse(rawData);
  } catch (err) {
    logger.error(`Error parsing JSON in "${mapsName}": ${err}`);
    process.exit(1);
  }

  if (!data || typeof data !== 'object') {
    logger.error(`Maps file "${mapsName}" is empty or invalid`);
    process.exit(1);
  }

  const maps = data as TMaps;

  for (const mapName in maps) {
    const mapData = maps[mapName];
    if (
      !(
        (mapData['Team1 / Team2'] &&
          typeof mapData['Team1 / Team2'] === 'object') ||
        (mapData.Team1 &&
          typeof mapData.Team1 === 'object' &&
          mapData.Team2 &&
          typeof mapData.Team2 === 'object')
      )
    ) {
      logger.error(`Map "${mapName}" has an invalid team structure`);
      process.exit(1);
    }
  }

  logger.log('Loaded maps');
  return maps;
};
