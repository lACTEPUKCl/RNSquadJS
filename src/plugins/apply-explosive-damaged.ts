import { TApplyExplosiveDamage } from 'squad-logs';
import { EVENTS } from '../constants';
import { adminBan } from '../core';
import { TPluginProps } from '../types';
import { getPlayerByController } from './helpers';

export const explosiveDamaged: TPluginProps = (state) => {
  const { listener, execute, logger } = state;

  const grenadeTracker: Record<
    string,
    {
      count: number;
      lastTimestamp: number;
      locations: Set<string>;
      destructionTimer?: NodeJS.Timeout;
    }
  > = {};

  const maxCount = 0;
  const maxInterval = 10;
  const destructionDelay = 10000;

  const analyzeExplosiveDamage = (data: TApplyExplosiveDamage) => {
    if (!data.playerController || !data.deployable || !data.locations) {
      return;
    }
    console.log(state.players);

    const now = Date.now();
    const key = `${data.playerController}_${data.deployable}`;
    const locationKey = `${data.locations}`;

    if (!grenadeTracker[key]) {
      grenadeTracker[key] = {
        count: 0,
        lastTimestamp: now,
        locations: new Set(),
      };
    }

    const tracker = grenadeTracker[key];

    tracker.locations.add(locationKey);

    if (tracker.destructionTimer) {
      clearTimeout(tracker.destructionTimer);
    }

    tracker.destructionTimer = setTimeout(() => {
      delete grenadeTracker[key];
    }, destructionDelay);

    if (now - tracker.lastTimestamp < maxInterval) {
      tracker.count++;
    } else {
      tracker.count = 1;
    }

    tracker.lastTimestamp = now;

    if (tracker.count > maxCount && tracker.locations.size === 1) {
      const player = getPlayerByController(state, data.playerController);

      if (!player) return;
      adminBan(
        execute,
        player.steamID,
        'Cheater is neutralized by the DP Anti-cheat (DPAC) system',
      );
    }
  };

  listener.on(EVENTS.EXPLOSIVE_DAMAGED, analyzeExplosiveDamage);
};
