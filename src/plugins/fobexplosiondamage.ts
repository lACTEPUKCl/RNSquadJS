import { TDeployableDamaged, TFobPlaced } from 'squad-logs';
import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminBan, adminKick, adminWarn } from '../core';
import { definePlugin } from '../core/plugin';
import { getPlayer } from './helpers';

const optionsSchema = z.object({
  action: z.enum(['kick', 'warn', 'ban']).default('kick'),
  reason: z.string().default('Подрыв союзной FOB'),
  banLength: z.string().default('0'),
  minDamage: z.coerce.number().min(0).default(0),
  onlyExplosives: z.boolean().default(true),
});

const EXPLOSIVE_WEAPON = /Deployable/i;

export default definePlugin({
  name: 'fobExplosionDamage',
  description:
    'Кик/варн за подрыв своей FOB-рации взрывчаткой/СВУ (владелец по команде).',
  optionsSchema,
  setup({ state, options, logger, registerDisposable }) {
    const { listener, execute } = state;
    const { action, reason, banLength, minDamage, onlyExplosives } = options;

    let fobTeam = new Map<string, string>();
    let punished = new Set<string>();

    const onFobPlaced = (data: TFobPlaced) => {
      if (data.isMain || !data.radioId) return;
      fobTeam.set(data.radioId, data.teamID);
    };

    const onDeployableDamaged = (data: TDeployableDamaged) => {
      const { weapon, deployable, name, steamID, eosID, damage } = data;

      if (!/FOBRadio/i.test(deployable)) return;
      if (onlyExplosives && !EXPLOSIVE_WEAPON.test(weapon)) return;
      if (typeof damage === 'number' && damage < minDamage) return;

      const radioId = deployable.match(/_C_(\d+)/)?.[1] ?? '';
      const ownerTeam = radioId ? fobTeam.get(radioId) : undefined;
      if (!ownerTeam) return;

      // Имя в событии идёт без клан-тега (instigator "GUZLIK"), а в стейте
      // игрок хранится с тегом ("[★РНС★] GUZLIK"), поэтому ищем по ID.
      const player = getPlayer(state, { steamID, eosID, name });
      const griefer = steamID || player?.steamID || '';
      if (!griefer || !player?.teamID) return;
      if (player.teamID !== ownerTeam) return;

      const key = `${griefer}:${deployable}`;
      if (punished.has(key)) return;
      punished.add(key);

      logger.log(
        `fobExplosionDamage: ${name} подорвал свою FOB (команда ${ownerTeam}) из ${weapon} → ${action}`,
      );
      if (action === 'ban') {
        adminBan(execute, griefer, reason, banLength);
      } else if (action === 'kick') {
        adminKick(execute, griefer, reason);
      } else {
        adminWarn(execute, griefer, reason);
      }
    };

    const onNewGame = () => {
      fobTeam = new Map<string, string>();
      punished = new Set<string>();
    };

    listener.on(EVENTS.FOB_PLACED, onFobPlaced);
    listener.on(EVENTS.DEPLOYABLE_DAMAGED, onDeployableDamaged);
    listener.on(EVENTS.NEW_GAME, onNewGame);
    registerDisposable(() => {
      listener.off(EVENTS.FOB_PLACED, onFobPlaced);
      listener.off(EVENTS.DEPLOYABLE_DAMAGED, onDeployableDamaged);
      listener.off(EVENTS.NEW_GAME, onNewGame);
      fobTeam.clear();
      punished.clear();
    });
  },
});
