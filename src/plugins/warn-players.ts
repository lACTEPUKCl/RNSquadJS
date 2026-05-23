import { TPlayerConnected, TPlayerWounded, TSquadCreated } from 'squad-logs';
import { z } from 'zod';
import { EVENTS } from '../constants';
import { adminWarn } from '../core';
import { definePlugin } from '../core/plugin';
import { TPlayerRoleChanged } from '../types';
import { getPlayerByEOSID, getPlayerByName } from './helpers';

const optionsSchema = z.object({
  connectedMessage: z.array(z.string()).default([]),
  sqCreatedMessage: z.array(z.string()).default([]),
  roleChangedMessage: z.array(z.tuple([z.string(), z.string()])).default([]),
  messageAttacker: z.string().default(''),
  messageVictim: z.string().default(''),
});

export default definePlugin({
  name: 'warnPlayers',
  description: 'Напоминания игрокам (заход, отряд, роль, тимкилл).',
  optionsSchema,
  setup({ state, options, registerDisposable }) {
    const { listener, execute } = state;
    const {
      connectedMessage,
      sqCreatedMessage,
      roleChangedMessage,
      messageAttacker,
      messageVictim,
    } = options;

    const timers = new Set<NodeJS.Timeout>();
    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    };

    const sendWarningMessages = (steamID: string, messages: string[]) => {
      for (const message of messages) adminWarn(execute, steamID, message);
    };

    const playerConnected = (data: TPlayerConnected) => {
      const { steamID } = data;
      if (!steamID) return;
      sendWarningMessages(steamID, connectedMessage);
      later(() => sendWarningMessages(steamID, connectedMessage), 60000);
    };

    const reTimers = new Map<string, NodeJS.Timeout>();
    const scheduleReminder = (steamID: string, fn: () => void) => {
      const prev = reTimers.get(steamID);
      if (prev) clearTimeout(prev);
      const id = setTimeout(() => {
        reTimers.delete(steamID);
        fn();
      }, 60000);
      reTimers.set(steamID, id);
    };

    const squadCreated = (data: TSquadCreated) => {
      const { steamID } = data;
      if (!steamID) return;
      sendWarningMessages(steamID, sqCreatedMessage);
      scheduleReminder(steamID, () =>
        sendWarningMessages(steamID, sqCreatedMessage),
      );
    };

    const playerRoleChanged = (data: TPlayerRoleChanged) => {
      const { role, steamID } = data.player;
      if (!steamID) return;

      for (const [checkRole, message] of roleChangedMessage) {
        if (role.includes(checkRole)) {
          adminWarn(execute, steamID, message);
          scheduleReminder(steamID, () => adminWarn(execute, steamID, message));
        }
      }
    };

    const playerWounded = ({ victimName, attackerEOSID }: TPlayerWounded) => {
      if (!victimName || !attackerEOSID) return;

      const victim = getPlayerByName(state, victimName);
      const attacker = getPlayerByEOSID(state, attackerEOSID);
      if (!victim || !attacker) return;
      if (victim.name === attacker.name) return;

      if (victim.teamID === attacker.teamID) {
        adminWarn(
          execute,
          victim.steamID,
          messageVictim + '\n' + attacker.name,
        );
        adminWarn(execute, attacker.steamID, messageAttacker);
      }
    };

    listener.on(EVENTS.PLAYER_CONNECTED, playerConnected);
    listener.on(EVENTS.SQUAD_CREATED, squadCreated);
    listener.on(EVENTS.PLAYER_ROLE_CHANGED, playerRoleChanged);
    listener.on(EVENTS.PLAYER_WOUNDED, playerWounded);

    registerDisposable(() => {
      listener.off(EVENTS.PLAYER_CONNECTED, playerConnected);
      listener.off(EVENTS.SQUAD_CREATED, squadCreated);
      listener.off(EVENTS.PLAYER_ROLE_CHANGED, playerRoleChanged);
      listener.off(EVENTS.PLAYER_WOUNDED, playerWounded);
      for (const t of reTimers.values()) clearTimeout(t);
      reTimers.clear();
      for (const t of timers) clearTimeout(t);
      timers.clear();
    });
  },
});
