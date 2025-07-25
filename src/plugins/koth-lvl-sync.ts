import fs from 'fs/promises';
import path from 'path';
import { TPlayerConnected } from 'squad-logs';
import { EVENTS } from '../constants';
import { TPlayer, TPluginProps } from '../types';
import { getPlayerBySteamID } from './helpers';

export const levelSync: TPluginProps = (state, options) => {
  const { listener } = state;
  const { jsonDir, cfgPath } = options;

  const calculateLevel = (xp: number): number => {
    return Math.floor((Math.sqrt((4 * xp) / 75 + 1) + 1) / 2);
  };

  const updatePlayerLevel = async (steamID: string, eosID: string) => {
    try {
      const jsonPath = path.join(jsonDir, `${steamID}.json`);
      const jsonRaw = await fs.readFile(jsonPath, 'utf-8');
      const json = JSON.parse(jsonRaw);

      const xp = json?.['save data']?.xp ?? 0;
      const level = calculateLevel(xp);

      let cfgContent = '';
      try {
        cfgContent = await fs.readFile(cfgPath, 'utf-8');
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }

      const newLine = `${eosID}: LVL ${level} /URLA:some_image_url, "#ffffff"`;
      const regex = new RegExp(`^${eosID}:.*$`, 'm');

      if (regex.test(cfgContent)) {
        cfgContent = cfgContent.replace(regex, newLine);
      } else {
        cfgContent += (cfgContent.endsWith('\n') ? '' : '\n') + newLine + '\n';
      }

      await fs.writeFile(cfgPath, cfgContent, 'utf-8');
    } catch (err) {}
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
