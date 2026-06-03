import { SquadPlugin } from '../core/plugin';
import { TPluginProps } from '../types';
import adminCamBlocker from './admin-cam-blocker';
import adminSetFogOfWar from './admin-set-fog-of-war';
import adminsReloadConfig from './admins-reload-config';
import explosiveDamaged from './apply-explosive-damaged';
import autoKickUnassigned from './auto-kick-unassigned';
import autorestartServers from './autorestart-servers';
import autoUpdateMods from './autoupdatemods';
import bonuses from './bonuses';
import broadcast from './broadcast';
import chatCommands from './chat-commands';
import fobExplosionDamage from './fobexplosiondamage';
import knifeBroadcast from './knife-broadcast';
import levelSync from './koth-lvl-sync';
import { officialKothDb } from './officialKothDb';
import randomizerMaps from './randomizer-maps';
import rnsStats from './rns-stats';
import { rnsLogs } from './rnsLogs';
import { rnsTelemetry } from './rnsTelemetry';
import seed from './seed';
import skipmap from './skipmap';
import smartBalance from './smart-balance';
import squadLeaderRole from './squad-leader-role';
import voteMap from './votemap';
import voteMapMods from './votemapmods';
import warnPlayers from './warn-players';

export interface LegacyManifestEntry {
  name: string;
  plugin: TPluginProps;
}

export const legacyManifest: LegacyManifestEntry[] = [
  { name: 'rnsTelemetry', plugin: rnsTelemetry },
  { name: 'rnsLogs', plugin: rnsLogs },
  { name: 'officialKothDb', plugin: officialKothDb },
];

export const nativeManifest: SquadPlugin[] = [
  broadcast,
  knifeBroadcast,
  autorestartServers,
  fobExplosionDamage,
  adminsReloadConfig,
  bonuses,
  warnPlayers,
  explosiveDamaged,
  squadLeaderRole,
  autoKickUnassigned,
  adminCamBlocker,
  adminSetFogOfWar,
  levelSync,
  autoUpdateMods,
  voteMap,
  voteMapMods,
  chatCommands,
  randomizerMaps,
  smartBalance,
  rnsStats,
  skipmap,
  seed,
];
