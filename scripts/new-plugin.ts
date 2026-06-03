/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';

/**
 * Генератор каркаса плагина нового образца.
 * Запуск:  yarn new:plugin myCoolPlugin
 */
const rawName = process.argv[2];
if (!rawName) {
  console.error('Usage: yarn new:plugin <pluginName>');
  process.exit(1);
}

const fileName = rawName
  .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .toLowerCase();

const target = path.resolve('src', 'plugins', `${fileName}.ts`);
if (fs.existsSync(target)) {
  console.error(`Plugin file already exists: ${target}`);
  process.exit(1);
}

const template = [
  "import { z } from 'zod';",
  "import { EVENTS } from '../constants';",
  "import { definePlugin } from '../core/plugin';",
  '',
  'const optionsSchema = z.object({',
  `  greeting: z.string().default('Hello from ${rawName}'),`,
  '});',
  '',
  'export default definePlugin({',
  `  name: '${rawName}',`,
  `  description: 'TODO: describe ${rawName}',`,
  '  optionsSchema,',
  '  setup({ state, options, logger, registerDisposable }) {',
  '    const { listener } = state;',
  '',
  '    const onNewGame = () => logger.log(options.greeting);',
  '    listener.on(EVENTS.NEW_GAME, onNewGame);',
  '',
  '    // Снимется автоматически при destroy (reload/shutdown):',
  '    registerDisposable(() => listener.off(EVENTS.NEW_GAME, onNewGame));',
  '  },',
  '});',
  '',
].join('\n');

fs.writeFileSync(target, template, 'utf-8');

console.log(`✓ Created ${target}`);
console.log('');
console.log('Next steps:');
console.log(
  `  1. Register it in src/plugins/registry.ts:\n` +
    `       import ${rawName} from './${fileName}';\n` +
    `       export const nativeManifest: SquadPlugin[] = [${rawName}];`,
);
console.log(
  `  2. Enable it in config.json:\n` +
    `       { "name": "${rawName}", "enabled": true, "options": {} }`,
);
