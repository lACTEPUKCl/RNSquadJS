import EventEmitter from 'events';
import { LogsReaderEvents } from 'squad-logs';
import { RconEvents } from 'squad-rcon';
import { TEvents } from '../../types';
import { chatCommandParser, convertObjToArrayEvents } from './helpers';

export const initEvents = ({ rconEmitter, logsEmitter }: TEvents) => {
  const coreEmitter = new EventEmitter();
  const localEmitter = new EventEmitter();

  coreEmitter.setMaxListeners(50);
  localEmitter.setMaxListeners(50);

  const rconEvents = convertObjToArrayEvents(RconEvents);
  const logsEvents = convertObjToArrayEvents(LogsReaderEvents);

  rconEvents.forEach((event) => {
    if (event !== RconEvents.SQUAD_CREATED) {
      rconEmitter.on(event, (data) => coreEmitter.emit(event, data));
    }
  });

  logsEvents.forEach((event) => {
    logsEmitter.on(event, (data) => coreEmitter.emit(event, data));
  });

  chatCommandParser(coreEmitter);

  return { coreEmitter, localEmitter };
};
