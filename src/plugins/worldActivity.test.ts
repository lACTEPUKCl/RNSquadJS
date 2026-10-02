import EventEmitter from 'events';
import { parseLine } from 'squad-logs';
import { afterEach, expect, it, vi } from 'vitest';
import { TPluginProps } from '../types';
import { rnsLogs } from './rnsLogs';
const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  appendFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./activityBridgeClient', () => ({
  createActivityBridgeClient: () => ({ enqueue: mocks.enqueue }),
}));
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    appendFile: mocks.appendFile,
  },
}));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it('carries all new parsed events with identical metadata into bridge and NDJSON', async () => {
  vi.useFakeTimers();
  const listener = new EventEmitter();
  const state = {
    id: 1,
    listener,
    logger: { error: vi.fn(), log: vi.fn() },
    currentMap: { layer: 'Fixture' },
  } as unknown as Parameters<TPluginProps>[0];
  rnsLogs(state, {
    logPath: 'fixture',
  } as unknown as Parameters<TPluginProps>[1]);
  const prefix = '[2026.10.01-12.00.00:000][  1]LogSquad: ';
  const lines = [
    'Capture zone Test was fully captured by team 1',
    'Capture zone Test was neutralized by team 2 (was owned by team 1)',
    'Player Player (Team: 1; ID: EOS: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa steam: 76561198000000000) placed a new map marker for team 2 : Type: BP_MapMarker_POI ; Location: -12.00000, 3.00000, 0.00000',
    'Deployable BP_Ammocrate_C_214 spawned for team 0 at location {1.0, -2.5, 3.0}',
  ];
  for (const line of lines) parseLine(prefix + line, listener);
  expect(mocks.enqueue.mock.calls.map(([x]) => x.action)).toEqual([
    'CaptureZoneCaptured',
    'CaptureZoneNeutralized',
    'MapMarkerPlaced',
    'DeployableSpawned',
  ]);
  await vi.advanceTimersByTimeAsync(60000);
  const records = mocks.appendFile.mock.calls.flatMap(([, payload]) =>
    payload.trim().split('\n').map(JSON.parse),
  );
  expect(records).toEqual(mocks.enqueue.mock.calls.map(([entry]) => entry));
  expect(records[2]).toMatchObject({
    x: -12,
    markerTeamID: 2,
    teamID: 1,
    steamID: '76561198000000000',
    protocol: 1,
  });
  expect(records[3]).toMatchObject({
    name: null,
    steamID: null,
    deployable: 'BP_Ammocrate_C_214',
  });
});
