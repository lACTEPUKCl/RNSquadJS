import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminBroadcast, adminForceTeamChange } from '../core';
import { expectedLead, LeadWeights } from '../core/elo';
import { definePlugin } from '../core/plugin';
import {
  getUserDataWithSteamID,
  sbDailyDecayEdges,
  sbEnsureSmartBalance,
  sbGetActivePartiesOnline,
  sbGetClanTagDocs,
  sbUpdateClanCohesion,
  sbUpdateClanTagCounters,
  sbUpsertSocialEdges,
} from '../rnsdb';
import type { TExecute, TLogger, TPlayer } from '../types';

export type Team = 'A' | 'B';
export type PackType = 'SQUAD' | 'PARTY' | 'CLAN' | 'SOLO';

export interface OnlinePlayer extends TPlayer {
  clanTag?: string;
  skill: number;
  lead: number;
  _team: Team;
}

export interface Pack {
  id: string;
  type: PackType;
  players: string[];
  size: number;
  skillSum: number;
  leadSum?: number;
  currentTeam: Team;
  clanTag?: string;
}

interface Move {
  players: string[];
  from: Team;
  to: Team;
  note: string;
  packType: PackType;
  packId: string;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const sum = <T>(a: readonly T[], f: (x: T) => number) =>
  a.reduce((s, x) => s + f(x), 0);
const playerTeam = (p: TPlayer): Team => (p.teamID === '1' ? 'A' : 'B');
const isSLRole = (role?: string) =>
  !!role &&
  (/(_SL_|^.*\bSQUAD\s*LEADER\b.*$)/i.test(role) || /(^|_)SL(_|$)/i.test(role));
const typeRank = (p: Pack) =>
  p.type === 'SQUAD' ? 3 : p.type === 'PARTY' ? 2 : p.type === 'CLAN' ? 1 : 0;

function fmtNum(n: number): string {
  return n.toLocaleString('ru-RU');
}

const CYR2LAT: Record<string, string> = {
  А: 'A',
  Б: 'B',
  В: 'B',
  Е: 'E',
  К: 'K',
  М: 'M',
  Н: 'H',
  О: 'O',
  Р: 'P',
  С: 'C',
  Т: 'T',
  У: 'Y',
  Х: 'X',
  а: 'A',
  б: 'B',
  в: 'B',
  е: 'E',
  к: 'K',
  м: 'M',
  н: 'H',
  о: 'O',
  р: 'P',
  с: 'C',
  т: 'T',
  у: 'Y',
  х: 'X',
};

const normalizeName = (s?: string) =>
  (s || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .split('')
    .map((ch) => CYR2LAT[ch] ?? ch)
    .join('')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

const BRACKET_PAIRS: Array<[string, string]> = [
  ['[', ']'],
  ['(', ')'],
  ['{', '}'],
  ['<', '>'],
  ['«', '»'],
  ['“', '”'],
  ['”', '“'],
  ['"', '"'],
  ['ʼ', 'ʼ'],
  ['‘', '’'],
  ['’', '‘'],
  ['「', '」'],
  ['『', '』'],
  ['【', '】'],
  ['〔', '〕'],
  ['〖', '〗'],
  ['〘', '〙'],
  ['〚', '〛'],
  ['⟨', '⟩'],
  ['⟪', '⟫'],
  ['⟦', '⟧'],
  ['⟮', '⟯'],
  ['|', '|'],
];
const SYM_WRAPS = ['-', '=', '*', '~', ':', '.', '_', '|', '—', '–'];
const esc = (s: string) => s.replace(/[\\\^$*+?.()|[\]{}]/g, '\\$&');

export type TagDetectOpts = {
  serverId: number;
  maxLen: number;
  minLen: number;
  minUnique: number;
  minConfidence: number;
  minCohesion: number;
  blacklist: string[];
  whitelist: string[];
};

class TagDetector {
  private readonly opts: TagDetectOpts;
  constructor(opts: TagDetectOpts) {
    this.opts = opts;
  }

  private candidates(raw: string): string[] {
    const out: string[] = [];

    const lead = raw.match(
      /^\s*[\[\(\{<«"'’“”‚‘]\s*([A-Za-z0-9]{2,})\s*[\]\)\}>»"'’“”‚‘]/,
    );
    if (lead && lead[1]) {
      const t = normalizeName(lead[1]).slice(0, this.opts.maxLen);
      if (t.length >= this.opts.minLen) out.push(t);
    }

    for (const [L, R] of BRACKET_PAIRS) {
      const re = new RegExp(
        `${esc(L)}\\s*([A-Za-z0-9]{${this.opts.minLen},${
          this.opts.maxLen
        }})\\s*${esc(R)}`,
        'g',
      );
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw))) {
        const t = normalizeName(m[1]);
        if (t) out.push(t);
      }
    }

    for (const c of SYM_WRAPS) {
      const re = new RegExp(
        `${esc(c)}+\\s*([A-Za-z0-9]{${this.opts.minLen},${
          this.opts.maxLen
        }})\\s*${esc(c)}+`,
        'g',
      );
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw))) {
        const t = normalizeName(m[1]);
        if (t) out.push(t);
      }
    }

    return Array.from(new Set(out));
  }

