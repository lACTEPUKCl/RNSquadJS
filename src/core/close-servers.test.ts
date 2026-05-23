import { describe, expect, it, vi } from 'vitest';
import { ClosableServer, closeServers } from './close-servers';

const server = (id: number): ClosableServer => ({
  id,
  rcon: { close: vi.fn().mockResolvedValue(undefined) },
  logs: { close: vi.fn().mockResolvedValue(undefined) },
});

describe('closeServers', () => {
  it('destroys plugins and closes rcon/logs for every server', async () => {
    const s1 = server(1);
    const s2 = server(2);
    const destroyManager = vi.fn();

    await closeServers([s1, s2], { destroyManager });

    expect(destroyManager).toHaveBeenCalledWith(1);
    expect(destroyManager).toHaveBeenCalledWith(2);
    expect(s1.rcon.close).toHaveBeenCalledTimes(1);
    expect(s1.logs.close).toHaveBeenCalledTimes(1);
    expect(s2.rcon.close).toHaveBeenCalledTimes(1);
  });

  it('continues and reports errors when a close fails', async () => {
    const bad: ClosableServer = {
      id: 1,
      rcon: { close: vi.fn().mockRejectedValue(new Error('rcon down')) },
      logs: { close: vi.fn().mockResolvedValue(undefined) },
    };
    const onError = vi.fn();

    await closeServers([bad], { destroyManager: vi.fn(), onError });

    expect(onError).toHaveBeenCalledWith('rcon[1]', expect.any(Error));

    expect(bad.logs.close).toHaveBeenCalledTimes(1);
  });
});
