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

  const maskKey = (k: string) => (k ? `${k.slice(0, 3)}…${k.slice(-2)}` : '');
  const preview = <T>(arr: T[], n = 10) =>
    arr.length <= n ? arr : [...arr.slice(0, n), `…(+${arr.length - n})`];

  const http = axios.create({ timeout: TIMEOUT_MS });

  http.interceptors.request.use((cfg) => {
    const data = cfg.data ?? {};
    const masked = {
      ...data,
      key: maskKey(String(data?.key ?? '')),
      players: Array.isArray(data?.players)
        ? preview(data.players, 10)
        : data?.players,
    };
    logger.log(
      `[squad-browser] → ${String(cfg.method).toUpperCase()} ${
        cfg.url
      } payload=${JSON.stringify(masked)}`,
    );
    return cfg;
  });

  http.interceptors.response.use(
    (res) => {
      const body =
        typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      logger.log(
        `[squad-browser] ← ${res.status} ${res.config.url} ${String(body).slice(
          0,
          200,
        )}`,
      );
      return res;
    },
    (err) => {
      const status = err?.response?.status;
      const body = err?.response?.data;
      const snippet = body
        ? String(typeof body === 'string' ? body : JSON.stringify(body)).slice(
            0,
            200,
          )
        : '';
      logger.warn(
        `[squad-browser] ← ${status ?? 'ERR'} ${err?.config?.url} ${snippet} (${
          err.message
        })`,
      );
      return Promise.reject(err);
    },
  );

  const send = async (reason: string) => {
    try {
      const players = collectSteamIDs((state.players ?? []) as TPlayer[]);
      await http.post(`${endpoint}/api/updateServer`, {
        serverName,
        key: apiKey,
        players,
      });
      logger.log(
        `[squad-browser] sent ${players.length} player IDs (${reason})`,
      );
    } catch (_e) {}
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