  async learnFromOnline(
    players: readonly TPlayer[],
    edgesWindowDays: number,
  ): Promise<number> {
    const buckets = new Map<
      string,
      { total: number; start: number; ids: Set<string> }
    >();
    for (const p of players) {
      const cands = this.candidates(p.name);
      if (!cands.length) continue;
      const main = cands[0];
      if (this.opts.blacklist.includes(main)) continue;
      if (!buckets.has(main))
        buckets.set(main, { total: 0, start: 0, ids: new Set() });
      const b = buckets.get(main)!;
      b.total += 1;

      if (/^[\[\(\{<«"'’“”‚‘]/.test(p.name)) b.start += 1;
      b.ids.add(p.steamID);
    }
    if (!buckets.size) return 0;
    const payload = Array.from(buckets.entries()).map(
      ([tag, { total, start, ids }]) => ({
        tag,
        totalInc: total,
        startInc: start,
        steamIDs: Array.from(ids),
      }),
    );
    const saved = await sbUpdateClanTagCounters(this.opts.serverId, payload);
    for (const [tag, { ids }] of buckets) {
      const idsArr = Array.from(ids);
      if (idsArr.length < 2) continue;
      const onlinePairs = await sbGetActivePartiesOnline(
        this.opts.serverId,
        idsArr,
        edgesWindowDays,
        900,
        1,
        9,
      );
      const pairs = (idsArr.length * (idsArr.length - 1)) / 2;
      const strongPairs = onlinePairs.reduce(
        (s, grp) => s + (grp.length * (grp.length - 1)) / 2,
        0,
      );
      const cohesion = pairs > 0 ? Math.min(1, strongPairs / pairs) : 0;
      await sbUpdateClanCohesion(this.opts.serverId, tag, cohesion);
    }
    return saved;
  }

  async detect(rawName: string): Promise<string | undefined> {
    const tokens = this.candidates(rawName).slice(0, 2);
    if (!tokens.length) return undefined;
    for (const t of tokens)
      if (this.opts.whitelist.includes(t) && !this.opts.blacklist.includes(t))
        return t;
    const docs = await sbGetClanTagDocs(this.opts.serverId, tokens);
    let best: { tag: string; score: number } | null = null;
    for (const d of docs) {
      if (d.blacklist) continue;
      if (d.whitelist) return d.tag;
      const unique = d.players?.length ?? 0;
      const conf = (d.startUses ?? 0) / Math.max(1, d.totalUses ?? 1);
      const coh = d.cohesion ?? 0;
      if (unique < this.opts.minUnique) continue;
      if (conf < this.opts.minConfidence) continue;
      if (coh < this.opts.minCohesion) continue;
      const score = unique + 5 * conf + 3 * coh;
      if (!best || score > best.score) best = { tag: d.tag, score };
    }
    return best?.tag;
  }
}

const NEUTRAL_SKILL = 1500;

const skillCache = new Map<string, number>();
const leadCache = new Map<string, number>();
const cacheKey = (serverId: number, steamID: string) =>
  `${serverId}:${steamID}`;

export function resetSkillCache(
  serverId?: number,
  ids?: readonly string[],
): void {
  if (serverId === undefined) {
    skillCache.clear();
    leadCache.clear();
    return;
  }
  if (!ids) return;
  for (const id of ids) {
    const k = cacheKey(serverId, id);
    skillCache.delete(k);
    leadCache.delete(k);
  }
}

export interface SkillCfg {
  minRatedGames: number;
}
const DEFAULT_SKILL_CFG: SkillCfg = { minRatedGames: 3 };

export interface LeadCfg {
  minRatedGames: number;
  weights?: LeadWeights;
}

export async function getLead(
  serverId: number,
  steamID: string,
  cfg: LeadCfg,
): Promise<number> {
  const key = cacheKey(serverId, steamID);
  if (leadCache.has(key)) return leadCache.get(key)!;
  try {
    const u = await getUserDataWithSteamID(serverId, steamID);
    const sq = u?.squad;
    const tp = Math.max(1, Number(sq?.timeplayed ?? 0));
    const lead = expectedLead(
      {
        cmdMu: u?.cmdRating?.mu,
        cmdGames: u?.cmdRating?.games,
        slMu: u?.slRating?.mu,
        slGames: u?.slRating?.games,
        cmdShare: Number(sq?.cmd ?? 0) / tp,
        slShare: Number(sq?.leader ?? 0) / tp,
      },
      { minGames: cfg.minRatedGames, ...(cfg.weights ?? {}) },
    );
    const val = Number.isFinite(lead) ? lead : 0;
    leadCache.set(key, val);
    return val;
  } catch {
    leadCache.set(key, 0);
    return 0;
  }
}

export async function getSkill(
  serverId: number,
  steamID: string,
  cfg: SkillCfg = DEFAULT_SKILL_CFG,
): Promise<number> {
  const key = cacheKey(serverId, steamID);
  if (skillCache.has(key)) return skillCache.get(key)!;
  try {
    const u = await getUserDataWithSteamID(serverId, steamID);
    const r = u?.rating;
    let val: number;
    if (
      r &&
      Number(r.games) >= cfg.minRatedGames &&
      Number.isFinite(Number(r.mu))
    ) {
      val = Math.round(Number(r.mu));
    } else {
      const kd = Number(u?.kd ?? 1);
      const winrate = Number(u?.matches?.winrate ?? 0);
      const exp = Number(u?.exp ?? 0);
      const est =
        NEUTRAL_SKILL +
        (kd - 1) * 150 +
        (winrate - 50) * 2 +
        Math.min(120, Math.sqrt(exp) / 3);
      val = Math.round(Math.max(800, Math.min(2200, est)));
    }
    skillCache.set(key, Number.isFinite(val) ? val : NEUTRAL_SKILL);
    return skillCache.get(key)!;
  } catch {
    skillCache.set(key, NEUTRAL_SKILL);
    return NEUTRAL_SKILL;
  }
}

async function buildOnline(
  serverId: number,
  players: readonly TPlayer[],
  tags: (name: string) => Promise<string | undefined>,
): Promise<OnlinePlayer[]> {
  return Promise.all(
    players.filter(Boolean).map(
      async (p) =>
        ({
          ...p,
          clanTag: await tags(p.name),
          skill: skillCache.get(cacheKey(serverId, p.steamID)) ?? NEUTRAL_SKILL,
          lead: leadCache.get(cacheKey(serverId, p.steamID)) ?? 0,
          _team: playerTeam(p),
        }) as OnlinePlayer,
    ),
  );
}

function sideCount(packs: readonly Pack[], side: Team) {
  const arr = packs.filter((p) => p.currentTeam === side);
  const ids = arr.flatMap((p) => p.players);
  const count = sum(arr, (x) => x.size);
  const skill = sum(arr, (x) => x.skillSum);
  const lead = sum(arr, (x) => x.leadSum ?? 0);
  return { count, skill, lead, ids };
}

export function buildPacks(
  online: readonly OnlinePlayer[],
  parties: readonly string[][],
  prioritizeClans: boolean,
  minClanSideSize: number,
  clanMaxStackPerSide: number,
): Pack[] {
  const packs: Pack[] = [];
  const used = new Set<string>();

  const squadsMap = new Map<string, OnlinePlayer[]>();
  for (const p of online) {
    if (!p.squadID || p.squadID === '0') continue;
    const key = `${p._team}|${p.squadID}`;
    if (!squadsMap.has(key)) squadsMap.set(key, []);
    squadsMap.get(key)!.push(p);
  }
  for (const [key, arr] of squadsMap) {
    if (arr.length < 2) continue;
    arr.forEach((p) => used.add(p.steamID));
    const team = arr[0]._team;
    packs.push({
      id: `SQUAD:${team}:${key.split('|')[1]}`,
      type: 'SQUAD',
      players: arr.map((x) => x.steamID),
      size: arr.length,
      skillSum: sum(arr, (x) => x.skill),
      leadSum: sum(arr, (x) => x.lead),
      currentTeam: team,
    });
  }

  for (const grp of parties) {
    const arr = grp
      .map((id) => online.find((p) => p.steamID === id))
      .filter((x): x is OnlinePlayer => Boolean(x));
    const flt = arr.filter((p) => !used.has(p.steamID));
    if (flt.length < 2) continue;
    flt.forEach((p) => used.add(p.steamID));
    packs.push({
      id: `PARTY:${flt
        .map((x) => x.steamID)
        .sort()
        .join(',')}`,
      type: 'PARTY',
      players: flt.map((x) => x.steamID),
      size: flt.length,
      skillSum: sum(flt, (x) => x.skill),
      leadSum: sum(flt, (x) => x.lead),
      currentTeam: flt[0]?._team ?? 'A',
    });
  }

  if (prioritizeClans) {
    const cmap = new Map<string, Map<Team, OnlinePlayer[]>>();
    for (const p of online) {
      if (!p.clanTag || used.has(p.steamID)) continue;
      if (!cmap.has(p.clanTag)) cmap.set(p.clanTag, new Map());
      const byTeam = cmap.get(p.clanTag)!;
      if (!byTeam.has(p._team)) byTeam.set(p._team, []);
      byTeam.get(p._team)!.push(p);
    }
    const minSide = Math.max(1, minClanSideSize);
    const chunkMax = Math.max(minSide, clanMaxStackPerSide);
    for (const [tag, byTeam] of cmap) {
      for (const [team, arr] of byTeam) {
        if (arr.length < minSide) continue;
        const sorted = arr.slice().sort((a, b) => b.skill - a.skill);
        let part = 0;
        for (let i = 0; i < sorted.length; i += chunkMax) {
          const chunk = sorted.slice(i, i + chunkMax);
          if (chunk.length < minSide) break;
          chunk.forEach((p) => used.add(p.steamID));
          packs.push({
            id: `CLAN:${tag}:${team}:${part++}`,
            type: 'CLAN',
            players: chunk.map((x) => x.steamID),
            size: chunk.length,
            skillSum: sum(chunk, (x) => x.skill),
            leadSum: sum(chunk, (x) => x.lead),
            currentTeam: team,
            clanTag: tag,
          });
        }
      }
    }
  }

  for (const p of online)
    if (!used.has(p.steamID))
      packs.push({
        id: `SOLO:${p.steamID}`,
        type: 'SOLO',
        players: [p.steamID],
        size: 1,
        skillSum: p.skill,
        leadSum: p.lead,
        currentTeam: p._team,
      });

  return packs;
}

function score(packs: readonly Pack[]) {
  const A = sideCount(packs, 'A');
  const B = sideCount(packs, 'B');
  return {
    cA: A.count,
    cB: B.count,
    sA: A.skill,
    sB: B.skill,
    lA: A.lead,
    lB: B.lead,
  };
}

function targets(totalPlayers: number, teamCap: number) {
  const cap = Math.min(teamCap, Math.floor(totalPlayers / 2));
  const targetA = cap;
  const targetB = Math.min(teamCap, totalPlayers - cap);
  return { targetA, targetB };
}

function chooseEvacWeakSquadAndFill(
  packs: readonly Pack[],
  from: Team,
  overflowLeft: number,
  hardTol: number,
  lockedClanTags: Set<string>,
): Pack[] {
  const sA0 = sideCount(packs, 'A').skill;
  const sB0 = sideCount(packs, 'B').skill;

  const cand = packs.filter((p) => p.currentTeam === from);

  const squads = cand
    .filter((p) => p.type === 'SQUAD')
    .map((p) => ({ p, avg: p.skillSum / Math.max(1, p.size) }))
    .sort((a, b) => a.avg - b.avg)
    .map((x) => x.p);

  for (const sq of squads) {
    if (sq.size > Math.max(1, overflowLeft)) continue;
    let SA = sA0,
      SB = sB0;
    const nA = from === 'A' ? SA - sq.skillSum : SA + sq.skillSum;
    const nB = from === 'A' ? SB + sq.skillSum : SB - sq.skillSum;
    if (Math.abs(nA - nB) > (nA + nB) * hardTol) continue;
    let need = overflowLeft - sq.size;
    const chosen: Pack[] = [sq];
    SA = nA;
    SB = nB;

    if (need > 0) {
      const fillers = cand
        .filter(
          (p) =>
            p.id !== sq.id &&
            (p.type === 'SOLO' ||
              p.type === 'PARTY' ||
              (p.type === 'CLAN' && !lockedClanTags.has(p.clanTag ?? ''))),
        )
        .sort(
          (a, b) =>
            a.size - b.size || a.skillSum / a.size - b.skillSum / b.size,
        );

      for (const pk of fillers) {
        if (pk.size > need) continue;
        const fA = from === 'A' ? SA - pk.skillSum : SA + pk.skillSum;
        const fB = from === 'A' ? SB + pk.skillSum : SB - pk.skillSum;
        if (Math.abs(fA - fB) > (fA + fB) * hardTol) continue;
        chosen.push(pk);
        need -= pk.size;
        SA = fA;
        SB = fB;
        if (need <= 0) break;
      }
    }
    if (need <= 0) return chosen;
  }

  let left = overflowLeft;
  let SA = sA0,
    SB = sB0;
  const chosen: Pack[] = [];
  const others = cand
    .filter(
      (p) =>
        p.type !== 'SQUAD' &&
        !(p.type === 'CLAN' && lockedClanTags.has(p.clanTag ?? '')),
    )
    .sort(
      (a, b) => a.size - b.size || a.skillSum / a.size - b.skillSum / b.size,
    );

  for (const pk of others) {
    if (pk.size > left) continue;
    const nA = from === 'A' ? SA - pk.skillSum : SA + pk.skillSum;
    const nB = from === 'A' ? SB + pk.skillSum : SB - pk.skillSum;
    if (Math.abs(nA - nB) > (nA + nB) * hardTol) continue;
    chosen.push(pk);
    left -= pk.size;
    SA = nA;
    SB = nB;
    if (left <= 0) break;
  }
  return left <= 0 ? chosen : [];
}

export function plan2(
  initial: readonly Pack[],
  teamCap: number,
  tol: number,
  hard: number,
  balanceLeadership = false,
  leadTol = 150,
) {
  let packs = [...initial];
  const moves: Move[] = [];
  const total = initial.reduce((s, p) => s + p.size, 0);
  const { targetA, targetB } = targets(total, teamCap);
  const lockedClanTags = new Set<string>();

  for (let guard = 0; guard < 200; guard++) {
    const sc = score(packs);
    if (sc.cA === targetA && sc.cB === targetB) break;

    const from: Team =
      sc.cA > targetA
        ? 'A'
        : sc.cB > targetB
          ? 'B'
          : sc.cA < targetA
            ? 'B'
            : 'A';
    const to: Team = from === 'A' ? 'B' : 'A';
    const need = Math.max(0, from === 'A' ? sc.cA - targetA : sc.cB - targetB);
    if (need <= 0) break;

    const base = score(packs);
    const before = Math.abs(base.sA - base.sB);
    const fromA = from === 'A';
    const candScored = packs
      .filter(
        (p) =>
          p.currentTeam === from &&
          p.size <= need &&
          !(p.type === 'CLAN' && p.clanTag && lockedClanTags.has(p.clanTag)),
      )
      .map((pk) => {
        const newSA = fromA ? base.sA - pk.skillSum : base.sA + pk.skillSum;
        const newSB = fromA ? base.sB + pk.skillSum : base.sB - pk.skillSum;
        const after = Math.abs(newSA - newSB);
        return { pk, rank: typeRank(pk), gain: before - after };
      })
      .sort((x, y) => y.rank - x.rank || y.gain - x.gain);

    let moved = false;
    for (const { pk } of candScored) {
      const after = packs.map((p) =>
        p.id === pk.id ? { ...p, currentTeam: to } : p,
      );
      const overflow = sideCount(after, to).count - teamCap;
      if (overflow > 0) {
        const evac = chooseEvacWeakSquadAndFill(
          after,
          to,
          overflow,
          hard,
          lockedClanTags,
        );
        if (!evac.length) continue;

        packs = after.map((p) => p);
        for (const ev of evac) {
          packs = packs.map((p) =>
            p.id === ev.id ? { ...p, currentTeam: from } : p,
          );
          moves.push({
            players: [...ev.players],
            from: to,
            to: from,
            note: ev.type === 'SQUAD' ? 'evac weak squad' : 'evac fill',
            packType: ev.type,
            packId: ev.id,
          });
        }
      } else {
        packs = after;
      }

      moves.push({
        players: [...pk.players],
        from,
        to,
        note: pk.type,
        packType: pk.type,
        packId: pk.id,
      });
      if (pk.type === 'CLAN' && pk.clanTag) lockedClanTags.add(pk.clanTag);
      moved = true;
      break;
    }
    if (!moved) break;
  }

  for (let guard = 0; guard < 200; guard++) {
    const clanOn = (team: Team) =>
      packs.filter((p) => p.type === 'CLAN' && p.currentTeam === team).length;
    const cA = clanOn('A');
    const cB = clanOn('B');
    if (Math.abs(cA - cB) <= 1) break;
    const heavy: Team = cA > cB ? 'A' : 'B';
    const light: Team = heavy === 'A' ? 'B' : 'A';

    const clanPk = packs.find(
      (p) =>
        p.type === 'CLAN' &&
        p.currentTeam === heavy &&
        !(p.clanTag && lockedClanTags.has(p.clanTag)),
    );
    if (!clanPk) break;

    const after = packs.map((p) =>
      p.id === clanPk.id ? { ...p, currentTeam: light } : p,
    );
    const overflow =
      sideCount(after, light).count - sideCount(packs, light).count;
    const evac = chooseEvacWeakSquadAndFill(
      after,
      light,
      overflow,
      1,
      new Set([...lockedClanTags, clanPk.clanTag ?? '']),
    );
    if (!evac.length) {
      if (clanPk.clanTag) lockedClanTags.add(clanPk.clanTag);
      continue;
    }

    packs = after.map((p) => p);
    for (const ev of evac) {
      packs = packs.map((p) =>
        p.id === ev.id ? { ...p, currentTeam: heavy } : p,
      );
      moves.push({
        players: [...ev.players],
        from: light,
        to: heavy,
        note: 'clan spread',
        packType: ev.type,
        packId: ev.id,
      });
    }
    moves.push({
      players: [...clanPk.players],
      from: heavy,
      to: light,
      note: 'clan spread',
      packType: 'CLAN',
      packId: clanPk.id,
    });
    if (clanPk.clanTag) lockedClanTags.add(clanPk.clanTag);
  }

  if (balanceLeadership) {
    for (let guard = 0; guard < 200; guard++) {
      const sc = score(packs);
      const lDiff = Math.abs(sc.lA - sc.lB);
      if (lDiff <= leadTol) break;

      const sTot = sc.sA + sc.sB || 1;
      const skillCap = sTot * (hard || 0.0001);
      const strong: Team = sc.lA >= sc.lB ? 'A' : 'B';
      const weak: Team = strong === 'A' ? 'B' : 'A';
      const strongSolos = packs.filter(
        (p) => p.type === 'SOLO' && p.currentTeam === strong,
      );
      const weakSolos = packs.filter(
        (p) => p.type === 'SOLO' && p.currentTeam === weak,
      );

      let best: { s: Pack; w: Pack; nd: number } | null = null;
      for (const s of strongSolos) {
        for (const w of weakSolos) {
          const dLead = (s.leadSum ?? 0) - (w.leadSum ?? 0);
          if (dLead <= 0) continue;
          const nd = Math.abs(lDiff - 2 * dLead);
          if (!(nd < lDiff)) continue;
          const dSkill = s.skillSum - w.skillSum;
          const nSA = strong === 'A' ? sc.sA - dSkill : sc.sA + dSkill;
          const nSB = strong === 'A' ? sc.sB + dSkill : sc.sB - dSkill;
          if (Math.abs(nSA - nSB) > skillCap) continue;
          if (best === null || nd < best.nd) best = { s, w, nd };
        }
      }
      if (!best) break;

      const sId = best.s.id;
      const wId = best.w.id;
      packs = packs.map((p) =>
        p.id === sId
          ? { ...p, currentTeam: weak }
          : p.id === wId
            ? { ...p, currentTeam: strong }
            : p,
      );
      moves.push({
        players: [...best.s.players],
        from: strong,
        to: weak,
        note: 'lead swap',
        packType: 'SOLO',
        packId: best.s.id,
      });
      moves.push({
        players: [...best.w.players],
        from: weak,
        to: strong,
        note: 'lead swap',
        packType: 'SOLO',
        packId: best.w.id,
      });
    }
  }

  for (let guard = 0; guard < 200; guard++) {
    const sc = score(packs);
    if (!(sc.cA === targetA && sc.cB === targetB)) break;
    const sTot = sc.sA + sc.sB || 1;
    const tolAbs = sTot * (tol || 0.0001);
    const diff = Math.abs(sc.sA - sc.sB);
    if (diff <= tolAbs) break;
    const strong: Team = sc.sA >= sc.sB ? 'A' : 'B';
    const weak: Team = strong === 'A' ? 'B' : 'A';

    const base = score(packs);
    const before = Math.abs(base.sA - base.sB);
    const leadBefore = Math.abs(base.lA - base.lB);
    const strongA = strong === 'A';
    const candScored = packs
      .filter((p) => p.currentTeam === strong && p.type !== 'CLAN')
      .map((pk) => {
        const newSA = strongA ? base.sA - pk.skillSum : base.sA + pk.skillSum;
        const newSB = strongA ? base.sB + pk.skillSum : base.sB - pk.skillSum;
        const after = Math.abs(newSA - newSB);
        return { pk, rank: typeRank(pk), gain: before - after };
      })
      .sort((x, y) => y.rank - x.rank || y.gain - x.gain);

    let improved = false;
    for (const { pk } of candScored) {
      const afterPk = packs.map((p) =>
        p.id === pk.id ? { ...p, currentTeam: weak } : p,
      );
      const overflow =
        sideCount(afterPk, weak).count - sideCount(packs, weak).count;
      const evac = chooseEvacWeakSquadAndFill(
        afterPk,
        weak,
        overflow,
        hard,
        lockedClanTags,
      );
      if (!evac.length) continue;

      let after = afterPk.map((p) => p);
      for (const ev of evac)
        after = after.map((p) =>
          p.id === ev.id ? { ...p, currentTeam: strong } : p,
        );
      const sc2 = score(after);
      const newDiff = Math.abs(sc2.sA - sc2.sB);
      const leadOk =
        !balanceLeadership ||
        Math.abs(sc2.lA - sc2.lB) <= Math.max(leadTol, leadBefore);
      if (
        newDiff < diff &&
        leadOk &&
        Math.abs(sc2.cA - targetA) === 0 &&
        Math.abs(sc2.cB - targetB) === 0
      ) {
        packs = after;
        moves.push({
          players: [...pk.players],
          from: strong,
          to: weak,
          note: 'skill swap',
          packType: pk.type,
          packId: pk.id,
        });
        if (pk.type === 'CLAN' && pk.clanTag) lockedClanTags.add(pk.clanTag);
        for (const ev of evac) {
          moves.push({
            players: [...ev.players],
            from: weak,
            to: strong,
            note: ev.type === 'SQUAD' ? 'swap evac squad' : 'swap evac fill',
            packType: ev.type,
            packId: ev.id,
          });
        }
        improved = true;
        break;
      }
    }
    if (!improved) break;
  }

  for (let guard = 0; guard < 200; guard++) {
    const sc = score(packs);
    const sTot = sc.sA + sc.sB || 1;
    const tolAbs = sTot * (tol || 0.0001);
    const diff = Math.abs(sc.sA - sc.sB);
    if (diff <= tolAbs) break;

    const strong: Team = sc.sA >= sc.sB ? 'A' : 'B';
    const weak: Team = strong === 'A' ? 'B' : 'A';
    const strongSolos = packs.filter(
      (p) => p.type === 'SOLO' && p.currentTeam === strong,
    );
    const weakSolos = packs.filter(
      (p) => p.type === 'SOLO' && p.currentTeam === weak,
    );

    const lDiffNow = Math.abs(sc.lA - sc.lB);
    const leadStrong = strong === 'A' ? sc.lA : sc.lB;
    const leadWeak = strong === 'A' ? sc.lB : sc.lA;

    let best: { s: Pack; w: Pack; nd: number } | null = null;
    for (const s of strongSolos) {
      for (const w of weakSolos) {
        const d = s.skillSum - w.skillSum;
        if (d <= 0) continue;
        const nd = Math.abs(diff - 2 * d);
        if (!(nd < diff && (best === null || nd < best.nd))) continue;
        const dl = (s.leadSum ?? 0) - (w.leadSum ?? 0);
        const newLDiff = Math.abs(leadStrong - dl - (leadWeak + dl));
        if (balanceLeadership && newLDiff > Math.max(leadTol, lDiffNow))
          continue;
        best = { s, w, nd };
      }
    }
    if (!best) break;

    const sId = best.s.id;
    const wId = best.w.id;
    packs = packs.map((p) =>
      p.id === sId
        ? { ...p, currentTeam: weak }
        : p.id === wId
          ? { ...p, currentTeam: strong }
          : p,
    );
    moves.push({
      players: [...best.s.players],
      from: strong,
      to: weak,
      note: 'solo swap',
      packType: 'SOLO',
      packId: best.s.id,
    });
    moves.push({
      players: [...best.w.players],
      from: weak,
      to: strong,
      note: 'solo swap',
      packType: 'SOLO',
      packId: best.w.id,
    });
  }

  const final = score(packs);
  return { moves, final, targetA, targetB };
}

function currentBalance(players: readonly TPlayer[]) {
  const A = players.filter((p) => p.teamID === '1');
  const B = players.filter((p) => p.teamID === '2');
  const sumSide = (arr: TPlayer[]) =>
    arr.reduce((s, p) => s + (skillCache.get(p.steamID) ?? NEUTRAL_SKILL), 0);
  return { cA: A.length, cB: B.length, sA: sumSide(A), sB: sumSide(B) };
}

async function applyPackMovesAtomically(
  state: {
    players?: readonly TPlayer[];
    logger: TLogger;
    execute: TExecute;
  },
  moves: readonly Move[],
  options: {
    protectCommander: boolean;
    protectSquadLeader: boolean;
    swapLimitPerRound: number;
    applyDelayMs: number;
  },
): Promise<number> {
  const { logger, execute } = state;
  let packsApplied = 0;
  let swapsApplied = 0;

  for (const mv of moves) {
    const isSwap = mv.note.includes('swap');
    if (isSwap && swapsApplied >= options.swapLimitPerRound) continue;

    const members = mv.players
      .map((id) => (state.players ?? []).find((x) => x.steamID === id))
      .filter((p): p is TPlayer => Boolean(p));

    const allOk =
      members.length === mv.players.length &&
      members.every(
        (p) =>
          playerTeam(p) === mv.from &&
          !(options.protectCommander && /COMMANDER/i.test(p.role ?? '')) &&
          !(options.protectSquadLeader && isSLRole(p.role)),
      );

    if (!allOk) continue;

    for (const p of members) {
      await adminForceTeamChange(execute, p.steamID);
      logger.log(
        `[smart-balance] move ${mv.from}->${mv.to} ${mv.packType} ${
          mv.packId
        } | ${String(p.name || '')} (${p.steamID})`,
      );
      await new Promise((r) => setTimeout(r, options.applyDelayMs));
    }

    packsApplied += 1;
    if (isSwap) swapsApplied += 1;
  }

  return packsApplied;
}

const optionsSchema = z.record(z.unknown());

export default definePlugin({
  name: 'smartBalance',
  description: 'Балансировка команд по головам и скиллу (паки/кланы/пати).',
  optionsSchema,
  setup({ state, options, registerDisposable }) {
    const { listener, logger, execute } = state;
    const disposeTimers = new Set<NodeJS.Timeout>();
    const on = (event: string, handler: (...args: never[]) => void) => {
      listener.on(event, handler as (...a: unknown[]) => void);
      registerDisposable(() =>
        listener.off(event, handler as (...a: unknown[]) => void),
      );
    };
    const opt = {
      tickSeconds: Number(options?.tickSeconds ?? 60),
      partyWindowDays: Number(options?.partyWindowDays ?? 14),
      partyMinSec: Number(options?.partyMinSec ?? 900),
      partyMaxSize: Number(options?.partyMaxSize ?? 6),
      decayDailyFactor: Number(options?.decayDailyFactor ?? 0.98),
      retentionDays: Number(options?.retentionDays ?? 21),
      teamCap: Number(options?.teamCap ?? 50),

      skillTolerancePct: clamp01(Number(options?.skillTolerancePct ?? 0.05)),
      hardSkillTolerancePct: clamp01(
        Number(options?.hardSkillTolerancePct ?? 0.08),
      ),
      swapLimitPerRound: Number(options?.swapLimitPerRound ?? 24),

      protectCommander: Boolean(options?.protectCommander ?? true),
      protectSquadLeader: Boolean(options?.protectSquadLeader ?? true),
      protectAtRoundEnd: Boolean(options?.protectAtRoundEnd ?? false),

      prioritizeClans: Boolean(options?.prioritizeClans ?? true),
      clanMaxLen: Number(options?.clanMaxLen ?? 6),
      clanMinLen: Number(options?.clanMinLen ?? 2),
      tagMinUnique: Number(options?.tagMinUnique ?? 3),
      tagMinConfidence: Number(options?.tagMinConfidence ?? 0.6),
      tagMinCohesion: Number(options?.tagMinCohesion ?? 0.2),
      blacklistTags: Array.isArray(options?.blacklistTags)
        ? (options.blacklistTags as string[]).map(normalizeName)
        : [],
      whitelistTags: Array.isArray(options?.whitelistTags)
        ? (options.whitelistTags as string[]).map(normalizeName)
        : [],

      minClanSideSize: Number(options?.minClanSideSize ?? 2),
      clanMaxStackPerSide: Number(options?.clanMaxStackPerSide ?? 6),
      skillMinGames: Number(options?.skillMinGames ?? 3),
      refreshSkillEachBalance: Boolean(
        options?.refreshSkillEachBalance ?? true,
      ),
      autoBalance: Boolean(options?.autoBalance ?? false),
      partyMinMatches: Number(options?.partyMinMatches ?? 2),
      balanceLeadership: Boolean(options?.balanceLeadership ?? true),
      leadTolerance: Number(options?.leadTolerance ?? 150),
      leadCmdWeight: Number(options?.leadCmdWeight ?? 1),
      leadSlWeight: Number(options?.leadSlWeight ?? 0.6),
      applyDelayMs: Number(options?.applyDelayMs ?? 300),
      learnIntervalMs: Number(options?.learnIntervalMs ?? 300000),
      minPlayersToLearn: Number(options?.minPlayersToLearn ?? 8),
    };

    const skillCfg: SkillCfg = { minRatedGames: opt.skillMinGames };
    const leadCfg: LeadCfg = {
      minRatedGames: opt.skillMinGames,
      weights: { cmd: opt.leadCmdWeight, sl: opt.leadSlWeight },
    };

    Promise.resolve(sbEnsureSmartBalance(state.id, opt.retentionDays))
      .then(() => logger.log('[smart-balance] DB ready'))
      .catch((e) => logger.warn(`[smart-balance] DB skipped: ${String(e)}`));

    const detector = new TagDetector({
      serverId: state.id,
      maxLen: opt.clanMaxLen,
      minLen: opt.clanMinLen,
      minUnique: opt.tagMinUnique,
      minConfidence: opt.tagMinConfidence,
      minCohesion: opt.tagMinCohesion,
      blacklist: opt.blacklistTags,
      whitelist: opt.whitelistTags,
    });

    let lastLearnAt = 0;
    let learnInFlight = false;
    const learnNow = async (reason: string) => {
      if (learnInFlight) return;
      const players = (state.players ?? []) as TPlayer[];
      if (players.length < opt.minPlayersToLearn) return;
      learnInFlight = true;
      try {
        const saved = await detector.learnFromOnline(
          players,
          opt.partyWindowDays,
        );
        logger.log(`[smart-balance] learn payload saved=${saved}`);
      } catch (e) {
        logger.warn(`[smart-balance] learn error (${reason}): ${String(e)}`);
      } finally {
        learnInFlight = false;
        lastLearnAt = Date.now();
      }
    };
    const learnIfDue = (reason: string) => {
      if (Date.now() - lastLearnAt >= opt.learnIntervalMs)
        void learnNow(reason);
    };

    let tickTimer: NodeJS.Timeout | null = null;
    let matchPairsSeen = new Set<string>();
    const startTracker = (): void => {
      if (tickTimer) return;
      tickTimer = setInterval(async () => {
        try {
          const players = (state.players ?? []) as TPlayer[];
          const now = new Date();
          const bySquad = new Map<string, string[]>();
          for (const p of players) {
            if (!p?.steamID || !p.squadID || p.squadID === '0') continue;
            const key = `${p.teamID}|${p.squadID}`;
            if (!bySquad.has(key)) bySquad.set(key, []);
            bySquad.get(key)!.push(p.steamID);
          }
          const incs: Record<string, { sq?: number; mt?: number; at: Date }> =
            {};
          for (const members of bySquad.values()) {
            if (members.length < 2) continue;
            for (let i = 0; i < members.length; i += 1)
              for (let j = i + 1; j < members.length; j += 1) {
                const a = members[i],
                  b = members[j];
                const k = a < b ? `${a}|${b}` : `${b}|${a}`;
                const firstThisMatch = !matchPairsSeen.has(k);
                if (firstThisMatch) matchPairsSeen.add(k);
                incs[k] = {
                  sq: (incs[k]?.sq ?? 0) + opt.tickSeconds,
                  mt: (incs[k]?.mt ?? 0) + (firstThisMatch ? 1 : 0),
                  at: now,
                };
              }
          }
          await sbUpsertSocialEdges(state.id, incs);
        } catch (e) {
          logger.warn(`[smart-balance] tracker error: ${String(e)}`);
        }
      }, opt.tickSeconds * 1000);
      logger.log(`[smart-balance] tracker started (tick=${opt.tickSeconds}s)`);
    };
    const stopTracker = () => {
      matchPairsSeen = new Set<string>();
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
        logger.log('[smart-balance] tracker stopped');
      }
    };

    async function previewNow() {
      const players = (state.players ?? []) as TPlayer[];
      const ids = players.map((p) => p.steamID);
      if (opt.refreshSkillEachBalance) resetSkillCache(state.id, ids);
      await Promise.all([
        ...ids.map((id) => getSkill(state.id, id, skillCfg)),
        ...ids.map((id) => getLead(state.id, id, leadCfg)),
      ]);
      const { cA, cB, sA, sB } = currentBalance(players);
      const total = cA + cB;
      const { targetA, targetB } = targets(total, opt.teamCap);
      await adminBroadcast(
        execute as TExecute,
        `Баланс (текущий): A=${cA}/S=${fmtNum(
          Math.round(sA),
        )} | B=${cB}/S=${fmtNum(
          Math.round(sB),
        )} | цель ${targetA}/${targetB}, skill ≤ ${(
          opt.skillTolerancePct * 100
        ).toFixed(1)}%`,
      );
    }

    on(EVENTS.NEW_GAME, () => {
      matchPairsSeen = new Set<string>();
      startTracker();
      disposeTimers.add(setTimeout(() => learnIfDue('new_game'), 60000));
    });
    on(EVENTS.UPDATED_PLAYERS, () => {
      learnIfDue('players');
    });
    on(EVENTS.ROUND_ENDED, async () => {
      stopTracker();
      await sbDailyDecayEdges(state.id, opt.decayDailyFactor).catch(() => {});
      await learnNow('round_end');
    });

    let balanceRequested = false;
    on(EVENTS.SMART_BALANCE_ON, async () => {
      balanceRequested = true;
      await previewNow();
    });
    on(EVENTS.SMART_BALANCE_OFF, () => {
      balanceRequested = false;
    });

    on(EVENTS.ROUND_ENDED, async () => {
      if (!balanceRequested && !opt.autoBalance) return;
      try {
        const players = (state.players ?? []) as TPlayer[];
        const ids = players.map((p) => p.steamID);
        if (opt.refreshSkillEachBalance) resetSkillCache(state.id, ids);
        await Promise.all([
          ...ids.map((id) => getSkill(state.id, id, skillCfg)),
          ...ids.map((id) => getLead(state.id, id, leadCfg)),
        ]);

        const online = await buildOnline(state.id, players, (name) =>
          detector.detect(name),
        );
        const parties = await sbGetActivePartiesOnline(
          state.id,
          online.map((p) => p.steamID),
          opt.partyWindowDays,
          opt.partyMinSec,
          opt.partyMinMatches,
          opt.partyMaxSize,
        );

        const packs = buildPacks(
          online,
          parties,
          opt.prioritizeClans,
          opt.minClanSideSize,
          opt.clanMaxStackPerSide,
        );

        const { moves, final, targetA, targetB } = plan2(
          packs,
          opt.teamCap,
          opt.skillTolerancePct,
          Math.max(opt.hardSkillTolerancePct, opt.skillTolerancePct),
          opt.balanceLeadership,
          opt.leadTolerance,
        );

        const preview = `Баланс (предпросмотр): A=${final.cA}/S=${fmtNum(
          Math.round(final.sA),
        )} | B=${final.cB}/S=${fmtNum(
          Math.round(final.sB),
        )} | Цель: ${targetA}/${targetB}, skill ≤ ${(
          opt.skillTolerancePct * 100
        ).toFixed(
          1,
        )}% | Паков: ${moves.length} (лимит ${opt.swapLimitPerRound})`;
        await adminBroadcast(execute as TExecute, preview);

        const applied = await applyPackMovesAtomically(
          { players: state.players, logger, execute },
          moves,
          {
            protectCommander: opt.protectCommander && opt.protectAtRoundEnd,
            protectSquadLeader: opt.protectSquadLeader && opt.protectAtRoundEnd,
            swapLimitPerRound: opt.swapLimitPerRound,
            applyDelayMs: opt.applyDelayMs,
          },
        );

        const curPlayers = (state.players ?? []) as TPlayer[];
        const cur = currentBalance(curPlayers);
        const total = cur.cA + cur.cB;
        const { targetA: curTargetA, targetB: curTargetB } = targets(
          total,
          opt.teamCap,
        );

        const needA = Math.max(0, cur.cA - curTargetA);
        const needB = Math.max(0, cur.cB - curTargetB);
        const need = needA > 0 ? needA : needB > 0 ? needB : 0;

        if (need > 0) {
          const online2 = await buildOnline(state.id, curPlayers, (name) =>
            detector.detect(name),
          );
          const parties2 = await sbGetActivePartiesOnline(
            state.id,
            online2.map((p) => p.steamID),
            opt.partyWindowDays,
            opt.partyMinSec,
            opt.partyMinMatches,
            opt.partyMaxSize,
          );
          const packs2 = buildPacks(
            online2,
            parties2,
            opt.prioritizeClans,
            opt.minClanSideSize,
            opt.clanMaxStackPerSide,
          );
          const sc2 = score(packs2);
          const strong: Team = sc2.cA > sc2.cB ? 'A' : 'B';
          const weak: Team = strong === 'A' ? 'B' : 'A';

          const evac = chooseEvacWeakSquadAndFill(
            packs2,
            strong,
            Math.floor(Math.abs(sc2.cA - sc2.cB) / 2),
            Math.max(opt.hardSkillTolerancePct, opt.skillTolerancePct),
            new Set(),
          );
          const extraMoves: Move[] = [];
          for (const ev of evac)
            extraMoves.push({
              players: [...ev.players],
              from: strong,
              to: weak,
              note: 'final equalize',
              packType: ev.type,
              packId: ev.id,
            });
          if (extraMoves.length) {
            await applyPackMovesAtomically(
              { players: state.players, logger, execute },
              extraMoves,
              {
                protectCommander: opt.protectCommander && opt.protectAtRoundEnd,
                protectSquadLeader:
                  opt.protectSquadLeader && opt.protectAtRoundEnd,
                swapLimitPerRound: opt.swapLimitPerRound,
                applyDelayMs: opt.applyDelayMs,
              },
            );
          }
        }

        const fin = currentBalance((state.players ?? []) as TPlayer[]);
        await adminBroadcast(
          execute as TExecute,
          `Баланс применён. Сейчас A=${fin.cA}/S=${fmtNum(
            Math.round(fin.sA),
          )} | B=${fin.cB}/S=${fmtNum(Math.round(fin.sB))}`,
        );
        logger.log(
          `[smart-balance] Итог: A=${fin.cA}/S=${Math.round(fin.sA)} | B=${
            fin.cB
          }/S=${Math.round(fin.sB)} | паков применено=${applied}`,
        );
      } catch (e) {
        logger.error(`[smart-balance] apply failed: ${String(e)}`);
      } finally {
        balanceRequested = false;
      }
    });

    registerDisposable(() => {
      stopTracker();
      for (const t of disposeTimers) clearTimeout(t);
      disposeTimers.clear();
    });
  },
});
