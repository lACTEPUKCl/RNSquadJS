import { TExecute } from '../types';
export declare const adminEndMatch: (execute: TExecute) => Promise<void>;
export declare const adminBroadcast: (execute: TExecute, str: string) => Promise<void>;
export declare const adminChangeLayer: (execute: TExecute, str: string) => Promise<void>;
export declare const adminSetNextLayer: (execute: TExecute, str: string) => Promise<void>;
export declare const adminDisbandSquad: (execute: TExecute, teamID: string, squadID: string) => Promise<void>;
export declare const adminWarn: (execute: TExecute, steamID: string, reason: string) => Promise<void>;
export declare const adminKick: (execute: TExecute, steamID: string, reason: string) => Promise<void>;
export declare const adminForceTeamChange: (execute: TExecute, steamID: string) => Promise<void>;
export declare const adminKillServer: (execute: TExecute) => Promise<void>;
