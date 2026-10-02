import EventEmitter from 'events';
import { parsers } from 'squad-rcon';

// Compatibility exports for consumers; protocol parsing lives in our pinned fork.
export { Rcon as SquadRcon } from 'squad-rcon';
export const parsePlayers = (body: string) =>
  parsers.getListPlayers(new EventEmitter(), body);
export const parseMap = (body: string, next: boolean) =>
  next
    ? parsers.getNextMap(new EventEmitter(), body)
    : parsers.getCurrentMap(new EventEmitter(), body);
