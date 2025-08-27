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

  const endpoint = String(options?.endpoint ?? '').replace(/\/+$/, '');
  const apiKey = String(options?.apiKey ?? '');
  const serverName =
    String(options?.serverName ?? '') ||
    (state as any).serverName ||
    'SquadJS Server';

  const intervalSec = Math.max(10, Number(options?.intervalSeconds ?? 60));
  const startupDelay = Math.max(0, Number(options?.startupDelaySeconds ?? 5));
  const timeoutMs = Number(options?.timeoutMs ?? 5000);

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
        { timeout: timeoutMs },
      );
      logger.log(
        `[squad-browser] sent ${players.length} player IDs (${reason})`,
      );
    } catch (e: any) {
      const code = e?.response?.status;
      const msg = e?.response?.statusText ?? e?.message ?? String(e);
      logger.warn(
        `[squad-browser] send failed (${reason}): ${code ?? ''} ${msg}`,
      );
    }
  };

  setTimeout(() => {
    void send('startup');
  }, startupDelay * 1000);
  const timer = setInterval(() => {
    void send('interval');
  }, intervalSec * 1000);

  const stop = () => clearInterval(timer);
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
};

export default squadBrowser;
