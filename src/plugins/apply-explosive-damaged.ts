import { TApplyExplosiveDamage, TGrenadeSpawned } from 'squad-logs';
import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminBan } from '../core';
import { definePlugin } from '../core/plugin';
import { getPlayerByController, getPlayerByPossess } from './helpers';

export default definePlugin({
  name: 'explosiveDamaged',
  description: 'DPAC: бан за взрывной спам / масс-спавн гранат (анти-краш).',
  optionsSchema: z.object({}),
  setup({ state, registerDisposable }) {
    const { listener, execute } = state;

    const damageTracker: Record<
      string,
      {
        count: number;
        lastTimestamp: number;
        locations: Set<string>;
        destructionTimer?: NodeJS.Timeout;
      }
    > = {};

    const spawnTracker: Record<
      string,
      {
        count: number;
        windowStart: number;
        lastTimestamp: number;
        locations: Set<string>;
        destructionTimer?: NodeJS.Timeout;
        banned?: boolean;
      }
    > = {};

    const spawnMaxCount = 10;
    const spawnWindowMs = 1000;
    const damageMaxCount = 10;
    const damageIntervalMs = 10_000;
    const destructionDelay = 15_000;

    const analyzeExplosiveDamage = (data: TApplyExplosiveDamage) => {
      if (!data.playerController || !data.deployable || !data.locations) return;

      const now = Date.now();
      const key = `${data.playerController}_${data.deployable}`;
      const locationKey = String(data.locations);

      const tracker = (damageTracker[key] ??= {
        count: 0,
        lastTimestamp: now,
        locations: new Set(),
      });

      tracker.locations.add(locationKey);

      if (tracker.destructionTimer) clearTimeout(tracker.destructionTimer);
      tracker.destructionTimer = setTimeout(
        () => delete damageTracker[key],
        destructionDelay,
      );

      if (now - tracker.lastTimestamp <= damageIntervalMs) tracker.count += 1;
      else tracker.count = 1;

      tracker.lastTimestamp = now;

      if (tracker.count >= damageMaxCount && tracker.locations.size === 1) {
        const player = getPlayerByController(state, data.playerController);
        if (!player) return;

        adminBan(execute, player.steamID, 'DPAC: explosive spam');
      }
    };

    const analyzeGrenadeSpawned = (data: TGrenadeSpawned) => {
      if (!data.instigator || !data.location) return;

      const now = Date.now();
      const possess = String(data.instigator);
      const locationKey = String(data.location);

      const tracker = (spawnTracker[possess] ??= {
        count: 0,
        windowStart: now,
        lastTimestamp: now,
        locations: new Set(),
        banned: false,
      });

      if (tracker.banned) return;

      if (now - tracker.windowStart > spawnWindowMs) {
        tracker.windowStart = now;
        tracker.count = 0;
        tracker.locations.clear();
      }

      tracker.count += 1;
      tracker.lastTimestamp = now;
      tracker.locations.add(locationKey);

      if (tracker.destructionTimer) clearTimeout(tracker.destructionTimer);
      tracker.destructionTimer = setTimeout(
        () => delete spawnTracker[possess],
        destructionDelay,
      );

      if (tracker.count >= spawnMaxCount) {
        const player = getPlayerByPossess(state, possess);
        if (!player) return;

        tracker.banned = true;

        adminBan(
          execute,
          player.steamID,
          'DPAC: mass grenade spawn (server crash attempt)',
        );

        delete spawnTracker[possess];
      }
    };

    listener.on(EVENTS.EXPLOSIVE_DAMAGED, analyzeExplosiveDamage);
    listener.on(EVENTS.GRENADE_SPAWNED, analyzeGrenadeSpawned);

    registerDisposable(() => {
      listener.off(EVENTS.EXPLOSIVE_DAMAGED, analyzeExplosiveDamage);
      listener.off(EVENTS.GRENADE_SPAWNED, analyzeGrenadeSpawned);
      for (const key of Object.keys(damageTracker)) {
        const t = damageTracker[key].destructionTimer;
        if (t) clearTimeout(t);
        delete damageTracker[key];
      }
      for (const key of Object.keys(spawnTracker)) {
        const t = spawnTracker[key].destructionTimer;
        if (t) clearTimeout(t);
        delete spawnTracker[key];
      }
    });
  },
});
