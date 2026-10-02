import { describe, expect, it, vi } from 'vitest';
import {
  adminBan,
  adminForceTeamChange,
  adminKick,
  adminRemovePlayerFromSquad,
  adminWarn,
} from './commands';

describe('player command target guards', () => {
  it('never issues player commands with missing Steam identity', async () => {
    const execute = vi.fn();
    await adminBan(execute, '', 'reason');
    await adminKick(execute, '', 'reason');
    await adminWarn(execute, ' ', 'reason');
    await adminForceTeamChange(execute, '');
    await adminRemovePlayerFromSquad(execute, '');
    expect(execute).not.toHaveBeenCalled();
    await adminWarn(execute, '76561198000000000', 'reason');
    expect(execute).toHaveBeenCalledWith('AdminWarn 76561198000000000 reason');
  });
});
