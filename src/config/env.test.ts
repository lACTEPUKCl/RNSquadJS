import { afterEach, describe, expect, it } from 'vitest';
import { DotEnvFs, expandEnvDeep, expandEnvString, loadDotEnv } from './env';

describe('expandEnvString', () => {
  it('substitutes defined variables', () => {
    expect(expandEnvString('${A}/path', { A: 'val' })).toBe('val/path');
  });

  it('leaves undefined variables as a placeholder', () => {
    expect(expandEnvString('${MISSING}', {})).toBe('${MISSING}');
  });
});

describe('expandEnvDeep', () => {
  it('recurses objects and arrays, leaving non-strings intact', () => {
    const out = expandEnvDeep(
      { a: '${A}', b: [{ c: '${A}' }], n: 5, t: true },
      { A: 'x' },
    );
    expect(out).toEqual({ a: 'x', b: [{ c: 'x' }], n: 5, t: true });
  });
});

describe('loadDotEnv', () => {
  afterEach(() => {
    delete process.env.FOO_TEST;
    delete process.env.BAR_TEST;
  });

  const fakeFs: DotEnvFs = {
    existsSync: () => true,
    readFileSync: () => 'FOO_TEST=1\n# a comment\nBAR_TEST="two"\n',
  };

  it('parses key=value lines, comments and quotes', () => {
    loadDotEnv('.env', fakeFs);
    expect(process.env.FOO_TEST).toBe('1');
    expect(process.env.BAR_TEST).toBe('two');
  });

  it('does not overwrite already-defined variables', () => {
    process.env.FOO_TEST = 'keep';
    loadDotEnv('.env', fakeFs);
    expect(process.env.FOO_TEST).toBe('keep');
  });

  it('is a no-op when the file does not exist', () => {
    const missing: DotEnvFs = {
      existsSync: () => false,
      readFileSync: () => {
        throw new Error('should not be called');
      },
    };
    expect(() => loadDotEnv('.env', missing)).not.toThrow();
  });
});
