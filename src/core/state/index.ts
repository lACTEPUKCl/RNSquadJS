import {
  TPlayerConnected,
  TPlayerDamaged,
  TPlayerPossess,
  TTickRate,
} from 'squad-logs';
import { UPDATE_TIMEOUT } from '../../constants';
import { getServersState } from '../../serversState';
import { TGetAdmins } from '../../types';
import { EVENTS } from './../../constants';
import { updateAdmins } from './updateAdmins';
import { updateCurrentMap } from './updateCurrentMap';
import { updateNextMap } from './updateNextMap';
import { updatePlayers } from './updatePlayers';
import { updateServerInfo } from './updateServerInfo';
import { updateSquads } from './updateSquads';

export const initState = async (id: number, getAdmins: TGetAdmins) => {
  await updateAdmins(id, getAdmins);
  await updateCurrentMap(id);
  await updateNextMap(id);
  await updatePlayers(id);
  await updateSquads(id);
  await updateServerInfo(id);

  const state = getServersState(id);
  const { coreListener, listener } = state;

  let updateTimeout: NodeJS.Timeout;
  let canRunUpdateInterval = true;
  setInterval(async () => {
    if (!canRunUpdateInterval) return;
    await updatePlayers(id);
    await updateSquads(id);
  }, UPDATE_TIMEOUT);

  const updatesOnEvents = async () => {
    canRunUpdateInterval = false;
    clearTimeout(updateTimeout);
    await updatePlayers(id);
    await updateSquads(id);
    updateTimeout = setTimeout(
      () => (canRunUpdateInterval = true),
      UPDATE_TIMEOUT,
    );
  };

  for (const key in EVENTS) {
    const event = EVENTS[key as keyof typeof EVENTS];
    coreListener.on(event, async (data) => {
      if (event === EVENTS.PLAYER_CONNECTED || event === EVENTS.SQUAD_CREATED) {
        await updatesOnEvents();

        if (event === EVENTS.PLAYER_CONNECTED) {
          const player = data as TPlayerConnected;
          console.log(player);

          if (state.players && player) {
            state.players = state.players.map((p) => {
              if (p.steamID === player.steamID) {
                return {
                  ...p,
                  playerController: player.playerController,
                };
              }
              return p;
            });
          }
        }
      }

      if (event === EVENTS.NEW_GAME) {
        await updateAdmins(id, getAdmins);
        await updateCurrentMap(id);
        await updateNextMap(id);
        await updateServerInfo(id);
      }

      // if (event === EVENTS.PLAYER_ROLE_CHANGED) {
      //   const player = data as TPlayerRoleChanged;
      //   if (state.players && player) {
      //     state.players = state.players?.map((p) => {
      //       if (p.steamID === player.steamID) {
      //         return {
      //           ...p,
      //           role: player.newRole,
      //         };
      //       }
      //       return p;
      //     });
      //   }
      // }

      // if (event === EVENTS.PLAYER_LEADER_CHANGED) {
      //   const player = data as TPlayerLeaderChanged;
      //   if (state.players && player) {
      //     state.players = state.players?.map((p) => {
      //       if (p.steamID === player.steamID) {
      //         return {
      //           ...p,
      //           isLeader: player.isLeader,
      //         };
      //       }
      //       return p;
      //     });
      //   }
      // }

      if (event === EVENTS.TICK_RATE) {
        const tickRateData = data as TTickRate;

        state.tickRate = tickRateData.tickRate;
      }

      if (event === EVENTS.PLAYER_POSSESS) {
        const player = data as TPlayerPossess;
        if (state.players && player) {
          state.players = state.players?.map((p) => {
            if (p.steamID === player.steamID) {
              return {
                ...p,
                possess: player.possessClassname,
              };
            }
            return p;
          });
        }
      }

      if (event === EVENTS.PLAYER_DAMAGED) {
        const player = data as TPlayerDamaged;
        if (state.players && player) {
          state.players = state.players.map((p) => {
            if (p.name === player.victimName) {
              return {
                ...p,
                weapon: player.weapon,
              };
            }
            return p;
          });
        }
      }

      listener.emit(event, data);
    });
  }
};
