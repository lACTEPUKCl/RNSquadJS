import { describe, expect, it } from 'vitest';
import { VotingLock } from './voting-lock';

describe('VotingLock', () => {
  it('grants the lock to the first acquirer only', () => {
    const lock = new VotingLock();
    expect(lock.tryAcquire('skipmap')).toBe(true);
    expect(lock.tryAcquire('votemap')).toBe(false);
    expect(lock.isActive).toBe(true);
    expect(lock.owner).toBe('skipmap');
  });

  it('can be re-acquired after release', () => {
    const lock = new VotingLock();
    lock.tryAcquire('skipmap');
    lock.release('skipmap');
    expect(lock.isActive).toBe(false);
    expect(lock.tryAcquire('votemap')).toBe(true);
    expect(lock.owner).toBe('votemap');
  });

  it('ignores a release from a non-owner', () => {
    const lock = new VotingLock();
    lock.tryAcquire('skipmap');
    lock.release('votemap');
    expect(lock.isActive).toBe(true);
    expect(lock.owner).toBe('skipmap');
  });

  it('force-releases when no owner is provided', () => {
    const lock = new VotingLock();
    lock.tryAcquire('skipmap');
    lock.release();
    expect(lock.isActive).toBe(false);
  });
});
