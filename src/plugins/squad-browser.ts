import axios from 'axios';
import type { TPlayer, TPluginProps } from '../types';

function collectSteamIDs(players: readonly TPlayer[]): string[] {
  const ids = new Set<string>();
  for (const p of players) {
    const id = String(p?.steamID ?? '').trim();
    if (/^[0-9]{17}$/.test(id)) ids.add(id);
  }
  return Array.from(ids);
}

export const squadBrowser: TPluginProps = (state, options) => {
  const { logger } = state;
  const { endpoint, apiKey, serverName } = options;
  const INTERVAL_SEC = 60;
  const STARTUP_DELAY_SEC = 5;
  const TIMEOUT_MS = 5000;

  if (!endpoint || !apiKey) {
    logger.warn('[squad-browser] disabled: endpoint/apiKey not set');
    return;
  }

  const send = async (reason: string) => {
    try {
      const players = collectSteamIDs((state.players ?? []) as TPlayer[]);
      await axios.post(
        `${endpoint}/api/updateServer`,
        { serverName, key: apiKey, players },
        { timeout: TIMEOUT_MS },
      );
      logger.log(
        `[squad-browser] sent ${players.length} player IDs (${reason})`,
      );
    } catch (e) {}
  };

  setTimeout(() => {
    void send('startup');
  }, STARTUP_DELAY_SEC * 1000);
  const timer = setInterval(() => {
    void send('interval');
  }, INTERVAL_SEC * 1000);

  const stop = () => clearInterval(timer);
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
};

export default squadBrowser;
