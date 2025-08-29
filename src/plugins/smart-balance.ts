import { EVENTS } from '../constants';
import { adminBroadcast, adminForceTeamChange } from '../core';
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
import type { TExecute, TPlayer, TPluginProps } from '../types';

type Team = 'A' | 'B';
type PackType = 'CLAN' | 'PARTY' | 'SOLO';

interface OnlinePlayer extends TPlayer {
  clanTag?: string;
  skill: number;
  _team: Team;
}

interface Pack {
  id: string;
  type: PackType;
  players: string[];
  size: number;
  skillSum: number;
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

type TagDetectOpts = {
  frontWindow: number;
  maxLen: number;
  minLen: number;
  minUnique: number;
  minConfidence: number;
  minCohesion: number;
  blacklist: string[];
  whitelist: string[];
};

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
const esc = (s: string) => s.replace(/[\\/\\^$*+?.()|[\]{}]/g, '\\$&');

class TagDetector {
  private readonly opts: TagDetectOpts;
  constructor(opts: TagDetectOpts) {
    this.opts = opts;
  }
  private candidates(raw: string): { token: string; atStart: boolean }[] {
    const name = normalizeName(raw);
    const out: { token: string; atStart: boolean }[] = [];
    const lead = raw.match(
      /^\s*[\[\(\{<«"'’“”‚‘]\s*([A-Za-z0-9]{2,})\s*[\]\)\}>»"'’“”‚‘]/,
    );
    if (lead && lead[1]) {
      const t = normalizeName(lead[1]).slice(0, this.opts.maxLen);
      if (t.length >= this.opts.minLen) out.push({ token: t, atStart: true });
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
        if (t) out.push({ token: t, atStart: m.index <= 2 });
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
        if (t) out.push({ token: t, atStart: m.index <= 2 });
      }
    }
    const front = name.slice(0, this.opts.frontWindow);
    const cleaned = front.replace(/[^A-Z0-9]+/g, ' ').trim();
    if (cleaned) {
      const parts = cleaned.split(/\s+/);
      let pos = 0;
      for (const part of parts) {
        const token = part.slice(0, this.opts.maxLen);
        if (token && token.length >= this.opts.minLen)
          out.push({ token, atStart: pos === 0 });
        pos += part.length + 1;
      }
    }
    const uniq: string[] = [];
    const seen = new Set<string>();
    for (const c of out) {
      if (!seen.has(c.token)) {
        seen.add(c.token);
        uniq.push(c.token);
      }
    }
    return uniq.map((t, i) => ({ token: t, atStart: i === 0 }));
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
      if (this.opts.blacklist.includes(main.token)) continue;
      if (!buckets.has(main.token))
        buckets.set(main.token, { total: 0, start: 0, ids: new Set() });
      const b = buckets.get(main.token)!;
      b.total += 1;
      if (main.atStart) b.start += 1;
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
    const saved = await sbUpdateClanTagCounters(payload);
    for (const [tag, { ids }] of buckets) {
      const idsArr = Array.from(ids);
      if (idsArr.length < 2) continue;
      const onlinePairs = await sbGetActivePartiesOnline(
        idsArr,
        edgesWindowDays,
        900,
        9,
      );
      const pairs = (idsArr.length * (idsArr.length - 1)) / 2;
      const strongPairs = onlinePairs.reduce(
        (s, grp) => s + (grp.length * (grp.length - 1)) / 2,
        0,
      );
      const cohesion = pairs > 0 ? Math.min(1, strongPairs / pairs) : 0;
      await sbUpdateClanCohesion(tag, cohesion);
    }
    return saved;
  }
  async detect(rawName: string): Promise<string | undefined> {
    const cands = this.candidates(rawName);
    if (!cands.length) return undefined;
    const tokens = [...new Set(cands.slice(0, 2).map((c) => c.token))];
    for (const t of tokens)
      if (this.opts.whitelist.includes(t) && !this.opts.blacklist.includes(t))
        return t;
    const docs = await sbGetClanTagDocs(tokens);
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

const skillCache = new Map<string, number>();
async function getSkill(steamID: string): Promise<number> {
  if (skillCache.has(steamID)) return skillCache.get(steamID)!;
  try {
    const u: any = await getUserDataWithSteamID(steamID);
    const kd = Number(u?.kd ?? 1);
    const matches = Number(u?.matches?.matches ?? 0);
    const winrate = Number(u?.matches?.winrate ?? 0);
    const exp = Number(u?.exp ?? 0);
    const s =
      800 +
      kd * 150 +
      Math.min(200, Math.sqrt(exp) / 2) +
      Math.min(150, (matches * winrate) / 100);
    const val = Math.round(Number.isFinite(s) ? s : 1000);
    skillCache.set(steamID, val);
    return val;
  } catch {
    skillCache.set(steamID, 1000);
    return 1000;
  }
}

function buildOnline(
  players: readonly TPlayer[],
  tags: (name: string) => Promise<string | undefined>,
): Promise<OnlinePlayer[]> {
  return Promise.all(
    players.filter(Boolean).map(
      async (p) =>
        ({
          ...p,
          clanTag: await tags(p.name),
          skill: skillCache.get(p.steamID) ?? 1000,
          _team: playerTeam(p),
        }) as OnlinePlayer,
    ),
  );
}

function buildPacks(
  online: readonly OnlinePlayer[],
  parties: readonly string[][],
  prioritizeClans: boolean,
): Pack[] {
  const packs: Pack[] = [];
  const used = new Set<string>();
  if (prioritizeClans) {
    const cmap = new Map<string, Map<Team, OnlinePlayer[]>>();
    for (const p of online) {
      if (!p.clanTag) continue;
      if (!cmap.has(p.clanTag)) cmap.set(p.clanTag, new Map());
      const byTeam = cmap.get(p.clanTag)!;
      if (!byTeam.has(p._team)) byTeam.set(p._team, []);
      byTeam.get(p._team)!.push(p);
    }
    for (const [tag, byTeam] of cmap)
      for (const [team, arr] of byTeam) {
        if (!arr.length) continue;
        arr.forEach((p) => used.add(p.steamID));
        packs.push({
          id: `CLAN:${tag}:${team}`,
          type: 'CLAN',
          players: arr.map((x) => x.steamID),
          size: arr.length,
          skillSum: sum(arr, (x) => x.skill),
          currentTeam: team,
          clanTag: tag,
        });
      }
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
      currentTeam: flt[0]?._team ?? 'A',
    });
  }
  for (const p of online)
    if (!used.has(p.steamID))
      packs.push({
        id: `SOLO:${p.steamID}`,
        type: 'SOLO',
        players: [p.steamID],
        size: 1,
        skillSum: p.skill,
        currentTeam: p._team,
      });
  return packs;
}

function score(packs: readonly Pack[], teamCap: number, tol: number) {
  const A = packs.filter((p) => p.currentTeam === 'A');
  const B = packs.filter((p) => p.currentTeam === 'B');
  const cA = sum(A, (x) => x.size),
    cB = sum(B, (x) => x.size);
  const sA = sum(A, (x) => x.skillSum),
    sB = sum(B, (x) => x.skillSum);
  const okCount = Math.abs(cA - cB) <= 1 && cA <= teamCap && cB <= teamCap;
  const okSkill = Math.abs(sA - sB) <= (sA + sB) * tol;
  return { cA, cB, sA, sB, okCount, okSkill, ok: okCount && okSkill };
}

function pickForEqualize(
  need: number,
  srcTeam: Team,
  teamAIds: readonly string[],
  teamBIds: readonly string[],
  eligibleSrc: readonly string[],
  skill: Map<string, number>,
  hardTol: number,
): string[] {
  let SA = teamAIds.reduce((s, id) => s + (skill.get(id) ?? 1000), 0);
  let SB = teamBIds.reduce((s, id) => s + (skill.get(id) ?? 1000), 0);
  const chosen: string[] = [];
  const pool = new Set(eligibleSrc);
  for (let step = 0; step < need; step++) {
    let best: { id: string; diff: number } | null = null;
    for (const id of pool) {
      const s = skill.get(id) ?? 1000;
      const nSA = srcTeam === 'A' ? SA - s : SA + s;
      const nSB = srcTeam === 'A' ? SB + s : SB - s;
      const d = Math.abs(nSA - nSB);
      if (!best || d < best.diff) best = { id, diff: d };
    }
    if (!best) break;
    const s = skill.get(best.id) ?? 1000;
    const hSA = srcTeam === 'A' ? SA - s : SA + s;
    const hSB = srcTeam === 'A' ? SB + s : SB - s;
    if (Math.abs(hSA - hSB) > (hSA + hSB) * hardTol) {
      pool.delete(best.id);
      step--;
      if (pool.size === 0) break;
      continue;
    }
    chosen.push(best.id);
    pool.delete(best.id);
    if (srcTeam === 'A') {
      SA -= s;
      SB += s;
    } else {
      SB -= s;
      SA += s;
    }
  }
  return chosen;
}

const sideCount = (packs: readonly Pack[], side: Team) => {
  const arr = packs.filter((p) => p.currentTeam === side);
  return { count: sum(arr, (x) => x.size), skill: sum(arr, (x) => x.skillSum) };
};
const evacuateCandidates = (
  allOnSide: readonly Pack[],
  excludeId: string,
): Pack[] => {
  const others = allOnSide.filter((p) => p.id !== excludeId);
  const solos = others.filter((p) => p.type === 'SOLO');
  const parties = others
    .filter((p) => p.type === 'PARTY')
    .sort((a, b) => a.size - b.size || a.skillSum - b.skillSum);
  const rest = others
    .filter((p) => p.type !== 'SOLO' && p.type !== 'PARTY')
    .sort((a, b) => a.skillSum - b.skillSum);
  return [...solos, ...parties, ...rest];
};
function chooseClanToMove(
  packs: readonly Pack[],
  from: Team,
  to: Team,
  teamCap: number,
  hardTol: number,
): Pack | null {
  const clans = packs.filter(
    (p) => p.type === 'CLAN' && p.currentTeam === from,
  );
  let best: { pack: Pack; score: number } | null = null;
  for (const clan of clans) {
    const np = packs.map<Pack>((p) =>
      p.id === clan.id ? { ...p, currentTeam: to } : p,
    );
    const over = Math.max(0, sideCount(np, to).count - teamCap);
    const sA = sideCount(np, 'A').skill,
      sB = sideCount(np, 'B').skill;
    const dSkill = Math.abs(sA - sB);
    const hardOk = dSkill <= (sA + sB) * hardTol;
    if (!hardOk) continue;
    const sc = over * 1000 + dSkill;
    if (!best || sc < best.score) best = { pack: clan, score: sc };
  }
  return best?.pack ?? null;
}

function chooseEvacUnit(
  packs: readonly Pack[],
  from: Team,
  overflowLeft: number,
  hardTol: number,
  excludeId?: string,
): Pack | null {
  const sA0 = sideCount(packs, 'A').skill;
  const sB0 = sideCount(packs, 'B').skill;

  const cand = packs.filter(
    (p) =>
      p.currentTeam === from &&
      p.id !== excludeId &&
      p.size <= Math.max(1, overflowLeft),
  );

  let best: { pack: Pack; diff: number; key: number } | null = null;

  for (const pk of cand) {
    const nA = from === 'A' ? sA0 - pk.skillSum : sA0 + pk.skillSum;
    const nB = from === 'A' ? sB0 + pk.skillSum : sB0 - pk.skillSum;

    const diff = Math.abs(nA - nB);
    const lim = (nA + nB) * hardTol;
    if (diff > lim) continue;

    const typeRank = pk.type === 'SOLO' ? 0 : pk.type === 'PARTY' ? 1 : 2;
    const key = typeRank * 1e9 + pk.size * 1e6 + pk.skillSum;

    if (!best || diff < best.diff || (diff === best.diff && key < best.key)) {
      best = { pack: pk, diff, key };
    }
  }
  return best?.pack ?? null;
}

function choosePartyOrSolo(
  packs: readonly Pack[],
  from: Team,
  to: Team,
  teamCap: number,
  tol: number,
  hard: number,
): Pack | null {
  const cand = packs.filter(
    (p) => p.currentTeam === from && (p.type === 'PARTY' || p.type === 'SOLO'),
  );
  let best: { pack: Pack; gain: number } | null = null;
  for (const pk of cand) {
    const base = score(packs, teamCap, tol);
    const np = packs.map<Pack>((p) =>
      p.id === pk.id ? { ...p, currentTeam: to } : p,
    );
    const sc = score(np, teamCap, tol);
    const sTot = sc.sA + sc.sB || 1;
    const hardOk =
      Math.abs(sc.sA - sc.sB) <= sTot * hard &&
      sideCount(np, to).count <= teamCap;
    if (!hardOk) continue;
    const tolAbs = sTot * (tol || 0.0001);
    const gain =
      (Math.abs(base.cA - base.cB) -
        Math.abs(sc.cA - sc.cB) +
        (Math.abs(base.sA - base.sB) - Math.abs(sc.sA - sc.sB)) /
          Math.max(1, tolAbs)) /
      Math.max(1, pk.size);
    if (!best || gain > best.gain) best = { pack: pk, gain };
  }
  return best?.pack ?? null;
}
function enforceHeadcount(
  packs: readonly Pack[],
  teamCap: number,
  hardTol: number,
  skillMap: Map<string, number>,
): Move[] {
  let cur = [...packs];
  const moves: Move[] = [];

  const side = (t: Team) => {
    const arr = cur.filter((p) => p.currentTeam === t);
    const ids = arr.flatMap((p) => p.players);
    const count = sum(arr, (x) => x.size);
    const skill = ids.reduce((s, id) => s + (skillMap.get(id) ?? 1000), 0);
    return { count, skill, ids };
  };

  for (let i = 0; i < 200; i += 1) {
    const A = side('A'),
      B = side('B');
    const diff = A.count - B.count;
    const abs = Math.abs(diff);
    if (abs <= 1) break;

    const from: Team = diff > 0 ? 'A' : 'B';
    const to: Team = from === 'A' ? 'B' : 'A';
    const need = Math.floor(abs / 2);

    const fromPacks = cur.filter((p) => p.currentTeam === from);
    const solos = fromPacks.filter((p) => p.type === 'SOLO');
    const parties = fromPacks
      .filter((p) => p.type === 'PARTY')
      .sort((a, b) => a.size - b.size);

    const tryMove = (pk: Pack) => {
      const s = pk.players.reduce(
        (acc, id) => acc + (skillMap.get(id) ?? 1000),
        0,
      );
      const sA = from === 'A' ? A.skill - s : A.skill + s;
      const sB = from === 'A' ? B.skill + s : B.skill - s;
      return Math.abs(sA - sB) <= (sA + sB) * hardTol;
    };

    let moved = 0;
    for (const s of solos) {
      if (moved >= need) break;
      if (!tryMove(s)) continue;
      cur = cur.map((p) => (p.id === s.id ? { ...p, currentTeam: to } : p));
      moves.push({
        players: [...s.players],
        from,
        to,
        note: 'equalize',
        packType: s.type,
        packId: s.id,
      });
      moved += 1;
      if (side(to).count > teamCap) break;
    }
    if (moved < need) {
      for (const g of parties) {
        if (moved >= need) break;
        if (g.size > need - moved) continue;
        if (!tryMove(g)) continue;
        cur = cur.map((p) => (p.id === g.id ? { ...p, currentTeam: to } : p));
        moves.push({
          players: [...g.players],
          from,
          to,
          note: 'equalize',
          packType: g.type,
          packId: g.id,
        });
        moved += g.size;
        if (side(to).count > teamCap) break;
      }
    }
    if (moved === 0) break;
  }
  return moves;
}

function plan(
  initial: readonly Pack[],
  teamCap: number,
  tol: number,
  hard: number,
) {
  let packs = [...initial];
  const moves: Move[] = [];
  for (let i = 0; i < 500; i += 1) {
    const sc = score(packs, teamCap, tol);
    if (sc.ok) break;
    const strong: Team =
      sc.cA > sc.cB ? 'A' : sc.cB > sc.cA ? 'B' : sc.sA >= sc.sB ? 'A' : 'B';
    const weak: Team = strong === 'A' ? 'B' : 'A';
    const clan = chooseClanToMove(packs, strong, weak, teamCap, hard);
    if (clan) {
      packs = packs.map<Pack>((p) =>
        p.id === clan.id ? { ...p, currentTeam: weak } : p,
      );
      moves.push({
        players: [...clan.players],
        from: strong,
        to: weak,
        note: `CLAN ${clan.clanTag ?? clan.id}`,
        packType: 'CLAN',
        packId: clan.id,
      });
      let overflow = sideCount(packs, weak).count - teamCap;
      while (overflow > 0) {
        const ev = chooseEvacUnit(packs, weak, overflow, hard, clan.id);
        if (!ev) break;
        packs = packs.map<Pack>((p) =>
          p.id === ev.id ? { ...p, currentTeam: strong } : p,
        );
        moves.push({
          players: [...ev.players],
          from: weak,
          to: strong,
          note: 'overflow evac',
          packType: ev.type,
          packId: ev.id,
        });
        overflow -= ev.size;
      }
      continue;
    }
    const unit = choosePartyOrSolo(packs, strong, weak, teamCap, tol, hard);
    if (unit) {
      packs = packs.map<Pack>((p) =>
        p.id === unit.id ? { ...p, currentTeam: weak } : p,
      );
      moves.push({
        players: [...unit.players],
        from: strong,
        to: weak,
        note: unit.type,
        packType: unit.type,
        packId: unit.id,
      });
      continue;
    }
    const scStrong = sideCount(packs, strong).count,
      scWeak = sideCount(packs, weak).count;
    if (scStrong === teamCap && scWeak === teamCap) {
      const swapFromStrong = [
        ...packs.filter((p) => p.currentTeam === strong),
      ].sort((a, b) => b.size - a.size || b.skillSum - a.skillSum)[0];
      const weakCand = evacuateCandidates(
        packs.filter((p) => p.currentTeam === weak),
        '',
      )[0];
      if (!swapFromStrong || !weakCand) break;
      packs = packs.map<Pack>((p) =>
        p.id === swapFromStrong.id ? { ...p, currentTeam: weak } : p,
      );
      moves.push({
        players: [...swapFromStrong.players],
        from: strong,
        to: weak,
        note: 'swap A',
        packType: swapFromStrong.type,
        packId: swapFromStrong.id,
      });
      packs = packs.map<Pack>((p) =>
        p.id === weakCand.id ? { ...p, currentTeam: strong } : p,
      );
      moves.push({
        players: [...weakCand.players],
        from: weak,
        to: strong,
        note: 'swap B',
        packType: weakCand.type,
        packId: weakCand.id,
      });
      continue;
    }
    break;
  }
  const extra = enforceHeadcount(
    packs,
    teamCap,
    hard,
    new Map<string, number>(
      packs.flatMap((p) =>
        p.players.map((id) => [id, skillCache.get(id) ?? 1000]),
      ),
    ),
  );
  for (const m of extra) moves.push(m);
  const final = score(
    packs.map((p) => {
      let mv: Move | undefined = undefined;
      for (let i = moves.length - 1; i >= 0; i--) {
        if (moves[i].packId === p.id) {
          mv = moves[i];
          break;
        }
      }
      return mv ? { ...p, currentTeam: mv.to } : p;
    }),
    teamCap,
    tol,
  );
  return { moves, final };
}

function fmtNum(n: number): string {
  return n.toLocaleString('ru-RU');
}

function currentBalance(players: readonly TPlayer[]): {
  cA: number;
  cB: number;
  sA: number;
  sB: number;
} {
  const A = players.filter((p) => p.teamID === '1');
  const B = players.filter((p) => p.teamID === '2');
  const sumSide = (arr: TPlayer[]) =>
    arr.reduce((s, p) => s + (skillCache.get(p.steamID) ?? 1000), 0);
  return { cA: A.length, cB: B.length, sA: sumSide(A), sB: sumSide(B) };
}

export const smartBalance: TPluginProps = (state, options) => {
  const { listener, logger, execute } = state;
  const opt = {
    tickSeconds: Number(options?.tickSeconds ?? 60),
    partyWindowDays: Number(options?.partyWindowDays ?? 14),
    partyMinSec: Number(options?.partyMinSec ?? 900),
    partyMaxSize: Number(options?.partyMaxSize ?? 6),
    decayDailyFactor: Number(options?.decayDailyFactor ?? 0.98),
    retentionDays: Number(options?.retentionDays ?? 120),
    teamCap: Number(options?.teamCap ?? 50),
    skillTolerancePct: clamp01(Number(options?.skillTolerancePct ?? 0.05)),
    hardSkillTolerancePct: clamp01(
      Number(options?.hardSkillTolerancePct ?? 0.08),
    ),
    swapLimitPerRound: Number(options?.swapLimitPerRound ?? 24),
    protectCommander: Boolean(options?.protectCommander ?? true),
    protectSquadLeader: Boolean(options?.protectSquadLeader ?? true),
    prioritizeClans: Boolean(options?.prioritizeClans ?? true),
    frontWindow: Number(options?.frontWindow ?? 18),
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
    learnCooldownMs: Number(options?.learnCooldownMs ?? 300000),
    minPlayersToLearn: Number(options?.minPlayersToLearn ?? 16),
  };

  sbEnsureSmartBalance(opt.retentionDays)
    .then(() => logger.log('[smart-balance] DB ready'))
    .catch((e) => logger.warn(`[smart-balance] DB skipped: ${String(e)}`));

  const detector = new TagDetector({
    frontWindow: opt.frontWindow,
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
    if (Date.now() - lastLearnAt >= opt.learnCooldownMs) void learnNow(reason);
  };

  let tickTimer: NodeJS.Timeout | null = null;
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
        const incs: Record<string, { sq?: number; tm?: number; at: Date }> = {};
        for (const members of bySquad.values()) {
          if (members.length < 2 || members.length > opt.partyMaxSize) continue;
          for (let i = 0; i < members.length; i += 1)
            for (let j = i + 1; j < members.length; j += 1) {
              const a = members[i],
                b = members[j];
              const k = a < b ? `${a}|${b}` : `${b}|${a}`;
              incs[k] = { sq: (incs[k]?.sq ?? 0) + opt.tickSeconds, at: now };
            }
        }
        await sbUpsertSocialEdges(incs);
      } catch (e) {
        logger.warn(`[smart-balance] tracker error: ${String(e)}`);
      }
    }, opt.tickSeconds * 1000);
    logger.log(`[smart-balance] tracker started (tick=${opt.tickSeconds}s)`);
  };
  const stopTracker = () => {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
      logger.log('[smart-balance] tracker stopped');
    }
  };

