import axios from 'axios';
import fs from 'fs';
import path from 'path';
import {
  TNewGame,
  TPlayerConnected,
  TPlayerDied,
  TPlayerDisconnected,
  TPlayerRevived,
  TPlayerWounded,
  TRoundTickets,
} from 'squad-logs';
import { TChatMessage } from 'squad-rcon';
import { fileURLToPath } from 'url';
import { EVENTS } from '../constants';
import { adminWarn } from '../core';
import { TPluginProps } from '../types';
import {
  getAdmins,
  getPlayerByName,
  getPlayerBySteamID,
  getPlayers,
} from './helpers';

type postDataToAPIType = {
  match?: number | null;
  time?: string;
  victim?: string | null;
  victimEosID?: string | null;
  victimName?: string | null;
  victimTeamID?: string | null;
  victimSquadID?: string | null;
  attacker?: string | null;
  attackerEosID?: string | null;
  attackerName?: string | null;
  attackerTeamID?: string | null;
  attackerSquadID?: string | null;
  damage?: number;
  weapon?: string;
  teamkill?: boolean;
  server?: string;
  dlc?: string;
  mapClassname?: string;
  layerClassname?: string;
  map?: string | null;
  layer?: string | null;
  startTime?: string;
  name?: string;
  version?: string;
  steamID?: string;
  code?: string;
  endTime?: string;
  winner?: string;
};

interface ResponseData {
  status: number;
  statusText: string;
}

interface ErrorResponse {
  response?: ResponseData;
  request?: unknown;
  message?: string;
}

interface SuccessResponse {
  successStatus: string;
  successMessage: string;
}

