import fs from 'fs';

const ENV_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

type EnvLike = Record<string, string | undefined>;

export interface DotEnvFs {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: BufferEncoding): string;
}

export const expandEnvString = (
  value: string,
  env: EnvLike = process.env,
): string =>
  value.replace(ENV_PATTERN, (_match, name: string) =>
    env[name] !== undefined ? (env[name] as string) : `\${${name}}`,
  );

export const expandEnvDeep = <T>(input: T, env: EnvLike = process.env): T => {
  if (typeof input === 'string') {
    return expandEnvString(input, env) as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => expandEnvDeep(item, env)) as unknown as T;
  }
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      out[key] = expandEnvDeep(val, env);
    }
    return out as unknown as T;
  }
  return input;
};

export const loadDotEnv = (filePath: string, fsImpl: DotEnvFs = fs): void => {
  if (!fsImpl.existsSync(filePath)) return;

  const content = fsImpl.readFileSync(filePath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
};
