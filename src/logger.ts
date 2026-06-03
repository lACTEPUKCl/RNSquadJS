import chalk from 'chalk';
import { format } from 'date-fns';

const getTime = () => format(new Date(), 'd LLL HH:mm:ss');

export interface Logger {
  log: (...text: string[]) => void;
  warn: (...text: string[]) => void;
  error: (...text: string[]) => void;
}

export const createLogger = (tag: string, enabled = true): Logger => {
  const prefix = () => chalk.yellow(`[SquadJS][${tag}][${getTime()}]`);
  return {
    log: (...text: string[]) => {
      if (enabled) console.log(prefix(), chalk.green(text));
    },
    warn: (...text: string[]) => {
      if (enabled) console.log(prefix(), chalk.magenta(text));
    },
    error: (...text: string[]) => {
      if (enabled) console.log(prefix(), chalk.red(text));
    },
  };
};

export const initLogger = (id: number, enabled: boolean): Logger =>
  createLogger(String(id), enabled);
