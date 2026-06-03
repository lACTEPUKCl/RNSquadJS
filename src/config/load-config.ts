import { TConfig } from '../types';
import { expandEnvDeep } from './env';
import { serverConfigSchema } from './schema';

export interface LoadConfigResult {
  configs: TConfig[];
  errors: string[];
}

export const loadConfig = (
  raw: unknown,
  env: Record<string, string | undefined> = process.env,
): LoadConfigResult => {
  const errors: string[] = [];
  const configs: TConfig[] = [];

  const expanded = expandEnvDeep(raw, env);
  if (!expanded || typeof expanded !== 'object') {
    errors.push('Config must be a non-empty JSON object keyed by server id.');
    return { configs, errors };
  }

  for (const [key, value] of Object.entries(
    expanded as Record<string, unknown>,
  )) {
    const id = Number.parseInt(key, 10);
    if (Number.isNaN(id)) {
      errors.push(`Server key "${key}" is not a numeric id.`);
      continue;
    }

    const parsed = serverConfigSchema.safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.') || '(root)';
        errors.push(`Server "${key}": ${path} — ${issue.message}`);
      }
      continue;
    }

    configs.push({ id, ...parsed.data } as unknown as TConfig);
  }

  return { configs, errors };
};
