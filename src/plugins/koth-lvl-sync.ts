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
    '/URLA:https://drive.google.com/file/d/1-PNg7rl9dveNmRxxQ3E2X0M1Z9h1XGiP/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/1fifudTKPqIzcFMTSneV3zRkeLlQTqmtT/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/1hD5FGoe6tqLfF5XDcwUB5mScuK9UP003/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/19KoEKGi1K2DSyBnHVEVop6uFJXbftkfU/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/1T7rBnBAm0lyjCNV5HsW7K94BtQZJBI9T/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/1xto62-isiyQMkt31Tc0UH5GhXZ03k-kP/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/18SeehfdIeyZtOvtfdSHtKEqIPhEEdWMy/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/1rM-ui_f6nqShSEUEJ2pw3eTAV2u_4f-Z/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/1ZRvu9fLefKwf_QTFKBlvu1WQ1mQyA5cc/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/1J_Gz3cWTpXTpPCKeOK-C-lmXJzbyc8FO/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/1MadDh8yzp_xBCG3k5HEIBPVBjMb1zaYP/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/1Bifb4yV-K0mgZFYDw1x5OM9uK4WTo0Yy/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/15ZouoPjH0A5ctKWGaIqK0eUafoBz1nX4/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/1xkz0m3_-wYsViKBtecgl32sQqj-rqmXz/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/1x_QfwaK_2bEdfE7_cs_A4o26XqgTKfBI/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/1i_iL3IGsfBOSZztzDaMioZktxk48stjf/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/1x7J9-qw8iRibBoahSNkKu_wNNoqZVywX/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/1L8mReZ7_a3Z6fBiNZBCKI7wTGYeXA8O9/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/1CNfalg3LRXZSiG7kddB9V55nO-dge35m/view?usp=drive_link+',
    '/URLA:https://drive.google.com/file/d/1RTDoUNwvOuJeWQBB45X-Y5hpkmO7Zria/view?usp=drive_link+',
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

    const newLine = `${eosID}: "LVL ${level}"/a ${imageParam}, "255,215,0,255" // XP: ${xp}`;
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
