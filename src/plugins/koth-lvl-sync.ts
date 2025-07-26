import fs from 'fs/promises';
import path from 'path';
import { TPlayerConnected } from 'squad-logs';
import { EVENTS } from '../constants';
import { TPluginProps } from '../types';
import { getPlayerBySteamID } from './helpers';

export const levelSync: TPluginProps = (state, options) => {
  const { listener, logger } = state;
  const { jsonDir, cfgPath } = options;

  const rankLevels = [
    1, 10, 20, 30, 45, 65, 90, 120, 155, 195, 240, 290, 345, 375, 405, 430, 450,
    470, 490, 500,
  ];

  const imageUrls = [
    '/URLA:https://i.imgur.com/1Vw9pJ7.png+',
    '/URLA:https://i.imgur.com/IhDNQbB.png+',
    '/URLA:https://i.imgur.com/h8bftCI.png+',
    '/URLA:https://i.imgur.com/AIWfJ50.png+',
    '/URLA:https://i.imgur.com/yO35ClD.png+',
    '/URLA:https://i.imgur.com/5CoZyfC.png+',
    '/URLA:https://i.imgur.com/xhttO3B.png+',
    '/URLA:https://i.imgur.com/VR4vDRw.png+',
    '/URLA:https://i.imgur.com/4vcy4xt.png+',
    '/URLA:https://i.imgur.com/cLOLbHr.png+',
    '/URLA:https://i.imgur.com/si3VZmO.png+',
    '/URLA:https://i.imgur.com/6VAy5gl.png+',
    '/URLA:https://i.imgur.com/9fsZULX.png+',
    '/URLA:https://i.imgur.com/jURlxEr.png+',
    '/URLA:https://i.imgur.com/lWXSm0G.png+',
    '/URLA:https://i.imgur.com/TToa79e.png+',
    '/URLA:https://i.imgur.com/7h5bdwp.png+',
    '/URLA:https://i.imgur.com/r0paM17.png+',
    '/URLA:https://i.imgur.com/X9a3K75.png+',
    '/URLA:https://i.imgur.com/JPIbztU.png+',
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
    const jsonPath = path.join(jsonDir, `${steamID}.json`);
    let xp = 0;
    let totalXP = 0;

    try {
      logger.log(`[levelSync] Читаем JSON: ${jsonPath}`);
      const buf: Buffer = await fs.readFile(jsonPath);
      let raw: string;
      if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
        raw = buf.toString('utf16le');
      } else {
        raw = buf.toString('utf8');
      }
      raw = raw.replace(/^[\uFEFF\x00-\x1F]+/, '');
      const data = JSON.parse(raw);
      xp = data['save data']?.xp ?? 0;
      totalXP = data['save data']?.['total xp'] ?? xp;
      logger.log(`[levelSync] XP=${xp}, totalXP=${totalXP}`);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        logger.log(`[levelSync] JSON не найден для ${steamID}, пропускаем`);
      } else {
        logger.error(
          `[levelSync] Ошибка чтения/парсинга JSON для ${steamID}: ${
            (err as Error).message
          }`,
        );
      }
      return;
    }

    const level = Math.floor((Math.sqrt((4 * xp) / 75 + 1) + 1) / 2);
    const imageParam = getRankImageByTotalXP(totalXP);
    logger.log(`[levelSync] Level=${level}, ImageParam=${imageParam}`);
    let cfgContent = '';
    try {
      logger.log(`[levelSync] Читаем CFG: ${cfgPath}`);
      cfgContent = await fs.readFile(cfgPath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.log(`[levelSync] CFG не найден, будет создан новый`);
        cfgContent = '';
      } else {
        logger.error(
          `[levelSync] Ошибка чтения ${cfgPath}: ${(err as Error).message}`,
        );
        return;
      }
    }

    const lines = cfgContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.startsWith(`${eosID}:`));

    const newLine = `${eosID}: LVL ${level} ${imageParam}, "255,215,0,255" // XP: ${xp}`;
    lines.push(newLine);

    try {
      await fs.writeFile(cfgPath, lines.join('\n') + '\n', 'utf-8');
      logger.log(`[levelSync] Обновили ${steamID}: ${newLine}`);
    } catch (err) {
      logger.error(
        `[levelSync] Ошибка записи ${cfgPath} для ${steamID}: ${
          (err as Error).message
        }`,
      );
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

    for (const player of players) {
      const { steamID } = player;
      if (!steamID) continue;

      const user = getPlayerBySteamID(state, steamID);
      if (!user?.eosID) continue;

      await updatePlayerLevel(steamID, user.eosID);
    }
  };

  listener.on(EVENTS.PLAYER_CONNECTED, onPlayerConnected);
  listener.on(EVENTS.ROUND_ENDED, onRoundEnded);
};
