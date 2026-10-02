import { createServer } from 'net';
import { describe, expect, it } from 'vitest';
import { SquadRcon, parseMap, parsePlayers } from './squad-rcon';

const oldPlayer =
  'ID: 4 | Online IDs: EOS: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa steam: 76561198000000000 | Name: Игрок 🌞 | Team ID: 1 | Squad ID: 2 | Is Leader: True | Role: USA_SL_03';
const newPlayer =
  oldPlayer.replace('Squad ID:', 'Party ID: #0 | Squad ID:') +
  ' | Vehicle: MEI_Technical-LOG (Driver)';
const roster = (line: string) =>
  `----- Active Players -----\n${line}\n----- Recently Disconnected Players [Max of 15] -----\n${oldPlayer}`;

describe('Squad 10.6 RCON compatibility', () => {
  it('keeps 10.5 and 10.6 players, including party members and vehicle occupants', () => {
    const legacy = parsePlayers(roster(oldPlayer));
    expect(legacy).toHaveLength(1);
    expect(parsePlayers(roster(newPlayer))[0]).toEqual({
      ...legacy[0],
      partyID: '0',
      vehicle: 'MEI_Technical-LOG (Driver)',
    });
    expect(
      parsePlayers(
        roster(
          newPlayer
            .replace('Party ID: #0', 'Party ID: N/A')
            .replace('Squad ID: 2', 'Squad ID: N/A'),
        ),
      )[0].squadID,
    ).toBeNull();
    expect(legacy[0]).toMatchObject({
      name: 'Игрок 🌞',
      role: 'USA_SL_03',
      isLeader: true,
    });
  });

  it('separates layer from factions and handles pending or missing next map', () => {
    expect(
      parseMap(
        'Current level is Sumari Bala, layer is Sumari_Seed_v1, factions USA WPMC',
        false,
      ),
    ).toEqual({ level: 'Sumari Bala', layer: 'Sumari_Seed_v1' });
    expect(
      parseMap(
        'Next level is Skorpo, layer is Skorpo_RAAS_v1, factions RGF+Support AFU+Support',
        true,
      ).layer,
    ).toBe('Skorpo_RAAS_v1');
    expect(parseMap('Next level is , layer is To be voted', true)).toEqual({
      level: null,
      layer: null,
    });
    expect(parseMap('Next map is not defined', true)).toEqual({
      level: null,
      layer: null,
    });
  });

  it('uses the installed transport and emits one corrected roster/map per TCP reply', async () => {
    const packet = (id: number, type: number, body: string) => {
      const b = Buffer.alloc(Buffer.byteLength(body) + 14);
      b.writeInt32LE(b.length - 4, 0);
      b.writeInt32LE(id, 4);
      b.writeInt32LE(type, 8);
      b.write(body, 12);
      return b;
    };
    const replies: Record<string, string> = {
      ListPlayers: roster(newPlayer),
      ShowCurrentMap:
        'Current level is Sumari Bala, layer is Sumari_Seed_v1, factions USA WPMC',
    };
    const server = createServer((socket) => {
      let pending = Buffer.alloc(0);
      socket.on('data', (data) => {
        pending = Buffer.concat([pending, data]);
        while (
          pending.length >= 4 &&
          pending.length >= pending.readInt32LE(0) + 4
        ) {
          const length = pending.readInt32LE(0) + 4;
          const id = pending.readInt32LE(4),
            type = pending.readInt32LE(8);
          const body = pending.toString('utf8', 12, length - 2);
          pending = pending.subarray(length);
          if (type === 3) socket.write(packet(id, 2, ''));
          else if (body) {
            const response = packet(id, 0, replies[body] || '');
            socket.write(response.subarray(0, 5));
            socket.write(response.subarray(5));
          } else socket.write(Buffer.from([0, 1, 0, 0, 0, 0, 0]));
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('No test port');
    const client = new SquadRcon({
      id: 1,
      host: '127.0.0.1',
      port: address.port,
      password: 'fixture',
      autoReconnect: false,
      logEnabled: false,
    });
    const rosters: unknown[] = [],
      maps: unknown[] = [],
      nextMaps: unknown[] = [];
    client.on('ListPlayers', (value) => rosters.push(value));
    client.on('ShowCurrentMap', (value) => maps.push(value));
    client.on('ShowNextMap', (value) => nextMaps.push(value));
    try {
      await client.init();
      expect(await client.execute('ListPlayers')).toBe(replies.ListPlayers);
      await client.execute('ShowCurrentMap');
      expect(rosters).toEqual([parsePlayers(roster(newPlayer))]);
      expect(maps).toEqual([{ level: 'Sumari Bala', layer: 'Sumari_Seed_v1' }]);
      expect(nextMaps).toEqual([]);
    } finally {
      await client.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
