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
import type { TExecute, TLogger, TPlayer, TPluginProps } from '../types';

// =============================================
//              Типы и утилиты
// =============================================

type Team = 'A' | 'B';
type PackType = 'SQUAD' | 'PARTY' | 'CLAN' | 'SOLO';

interface OnlinePlayer extends TPlayer {
  clanTag?: string;
  skill: number;
  _team: Team;
}

interface Pack {
  id: string; // уникальный идентификатор пака
  type: PackType; // тип пака
  players: string[]; // steamIDs
  size: number; // число игроков
  skillSum: number; // сумма скиллов
  currentTeam: Team; // текущая сторона
  clanTag?: string; // только для CLAN
}

interface Move {
  players: string[]; // перемещаемые steamIDs (всего пака)
  from: Team;
  to: Team;
  note: string; // причина/метка
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

// =============================================
//           Нормализация и TagDetector
//     (только теги в обрамлении/символах)
// =============================================

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

  // Ищем кандидатов ТОЛЬКО в обрамлениях/символах
  private candidates(raw: string): string[] {
    const out: string[] = [];
    // Лид с обрамлением
    const lead = raw.match(
      /^\s*[\[\(\{<«"'’“”‚‘]\s*([A-Za-z0-9]{2,})\s*[\]\)\}>»"'’“”‚‘]/,
    );
    if (lead && lead[1]) {
      const t = normalizeName(lead[1]).slice(0, this.opts.maxLen);
      if (t.length >= this.opts.minLen) out.push(t);
    }
    // Любые скобки
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
    // Символьные обрамления (---TAG---)
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
    // uniq
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
      // старт учитываем грубо: если матч начался с обрамлением в начале ника
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
    const tokens = this.candidates(rawName).slice(0, 2);
    if (!tokens.length) return undefined;
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

// =============================================
//                Скилл-кэш
// =============================================

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

// =============================================
//           Построение онлайн и паков
// =============================================

async function buildOnline(
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

function sideCount(packs: readonly Pack[], side: Team) {
  const arr = packs.filter((p) => p.currentTeam === side);
  const ids = arr.flatMap((p) => p.players);
  const count = sum(arr, (x) => x.size);
  const skill = ids.reduce((s, id) => s + (skillCache.get(id) ?? 1000), 0);
  return { count, skill, ids };
}

function buildPacks(
  online: readonly OnlinePlayer[],
  parties: readonly string[][],
  prioritizeClans: boolean,
  minClanSideSize: number,
): Pack[] {
  const packs: Pack[] = [];
  const used = new Set<string>();

  // 1) SQUAD
  const squadsMap = new Map<string, OnlinePlayer[]>();
  for (const p of online) {
    if (!p.squadID || p.squadID === '0') continue;
    const key = `${p._team}|${p.squadID}`;
    if (!squadsMap.has(key)) squadsMap.set(key, []);
    squadsMap.get(key)!.push(p);
  }
  for (const [key, arr] of squadsMap) {
    if (arr.length < 2) continue; // одиночные сквады не создаём
    arr.forEach((p) => used.add(p.steamID));
    const team = arr[0]._team;
    packs.push({
      id: `SQUAD:${team}:${key.split('|')[1]}`,
      type: 'SQUAD',
      players: arr.map((x) => x.steamID),
      size: arr.length,
      skillSum: sum(arr, (x) => x.skill),
      currentTeam: team,
    });
  }

  // 2) PARTY (по активным рёбрам)
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

  // 3) CLAN (по сторонам)
  if (prioritizeClans) {
    const cmap = new Map<string, Map<Team, OnlinePlayer[]>>();
    for (const p of online) {
      if (!p.clanTag || used.has(p.steamID)) continue;
      if (!cmap.has(p.clanTag)) cmap.set(p.clanTag, new Map());
      const byTeam = cmap.get(p.clanTag)!;
      if (!byTeam.has(p._team)) byTeam.set(p._team, []);
      byTeam.get(p._team)!.push(p);
    }
    for (const [tag, byTeam] of cmap) {
      for (const [team, arr] of byTeam) {
        if (!arr.length) continue;
        if (arr.length < Math.max(1, minClanSideSize)) continue; // не таскаем одиночные кланы
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
  }

  // 4) SOLO
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

// =============================================
//              Метрические функции
// =============================================

function score(packs: readonly Pack[]) {
  const A = sideCount(packs, 'A');
  const B = sideCount(packs, 'B');
  return { cA: A.count, cB: B.count, sA: A.skill, sB: B.skill };
}

function targets(totalPlayers: number, teamCap: number) {
  // Желаем ровно 50/50, но соблюдаем teamCap и нечётность общего числа
  const cap = Math.min(teamCap, Math.floor(totalPlayers / 2));
  const targetA = cap;
  const targetB = Math.min(teamCap, totalPlayers - cap);
  return { targetA, targetB };
}

// =============================================
//      Эвакуации: «слабый сквад, затем добор»
// =============================================

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

  // fallback: аккуратно собираем мелкими
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

// =============================================
//      Планировщик: 50/50 головы + скилл
// =============================================

function plan2(
  initial: readonly Pack[],
  teamCap: number,
  tol: number,
  hard: number,
) {
  let packs = [...initial];
  const moves: Move[] = [];
  const total = initial.reduce((s, p) => s + p.size, 0);
  const { targetA, targetB } = targets(total, teamCap);
  const lockedClanTags = new Set<string>(); // анти-перекрёст в рамках одной сессии

  // === Фаза 1: выводим головы ровно к targetA/targetB ===
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

    // Кандидаты к переносу со стороны from
    const base = score(packs);
    const candScored = packs
      .filter((p) => p.currentTeam === from && p.size <= need)
      .map((pk) => {
        const np = packs.map((p0) =>
          p0.id === pk.id ? { ...p0, currentTeam: to } : p0,
        );
        const before = Math.abs(base.sA - base.sB);
        const after = Math.abs(score(np).sA - score(np).sB);
        return { pk, rank: typeRank(pk), gain: before - after };
      })
      .sort((x, y) => y.rank - x.rank || y.gain - x.gain);

    let moved = false;
    for (const { pk } of candScored) {
      // проверим teamCap с возможной эвакуацией
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
        if (!evac.length) continue; // не получилось вместить
        // применяем перенос pk и эвакуации
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
    if (!moved) break; // не нашли кандидата для точного headcount
  }

  // === Фаза 2: подтягиваем скилл свопами (сохраняя точные головы) ===
  for (let guard = 0; guard < 200; guard++) {
    const sc = score(packs);
    if (!(sc.cA === targetA && sc.cB === targetB)) break; // головы уже не совпали (безопасность)
    const sTot = sc.sA + sc.sB || 1;
    const tolAbs = sTot * (tol || 0.0001);
    const diff = Math.abs(sc.sA - sc.sB);
    if (diff <= tolAbs) break; // уже достаточно близко
    const strong: Team = sc.sA >= sc.sB ? 'A' : 'B';
    const weak: Team = strong === 'A' ? 'B' : 'A';

    const base = score(packs);
    const candScored = packs
      .filter((p) => p.currentTeam === strong)
      .map((pk) => {
        const np = packs.map((p0) =>
          p0.id === pk.id ? { ...p0, currentTeam: weak } : p0,
        );
        const before = Math.abs(base.sA - base.sB);
        const after = Math.abs(score(np).sA - score(np).sB);
        return { pk, rank: typeRank(pk), gain: before - after };
      })
      .sort((x, y) => y.rank - x.rank || y.gain - x.gain);

    let improved = false;
    for (const { pk } of candScored) {
      // перенос pk увеличит головы на weak, нужно эвакуировать столько же слотов обратно
      const afterPk = packs.map((p) =>
        p.id === pk.id ? { ...p, currentTeam: weak } : p,
      );
      const overflow =
        sideCount(afterPk, weak).count - sideCount(packs, weak).count; // это = pk.size
      const evac = chooseEvacWeakSquadAndFill(
        afterPk,
        weak,
        overflow,
        hard,
        lockedClanTags,
      );
      if (!evac.length) continue;

      // смоделируем итог после эвакуаций
      let after = afterPk.map((p) => p);
      for (const ev of evac)
        after = after.map((p) =>
          p.id === ev.id ? { ...p, currentTeam: strong } : p,
        );
      const sc2 = score(after);
      const newDiff = Math.abs(sc2.sA - sc2.sB);
      if (
        newDiff < diff &&
        Math.abs(sc2.cA - targetA) === 0 &&
        Math.abs(sc2.cB - targetB) === 0
      ) {
        // применяем
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

  const final = score(packs);
  return { moves, final, targetA, targetB };
}

// =============================================
//      Атомарное применение паков и превью
// =============================================

function currentBalance(players: readonly TPlayer[]) {
  const A = players.filter((p) => p.teamID === '1');
  const B = players.filter((p) => p.teamID === '2');
  const sumSide = (arr: TPlayer[]) =>
    arr.reduce((s, p) => s + (skillCache.get(p.steamID) ?? 1000), 0);
  return { cA: A.length, cB: B.length, sA: sumSide(A), sB: sumSide(B) };
}

async function applyPackMovesAtomically(
  state: {
    players?: readonly TPlayer[];
    logger: TLogger; // ← ваш логгер
    execute: TExecute; // ← без unknown
  },
  moves: readonly Move[],
  options: {
    protectCommander: boolean;
    protectSquadLeader: boolean;
    swapLimitPerRound: number;
  },
): Promise<number> {
  const { logger, execute } = state; // ← без кастов
  let packsApplied = 0;

  for (const mv of moves) {
    if (packsApplied >= options.swapLimitPerRound) break;

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
      await new Promise((r) => setTimeout(r, 300));
    }

    packsApplied += 1;
  }

  return packsApplied;
}

// =============================================
//                Основной плагин
// =============================================

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
    // толеранс по скиллу (цель и жёсткий предел)
    skillTolerancePct: clamp01(Number(options?.skillTolerancePct ?? 0.05)),
    hardSkillTolerancePct: clamp01(
      Number(options?.hardSkillTolerancePct ?? 0.08),
    ),
    swapLimitPerRound: Number(options?.swapLimitPerRound ?? 24),
    // защиты ролей (можно отключить, если надо)
    protectCommander: Boolean(options?.protectCommander ?? true),
    protectSquadLeader: Boolean(options?.protectSquadLeader ?? true),
    // кланы и детектор
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
    // новое
    minClanSideSize: Number(options?.minClanSideSize ?? 2), // не таскать клан-пак size=1
  };

  sbEnsureSmartBalance(opt.retentionDays)
    .then(() => logger.log('[smart-balance] DB ready'))
    .catch((e) => logger.warn(`[smart-balance] DB skipped: ${String(e)}`));

  const detector = new TagDetector({
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
    if (players.length < 8) return; // минимум онлайна для обучения
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
    if (Date.now() - lastLearnAt >= 300000) void learnNow(reason); // 5 минут
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

  async function previewNow() {
    const players = (state.players ?? []) as TPlayer[];
    const miss = players
      .map((p) => p.steamID)
      .filter((id) => !skillCache.has(id));
    await Promise.all(miss.map((id) => getSkill(id)));
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
  listener.on(EVENTS.SMART_BALANCE_ON, async () => {
    balanceRequested = true;
    await previewNow();
  });
  listener.on(EVENTS.SMART_BALANCE_OFF, () => {
    balanceRequested = false;
  });

  listener.on(EVENTS.ROUND_ENDED, async () => {
    if (!balanceRequested) return;
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

      // ПАКИ: SQUAD -> PARTY -> CLAN(side) -> SOLO
      const packs = buildPacks(
        online,
        parties,
        opt.prioritizeClans,
        opt.minClanSideSize,
      );

      // План на 50/50 + скилл
      const { moves, final, targetA, targetB } = plan2(
        packs,
        opt.teamCap,
        opt.skillTolerancePct,
        Math.max(opt.hardSkillTolerancePct, opt.skillTolerancePct),
      );

      // Превью
      const preview = `Баланс (предпросмотр): A=${final.cA}/S=${fmtNum(
        Math.round(final.sA),
      )} | B=${final.cB}/S=${fmtNum(
        Math.round(final.sB),
      )} | Цель: ${targetA}/${targetB}, skill ≤ ${(
        opt.skillTolerancePct * 100
      ).toFixed(1)}% | Паков: ${moves.length} (лимит ${opt.swapLimitPerRound})`;
      await adminBroadcast(execute as TExecute, preview);

      // Применяем АТОМАРНО
      const applied = await applyPackMovesAtomically(
        { players: state.players, logger, execute },
        moves,
        {
          protectCommander: opt.protectCommander,
          protectSquadLeader: opt.protectSquadLeader,
          swapLimitPerRound: opt.swapLimitPerRound,
        },
      );

      // Контрольный добор, если кто-то «выпал» во время применения
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
        // Собираем пак-снимок ещё раз (по актуальным данным), чтобы не трогать группы по одному
        const online2 = await buildOnline(curPlayers, (name) =>
          detector.detect(name),
        );
        const parties2 = await sbGetActivePartiesOnline(
          online2.map((p) => p.steamID),
          opt.partyWindowDays,
          opt.partyMinSec,
          opt.partyMaxSize,
        );
        const packs2 = buildPacks(
          online2,
          parties2,
          opt.prioritizeClans,
          opt.minClanSideSize,
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
              protectCommander: opt.protectCommander,
              protectSquadLeader: opt.protectSquadLeader,
              swapLimitPerRound: opt.swapLimitPerRound,
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
};

export default smartBalance;