export const mySquadStats: TPluginProps = async (state, options) => {
  const { listener, execute, logger, currentMap, serverInfo } = state;
  const { accessToken } = options;
  const serverName = serverInfo?.serverName;

  let match: { id: number };
  let trackedKillstreaks: Record<string, number> = {};
  let isProcessingFailedRequests: boolean;
  const currentVersion = 'v4.2.3';
  checkVersion();
  const pingInterval = setInterval(() => pingMySquadStats(), 60000);
  // Post Request to create Server in API
  let dataType = 'servers';
  const serverData = {
    name: serverName,
    version: currentVersion,
  };
  const response = await postDataToAPI(dataType, serverData, accessToken);
  if (response.successStatus === 'Error') console.log(response);

  logger.error(
    `Mount-Server | ${response.successStatus} | ${response.successMessage}`,
  );

  // Get Request to get Match Info from API
  dataType = 'matches';
  const matchResponse = await getDataFromAPI(dataType, accessToken);
  match = matchResponse.match;
  if (response.successStatus === 'Error')
    logger.error(
      `Mount-Match | ${matchResponse.successStatus} | ${matchResponse.successMessage}`,
    );

  // Get Admins
  const admins = getAdmins(state, 'cameraman');
  if (!admins) return;
  // Make a players request to the API for each admin
  for (let i = 0; i < admins.length; i++) {
    const adminId = admins[i];
    let playerData = {};

    playerData = {
      steamID: adminId,
      isAdmin: 1,
    };

    const dataType = 'players';
    const response = await patchDataInAPI(dataType, playerData, accessToken);

    // Only log the response if it's an error
    if (response.successStatus === 'Error')
      logger.error(
        `Mount-Admins | ${response.successStatus} | ${response.successMessage}`,
      );
  }

  const onChatCommand = async (data: TChatMessage) => {
    // Check if message is empty
    if (data.message.length === 0) {
      await adminWarn(
        execute,
        data.steamID,
        `Please input your Link Code given by MySquadStats.com.`,
      );
      return;
    }
    // Check if message is not the right length
    if (data.message.length !== 6) {
      await adminWarn(
        execute,
        data.steamID,
        `Please input a valid 6-digit Link Code.`,
      );
      return;
    }
    // Get Player from API
    let dataType = `players?search=${data.steamID}`;
    let response = await getDataFromAPI(dataType, accessToken);
    if (response.successStatus === 'Error') {
      await adminWarn(
        execute,
        data.steamID,
        `An error occurred while trying to link your account.\nPlease try again later.`,
      );

      return;
    }
    const player = response.data[0];
    // If discordID is already linked, return error
    if (player.discordID !== 'Unknown') {
      await adminWarn(
        execute,
        data.steamID,
        `Your account is already linked.\nContact an MySquadStats.com if this is wrong.`,
      );
      return;
    }

    // Post Request to link Player in API
    dataType = 'playerLink';
    const linkData = {
      steamID: data.steamID,
      code: data.message,
    };
    response = await postDataToAPI(dataType, linkData, accessToken);
    if (response.successStatus === 'Error') {
      await adminWarn(
        execute,
        data.steamID,
        `${response.successMessage}\nPlease try again later.`,
      );

      return;
    }

    await adminWarn(
      execute,
      data.steamID,
      `Thank you for linking your accounts.`,
    );
  };

  const onNewGame = async (info: TNewGame) => {
    // Post Request to create Server in API
    let dataType = 'servers';
    const serverData = {
      name: serverName,
      version: currentVersion,
    };
    const serverResponse = await postDataToAPI(
      dataType,
      serverData,
      accessToken,
    );
    logger.log(
      `NewGame-Server | ${serverResponse.successStatus} | ${serverResponse.successMessage}`,
    );

    // Post Request to create new Match in API
    dataType = 'matches';
    const newMatchData = {
      server: serverName,
      dlc: info.dlc,
      mapClassname: info.mapClassname,
      layerClassname: info.layerClassname,
      map: info.mapClassname ? info.mapClassname : null,
      layer: info.layerClassname ? info.layerClassname : null,
      startTime: info.time,
    };
    const matchResponse = await postDataToAPI(
      dataType,
      newMatchData,
      accessToken,
    );
    match = matchResponse.match;
    if (matchResponse.successStatus === 'Error') {
      logger.error(
        `NewGame-Post-Match${matchResponse.successStatus} | ${matchResponse.successMessage}`,
      );
    }
  };

  const onRoundTickets = async (info: TRoundTickets) => {
    // Patch Request to update last Match in API
    if (info.action === 'lost') return;

    dataType = 'matches';
    const matchData = {
      endTime: info.time,
      winner: info.subfaction,
    };
    const updateResponse = await patchDataInAPI(
      dataType,
      matchData,
      accessToken,
    );
    if (updateResponse.successStatus === 'Error') {
      logger.error(
        `NewGame-Patch-Match | ${updateResponse.successStatus} | ${updateResponse.successMessage}`,
      );
    }
  };

  async function postDataToAPI(
    dataType: String,
    data: postDataToAPIType,
    accessToken: String,
  ) {
    const __dirname = fileURLToPath(import.meta.url);
    try {
      const response = await axios.post(
        `https://mysquadstats.com/api/${dataType}`,
        data,
        {
          params: { accessToken },
        },
      );
      return response.data;
    } catch (error: any) {
      if (error.response && error.response.status === 502) {
        // Save the request details to a local file for later retry
        const requestDetails = {
          dataType: `${dataType}`,
          data: data,
        };
        const dirPath = path.join(__dirname, '..', '..', 'MySquadStats_Data');
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }

        const filePath = path.join(dirPath, 'send-retry-requests.json');
        let failedRequests = [];
        if (fs.existsSync(filePath)) {
          failedRequests = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
        failedRequests.push(requestDetails);
        fs.writeFileSync(filePath, JSON.stringify(failedRequests));
      }
      return handleApiError(error);
    }
  }

  async function getDataFromAPI(dataType: String, accessToken: String) {
    try {
      const response = await axios.get(
        `https://mysquadstats.com/api/${dataType}`,
        {
          params: { accessToken },
        },
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  }

  async function onPlayerConnected(info: TPlayerConnected) {
    let playerData = {};
    const players = getPlayers(state);
    if (
      players &&
      players.length <= 50 &&
      currentMap &&
      currentMap.layer?.includes('seed')
    ) {
      playerData = {
        isSeeder: 1,
      };
    }

    // Patch Request to create Player in API
    const dataType = 'players';
    const player = getPlayerBySteamID(state, info.steamID);
    playerData = {
      ...playerData,
      eosID: info.eosID,
      steamID: info.steamID,
      lastName: player ? player.name : null,
      lastIP: info.ip,
    };
    const response = await patchDataInAPI(dataType, playerData, accessToken);
    if (response.successStatus === 'Error') {
      logger.error(
        `Connected-Player | ${response.successStatus} | ${response.successMessage}`,
      );
    }
  }

  async function onPlayerWounded(info: TPlayerWounded) {
    // Post Request to create Wound in API
    const dataType = 'wounds';
    const victimPlayer = getPlayerByName(state, info.victimName);
    const attackerPlayer = getPlayerBySteamID(state, info.attackerSteamID);
    let teamkill = false;
    if (attackerPlayer?.teamID === victimPlayer?.teamID) teamkill = true;
    const woundData = {
      match: match ? match.id : null,
      time: info.time,
      victim: victimPlayer ? victimPlayer.steamID : null,
      victimEosID: victimPlayer ? victimPlayer.eosID : null,
      victimName: victimPlayer ? victimPlayer.name : null,
      victimTeamID: victimPlayer ? victimPlayer.teamID : null,
      victimSquadID: victimPlayer ? victimPlayer.squadID : null,
      attacker: attackerPlayer ? attackerPlayer.steamID : null,
      attackerEosID: attackerPlayer ? attackerPlayer.eosID : null,
      attackerName: attackerPlayer ? attackerPlayer.name : null,
      attackerTeamID: attackerPlayer ? attackerPlayer.teamID : null,
      attackerSquadID: attackerPlayer ? attackerPlayer.squadID : null,
      damage: info.damage,
      weapon: info.weapon,
      teamkill: teamkill,
    };
    const response = await postDataToAPI(dataType, woundData, accessToken);
    if (response.successStatus === 'Error') {
      logger.error(
        `Wounds-Wound | ${response.successStatus} | ${response.successMessage}`,
      );
    }
  }

  async function onPlayerDied(info: TPlayerDied) {
    // Killstreaks
    if (info.victimName) {
      // Post Request to create Death in API
      const dataType = 'deaths';
      const victimPlayer = getPlayerByName(state, info.victimName);
      const attackerPlayer = getPlayerBySteamID(state, info.attackerSteamID);
      let teamkill = false;
      if (attackerPlayer?.teamID === victimPlayer?.teamID) teamkill = true;
      const deathData = {
        match: match ? match.id : null,
        time: info.time,
        victim: victimPlayer ? victimPlayer.steamID : null,
        victimEosID: victimPlayer ? victimPlayer.eosID : null,
        victimName: victimPlayer ? victimPlayer.name : null,
        victimTeamID: victimPlayer ? victimPlayer.teamID : null,
        victimSquadID: victimPlayer ? victimPlayer.squadID : null,
        attacker: attackerPlayer ? attackerPlayer.steamID : null,
        attackerEosID: attackerPlayer ? attackerPlayer.eosID : null,
        attackerName: attackerPlayer ? attackerPlayer.name : null,
        attackerTeamID: attackerPlayer ? attackerPlayer.teamID : null,
        attackerSquadID: attackerPlayer ? attackerPlayer.squadID : null,
        damage: info.damage,
        weapon: victimPlayer ? victimPlayer.weapon : info.weapon,
        teamkill: teamkill,
      };
      const response = await postDataToAPI(dataType, deathData, accessToken);
      if (response.successStatus === 'Error') {
        logger.error(
          `Died-Death | ${response.successStatus} | ${response.successMessage}`,
        );
      }
    }
  }

  async function onPlayerRevived(info: TPlayerRevived) {
    // Post Request to create Revive in API
    const dataType = 'revives';
    const victimPlayer = getPlayerBySteamID(state, info.victimSteamID);
    const reviverPlayer = getPlayerBySteamID(state, info.reviverSteamID);
    const reviveData = {
      match: match ? match.id : null,
      time: info.time,
      woundTime: info.time,
      victim: victimPlayer ? victimPlayer.steamID : null,
      victimEosID: victimPlayer ? victimPlayer.eosID : null,
      victimName: victimPlayer ? victimPlayer.name : null,
      victimTeamID: victimPlayer ? victimPlayer.teamID : null,
      victimSquadID: victimPlayer ? victimPlayer.squadID : null,
      // attacker: info.attacker ? info.attacker.steamID : null,
      // attackerEosID: info.attacker ? info.attacker.eosID : null,
      // attackerName: info.attacker ? info.attacker.name : null,
      // attackerTeamID: info.attacker ? info.attacker.teamID : null,
      // attackerSquadID: info.attacker ? info.attacker.squadID : null,
      // damage: info.damage,
      // weapon: info.weapon,
      // teamkill: info.teamkill,
      reviver: reviverPlayer ? reviverPlayer.steamID : null,
      reviverEosID: reviverPlayer ? reviverPlayer.eosID : null,
      reviverName: reviverPlayer ? reviverPlayer.name : null,
      reviverTeamID: reviverPlayer ? reviverPlayer.teamID : null,
      reviverSquadID: reviverPlayer ? reviverPlayer.squadID : null,
    };
    const response = await postDataToAPI(dataType, reviveData, accessToken);
    if (response.successStatus === 'Error') {
      logger.error(
        `Revives-Revive | ${response.successStatus} | ${response.successMessage}`,
      );
    }
  }

  async function killstreakWounded(info: TPlayerWounded) {
    const attackerPlayer = getPlayerBySteamID(state, info.attackerSteamID);
    if (!attackerPlayer) return;

    // Get the attacker's Steam ID
    const eosID = attackerPlayer.eosID;

    // Check if this is the first time the attacker has made a killstreak
    if (!trackedKillstreaks.hasOwnProperty(eosID)) {
      // Set the player's initial killstreak to 0
      trackedKillstreaks[eosID] = 0;
    }

    // Increment the player's kill streak by 1
    trackedKillstreaks[eosID] += 1;
  }

  async function killstreakDied(info: TPlayerDied) {
    const victimPlayer = getPlayerByName(state, info.victimName);
    if (!victimPlayer) return;
    const eosID = victimPlayer.eosID;
    // Update highestKillstreak in the SQL database and get the new highestKillstreak
    await updateHighestKillstreak(eosID);

    if (trackedKillstreaks.hasOwnProperty(eosID)) {
      delete trackedKillstreaks[eosID];
    }
  }

  async function killstreakNewGame() {
    // Get an array of all the Steam IDs in the trackedKillstreaks object
    const eosIDs = Object.keys(trackedKillstreaks);

    // Loop through the array
    for (const eosID of eosIDs) {
      if (trackedKillstreaks[eosID] > 0) {
        // Update highestKillstreak in the SQL database
        await updateHighestKillstreak(eosID);
      }

      // Remove the player from the trackedKillstreaks object
      delete trackedKillstreaks[eosID];
    }
  }

  async function killstreakDisconnected(info: TPlayerDisconnected) {
    if (!info.eosID) return;
    const eosID = info.eosID;

    // Update highestKillstreak in the SQL database
    if (trackedKillstreaks.hasOwnProperty(eosID)) {
      if (trackedKillstreaks[eosID] > 0) {
        await updateHighestKillstreak(eosID);
      }
    }

    delete trackedKillstreaks[eosID];
  }

  async function updateHighestKillstreak(eosID: string) {
    // Get the player's current killstreak from the trackedKillstreaks object
    const currentKillstreak = trackedKillstreaks[eosID];

    // Return is the player's current killstreak is 0
    if (!currentKillstreak || currentKillstreak === 0) return;

    try {
      // Patch Request to update highestKillstreak in API
      const dataType = 'playerKillstreaks';
      const playerData = {
        eosID: eosID,
        highestKillstreak: currentKillstreak,
        match: match ? match.id : null,
      };
      const response = await patchDataInAPI(dataType, playerData, accessToken);
      if (response.successStatus === 'Error') {
        logger.error(
          `Error updating highestKillstreak in database for ${eosID}: ${response.successMessage}`,
        );
      }
    } catch (error) {
      logger.error(
        `Error updating highestKillstreak in database for ${eosID}: ${error}`,
      );
    }
  }

  async function patchDataInAPI(
    dataType: string,
    data: postDataToAPIType,
    accessToken: string,
  ) {
    const __dirname = fileURLToPath(import.meta.url);
    try {
      const response = await axios.patch(
        `https://mysquadstats.com/api/${dataType}`,
        data,
        {
          params: { accessToken },
        },
      );
      return response.data;
    } catch (error: any) {
      if (error.response && error.response.status === 502) {
        // Save the request details to a local file for later retry
        const requestDetails = {
          dataType: `${dataType}`,
          data: data,
        };
        const dirPath = path.join(__dirname, '..', '..', 'MySquadStats_Data');
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }

        const filePath = path.join(dirPath, 'patch-retry-requests.json');
        let failedRequests = [];
        if (fs.existsSync(filePath)) {
          failedRequests = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
        failedRequests.push(requestDetails);
        fs.writeFileSync(filePath, JSON.stringify(failedRequests));
      }
      return handleApiError(error);
    }
  }

  async function checkVersion() {
    const owner = 'IgnisAlienus';
    const newOwner = 'Ignis-Bots';
    const repo = 'SquadJS-My-Squad-Stats';
    let latestVersion;
    let currentOwner;

    try {
      latestVersion = await getLatestVersion(owner, repo);
      currentOwner = owner;
    } catch (error) {
      logger.error(
        `Error retrieving the latest version of ${repo} from ${owner}: ${error}`,
      );
      try {
        latestVersion = await getLatestVersion(newOwner, repo);
        currentOwner = newOwner;
      } catch (error) {
        logger.error(
          `Error retrieving the latest version of ${repo} from ${newOwner}: ${error}`,
        );
        return;
      }
    }

    if (
      currentVersion.localeCompare(latestVersion, undefined, {
        numeric: true,
      }) < 0
    ) {
      logger.log(`New version of ${repo} is available. Updating...`);

      const updatedCodeUrl = `https://raw.githubusercontent.com/${currentOwner}/${repo}/${latestVersion}/squad-server/plugins/my-squad-stats.js`;

      // Download the updated code
      let updatedCode;
      try {
        const response = await axios.get(updatedCodeUrl);
        updatedCode = response.data;
      } catch (error) {
        logger.error(`For downloading the updated code: ${error}`);
        return;
      }

      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const filePath = path.join(__dirname, 'my-squad-stats.js');
      fs.writeFileSync(filePath, updatedCode);

      logger.log(`Successfully updated ${repo} to version ${latestVersion}`);
    } else if (currentVersion > latestVersion) {
      logger.log(
        `You are running a newer version of ${repo} than the latest version.\nThis likely means you are running a pre-release version.\nCurrent version: ${currentVersion} Latest Version: ${latestVersion}\nhttps://github.com/${currentOwner}/${repo}/releases`,
      );
    } else if (currentVersion === latestVersion) {
      logger.log(`You are running the latest version of ${repo}.`);
    } else {
      logger.log(`Unable to check for updates in ${repo}.`);
    }
  }

  async function pingMySquadStats() {
    logger.log('Pinging My Squad Stats...');
    if (isProcessingFailedRequests) {
      logger.log('Already processing failed requests...');
      return;
    }
    isProcessingFailedRequests = true;

    const __dirname = fileURLToPath(import.meta.url);
    // If MySquadStats_Failed_Requests folder exists, delete it if empty to use the new folder
    const failedRequestsFolderPath = path.join(
      __dirname,
      '..',
      '..',
      'MySquadStats_Failed_Requests',
    );
    if (fs.existsSync(failedRequestsFolderPath)) {
      const files = fs.readdirSync(failedRequestsFolderPath);
      if (files.length === 0) {
        fs.rmdirSync(failedRequestsFolderPath);
      }
    }
    const dataType = 'ping';
    const response = await getDataFromAPI(dataType, accessToken);
    if (response.successMessage === 'pong') {
      logger.log('Pong! My Squad Stats is up and running.');
      // Check for any failed requests and retry
      const filePath = path.join(
        __dirname,
        '..',
        '..',
        'MySquadStats_Data',
        'send-retry-requests.json',
      );
      if (fs.existsSync(filePath)) {
        logger.log('Retrying failed POST requests...');
        const failedRequests = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        // Sort the array so that match requests come first
        failedRequests.sort(
          (a: { dataType: string }, b: { dataType: string }) => {
            if (a.dataType === 'matches' && b.dataType !== 'matches') {
              return -1;
            } else if (a.dataType !== 'matches' && b.dataType === 'matches') {
              return 1;
            } else {
              return 0;
            }
          },
        );
        for (let i = 0; i < failedRequests.length; i++) {
          const request = failedRequests[i];
          const retryResponse = await postDataToAPI(
            request.dataType,
            request.data,
            accessToken,
          );
          logger.log(
            `${retryResponse.successStatus} | ${retryResponse.successMessage}`,
          );
          if (retryResponse.successStatus === 'Success') {
            // Remove the request from the array
            failedRequests.splice(i, 1);
            // Decrement i so the next iteration won't skip an item
            i--;
            // Write the updated failedRequests array back to the file
            fs.writeFileSync(filePath, JSON.stringify(failedRequests));
          }
          // Wait for 5 seconds before processing the next request
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        // Delete the file if there are no more failed requests
        if (failedRequests.length === 0) {
          fs.unlinkSync(filePath);
        }
        logger.log('Finished retrying failed POST requests.');
      }
      const patchFilePath = path.join(
        __dirname,
        '..',
        '..',
        'MySquadStats_Data',
        'patch-retry-requests.json',
      );
      if (fs.existsSync(patchFilePath)) {
        logger.log('Retrying failed PATCH requests...');
        const failedRequests = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        // Sort the array so that match requests come first
        failedRequests.sort(
          (a: { dataType: string }, b: { dataType: string }) => {
            if (a.dataType === 'matches' && b.dataType !== 'matches') {
              return -1;
            } else if (a.dataType !== 'matches' && b.dataType === 'matches') {
              return 1;
            } else {
              return 0;
            }
          },
        );
        for (let i = 0; i < failedRequests.length; i++) {
          const request = failedRequests[i];
          const retryResponse = await patchDataInAPI(
            request.dataType,
            request.data,
            accessToken,
          );
          logger.log(
            `${retryResponse.successStatus} | ${retryResponse.successMessage}`,
          );
          if (retryResponse.successStatus === 'Success') {
            // Remove the request from the array
            failedRequests.splice(i, 1);
            // Decrement i so the next iteration won't skip an item
            i--;
            // Write the updated failedRequests array back to the file
            fs.writeFileSync(patchFilePath, JSON.stringify(failedRequests));
          }
          // Wait for 5 seconds before processing the next request
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        // Delete the file if there are no more failed requests
        if (failedRequests.length === 0) {
          fs.unlinkSync(patchFilePath);
        }
        logger.log('Finished retrying failed PATCH requests.');
      }
    }
    isProcessingFailedRequests = false;
  }

  async function getLatestVersion(owner: string, repo: string) {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const response = await fetch(url);
    const data = await response.json();
    return data.tag_name;
  }

  function isErrorResponse(error: unknown): error is ErrorResponse {
    return (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      typeof (error as ErrorResponse).response?.status === 'number'
    );
  }

  function handleApiError(error: unknown): SuccessResponse {
    if (isErrorResponse(error)) {
      let errMsg = `${error.response!.status} - ${error.response!.statusText}`;
      const status = 'Error';
      if (error.response!.status === 502) {
        errMsg +=
          ' Unable to connect to the API. My Squad Stats is likely down.';
      } else if (error.response!.status === 500) {
        errMsg += ' Internal server error. Something went wrong on the server.';
      }
      return {
        successStatus: status,
        successMessage: errMsg,
      };
    } else if ((error as ErrorResponse).request) {
      return {
        successStatus: 'Error',
        successMessage:
          'No response received from the API. Please check your network connection.',
      };
    } else {
      return {
        successStatus: 'Error',
        successMessage: `Error: ${(error as Error).message}`,
      };
    }
  }

  listener.on(EVENTS.CHAT_COMMAND_MSS, onChatCommand);
  listener.on(EVENTS.NEW_GAME, onNewGame);
  listener.on(EVENTS.ROUND_TICKETS, onRoundTickets);
  listener.on(EVENTS.PLAYER_CONNECTED, onPlayerConnected);
  listener.on(EVENTS.PLAYER_WOUNDED, onPlayerWounded);
  listener.on(EVENTS.PLAYER_DIED, onPlayerDied);
  listener.on(EVENTS.PLAYER_REVIVED, onPlayerRevived);
  listener.on(EVENTS.PLAYER_WOUNDED, killstreakWounded);
  listener.on(EVENTS.PLAYER_DIED, killstreakDied);
  listener.on(EVENTS.NEW_GAME, killstreakNewGame);
  listener.on(EVENTS.PLAYER_DISCONNECTED, killstreakDisconnected);
};
