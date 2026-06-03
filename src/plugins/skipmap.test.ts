import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTS } from '../constants';
import { createFakeState, makePlayer } from '../test/fakes';
import { TState } from '../types';
import skipmap from './skipmap';

type SkipmapOptions = Record<string, unknown>;

const defaultOptions = (
  over: Record<string, unknown> = {},
): SkipmapOptions => ({
  voteTick: 1000,
  voteDuration: 2000,
  voteRepeatDelay: 1000,
  onlyForVip: false,
  needVotes: 1,
  voteTimeout: 600000,
  minPlayers: 0,
  ...over,
});

const runSkipmap = (state: TState, opts: SkipmapOptions) =>
  skipmap.setup({
    state,
    options: opts,
    logger: state.logger,
    registerDisposable: () => {},
  });

const players = [
  makePlayer({ steamID: 'p1', name: 'P1' }),
  makePlayer({ steamID: 'p2', name: 'P2' }),
  makePlayer({ steamID: 'p3', name: 'P3' }),
];

describe('skipmap (golden behaviour)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('ends the match when the vote passes the needed threshold', () => {
    const { state, listener, commands } = createFakeState({ players });
    runSkipmap(state, defaultOptions());

    listener.emit(EVENTS.CHAT_COMMAND_SKIPMAP, { steamID: 'p1', message: '' });

    listener.emit(EVENTS.CHAT_MESSAGE, { steamID: 'p2', message: '+' });

    vi.advanceTimersByTime(2000);

    expect(commands).toContain('AdminEndMatch');
    expect(state.votingActive).toBeFalsy();
  });

  it('does not end the match when not enough votes are cast', () => {
    const { state, listener, commands } = createFakeState({ players });
    runSkipmap(state, defaultOptions({ needVotes: 5 }));

    listener.emit(EVENTS.CHAT_COMMAND_SKIPMAP, { steamID: 'p1', message: '' });
    listener.emit(EVENTS.CHAT_MESSAGE, { steamID: 'p2', message: '+' });
    vi.advanceTimersByTime(2000);

    expect(commands).not.toContain('AdminEndMatch');
  });

  it('rejects a second vote while one is already running', () => {
    const { state, listener, commands } = createFakeState({ players });
    runSkipmap(state, defaultOptions());

    listener.emit(EVENTS.CHAT_COMMAND_SKIPMAP, { steamID: 'p1', message: '' });
    commands.length = 0;
    listener.emit(EVENTS.CHAT_COMMAND_SKIPMAP, { steamID: 'p2', message: '' });

    const warnedAlreadyRunning = commands.some(
      (c) => c.startsWith('AdminWarn') && c.includes('уже идет'),
    );
    expect(warnedAlreadyRunning).toBe(true);
  });

  it('blocks the command for non-vips when onlyForVip is set', () => {
    const { state, listener, commands } = createFakeState({ players });
    runSkipmap(state, defaultOptions({ onlyForVip: true }));

    listener.emit(EVENTS.CHAT_COMMAND_SKIPMAP, { steamID: 'p1', message: '' });

    expect(commands.some((c) => c.startsWith('AdminWarn'))).toBe(true);
    expect(state.votingActive).toBeFalsy();
  });
});
