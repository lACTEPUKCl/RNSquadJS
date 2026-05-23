import fs from 'fs';
import { describe, expect, it, vi } from 'vitest';
import { getConfigs } from './utils';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

const validServer = {
  host: '127.0.0.1',
  password: 'secret',
  port: 21114,
  logFilePath: '/path/SquadGame.log',
  adminsFilePath: '/path/Admins.cfg',
  mapsName: 'vanilla.json',
  plugins: [],
};

describe('getConfigs', () => {
  it('returns null when the config file is missing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(getConfigs()).toBeNull();
  });

  it('parses a valid config and injects the numeric id from the key', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        '1': validServer,
        '2': { ...validServer, port: 21115 },
      }),
    );

    const configs = getConfigs();

    expect(configs).toHaveLength(2);
    expect(configs?.[0].id).toBe(1);
    expect(configs?.[0].host).toBe('127.0.0.1');
    expect(configs?.[1].id).toBe(2);
    expect(configs?.[1].port).toBe(21115);
  });

  it('returns null (skips invalid server) when a required option is missing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ '1': { host: 'only-host' } }),
    );
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(getConfigs()).toBeNull();
  });

  it('keeps valid servers and drops only the invalid one', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ '1': validServer, '2': { host: 'broken' } }),
    );
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const configs = getConfigs();
    expect(configs).toHaveLength(1);
    expect(configs?.[0].id).toBe(1);
  });
});
