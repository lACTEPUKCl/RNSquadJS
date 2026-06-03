import { describe, expect, it } from 'vitest';
import { createFakeState, makePlayer, makeSquad } from '../test/fakes';
import {
  getAdmins,
  getPlayer,
  getPlayerByController,
  getPlayerByEOSID,
  getPlayerByName,
  getPlayerByPossess,
  getPlayerBySteamID,
  getPlayers,
  getSquadByID,
  getVips,
} from './helpers';

describe('plugins/helpers', () => {
  const alice = makePlayer({
    name: 'Alice',
    steamID: 'steam-alice',
    eosID: 'eos-alice',
    playerController: 'ctrl-alice',
    possess: 'SoldierA',
  });
  const bob = makePlayer({
    name: '  Bob  ',
    steamID: 'steam-bob',
    eosID: 'eos-bob',
    teamID: '2',
    playerController: 'ctrl-bob',
    possess: 'SoldierB',
  });

  const buildState = () =>
    createFakeState({
      players: [alice, bob],
      squads: [
        makeSquad({ squadID: '1', teamID: '1' }),
        makeSquad({ squadID: '2', teamID: '2', squadName: 'Squad 2' }),
      ],
      admins: {
        'steam-alice': { reserved: true, canKick: true },
        'steam-bob': { reserved: false, canKick: false },
      },
    }).state;

  it('finds a player by steamID', () => {
    expect(getPlayerBySteamID(buildState(), 'steam-bob')).toBe(bob);
    expect(getPlayerBySteamID(buildState(), 'missing')).toBeNull();
  });

  it('finds a player by controller', () => {
    expect(getPlayerByController(buildState(), 'ctrl-alice')).toBe(alice);
    expect(getPlayerByController(buildState(), 'nope')).toBeNull();
  });

  it('finds a player by EOS id', () => {
    expect(getPlayerByEOSID(buildState(), 'eos-alice')).toBe(alice);
  });

  it('finds a player by name, trimming whitespace', () => {
    expect(getPlayerByName(buildState(), 'Bob')).toBe(bob);
    expect(getPlayerByName(buildState(), '  Alice ')).toBe(alice);
  });

  it('finds a player by possessed classname', () => {
    expect(getPlayerByPossess(buildState(), 'SoldierB')).toBe(bob);
  });

  it('getPlayer prefers steamID, then eos, then controller, then name', () => {
    const s = buildState();
    // steamID wins even if name points elsewhere
    expect(getPlayer(s, { steamID: 'steam-bob', name: 'Alice' })).toBe(bob);
    // falls back to eos when no steamID match
    expect(getPlayer(s, { steamID: 'x', eosID: 'eos-alice' })).toBe(alice);
    // falls back to controller when no id matches
    expect(getPlayer(s, { playerController: 'ctrl-bob' })).toBe(bob);
    // name only as last resort (tag-less name still matches trimmed name)
    expect(getPlayer(s, { name: 'Bob' })).toBe(bob);
    // nothing matches
    expect(getPlayer(s, { steamID: 'x', name: 'Ghost' })).toBeNull();
  });

  it('finds a squad by id and team', () => {
    const squad = getSquadByID(buildState(), '2', '2');
    expect(squad?.squadName).toBe('Squad 2');

    expect(getSquadByID(buildState(), '2', '1')).toBeNull();
  });

  it('lists admins by permission', () => {
    expect(getAdmins(buildState(), 'canKick')).toEqual(['steam-alice']);
  });

  it('lists vips (reserved slot)', () => {
    expect(getVips(buildState())).toEqual(['steam-alice']);
  });

  it('returns all players', () => {
    expect(getPlayers(buildState())).toHaveLength(2);
  });
});
