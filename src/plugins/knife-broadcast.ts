import { TPlayerWounded } from 'squad-logs';
import { EVENTS } from '../constants';
import { adminBroadcast } from '../core';
import { TPluginProps } from '../types';
import { getPlayerBySteamID } from './helpers';

function isKnifeWeapon(weapon: string, knifeWeapons: string[]): boolean {
  const weaponLower = weapon.toLowerCase();
  return knifeWeapons.some((knife) =>
    weaponLower.includes(knife.toLowerCase()),
  );
}

function randomArrayElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export const knifeBroadcast: TPluginProps = (state) => {
  const { listener, logger, execute } = state;

  const knifeWeapons: string[] = [
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

  const messageTemplates: string[] = [
    '{attacker} безжалостно почикал {victim} ножом!',
    '{attacker} мгновенно отправил {victim} в мир иной ножевым ударом!',
    '{attacker} показал истинное мастерство ножевого боя, зарезав {victim}!',
    '{attacker} зарезал {victim}, свежий кабаньчик!',
  ];

  const onPlayerWounded = ({
    weapon,
    victimName,
    attackerSteamID,
  }: TPlayerWounded) => {
    if (!weapon) return;

    const attacker = getPlayerBySteamID(state, attackerSteamID);
    if (!attacker || !attacker.name) return;

    if (isKnifeWeapon(weapon, knifeWeapons)) {
      const template = randomArrayElement(messageTemplates);
      const message = template
        .replace('{attacker}', attacker.name)
        .replace('{victim}', victimName);
      adminBroadcast(execute, message);
    }
  };

  listener.on(EVENTS.PLAYER_WOUNDED, onPlayerWounded);
};
