import { describe, expect, it, vi } from 'vitest';
import { EVENTS } from '../constants';
import { getUserDataWithSteamID } from '../rnsdb';
import { createFakeState, makePlayer } from '../test/fakes';
import smartBalance, {
  buildPacks,
  getSkill,
  OnlinePlayer,
  Pack,
  plan2,
  resetSkillCache,
} from './smart-balance';

vi.mock('../rnsdb', () => ({
  getUserDataWithSteamID: vi.fn().mockResolvedValue(null),
  sbDailyDecayEdges: vi.fn().mockResolvedValue(undefined),
  sbEnsureSmartBalance: vi.fn().mockResolvedValue(undefined),
  sbGetActivePartiesOnline: vi.fn().mockResolvedValue([]),
  sbGetClanTagDocs: vi.fn().mockResolvedValue([]),
  sbUpdateClanCohesion: vi.fn().mockResolvedValue(undefined),
  sbUpdateClanTagCounters: vi.fn().mockResolvedValue(undefined),
  sbUpsertSocialEdges: vi.fn().mockResolvedValue(undefined),
}));

describe('smartBalance (smoke)', () => {
  it('initializes with default options and registers its listeners', () => {
    const { state, listener } = createFakeState({
      players: [makePlayer({ steamID: 'a' }), makePlayer({ steamID: 'b' })],
    });

    expect(() =>
      smartBalance.setup({
        state,
        options: {},
        logger: state.logger,
        registerDisposable: () => {},
      }),
    ).not.toThrow();

    expect(listener.listenerCount(EVENTS.NEW_GAME)).toBeGreaterThan(0);
    expect(listener.listenerCount(EVENTS.UPDATED_PLAYERS)).toBeGreaterThan(0);
    expect(listener.listenerCount(EVENTS.SMART_BALANCE_ON)).toBeGreaterThan(0);
  });
});

const op = (
  steamID: string,
  team: 'A' | 'B',
  skill: number,
  extra: Partial<OnlinePlayer> = {},
): OnlinePlayer =>
  ({
    steamID,
    name: steamID,
    teamID: team === 'A' ? '1' : '2',
    squadID: '0',
    skill,
    lead: 0,
    _team: team,
    ...extra,
  }) as unknown as OnlinePlayer;

const pack = (
  id: string,
  currentTeam: 'A' | 'B',
  skillSum: number,
  type: Pack['type'] = 'SOLO',
  players: string[] = [id],
  leadSum = 0,
): Pack => ({
  id,
  type,
  players,
  size: players.length,
  skillSum,
  leadSum,
  currentTeam,
});

describe('getSkill (рейтинг + фоллбэк)', () => {
  it('берёт rating.mu при достаточном числе игр', async () => {
    resetSkillCache();
    vi.mocked(getUserDataWithSteamID).mockResolvedValueOnce({
      rating: { mu: 1800, rd: 60, sigma: 0.06, games: 10, peak: 0, lastAt: 0 },
    } as never);
    expect(await getSkill(1, 'rated', { minRatedGames: 3 })).toBe(1800);
  });

  it('фоллбэк на эвристику при малом числе рейтинговых игр', async () => {
    resetSkillCache();
    vi.mocked(getUserDataWithSteamID).mockResolvedValueOnce({
      rating: { mu: 1800, rd: 300, sigma: 0.06, games: 1, peak: 0, lastAt: 0 },
      kd: 1,
      matches: { winrate: 50 },
      exp: 0,
    } as never);

    const v = await getSkill(1, 'fresh', { minRatedGames: 3 });
    expect(v).not.toBe(1800);
    expect(Math.abs(v - 1500)).toBeLessThanOrEqual(50);
  });

  it('нет данных → нейтральные ~1500', async () => {
    resetSkillCache();
    vi.mocked(getUserDataWithSteamID).mockResolvedValueOnce(null as never);
    const v = await getSkill(1, 'unknown', { minRatedGames: 3 });
    expect(Math.abs(v - 1500)).toBeLessThanOrEqual(200);
  });
});