  const previewNow = async () => {
    const players = (state.players ?? []) as TPlayer[];
    const miss = players
      .map((p) => p.steamID)
      .filter((id) => !skillCache.has(id));
    await Promise.all(miss.map((id) => getSkill(id)));
    const { cA, cB, sA, sB } = currentBalance(players);
    await adminBroadcast(
      execute as TExecute,
      `Баланс (текущий): A=${cA}/S=${fmtNum(
        Math.round(sA),
      )} | B=${cB}/S=${fmtNum(Math.round(sB))} | цель 50/50, skill ≤ ${(
        opt.skillTolerancePct * 100
      ).toFixed(1)}%`,
    );
  };

  listener.on(EVENTS.NEW_GAME, () => {
    startTracker();
    setTimeout(() => learnIfDue('new_game'), 60000);
  });
  listener.on(EVENTS.UPDATED_PLAYERS, () => {
    learnIfDue('players');
  });
  listener.on(EVENTS.ROUND_ENDED, async () => {
    stopTracker();
    await sbDailyDecayEdges(opt.decayDailyFactor).catch(() => {});
    await learnNow('round_end');
  });

  let balanceRequested = false;
  const moveLog: Array<{
    sid: string;
    name: string;
    from: Team;
    to: Team;
    pack: string;
    type: PackType;
  }> = [];

