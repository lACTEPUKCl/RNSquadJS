/// <reference types="node" />
import { EventEmitter } from 'node:events';
export default class Analyzer extends EventEmitter {
    #private;
    constructor(data: any, options: any);
    get options(): any;
    get data(): any;
    analyze(): Promise<void>;
    close(): any;
    getDateTime(date: string): Date;
    calcSeedingLiveTime(data: any, liveThreshold?: number, seedingMinThreshold?: number): void;
}
