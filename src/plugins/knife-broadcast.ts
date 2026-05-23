import { TPlayerWounded } from 'squad-logs';
import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminBroadcast } from '../core';
import { definePlugin } from '../core/plugin';
import { getPlayerBySteamID } from './helpers';

const DEFAULT_KNIFE_WEAPONS = [
  'SOCP',
  'AK74Bayonet',
  'M9Bayonet',
  'G3Bayonet',
  'Bayonet2000',
  'AKMBayonet',
  'SA80Bayonet',
  'QNL-95',
  'OKC-3S',
];

const DEFAULT_MESSAGE_TEMPLATES = [
  '{attacker} безжалостно почикал {victim} ножом!',
  '{attacker} мгновенно отправил {victim} в мир иной ножевым ударом!',
  '{attacker} показал истинное мастерство ножевого боя, зарезав {victim}!',
  '{attacker} зарезал {victim}, свежий кабанчик!',
];

const optionsSchema = z.object({
  knifeWeapons: z.array(z.string()).default(DEFAULT_KNIFE_WEAPONS),
  messageTemplates: z.array(z.string()).default(DEFAULT_MESSAGE_TEMPLATES),
});

function isKnifeWeapon(weapon: string, knifeWeapons: string[]): boolean {
  const weaponLower = weapon.toLowerCase();
  return knifeWeapons.some((knife) =>
    weaponLower.includes(knife.toLowerCase()),
  );
}

function randomArrayElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export default definePlugin({
  name: 'knifeBroadcast',
  description: 'Сообщения в эфир о ножевых убийствах.',
  optionsSchema,
  setup({ state, options, registerDisposable }) {
    const { listener, execute } = state;
    const { knifeWeapons, messageTemplates } = options;

    if (knifeWeapons.length === 0 || messageTemplates.length === 0) return;

    const onPlayerWounded = ({
      weapon,
      victimName,
      attackerSteamID,
    }: TPlayerWounded) => {
      if (!weapon || !victimName) return;
      if (!isKnifeWeapon(weapon, knifeWeapons)) return;

      const attacker = getPlayerBySteamID(state, attackerSteamID);
      if (!attacker?.name) return;

      const message = randomArrayElement(messageTemplates)
        .replace('{attacker}', attacker.name)
        .replace('{victim}', victimName);
      adminBroadcast(execute, message);
    };

    listener.on(EVENTS.PLAYER_WOUNDED, onPlayerWounded);
    registerDisposable(() =>
      listener.off(EVENTS.PLAYER_WOUNDED, onPlayerWounded),
    );
  },
});
