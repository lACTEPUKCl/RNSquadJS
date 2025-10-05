import { getServersState } from '../serversState';
import { adminCamBlocker } from './admin-cam-blocker';
import { explosiveDamaged } from './apply-explosive-damaged';
import { autoKickUnassigned } from './auto-kick-unassigned';
import { autorestartServers } from './autorestart-servers';
import { autoUpdateMods } from './autoupdatemods';
import { bonuses } from './bonuses';
import { broadcast } from './broadcast';
import { chatCommands } from './chat-commands';
import { fobExplosionDamage } from './fobexplosiondamage';
import { knifeBroadcast } from './knife-broadcast';
import { levelSync } from './koth-lvl-sync';
import { officialKothDb } from './officialKothDb';
import { randomizerMaps } from './randomizer-maps';
import { rnsStats } from './rns-stats';
import { rnsLogs } from './rnsLogs';
import { skipmap } from './skipmap';
import { smartBalance } from './smart-balance';
import { squadLeaderRole } from './squad-leader-role';
import { voteMap } from './votemap';
import { voteMapMods } from './votemapmods';
import { warnPlayers } from './warn-players';
const plugins = [
  skipmap,
  voteMap,
  randomizerMaps,
  warnPlayers,
  smartBalance,
  squadLeaderRole,
  autoKickUnassigned,
  chatCommands,
  fobExplosionDamage,
  autorestartServers,
  rnsStats,
  bonuses,
  rnsLogs,
  broadcast,
  voteMapMods,
  autoUpdateMods,
  explosiveDamaged,
  knifeBroadcast,
  adminCamBlocker,
  levelSync,
  officialKothDb,
];

export const initPlugins = async (id: number) => {
  const state = getServersState(id);

  plugins.forEach((fn) => {
    state.logger.log(`Initializing plugin: ${fn.name}`);

    const plugin = state.plugins.find((p) => p.name === fn.name);

    if (plugin && plugin.enabled) {
      state.logger.log(`Initialized plugin: ${fn.name}`);

      fn(state, plugin.options);
    } else {
      state.logger.warn(`Disabled plugin: ${fn.name}`);
    }
  });

  return new Promise((res) => res(true));
};
