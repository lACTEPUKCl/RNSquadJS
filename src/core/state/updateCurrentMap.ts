import { TMap } from 'squad-rcon';
import { EVENTS, UPDATERS_REJECT_TIMEOUT } from '../../constants';
import { getServersState } from '../../serversState';

export const updateCurrentMap = async (id: number) => {
  const state = getServersState(id);
  const { execute, coreListener, logger } = state;
  logger.log('Updating current map');
  // Never authorize map automation using the previous round after a timeout.
  state.currentMap = { level: null, layer: null };
  return new Promise<boolean>((resolve) => {
    const finish = (ok: boolean) => {
      clearTimeout(timeout);
      coreListener.off(EVENTS.SHOW_CURRENT_MAP, onMap);
      resolve(ok);
    };
    const onMap = (data: TMap) => {
      state.currentMap = data;
      logger.log('Updated current map');
      finish(Boolean(data?.layer));
    };
    const timeout = setTimeout(() => finish(false), UPDATERS_REJECT_TIMEOUT);
    // Some transports emit synchronously from execute; register first.
    coreListener.once(EVENTS.SHOW_CURRENT_MAP, onMap);
    void Promise.resolve()
      .then(() => execute(EVENTS.SHOW_CURRENT_MAP))
      .catch(() => finish(false));
  });
};
