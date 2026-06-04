import { describe, expect, it } from 'vitest';
import type { IncidentDoc } from '../../rnsdb';
import { createIncidentEngine, IncidentAppendOpts } from './engine';

function setup() {
  const opened: IncidentDoc[] = [];
  const appended: { id: string; opts: IncidentAppendOpts }[] = [];
  const eng = createIncidentEngine({
    open: (d) => opened.push(d),
    append: (id, opts) => appended.push({ id, opts }),
  });
  eng.setContext({ serverId: 1, server: 'v1' });
  const openedOf = (t: string) => opened.filter((d) => d.type === t);
  return { eng, opened, appended, openedOf };
}

const ATT = { steamID: 'a', name: 'Att', teamID: '1' };

function kill(
  ts: number,
  weapon: string,
  victimTeamID: string,
  extra: Record<string, unknown> = {},
) {
  return {
    ts,
    attacker: ATT,
    victimName: 'V',
    victimTeamID,
    weapon,
    ...extra,
  };
}

describe('incidents/engine', () => {
  it('техника косит вражескую пехоту — НЕ rapid_kills', () => {
    const { eng, openedOf } = setup();
    for (let i = 0; i < 8; i++) {
      eng.onKill(kill(1000 + i * 300, 'BP_BRDM2_AFU_KPVT', '2'));
    }
    expect(openedOf('rapid_kills')).toHaveLength(0);
  });

  it('10 пех-киллов врага за 60с — rapid_kills, дальше наполняет тот же кейс', () => {
    const { eng, openedOf, appended } = setup();
    for (let i = 0; i < 10; i++) {
      eng.onKill(kill(1000 + i * 1000, 'BP_AK74M', '2'));
    }
    expect(openedOf('rapid_kills')).toHaveLength(1);
    eng.onKill(kill(12000, 'BP_AK74M', '2'));
    expect(openedOf('rapid_kills')).toHaveLength(1);
    expect(appended.length).toBeGreaterThan(0);
  });

  it('rapid_kills: при открытии в кейс попадает всё окно-доказательство', () => {
    const { eng, openedOf } = setup();
    for (let i = 0; i < 10; i++) {
      eng.onKill(kill(1000 + i * 1000, 'BP_AK74M', '2', { hs: i < 4 }));
    }
    const doc = openedOf('rapid_kills')[0];
    expect(doc.killlog).toHaveLength(10);
    expect(doc.counts.kills).toBe(10);
    expect(doc.counts.headshots).toBe(4);
  });

  it('knife_spree: при открытии в кейс попадает вся ножевая серия', () => {
    const { eng, openedOf } = setup();
    for (let i = 0; i < 4; i++) {
      eng.onKill(
        kill(1000 + i * 2000, 'BP_Bayonet', '2', { victimSteamID: 'v' + i }),
      );
    }
    const doc = openedOf('knife_spree')[0];
    expect(doc.killlog).toHaveLength(4);
    expect(doc.counts.knifeKills).toBe(4);
  });

  it('нож по союзнику — кейс mass_tk со 2-го', () => {
    const { eng, openedOf } = setup();
    eng.onKill(kill(1000, 'BP_Bayonet', '1', { victimSteamID: 'x' }));
    expect(openedOf('mass_tk')).toHaveLength(0);
    eng.onKill(kill(2000, 'BP_Bayonet', '1', { victimSteamID: 'y' }));
    expect(openedOf('mass_tk')).toHaveLength(1);
  });

  it('TK миной/артой — игровой момент, кейса нет', () => {
    const { eng, openedOf } = setup();
    eng.onKill(kill(1000, 'BP_Mortarround4', '1', { victimSteamID: 'x' }));
    eng.onKill(kill(2000, 'BP_Landmine', '1', { victimSteamID: 'y' }));
    eng.onKill(
      kill(3000, 'BP_Fragmentation_DamageType', '1', { victimSteamID: 'z' }),
    );
    expect(openedOf('mass_tk')).toHaveLength(0);
  });

  it('burst: 3 TK с техники за 3с — mass_tk high (загруженная техника)', () => {
    const { eng, openedOf } = setup();
    eng.onKill(kill(1000, 'BP_BMP2_Coax', '1', { victimSteamID: 'x' }));
    eng.onKill(kill(1400, 'BP_BMP2_Coax', '1', { victimSteamID: 'y' }));
    eng.onKill(kill(1800, 'BP_BMP2_Coax', '1', { victimSteamID: 'z' }));
    expect(openedOf('mass_tk')).toHaveLength(1);
    expect(openedOf('mass_tk')[0].severity).toBe('high');
  });

  it('ножевая серия 4 врага (не свежий спавн) — knife_spree', () => {
    const { eng, openedOf } = setup();
    for (let i = 0; i < 4; i++) {
      eng.onKill(
        kill(1000 + i * 2000, 'BP_Bayonet', '2', { victimSteamID: 'v' + i }),
      );
    }
    expect(openedOf('knife_spree')).toHaveLength(1);
  });

  it('ножевая серия по свежезаспавненным — НЕ считается', () => {
    const { eng, openedOf } = setup();
    for (let i = 0; i < 4; i++) {
      const ts = 1000 + i * 2000;
      eng.onRespawn('v' + i, ts - 3000, true);
      eng.onKill(kill(ts, 'BP_Bayonet', '2', { victimSteamID: 'v' + i }));
    }
    expect(openedOf('knife_spree')).toHaveLength(0);
  });

  it('хедшот ≥85% при ≥25 пех-киллах — headshot', () => {
    const { eng, openedOf } = setup();
    for (let i = 0; i < 25; i++) {
      eng.onKill(kill(1000 + i * 100, 'BP_AK74M', '2', { hs: true }));
    }
    expect(openedOf('headshot')).toHaveLength(1);
  });

  it('подрыв своей FOB — fob_grief сразу', () => {
    const { eng, openedOf } = setup();
    eng.onFobGrief(ATT, 5000, {
      weapon: 'BP_Deployable_SZ1_Explosives_Timed',
      damage: 750,
    });
    expect(openedOf('fob_grief')).toHaveLength(1);
  });
});
