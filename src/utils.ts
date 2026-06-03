import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import url from 'url';
import { loadDotEnv } from './config/env';
import { loadConfig } from './config/load-config';
import { TConfig } from './types';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const tag = chalk.yellow('[SquadJS]');

export const getConfigs = (): TConfig[] | null => {
  const configPath = path.resolve(__dirname, '../config.json');

  loadDotEnv(path.resolve(__dirname, '../.env'));

  if (!fs.existsSync(configPath)) {
    console.log(tag, chalk.red('config.json не найден.'));
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    console.log(
      tag,
      chalk.red(`config.json — невалидный JSON: ${String(err)}`),
    );
    return null;
  }

  const { configs, errors } = loadConfig(raw);
  for (const e of errors) console.log(tag, chalk.red(e));

  if (!configs.length) {
    console.log(tag, chalk.red('Нет валидных серверов в конфиге.'));
    return null;
  }

  return configs;
};