  listener.on(EVENTS.SMART_BALANCE_ON, async () => {
    balanceRequested = true;
    await previewNow();
  });
  listener.on(EVENTS.SMART_BALANCE_OFF, () => {
    balanceRequested = false;
  });

  listener.on(EVENTS.ROUND_ENDED, async () => {
    if (!balanceRequested) return;
    moveLog.length = 0;
    try {
      const players = (state.players ?? []) as TPlayer[];
      const miss = players
        .map((p) => p.steamID)
        .filter((id) => !skillCache.has(id));
      await Promise.all(miss.map((id) => getSkill(id)));
      const online = await buildOnline(players, (name) =>
        detector.detect(name),
      );
      const parties = await sbGetActivePartiesOnline(
        online.map((p) => p.steamID),
        opt.partyWindowDays,
        opt.partyMinSec,
        opt.partyMaxSize,
      );
      const packs = buildPacks(online, parties, opt.prioritizeClans);
      const { moves, final } = plan(
        packs,
        opt.teamCap,
        opt.skillTolerancePct,
        Math.max(opt.hardSkillTolerancePct, opt.skillTolerancePct),
      );
      const preview = `Баланс (предпросмотр): A=${final.cA}/S=${fmtNum(
        Math.round(final.sA),
      )} | B=${final.cB}/S=${fmtNum(
        Math.round(final.sB),
      )} | Цель: 50/50 и skill ≤ ${(opt.skillTolerancePct * 100).toFixed(
        1,
      )}% | Пачек к переносу: ${moves.length} (лимит ${opt.swapLimitPerRound})`;
      await adminBroadcast(execute as TExecute, preview);
      let packsApplied = 0;
      for (const mv of moves) {
        if (packsApplied >= opt.swapLimitPerRound) break;

        let movedThisPack = 0;
        for (const sid of mv.players) {
          const p = (state.players ?? []).find((x) => x.steamID === sid);
          if (!p) continue;
          if (opt.protectCommander && /COMMANDER/i.test(p.role ?? '')) continue;
          if (opt.protectSquadLeader && isSLRole(p.role)) continue;
          if (playerTeam(p) !== mv.from) continue;

          await adminForceTeamChange(execute as TExecute, sid);
          moveLog.push({
            sid,
            name: String(p.name || ''),
            from: mv.from,
            to: mv.to,
            pack: mv.packId,
            type: mv.packType,
          });
          movedThisPack += 1;
          await new Promise((res) => setTimeout(res, 300));
        }
        if (movedThisPack > 0) packsApplied += 1;
      }
      const currentPlayers = (state.players ?? []) as TPlayer[];
      const cur = currentBalance(currentPlayers);
      const needPlayers = Math.max(
        0,
        Math.floor(Math.abs(cur.cA - cur.cB) / 2),
      );
      if (needPlayers > 0) {
        const strong: Team = cur.cA > cur.cB ? 'A' : 'B';
        const weak: Team = strong === 'A' ? 'B' : 'A';

        const idsA = currentPlayers
          .filter((p) => p.teamID === '1')
          .map((p) => p.steamID);
        const idsB = currentPlayers
          .filter((p) => p.teamID === '2')
          .map((p) => p.steamID);

        const eligible = currentPlayers
          .filter((p) => playerTeam(p) === strong)
          .filter(
            (p) => !(opt.protectCommander && /COMMANDER/i.test(p.role ?? '')),
          )
          .filter((p) => !(opt.protectSquadLeader && isSLRole(p.role)))
          .map((p) => p.steamID);

        const skill = new Map<string, number>();
        for (const p of currentPlayers)
          skill.set(p.steamID, skillCache.get(p.steamID) ?? 1000);

        const toMove = pickForEqualize(
          needPlayers,
          strong,
          idsA,
          idsB,
          eligible,
          skill,
          Math.max(opt.hardSkillTolerancePct, opt.skillTolerancePct),
        );

        let applied = 0;
        for (const sid of toMove) {
          const p = currentPlayers.find((x) => x.steamID === sid);
          if (!p) continue;
          await adminForceTeamChange(execute as TExecute, sid);
          moveLog.push({
            sid,
            name: String(p.name || ''),
            from: strong,
            to: weak,
            pack: 'SOLO:equalize',
            type: 'SOLO',
          });
          applied += 1;
          await new Promise((r) => setTimeout(r, 250));
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
        `[smart-balance] Итог баланса: A=${fin.cA}/S=${Math.round(
          fin.sA,
        )} | B=${fin.cB}/S=${Math.round(fin.sB)} | переносов пачек=${Math.min(
          packsApplied,
          moves.length,
        )} | событий=${moveLog.length}`,
      );
      for (const m of moveLog)
        logger.log(
          `[smart-balance] move ${m.from}->${m.to} ${m.type} ${m.pack} | ${m.name} (${m.sid})`,
        );
    } catch (e) {
      state.logger.error(`[smart-balance] apply failed: ${String(e)}`);
    } finally {
      balanceRequested = false;
    }
  });
};

export default smartBalance;
