export interface Glicko {
  mu: number;
  rd: number;
  sigma: number;
}

export const DEFAULT_GLICKO: Readonly<Glicko> = {
  mu: 1500,
  rd: 350,
  sigma: 0.06,
};

const SCALE = 173.7178;
const DEFAULT_TAU = 0.5;
const EPS = 1e-6;
const PI2 = Math.PI * Math.PI;

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) * (x - m))));
}

function gFun(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / PI2);
}

function newVolatility(
  sigma: number,
  delta: number,
  phi: number,
  v: number,
  tau: number,
): number {
  const a = Math.log(sigma * sigma);
  const d2 = delta * delta;
  const phi2 = phi * phi;

  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (d2 - phi2 - v - ex);
    const den = 2 * Math.pow(phi2 + v + ex, 2);
    return num / den - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (d2 > phi2 + v) {
    B = Math.log(d2 - phi2 - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  let it = 0;
  while (Math.abs(B - A) > EPS && it < 100) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
    it++;
  }
  return Math.exp(A / 2);
}

export function updateGlicko(
  player: Glicko,
  oppMu: number,
  oppRd: number,
  score: number,
  tau: number = DEFAULT_TAU,
): Glicko {
  const mu = (player.mu - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const muOpp = (oppMu - 1500) / SCALE;
  const phiOpp = oppRd / SCALE;

  const g = gFun(phiOpp);
  const E = 1 / (1 + Math.exp(-g * (mu - muOpp)));
  const v = 1 / (g * g * E * (1 - E));
  const delta = v * g * (score - E);

  const sigmaP = newVolatility(player.sigma, delta, phi, v, tau);
  const phiStar = Math.sqrt(phi * phi + sigmaP * sigmaP);
  const phiP = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muP = mu + phiP * phiP * g * (score - E);

  return { mu: SCALE * muP + 1500, rd: SCALE * phiP, sigma: sigmaP };
}

export function inflateRd(
  player: Glicko,
  days: number,
  periodDays = 30,
  maxRd = 350,
): Glicko {
  if (days <= 0) return player;
  const phi = player.rd / SCALE;
  const sigma = player.sigma;
  const phiStar = Math.sqrt(phi * phi + sigma * sigma * (days / periodDays));
  return { ...player, rd: Math.min(maxRd, SCALE * phiStar) };
}

export function aggregateOpponent(opponents: Glicko[]): {
  mu: number;
  rd: number;
} {
  if (opponents.length === 0) return { mu: 1500, rd: 350 };
  const mu = mean(opponents.map((o) => o.mu));
  const meanRd2 = mean(opponents.map((o) => o.rd * o.rd));
  const spread = std(opponents.map((o) => o.mu));
  return { mu, rd: Math.sqrt(meanRd2 + spread * spread) };
}

export interface ImpactStats {
  kills: number;
  death: number;
  revives: number;
  teamkills: number;
  vehicleKills?: number;
  downs?: number;
}

export interface ImpactWeights {
  kill?: number;
  vehicleKill?: number;
  down?: number;
  revive?: number;
  death?: number;
  teamkill?: number;
}

export const DEFAULT_IMPACT_WEIGHTS: Required<ImpactWeights> = {
  kill: 1,
  vehicleKill: 0.5,
  down: 0.3,
  revive: 0.5,
  death: 0.5,
  teamkill: 2,
};

export function combatImpact(s: ImpactStats, w: ImpactWeights = {}): number {
  const W = { ...DEFAULT_IMPACT_WEIGHTS, ...w };
  return (
    W.kill * s.kills +
    W.vehicleKill * (s.vehicleKills ?? 0) +
    W.down * (s.downs ?? 0) +
    W.revive * s.revives -
    W.death * s.death -
    W.teamkill * s.teamkills
  );
}

export function killValue(
  victimMu: number,
  opts: {
    baseMu?: number;
    perPoint?: number;
    minMul?: number;
    maxMul?: number;
  } = {},
): number {
  const { baseMu = 1500, perPoint = 1 / 400, minMul = 0.5, maxMul = 2 } = opts;
  return clamp(1 + (victimMu - baseMu) * perPoint, minMul, maxMul);
}

export function performanceToScore(
  z: number,
  win: boolean,
  opts: { perfSpread?: number; winNudge?: number } = {},
): number {
  const { perfSpread = 0.45, winNudge = 0.05 } = opts;
  const s = 0.5 + Math.tanh(z / 2) * perfSpread + (win ? winNudge : -winNudge);
  return clamp(s, 0.05, 0.95);
}

export type VehicleClass =
  | 'logi'
  | 'transport'
  | 'heli'
  | 'armor'
  | 'turret'
  | 'other';

export function classifyVehicle(asset: string): VehicleClass {
  const a = (asset || '').toLowerCase();
  if (/mi8|mi17|uh1|uh60|ch146|ch178|sa330|mrh90|z8|z9|loach|raven/.test(a))
    return 'heli';
  if (
    /logi|logistic|_util|kamaz|kraz|ural|truck|m939|rhib_logistics|_dg_logistics/.test(
      a,
    )
  )
    return 'logi';
  if (/emplaced|tripod|baseplate|mortar|deployable/.test(a)) return 'turret';
  if (
    /passenger|tigr|minsk|quadbike|technical|luvw|matv|pmv|tapv|kozak|lppv|lynx/.test(
      a,
    )
  )
    return 'transport';
  if (
    /t62|t64|t72|t90|m1a1|m1a2|2a6|leopard|challenger|fv4034|fv432|fv510|fv107|ztz|zbd|zbl|ztd|bmp|bmd|btr|lav|stryker|m113|m1117|m1126|m1128|mtlb|warrior|bfv|aslav|aavp|coyote|scimitar|acv|sprut|tlav|cpv|spandrel|simir|brdm/.test(
      a,
    )
  )
    return 'armor';
  if (/turret|_rws|_kord|_pkt|_kpvt|cupola|doorgun|periscope/.test(a))
    return 'turret';
  return 'other';
}

export function isCombatVehicle(c: VehicleClass): boolean {
  return c === 'armor' || c === 'turret';
}

export function isSupportVehicle(c: VehicleClass): boolean {
  return c === 'logi' || c === 'transport' || c === 'heli';
}

export interface SupportStats {
  supportSeconds?: number;
  crewSeconds?: number;
  crewAssists?: number;
}

export interface SupportWeights {
  supportPerMin?: number;
  crewPerMin?: number;

  crewAssist?: number;
}

export const DEFAULT_SUPPORT_WEIGHTS: Required<SupportWeights> = {
  supportPerMin: 0.1,
  crewPerMin: 0.08,
  crewAssist: 0.5,
};

export function supportImpact(s: SupportStats, w: SupportWeights = {}): number {
  const W = { ...DEFAULT_SUPPORT_WEIGHTS, ...w };
  return (
    W.supportPerMin * ((s.supportSeconds ?? 0) / 60) +
    W.crewPerMin * ((s.crewSeconds ?? 0) / 60) +
    W.crewAssist * (s.crewAssists ?? 0)
  );
}

export function supportShare(s: SupportStats, matchSeconds: number): number {
  if (matchSeconds <= 0) return 0;
  const t = (s.supportSeconds ?? 0) + (s.crewSeconds ?? 0);
  return clamp(t / matchSeconds, 0, 1);
}

export interface SupportFloorOpts {
  shareThreshold?: number;
  winFloor?: number;
  loseFloor?: number;
}

export function applySupportFloor(
  score: number,
  win: boolean,
  share: number,
  teamkills: number,
  opts: SupportFloorOpts = {},
): number {
  const { shareThreshold = 0.5, winFloor = 0.5, loseFloor = 0.4 } = opts;
  if (teamkills > 0) return score;
  if (share < shareThreshold) return score;
  return Math.max(score, win ? winFloor : loseFloor);
}

export function impactZScores(impacts: number[]): number[] {
  const m = mean(impacts);
  const sd = std(impacts);
  if (sd < EPS) return impacts.map(() => 0);
  return impacts.map((x) => (x - m) / sd);
}

export function displayRating(
  g: Glicko,
  mode: 'conservative' | 'mu' = 'conservative',
): number {
  return Math.round(mode === 'mu' ? g.mu : g.mu - 2 * g.rd);
}

export function teamResultScore(
  win: boolean,
  winnerTickets: number,
  loserTickets: number,
  movWeight = 0.5,
): number {
  const wT = Math.max(0, winnerTickets);
  const lT = Math.max(0, loserTickets);
  const denom = wT + Math.max(1, lT);
  const ratio = denom > 0 ? wT / denom : 0.5;
  const mov = 0.5 + (ratio - 0.5) * movWeight;
  return win ? clamp(mov, 0.5, 0.95) : clamp(1 - mov, 0.05, 0.5);
}

export interface LeadInput {
  cmdMu?: number;
  cmdGames?: number;
  slMu?: number;
  slGames?: number;
  cmdShare?: number;
  slShare?: number;
}

export interface LeadWeights {
  cmd?: number;
  sl?: number;
  minGames?: number;
  baseMu?: number;
}

export const DEFAULT_LEAD_WEIGHTS: Required<LeadWeights> = {
  cmd: 1,
  sl: 0.6,
  minGames: 3,
  baseMu: 1500,
};

export function expectedLead(inp: LeadInput, w: LeadWeights = {}): number {
  const W = { ...DEFAULT_LEAD_WEIGHTS, ...w };
  const cmdStrength =
    (inp.cmdGames ?? 0) >= W.minGames ? (inp.cmdMu ?? W.baseMu) - W.baseMu : 0;
  const slStrength =
    (inp.slGames ?? 0) >= W.minGames ? (inp.slMu ?? W.baseMu) - W.baseMu : 0;
  const cmdShare = clamp(inp.cmdShare ?? 0, 0, 1);
  const slShare = clamp(inp.slShare ?? 0, 0, 1);
  return W.cmd * cmdShare * cmdStrength + W.sl * slShare * slStrength;
}

export interface SquadLeadRow {
  steamID: string;
  teamID: string;
  squadID: string;
  score: number;
  win: boolean;
  wasSquadLeader: boolean;
}

export interface SquadLeadOpts {
  perfSpread?: number;
  winNudge?: number;
  minSquadSize?: number;
}

export function squadLeaderScores(
  rows: readonly SquadLeadRow[],
  opts: SquadLeadOpts = {},
): Map<string, number> {
  const { perfSpread, winNudge, minSquadSize = 2 } = opts;

  const squads = new Map<
    string,
    { members: SquadLeadRow[]; sl?: string; win: boolean }
  >();
  for (const r of rows) {
    if (!r.squadID || r.squadID === '0') continue;
    const key = `${r.teamID}:${r.squadID}`;
    let s = squads.get(key);
    if (!s) {
      s = { members: [], win: r.win };
      squads.set(key, s);
    }
    s.members.push(r);
    if (r.wasSquadLeader) s.sl = r.steamID;
  }

  const aggs: { sl: string; avg: number; win: boolean }[] = [];
  for (const s of squads.values()) {
    if (!s.sl || s.members.length < minSquadSize) continue;
    const avg = s.members.reduce((a, m) => a + m.score, 0) / s.members.length;
    aggs.push({ sl: s.sl, avg, win: s.win });
  }

  const out = new Map<string, number>();
  if (aggs.length === 0) return out;

  const mean = aggs.reduce((a, x) => a + x.avg, 0) / aggs.length;
  const variance =
    aggs.reduce((a, x) => a + (x.avg - mean) ** 2, 0) / aggs.length;
  const std = Math.sqrt(variance) || 1e-6;

  for (const a of aggs) {
    const z = (a.avg - mean) / std;
    out.set(a.sl, performanceToScore(z, a.win, { perfSpread, winNudge }));
  }
  return out;
}

export interface CommanderInput {
  win: boolean;
  winnerTickets: number;
  loserTickets: number;
  myFobs: number;
  enemyFobs: number;
  mySquadAvg: number;
  enemySquadAvg: number;
}

export interface CommanderWeights {
  result?: number;
  fob?: number;
  squads?: number;
  movWeight?: number;
}

export const DEFAULT_COMMANDER_WEIGHTS: Required<CommanderWeights> = {
  result: 0.6,
  fob: 0.2,
  squads: 0.2,
  movWeight: 0.5,
};

export function commanderScore(
  inp: CommanderInput,
  w: CommanderWeights = {},
): number {
  const W = { ...DEFAULT_COMMANDER_WEIGHTS, ...w };
  const result = teamResultScore(
    inp.win,
    inp.winnerTickets,
    inp.loserTickets,
    W.movWeight,
  );
  const fobTotal = Math.max(0, inp.myFobs) + Math.max(0, inp.enemyFobs);
  const fob = fobTotal > 0 ? inp.myFobs / fobTotal : 0.5;
  const squads = clamp(0.5 + (inp.mySquadAvg - inp.enemySquadAvg), 0.05, 0.95);
  const sumW = W.result + W.fob + W.squads || 1;
  const s = (W.result * result + W.fob * fob + W.squads * squads) / sumW;
  return clamp(s, 0.05, 0.95);
}
