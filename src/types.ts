import EventEmitter from 'events';
import { LogsReader } from 'squad-logs';
import { TServerInfo } from 'squad-rcon';
import { initLogger } from './logger';
import { getServersState } from './serversState';

export type TConfig = {
  id: number;
  host: string;
  password: string;
  port: number;
  db: string;
  mapsName: string;
  plugins: TPlugin[];
  adminsFilePath: string;
  logFilePath: string;
  ftp?: {
    username: string;
    password: string;
  };
};

export type TServersState = {
  [key in number]: {
    id: number;
    rcon: TRcon;
    logs: TLogs;
    logger: TLogger;
    execute: TExecute;
    coreListener: EventEmitter;
    listener: EventEmitter;
    maps: TMapTeams;
    plugins: TPlugin[];
    // boolean for check current voting in plugins
    // votemap or skipmap
    votingActive?: boolean;
    skipmap?: boolean;
    admins?: TAdmin;
    players?: TPlayer[];
    squads?: TSquad[];
    currentMap?: {
      level: string | null;
      layer: string | null;
    };
    nextMap?: {
      level: string | null;
      layer: string | null;
    };
    tickRate?: number; // TODO
    serverInfo?: TServerInfo;
  };
};

export type TMaps = {
  [key in string]: { layerName: string; layerMode: string };
};

export type TFactionUnitTypes = {
  [faction: string]: string[];
};

export type TTeamFactions = {
  [team: string]: TFactionUnitTypes;
};

export type TMapTeams = {
  [map: string]: TTeamFactions;
};

export type TAdmin = {
  [key in string]: { [key in string]: boolean };
};

export type TPluginProps = (state: TState, options: TPluginOptions) => void;

export type TPlugin = {
  name: string;
  enabled: boolean;
  options: TPluginOptions;
};

export type TPluginOptions = {
  [key in string]: string;
} & {
  voteTick: number;
  voteDuration: number;
  voteRepeatDelay: number;
  onlyForVip: boolean;
  needVotes: number;
  classicBonus: number;
  seedBonus: number;
  voteTimeout: number;
  minPlayersForAfkKick: number;
  kickTimeout: number;
  warningInterval: number;
  gracePeriod: number;
};

export type TPlayer = {
  name: string;
  eosID: string;
  steamID: string;
  teamID: string;
  role: string;
  isLeader: boolean;
  possess?: string;
  weapon?: string;
  squadID?: string | null;
};

export type TSquad = {
  squadID: string;
  squadName: string;
  size: string;
  locked: string;
  creatorName: string;
  creatorEOSID: string;
  creatorSteamID: string;
  teamID: string | null;
  teamName: string | null;
};

export type TSquadJS = {
  id: number;
  mapsName: string;
  plugins: TPlugin[];
  rcon: TRcon;
  logs: TLogs;
};

export type TPlayerTeamChanged = {
  player: TPlayer;
  oldTeamID: string;
  newTeamID: string;
};

export type TPlayerSquadChanged = {
  player: TPlayer;
  oldSquadID?: string | null;
  newSquadID?: string | null;
};

export type TPlayerLeaderChanged = {
  player: TPlayer;
  oldRole: string;
  newRole: string;
  isLeader: boolean;
};

export type TPlayerRoleChanged = {
  player: TPlayer;
  oldRole: string;
  newRole: string;
  isLeader: boolean;
};

export type TEvents = {
  rconEmitter: EventEmitter;
  logsEmitter: EventEmitter;
};

export type TError = {
  id?: number;
  message: string;
};

export type TState = TGetServersState;

export type TGetAdmins = LogsReader['getAdminsFile'];
export type TLogger = ReturnType<typeof initLogger>;
export type TExecute = (command: string) => Promise<string>;
export type TGetServersState = ReturnType<typeof getServersState>;

export type TRcon = {
  execute: TExecute;
  rconEmitter: EventEmitter;
  close: () => Promise<unknown>;
};
export type TLogs = {
  logsEmitter: EventEmitter;
  getAdmins: TGetAdmins;
  close: () => Promise<void>;
};
