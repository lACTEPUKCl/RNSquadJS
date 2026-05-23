import EventEmitter from 'events';
import { describe, expect, it, vi } from 'vitest';
import { EVENTS } from '../../constants';
import { chatCommandParser, convertObjToArrayEvents } from './helpers';

describe('convertObjToArrayEvents', () => {
  it('returns the values of an events map', () => {
    expect(convertObjToArrayEvents({ A: 'a', B: 'b' })).toEqual(['a', 'b']);
  });

  it('returns an empty array for an empty map', () => {
    expect(convertObjToArrayEvents({})).toEqual([]);
  });
});

describe('chatCommandParser', () => {
  it('emits a CHAT_COMMAND event with the trimmed argument string', () => {
    const emitter = new EventEmitter();
    chatCommandParser(emitter);

    const handler = vi.fn();
    emitter.on(EVENTS.CHAT_COMMAND_SKIPMAP, handler);

    emitter.emit(EVENTS.CHAT_MESSAGE, {
      message: '!skipmap   now please  ',
      steamID: 'steam-1',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      steamID: 'steam-1',
      message: 'now please',
    });
  });

  it('lowercases the command name', () => {
    const emitter = new EventEmitter();
    chatCommandParser(emitter);

    const handler = vi.fn();
    emitter.on(EVENTS.CHAT_COMMAND_SKIPMAP, handler);

    emitter.emit(EVENTS.CHAT_MESSAGE, { message: '!SkIpMaP', steamID: 'x' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].message).toBe('');
  });

  it('ignores plain chat messages without a command prefix', () => {
    const emitter = new EventEmitter();
    chatCommandParser(emitter);

    const handler = vi.fn();
    emitter.on(EVENTS.CHAT_COMMAND_SKIPMAP, handler);

    emitter.emit(EVENTS.CHAT_MESSAGE, {
      message: 'just chatting, no command',
      steamID: 'x',
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
