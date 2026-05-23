import { describe, expect, it } from 'vitest';
import {
  aggregateOpponent,
  applySupportFloor,
  classifyVehicle,
  combatImpact,
  commanderScore,
  DEFAULT_GLICKO,
  displayRating,
  expectedLead,
  Glicko,
  impactZScores,
  inflateRd,
  isCombatVehicle,
  isSupportVehicle,
  killValue,
  performanceToScore,
  squadLeaderScores,
  supportImpact,
  supportShare,
  teamResultScore,
  updateGlicko,
} from './elo';

const fresh = (): Glicko => ({ ...DEFAULT_GLICKO });

describe('Glicko-2 updateGlicko', () => {
  it('победитель растёт, проигравший падает (равные игроки)', () => {
    const win = updateGlicko(fresh(), 1500, 350, 1);
    const lose = updateGlicko(fresh(), 1500, 350, 0);
    expect(win.mu).toBeGreaterThan(1500);
    expect(lose.mu).toBeLessThan(1500);
  });

  it('после матча неопределённость (RD) уменьшается', () => {
    const after = updateGlicko(fresh(), 1500, 350, 1);
    expect(after.rd).toBeLessThan(DEFAULT_GLICKO.rd);
  });

  it('победа над сильным даёт больше, чем над равным', () => {
    const vsEqual = updateGlicko(fresh(), 1500, 50, 1);
    const vsStrong = updateGlicko(fresh(), 2000, 50, 1);
    expect(vsStrong.mu - 1500).toBeGreaterThan(vsEqual.mu - 1500);
  });

  it('поражение от слабого карается сильнее, чем от равного', () => {
    const vsEqual = updateGlicko(fresh(), 1500, 50, 0);
    const vsWeak = updateGlicko(fresh(), 1000, 50, 0);
    expect(vsWeak.mu).toBeLessThan(vsEqual.mu);
  });

  it('ничейный счёт (0.5) у равных почти не двигает рейтинг', () => {
    const draw = updateGlicko(fresh(), 1500, 350, 0.5);
    expect(Math.abs(draw.mu - 1500)).toBeLessThan(1);
  });
});

describe('агрегация и вклад', () => {
  it('aggregateOpponent: среднее mu', () => {
    const agg = aggregateOpponent([
      { mu: 1400, rd: 100, sigma: 0.06 },
      { mu: 1600, rd: 100, sigma: 0.06 },
    ]);
    expect(agg.mu).toBeCloseTo(1500, 5);
    expect(agg.rd).toBeGreaterThan(100);
  });

  it('combatImpact: килы плюс, тимкиллы сильный минус', () => {
    expect(
      combatImpact({ kills: 5, death: 2, revives: 0, teamkills: 0 }),
    ).toBeGreaterThan(
      combatImpact({ kills: 5, death: 2, revives: 0, teamkills: 2 }),
    );
  });

  it('combatImpact: килы с техники и дауны добавляют импакт', () => {
    const baseS = { kills: 5, death: 2, revives: 0, teamkills: 0 };
    expect(combatImpact({ ...baseS, vehicleKills: 3 })).toBeGreaterThan(
      combatImpact(baseS),
    );
    expect(combatImpact({ ...baseS, downs: 8 })).toBeGreaterThan(
      combatImpact(baseS),
    );
  });

  it('impactZScores: стандартизация (сумма ≈ 0)', () => {
    const z = impactZScores([1, 2, 3]);
    expect(z.reduce((s, x) => s + x, 0)).toBeCloseTo(0, 6);
    expect(z[2]).toBeGreaterThan(z[0]);
  });

  it('impactZScores: одинаковые импакты → нули', () => {
    expect(impactZScores([4, 4, 4])).toEqual([0, 0, 0]);
  });
});

describe('killValue (вес по рейтингу жертвы)', () => {
  it('убийство сильного дороже, слабого дешевле', () => {
    expect(killValue(1900)).toBeGreaterThan(killValue(1500));
    expect(killValue(1100)).toBeLessThan(killValue(1500));
  });

  it('равный = 1, ограничено [0.5, 2]', () => {
    expect(killValue(1500)).toBeCloseTo(1, 6);
    expect(killValue(5000)).toBeLessThanOrEqual(2);
    expect(killValue(0)).toBeGreaterThanOrEqual(0.5);
  });
});

