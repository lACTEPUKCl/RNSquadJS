import {
  TFobPlaced,
  TPlayerDamaged,
  TPlayerDied,
  TPlayerRevived,
  TPlayerWounded,
  TRoundTickets,
  TVehicleSeatChange,
} from 'squad-logs';
import { z } from 'zod';
import { EVENTS } from '../constants';
import {
  classifyVehicle,
  isCombatVehicle,
  isSupportVehicle,
  VehicleClass,
} from '../core/elo';
import { definePlugin } from '../core/plugin';
import {
  applyMatchElo,
  bulkUpdatePlayerMinute,
  creatingTimeStamp,
  EloParticipant,
  MinutePlayer,
  pushMatchHistory,
  updateGames,
  updateUser,
} from '../rnsdb';
import { TPlayer } from '../types';
import {
  getPlayerByEOSID,
  getPlayerByName,
  getPlayerBySteamID,
  getSquadByID,
} from './helpers';

interface MatchPlayerStats {
  steamID: string;
  name: string;
  teamID: string;
  kills: number;
  death: number;
  revives: number;
  teamkills: number;
  vehicleKills: number;
  downs: number;
  victims: string[];
  downedVictims: string[];
  supportSeconds: number;
  crewSeconds: number;
  crewAssists: number;
  wasCommander: boolean;
  wasSquadLeader: boolean;
  squadID: string;
}

interface MatchTicketInfo {
  team: string;
  action: string;
  subfaction?: string;
  tickets?: number;
}

