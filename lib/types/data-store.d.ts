/// <reference types="node" />
import { EventEmitter } from 'events';
interface TimePoint {
    time: Date;
    formatted: string;
}
interface CounterValue {
    y: number;
    x: string;
    time: Date;
    label?: string;
}
export declare class DataStore extends EventEmitter {
    #private;
    private timePoints;
    private counters;
    private vars;
    constructor(resetFrequencySeconds?: number);
    get resetFrequencySeconds(): number;
    incrementCounter(key: string, incrementer: number, time?: Date | null): CounterValue;
    incrementCounterLast(key: string, incrementer: number): void;
    incrementFrequencyCounter(key: string, incrementer: number): void;
    resetFrequencyCounter(key: string): void;
    setNewCounterValue(key: string, value: number, label?: string, time?: Date | null, skipDuplication?: boolean): CounterValue;
    addTimePoint(time: Date): TimePoint;
    getLastTimePoint(): TimePoint;
    getPreLastTimePoint(): TimePoint;
    getTimePoints(): string[];
    getCounterData(key: string): CounterValue[];
    getCounterLastValue(key: string): CounterValue | undefined;
    getCounters(): string[];
    setVar(key: string, value: any): void;
    getVarKeys(): string[];
    getVar(key: string): any;
}
export {};
