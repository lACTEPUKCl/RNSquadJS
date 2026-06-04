import { describe, expect, it } from 'vitest';
import { isDirectFireClass, weaponClass } from './weaponClass';

describe('incidents/weaponClass', () => {
  it('пехотное стрелковое → infantry', () => {
    for (const w of [
      'BP_AK74M',
      'BP_AK74_Pro',
      'BP_L85A2_LDS_Grippod',
      'BP_M4A1',
      'BP_Malyuk_556_Yoloson_Foregrip',
      'BP_AK74GP25_Pro_Rifle',
      'BP_SVD',
      'BP_PKM',
    ]) {
      expect(weaponClass(w)).toBe('infantry');
    }
  });

  it('оружие техники → vehicle', () => {
    for (const w of [
      'BP_BRDM2_AFU_KPVT',
      'BP_BRDM2_AFU_PKT',
      'BP_BMP2_Coax',
      'BP_T72_Cannon',
      'BP_L30A1_AP',
      'BP_Autocannon_2A42',
      'BP_Kamaz_5350_Logi',
    ]) {
      expect(weaponClass(w)).toBe('vehicle');
    }
  });

  it('взрыв/арта/мина/граната/РПГ → explosive', () => {
    for (const w of [
      'BP_Deployable_SZ1_Explosives_Timed',
      'BP_Mortarround4',
      'BP_RPG7_HEAT',
      'BP_M67_Grenade',
      'BP_VOG25_Projectile',
      'BP_Landmine',
      'BP_Fragmentation_DamageType',
    ]) {
      expect(weaponClass(w)).toBe('explosive');
    }
  });

  it('нож/штык → knife', () => {
    for (const w of ['BP_AK74_Bayonet', 'BP_Bayonet', 'BP_Combat_Knife']) {
      expect(weaponClass(w)).toBe('knife');
    }
  });

  it('пустое/неизвестное → infantry по умолчанию', () => {
    expect(weaponClass('')).toBe('infantry');
    expect(weaponClass(null)).toBe('infantry');
    expect(weaponClass('BP_Soldier_RU_Rifleman1')).toBe('infantry');
  });

  it('прямой огонь: infantry/vehicle/knife — да, explosive — нет', () => {
    expect(isDirectFireClass('infantry')).toBe(true);
    expect(isDirectFireClass('vehicle')).toBe(true);
    expect(isDirectFireClass('knife')).toBe(true);
    expect(isDirectFireClass('explosive')).toBe(false);
  });
});
