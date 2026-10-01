import EventEmitter from 'events';
import { Rcon, RconEvents, TMap, TPlayer, TRconOptions } from 'squad-rcon';

export const parsePlayers = (body: string): TPlayer[] => {
  const active = body.split('----- Recently Disconnected Players')[0];
  return active.split('\n').flatMap((line) => {
    // 10.6 inserts Party ID and appends Vehicle. Keep accepting older servers.
    const match = line.match(
      /^ID: (\d+) \| Online IDs: EOS: ([0-9a-f]{32}) steam: (\d{17}) \| Name: (.+?) \| Team ID: (\d+) \| (?:Party ID: [^|]+ \| )?Squad ID: (\d+|N\/A) \| Is Leader: (True|False) \| Role: ([^|\r\n]*)/,
    );
    return match
      ? [
          {
            playerID: match[1],
            eosID: match[2],
            steamID: match[3],
            name: match[4],
            teamID: match[5],
            squadID: match[6] === 'N/A' ? null : match[6],
            isLeader: match[7] === 'True',
            role: match[8].trim(),
          },
        ]
      : [];
  });
};

export const parseMap = (body: string, next: boolean): TMap => {
  const match = body.match(
    next
      ? /^Next level is ([^,\r\n]*), layer is ([^,\r\n]*)/
      : /^Current level is ([^,\r\n]*), layer is ([^,\r\n]*)/,
  );
  return {
    level: match?.[1]?.trim() || null,
    layer:
      match && match[2].trim() !== 'To be voted'
        ? match[2].trim() || null
        : null,
  };
};

// Keep the upstream transport and unsolicited chat events, but replace its
// pre-10.6 parsers. Do not forward their empty rosters or map fall-through events.
export class SquadRcon extends EventEmitter {
  private readonly connection: Rcon;

  constructor(options: TRconOptions) {
    super();
    this.connection = new Rcon(options);
    const replaced = new Set<string>([
      RconEvents.LIST_PLAYERS,
      RconEvents.SHOW_CURRENT_MAP,
      RconEvents.SHOW_NEXT_MAP,
    ]);
    for (const event of [
      ...Object.values(RconEvents),
      'connected',
      'close',
      'err',
      'data',
    ]) {
      if (!replaced.has(event)) {
        this.connection.on(event, (...args) => this.emit(event, ...args));
      }
    }
  }

  init() {
    return this.connection.init();
  }
  close() {
    return this.connection.close();
  }

  async execute(command: string): Promise<string> {
    const response = await this.connection.execute(command);
    if (command === RconEvents.LIST_PLAYERS)
      this.emit(command, parsePlayers(response));
    else if (command === RconEvents.SHOW_CURRENT_MAP)
      this.emit(command, parseMap(response, false));
    else if (command === RconEvents.SHOW_NEXT_MAP)
      this.emit(command, parseMap(response, true));
    return response;
  }
}
