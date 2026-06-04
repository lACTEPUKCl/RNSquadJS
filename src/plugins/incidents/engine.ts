import type {
  IncidentCounts,
  IncidentDoc,
  IncidentKill,
  IncidentSeverity,
  IncidentType,
} from '../../rnsdb';
import { weaponClass, WeaponClass } from './weaponClass';

type CountKey = keyof IncidentCounts;

export interface IncidentAppendOpts {
  kills?: IncidentKill[];
  countsInc?: Partial<Record<CountKey, number>>;
  severity?: IncidentSeverity;
  addFlags?: string[];
  lastEventAt: number;
  cap?: number;
}

export interface IncidentPersist {
  open(doc: IncidentDoc): void;
  append(id: string, opts: IncidentAppendOpts): void;
}

export interface EngineContext {
  serverId: number;
  server: string;
  layer?: string | null;
  level?: string | null;
}

export interface PlayerRef {
  steamID: string;
  name: string;
  eosID?: string;
  teamID?: string;
}

export interface KillInput {
  ts: number;
  attacker: PlayerRef;
  victimName: string;
  victimSteamID?: string;
  victimTeamID?: string;
  weapon: string;
  damage?: number;
  hs?: boolean;
}

export interface EngineOptions {
  rapidCount: number;
  rapidWindowMs: number;
  knifeTkTrigger: number;
  directTkTrigger: number;
  directTkWindowMs: number;
  burstTkCount: number;
  burstTkWindowMs: number;
  hsRatio: number;
  hsMinKills: number;
  knifeSpreeCount: number;
  knifeWindowMs: number;
  freshSpawnMs: number;
  caseIdleMs: number;
  killlogCap: number;
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  rapidCount: 10,
  rapidWindowMs: 60000,
  knifeTkTrigger: 2,
  directTkTrigger: 3,
  directTkWindowMs: 120000,
  burstTkCount: 3,
  burstTkWindowMs: 3000,
  hsRatio: 0.85,
  hsMinKills: 25,
  knifeSpreeCount: 4,
  knifeWindowMs: 60000,
  freshSpawnMs: 15000,
  caseIdleMs: 180000,
  killlogCap: 200,
};

interface KillRec {
  ts: number;
  cls: WeaponClass;
  isTK: boolean;
  fresh: boolean;
}

interface PlayerState {
  kills: KillRec[];
  hsKills: number;
  hsHeadshots: number;
  knifeTk: number;
  openCases: Partial<Record<IncidentType, string>>;
  lastCaseAt: Partial<Record<IncidentType, number>>;
}

const zeroCounts = (): IncidentCounts => ({
  kills: 0,
  teamkills: 0,
  fobDestroyed: 0,
  headshots: 0,
  knifeKills: 0,
});