describe('performanceToScore (модель против поля)', () => {
  it('хард-карри в ПОРАЖЕНИИ всё равно > 0.5 (растёт)', () => {
    expect(performanceToScore(2, false)).toBeGreaterThan(0.5);
  });

  it('слабый игрок в ПОБЕДЕ < 0.5 (не «пассажир»)', () => {
    expect(performanceToScore(-2, true)).toBeLessThan(0.5);
  });

  it('победа чуть выше поражения при равном перформансе', () => {
    expect(performanceToScore(0, true)).toBeGreaterThan(
      performanceToScore(0, false),
    );
  });

  it('счёт ограничен (0.05, 0.95)', () => {
    expect(performanceToScore(99, true)).toBeLessThanOrEqual(0.95);
    expect(performanceToScore(-99, false)).toBeGreaterThanOrEqual(0.05);
  });
});

describe('поддержка логистов/экипажей', () => {
  it('classifyVehicle: основные классы', () => {
    expect(classifyVehicle('BP_MI8_AFU')).toBe('heli');
    expect(classifyVehicle('BP_UH60')).toBe('heli');
    expect(classifyVehicle('BP_Kamaz_5350_Logi')).toBe('logi');
    expect(classifyVehicle('BP_Kraz_6322_Logi')).toBe('logi');
    expect(classifyVehicle('BP_Tigr')).toBe('transport');
    expect(classifyVehicle('BP_BTR_Passenger')).toBe('transport');
    expect(classifyVehicle('BP_T90A_Turret')).toBe('armor');
    expect(classifyVehicle('BP_BMP2_Turret')).toBe('armor');
    expect(classifyVehicle('BP_EmplacedKord_SPP')).toBe('turret');
  });

  it('isSupportVehicle / isCombatVehicle разделяют классы', () => {
    expect(isSupportVehicle('heli')).toBe(true);
    expect(isSupportVehicle('logi')).toBe(true);
    expect(isSupportVehicle('armor')).toBe(false);
    expect(isCombatVehicle('armor')).toBe(true);
    expect(isCombatVehicle('turret')).toBe(true);
    expect(isCombatVehicle('logi')).toBe(false);
  });

  it('supportImpact: больше времени/ассистов — больше импакт', () => {
    expect(supportImpact({ supportSeconds: 1800 })).toBeGreaterThan(0);
    expect(supportImpact({ supportSeconds: 1800 })).toBeGreaterThan(
      supportImpact({ supportSeconds: 600 }),
    );
    expect(supportImpact({ crewAssists: 4 })).toBeGreaterThan(
      supportImpact({ crewAssists: 1 }),
    );
    expect(supportImpact({})).toBe(0);
  });

  it('supportShare: доля времени в технике ограничена [0,1]', () => {
    expect(supportShare({ supportSeconds: 1200 }, 2400)).toBeCloseTo(0.5, 5);
    expect(supportShare({ supportSeconds: 9999 }, 2400)).toBeLessThanOrEqual(1);
    expect(supportShare({ supportSeconds: 100 }, 0)).toBe(0);
  });

  it('applySupportFloor: логист в победе не падает ниже 0.5', () => {
    expect(applySupportFloor(0.41, true, 0.8, 0)).toBeGreaterThanOrEqual(0.5);
  });

  it('applySupportFloor: гриферов (тимкиллы) не защищаем', () => {
    expect(applySupportFloor(0.2, true, 0.9, 3)).toBe(0.2);
  });

  it('applySupportFloor: не‑саппортов (низкая доля) не трогаем', () => {
    expect(applySupportFloor(0.3, true, 0.1, 0)).toBe(0.3);
  });

  it('applySupportFloor: поражение саппорта смягчается, но не выше loseFloor', () => {
    expect(applySupportFloor(0.2, false, 0.8, 0)).toBeCloseTo(0.4, 5);

    expect(applySupportFloor(0.62, false, 0.8, 0)).toBeCloseTo(0.62, 5);
  });
});

describe('teamResultScore (командная дуэль)', () => {
  it('победа ≥ 0.5, поражение ≤ 0.5', () => {
    expect(teamResultScore(true, 250, 100)).toBeGreaterThanOrEqual(0.5);
    expect(teamResultScore(false, 250, 100)).toBeLessThanOrEqual(0.5);
  });

  it('разгром ценится выше победы впритык', () => {
    expect(teamResultScore(true, 300, 0)).toBeGreaterThan(
      teamResultScore(true, 300, 299),
    );
  });

  it('счёт ограничен (0.05, 0.95)', () => {
    expect(teamResultScore(true, 300, 0)).toBeLessThanOrEqual(0.95);
    expect(teamResultScore(false, 300, 0)).toBeGreaterThanOrEqual(0.05);
  });
});

