import fs from 'fs/promises';
import path from 'path';
import { TPlayerConnected } from 'squad-logs';
import { EVENTS } from '../constants';
import { TPlayer, TPluginProps } from '../types';
import { getPlayerBySteamID } from './helpers';

export const levelSync: TPluginProps = (state, options) => {
  const { listener, logger } = state;
  const { jsonDir, cfgPath } = options;

  const rankLevels = [
    1, 10, 20, 30, 45, 65, 90, 120, 155, 195, 240, 290, 345, 375, 405, 430, 450,
    470, 490, 500,
  ];

  const imageUrls = [
    '/URLA:https://i.imgur.com/Bri5zX2.png+',
    '/URLA:https://i.imgur.com/cc1ULj6.png+',
    '/URLA:https://i.imgur.com/lY0jxMx.png+',
    '/URLA:https://i.imgur.com/CpoHRB4.png+',
    '/URLA:https://i.imgur.com/M9jVSQl.png+',
    '/URLA:https://i.imgur.com/w74DlMw.png+',
    '/URLA:https://i.imgur.com/UKeURAr.png+',
    '/URLA:https://i.imgur.com/eGUZvsr.png+',
    '/URLA:https://i.imgur.com/35scjC4.png+',
    '/URLA:https://i.imgur.com/D2OquwG.png+',
    '/URLA:https://i.imgur.com/epFdoUs.png+',
    '/URLA:https://i.imgur.com/JcYW3PL.png+',
    '/URLA:https://i.imgur.com/4XSrPYe.png+',
    '/URLA:https://i.imgur.com/jrxBfyg.png+',
    '/URLA:https://i.imgur.com/DjBIzpt.png+',
    '/URLA:https://i.imgur.com/ZrRel2Y.png+',
    '/URLA:https://i.imgur.com/nACqeiU.png+',
    '/URLA:https://i.imgur.com/HMFiPng.png+',
    '/URLA:https://i.imgur.com/8Fenp63.png+',
    '/URLA:https://i.imgur.com/TkVqmrN.png+',
  ];

  const getRankImageByTotalXP = (totalXP: number): string => {
    const levelFromTotalXP = Math.floor(
      (Math.sqrt((4 * totalXP) / 75 + 1) + 1) / 2,
    );
    for (let i = rankLevels.length - 1; i >= 0; i--) {
      if (levelFromTotalXP >= rankLevels[i]) {
        return imageUrls[i];
      }
    }
    return imageUrls[0];
  };

  const updatePlayerLevel = async (steamID: string, eosID: string) => {
    try {
      const jsonPath = path.join(jsonDir, `${steamID}.json`);
      const jsonRaw = await fs.readFile(jsonPath, 'utf-8');
      const json = JSON.parse(jsonRaw);
      const xp = json?.['save data']?.xp ?? 0;
      const totalXP = json?.['save data']?.['total xp'] ?? xp;
      const level = Math.floor((Math.sqrt((4 * xp) / 75 + 1) + 1) / 2);
      const imageParam = getRankImageByTotalXP(totalXP);

      const newLine = `${eosID}: "LVL ${level}"/a ${imageParam}, "255,215,0,255" // XP: ${xp}`;

      let cfgContent = '';
      try {
        cfgContent = await fs.readFile(cfgPath, 'utf-8');
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }

      const lines = cfgContent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith(`${eosID}:`));

      lines.push(newLine);

      await fs.writeFile(cfgPath, lines.join('\n') + '\n', 'utf-8');
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
