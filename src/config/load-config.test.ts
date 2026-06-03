import { describe, expect, it } from 'vitest';
import { loadConfig } from './load-config';

const baseServer = {
  host: 'h',
  password: 'p',
  port: 21114,
  logFilePath: 'l',
  adminsFilePath: 'a',
  mapsName: 'm',
  plugins: [],
};

describe('loadConfig', () => {
  it('parses a valid config and assigns numeric ids', () => {
    const { configs, errors } = loadConfig({ '1': baseServer }, {});
    expect(errors).toEqual([]);
    expect(configs).toHaveLength(1);
    expect(configs[0].id).toBe(1);
    expect(configs[0].host).toBe('h');
  });

  it('expands ${ENV} placeholders from the provided environment', () => {
    const { configs } = loadConfig(
      { '1': { ...baseServer, password: '${RCON_PW}' } },
      { RCON_PW: 'secret' },
    );
    expect(configs[0].password).toBe('secret');
  });

  it('collects errors and skips servers with missing required fields', () => {
    const broken = { ...baseServer } as Record<string, unknown>;
    delete broken.host;
    const { configs, errors } = loadConfig({ '1': broken }, {});
    expect(configs).toHaveLength(0);
    expect(errors.some((e) => e.includes('host'))).toBe(true);
  });

  it('reports a non-numeric server key', () => {
    const { errors } = loadConfig({ abc: baseServer }, {});
    expect(errors.some((e) => e.includes('not a numeric id'))).toBe(true);
  });
});