export function createIncidentEngine(
  persist: IncidentPersist,
  options: Partial<EngineOptions> = {},
) {
  const opt: EngineOptions = { ...DEFAULT_ENGINE_OPTIONS, ...options };
  let ctx: EngineContext = { serverId: 0, server: '' };
  const states = new Map<string, PlayerState>();
  const respawns = new Map<string, { ts: number; hab: boolean }>();

  const st = (steamID: string) => {
    let s = states.get(steamID);
    if (!s) {
      s = {
        kills: [],
        hsKills: 0,
        hsHeadshots: 0,
        knifeTk: 0,
        openCases: {},
        lastCaseAt: {},
      };
      states.set(steamID, s);
    }
    return s;
  };

  const setContext = (c: EngineContext) => {
    ctx = c;
  };

  const isFreshSpawn = (steamID: string | undefined, ts: number): boolean => {
    if (!steamID) return false;
    const r = respawns.get(steamID);
    return !!r && ts - r.ts <= opt.freshSpawnMs;
  };

  const fire = (
    p: PlayerRef,
    type: IncidentType,
    severity: IncidentSeverity,
    ts: number,
    kill: IncidentKill | null,
    countsInc: Partial<Record<CountKey, number>>,
    flags: string[],
  ) => {
    const s = st(p.steamID);
    const existingId = s.openCases[type];
    const lastAt = s.lastCaseAt[type] ?? 0;
    if (existingId && ts - lastAt <= opt.caseIdleMs) {
      persist.append(existingId, {
        kills: kill ? [kill] : [],
        countsInc,
        severity,
        addFlags: flags,
        lastEventAt: ts,
        cap: opt.killlogCap,
      });
      s.lastCaseAt[type] = ts;
      return;
    }
    const counts = zeroCounts();
    for (const [k, v] of Object.entries(countsInc)) {
      if (v) (counts as unknown as Record<string, number>)[k] = v;
    }
    const _id = `${ctx.serverId}_${p.steamID}_${type}_${ts}`;
    const doc: IncidentDoc = {
      _id,
      serverId: ctx.serverId,
      server: ctx.server,
      steamID: p.steamID,
      name: p.name,
      eosID: p.eosID,
      type,
      severity,
      status: 'new',
      openedAt: ts,
      lastEventAt: ts,
      closedAt: null,
      layer: ctx.layer ?? null,
      level: ctx.level ?? null,
      flags: [...flags],
      killlog: kill ? [kill] : [],
      counts,
      claimedBy: null,
      viewedBy: [],
      comments: [],
      resolution: null,
    };
    persist.open(doc);
    s.openCases[type] = _id;
    s.lastCaseAt[type] = ts;
  };

  const handleEnemy = (
    k: KillInput,
    s: ReturnType<typeof st>,
    cls: WeaponClass,
    kill: IncidentKill,
  ) => {
    const incHs = { kills: 1, headshots: k.hs ? 1 : 0 };
    if (cls === 'infantry') {
      s.hsKills += 1;
      if (k.hs) s.hsHeadshots += 1;
      if (
        s.hsKills >= opt.hsMinKills &&
        s.hsHeadshots / s.hsKills >= opt.hsRatio
      ) {
        const pct = Math.round((s.hsHeadshots / s.hsKills) * 100);
        fire(k.attacker, 'headshot', 'high', k.ts, kill, incHs, [`HS ${pct}%`]);
      }
    }

    if (s.openCases.rapid_kills) {
      fire(k.attacker, 'rapid_kills', 'high', k.ts, kill, incHs, []);
    } else if (cls === 'infantry') {
      const recent = s.kills.filter(
        (r) => !r.isTK && r.cls === 'infantry' && r.ts >= k.ts - opt.rapidWindowMs,
      ).length;
      if (recent >= opt.rapidCount) {
        fire(k.attacker, 'rapid_kills', 'high', k.ts, kill, incHs, []);
      }
    }

    if (cls === 'knife' && !isFreshSpawn(k.victimSteamID, k.ts)) {
      if (s.openCases.knife_spree) {
        fire(k.attacker, 'knife_spree', 'medium', k.ts, kill, { kills: 1, knifeKills: 1 }, []);
      } else {
        const knives = s.kills.filter(
          (r) => !r.isTK && r.cls === 'knife' && !r.fresh && r.ts >= k.ts - opt.knifeWindowMs,
        ).length;
        if (knives >= opt.knifeSpreeCount) {
          fire(k.attacker, 'knife_spree', 'medium', k.ts, kill, { kills: 1, knifeKills: 1 }, []);
        }
      }
    }
  };

  const handleTeamkill = (
    k: KillInput,
    s: ReturnType<typeof st>,
    cls: WeaponClass,
    kill: IncidentKill,
  ) => {
    const isKnife = cls === 'knife';
    kill.note = isKnife
      ? 'тимкилл ножом'
      : cls === 'vehicle'
        ? 'расстрел союзника с техники'
        : 'тимкилл';

    if (s.openCases.mass_tk) {
      fire(k.attacker, 'mass_tk', 'high', k.ts, kill, { teamkills: 1, knifeKills: isKnife ? 1 : 0 }, []);
      return;
    }

    if (isKnife) {
      s.knifeTk += 1;
      if (s.knifeTk >= opt.knifeTkTrigger) {
        fire(k.attacker, 'mass_tk', 'high', k.ts, kill, { teamkills: 1, knifeKills: 1 }, ['нож по своим']);
      }
      return;
    }

    const direct = s.kills.filter(
      (r) => r.isTK && (r.cls === 'infantry' || r.cls === 'vehicle'),
    );
    const burst = direct.filter((r) => r.ts >= k.ts - opt.burstTkWindowMs).length;
    const windowed = direct.filter((r) => r.ts >= k.ts - opt.directTkWindowMs).length;
    if (burst >= opt.burstTkCount) {
      fire(k.attacker, 'mass_tk', 'high', k.ts, kill, { teamkills: 1 }, ['расстрел группы/техники']);
    } else if (windowed >= opt.directTkTrigger) {
      fire(k.attacker, 'mass_tk', 'high', k.ts, kill, { teamkills: 1 }, []);
    }
  };

  const onKill = (k: KillInput) => {
    const cls = weaponClass(k.weapon);
    const isTK = !!(
      k.attacker.teamID &&
      k.victimTeamID &&
      k.attacker.teamID === k.victimTeamID &&
      k.attacker.steamID !== (k.victimSteamID ?? '')
    );
    const s = st(k.attacker.steamID);
    const maxWin = Math.max(
      opt.rapidWindowMs,
      opt.directTkWindowMs,
      opt.knifeWindowMs,
    );
    const fresh = cls === 'knife' && !isTK && isFreshSpawn(k.victimSteamID, k.ts);
    s.kills.push({ ts: k.ts, cls, isTK, fresh });
    s.kills = s.kills.filter((r) => r.ts >= k.ts - maxWin);

    const kill: IncidentKill = {
      ts: k.ts,
      victim: k.victimName,
      victimSteamID: k.victimSteamID,
      weapon: k.weapon,
      weaponClass: cls,
      damage: k.damage,
      hs: k.hs,
      teamkill: isTK,
    };

    if (isTK) {
      if (cls === 'explosive') return;
      handleTeamkill(k, s, cls, kill);
    } else {
      handleEnemy(k, s, cls, kill);
    }
  };

  const onFobGrief = (
    p: PlayerRef,
    ts: number,
    info: { weapon?: string; damage?: number },
  ) => {
    const kill: IncidentKill = {
      ts,
      victim: 'своя FOB',
      weapon: info.weapon ?? '',
      weaponClass: 'explosive',
      damage: info.damage,
      teamkill: true,
      note: 'подрыв своей FOB',
    };
    fire(p, 'fob_grief', 'high', ts, kill, { fobDestroyed: 1 }, ['подрыв FOB']);
    const s = st(p.steamID);
    if (s.openCases.mass_tk) {
      fire(p, 'mass_tk', 'high', ts, kill, { fobDestroyed: 1 }, []);
    }
  };

  const onRespawn = (steamID: string, ts: number, hab: boolean) => {
    if (steamID) respawns.set(steamID, { ts, hab });
  };

  const onRoundEnd = () => {
    states.clear();
    respawns.clear();
  };

  return { setContext, onKill, onFobGrief, onRespawn, onRoundEnd };
}