export default definePlugin({
  name: 'rnsStats',
  description: 'Сбор статистики игроков и истории матчей в БД.',
  optionsSchema: z.object({
    eloEnabled: z.boolean().default(true),
    eloMinPlayers: z.coerce.number().int().nonnegative().default(10),
    eloDisplayMode: z.enum(['conservative', 'mu']).default('conservative'),
  }),
  setup({ state, options, registerDisposable }) {
    const { listener, logger, id } = state;
    const { eloEnabled, eloMinPlayers, eloDisplayMode } = options;
    let winner: string;

    let matchStartTime: number = Date.now();
    let matchPlayerStats: Map<string, MatchPlayerStats> = new Map();
    let matchTickets: MatchTicketInfo[] = [];
    let matchCounter = 0;
    let fobByTeam: Record<string, number> = {};

    const lastDamageWeapon = new Map<string, string>();

    const lastDamageAttacker = new Map<string, TPlayer>();

    const curVehicle = new Map<
      string,
      { asset: string; seat: number; name: string; since: number }
    >();

    const getOrCreatePlayerStats = (
      steamID: string,
      name: string,
      teamID: string,
    ): MatchPlayerStats => {
      let stats = matchPlayerStats.get(steamID);
      if (!stats) {
        stats = {
          steamID,
          name,
          teamID,
          kills: 0,
          death: 0,
          revives: 0,
          teamkills: 0,
          vehicleKills: 0,
          downs: 0,
          victims: [],
          downedVictims: [],
          supportSeconds: 0,
          crewSeconds: 0,
          crewAssists: 0,
          wasCommander: false,
          wasSquadLeader: false,
          squadID: '',
        };
        matchPlayerStats.set(steamID, stats);
      }
      stats.name = name;
      stats.teamID = teamID;
      return stats;
    };

    const resetMatchState = () => {
      matchStartTime = Date.now();
      matchPlayerStats = new Map();
      matchTickets = [];
      fobByTeam = {};
      lastDamageWeapon.clear();
      lastDamageAttacker.clear();
      curVehicle.clear();
    };

    const onFobPlaced = (data: TFobPlaced) => {
      if (data.isMain || !data.teamID) return;
      fobByTeam[data.teamID] = (fobByTeam[data.teamID] ?? 0) + 1;
    };

    const addVehicleTime = (
      sid: string,
      name: string,
      cls: VehicleClass,
      seconds: number,
    ) => {
      if (seconds <= 0) return;
      const teamID = getPlayerBySteamID(state, sid)?.teamID ?? '';
      const st = getOrCreatePlayerStats(sid, name, teamID);
      if (isSupportVehicle(cls)) st.supportSeconds += seconds;
      else if (isCombatVehicle(cls)) st.crewSeconds += seconds;
    };

    const onVehicleSeat = (data: TVehicleSeatChange) => {
      const sid = data.steamID;
      if (!sid) return;
      const now = Date.now();
      if (data.action === 'enter') {
        curVehicle.set(sid, {
          asset: data.vehicle,
          seat: Number(data.seatNumber) || 0,
          name: data.name,
          since: now,
        });
      } else {
        const cur = curVehicle.get(sid);
        curVehicle.delete(sid);
        if (cur) {
          addVehicleTime(
            sid,
            cur.name,
            classifyVehicle(cur.asset),
            (now - cur.since) / 1000,
          );
        }
      }
    };

    const flushVehicles = (endTs: number) => {
      for (const [sid, cur] of curVehicle) {
        addVehicleTime(
          sid,
          cur.name,
          classifyVehicle(cur.asset),
          (endTs - cur.since) / 1000,
        );
      }
      curVehicle.clear();
    };

    const onNewGame = () => {
      resetMatchState();
    };

    const onRoundTickets = (data: TRoundTickets) => {
      const { team, action } = data;
      if (action === 'won') winner = team;

      matchTickets.push({
        team: data.team,
        action: data.action,
        subfaction: (data as Record<string, unknown>).subfaction as
          | string
          | undefined,
        tickets: (data as Record<string, unknown>).tickets as
          | number
          | undefined,
      });
    };

    const onRoundEnded = async () => {
      if (state.skipmap) return;

      const { players, currentMap } = state;
      if (!players) return;

      const matchEndTime = Date.now();
      const matchID = `${id}_${matchEndTime}_${++matchCounter}`;

      flushVehicles(matchEndTime);

      const team1Info = matchTickets.find((t) => t.team === '1');
      const team2Info = matchTickets.find((t) => t.team === '2');

      const layer = currentMap?.layer || null;
      const level = currentMap?.level || null;

      const team1 = {
        subfaction: team1Info?.subfaction || null,
        tickets: team1Info?.tickets ?? null,
      };
      const team2 = {
        subfaction: team2Info?.subfaction || null,
        tickets: team2Info?.tickets ?? null,
      };

      const layerLc = (layer || '').toLowerCase();
      const isSeed = layerLc.includes('seed');

      // Финальный снапшот присутствующих: завести запись и зафиксировать
      // лидерство тем, кто остался к концу (на не-seed картах).
      const finalizePresent = () => {
        if (isSeed) return;
        for (const p of players) {
          if (!p.steamID) continue;
          if (p.possess?.toLowerCase().includes('developeradmincam')) continue;
          getOrCreatePlayerStats(p.steamID, p.name, p.teamID);
          captureLeadership(p);
        }
      };

      // Начисление matches/winrate идёт по накопителю matchPlayerStats —
      // т.е. по всем, кто реально играл, а не только по оставшимся к концу.
      // Это закрывает абуз «слил и вышел до конца раунда».
      const updatePlayerGames = async (st: MatchPlayerStats) => {
        if (!winner) return;
        const { teamID, steamID } = st;
        if (!teamID) return;
        const gameResult = teamID === winner ? 'won' : 'lose';
        await updateGames(id, steamID, gameResult);

        if (st.wasCommander) {
          const cmdGameResult = teamID === winner ? 'cmdwon' : 'cmdlose';
          await updateGames(id, steamID, cmdGameResult);
        }
      };

      try {
        finalizePresent();

        await Promise.all(
          [...matchPlayerStats.values()].map(updatePlayerGames),
        );

        const pushPromises: Promise<void>[] = [];

        for (const [steamID, p] of matchPlayerStats) {
          const kd =
            p.death > 0 && Number.isFinite(p.kills / p.death)
              ? Number((p.kills / p.death).toFixed(2))
              : p.kills;

          const result = winner
            ? p.teamID === winner
              ? 'won'
              : 'lose'
            : 'unknown';

          pushPromises.push(
            pushMatchHistory(id, steamID, {
              matchID,
              layer,
              level,
              startTime: matchStartTime,
              endTime: matchEndTime,
              result,
              kills: p.kills,
              death: p.death,
              revives: p.revives,
              teamkills: p.teamkills,
              kd,
              team1,
              team2,
            }),
          );
        }

        await Promise.all(pushPromises);

        if (eloEnabled && winner && !isSeed) {
          const participants: EloParticipant[] = [];
          for (const [steamID, st] of matchPlayerStats) {
            if (!steamID || !st.teamID) continue;
            participants.push({
              steamID,
              teamID: st.teamID,
              squadID: st.squadID || undefined,
              win: st.teamID === winner,
              kills: st.kills,
              death: st.death,
              revives: st.revives,
              teamkills: st.teamkills,
              vehicleKills: st.vehicleKills,
              downs: st.downs,
              victims: st.victims,
              downedVictims: st.downedVictims,
              supportSeconds: st.supportSeconds,
              crewSeconds: st.crewSeconds,
              crewAssists: st.crewAssists,
              wasCommander: st.wasCommander,
              wasSquadLeader: st.wasSquadLeader,
            });
          }
          if (participants.length >= eloMinPlayers) {
            const wT = winner === '1' ? team1.tickets : team2.tickets;
            const lT = winner === '1' ? team2.tickets : team1.tickets;
            await applyMatchElo(id, participants, {
              displayMode: eloDisplayMode,
              matchSeconds: (matchEndTime - matchStartTime) / 1000,
              winnerTickets: wT ?? 0,
              loserTickets: lT ?? 0,
              team1Fobs: fobByTeam['1'] ?? 0,
              team2Fobs: fobByTeam['2'] ?? 0,
            }).catch((e) => logger.error(`ELO update failed: ${e}`));
          }
        }

        winner = '';
        resetMatchState();
        await creatingTimeStamp(id);
      } catch (error) {
        logger.error(`Произошла ошибка при обновлении данных игрока: ${error}`);
      }
    };

    const buildMinuteEntry = (player: TPlayer): MinutePlayer => {
      let leader = false;
      let cmd = false;
      if (player.isLeader && player.squadID) {
        leader = true;
        const squad = getSquadByID(state, player.squadID, player.teamID);
        if (
          squad &&
          (squad.squadName === 'CMD Squad' ||
            squad.squadName === 'Command Squad')
        ) {
          cmd = true;
        }
      }
      return {
        steamID: player.steamID,
        name: player.name,
        possess: player.possess,
        role: player.role,
        leader,
        cmd,
      };
    };

    const captureLeadership = (player: TPlayer) => {
      const st = matchPlayerStats.get(player.steamID);
      if (!st) return;
      if (player.squadID) st.squadID = player.squadID;
      if (player.isLeader && player.squadID) {
        const squad = getSquadByID(state, player.squadID, player.teamID);
        const isCmd =
          squad &&
          (squad.squadName === 'CMD Squad' ||
            squad.squadName === 'Command Squad');
        if (isCmd) st.wasCommander = true;
        else st.wasSquadLeader = true;
      }
    };

    const statsSweep = setInterval(() => {
      const { players, currentMap } = state;
      if (!players || players.length === 0) return;
      const present = players.filter((p) => p.steamID);
      const isSeed = (currentMap?.layer || '').toLowerCase().includes('seed');
      if (!isSeed) {
        for (const p of present) {
          if (p.possess?.toLowerCase().includes('developeradmincam')) continue;
          getOrCreatePlayerStats(p.steamID, p.name, p.teamID);
          captureLeadership(p);
        }
      }
      const entries = present.map(buildMinuteEntry);
      void bulkUpdatePlayerMinute(id, entries).catch((error) =>
        logger.error(`Ошибка bulk-обновления поминутной статы: ${error}`),
      );
    }, 60000);

    const onDamaged = (data: TPlayerDamaged) => {
      const { victimName, weapon } = data;
      if (victimName && weapon) {
        lastDamageWeapon.set(victimName.trim(), weapon);
      }

      const dmgAttacker = getPlayerByEOSID(state, data.attackerEOSID);
      if (victimName && dmgAttacker) {
        lastDamageAttacker.set(victimName.trim(), { ...dmgAttacker });
      }
    };

    const onDied = async (data: TPlayerDied) => {
      const { currentMap } = state;

      if (!currentMap?.layer) return;

      if (currentMap.layer.toLowerCase().includes('seed')) return;

      const { attackerSteamID, victimName, attackerEOSID } = data;
      const trimmedVictim = victimName.trim();

      const attacker =
        getPlayerByEOSID(state, attackerEOSID) ||
        lastDamageAttacker.get(trimmedVictim) ||
        null;
      const victim = getPlayerByName(state, victimName);
      if (!victim) return;

      let weapon = lastDamageWeapon.get(trimmedVictim) || 'null';
      lastDamageWeapon.delete(trimmedVictim);
      lastDamageAttacker.delete(trimmedVictim);

      if (
        weapon === 'null' &&
        data.weapon &&
        !data.weapon.startsWith('BP_Soldier_') &&
        data.weapon !== 'nullptr'
      ) {
        weapon = data.weapon.replace(/_C(?:_\d+)?$/, '');
      }

      const killerSteamID = attackerSteamID || attacker?.steamID || '';

      try {
        if (killerSteamID && killerSteamID === victim.steamID) {
          await updateUser(id, victim.steamID, 'death');
          const vs = getOrCreatePlayerStats(
            victim.steamID,
            victim.name,
            victim.teamID,
          );
          vs.death++;
          return;
        }

        if (!killerSteamID && !attacker) {
          await updateUser(id, victim.steamID, 'death');
          const vs = getOrCreatePlayerStats(
            victim.steamID,
            victim.name,
            victim.teamID,
          );
          vs.death++;
          return;
        }

        if (
          attacker?.teamID === victim.teamID &&
          attacker?.name !== victim.name
        ) {
          if (killerSteamID)
            await updateUser(id, killerSteamID, 'teamkills', weapon);
          await updateUser(id, victim.steamID, 'death');
          if (killerSteamID && attacker) {
            const as = getOrCreatePlayerStats(
              killerSteamID,
              attacker.name,
              attacker.teamID,
            );
            as.teamkills++;
          }
          const vs = getOrCreatePlayerStats(
            victim.steamID,
            victim.name,
            victim.teamID,
          );
          vs.death++;
          return;
        }

        if (killerSteamID) {
          await updateUser(id, killerSteamID, 'kills', weapon);
          if (attacker) {
            const as = getOrCreatePlayerStats(
              killerSteamID,
              attacker.name,
              attacker.teamID,
            );
            as.kills++;
            if (victim.steamID) as.victims.push(victim.steamID);
            const killerVeh = curVehicle.get(killerSteamID);
            if (killerVeh) {
              as.vehicleKills++;

              for (const [sid, cur] of curVehicle) {
                if (sid === killerSteamID) continue;
                if (cur.seat !== 0) continue;
                if (cur.asset !== killerVeh.asset) continue;
                const drv = getPlayerBySteamID(state, sid);
                if (drv && drv.teamID === attacker.teamID) {
                  const ds = getOrCreatePlayerStats(sid, drv.name, drv.teamID);
                  ds.crewAssists++;
                }
              }
            }
          }
        }
        await updateUser(id, victim.steamID, 'death');
        const vs = getOrCreatePlayerStats(
          victim.steamID,
          victim.name,
          victim.teamID,
        );
        vs.death++;
      } catch (error) {
        logger.error(`Ошибка при обновлении данных игрока: ${error}`);
      }
    };

    const onRevived = async (data: TPlayerRevived) => {
      try {
        const { currentMap } = state;

        if (!currentMap?.layer) return;

        if (currentMap.layer.toLowerCase().includes('seed')) return;

        const { reviverSteamID, victimName } = data;

        if (victimName) {
          lastDamageWeapon.delete(victimName.trim());
          lastDamageAttacker.delete(victimName.trim());
        }

        await updateUser(id, reviverSteamID, 'revives');

        const reviver = getPlayerBySteamID(state, reviverSteamID);
        if (reviver) {
          const rs = getOrCreatePlayerStats(
            reviverSteamID,
            reviver.name,
            reviver.teamID,
          );
          rs.revives++;
        }
      } catch (error) {
        logger.error(
          `Ошибка при обновлении данных пользователя на возрождение: ${error}`,
        );
      }
    };

    const onWounded = (data: TPlayerWounded) => {
      const { victimName, weapon, attackerSteamID } = data;
      if (victimName && weapon) {
        lastDamageWeapon.set(victimName.trim(), weapon);
      }

      if (attackerSteamID) {
        const attacker = getPlayerBySteamID(state, attackerSteamID);
        if (attacker && attacker.name !== victimName) {
          const as = getOrCreatePlayerStats(
            attackerSteamID,
            attacker.name,
            attacker.teamID,
          );
          as.downs++;
          const victim = victimName
            ? getPlayerByName(state, victimName)
            : undefined;
          if (victim?.steamID) as.downedVictims.push(victim.steamID);
        }
      }
    };

    listener.on(EVENTS.PLAYER_DAMAGED, onDamaged);
    listener.on(EVENTS.PLAYER_WOUNDED, onWounded);
    listener.on(EVENTS.PLAYER_DIED, onDied);
    listener.on(EVENTS.PLAYER_REVIVED, onRevived);
    listener.on(EVENTS.VEHICLE_SEAT_CHANGE, onVehicleSeat);
    listener.on(EVENTS.ROUND_ENDED, onRoundEnded);
    listener.on(EVENTS.ROUND_TICKETS, onRoundTickets);
    listener.on(EVENTS.FOB_PLACED, onFobPlaced);
    listener.on(EVENTS.NEW_GAME, onNewGame);

    registerDisposable(() => {
      listener.off(EVENTS.PLAYER_DAMAGED, onDamaged);
      listener.off(EVENTS.PLAYER_WOUNDED, onWounded);
      listener.off(EVENTS.PLAYER_DIED, onDied);
      listener.off(EVENTS.PLAYER_REVIVED, onRevived);
      listener.off(EVENTS.VEHICLE_SEAT_CHANGE, onVehicleSeat);
      listener.off(EVENTS.ROUND_ENDED, onRoundEnded);
      listener.off(EVENTS.ROUND_TICKETS, onRoundTickets);
      listener.off(EVENTS.FOB_PLACED, onFobPlaced);
      listener.off(EVENTS.NEW_GAME, onNewGame);
      clearInterval(statsSweep);
    });
  },
});
