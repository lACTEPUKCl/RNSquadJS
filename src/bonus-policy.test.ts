import { describe, it, expect } from 'vitest';
import { bonusRate } from './bonus-policy';
describe('RNS bonus policy', () => {
  const now = 1000000;
  const doc = { active: true, serverKey: 'vanila-1', updatedAt: new Date(now) };
  const base = { isSeed: false, seedRole: false, participant: null, target: doc, serverKey: 'vanila-1', now };
  it('ordinary 1, random seed 2', () => {
    expect(bonusRate(base)).toBe(1);
    expect(bonusRate({ ...base, isSeed: true })).toBe(2);
  });
  it('companion without role and role without companion receive 5 on target', () => {
    expect(bonusRate({ ...base, participant: doc })).toBe(5);
    expect(bonusRate({ ...base, seedRole: true })).toBe(5);
  });
  it('never boosts wrong server, expired target or expired participant', () => {
    expect(bonusRate({ ...base, seedRole: true, serverKey: 'vanila-2', isSeed: true })).toBe(2);
    expect(bonusRate({ ...base, seedRole: true, target: { ...doc, updatedAt: new Date(0) } })).toBe(1);
    expect(bonusRate({ ...base, participant: { ...doc, updatedAt: new Date(0) } })).toBe(1);
  });
});