describe('plan2 (головы + скилл)', () => {
  it('выводит головы к 50/50', () => {
    const packs: Pack[] = [
      pack('a', 'A', 1500),
      pack('b', 'A', 1500),
      pack('c', 'A', 1500),
      pack('d', 'A', 1500),
    ];
    const { final } = plan2(packs, 50, 0.05, 0.08);
    expect(final.cA).toBe(2);
    expect(final.cB).toBe(2);
  });

  it('застакавшийся клан разводится по сторонам, головы 50/50', () => {
    const clan = (id: string, team: 'A' | 'B', players: string[]): Pack => ({
      ...pack(id, team, 3000, 'CLAN', players),
      clanTag: 'WOLF',
    });
    const packs: Pack[] = [
      clan('w0', 'A', ['w1', 'w2']),
      clan('w1', 'A', ['w3', 'w4']),
      pack('s1', 'A', 1500),
      pack('s2', 'A', 1500),
      pack('s3', 'B', 1500),
      pack('s4', 'B', 1500),
    ];
    const { final, moves } = plan2(packs, 50, 0.05, 0.08);
    expect(final.cA).toBe(4);
    expect(final.cB).toBe(4);

    expect(moves.filter((m) => m.packType === 'CLAN').length).toBe(1);
  });

  it('разносит застакавшиеся кланы при уже равных головах', () => {
    const clanPk = (
      id: string,
      team: 'A' | 'B',
      tag: string,
      players: string[],
    ): Pack => ({ ...pack(id, team, 3000, 'CLAN', players), clanTag: tag });
    const packs: Pack[] = [
      clanPk('w', 'A', 'WOLF', ['w1', 'w2']),
      clanPk('b', 'A', 'BEAR', ['b1', 'b2']),
      pack('s1', 'B', 1500),
      pack('s2', 'B', 1500),
      pack('s3', 'B', 1500),
      pack('s4', 'B', 1500),
    ];
    const { final, moves } = plan2(packs, 50, 0.05, 0.08);
    expect(final.cA).toBe(4);
    expect(final.cB).toBe(4);
    expect(moves.some((m) => m.packType === 'CLAN')).toBe(true);
  });

  it('сжимает разницу по скиллу, сохраняя головы', () => {
    const packs: Pack[] = [
      pack('a', 'A', 1500),
      pack('b', 'A', 1300),
      pack('c', 'B', 1000),
      pack('d', 'B', 1000),
    ];
    const before = Math.abs(1500 + 1300 - (1000 + 1000));
    const { final } = plan2(packs, 50, 0.05, 0.08);
    expect(final.cA).toBe(2);
    expect(final.cB).toBe(2);
    expect(Math.abs(final.sA - final.sB)).toBeLessThan(before);
  });

  it('выравнивает лидерство solo-свопами, не ломая скилл/головы', () => {
    const packs: Pack[] = [
      pack('a', 'A', 1500, 'SOLO', ['a'], 100),
      pack('b', 'A', 1500, 'SOLO', ['b'], 80),
      pack('c', 'B', 1500, 'SOLO', ['c'], 0),
      pack('d', 'B', 1500, 'SOLO', ['d'], 0),
    ];
    const { final } = plan2(packs, 50, 0.05, 0.08, true, 50);
    expect(final.cA).toBe(2);
    expect(final.cB).toBe(2);
    expect(Math.abs(final.sA - final.sB)).toBe(0);
    expect(Math.abs(final.lA - final.lB)).toBeLessThan(180);
  });
});

describe('buildPacks (дробление застакавшегося клана)', () => {
  it('клан больше лимита на стороне дробится на чанки', () => {
    const online: OnlinePlayer[] = [];
    for (let i = 0; i < 10; i++)
      online.push(op(`w${i}`, 'A', 1500, { clanTag: 'WOLF' }));
    const packs = buildPacks(online, [], true, 2, 4);
    const clanPacks = packs.filter((p) => p.type === 'CLAN');
    expect(clanPacks.length).toBe(3);
    expect(clanPacks.reduce((s, p) => s + p.size, 0)).toBe(10);
    expect(Math.max(...clanPacks.map((p) => p.size))).toBeLessThanOrEqual(4);
  });
});
