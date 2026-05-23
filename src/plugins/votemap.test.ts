import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTS } from '../constants';
import { createFakeState, makePlayer } from '../test/fakes';
import { TState } from '../types';
import voteMap from './votemap';

vi.mock('../rnsdb', () => ({
  serverHistoryLayers: vi.fn(),
}));

type VoteMapOptions = Record<string, unknown>;

const options = (over: Record<string, unknown> = {}): VoteMapOptions => ({
  voteTick: 1000,
  voteDuration: 2000,
  onlyForVip: false,
  needVotes: 1,
  mapMode: 'RAAS',
  ...over,
});

const runVoteMap = (state: TState, opts: VoteMapOptions) =>
  voteMap.setup({
    state,
    options: opts,
    logger: state.logger,
    registerDisposable: () => {},
  });

const maps = {
  GooseBay_RAAS_v1: {
    Team1: { BLUFOR: { USA: ['CombinedArms'] } },
    Team2: { REDFOR: { RGF: ['CombinedArms'] } },
  },
};

const validVote = 'GooseBay_RAAS_v1 USA+CombinedArms RGF+CombinedArms';

describe('voteMap (golden behaviour)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sets the next layer when the vote passes', () => {
    const { state, listener, commands } = createFakeState({
      maps,
      players: [makePlayer({ steamID: 'p1' }), makePlayer({ steamID: 'p2' })],
    });
    runVoteMap(state, options());

    listener.emit(EVENTS.CHAT_COMMAND_VOTEMAP, {
      steamID: 'p1',
      message: validVote,
    });
    listener.emit(EVENTS.CHAT_MESSAGE, { steamID: 'p2', message: '+' });
    vi.advanceTimersByTime(2000);

    expect(commands.some((c) => c === `AdminSetNextLayer ${validVote}`)).toBe(
      true,
    );
    expect(state.votingActive).toBeFalsy();
  });

  it('warns on an invalid vote format and does not start a vote', () => {
    const { state, listener, commands } = createFakeState({ maps });
    runVoteMap(state, options());

    listener.emit(EVENTS.CHAT_COMMAND_VOTEMAP, {
      steamID: 'p1',
      message: 'not a valid vote line',
    });

    expect(commands.some((c) => c.startsWith('AdminWarn'))).toBe(true);
    expect(state.votingActive).toBeFalsy();
  });

  it('rejects an unknown map/faction combination', () => {
    const { state, listener, commands } = createFakeState({ maps });
    runVoteMap(state, options());

    listener.emit(EVENTS.CHAT_COMMAND_VOTEMAP, {
      steamID: 'p1',
      message: 'UnknownMap_RAAS_v1 USA+CombinedArms RGF+CombinedArms',
    });

    expect(commands.some((c) => c.startsWith('AdminWarn'))).toBe(true);
    expect(commands.some((c) => c.startsWith('AdminSetNextLayer'))).toBe(false);
  });
});