describe('expectedLead (лидерский вклад)', () => {
  it('не лидирует (доли 0) → вклад 0', () => {
    expect(
      expectedLead({ cmdMu: 1900, cmdGames: 50, cmdShare: 0, slShare: 0 }),
    ).toBe(0);
  });

  it('сильный частый командир > слабого/редкого', () => {
    const strong = expectedLead({
      cmdMu: 1900,
      cmdGames: 50,
      cmdShare: 0.4,
    });
    const weak = expectedLead({ cmdMu: 1550, cmdGames: 50, cmdShare: 0.05 });
    expect(strong).toBeGreaterThan(weak);
  });

  it('мало рейтинговых игр в роли → роль не учитывается', () => {
    expect(expectedLead({ cmdMu: 1900, cmdGames: 1, cmdShare: 0.5 })).toBe(0);
  });

  it('слабый лидер (mu ниже базы) даёт отрицательный вклад', () => {
    expect(
      expectedLead({ slMu: 1300, slGames: 20, slShare: 0.5 }),
    ).toBeLessThan(0);
  });
});

describe('служебное', () => {
  it('inflateRd увеличивает RD за неактивность', () => {
    const after = inflateRd({ mu: 1500, rd: 50, sigma: 0.06 }, 60);
    expect(after.rd).toBeGreaterThan(50);
  });

  it('displayRating: консервативный ниже mu', () => {
    const g = { mu: 1600, rd: 100, sigma: 0.06 };
    expect(displayRating(g, 'conservative')).toBe(1400);
    expect(displayRating(g, 'mu')).toBe(1600);
  });
});

describe('squadLeaderScores', () => {
  const row = (
    steamID: string,
    squadID: string,
    score: number,
    win: boolean,
    wasSquadLeader = false,
  ) => ({ steamID, teamID: '1', squadID, score, win, wasSquadLeader });

  it('SL сильного отряда получает балл выше, чем SL слабого', () => {
    const rows = [
      row('sl1', '1', 0.9, true, true),
      row('m1', '1', 0.8, true),
      row('m2', '1', 0.85, true),
      row('sl2', '2', 0.3, true, true),
      row('m3', '2', 0.2, true),
      row('m4', '2', 0.25, true),
    ];
    const out = squadLeaderScores(rows);
    expect(out.get('sl1')!).toBeGreaterThan(out.get('sl2')!);
  });

  it('судит по среднему на бойца, а не по сумме (размер отряда не решает)', () => {
    const rows = [
      // маленький, но сильный отряд
      row('slA', '1', 0.95, true, true),
      row('a1', '1', 0.9, true),
      // большой средний отряд
      row('slB', '2', 0.5, true, true),
      row('b1', '2', 0.5, true),
      row('b2', '2', 0.5, true),
      row('b3', '2', 0.5, true),
      row('b4', '2', 0.5, true),
    ];
    const out = squadLeaderScores(rows);
    expect(out.get('slA')!).toBeGreaterThan(out.get('slB')!);
  });

  it('игроки без отряда и отряды без SL игнорируются', () => {
    const rows = [
      row('solo', '0', 0.99, true),
      row('m', '1', 0.8, true),
      row('m2', '1', 0.8, true),
    ];
    const out = squadLeaderScores(rows);
    expect(out.has('solo')).toBe(false);
    expect(out.size).toBe(0);
  });
});

describe('commanderScore', () => {
  it('победа + больше FOB + сильнее отряды → выше', () => {
    const good = commanderScore({
      win: true,
      winnerTickets: 250,
      loserTickets: 50,
      myFobs: 8,
      enemyFobs: 2,
      mySquadAvg: 0.65,
      enemySquadAvg: 0.4,
    });
    const bad = commanderScore({
      win: false,
      winnerTickets: 250,
      loserTickets: 50,
      myFobs: 2,
      enemyFobs: 8,
      mySquadAvg: 0.4,
      enemySquadAvg: 0.65,
    });
    expect(good).toBeGreaterThan(bad);
    expect(good).toBeGreaterThan(0.5);
    expect(bad).toBeLessThan(0.5);
  });

  it('при равном результате больше FOB поднимает балл', () => {
    const base = {
      win: true,
      winnerTickets: 150,
      loserTickets: 100,
      mySquadAvg: 0.5,
      enemySquadAvg: 0.5,
    };
    const moreFobs = commanderScore({ ...base, myFobs: 10, enemyFobs: 2 });
    const fewFobs = commanderScore({ ...base, myFobs: 2, enemyFobs: 10 });
    expect(moreFobs).toBeGreaterThan(fewFobs);
  });
});
