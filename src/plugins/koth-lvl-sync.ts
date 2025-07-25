import fs from 'fs/promises';
import path from 'path';
import { TPlayerConnected } from 'squad-logs';
import { EVENTS } from '../constants';
import { TPlayer, TPluginProps } from '../types';
import { getPlayerBySteamID } from './helpers';

export const levelSync: TPluginProps = (state, options) => {
  const { listener, logger } = state;
  const { jsonDir, cfgPath } = options;

  const updatePlayerLevel = async (steamID: string, eosID: string) => {
    try {
      const jsonPath = path.join(jsonDir, `${steamID}.json`);
      const jsonRaw = await fs.readFile(jsonPath, 'utf-8');
      const json = JSON.parse(jsonRaw);

      const xp = json?.['save data']?.xp ?? 0;
      const level = Math.floor((Math.sqrt((4 * xp) / 75 + 1) + 1) / 2);

      let cfgContent = '';
      try {
        cfgContent = await fs.readFile(cfgPath, 'utf-8');
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }

      const lines = cfgContent.split('\n');
      const eosRegex = new RegExp(`^${eosID}:`);

      let found = false;
      const newLines = lines.map((line) => {
        if (eosRegex.test(line)) {
          found = true;
          return line
            .replace(/LVL \d+/i, `LVL ${level}`)
            .replace(/XP: \d+/i, `XP: ${xp}`);
        }
        return line;
      });

      if (!found) {
        const newLine = `${eosID}: LVL ${level} /URLA:some_image_url, "255,215,0,255" // XP: ${xp}`;
        newLines.push(newLine);
      }

      await fs.writeFile(cfgPath, newLines.join('\n'), 'utf-8');
    } catch (err) {
      logger.warn(`[levelSync] Не удалось обновить уровень для ${steamID}`);
    }
  };

  const onPlayerConnected = async (data: TPlayerConnected) => {
    const { steamID, eosID } = data;
    if (!steamID || !eosID) return;
    await updatePlayerLevel(steamID, eosID);
  };

  const onRoundEnded = async () => {
    const { players } = state;
    if (!players) return;

    await Promise.all(
      players.map(async (player: TPlayer) => {
        const { steamID } = player;
        if (!steamID) return;

        const user = getPlayerBySteamID(state, steamID);
        if (!user?.eosID) return;

        await updatePlayerLevel(steamID, user.eosID);
      }),
    );
  };

  listener.on(EVENTS.PLAYER_CONNECTED, onPlayerConnected);
  listener.on(EVENTS.ROUND_ENDED, onRoundEnded);
};
