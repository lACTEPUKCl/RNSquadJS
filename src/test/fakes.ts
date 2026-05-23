import EventEmitter from 'events';
import { initLogger } from '../logger';
import { TAdmin, TMaps, TPlayer, TSquad, TState } from '../types';

export const createRecordingExecute = () => {
  const commands: string[] = [];
  const execute = (cmd: string): Promise<string> => {
    commands.push(cmd);
    return Promise.resolve('');
  };
  return { commands, execute };
};

export const makePlayer = (overrides: Partial<TPlayer> = {}): TPlayer => ({
  name: 'Player',
  eosID: 'eos-0',
  steamID: '7656119000000000',
  teamID: '1',
  role: 'Rifleman',
  isLeader: false,
  ...overrides,
});

export const makeSquad = (overrides: Partial<TSquad> = {}): TSquad => ({
  squadID: '1',
  squadName: 'Squad 1',
  size: '1',
  locked: 'False',
  creatorName: 'Player',
  creatorEOSID: 'eos-0',
  creatorSteamID: '7656119000000000',
  teamID: '1',
  teamName: 'Team 1',
  ...overrides,
});

export interface FakeStateOptions {
  id?: number;
  players?: TPlayer[];
  squads?: TSquad[];
  admins?: TAdmin;
  maps?: TMaps;
  currentMap?: { level: string | null; layer: string | null };
  nextMap?: { level: string | null; layer: string | null };
}

export interface FakeStateResult {
  state: TState;
  listener: EventEmitter;
  commands: string[];
  execute: (cmd: string) => Promise<string>;
}

export const createFakeState = (
  opts: FakeStateOptions = {},
): FakeStateResult => {
  const listener = new EventEmitter();
  const coreListener = new EventEmitter();
  listener.setMaxListeners(200);
  coreListener.setMaxListeners(200);

  const { commands, execute } = createRecordingExecute();
  const logger = initLogger(opts.id ?? 1, false);

  const state = {
    id: opts.id ?? 1,
    rcon: {
      execute,
      rconEmitter: new EventEmitter(),
      close: () => Promise.resolve(),
    },
    logs: {
      logsEmitter: new EventEmitter(),
      getAdmins: () => Promise.resolve({}),
      close: () => Promise.resolve(),
    },
    logger,
    execute,
    coreListener,
    listener,
    maps: opts.maps ?? {},
    plugins: [],
    players: opts.players ?? [],
    squads: opts.squads ?? [],
    admins: opts.admins,
    currentMap: opts.currentMap,
    nextMap: opts.nextMap,
  } as unknown as TState;

  return { state, listener, commands, execute };
};
