import { spawn } from 'child_process';
import { TNotifyAcceptingConnection } from 'squad-logs';
import { EVENTS } from '../constants';
import { TPluginProps } from '../types';

type Hit = { t: number; port: string };
type IpState = { hits: Hit[]; ports: Set<string>; lastAlertAt: number };

const IPV4_RE =
  /^(25[0-5]|2[0-4]\d|1?\d?\d)\.(25[0-5]|2[0-4]\d|1?\d?\d)\.(25[0-5]|2[0-4]\d|1?\d?\d)\.(25[0-5]|2[0-4]\d|1?\d?\d)$/;

const toNum = (v: unknown, def: number): number => {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const toBool = (v: unknown, def: boolean): boolean => {
  if (v === undefined || v === null || v === '') return def;
  const s = String(v).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(s)
    ? true
    : ['0', 'false', 'no', 'n', 'off'].includes(s)
      ? false
      : def;
};
const toStr = (v: unknown, def: string): string => {
  const s = (v ?? '').toString().trim();
  return s || def;
};

function normalizeIp(v: unknown): string | null {
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.split(',')[0]?.trim() || s;
  const m6 = s.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})/i);
  if (m6) s = m6[1];
  const mp = s.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (mp) s = mp[1];
  return IPV4_RE.test(s) ? s : null;
}

function dockerRunHostOnce(
  dockerPath: string,
  image: string,
  cmd: string,
  onOk?: () => void,
  onErr?: (code: number | null, stderr?: string) => void,
) {
  const wrappedCmd =
    'sh -lc "' +
    'iptables -V >/dev/null 2>&1 || (apk add --no-cache iptables ipset >/dev/null 2>&1 || (apt-get update && apt-get install -y iptables ipset)); ' +
    cmd.replace(/"/g, '\\"') +
    '"';

  const args = [
    'run',
    '--rm',
    '--network',
    'host',
    '--cap-add',
    'NET_ADMIN',
    image,
    ...['sh', '-lc', wrappedCmd],
  ];

  const ch = spawn(dockerPath, args);
  let err = '';
  ch.stderr.on('data', (c) => (err += String(c)));
  ch.on('exit', (code) => {
    if (code === 0) onOk?.();
    else onErr?.(code ?? null, err.trim() || undefined);
  });
}

export const antiClicker: TPluginProps = (state, options) => {
  const { listener, logger } = state;

  const windowMsExplicit = toNum(options?.windowMs, NaN);
  const windowSecExplicit = toNum(options?.windowSec, NaN);
  const windowMs = Number.isFinite(windowMsExplicit)
    ? windowMsExplicit
    : Number.isFinite(windowSecExplicit)
      ? windowSecExplicit * 1000
      : 60_000;

  const threshold = toNum(options?.threshold, 30);
  const cooldownMs = Number.isFinite(toNum(options?.cooldownMs, NaN))
    ? toNum(options?.cooldownMs, NaN)
    : Number.isFinite(toNum(options?.cooldownSec, NaN))
      ? toNum(options?.cooldownSec, NaN) * 1000
      : 300_000;

  const enableBan = toBool(options?.enableBan, false);
  const banMode = (
    toStr(options?.banMode, 'ipset') === 'iptables' ? 'iptables' : 'ipset'
  ) as 'ipset' | 'iptables';
  const ipsetName = toStr(options?.ipsetName, 'clicker_blacklist');
  const banTtlSec = toNum(options?.banTtlSec, 86_400);
  const dockerPath = toStr(options?.dockerPath, '/usr/bin/docker');
  const banImage = toStr(options?.banImage, 'alpine:3.20');
  const perIp = new Map<string, IpState>();
  let infraReady = false;

  function prune(st: IpState, now: number) {
    while (st.hits.length && now - st.hits[0].t > windowMs) st.hits.shift();
    st.ports = new Set(st.hits.map((h) => h.port));
  }

  function buildBanCommands(ip: string): { init?: string; add: string } {
    if (banMode === 'ipset') {
      return {
        init:
          `ipset create ${ipsetName} hash:ip timeout ${banTtlSec} -exist && ` +
          `(iptables -C INPUT -m set --match-set ${ipsetName} src -j DROP || ` +
          `iptables -I INPUT -m set --match-set ${ipsetName} src -j DROP)`,
        add: `ipset add ${ipsetName} ${ip} timeout ${banTtlSec} -exist`,
      };
    }
    return {
      add: `(iptables -C INPUT -s ${ip} -j DROP || iptables -I INPUT -s ${ip} -j DROP)`,
    };
  }

  const onAccept = (data: TNotifyAcceptingConnection) => {
    const now = Date.now();

    const ip = normalizeIp((data as any).ip);
    const port = String((data as any).port ?? '');

    if (!ip) return;

    let st = perIp.get(ip);
    if (!st) {
      st = { hits: [], ports: new Set<string>(), lastAlertAt: 0 };
      perIp.set(ip, st);
    }

    prune(st, now);

    if (port && st.ports.has(port)) return;

    st.hits.push({ t: now, port });
    st.ports.add(port);

    if (st.hits.length >= threshold && now - st.lastAlertAt >= cooldownMs) {
      st.lastAlertAt = now;

      const sample = st.hits
        .slice(-5)
        .map((h) => h.port)
        .join(', ');
      logger.warn(
        `[antiClicker] Suspected clicker ip=${ip} hits=${st.hits.length}/${threshold} ` +
          `window=${Math.round(windowMs / 1000)}s lastPorts=[${sample}]`,
      );

      if (enableBan) {
        const cmds = buildBanCommands(ip);

        if (banMode === 'ipset' && !infraReady && cmds.init) {
          dockerRunHostOnce(
            dockerPath,
            banImage,
            cmds.init,
            () => {
              infraReady = true;
              logger.log('[antiClicker] ipset/iptables infra ready');
            },
            (code, stderr) =>
              logger.warn(
                `[antiClicker] infra init failed, exit=${code}${
                  stderr ? `, stderr=${stderr}` : ''
                }`,
              ),
          );
        }

        dockerRunHostOnce(
          dockerPath,
          banImage,
          cmds.add,
          () => logger.warn(`[antiClicker] BAN applied -> ${ip}`),
          (code, stderr) =>
            logger.warn(
              `[antiClicker] BAN failed for ${ip}, exit=${code}${
                stderr ? `, stderr=${stderr}` : ''
              }`,
            ),
        );
      }
    }
  };

  listener.on(EVENTS.PLAYER_ACCEPTING_CONNECTION, onAccept);
};
