import chalk from 'chalk';
import { format } from 'date-fns';
import { LogsReaderEvents, LogsReader } from 'squad-logs';
import { RconEvents, Rcon } from 'squad-rcon';
import { MongoClient } from 'mongodb';
import axios from 'axios';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import EventEmitter from 'events';
import fs$1 from 'fs';
import url from 'url';

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol */


function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

const adminEndMatch = (execute) => __awaiter(void 0, void 0, void 0, function* () {
    yield execute('AdminEndMatch');
});
const adminBroadcast = (execute, str) => __awaiter(void 0, void 0, void 0, function* () {
    yield execute(`AdminBroadcast ${str}`);
});
const adminChangeLayer = (execute, str) => __awaiter(void 0, void 0, void 0, function* () {
    yield execute(`AdminChangeLayer ${str}`);
});
const adminSetNextLayer = (execute, str) => __awaiter(void 0, void 0, void 0, function* () {
    yield execute(`AdminSetNextLayer ${str}`);
});
const adminDisbandSquad = (execute, teamID, squadID) => __awaiter(void 0, void 0, void 0, function* () {
    yield execute(`AdminDisbandSquad ${teamID} ${squadID}`);
});
const adminWarn = (execute, steamID, reason) => __awaiter(void 0, void 0, void 0, function* () {
    yield execute(`AdminWarn ${steamID} ${reason}`);
});
const adminKick = (execute, steamID, reason) => __awaiter(void 0, void 0, void 0, function* () {
    yield execute(`AdminKick ${steamID} ${reason}`);
});
const adminBan = (execute, steamID, reason) => __awaiter(void 0, void 0, void 0, function* () {
    yield execute(`AdminBan ${steamID} "0" ${reason}`);
});
const adminForceTeamChange = (execute, steamID) => __awaiter(void 0, void 0, void 0, function* () {
    yield execute(`AdminForceTeamChange ${steamID}`);
});
const adminKillServer = (execute) => __awaiter(void 0, void 0, void 0, function* () {
    yield execute(`AdminKillServer`);
});
const adminRemovePlayerFromSquad = (execute, steamID) => __awaiter(void 0, void 0, void 0, function* () {
    yield execute(`AdminRemovePlayerFromSquad ${steamID}`);
});

const getTime = () => format(new Date(), 'd LLL HH:mm:ss');
const initLogger = (id, enabled) => ({
    log: (...text) => {
        console.log(chalk.yellow(`[SquadJS][${id}][${getTime()}]`), chalk.green(text));
    },
    warn: (...text) => {
        console.log(chalk.yellow(`[SquadJS][${id}][${getTime()}]`), chalk.magenta(text));
    },
    error: (...text) => {
        console.log(chalk.yellow(`[SquadJS][${id}][${getTime()}]`), chalk.red(text));
    },
});

const serversState = {};
const getServersState = (id) => serversState[id];

const EVENTS = Object.assign(Object.assign(Object.assign({}, RconEvents), LogsReaderEvents), { UPDATED_ADMINS: 'UPDATED_ADMINS', UPDATED_PLAYERS: 'UPDATED_PLAYERS', UPDATED_SQUADS: 'UPDATED_SQUADS', PLAYER_TEAM_CHANGED: 'PLAYER_TEAM_CHANGED', PLAYER_SQUAD_CHANGED: 'PLAYER_SQUAD_CHANGED', PLAYER_ROLE_CHANGED: 'PLAYER_ROLE_CHANGED', PLAYER_LEADER_CHANGED: 'PLAYER_LEADER_CHANGED', 
    // CHAT COMMANDS
    CHAT_COMMAND_SKIPMAP: 'CHAT_COMMAND:skipmap', CHAT_COMMAND_VOTEMAP: 'CHAT_COMMAND:votemap', CHAT_COMMAND_ADMINS: 'CHAT_COMMAND:admins', CHAT_COMMAND_REPORT: 'CHAT_COMMAND:report', CHAT_COMMAND_R: 'CHAT_COMMAND:r', CHAT_COMMAND_STVOL: 'CHAT_COMMAND:ствол', CHAT_COMMAND_FIX: 'CHAT_COMMAND:fix', CHAT_COMMAND_BONUS: 'CHAT_COMMAND:bonus', CHAT_COMMAND_STATS: 'CHAT_COMMAND:stats', CHAT_COMMAND_DISCORD: 'CHAT_COMMAND:discord', CHAT_COMMAND_SWITCH: 'CHAT_COMMAND:switch', CHAT_COMMAND_SWAP: 'CHAT_COMMAND:swap', CHAT_COMMAND_SW: 'CHAT_COMMAND:sw', CHAT_COMMAND_MSS: 'CHAT_COMMAND:mss', CHAT_COMMAND_ROLL: 'CHAT_COMMAND:roll' });
const UPDATERS_REJECT_TIMEOUT = 10000;
const UPDATE_TIMEOUT = 30000;

const getPlayerBySteamID = (state, steamID) => { var _a; return ((_a = state.players) === null || _a === void 0 ? void 0 : _a.find((player) => player.steamID === steamID)) || null; };
const getPlayerByController = (state, playerController) => {
    var _a;
    return ((_a = state.players) === null || _a === void 0 ? void 0 : _a.find((player) => player.playerController === playerController)) || null;
};
const getPlayerByEOSID = (state, eosID) => { var _a; return ((_a = state.players) === null || _a === void 0 ? void 0 : _a.find((player) => player.eosID === eosID)) || null; };
const getPlayerByName = (state, name) => { var _a; return ((_a = state.players) === null || _a === void 0 ? void 0 : _a.find((player) => player.name.includes(name))) || null; };
const getSquadByID = (state, squadID, teamID) => {
    var _a;
    return ((_a = state.squads) === null || _a === void 0 ? void 0 : _a.find((squad) => squad.squadID === squadID && squad.teamID === teamID)) || null;
};
const getAdmins = (state, adminPermission) => state.admins
    ? Object.keys(state.admins).filter((admin) => { var _a; return (_a = state.admins) === null || _a === void 0 ? void 0 : _a[admin][adminPermission]; })
    : null;
const getPlayers = (state) => state.players;

const defaultOptions = {
    cooldownDuration: 2 * 60 * 1000,
    warningInterval: 30000,
    warnMessage: 'Вы не можете создавать или вступать в отряды вне админ-камеры. Отряд будет распущен через {time} секунд.',
};
const adminCamBlocker = (state, options) => {
    const { listener, execute, logger } = state;
    const opts = Object.assign(Object.assign({}, defaultOptions), options);
    const excludedAdmins = opts.adminSearchKey
        ? getAdmins(state, opts.adminSearchKey) || []
        : [];
    const adminStates = new Map();
    const knownAdmins = new Set();
    const initCooldown = (steamID) => {
        let adminState = adminStates.get(steamID);
        if (!adminState) {
            adminState = {
                isInCamera: false,
                cooldownTimeout: null,
                warningInterval: null,
                expiresAt: 0,
            };
            adminStates.set(steamID, adminState);
        }
        if (adminState.cooldownTimeout)
            clearTimeout(adminState.cooldownTimeout);
        if (adminState.warningInterval)
            clearInterval(adminState.warningInterval);
        const cooldownDuration = opts.cooldownDuration;
        adminState.expiresAt = Date.now() + cooldownDuration;
        adminWarn(execute, steamID, opts.warnMessage.replace('{time}', (cooldownDuration / 1000).toString()));
        adminState.warningInterval = setInterval(() => {
            const currentState = adminStates.get(steamID);
            if (!currentState)
                return;
            const player = getPlayerBySteamID(state, steamID);
            if (!player || !player.squadID) {
                if (currentState.cooldownTimeout)
                    clearTimeout(currentState.cooldownTimeout);
                if (currentState.warningInterval)
                    clearInterval(currentState.warningInterval);
                adminStates.delete(steamID);
                knownAdmins.delete(steamID);
                logger.log(`Админ ${steamID} покинул отряд.`);
                return;
            }
            const remainingMs = Math.max(currentState.expiresAt - Date.now(), 0);
            const remainingSeconds = Math.ceil(remainingMs / 1000);
            adminWarn(execute, steamID, opts.warnMessage.replace('{time}', remainingSeconds.toString()));
        }, opts.warningInterval);
        adminState.cooldownTimeout = setTimeout(() => {
            const currentState = adminStates.get(steamID);
            if (!currentState)
                return;
            const player = getPlayerBySteamID(state, steamID);
            if (!player || !player.squadID) {
                if (currentState.warningInterval)
                    clearInterval(currentState.warningInterval);
                adminStates.delete(steamID);
                knownAdmins.delete(steamID);
                return;
            }
            adminRemovePlayerFromSquad(execute, steamID);
            if (currentState.warningInterval)
                clearInterval(currentState.warningInterval);
            adminStates.delete(steamID);
            logger.log(`Админ ${steamID} удален из отряда.`);
        }, cooldownDuration);
        adminStates.set(steamID, adminState);
    };
    const onCameraPossessed = (data) => {
        if (excludedAdmins.includes(data.steamID))
            return;
        const steamID = data.steamID;
        knownAdmins.add(steamID);
        if (adminStates.has(steamID)) {
            const stateObj = adminStates.get(steamID);
            if (stateObj.cooldownTimeout)
                clearTimeout(stateObj.cooldownTimeout);
            if (stateObj.warningInterval)
                clearInterval(stateObj.warningInterval);
            adminStates.set(steamID, {
                isInCamera: true,
                cooldownTimeout: null,
                warningInterval: null,
                expiresAt: 0,
            });
        }
        else {
            adminStates.set(steamID, {
                isInCamera: true,
                cooldownTimeout: null,
                warningInterval: null,
                expiresAt: 0,
            });
        }
    };
    const onCameraUnpossessed = (data) => {
        if (excludedAdmins.includes(data.steamID))
            return;
        const steamID = data.steamID;
        const stateObj = adminStates.get(steamID);
        if (!stateObj)
            return;
        stateObj.isInCamera = false;
        adminStates.set(steamID, stateObj);
        initCooldown(steamID);
    };
    const onSquadChanged = (data) => {
        const steamID = data.steamID;
        if (!steamID ||
            excludedAdmins.includes(steamID) ||
            !knownAdmins.has(steamID))
            return;
        if (!data.squadID) {
            const stateObj = adminStates.get(steamID);
            if (stateObj) {
                if (stateObj.cooldownTimeout)
                    clearTimeout(stateObj.cooldownTimeout);
                if (stateObj.warningInterval)
                    clearInterval(stateObj.warningInterval);
                adminStates.delete(steamID);
            }
            knownAdmins.delete(steamID);
            logger.log(`Админ ${steamID} покинул отряд.`);
            return;
        }
        const stateObj = adminStates.get(steamID);
        if (!stateObj || (!stateObj.cooldownTimeout && !stateObj.isInCamera)) {
            logger.log(`Админ ${steamID} создал новый отряд.`);
            initCooldown(steamID);
        }
    };
    const onNewGame = () => {
        adminStates.forEach((state) => {
            if (state.cooldownTimeout)
                clearTimeout(state.cooldownTimeout);
            if (state.warningInterval)
                clearInterval(state.warningInterval);
        });
        adminStates.clear();
        knownAdmins.clear();
    };
    listener.on(EVENTS.POSSESSED_ADMIN_CAMERA, onCameraPossessed);
    listener.on(EVENTS.UNPOSSESSED_ADMIN_CAMERA, onCameraUnpossessed);
    listener.on(EVENTS.PLAYER_SQUAD_CHANGED, onSquadChanged);
    listener.on(EVENTS.SQUAD_CREATED, onSquadChanged);
    listener.on(EVENTS.NEW_GAME, onNewGame);
};

const explosiveDamaged = (state) => {
    const { listener, execute } = state;
    const grenadeTracker = {};
    const maxCount = 10;
    const maxInterval = 10;
    const destructionDelay = 10000;
    const analyzeExplosiveDamage = (data) => {
        if (!data.playerController || !data.deployable || !data.locations) {
            return;
        }
        const now = Date.now();
        const key = `${data.playerController}_${data.deployable}`;
        const locationKey = `${data.locations}`;
        if (!grenadeTracker[key]) {
            grenadeTracker[key] = {
                count: 0,
                lastTimestamp: now,
                locations: new Set(),
            };
        }
        const tracker = grenadeTracker[key];
        tracker.locations.add(locationKey);
        if (tracker.destructionTimer) {
            clearTimeout(tracker.destructionTimer);
        }
        tracker.destructionTimer = setTimeout(() => {
            delete grenadeTracker[key];
        }, destructionDelay);
        if (now - tracker.lastTimestamp < maxInterval) {
            tracker.count++;
        }
        else {
            tracker.count = 1;
        }
        tracker.lastTimestamp = now;
        if (tracker.count > maxCount && tracker.locations.size === 1) {
            const player = getPlayerByController(state, data.playerController);
            if (!player)
                return;
            adminBan(execute, player.steamID, 'Cheater is neutralized by the DP Anti-cheat (DPAC) system');
        }
    };
    listener.on(EVENTS.EXPLOSIVE_DAMAGED, analyzeExplosiveDamage);
};

const autoKickUnassigned = (state, options) => {
    const { listener, execute, logger } = state;
    const { minPlayersForAfkKick, kickTimeout, warningInterval, gracePeriod } = options;
    const trackedPlayers = {};
    let betweenRounds = false;
    const trackingListUpdateFrequency = 1 * 60 * 1000; // 1min
    const newGame = () => {
        betweenRounds = true;
        updateTrackingList();
        setTimeout(() => {
            betweenRounds = false;
        }, gracePeriod);
    };
    const onPlayerSquadChange = (player) => {
        if (player.steamID in trackedPlayers && player.squadID !== null) {
            untrackPlayer(player.steamID);
        }
    };
    const clearDisconnectedPlayers = (data) => {
        const players = getPlayerByEOSID(state, data.eosID);
        for (const steamID of Object.keys(trackedPlayers)) {
            if ((players === null || players === void 0 ? void 0 : players.steamID) === steamID)
                untrackPlayer(steamID, 'Игрок ливнул');
        }
    };
    const untrackPlayer = (steamID, reason) => {
        const tracker = trackedPlayers[steamID];
        delete trackedPlayers[steamID];
        clearInterval(tracker.warnTimerID);
        clearTimeout(tracker.kickTimerID);
        logger.log(`unTracker: Name: ${tracker.name} Reason: ${reason || 'null'}`);
    };
    const updateTrackingList = () => {
        const admins = getAdmins(state, 'cameraman');
        const players = getPlayers(state);
        if (!players)
            return;
        const run = !(betweenRounds || players.length < minPlayersForAfkKick);
        logger.log(`Update Tracking List? ${run} (Between rounds: ${betweenRounds}, Below player threshold: ${players.length < minPlayersForAfkKick})`);
        if (!run) {
            for (const steamID of Object.keys(trackedPlayers))
                untrackPlayer(steamID, 'Очистка списка');
            return;
        }
        for (const player of players) {
            const { steamID, squadID } = player;
            const isTracked = steamID in trackedPlayers;
            const isUnassigned = squadID === null;
            const isAdmin = admins === null || admins === void 0 ? void 0 : admins.includes(steamID);
            if (!isUnassigned && isTracked)
                untrackPlayer(player.steamID, 'Вступил в отряд');
            if (!isUnassigned)
                continue;
            if (isAdmin)
                logger.log(`Admin is Unassigned: ${player.name}`);
            if (isAdmin)
                continue;
            if (!isTracked)
                trackedPlayers[steamID] = trackPlayer(player);
        }
    };
    const msFormat = (ms) => {
        const min = Math.floor((ms / 1000 / 60) << 0);
        const sec = Math.floor((ms / 1000) % 60);
        const minTxt = ('' + min).padStart(2, '0');
        const secTxt = ('' + sec).padStart(2, '0');
        return `${minTxt}:${secTxt}`;
    };
    const trackPlayer = (player) => {
        const { name, eosID, steamID, teamID, role, isLeader, squadID } = player;
        const tracker = {
            name,
            eosID,
            steamID,
            teamID,
            role,
            isLeader,
            squadID,
            warnings: 0,
            startTime: Date.now(),
        };
        tracker.warnTimerID = setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
            const msLeft = kickTimeout - warningInterval * (tracker.warnings + 1);
            if (msLeft < warningInterval + 1)
                clearInterval(tracker.warnTimerID);
            const timeLeft = msFormat(msLeft);
            adminWarn(execute, steamID, `Вступите в отряд или будете кикнуты через - ${timeLeft}`);
            logger.log(`Warning: ${player.name} (${timeLeft})`);
            tracker.warnings++;
        }), warningInterval);
        tracker.kickTimerID = setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
            updateTrackingList();
            if (!(tracker.steamID in trackedPlayers))
                return;
            adminKick(execute, player.steamID, 'AFK');
            logger.log(`Kicked: ${player.name}`);
            untrackPlayer(tracker.steamID, 'Игрок кикнут');
        }), kickTimeout);
        return tracker;
    };
    setInterval(() => updateTrackingList(), trackingListUpdateFrequency);
    listener.on(EVENTS.NEW_GAME, newGame);
    listener.on(EVENTS.PLAYER_DISCONNECTED, clearDisconnectedPlayers);
    listener.on(EVENTS.PLAYER_SQUAD_CHANGED, onPlayerSquadChange);
};

let db;
const dbName = 'SquadJS';
const dbCollectionMain = 'mainstats';
const dbCollectionTemp = 'tempstats';
const dbCollectionServerInfo = 'serverinfo';
let collectionMain;
let collectionTemp;
let collectionServerInfo;
let isConnected = false;
let reconnectTimer = null;
let dbLink;
let databaseName;
const cleaningTime = 604800000;
function connectToDatabase(dbURL, database) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = new MongoClient(dbURL);
        dbLink = dbURL;
        if (database)
            databaseName = database;
        try {
            yield client.connect();
            db = client.db(database || dbName);
            console.log(db);
            collectionMain = db.collection(dbCollectionMain);
            collectionTemp = db.collection(dbCollectionTemp);
            collectionServerInfo = db.collection(dbCollectionServerInfo);
            isConnected = true;
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        }
        catch (err) {
            console.error('Error connecting to MongoDB:', err);
            isConnected = false;
            setReconnectTimer(dbLink);
        }
    });
}
function writeLastModUpdateDate(modID, date) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const id = {
                _id: modID,
            };
            const data = {
                $set: {
                    lastUpdate: date.toString(),
                },
            };
            yield collectionServerInfo.updateOne(id, data);
        }
        catch (error) { }
    });
}
function getModLastUpdateDate(modID) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const modInfo = yield collectionServerInfo.findOne({
                _id: modID,
            });
            return modInfo === null || modInfo === void 0 ? void 0 : modInfo.lastUpdate;
        }
        catch (error) { }
    });
}
function setReconnectTimer(dbLink) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connectToDatabase(dbLink, databaseName);
            }, 30000);
        }
    });
}
function createUserIfNullableOrUpdateName(steamID, name) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!db || !isConnected)
            return;
        try {
            const resultMain = yield collectionMain.findOne({ _id: steamID });
            const resultTemp = yield collectionTemp.findOne({ _id: steamID });
            const fields = {
                name: name.trim(),
                kills: 0,
                death: 0,
                revives: 0,
                teamkills: 0,
                kd: 0,
                bonuses: 0,
                exp: 0,
                possess: {},
                roles: {},
                squad: { timeplayed: 0, leader: 0, cmd: 0, seed: 0 },
                matches: {
                    matches: 0,
                    winrate: 0,
                    won: 0,
                    lose: 0,
                    cmdwon: 0,
                    cmdlose: 0,
                    cmdwinrate: 0,
                },
                weapons: {},
                seedRole: false,
            };
            if (!resultMain) {
                yield collectionMain.updateOne({ _id: steamID }, { $setOnInsert: fields }, { upsert: true });
            }
            if (!resultTemp) {
                yield collectionTemp.updateOne({ _id: steamID }, { $setOnInsert: fields }, { upsert: true });
            }
            if (resultMain && name.trim() !== resultMain.name.trim()) {
                yield updateUserName(steamID, name.trim());
            }
        }
        catch (err) {
            throw err;
        }
    });
}
function updateUserName(steamID, name) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isConnected)
            return;
        try {
            const doc = {
                $set: {
                    name,
                },
            };
            const user = {
                _id: steamID,
            };
            yield collectionMain.updateOne(user, doc);
            yield collectionTemp.updateOne(user, doc);
        }
        catch (err) {
            throw err;
        }
    });
}
function updateUserBonuses(steamID, count, id) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isConnected)
            return;
        const userInfo = yield collectionMain.findOne({
            _id: steamID,
        });
        const serverInfo = yield collectionServerInfo.findOne({ _id: id.toString() });
        if (userInfo && userInfo.seedRole && serverInfo && serverInfo.seeding)
            count = 5;
        try {
            const doc = {
                $inc: {
                    bonuses: count,
                },
            };
            const user = {
                _id: steamID,
            };
            yield collectionMain.updateOne(user, doc);
        }
        catch (err) {
            throw err;
        }
    });
}
function updateRoles(steamID, role) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isConnected)
            return;
        const roles = [
            '_sl_',
            '_slcrewman',
            '_slpilot',
            '_pilot',
            '_medic',
            '_crewman',
            '_unarmed',
            '_ar',
            '_rifleman',
            '_marksman',
            '_lat',
            '_grenadier',
            '_hat',
            '_machinegunner',
            '_sniper',
            '_infiltrator',
            '_raider',
            '_ambusher',
            '_engineer',
            '_sapper',
            '_saboteur',
        ];
        const engineer = ['_sapper', '_saboteur'];
        roles.forEach((e) => {
            if (role.toLowerCase().includes(e)) {
                if (engineer.some((el) => role.toLowerCase().includes(el))) {
                    role = '_engineer';
                    return;
                }
                role = e;
            }
        });
        const rolesFilter = `roles.${role}`;
        const doc = {
            $inc: {
                [rolesFilter]: 1,
            },
        };
        const user = {
            _id: steamID,
        };
        yield collectionMain.updateOne(user, doc);
    });
}
function updateTimes(steamID, field, name) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isConnected)
            return;
        const squadFilter = `squad.${field}`;
        const doc = {
            $inc: {
                [squadFilter]: 1,
            },
        };
        const user = {
            _id: steamID,
        };
        yield collectionMain.updateOne(user, doc);
        yield updateCollectionTemp(user, doc, name);
    });
}
function updatePossess(steamID, field) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isConnected)
            return;
        if (field.toLowerCase().includes('soldier'))
            return;
        const possessFilter = `possess.${field}`;
        const doc = {
            $inc: {
                [possessFilter]: 1,
            },
        };
        const user = {
            _id: steamID,
        };
        yield collectionMain.updateOne(user, doc);
    });
}
function getUserDataWithSteamID(steamID) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isConnected)
            return;
        const result = yield collectionMain.findOne({
            _id: steamID,
        });
        if (!result)
            return;
        return result;
    });
}
function updateUser(steamID, field, weapon) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!steamID || !field || !isConnected)
            return;
        const doc = {
            $inc: {
                [field]: 1,
            },
        };
        const user = {
            _id: steamID,
        };
        yield collectionMain.updateOne(user, doc);
        yield collectionTemp.updateOne(user, doc);
        if (field === 'kills' && weapon !== 'null') {
            const weaponFilter = `weapons.${weapon}`;
            const doc = {
                $inc: {
                    [weaponFilter]: 1,
                },
            };
            const user = {
                _id: steamID,
            };
            yield collectionMain.updateOne(user, doc);
            yield collectionTemp.updateOne(user, doc);
        }
        if (field === 'kills' || field === 'death') {
            const resultMain = yield collectionMain.findOne({
                _id: steamID,
            });
            const resultTemp = yield collectionTemp.findOne({
                _id: steamID,
            });
            if (resultMain) {
                let kd;
                if (resultMain.death && isFinite(resultMain.kills / resultMain.death)) {
                    kd = Number((resultMain.kills / resultMain.death).toFixed(2));
                }
                else {
                    kd = resultMain.kills;
                }
                const doc = {
                    $set: {
                        kd: kd,
                    },
                };
                yield collectionMain.updateOne(user, doc);
            }
            if (resultTemp) {
                let kd;
                if (resultTemp.death && isFinite(resultTemp.kills / resultTemp.death)) {
                    kd = Number((resultTemp.kills / resultTemp.death).toFixed(2));
                }
                else {
                    kd = resultTemp.kills;
                }
                const doc = {
                    $set: {
                        kd: kd,
                    },
                };
                yield collectionTemp.updateOne(user, doc);
            }
        }
    });
}
function updateGames(steamID, field) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isConnected)
            return;
        const matchesFilter = `matches.${field}`;
        const doc = {
            $inc: {
                [matchesFilter]: 1,
            },
        };
        const user = {
            _id: steamID,
        };
        try {
            yield collectionMain.updateOne(user, doc);
            yield collectionTemp.updateOne(user, doc);
            if (['won', 'lose', 'cmdwon', 'cmdlose'].includes(field)) {
                yield updateWinrate(user, field);
            }
        }
        catch (error) {
            console.error(`Ошибка при обновлении игр для пользователя ${steamID}:`, error);
        }
    });
}
function updateWinrate(user, field) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const isCmd = field.includes('cmd');
            const fieldPrefix = isCmd ? 'cmd' : '';
            const resultMain = yield collectionMain.findOne(user);
            const resultTemp = yield collectionTemp.findOne(user);
            const matchesMain = ((resultMain === null || resultMain === void 0 ? void 0 : resultMain.matches[`${fieldPrefix}won`]) || 0) +
                ((resultMain === null || resultMain === void 0 ? void 0 : resultMain.matches[`${fieldPrefix}lose`]) || 0);
            const matchesTemp = ((resultTemp === null || resultTemp === void 0 ? void 0 : resultTemp.matches[`${fieldPrefix}won`]) || 0) +
                ((resultTemp === null || resultTemp === void 0 ? void 0 : resultTemp.matches[`${fieldPrefix}lose`]) || 0);
            if (resultMain) {
                const winrateMain = matchesMain > 0
                    ? Number(((resultMain.matches[`${fieldPrefix}won`] / matchesMain) *
                        100).toFixed(3))
                    : 0;
                const docMain = {
                    $set: {
                        [`matches.${fieldPrefix}matches`]: matchesMain,
                        [`matches.${fieldPrefix}winrate`]: winrateMain,
                    },
                };
                yield collectionMain.updateOne(user, docMain);
            }
            if (resultTemp) {
                const winrateTemp = matchesTemp > 0
                    ? Number(((resultTemp.matches[`${fieldPrefix}won`] / matchesTemp) *
                        100).toFixed(3))
                    : 0;
                const docTemp = {
                    $set: {
                        [`matches.${fieldPrefix}matches`]: matchesTemp,
                        [`matches.${fieldPrefix}winrate`]: winrateTemp,
                    },
                };
                yield collectionTemp.updateOne(user, docTemp);
            }
        }
        catch (error) {
            console.error(`Ошибка при обновлении коэффициента побед для пользователя ${user._id}:`, error);
        }
    });
}
function serverHistoryLayers(serverID, rnsHistoryLayers) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!rnsHistoryLayers || !isConnected)
            return;
        const server = yield collectionServerInfo.findOne({
            _id: serverID.toString(),
        });
        if (!server)
            return;
        const data = {
            $push: {
                rnsHistoryLayers,
            },
        };
        yield collectionServerInfo.updateOne(server, data);
    });
}
function getHistoryLayers(serverID) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isConnected)
            return [];
        const result = yield collectionServerInfo.findOne({
            _id: serverID.toString(),
        });
        return (result === null || result === void 0 ? void 0 : result.rnsHistoryLayers) || [];
    });
}
function cleanHistoryLayers(serverID) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isConnected)
            return;
        yield collectionServerInfo.updateOne({ _id: serverID.toString() }, { $pop: { rnsHistoryLayers: -1 } });
    });
}
function serverHistoryFactions(serverID, faction) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!faction || !isConnected)
            return;
        const server = yield collectionServerInfo.findOne({
            _id: serverID.toString(),
        });
        if (!server)
            return;
        const data = {
            $push: {
                rnsHistoryFactions: faction,
            },
        };
        yield collectionServerInfo.updateOne({ _id: serverID.toString() }, data);
    });
}
function getHistoryFactions(serverID) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isConnected)
            return [];
        const result = yield collectionServerInfo.findOne({
            _id: serverID.toString(),
        });
        return (result === null || result === void 0 ? void 0 : result.rnsHistoryFactions) || [];
    });
}
function cleanHistoryFactions(serverID) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isConnected)
            return;
        yield collectionServerInfo.updateOne({ _id: serverID.toString() }, { $pop: { rnsHistoryFactions: -1 } });
    });
}
function serverHistoryUnitTypes(serverID, unitType) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!unitType || !isConnected)
            return;
        const server = yield collectionServerInfo.findOne({
            _id: serverID.toString(),
        });
        if (!server)
            return;
        const data = {
            $push: {
                rnsHistoryUnitTypes: unitType,
            },
        };
        yield collectionServerInfo.updateOne({ _id: serverID.toString() }, data);
    });
}
function getHistoryUnitTypes(serverID) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isConnected)
            return [];
        const result = yield collectionServerInfo.findOne({
            _id: serverID.toString(),
        });
        return (result === null || result === void 0 ? void 0 : result.rnsHistoryUnitTypes) || [];
    });
}
function cleanHistoryUnitTypes(serverID) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isConnected)
            return;
        yield collectionServerInfo.updateOne({ _id: serverID.toString() }, { $pop: { rnsHistoryUnitTypes: -1 } });
    });
}
function getTimeStampForRestartServer(serverID) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isConnected)
            return;
        const server = yield collectionServerInfo.findOne({
            _id: serverID.toString(),
        });
        return server === null || server === void 0 ? void 0 : server.timeStampToRestart;
    });
}
function createTimeStampForRestartServer(serverID) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isConnected)
            return;
        const date = new Date().getTime();
        const id = {
            _id: serverID.toString(),
        };
        const data = {
            $set: {
                timeStampToRestart: date,
            },
        };
        yield collectionServerInfo.updateOne(id, data);
    });
}
function updateCollectionTemp(user, doc, name) {
    return __awaiter(this, void 0, void 0, function* () {
        const tempStats = yield collectionTemp.updateOne(user, doc);
        if (tempStats.modifiedCount !== 1) {
            yield createUserIfNullableOrUpdateName(user._id, name);
            yield collectionTemp.updateOne(user, doc);
        }
    });
}
function creatingTimeStamp() {
    return __awaiter(this, void 0, void 0, function* () {
        const date = new Date().getTime();
        const userTemp = {
            _id: 'dateTemp',
        };
        const dateTemp = {
            $set: {
                date,
            },
        };
        const timeTemp = yield collectionMain.findOne({
            _id: 'dateTemp',
        });
        if (!timeTemp || !timeTemp.date)
            return;
        const checkOutOfDate = date - timeTemp.date;
        if (checkOutOfDate > cleaningTime) {
            console.log('Статистика очищена');
            yield collectionTemp.deleteMany({});
            yield collectionMain.updateOne(userTemp, dateTemp);
        }
    });
}

const autorestartServers = (state) => {
    const { listener, execute, logger, id } = state;
    let restartTimeout;
    let isRestartTimeoutSet = false;
    const setRestartTimeout = () => {
        restartTimeout = setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
            logger.log('Рестарт сервера...');
            yield createTimeStampForRestartServer(id);
            yield adminKillServer(execute);
            isRestartTimeoutSet = false;
        }), 300000);
        isRestartTimeoutSet = true;
    };
    const clearRestartTimeout = () => {
        clearTimeout(restartTimeout);
        isRestartTimeoutSet = false;
    };
    const autorestart = () => __awaiter(void 0, void 0, void 0, function* () {
        const lastRestartTime = yield getTimeStampForRestartServer(id);
        if (!lastRestartTime)
            return;
        if (new Date().getTime() - lastRestartTime > 86400000) {
            const players = getPlayers(state);
            if (Array.isArray(players) && players.length === 0) {
                console.log(players);
                logger.log(`Сервер пуст. Планируется рестарт`);
                if (!isRestartTimeoutSet)
                    setRestartTimeout();
            }
            else {
                if (isRestartTimeoutSet)
                    clearRestartTimeout();
            }
        }
    });
    listener.on(EVENTS.UPDATED_PLAYERS, autorestart);
};

const autoUpdateMods = (state, options) => __awaiter(void 0, void 0, void 0, function* () {
    const { listener, execute, logger } = state;
    const { modID, steamAPIkey, text, dockerName, intervalBroadcast, textForceUpdate, checkUpdateInterval, } = options;
    let newUpdate = false;
    let currentVersion = null;
    let updateMessage;
    let intervalMessage;
    listener.on(EVENTS.ROUND_ENDED, endMatch);
    setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
        currentVersion = yield getWorkshopItemDetails();
        if (currentVersion) {
            const lastSavedUpdate = yield getLastSavedUpdate(modID);
            if (!lastSavedUpdate || currentVersion > lastSavedUpdate) {
                const players = getPlayers(state);
                logger.log('Доступно новое обновление:', currentVersion.toLocaleString());
                if (players && players.length < 50) {
                    newUpdate = true;
                    scheduleUpdate();
                    return;
                }
                newUpdate = true;
                updateMessage = setInterval(() => {
                    adminBroadcast(execute, text);
                }, Number(intervalBroadcast));
            }
        }
    }), checkUpdateInterval);
    function endMatch() {
        return __awaiter(this, void 0, void 0, function* () {
            if (newUpdate && currentVersion) {
                yield performUpdate();
            }
        });
    }
    function getWorkshopItemDetails() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield axios.post('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', `key=${steamAPIkey}&itemcount=1&publishedfileids[0]=${modID}`, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                });
                const itemDetails = response.data.response.publishedfiledetails[0];
                return new Date(itemDetails.time_updated * 1000);
            }
            catch (error) {
                logger.error(`Ошибка при получении деталей воркшопа: ${error}`);
                return null;
            }
        });
    }
    function getLastSavedUpdate(modID) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const savedTime = yield getModLastUpdateDate(modID);
                return savedTime ? new Date(savedTime) : null;
            }
            catch (error) {
                logger.error(`Ошибка при чтении времени последнего обновления: ${error}`);
                return null;
            }
        });
    }
    function saveLastUpdate(currentVersion) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield writeLastModUpdateDate(modID, currentVersion);
            }
            catch (error) {
                logger.error(`Ошибка при сохранении времени последнего обновления: ${error}`);
            }
        });
    }
    function stopService() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                logger.log('Попытка остановить сервис:', dockerName);
                const child = spawn('/usr/bin/docker', ['compose', 'down', dockerName], {
                    cwd: '/root/servers',
                });
                child.on('exit', (code) => __awaiter(this, void 0, void 0, function* () {
                    if (code === 0) {
                        logger.log(`Сервис ${dockerName} успешно остановлен.`);
                        yield startService();
                    }
                    else {
                        logger.error(`Ошибка при остановке сервиса ${dockerName}, код выхода: ${code}`);
                    }
                }));
                child.on('error', (error) => {
                    logger.error(`Ошибка при остановке сервиса ${dockerName}: ${error}`);
                });
            }
            catch (error) {
                logger.error(`Ошибка при остановке сервиса: ${error}`);
            }
        });
    }
    function startService() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                logger.log('Попытка запустить сервис:', dockerName);
                const child = spawn('/usr/bin/docker', ['compose', 'up', '-d', dockerName], {
                    cwd: '/root/servers',
                });
                child.on('exit', (code) => {
                    if (code === 0) {
                        logger.log(`Сервис ${dockerName} успешно запущен.`);
                        logger.log('Мод обновлен...');
                    }
                    else {
                        logger.error(`Ошибка при запуске сервиса ${dockerName}, код выхода: ${code}`);
                    }
                });
                child.on('error', (error) => {
                    logger.error(`Ошибка при запуске сервиса ${dockerName}: ${error}`);
                });
            }
            catch (error) {
                logger.error(`Ошибка при запуске сервиса: ${error}`);
            }
        });
    }
    function performUpdate() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.log('Обновление мода...');
            try {
                yield stopService();
                if (currentVersion) {
                    yield saveLastUpdate(currentVersion);
                }
                clearInterval(updateMessage);
                newUpdate = false;
            }
            catch (error) {
                logger.error(`Ошибка при обновлении мода:' ${error}`);
            }
        });
    }
    function scheduleUpdate() {
        intervalMessage = setInterval(() => {
            adminBroadcast(execute, textForceUpdate);
        }, 10000);
        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            clearInterval(intervalMessage);
            if (newUpdate && currentVersion) {
                yield performUpdate();
            }
        }), 60000);
    }
});

const bonuses = (state, options) => {
    const { listener } = state;
    const { classicBonus, seedBonus } = options;
    let playersBonusesCurrentTime = [];
    const playerConnected = (data) => __awaiter(void 0, void 0, void 0, function* () {
        const user = getPlayerByEOSID(state, data.eosID);
        if (!user)
            return;
        const { steamID, name } = user;
        yield createUserIfNullableOrUpdateName(steamID, name);
    });
    const updatedPlayers = () => {
        const { players, currentMap, id } = state;
        if (!players)
            return;
        players.forEach((e) => {
            const { steamID } = e;
            if (!steamID)
                return;
            const user = getPlayerBySteamID(state, steamID);
            if (!user)
                return;
            if (playersBonusesCurrentTime.find((e) => e.steamID === steamID))
                return;
            playersBonusesCurrentTime.push({
                steamID,
                timer: setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
                    var _a;
                    if ((_a = currentMap === null || currentMap === void 0 ? void 0 : currentMap.layer) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('seed')) {
                        yield updateUserBonuses(steamID, seedBonus, id);
                        yield updateTimes(steamID, 'seed', user.name);
                    }
                    else {
                        yield updateUserBonuses(steamID, classicBonus, id);
                    }
                }), 60000),
            });
        });
        playersBonusesCurrentTime = playersBonusesCurrentTime.filter((e) => {
            const currentUser = players.find((c) => c.steamID === e.steamID);
            if (!currentUser) {
                clearInterval(e.timer);
                return false;
            }
            return e;
        });
    };
    listener.on(EVENTS.PLAYER_CONNECTED, playerConnected);
    listener.on(EVENTS.UPDATED_PLAYERS, updatedPlayers);
};

const broadcast = (state, options) => {
    const { execute } = state;
    const { texts, interval } = options;
    let index = 0;
    function printText() {
        if (index < texts.length) {
            const text = texts[index];
            adminBroadcast(execute, text);
            index++;
        }
        else {
            index = 0;
        }
    }
    setInterval(printText, parseInt(interval));
};

const chatCommands = (state, options) => {
    const { listener, execute } = state;
    const { adminsEnable, reportEnable, stvolEnable, fixEnable, discordEnable, statsEnable, bonusEnable, rollEnable, swapEnable, swapTimeout, statsTimeout, stvolTimeout, rollTimeout, adminsMessage, reportMessage, stvolTimeOutMessage, discordMessage, statsTimeOutMessage, statsPlayerNotFoundMessage, bonusWarnMessage, swapOnlyForVip, } = options;
    let players = [];
    let timeoutPlayers = [];
    const swapHistory = [];
    const sendWarningMessages = (steamID, messages) => {
        for (const message of messages) {
            adminWarn(execute, steamID, message);
        }
    };
    const admins = (data) => {
        if (!adminsEnable)
            return;
        const { steamID } = data;
        sendWarningMessages(steamID, adminsMessage);
    };
    const report = (data) => {
        if (!reportEnable)
            return;
        sendWarningMessages(data.steamID, reportMessage);
    };
    const stvol = (data) => {
        if (!stvolEnable)
            return;
        const { name, steamID } = data;
        if (players.find((player) => player === steamID)) {
            sendWarningMessages(steamID, stvolTimeOutMessage);
            return;
        }
        const range = Math.floor(Math.random() * 31 + 1);
        adminBroadcast(execute, `У ${name} ствол ${range}см`);
        players.push(steamID);
        setTimeout(() => {
            players = players.filter((player) => player !== steamID);
        }, parseInt(stvolTimeout));
    };
    const roll = (data) => {
        if (!rollEnable)
            return;
        const { name, steamID } = data;
        if (players.find((player) => player === steamID)) {
            sendWarningMessages(steamID, stvolTimeOutMessage);
            return;
        }
        const range = Math.floor(Math.random() * 99 + 1);
        adminBroadcast(execute, `${name} заролил ${range}`);
        players.push(steamID);
        setTimeout(() => {
            players = players.filter((player) => player !== steamID);
        }, parseInt(rollTimeout));
    };
    const fix = (data) => {
        if (!fixEnable)
            return;
        adminForceTeamChange(execute, data.steamID);
        adminForceTeamChange(execute, data.steamID);
    };
    const discord = (data) => {
        if (!discordEnable)
            return;
        const { steamID } = data;
        sendWarningMessages(steamID, discordMessage);
    };
    const stats = (data) => __awaiter(void 0, void 0, void 0, function* () {
        if (!statsEnable)
            return;
        const { steamID, message } = data;
        let user;
        if (timeoutPlayers.find((p) => p === steamID)) {
            sendWarningMessages(steamID, statsTimeOutMessage);
            return;
        }
        if (message.length === 0) {
            user = yield getUserDataWithSteamID(steamID);
        }
        else {
            const players = getPlayers(state);
            const getPlayer = players === null || players === void 0 ? void 0 : players.find((p) => p.name.trim().toLowerCase().includes(message.trim().toLowerCase()));
            if (!getPlayer) {
                sendWarningMessages(steamID, statsPlayerNotFoundMessage);
            }
            else {
                user = yield getUserDataWithSteamID(getPlayer.steamID);
            }
        }
        if (!user)
            return;
        const { name, kills, death, revives, teamkills, kd } = user;
        adminWarn(execute, steamID, `Игрок: ${name}\nУбийств: ${kills}\nСмертей: ${death}\nПомощь: ${revives}\nТимкилы: ${teamkills}\nK/D: ${kd}
       `);
        timeoutPlayers.push(steamID);
        setTimeout(() => {
            timeoutPlayers = timeoutPlayers.filter((p) => p !== steamID);
        }, parseInt(statsTimeout));
    });
    const bonus = (data) => __awaiter(void 0, void 0, void 0, function* () {
        if (!bonusEnable)
            return;
        const { steamID } = data;
        const user = yield getUserDataWithSteamID(steamID);
        if (!user)
            return;
        const bonus = user.bonuses;
        adminWarn(execute, steamID, `У вас бонусов ${bonus || 0}`);
        sendWarningMessages(steamID, bonusWarnMessage);
    });
    const swap = (data) => __awaiter(void 0, void 0, void 0, function* () {
        if (!swapEnable)
            return;
        const { steamID } = data;
        const admins = getAdmins(state, 'reserved');
        if (swapOnlyForVip && !(admins === null || admins === void 0 ? void 0 : admins.includes(steamID))) {
            adminWarn(execute, steamID, 'Команда доступна только Vip пользователям');
            return;
        }
        const deletionTime = parseInt(swapTimeout);
        const existingEntry = swapHistory.find((entry) => entry.steamID === steamID);
        if (existingEntry) {
            const remainingTime = deletionTime - (Date.now() - existingEntry.startTime);
            const remainingHours = Math.floor(remainingTime / (1000 * 60 * 60));
            const remainingMinutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
            adminWarn(execute, steamID, `Команда доступна через ${remainingHours} ч ${remainingMinutes} мин!`);
            return;
        }
        adminForceTeamChange(execute, steamID);
        const deletionTimer = setTimeout(() => removeSteamID(steamID), deletionTime);
        swapHistory.push({
            steamID: steamID,
            deletionTimer: deletionTimer,
            startTime: Date.now(),
        });
    });
    function removeSteamID(steamID) {
        const index = swapHistory.findIndex((entry) => entry.steamID === steamID);
        if (index !== -1) {
            clearTimeout(swapHistory[index].deletionTimer);
            swapHistory.splice(index, 1);
        }
    }
    listener.on(EVENTS.CHAT_COMMAND_ADMINS, admins);
    listener.on(EVENTS.CHAT_COMMAND_REPORT, report);
    listener.on(EVENTS.CHAT_COMMAND_R, report);
    listener.on(EVENTS.CHAT_COMMAND_STVOL, stvol);
    listener.on(EVENTS.CHAT_COMMAND_ROLL, roll);
    listener.on(EVENTS.CHAT_COMMAND_FIX, fix);
    listener.on(EVENTS.CHAT_COMMAND_BONUS, bonus);
    listener.on(EVENTS.CHAT_COMMAND_STATS, stats);
    listener.on(EVENTS.CHAT_COMMAND_DISCORD, discord);
    listener.on(EVENTS.CHAT_COMMAND_SWITCH, swap);
    listener.on(EVENTS.CHAT_COMMAND_SWAP, swap);
    listener.on(EVENTS.CHAT_COMMAND_SW, swap);
};

const fobExplosionDamage = (state) => {
    const { listener, execute } = state;
    const deployableDamaged = (data) => {
        const { weapon, deployable, name } = data;
        if (!data.deployable.match(/(?:FOBRadio|Hab)_/i))
            return;
        if (!data.weapon.match(/_Deployable_/i))
            return;
        const player = getPlayerByName(state, name);
        if (!player)
            return;
        const teamsFob = [
            ['SZ1', 'Russian Ground Forces', 'BP_FOBRadio_RUS'],
            ['600g', 'Insurgent Forces', 'BP_FobRadio_INS'],
            ['SZ1', 'Middle Eastern Alliance', 'BP_FOBRadio_MEA'],
            ['M112', 'Canadian Army', 'BP_FOBRadio_Woodland'],
            ['CompB', 'Australian Defence Force', 'BP_FOBRadio_Woodland'],
            ['1lb', 'Irregular Militia Forces', 'BP_FOBRadio_MIL'],
            ['M112', 'British Army', 'BP_FOBRadio_Woodland'],
            ['M112', 'United States Marine Corps', 'BP_FOBRadio_Woodland'],
            ['IED', 'Insurgent Forces', 'BP_FobRadio_INS'],
            ['IED', 'Irregular Militia Forces', 'BP_FOBRadio_MIL'],
            ['PLA', "People's Liberation Army", 'BP_FOBRadio_PLA'],
            ['M112', 'United States Army', 'BP_FOBRadio_Woodland'],
        ];
        teamsFob.forEach((e) => {
            if (weapon.includes(e[0]) && deployable.includes(e[2])) {
                adminKick(execute, player.steamID, 'Урон союзной FOB');
            }
        });
    };
    listener.on(EVENTS.DEPLOYABLE_DAMAGED, deployableDamaged);
};

function isKnifeWeapon(weapon, knifeWeapons) {
    const weaponLower = weapon.toLowerCase();
    return knifeWeapons.some((knife) => weaponLower.includes(knife.toLowerCase()));
}
function randomArrayElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}
const knifeBroadcast = (state) => {
    const { listener, logger, execute } = state;
    const knifeWeapons = [
        'SOCP',
        'AK74Bayonet',
        'M9Bayonet',
        'G3Bayonet',
        'Bayonet2000',
        'AKMBayonet',
        'SA80Bayonet',
        'QNL-95',
        'OKC-3S',
    ];
    const messageTemplates = [
        '{attacker} безжалостно почикал {victim} ножом!',
        '{attacker} мгновенно отправил {victim} в мир иной ножевым ударом!',
        '{attacker} показал истинное мастерство ножевого боя, зарезав {victim}!',
        '{attacker} зарезал {victim}, свежий кабанчик!',
    ];
    const onPlayerWounded = ({ weapon, victimName, attackerSteamID, }) => {
        if (!weapon)
            return;
        const attacker = getPlayerBySteamID(state, attackerSteamID);
        if (!attacker || !attacker.name)
            return;
        if (isKnifeWeapon(weapon, knifeWeapons)) {
            const template = randomArrayElement(messageTemplates);
            const message = template
                .replace('{attacker}', attacker.name)
                .replace('{victim}', victimName);
            adminBroadcast(execute, message);
        }
    };
    listener.on(EVENTS.PLAYER_WOUNDED, onPlayerWounded);
};

const levelSync = (state, options) => {
    const { listener, logger } = state;
    const { jsonDir, cfgPath } = options;
    const rankLevels = [
        1, 10, 20, 30, 45, 65, 90, 120, 155, 195, 240, 290, 345, 375, 405, 430, 450,
        470, 490, 500,
    ];
    const imageUrls = [
        '/URLA:https://i.imgur.com/Bri5zX2.png+',
        '/URLA:https://i.imgur.com/cc1ULj6.png+',
        '/URLA:https://i.imgur.com/lY0jxMx.png+',
        '/URLA:https://i.imgur.com/CpoHRB4.png+',
        '/URLA:https://i.imgur.com/M9jVSQl.png+',
        '/URLA:https://i.imgur.com/w74DlMw.png+',
        '/URLA:https://i.imgur.com/UKeURAr.png+',
        '/URLA:https://i.imgur.com/eGUZvsr.png+',
        '/URLA:https://i.imgur.com/35scjC4.png+',
        '/URLA:https://i.imgur.com/D2OquwG.png+',
        '/URLA:https://i.imgur.com/epFdoUs.png+',
        '/URLA:https://i.imgur.com/JcYW3PL.png+',
        '/URLA:https://i.imgur.com/4XSrPYe.png+',
        '/URLA:https://i.imgur.com/jrxBfyg.png+',
        '/URLA:https://i.imgur.com/DjBIzpt.png+',
        '/URLA:https://i.imgur.com/ZrRel2Y.png+',
        '/URLA:https://i.imgur.com/nACqeiU.png+',
        '/URLA:https://i.imgur.com/HMFiPng.png+',
        '/URLA:https://i.imgur.com/8Fenp63.png+',
        '/URLA:https://i.imgur.com/TkVqmrN.png+',
    ];
    const getRankImageByTotalXP = (totalXP) => {
        const levelFromTotalXP = Math.floor((Math.sqrt((4 * totalXP) / 75 + 1) + 1) / 2);
        for (let i = rankLevels.length - 1; i >= 0; i--) {
            if (levelFromTotalXP >= rankLevels[i]) {
                return imageUrls[i];
            }
        }
        return imageUrls[0];
    };
    const updatePlayerLevel = (steamID, eosID) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        try {
            const jsonPath = path.join(jsonDir, `${steamID}.json`);
            const jsonRaw = yield fs.readFile(jsonPath, 'utf-8');
            const json = JSON.parse(jsonRaw);
            const xp = (_b = (_a = json === null || json === void 0 ? void 0 : json['save data']) === null || _a === void 0 ? void 0 : _a.xp) !== null && _b !== void 0 ? _b : 0;
            const totalXP = (_d = (_c = json === null || json === void 0 ? void 0 : json['save data']) === null || _c === void 0 ? void 0 : _c['total xp']) !== null && _d !== void 0 ? _d : xp;
            const level = Math.floor((Math.sqrt((4 * xp) / 75 + 1) + 1) / 2);
            const imageParam = getRankImageByTotalXP(totalXP);
            let cfgContent = '';
            try {
                cfgContent = yield fs.readFile(cfgPath, 'utf-8');
            }
            catch (e) {
                if (e.code !== 'ENOENT')
                    throw e;
            }
            const lines = cfgContent.split('\n');
            const eosRegex = new RegExp(`^${eosID}:`);
            let found = false;
            const newLines = lines.map((line) => {
                if (!eosRegex.exec(line))
                    return line;
                found = true;
                let newLine = line;
                const lvlReplaced = newLine.replace(/LVL\s*\d+/i, `LVL ${level}`);
                newLine =
                    lvlReplaced === newLine
                        ? newLine.replace(`${eosID}:`, `${eosID}: LVL ${level}`)
                        : lvlReplaced;
                const xpReplaced = newLine.replace(/XP:\s*\d+/i, `XP: ${xp}`);
                newLine =
                    xpReplaced === newLine ? `${newLine} // XP: ${xp}` : xpReplaced;
                const urlraRegex = /\/URLA:[^\s,"]+[\+]?/i;
                const paramRegex = /\/a(?!\w)/i;
                if (urlraRegex.exec(newLine)) {
                    newLine = newLine.replace(urlraRegex, imageParam);
                }
                else if (paramRegex.exec(newLine)) {
                    newLine = newLine.replace(paramRegex, `/a ${imageParam}`);
                }
                else {
                    newLine = newLine.replace(/LVL\s*\d+/i, `LVL ${level} /a ${imageParam}`);
                }
                return newLine;
            });
            if (!found) {
                const newLine = `${eosID}: "LVL ${level}"/a ${imageParam}, "255,215,0,255" // XP: ${xp}`;
                newLines.push(newLine);
            }
            yield fs.writeFile(cfgPath, newLines.join('\n') + '\n', 'utf-8');
        }
        catch (err) {
            logger.warn(`[levelSync] Не удалось обновить уровень для ${steamID}`);
        }
    });
    const onPlayerConnected = (data) => __awaiter(void 0, void 0, void 0, function* () {
        const { steamID, eosID } = data;
        if (!steamID || !eosID)
            return;
        yield updatePlayerLevel(steamID, eosID);
    });
    const onRoundEnded = () => __awaiter(void 0, void 0, void 0, function* () {
        const { players } = state;
        if (!players)
            return;
        yield Promise.all(players.map((player) => __awaiter(void 0, void 0, void 0, function* () {
            const { steamID } = player;
            if (!steamID)
                return;
            const user = getPlayerBySteamID(state, steamID);
            if (!(user === null || user === void 0 ? void 0 : user.eosID))
                return;
            yield updatePlayerLevel(steamID, user.eosID);
        })));
    });
    listener.on(EVENTS.PLAYER_CONNECTED, onPlayerConnected);
    listener.on(EVENTS.ROUND_ENDED, onRoundEnded);
};

const tieredMaps = {
    S: {
        probability: 50,
        maps: [
            'Narva',
            'Yehorivka',
            'Gorodok',
            'Manicouagan',
            'Harju',
            'Mutaha',
            'Fallujah',
        ],
    },
    A: {
        probability: 30,
        maps: ['AlBasrah', 'Belaya', 'Chora', 'GooseBay', 'Tallil', 'BlackCoast'],
    },
    B: {
        probability: 15,
        maps: ['Sumari', 'Kokan', 'Sanxian', 'Kohat', 'Kamdesh', 'Anvil'],
    },
    C: {
        probability: 5,
        maps: ['Lashkar', 'Mestia', 'Skorpo', 'FoolsRoad', 'Logar'],
    },
};
const tieredFactions = {
    S: {
        probability: 50,
        factions: ['RGF', 'USA', 'USMC', 'WPMC', 'CAF', 'ADF'],
    },
    A: {
        probability: 35,
        factions: ['INS', 'BAF', 'IMF'],
    },
    B: {
        probability: 10,
        factions: ['TLF', 'VDV', 'MEA', 'PLA'],
    },
    C: {
        probability: 5,
        factions: ['PLAAGF', 'PLANMC'],
    },
};
const tieredSubfactions = {
    S: {
        probability: 50,
        subfactions: ['CombinedArms', 'Support', 'LightInfantry', 'Motorized'],
    },
    A: {
        probability: 30,
        subfactions: [],
    },
    B: {
        probability: 20,
        subfactions: ['Armored', 'Mechanized', 'AirAssault', 'AmphibiousAssault'],
    },
    C: {
        probability: 0,
        subfactions: [],
    },
};
const randomizerMaps = (state, options) => {
    const { id, listener, logger, maps, execute } = state;
    const { mode, symmetricUnitTypes, excludeCountLayers, excludeCountFactions, excludeCountUnitTypes, } = options;
    const excludeCountLayersNumber = Number(excludeCountLayers);
    const excludeCountFactionsNumber = Number(excludeCountFactions);
    const excludeCountUnitTypesNumber = Number(excludeCountUnitTypes);
    const symmetricUnitTypesBoolean = Boolean(symmetricUnitTypes) === true;
    function weightedRandom(items) {
        const totalWeight = items.reduce((sum, cur) => sum + cur.weight, 0);
        if (totalWeight === 0)
            return null;
        let rnd = Math.random() * totalWeight;
        for (const { item, weight } of items) {
            rnd -= weight;
            if (rnd <= 0)
                return item;
        }
        return null;
    }
    function getFactionTier(faction) {
        const tiers = Object.entries(tieredFactions);
        for (const [tierKey, tier] of tiers) {
            if (tier.factions.includes(faction))
                return tierKey;
        }
        return null;
    }
    function randomArrayElement(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
    function getAvailableFactions(teamObj) {
        return Object.values(teamObj).flatMap((alliance) => Object.keys(alliance));
    }
    function pickRandomFaction(available) {
        const weightedFactions = available
            .map((faction) => {
            const tier = getFactionTier(faction);
            const weight = tier ? tieredFactions[tier].probability : 0;
            return { item: faction, weight };
        })
            .filter((obj) => obj.weight > 0);
        const chosen = weightedRandom(weightedFactions);
        logger.log(`DEBUG: [pickRandomFaction] Из доступных фракций [${available.join(', ')}] выбрана: ${chosen}`);
        return chosen;
    }
    function getAllianceForFactionFromMap(teamObj, faction) {
        for (const [alliance, factions] of Object.entries(teamObj)) {
            if (factions.hasOwnProperty(faction))
                return alliance;
        }
        logger.log(`DEBUG: [getAllianceForFactionFromMap] Фракция "${faction}" не найдена ни в одном альянсе.`);
        return null;
    }
    function pickTwoDistinctFactions(teamObj, factionHistory) {
        let availableFactions = getAvailableFactions(teamObj).filter((f) => !factionHistory.includes(f));
        const faction1 = pickRandomFaction(availableFactions);
        if (!faction1)
            return null;
        const alliance1 = getAllianceForFactionFromMap(teamObj, faction1);
        if (!alliance1)
            return null;
        let availableFactions2 = availableFactions.filter((f) => {
            const alliance = getAllianceForFactionFromMap(teamObj, f);
            return alliance && alliance !== alliance1;
        });
        if (availableFactions2.length === 0) {
            logger.log(`DEBUG: [pickTwoDistinctFactions] Недостаточно фракций для второй команды после фильтрации, пробуем игнорировать историю.`);
            availableFactions2 = getAvailableFactions(teamObj).filter((f) => getAllianceForFactionFromMap(teamObj, f) !== alliance1);
            if (availableFactions2.length === 0)
                return null;
        }
        const faction2 = pickRandomFaction(availableFactions2);
        if (!faction2)
            return null;
        logger.log(`DEBUG: [pickTwoDistinctFactions] Выбраны фракции: ${faction1} (альянс: ${alliance1}) и ${faction2}`);
        return { team1: faction1, team2: faction2 };
    }
    function pickFactionsForTeams(layerKey, factionHistory) {
        const layerData = maps[layerKey];
        if (!layerData)
            return null;
        if (layerData['Team1 / Team2']) {
            const combined = layerData['Team1 / Team2'];
            if (!combined)
                return null;
            let factions = pickTwoDistinctFactions(combined, factionHistory);
            if (!factions) {
                logger.log('DEBUG: [pickFactionsForTeams] Не удалось выбрать фракции с учетом истории, пробуем игнорировать историю.');
                factions = pickTwoDistinctFactions(combined, []);
            }
            return factions;
        }
        else if (layerData.Team1 && layerData.Team2) {
            const team1Data = layerData.Team1;
            const team2Data = layerData.Team2;
            let availableTeam1 = getAvailableFactions(team1Data).filter((f) => !factionHistory.includes(f));
            let faction1 = pickRandomFaction(availableTeam1);
            if (!faction1) {
                logger.log('DEBUG: [pickFactionsForTeams] Не удалось выбрать фракцию Team1 с учетом истории, пробуем игнорировать историю.');
                faction1 = pickRandomFaction(getAvailableFactions(team1Data));
            }
            if (!faction1)
                return null;
            const alliance1 = getAllianceForFactionFromMap(team1Data, faction1);
            let availableTeam2 = getAvailableFactions(team2Data)
                .filter((f) => !factionHistory.includes(f))
                .filter((f) => {
                const alliance2 = getAllianceForFactionFromMap(team2Data, f);
                return alliance2 && alliance2 !== alliance1;
            });
            let faction2 = pickRandomFaction(availableTeam2);
            if (!faction2) {
                logger.log('DEBUG: [pickFactionsForTeams] Не удалось выбрать фракцию Team2 с учетом истории и альянса, пробуем игнорировать историю.');
                availableTeam2 = getAvailableFactions(team2Data).filter((f) => {
                    const alliance2 = getAllianceForFactionFromMap(team2Data, f);
                    return alliance2 && alliance2 !== alliance1;
                });
                faction2 = pickRandomFaction(availableTeam2);
            }
            if (!faction2)
                return null;
            return { team1: faction1, team2: faction2 };
        }
        return null;
    }
    function pickWeightedUnitType(available, unitTypeHistory) {
        const filtered = available.filter((type) => !unitTypeHistory.includes(type));
        if (filtered.length === 0) {
            logger.log(`DEBUG: [pickWeightedUnitType] Нет доступных типов после фильтрации по истории. Доступные: [${available.join(', ')}], история: [${unitTypeHistory.join(', ')}]`);
            return null;
        }
        const weightedTypes = filtered
            .map((type) => {
            let typeWeight = 0;
            for (const [, tier] of Object.entries(tieredSubfactions)) {
                if (tier.subfactions.includes(type)) {
                    typeWeight = tier.probability;
                    break;
                }
            }
            return { item: type, weight: typeWeight };
        })
            .filter((obj) => obj.weight > 0);
        if (weightedTypes.length === 0) {
            logger.log(`DEBUG: [pickWeightedUnitType] После расчета весов не осталось вариантов. Фильтрованные: [${filtered.join(', ')}]`);
            return filtered.join(', ');
        }
        const chosen = weightedRandom(weightedTypes);
        logger.log(`DEBUG: [pickWeightedUnitType] Из [${available.join(', ')}] (filtered: [${filtered.join(', ')}]) выбран тип: ${chosen}`);
        return chosen;
    }
    function pickSymmetricUnitTypes(teamObj, faction1, faction2, unitTypeHistory, symmetricUnitTypes) {
        const alliance1 = getAllianceForFactionFromMap(teamObj, faction1);
        const alliance2 = getAllianceForFactionFromMap(teamObj, faction2);
        if (!alliance1 || !alliance2)
            return null;
        const availableTypes1 = teamObj[alliance1][faction1];
        const availableTypes2 = teamObj[alliance2][faction2];
        if (!(availableTypes1 === null || availableTypes1 === void 0 ? void 0 : availableTypes1.length) || !(availableTypes2 === null || availableTypes2 === void 0 ? void 0 : availableTypes2.length))
            return null;
        if (symmetricUnitTypes) {
            let intersection = availableTypes1.filter((type) => availableTypes2.includes(type) && !unitTypeHistory.includes(type));
            if (intersection.length > 0) {
                const chosenType = pickWeightedUnitType(intersection, unitTypeHistory);
                if (chosenType) {
                    logger.log(`DEBUG: [pickSymmetricUnitTypes] (с историей) Выбран единый тип: ${chosenType} из пересечения: [${intersection.join(', ')}]`);
                    return { type1: chosenType, type2: chosenType };
                }
            }
            intersection = availableTypes1.filter((type) => availableTypes2.includes(type));
            if (intersection.length > 0) {
                const chosenType = pickWeightedUnitType(intersection, []);
                if (chosenType) {
                    logger.log(`DEBUG: [pickSymmetricUnitTypes] (без истории) Выбран единый тип: ${chosenType} из пересечения: [${intersection.join(', ')}]`);
                    return { type1: chosenType, type2: chosenType };
                }
            }
            return null;
        }
        else {
            let filteredTypes1 = availableTypes1.filter((t) => !unitTypeHistory.includes(t));
            let filteredTypes2 = availableTypes2.filter((t) => !unitTypeHistory.includes(t));
            let type1 = pickWeightedUnitType(filteredTypes1, unitTypeHistory);
            let type2 = pickWeightedUnitType(filteredTypes2, unitTypeHistory);
            if (!type1) {
                logger.log(`DEBUG: [pickSymmetricUnitTypes] Не удалось выбрать тип для ${faction1} с учетом истории, игнорируем историю.`);
                type1 = pickWeightedUnitType(availableTypes1, []);
            }
            if (!type2) {
                logger.log(`DEBUG: [pickSymmetricUnitTypes] Не удалось выбрать тип для ${faction2} с учетом истории, игнорируем историю.`);
                type2 = pickWeightedUnitType(availableTypes2, []);
            }
            logger.log(`DEBUG: [pickSymmetricUnitTypes] Итоговый выбор: type1=${type1}, type2=${type2}.`);
            if (!type1 || !type2)
                return null;
            return { type1, type2 };
        }
    }
    // Новая функция для выбора типов юнитов, когда данные заданы раздельно (Team1 и Team2)
    function pickUnitTypesForSeparateTeams(team1Data, team2Data, faction1, faction2, unitTypeHistory, symmetricUnitTypes) {
        const alliance1 = getAllianceForFactionFromMap(team1Data, faction1);
        const alliance2 = getAllianceForFactionFromMap(team2Data, faction2);
        if (!alliance1 || !alliance2)
            return null;
        const availableTypes1 = team1Data[alliance1][faction1];
        const availableTypes2 = team2Data[alliance2][faction2];
        if (!(availableTypes1 === null || availableTypes1 === void 0 ? void 0 : availableTypes1.length) || !(availableTypes2 === null || availableTypes2 === void 0 ? void 0 : availableTypes2.length))
            return null;
        if (symmetricUnitTypes) {
            let intersection = availableTypes1.filter((type) => availableTypes2.includes(type) && !unitTypeHistory.includes(type));
            if (intersection.length > 0) {
                const chosenType = pickWeightedUnitType(intersection, unitTypeHistory);
                if (chosenType) {
                    logger.log(`DEBUG: [pickUnitTypesForSeparateTeams] (с историей) Выбран единый тип: ${chosenType} из пересечения: [${intersection.join(', ')}]`);
                    return { type1: chosenType, type2: chosenType };
                }
            }
            intersection = availableTypes1.filter((type) => availableTypes2.includes(type));
            if (intersection.length > 0) {
                const chosenType = pickWeightedUnitType(intersection, []);
                if (chosenType) {
                    logger.log(`DEBUG: [pickUnitTypesForSeparateTeams] (без истории) Выбран единый тип: ${chosenType} из пересечения: [${intersection.join(', ')}]`);
                    return { type1: chosenType, type2: chosenType };
                }
            }
            // Если симметричный выбор не сработал — переходим к независимому выбору.
        }
        let type1 = pickWeightedUnitType(availableTypes1.filter((t) => !unitTypeHistory.includes(t)), unitTypeHistory);
        let type2 = pickWeightedUnitType(availableTypes2.filter((t) => !unitTypeHistory.includes(t)), unitTypeHistory);
        if (!type1) {
            logger.log(`DEBUG: [pickUnitTypesForSeparateTeams] Не удалось выбрать тип для ${faction1} с учетом истории, игнорируем историю.`);
            type1 = pickWeightedUnitType(availableTypes1, []);
        }
        if (!type2) {
            logger.log(`DEBUG: [pickUnitTypesForSeparateTeams] Не удалось выбрать тип для ${faction2} с учетом истории, игнорируем историю.`);
            type2 = pickWeightedUnitType(availableTypes2, []);
        }
        if (!type1 || !type2)
            return null;
        logger.log(`DEBUG: [pickUnitTypesForSeparateTeams] Итоговый выбор: type1=${type1}, type2=${type2}.`);
        return { type1, type2 };
    }
    function pickRandomMap() {
        return __awaiter(this, void 0, void 0, function* () {
            const recentHistory = yield getHistoryLayers(id);
            const modes = mode.split(',').map((m) => m.trim());
            let candidates = [];
            for (const [tierKey, tier] of Object.entries(tieredMaps)) {
                for (const shortMapName of tier.maps) {
                    if (recentHistory.includes(shortMapName))
                        continue;
                    const availableKeys = Object.keys(maps).filter((key) => modes.some((m) => key.startsWith(`${shortMapName}_${m}`)));
                    if (availableKeys.length === 0) {
                        logger.log(`DEBUG: [pickRandomMap] Для карты "${shortMapName}" не найдены ключи с режимами [${modes.join(', ')}].`);
                        continue;
                    }
                    const randomKey = randomArrayElement(availableKeys);
                    const layerData = maps[randomKey];
                    if (!layerData)
                        continue;
                    let layerName;
                    if (typeof layerData.layerName === 'string' && layerData.layerName) {
                        layerName = layerData.layerName;
                    }
                    else if (layerData.layerName &&
                        typeof layerData.layerName === 'object') {
                        const keys = Object.keys(layerData.layerName);
                        layerName = keys.length ? keys[0] : randomKey;
                    }
                    else {
                        layerName = randomKey;
                    }
                    candidates.push({
                        level: shortMapName,
                        layer: layerName,
                        tierProbability: tier.probability,
                    });
                }
            }
            if (candidates.length === 0) {
                logger.log(`DEBUG: [pickRandomMap] Нет доступных карт после фильтрации по истории, пробуем игнорировать историю.`);
                for (const [tierKey, tier] of Object.entries(tieredMaps)) {
                    for (const shortMapName of tier.maps) {
                        const availableKeys = Object.keys(maps).filter((key) => modes.some((m) => key.startsWith(`${shortMapName}_${m}`)));
                        if (availableKeys.length === 0)
                            continue;
                        const randomKey = randomArrayElement(availableKeys);
                        const layerData = maps[randomKey];
                        if (!layerData)
                            continue;
                        let layerName;
                        if (typeof layerData.layerName === 'string' && layerData.layerName) {
                            layerName = layerData.layerName;
                        }
                        else if (layerData.layerName &&
                            typeof layerData.layerName === 'object') {
                            const keys = Object.keys(layerData.layerName);
                            layerName = keys.length ? keys[0] : randomKey;
                        }
                        else {
                            layerName = randomKey;
                        }
                        candidates.push({
                            level: shortMapName,
                            layer: layerName,
                            tierProbability: tier.probability,
                        });
                    }
                }
                if (candidates.length === 0) {
                    logger.log(`DEBUG: [pickRandomMap] Нет доступных карт даже без фильтрации, устанавливаем карту по умолчанию.`);
                    return 'Narva_AAS_v1';
                }
            }
            const chosenCandidate = weightedRandom(candidates.map((c) => ({ item: c, weight: c.tierProbability })));
            if (!chosenCandidate) {
                logger.log(`DEBUG: [pickRandomMap] Выбор карты завершился неудачей, устанавливаем карту по умолчанию.`);
                return 'Narva_AAS_v1';
            }
            yield serverHistoryLayers(id, chosenCandidate.level);
            recentHistory.push(chosenCandidate.level);
            while (recentHistory.length > excludeCountLayersNumber) {
                recentHistory.shift();
                yield cleanHistoryLayers(id);
            }
            logger.log(`DEBUG: [pickRandomMap] Выбрана карта: ${chosenCandidate.layer} (уровень: ${chosenCandidate.level})`);
            return chosenCandidate.layer;
        });
    }
    const newGame = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            logger.log('DEBUG: [newGame] Начало генерации новой игры.');
            const chosenLayer = yield pickRandomMap();
            logger.log(`DEBUG: [newGame] Выбран слой: ${chosenLayer}`);
            const factionHistory = yield getHistoryFactions(id);
            let factions = pickFactionsForTeams(chosenLayer, factionHistory);
            if (!factions) {
                logger.log(`DEBUG: [newGame] Не удалось выбрать фракции с учётом истории.`);
                return;
            }
            yield serverHistoryFactions(id, factions.team1);
            yield serverHistoryFactions(id, factions.team2);
            factionHistory.push(factions.team1, factions.team2);
            while (factionHistory.length > excludeCountFactionsNumber) {
                factionHistory.shift();
                yield cleanHistoryFactions(id);
            }
            logger.log(`DEBUG: [newGame] Выбраны фракции: ${factions.team1} и ${factions.team2}`);
            const layerData = maps[chosenLayer];
            if (!layerData) {
                logger.log(`DEBUG: [newGame] Данные для слоя ${chosenLayer} не найдены.`);
                return;
            }
            let unitTypes = null;
            // Если задан комбинированный формат, используем pickSymmetricUnitTypes
            if (layerData['Team1 / Team2']) {
                const teamObj = layerData['Team1 / Team2'];
                unitTypes = pickSymmetricUnitTypes(teamObj, factions.team1, factions.team2, yield getHistoryUnitTypes(id), symmetricUnitTypesBoolean);
            }
            // Если заданы отдельно Team1 и Team2, используем новую функцию
            else if (layerData.Team1 && layerData.Team2) {
                unitTypes = pickUnitTypesForSeparateTeams(layerData.Team1, layerData.Team2, factions.team1, factions.team2, yield getHistoryUnitTypes(id), symmetricUnitTypesBoolean);
            }
            else {
                logger.log(`DEBUG: [newGame] Карта ${chosenLayer} не поддерживает требуемый формат фракций.`);
                return;
            }
            if (!unitTypes) {
                logger.log(`DEBUG: [newGame] Не удалось выбрать типы юнитов с учётом истории.`);
                return;
            }
            const unitTypeHistory = yield getHistoryUnitTypes(id);
            yield serverHistoryUnitTypes(id, unitTypes.type1);
            yield serverHistoryUnitTypes(id, unitTypes.type2);
            unitTypeHistory.push(unitTypes.type1, unitTypes.type2);
            while (unitTypeHistory.length > excludeCountUnitTypesNumber) {
                unitTypeHistory.shift();
                yield cleanHistoryUnitTypes(id);
            }
            logger.log(`DEBUG: [newGame] Выбраны типы юнитов: ${unitTypes.type1} и ${unitTypes.type2}`);
            const finalString = `${chosenLayer} ${factions.team1}+${unitTypes.type1} ${factions.team2}+${unitTypes.type2}`;
            logger.log(`DEBUG: [newGame] Следующая карта: ${finalString}`);
            adminSetNextLayer(execute, finalString);
        }
        catch (error) {
            logger.log(`DEBUG: [newGame] Ошибка: ${error instanceof Error ? error.message : error}`);
        }
    });
    listener.on(EVENTS.NEW_GAME, newGame);
};

const rnsStats = (state) => {
    const { listener, execute, logger, id } = state;
    let playersCurrenTime = [];
    let winner;
    const onRoundTickets = (data) => {
        const { team, action } = data;
        if (action === 'won')
            winner = team;
    };
    const onRoundEnded = () => __awaiter(void 0, void 0, void 0, function* () {
        if (state.skipmap)
            return;
        const { players } = state;
        if (!players)
            return;
        const updatePlayerGames = (player) => __awaiter(void 0, void 0, void 0, function* () {
            const { teamID, steamID, possess } = player;
            const user = yield getUserDataWithSteamID(steamID);
            const userData = getPlayerBySteamID(state, steamID);
            if (user) {
                adminWarn(execute, steamID, `Игрок: ${user.name}\nУбийств: ${user.kills}\nСмертей: ${user.death}\nПомощь: ${user.revives}\nТимкилы: ${user.teamkills}\nK/D: ${user.kd}`);
            }
            if (possess === null || possess === void 0 ? void 0 : possess.toLowerCase().includes('developeradmincam'))
                return;
            if (!winner)
                return;
            const gameResult = teamID === winner ? 'won' : 'lose';
            yield updateGames(steamID, gameResult);
            if (userData && userData.isLeader && userData.squadID) {
                const squad = getSquadByID(state, userData.squadID, userData.teamID);
                if (squad &&
                    (squad.squadName === 'CMD Squad' ||
                        squad.squadName === 'Command Squad')) {
                    const cmdGameResult = teamID === winner ? 'cmdwon' : 'cmdlose';
                    yield updateGames(steamID, cmdGameResult);
                }
            }
        });
        try {
            yield Promise.all(players.map(updatePlayerGames));
            winner = '';
            yield creatingTimeStamp();
        }
        catch (error) {
            logger.error(`Произошла ошибка при обновлении данных игрока: ${error}`);
        }
    });
    const updatePlayerData = (steamID) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const user = getPlayerBySteamID(state, steamID);
            if (user) {
                if (user.possess) {
                    yield updatePossess(steamID, user.possess);
                }
                if (user.role) {
                    yield updateRoles(steamID, user.role);
                }
                if (user.isLeader && user.squadID) {
                    yield updateTimes(steamID, 'leader', user.name);
                    const squad = getSquadByID(state, user.squadID, user.teamID);
                    if (squad &&
                        (squad.squadName === 'CMD Squad' ||
                            squad.squadName === 'Command Squad')) {
                        yield updateTimes(steamID, 'cmd', user.name);
                    }
                }
                yield updateTimes(steamID, 'timeplayed', user.name);
            }
        }
        catch (error) {
            logger.error(`Ошибка при обновлении данных для игрока с SteamID ${steamID}:,
        ${error}`);
        }
    });
    const updatedPlayers = () => {
        const { players } = state;
        if (!players)
            return;
        players.forEach((e) => {
            const { steamID } = e;
            if (!steamID)
                return;
            if (playersCurrenTime.find((p) => p.steamID === steamID))
                return;
            playersCurrenTime.push({
                steamID,
                timer: setInterval(() => updatePlayerData(steamID), 60000),
            });
        });
        playersCurrenTime = playersCurrenTime.filter((e) => {
            const currentUser = players.find((c) => c.steamID === e.steamID);
            if (!currentUser) {
                clearInterval(e.timer);
                return false;
            }
            return true;
        });
    };
    const onDied = (data) => __awaiter(void 0, void 0, void 0, function* () {
        const { currentMap } = state;
        if (!(currentMap === null || currentMap === void 0 ? void 0 : currentMap.layer))
            return;
        if (currentMap.layer.toLowerCase().includes('seed'))
            return;
        const { attackerSteamID, victimName, attackerEOSID } = data;
        const attacker = getPlayerByEOSID(state, attackerEOSID);
        const victim = getPlayerByName(state, victimName);
        if (!victim)
            return;
        try {
            if ((attacker === null || attacker === void 0 ? void 0 : attacker.teamID) === (victim === null || victim === void 0 ? void 0 : victim.teamID) &&
                attacker.name !== victim.name) {
                yield updateUser(attackerSteamID, 'teamkills');
            }
            else {
                yield updateUser(attackerSteamID, 'kills', victim.weapon || 'null');
                yield updateUser(victim.steamID, 'death');
            }
        }
        catch (error) {
            logger.error(`Ошибка при обновлении данных игрока: ${error}`);
        }
    });
    const onRevived = (data) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { currentMap } = state;
            if (!(currentMap === null || currentMap === void 0 ? void 0 : currentMap.layer))
                return;
            if (currentMap.layer.toLowerCase().includes('seed'))
                return;
            const { reviverSteamID } = data;
            yield updateUser(reviverSteamID, 'revives');
        }
        catch (error) {
            logger.error(`Ошибка при обновлении данных пользователя на возрождение: ${error}`);
        }
    });
    listener.on(EVENTS.UPDATED_PLAYERS, updatedPlayers);
    listener.on(EVENTS.PLAYER_DIED, onDied);
    listener.on(EVENTS.PLAYER_REVIVED, onRevived);
    listener.on(EVENTS.ROUND_ENDED, onRoundEnded);
    listener.on(EVENTS.ROUND_TICKETS, onRoundTickets);
};

const rename = promisify(fs.rename);
const rnsLogs = (state, options) => {
    const { logger, listener } = state;
    const { logPath } = options;
    let logData = [];
    const writeInterval = 6000;
    const cleanLogsInterval = 24 * 60 * 60 * 1000;
    let matchIsEnded = false;
    function cleanOldLogsFiles() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const currentDate = new Date();
                const expiryLogDate = new Date(currentDate.getTime() - 2 * 24 * 60 * 60 * 1000);
                logger.log(`[CleanLogs] Starting cleanup. Files older than: ${expiryLogDate}`);
                const files = yield fs.readdir(logPath);
                logger.log(`[CleanLogs] Found ${files.length} files in directory`);
                let deletedCount = 0;
                for (const file of files) {
                    try {
                        const filePath = path.join(logPath, file);
                        const stats = yield fs.stat(filePath);
                        if (stats.isFile() && stats.mtime < expiryLogDate) {
                            logger.log(`[CleanLogs] Deleting old file: ${file} (last modified: ${stats.mtime})`);
                            yield fs.unlink(filePath);
                            deletedCount++;
                        }
                    }
                    catch (err) {
                        logger.error(`[CleanLogs] Error processing file ${file}`);
                    }
                }
                logger.log(`[CleanLogs] Cleanup complete. Deleted ${deletedCount} files`);
            }
            catch (err) {
                logger.error('[CleanLogs] Fatal error during cleanup');
            }
        });
    }
    function writeLogToFile(tempData) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!tempData)
                return;
            if (tempData.length === 0)
                return;
            if (matchIsEnded)
                return;
            const { currentMap } = state;
            const logFilePath = `${logPath}${currentMap === null || currentMap === void 0 ? void 0 : currentMap.layer}.json`;
            try {
                let logs = [];
                try {
                    const data = yield fs.readFile(logFilePath, 'utf-8');
                    logs = JSON.parse(data);
                }
                catch (err) {
                    logs = [];
                }
                logs = logs.concat(tempData);
                yield fs.writeFile(logFilePath, JSON.stringify(logs, null, 2));
            }
            catch (error) { }
        });
    }
    setInterval(() => {
        if (logData.length > 0) {
            writeLogToFile(logData);
            logData = [];
        }
    }, writeInterval);
    setInterval(() => {
        cleanOldLogsFiles();
    }, cleanLogsInterval);
    function renameFileLog(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const { time, layer } = data;
            const currentFilePath = `${logPath}${layer}.json`;
            const newName = `${time}_${layer}`;
            const safeNewName = newName.replace(/[:*?"<>|]/g, '.');
            const newFilePath = `${logPath}${safeNewName}.json`;
            try {
                yield rename(currentFilePath, newFilePath);
            }
            catch (err) {
                logger.error('Ошибка при переименовании файла');
            }
        });
    }
    function onNewGame(data) {
        return __awaiter(this, void 0, void 0, function* () {
            matchIsEnded = false;
            const { layerClassname } = data;
            const currentTime = new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
            });
            logData.push({
                currentTime,
                action: 'NewGame',
                layerClassname,
            });
        });
    }
    function onPlayerConnected(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (matchIsEnded)
                return;
            const { steamID } = data;
            const currentTime = new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
            });
            const player = getPlayerBySteamID(state, steamID);
            logData.push({
                currentTime,
                action: 'Connect',
                player: (player === null || player === void 0 ? void 0 : player.name) ? player : null,
            });
        });
    }
    function onPlayerDisconnected(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (matchIsEnded)
                return;
            const { eosID } = data;
            const currentTime = new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
            });
            const player = getPlayerByEOSID(state, eosID);
            logData.push({
                currentTime,
                action: 'Disconnected',
                player: (player === null || player === void 0 ? void 0 : player.name) ? player : null,
            });
        });
    }
    function onRoundEnded() {
        return __awaiter(this, void 0, void 0, function* () {
            matchIsEnded = true;
            const { currentMap } = state;
            const currentTime = new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
            });
            const nameLogFile = {
                time: currentTime,
                layer: (currentMap === null || currentMap === void 0 ? void 0 : currentMap.layer) || 'Undefined',
            };
            logData.push({
                currentTime,
                action: 'RoundEnd',
            });
            yield writeLogToFile(logData);
            logData = [];
            yield renameFileLog(nameLogFile);
        });
    }
    function onPlayerWounded(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (matchIsEnded)
                return;
            const { attackerEOSID, victimName, damage } = data;
            const victim = getPlayerByName(state, victimName);
            const attacker = getPlayerByEOSID(state, attackerEOSID);
            const currentTime = new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
            });
            if (attacker &&
                victim &&
                (attacker === null || attacker === void 0 ? void 0 : attacker.teamID) === (victim === null || victim === void 0 ? void 0 : victim.teamID) &&
                attacker.name !== victim.name) {
                logData.push({
                    currentTime,
                    action: 'TeamKill',
                    damage,
                    attacker: (attacker === null || attacker === void 0 ? void 0 : attacker.name) ? attacker : null,
                    victim: (victim === null || victim === void 0 ? void 0 : victim.name) ? victim : null,
                });
            }
            else {
                logData.push({
                    currentTime,
                    action: 'Wound',
                    damage,
                    attacker: (attacker === null || attacker === void 0 ? void 0 : attacker.name) ? attacker : null,
                    victim: (victim === null || victim === void 0 ? void 0 : victim.name) ? victim : null,
                });
            }
        });
    }
    function onPlayerDamaged(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (matchIsEnded)
                return;
            const { attackerEOSID, victimName, damage } = data;
            const victim = getPlayerByName(state, victimName);
            const attacker = getPlayerByEOSID(state, attackerEOSID);
            const currentTime = new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
            });
            if (attacker &&
                victim &&
                (attacker === null || attacker === void 0 ? void 0 : attacker.teamID) === (victim === null || victim === void 0 ? void 0 : victim.teamID) &&
                attacker.name !== victim.name) {
                logData.push({
                    currentTime,
                    action: 'TeamDamaged',
                    damage,
                    attacker: (attacker === null || attacker === void 0 ? void 0 : attacker.name) ? attacker : null,
                    victim: (victim === null || victim === void 0 ? void 0 : victim.name) ? victim : null,
                });
            }
            else {
                logData.push({
                    currentTime,
                    action: 'PlayerDamaged',
                    damage,
                    attacker: (attacker === null || attacker === void 0 ? void 0 : attacker.name) ? attacker : null,
                    victim: (victim === null || victim === void 0 ? void 0 : victim.name) ? victim : null,
                });
            }
        });
    }
    function onPlayerDied(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (matchIsEnded)
                return;
            const { attackerEOSID, victimName, damage } = data;
            const victim = getPlayerByName(state, victimName);
            const attacker = getPlayerByEOSID(state, attackerEOSID);
            const currentTime = new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
            });
            logData.push({
                currentTime,
                action: 'Died',
                damage,
                attacker: (attacker === null || attacker === void 0 ? void 0 : attacker.name) ? attacker : null,
                victim: (victim === null || victim === void 0 ? void 0 : victim.name) ? victim : null,
            });
        });
    }
    function onPlayerRevived(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (matchIsEnded)
                return;
            const { reviverEOSID, victimEOSID } = data;
            const currentTime = new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
            });
            const reviver = getPlayerByEOSID(state, reviverEOSID);
            const victim = getPlayerByEOSID(state, victimEOSID);
            logData.push({
                currentTime,
                action: 'Revived',
                reviver,
                victim,
            });
        });
    }
    function onRoleChanged(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (matchIsEnded)
                return;
            const { oldRole, newRole, player } = data;
            const { name } = player;
            const currentTime = new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
            });
            logData.push({
                currentTime,
                action: 'RoleChanged',
                name,
                oldRole,
                newRole,
            });
        });
    }
    function onDeployableDamaged(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (matchIsEnded)
                return;
            const { deployable, damage, weapon, name } = data;
            const player = getPlayerByName(state, name);
            const currentTime = new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
            });
            logData.push({
                currentTime,
                action: 'DeployableDamaged',
                damage,
                deployable,
                weapon,
                player: (player === null || player === void 0 ? void 0 : player.name) ? player : null,
            });
        });
    }
    function onChatMessage(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (matchIsEnded)
                return;
            const { name, message, chat } = data;
            const currentTime = new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
            });
            logData.push({
                currentTime,
                action: 'ChatMessage',
                name,
                chat,
                message,
            });
        });
    }
    function onSquadCreated(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (matchIsEnded)
                return;
            const { squadName, eosID } = data;
            const player = getPlayerByEOSID(state, eosID);
            const currentTime = new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
            });
            logData.push({
                currentTime,
                action: 'SquadCreated',
                squadName,
                player: (player === null || player === void 0 ? void 0 : player.name) ? player : null,
            });
        });
    }
    function onEntry(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (matchIsEnded)
                return;
            const { name } = data;
            const currentTime = new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
            });
            logData.push({
                currentTime,
                action: 'EntryCamera',
                name,
            });
        });
    }
    function onExit(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (matchIsEnded)
                return;
            const { name } = data;
            const currentTime = new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
            });
            logData.push({
                currentTime,
                action: 'ExitCamera',
                name,
            });
        });
    }
    function onPlayerPossess(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (matchIsEnded)
                return;
            const { eosID, possessClassname } = data;
            const currentTime = new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
            });
            const player = getPlayerByEOSID(state, eosID);
            logData.push({
                currentTime,
                action: 'Possess',
                player: (player === null || player === void 0 ? void 0 : player.name) ? player : null,
                possessClassname,
            });
        });
    }
    function onPlayerSuicide(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (matchIsEnded)
                return;
            const { name } = data;
            const currentTime = new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
            });
            const player = getPlayerByName(state, name);
            logData.push({
                currentTime,
                action: 'Suicide',
                player: (player === null || player === void 0 ? void 0 : player.name) ? player : null,
            });
        });
    }
    function onVehicleDamage(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (matchIsEnded)
                return;
            const { damage, attackerName, victimVehicle, attackerVehicle, healthRemaining, } = data;
            const currentTime = new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
            });
            logData.push({
                currentTime,
                action: 'VehicleDamage',
                attackerName,
                victimVehicle,
                damage,
                attackerVehicle,
                healthRemaining,
            });
        });
    }
    listener.on(EVENTS.PLAYER_CONNECTED, onPlayerConnected);
    listener.on(EVENTS.PLAYER_DISCONNECTED, onPlayerDisconnected);
    listener.on(EVENTS.PLAYER_WOUNDED, onPlayerWounded);
    listener.on(EVENTS.PLAYER_DAMAGED, onPlayerDamaged);
    listener.on(EVENTS.PLAYER_DIED, onPlayerDied);
    listener.on(EVENTS.ROUND_ENDED, onRoundEnded);
    listener.on(EVENTS.NEW_GAME, onNewGame);
    listener.on(EVENTS.PLAYER_REVIVED, onPlayerRevived);
    listener.on(EVENTS.PLAYER_ROLE_CHANGED, onRoleChanged);
    listener.on(EVENTS.DEPLOYABLE_DAMAGED, onDeployableDamaged);
    listener.on(EVENTS.CHAT_MESSAGE, onChatMessage);
    listener.on(EVENTS.SQUAD_CREATED, onSquadCreated);
    listener.on(EVENTS.POSSESSED_ADMIN_CAMERA, onEntry);
    listener.on(EVENTS.UNPOSSESSED_ADMIN_CAMERA, onExit);
    listener.on(EVENTS.PLAYER_POSSESS, onPlayerPossess);
    listener.on(EVENTS.PLAYER_SUICIDE, onPlayerSuicide);
    listener.on(EVENTS.VEHICLE_DAMAGED, onVehicleDamage);
};

const skipmap = (state, options) => {
    const { listener, execute } = state;
    const { voteTick, voteDuration, voteRepeatDelay, onlyForVip, needVotes, voteTimeout, } = options;
    let voteReadyToStart = true;
    let voteTimeOutToStart = false;
    let voteStarting = false;
    let voteStartingRepeat = true;
    let secondsToEnd = voteDuration / 1000;
    const skipMapTimeout = voteTimeout / 1000 / 60;
    let timer;
    let timerDelayStarting;
    let timerDelayNextStart;
    let timerVoteTimeOutToStart;
    let historyPlayers = [];
    let votes = { '+': [], '-': [] };
    let voteReadyAt = Date.now();
    let skipmapRepeatAt = 0;
    const getSkipmapVoteErrorMessage = (steamID) => {
        const { admins } = state;
        if (state.votingActive || voteStarting) {
            return 'В данный момент голосование уже идет!';
        }
        if (!voteStartingRepeat) {
            const diffMs = skipmapRepeatAt - Date.now();
            if (diffMs > 0) {
                const diffMin = Math.ceil(diffMs / 1000 / 60);
                return `До повторного голосования осталось ${diffMin} минут(ы)!`;
            }
            return 'Должно пройти 15 минут после последнего использования skipmap!';
        }
        if (!voteReadyToStart) {
            const now = Date.now();
            const diff = voteReadyAt - now;
            if (diff > 0) {
                const secondsLeft = Math.ceil(diff / 1000);
                return `Голосование за завершение матча будет доступно через ${secondsLeft} секунд!`;
            }
            return 'Голосование за завершение матча ещё не готово!';
        }
        if (voteTimeOutToStart) {
            return `Голосование за завершение матча доступно только в первые ${skipMapTimeout} минуты после начала матча!`;
        }
        if (onlyForVip && !(admins === null || admins === void 0 ? void 0 : admins[steamID])) {
            return 'Команда доступна только Vip пользователям';
        }
        if (historyPlayers.includes(steamID)) {
            return 'Вы уже запускали голосование, для каждого игрока доступно только одно голосование за игру!';
        }
        return null;
    };
    const chatCommand = (data) => {
        const { steamID } = data;
        const errorMsg = getSkipmapVoteErrorMessage(steamID);
        if (errorMsg) {
            adminWarn(execute, steamID, errorMsg);
            return;
        }
        adminBroadcast(execute, 'Голосование за пропуск текущей карты!\nИспользуйте +(За) или -(Против) для голосования');
        historyPlayers.push(steamID);
        state.votingActive = true;
        voteStarting = true;
        voteStartingRepeat = false;
        timer = setInterval(() => {
            secondsToEnd -= voteTick / 1000;
            const positive = votes['+'].length;
            const negative = votes['-'].length;
            const currentVotes = Math.max(positive - negative, 0);
            if (secondsToEnd <= 0) {
                if (currentVotes >= needVotes) {
                    adminBroadcast(execute, 'Голосование завершено!\nМатч завершается!');
                    adminBroadcast(execute, `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`);
                    state.skipmap = true;
                    reset();
                    adminEndMatch(execute);
                    return;
                }
                skipmapRepeatAt = Date.now() + voteRepeatDelay;
                timerDelayNextStart = setTimeout(() => {
                    voteStartingRepeat = true;
                }, voteRepeatDelay);
                adminBroadcast(execute, 'Голосование завершено!\nНе набрано необходимое количество голосов за пропуск текущей карты');
                adminBroadcast(execute, `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`);
                reset();
            }
            else {
                adminBroadcast(execute, `Голосование за пропуск текущей карты!\nЗа: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`);
                adminBroadcast(execute, 'Используйте +(За) или -(Против) для голосования');
            }
        }, voteTick);
    };
    const chatMessage = (data) => {
        if (!voteStarting)
            return;
        const { steamID } = data;
        const msg = data.message.trim();
        if (msg === '+' || msg === '-') {
            for (const key in votes) {
                votes[key] = votes[key].filter((p) => p !== steamID);
            }
            votes[msg].push(steamID);
            adminWarn(execute, steamID, 'Твой голос принят!');
        }
    };
    const newGame = () => {
        reset();
        clearTimeout(timerDelayNextStart);
        historyPlayers = [];
        voteReadyToStart = false;
        voteStartingRepeat = true;
        voteTimeOutToStart = false;
        state.skipmap = false;
        secondsToEnd = voteDuration / 1000;
        voteReadyAt = Date.now() + 60000;
        timerDelayStarting = setTimeout(() => {
            voteReadyToStart = true;
        }, 60000);
        timerVoteTimeOutToStart = setTimeout(() => {
            voteTimeOutToStart = true;
        }, voteTimeout);
    };
    listener.on(EVENTS.CHAT_COMMAND_SKIPMAP, chatCommand);
    listener.on(EVENTS.CHAT_MESSAGE, chatMessage);
    listener.on(EVENTS.NEW_GAME, newGame);
    const reset = () => {
        clearTimeout(timerDelayStarting);
        clearTimeout(timerVoteTimeOutToStart);
        clearInterval(timer);
        secondsToEnd = voteDuration / 1000;
        voteStarting = false;
        state.votingActive = false;
        votes = { '+': [], '-': [] };
    };
};

const squadLeaderRole = (state, options) => {
    const { listener, execute, logger } = state;
    const { timeDisband } = options;
    let trackedPlayers = {};
    const getWarn = (steamID, text, seconds) => __awaiter(void 0, void 0, void 0, function* () {
        if (!seconds) {
            return adminWarn(execute, steamID, text);
        }
        const newText = text.replace(/{{time}}/, seconds.toString());
        yield adminWarn(execute, steamID, newText);
    });
    const newGame = () => {
        trackedPlayers = {};
    };
    const getIsLeaderRole = (role) => {
        return role.indexOf('SL') !== -1;
    };
    const untrackPlayer = (steamID, reason) => {
        const tracker = trackedPlayers[steamID];
        delete trackedPlayers[steamID];
        if (tracker) {
            logger.log(`unTracker: Name: ${tracker.name} SquadID: ${tracker.squadID} TeamID: ${tracker.teamID} Reason: ${reason || 'null'}`);
        }
    };
    const leaderChanged = (data) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const { player, isLeader } = data;
        const { currentMap } = state;
        const admins = getAdmins(state, 'canseeadminchat');
        const isAdmin = admins === null || admins === void 0 ? void 0 : admins.includes(player.steamID);
        if ((_a = currentMap === null || currentMap === void 0 ? void 0 : currentMap.layer) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('seed'))
            return;
        if (isAdmin)
            return;
        const iterationCheck = 30000;
        const messageGetRole = 'Возьми кит лидера или сквад будет расформирован через {{time}}сек';
        const messageDisband = 'Отряд расформирован';
        const messageSuccess = 'Спасибо что взяли кит!';
        let seconds = parseInt(timeDisband) / 1000;
        let timer = null;
        const leaderRole = getIsLeaderRole(player.role);
        if (trackedPlayers[player.steamID])
            return;
        if (isLeader && leaderRole)
            return;
        if (!player)
            return;
        if (isLeader && !leaderRole && !trackedPlayers[player.steamID]) {
            trackedPlayers[player.steamID] = player;
        }
        if (isLeader) {
            if (!leaderRole) {
                yield getWarn(player.steamID, messageGetRole, seconds);
                logger.log(`startTracker: Name: ${player.name} SquadID: ${player.squadID} TeamID: ${player.teamID} Seconds: ${seconds}`);
                timer = setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
                    var _b, _c;
                    let updatedPlayer = (_b = state.players) === null || _b === void 0 ? void 0 : _b.find((user) => user.steamID === player.steamID);
                    seconds = seconds - iterationCheck / 1000;
                    if (!updatedPlayer) {
                        clearInterval(timer);
                        timer = null;
                        untrackPlayer(player.steamID, 'Игрок вышел');
                        return;
                    }
                    if (!updatedPlayer.isLeader) {
                        clearInterval(timer);
                        timer = null;
                        untrackPlayer(player.steamID, 'Игрок больше не лидер');
                        return;
                    }
                    if (getIsLeaderRole(updatedPlayer.role)) {
                        clearInterval(timer);
                        timer = null;
                        {
                            yield getWarn(updatedPlayer.steamID, messageSuccess);
                        }
                        untrackPlayer(player.steamID, 'Игрок взял кит');
                        return;
                    }
                    if (seconds !== 0) {
                        yield getWarn(updatedPlayer.steamID, messageGetRole, seconds);
                        logger.log(`startTracker: Name: ${player.name} SquadID: ${player.squadID} TeamID: ${player.teamID} Seconds: ${seconds}`);
                    }
                    if (seconds <= 0) {
                        untrackPlayer(player.steamID, 'Отряд распущен');
                        clearInterval(timer);
                        timer = null;
                        yield getWarn(updatedPlayer.steamID, messageDisband);
                        updatedPlayer = (_c = state.players) === null || _c === void 0 ? void 0 : _c.find((user) => user.steamID === player.steamID);
                        if (updatedPlayer && (updatedPlayer === null || updatedPlayer === void 0 ? void 0 : updatedPlayer.squadID)) {
                            yield adminDisbandSquad(execute, updatedPlayer.teamID, updatedPlayer.squadID);
                        }
                    }
                }), iterationCheck);
            }
        }
    });
    listener.on(EVENTS.NEW_GAME, newGame);
    listener.on(EVENTS.PLAYER_ROLE_CHANGED, leaderChanged);
    listener.on(EVENTS.PLAYER_LEADER_CHANGED, leaderChanged);
};

const findFactionAlliance = (faction, teamData, subFaction) => {
    for (const alliance in teamData) {
        if (teamData[alliance][faction] &&
            teamData[alliance][faction].includes(subFaction)) {
            return alliance;
        }
    }
    return undefined;
};
const validateFactionSubFaction = (mapData, mapName, teamName, faction, subFaction, tempAlliance) => {
    const mapEntry = mapData[mapName];
    if (!mapEntry)
        return false;
    if (mapEntry['Team1 / Team2']) {
        teamName = 'Team1 / Team2';
    }
    const teamData = mapEntry[teamName];
    if (!teamData)
        return false;
    const alliance = findFactionAlliance(faction, teamData, subFaction);
    if (tempAlliance.current === alliance || !alliance) {
        tempAlliance.current = undefined;
        return false;
    }
    tempAlliance.current = alliance;
    return true;
};
const validateSelectedMapAndTeams = (mapData, mapName, team1Faction, team1SubFaction, team2Faction, team2SubFaction) => {
    const tempAlliance = {};
    const team1Valid = validateFactionSubFaction(mapData, mapName, 'Team1', team1Faction, team1SubFaction, tempAlliance);
    const team2Valid = validateFactionSubFaction(mapData, mapName, 'Team2', team2Faction, team2SubFaction, tempAlliance);
    return team1Valid && team2Valid;
};
const parseVoteMessage = (message, allowedModes) => {
    const hasValidMode = allowedModes.some((mode) => message.includes(mode));
    if (!hasValidMode) {
        return { isValid: false };
    }
    const parts = message.split(/\s+/);
    if (parts.length < 3)
        return { isValid: false };
    const [layerName, team1Part, team2Part] = parts;
    const [team1Faction, team1SubFaction] = team1Part.split('+');
    const [team2Faction, team2SubFaction] = team2Part.split('+');
    if (!layerName ||
        !team1Faction ||
        !team1SubFaction ||
        !team2Faction ||
        !team2SubFaction) {
        return { isValid: false };
    }
    return {
        isValid: true,
        mapName: layerName,
        layerName,
        team1Faction,
        team1SubFaction,
        team2Faction,
        team2SubFaction,
    };
};
const voteMap = (state, options) => {
    const { listener, execute, maps } = state;
    const { voteTick, voteDuration, onlyForVip, needVotes, mapMode } = options;
    const allowedModes = Array.isArray(mapMode)
        ? mapMode
        : [String(mapMode)];
    let voteReadyToStart = true;
    let voteStarting = false;
    let secondsToEnd = voteDuration / 1000;
    let timer;
    let timerDelayStarting;
    const timerDelayNextStart = setTimeout(() => { }, 0);
    let voteCompleted = false;
    let historyPlayers = [];
    let votes = { '+': [], '-': [] };
    const updateVoteStatus = (message) => {
        secondsToEnd -= voteTick / 1000;
        const positive = votes['+'].length;
        const negative = votes['-'].length;
        const currentVotes = Math.max(positive - negative, 0);
        if (secondsToEnd <= 0) {
            if (currentVotes >= needVotes) {
                adminBroadcast(execute, `Голосование завершено!\nСледующая карта ${message}!`);
                adminBroadcast(execute, `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`);
                resetVote();
                adminSetNextLayer(execute, message);
                voteCompleted = true;
            }
            else {
                adminBroadcast(execute, 'Голосование завершено!\nНе набрано необходимое количество голосов');
                adminBroadcast(execute, `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`);
                resetVote();
            }
        }
        else {
            adminBroadcast(execute, `Голосование за следующую карту ${message}!\nЗа: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`);
            adminBroadcast(execute, 'Используйте +(За) или -(Против) для голосования');
        }
    };
    const resetVote = () => {
        clearTimeout(timerDelayNextStart);
        clearTimeout(timerDelayStarting);
        clearInterval(timer);
        secondsToEnd = voteDuration / 1000;
        voteStarting = false;
        state.votingActive = false;
        votes = { '+': [], '-': [] };
    };
    const handleChatCommand = (data) => {
        const { steamID, message } = data;
        const { admins } = state;
        if (state.votingActive || voteStarting) {
            adminWarn(execute, steamID, 'В данный момент голосование уже идет!');
            return;
        }
        if (voteCompleted) {
            adminWarn(execute, steamID, 'Голосование уже прошло!');
            return;
        }
        if (!voteReadyToStart) {
            adminWarn(execute, steamID, 'Голосование будет доступно через 1 минуту после старта карты!');
            return;
        }
        if (onlyForVip && !(admins === null || admins === void 0 ? void 0 : admins[steamID])) {
            adminWarn(execute, steamID, 'Команда доступна только Vip пользователям');
            return;
        }
        if (historyPlayers.includes(steamID)) {
            adminWarn(execute, steamID, 'Вы уже запускали голосование, для каждого игрока доступно только одно голосование за игру!');
            return;
        }
        const parsed = parseVoteMessage(message, allowedModes);
        if (!parsed.isValid) {
            adminWarn(execute, steamID, 'Неправильный формат сообщения (Нужно указать название карты, фракции и тип войск)!');
            return;
        }
        const { layerName, team1Faction, team1SubFaction, team2Faction, team2SubFaction, } = parsed;
        if (!layerName)
            return;
        const isValidMapAndTeams = validateSelectedMapAndTeams(maps, layerName, team1Faction, team1SubFaction, team2Faction, team2SubFaction);
        if (!isValidMapAndTeams || message.length === 0) {
            adminWarn(execute, steamID, 'Неправильно указано название карты. Список карт можно найти в дискорд-канале discord.gg/rn-server!');
            return;
        }
        adminBroadcast(execute, `Голосование за следующую карту ${message}!\nИспользуйте +(За) или -(Против) для голосования`);
        voteStarting = true;
        state.votingActive = true;
        historyPlayers.push(steamID);
        timer = setInterval(() => {
            updateVoteStatus(message);
        }, voteTick);
    };
    const handleChatMessage = (data) => {
        if (!voteStarting)
            return;
        const { steamID, message } = data;
        const trimmed = message.trim();
        if (trimmed === '+' || trimmed === '-') {
            for (const key in votes) {
                votes[key] = votes[key].filter((p) => p !== steamID);
            }
            votes[trimmed].push(steamID);
            adminWarn(execute, steamID, 'Твой голос принят!');
        }
    };
    const handleNewGame = () => {
        resetVote();
        voteCompleted = false;
        voteReadyToStart = false;
        historyPlayers = [];
        timerDelayStarting = setTimeout(() => {
            voteReadyToStart = true;
        }, 60000);
    };
    listener.on(EVENTS.CHAT_COMMAND_VOTEMAP, handleChatCommand);
    listener.on(EVENTS.CHAT_MESSAGE, handleChatMessage);
    listener.on(EVENTS.NEW_GAME, handleNewGame);
};

const voteMapMods = (state, options) => {
    const { listener, execute, maps } = state;
    const { voteTick, voteDuration, onlyForVip, needVotes, mapFileName } = options;
    let voteReadyToStart = true;
    let voteStarting = false;
    let secondsToEnd = voteDuration / 1000;
    let timer;
    let timerDelayStarting = undefined;
    let vote = false;
    let historyPlayers = [];
    let votes = {
        '+': [],
        '-': [],
    };
    const chatCommand = (data) => {
        const { steamID, message } = data;
        const { admins } = state;
        if (state.votingActive || voteStarting) {
            adminWarn(execute, steamID, 'В данный момент голосование уже идет!');
            return;
        }
        if (vote) {
            adminWarn(execute, steamID, 'Голосование уже прошло!');
            return;
        }
        if (!voteReadyToStart) {
            adminWarn(execute, steamID, 'Голосование будет доступно через 1 минуту после старта карты!');
            return;
        }
        if (onlyForVip && !(admins === null || admins === void 0 ? void 0 : admins[steamID])) {
            adminWarn(execute, steamID, 'Команда доступна только Vip пользователям');
            return;
        }
        if (historyPlayers.find((i) => i === steamID)) {
            adminWarn(execute, steamID, 'Вы уже запускали голосование, для каждого игрока доступно только одно голосование за игру!');
            return;
        }
        const messageToLower = message.toLowerCase().trim();
        const foundKey = Object.keys(maps).find((key) => key.toLowerCase() === messageToLower.toLowerCase());
        if (!foundKey || message.length === 0) {
            adminWarn(execute, steamID, 'Неправильно указано название карты, список карт можно найти в дискорде в канале плагины!');
            return;
        }
        adminBroadcast(execute, `Голосование за смену карты на ${message}!\nИспользуйте +(За) -(Против) для голосования`);
        voteStarting = true;
        state.votingActive = true;
        historyPlayers.push(steamID);
        timer = setInterval(() => {
            secondsToEnd = secondsToEnd - voteTick / 1000;
            const positive = votes['+'].length;
            const negative = votes['-'].length;
            const currentVotes = positive - negative <= 0 ? 0 : positive - negative;
            if (secondsToEnd <= 0) {
                if (currentVotes >= needVotes) {
                    adminBroadcast(execute, `Голосование завершено!\nСледующая карта ${message}!`);
                    adminBroadcast(execute, `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`);
                    reset();
                    adminChangeLayer(execute, foundKey);
                    vote = true;
                    return;
                }
                adminBroadcast(execute, 'Голосование завершено!\nНе набрано необходимое количество голосов');
                adminBroadcast(execute, `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`);
                reset();
            }
            else {
                adminBroadcast(execute, `Голосование за смену карты на ${message}!\nЗа: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`);
                adminBroadcast(execute, 'Используйте +(За) -(Против) для голосования');
            }
        }, voteTick);
    };
    const chatMessage = (data) => {
        if (!voteStarting)
            return;
        const { steamID } = data;
        const message = data.message.trim();
        if (message === '+' || message === '-') {
            for (const key in votes) {
                votes[key] = votes[key].filter((p) => p !== steamID);
            }
            votes[message].push(steamID);
            adminWarn(execute, steamID, 'Твой голос принят!');
        }
    };
    const newGame = () => {
        reset();
        vote = false;
        voteReadyToStart = false;
        historyPlayers = [];
        timerDelayStarting = setTimeout(() => {
            voteReadyToStart = true;
        }, 60000);
    };
    listener.on(EVENTS.CHAT_COMMAND_VOTEMAP, chatCommand);
    listener.on(EVENTS.CHAT_MESSAGE, chatMessage);
    listener.on(EVENTS.NEW_GAME, newGame);
    const reset = () => {
        if (timerDelayStarting)
            clearTimeout(timerDelayStarting);
        clearInterval(timer);
        secondsToEnd = voteDuration / 1000;
        voteStarting = false;
        state.votingActive = false;
        votes = {
            '+': [],
            '-': [],
        };
    };
};

const warnPlayers = (state, options) => {
    const { listener, execute } = state;
    let warningTimeout;
    const { connectedMessage, sqCreatedMessage, roleChangedMessage, messageAttacker, messageVictim, } = options;
    const sendWarningMessages = (steamID, messages) => {
        for (const message of messages) {
            adminWarn(execute, steamID, message);
        }
    };
    const playerConnected = (data) => {
        const { steamID } = data;
        sendWarningMessages(steamID, connectedMessage);
        setTimeout(() => {
            sendWarningMessages(steamID, connectedMessage);
        }, 60000);
    };
    const squadCreated = (data) => {
        const { steamID } = data;
        if (warningTimeout) {
            clearTimeout(warningTimeout);
        }
        sendWarningMessages(steamID, sqCreatedMessage);
        warningTimeout = setTimeout(() => {
            sendWarningMessages(steamID, sqCreatedMessage);
        }, 60000);
    };
    const playerRoleChanged = (data) => {
        const { role, steamID } = data.player;
        if (warningTimeout) {
            clearTimeout(warningTimeout);
        }
        for (const [checkRole, message] of roleChangedMessage) {
            if (role.includes(checkRole)) {
                adminWarn(execute, steamID, message);
                warningTimeout = setTimeout(() => {
                    adminWarn(execute, steamID, message);
                }, 60000);
            }
        }
    };
    const playerWounded = ({ victimName, attackerEOSID }) => {
        if (!victimName || !attackerEOSID)
            return;
        const victim = getPlayerByName(state, victimName);
        const attacker = getPlayerByEOSID(state, attackerEOSID);
        if ((victim === null || victim === void 0 ? void 0 : victim.name) === (attacker === null || attacker === void 0 ? void 0 : attacker.name))
            return;
        if (victim && attacker && victim.teamID === attacker.teamID) {
            adminWarn(execute, victim.steamID, messageVictim + '\n' + attacker.name);
            adminWarn(execute, attacker.steamID, messageAttacker);
        }
    };
    listener.on(EVENTS.PLAYER_CONNECTED, playerConnected);
    listener.on(EVENTS.SQUAD_CREATED, squadCreated);
    listener.on(EVENTS.PLAYER_ROLE_CHANGED, playerRoleChanged);
    listener.on(EVENTS.PLAYER_WOUNDED, playerWounded);
};

const plugins = [
    skipmap,
    voteMap,
    randomizerMaps,
    warnPlayers,
    squadLeaderRole,
    autoKickUnassigned,
    chatCommands,
    fobExplosionDamage,
    autorestartServers,
    rnsStats,
    bonuses,
    rnsLogs,
    broadcast,
    voteMapMods,
    autoUpdateMods,
    explosiveDamaged,
    knifeBroadcast,
    adminCamBlocker,
    levelSync,
];
const initPlugins = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const state = getServersState(id);
    plugins.forEach((fn) => {
        state.logger.log(`Initializing plugin: ${fn.name}`);
        const plugin = state.plugins.find((p) => p.name === fn.name);
        if (plugin && plugin.enabled) {
            state.logger.log(`Initialized plugin: ${fn.name}`);
            fn(state, plugin.options);
        }
        else {
            state.logger.warn(`Disabled plugin: ${fn.name}`);
        }
    });
    return new Promise((res) => res(true));
});

const convertObjToArrayEvents = (events) => Object.keys(events).map((event) => events[event]);
const chatCommandParser = (listener) => {
    listener.on(EVENTS.CHAT_MESSAGE, (data) => {
        const command = data.message.match(/!([^ ]+) ?(.*)/);
        if (command)
            listener.emit(`CHAT_COMMAND:${command[1].toLowerCase()}`, Object.assign(Object.assign({}, data), { message: command[2].trim() }));
    });
};

const initEvents = ({ rconEmitter, logsEmitter }) => {
    const coreEmitter = new EventEmitter();
    const localEmitter = new EventEmitter();
    coreEmitter.setMaxListeners(50);
    localEmitter.setMaxListeners(50);
    const rconEvents = convertObjToArrayEvents(RconEvents);
    const logsEvents = convertObjToArrayEvents(LogsReaderEvents);
    /* RCON EVENTS */
    rconEvents.forEach((event) => {
        // disabled dublicate, using only Logs SQUAD_CREATED
        if (event !== RconEvents.SQUAD_CREATED) {
            rconEmitter.on(event, (data) => coreEmitter.emit(event, data));
        }
    });
    /* LOGS EVENTS */
    logsEvents.forEach((event) => {
        logsEmitter.on(event, (data) => coreEmitter.emit(event, data));
    });
    chatCommandParser(coreEmitter);
    return { coreEmitter, localEmitter };
};

const __dirname$1 = url.fileURLToPath(new URL('.', import.meta.url));
const initMaps = (mapsName, logger) => __awaiter(void 0, void 0, void 0, function* () {
    logger.log('Loading maps');
    const filePath = path.resolve(__dirname$1, mapsName);
    if (!fs$1.existsSync(filePath)) {
        logger.error(`Maps file "${mapsName}" not found`);
        process.exit(1);
    }
    let rawData;
    try {
        rawData = fs$1.readFileSync(filePath, 'utf-8');
    }
    catch (err) {
        logger.error(`Error reading file "${mapsName}": ${err}`);
        process.exit(1);
    }
    let data;
    try {
        data = JSON.parse(rawData);
    }
    catch (err) {
        logger.error(`Error parsing JSON in "${mapsName}": ${err}`);
        process.exit(1);
    }
    if (!data || typeof data !== 'object') {
        logger.error(`Maps file "${mapsName}" is empty or invalid`);
        process.exit(1);
    }
    const maps = data;
    for (const mapName in maps) {
        const mapData = maps[mapName];
        if (!((mapData['Team1 / Team2'] &&
            typeof mapData['Team1 / Team2'] === 'object') ||
            (mapData.Team1 &&
                typeof mapData.Team1 === 'object' &&
                mapData.Team2 &&
                typeof mapData.Team2 === 'object'))) {
            logger.error(`Map "${mapName}" has an invalid team structure`);
            process.exit(1);
        }
    }
    logger.log('Loaded maps');
    return maps;
});

const updateAdmins = (id, getAdmins) => __awaiter(void 0, void 0, void 0, function* () {
    const { coreListener, logger } = getServersState(id);
    logger.log('Updating admins');
    const admins = yield getAdmins();
    const state = getServersState(id);
    state.admins = admins;
    coreListener.emit(EVENTS.UPDATED_ADMINS, state.admins);
    logger.log('Updated admins');
});

const updateCurrentMap = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const { execute, coreListener, logger } = getServersState(id);
    logger.log('Updating current map');
    execute(EVENTS.SHOW_CURRENT_MAP);
    return new Promise((res) => {
        coreListener.once(EVENTS.SHOW_CURRENT_MAP, (data) => {
            getServersState(id).currentMap = data;
            logger.log('Updated current map');
            res(true);
        });
        setTimeout(() => res(true), UPDATERS_REJECT_TIMEOUT);
    });
});

const updateNextMap = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const { execute, coreListener, logger } = getServersState(id);
    logger.log('Updating next map');
    execute(EVENTS.SHOW_NEXT_MAP);
    return new Promise((res) => {
        coreListener.once(EVENTS.SHOW_NEXT_MAP, (data) => {
            getServersState(id).nextMap = data;
            logger.log('Updated next map');
            res(true);
        });
        setTimeout(() => res(true), UPDATERS_REJECT_TIMEOUT);
    });
});

const updatePlayers = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const { execute, coreListener, logger } = getServersState(id);
    logger.log('Updating players');
    execute(EVENTS.LIST_PLAYERS);
    return new Promise((res) => {
        coreListener.once(EVENTS.LIST_PLAYERS, (data) => {
            const state = getServersState(id);
            state.players = data.map((player) => {
                var _a;
                const playerFound = (_a = state.players) === null || _a === void 0 ? void 0 : _a.find((p) => p.steamID === player.steamID);
                if (playerFound) {
                    if (player.teamID !== playerFound.teamID)
                        coreListener.emit(EVENTS.PLAYER_TEAM_CHANGED, {
                            player: player,
                            oldTeamID: playerFound.teamID,
                            newTeamID: player.teamID,
                        });
                    if (player.squadID !== playerFound.squadID)
                        coreListener.emit(EVENTS.PLAYER_SQUAD_CHANGED, {
                            player: player,
                            oldSquadID: playerFound.squadID,
                            newSquadID: player.squadID,
                        });
                    if (player.role !== playerFound.role)
                        coreListener.emit(EVENTS.PLAYER_ROLE_CHANGED, {
                            player: player,
                            oldRole: playerFound.role,
                            newRole: player.role,
                            isLeader: player.isLeader,
                        });
                    if (player.isLeader !== playerFound.isLeader) {
                        coreListener.emit(EVENTS.PLAYER_LEADER_CHANGED, {
                            player: player,
                            oldRole: playerFound.role,
                            newRole: player.role,
                            isLeader: player.isLeader,
                        });
                    }
                    return Object.assign(Object.assign({}, playerFound), player);
                }
                return player;
            });
            coreListener.emit(EVENTS.UPDATED_PLAYERS, state.players);
            logger.log('Updated players');
            res(true);
        });
        setTimeout(() => res(true), UPDATERS_REJECT_TIMEOUT);
    });
});

const updateServerInfo = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const { execute, coreListener, logger } = getServersState(id);
    logger.log('Updating serverinfo');
    execute(EVENTS.SHOW_SERVER_INFO);
    return new Promise((res) => {
        coreListener.once(EVENTS.SHOW_SERVER_INFO, (data) => {
            getServersState(id).serverInfo = data;
            logger.log('Updated serverinfo');
            res(true);
        });
        setTimeout(() => res(true), UPDATERS_REJECT_TIMEOUT);
    });
});

const updateSquads = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const { execute, coreListener, logger } = getServersState(id);
    logger.log('Updating squads');
    execute(EVENTS.LIST_SQUADS);
    return new Promise((res) => {
        coreListener.once(EVENTS.LIST_SQUADS, (data) => {
            const state = getServersState(id);
            state.squads = [...data];
            coreListener.emit(EVENTS.UPDATED_SQUADS, state.squads);
            logger.log('Updated squads');
            res(true);
        });
        setTimeout(() => res(true), UPDATERS_REJECT_TIMEOUT);
    });
});

const initState = (id, getAdmins) => __awaiter(void 0, void 0, void 0, function* () {
    yield updateAdmins(id, getAdmins);
    yield updateCurrentMap(id);
    yield updateNextMap(id);
    yield updatePlayers(id);
    yield updateSquads(id);
    yield updateServerInfo(id);
    const state = getServersState(id);
    const { coreListener, listener } = state;
    let updateTimeout;
    let canRunUpdateInterval = true;
    setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
        if (!canRunUpdateInterval)
            return;
        yield updatePlayers(id);
        yield updateSquads(id);
    }), UPDATE_TIMEOUT);
    const updatesOnEvents = () => __awaiter(void 0, void 0, void 0, function* () {
        canRunUpdateInterval = false;
        clearTimeout(updateTimeout);
        yield updatePlayers(id);
        yield updateSquads(id);
        updateTimeout = setTimeout(() => (canRunUpdateInterval = true), UPDATE_TIMEOUT);
    });
    for (const key in EVENTS) {
        const event = EVENTS[key];
        coreListener.on(event, (data) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            if (event === EVENTS.PLAYER_CONNECTED || event === EVENTS.SQUAD_CREATED) {
                yield updatesOnEvents();
                if (event === EVENTS.PLAYER_CONNECTED) {
                    const player = data;
                    if (state.players && player) {
                        state.players = state.players.map((p) => {
                            if (p.steamID === player.steamID) {
                                return Object.assign(Object.assign({}, p), { playerController: player.playerController });
                            }
                            return p;
                        });
                    }
                }
            }
            if (event === EVENTS.NEW_GAME) {
                yield updateAdmins(id, getAdmins);
                yield updateCurrentMap(id);
                yield updateNextMap(id);
                yield updateServerInfo(id);
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
                const tickRateData = data;
                state.tickRate = tickRateData.tickRate;
            }
            if (event === EVENTS.PLAYER_POSSESS) {
                const player = data;
                if (state.players && player) {
                    state.players = (_a = state.players) === null || _a === void 0 ? void 0 : _a.map((p) => {
                        if (p.steamID === player.steamID) {
                            return Object.assign(Object.assign({}, p), { possess: player.possessClassname });
                        }
                        return p;
                    });
                }
            }
            if (event === EVENTS.PLAYER_DAMAGED) {
                const player = data;
                if (state.players && player) {
                    state.players = state.players.map((p) => {
                        if (p.name === player.victimName) {
                            return Object.assign(Object.assign({}, p), { weapon: player.weapon });
                        }
                        return p;
                    });
                }
            }
            listener.emit(event, data);
        }));
    }
});

const initSquadJS = ({ id, mapsName, plugins, rcon, logs, }) => __awaiter(void 0, void 0, void 0, function* () {
    const { rconEmitter, execute } = rcon;
    const { logsEmitter, getAdmins } = logs;
    const { localEmitter, coreEmitter } = initEvents({
        rconEmitter,
        logsEmitter,
    });
    const logger = initLogger(id);
    const maps = yield initMaps(mapsName, logger);
    serversState[id] = {
        id,
        rcon,
        logs,
        listener: localEmitter,
        coreListener: coreEmitter,
        execute,
        logger,
        maps,
        plugins,
    };
    yield initState(id, getAdmins);
    yield initPlugins(id);
});

const initServer = (config) => __awaiter(void 0, void 0, void 0, function* () {
    const { id, host, port, password, ftp, logFilePath, adminsFilePath } = config;
    const rcon = new Rcon({
        id,
        host,
        port,
        password,
    });
    const logsReaderConfig = ftp
        ? {
            id,
            host,
            adminsFilePath,
            autoReconnect: true,
            filePath: logFilePath,
            username: ftp.username,
            password: ftp.password,
            readType: 'remote',
        }
        : {
            id,
            filePath: logFilePath,
            adminsFilePath,
            readType: 'local',
            autoReconnect: true,
        };
    const logsReader = new LogsReader(logsReaderConfig);
    return Promise.all([
        new Promise((res, rej) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                yield rcon.init();
                res({
                    rconEmitter: rcon,
                    close: rcon.close.bind(rcon),
                    execute: rcon.execute.bind(rcon),
                });
            }
            catch (error) {
                rej(error);
            }
        })),
        new Promise((res, rej) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                yield logsReader.init();
                res({
                    logsEmitter: logsReader,
                    getAdmins: logsReader.getAdminsFile.bind(logsReader),
                    close: logsReader.close.bind(logsReader),
                });
            }
            catch (error) {
                rej(error);
            }
        })),
    ]);
});

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const getConfigs = () => {
    const configPath = path.resolve(__dirname, '../config.json');
    if (!fs$1.existsSync(configPath)) {
        console.log(chalk.yellow(`[SquadJS]`), chalk.red('Config file required!'));
        return null;
    }
    const config = JSON.parse(fs$1.readFileSync(configPath, 'utf-8'));
    return Object.keys(config).map((key) => {
        for (const option of [
            'host',
            'password',
            'port',
            'logFilePath',
            'adminsFilePath',
            'mapsName',
            'plugins',
        ])
            if (!(option in config[key])) {
                console.log(chalk.yellow(`[SquadJS]`), chalk.red(`${option} required!`));
                process.exit(1);
            }
        return Object.assign({ id: parseInt(key, 10) }, config[key]);
    });
};

const initial = () => __awaiter(void 0, void 0, void 0, function* () {
    const configs = getConfigs();
    if (configs === null || configs === void 0 ? void 0 : configs.length) {
        for (const config of configs) {
            try {
                const [rcon, logs] = yield initServer(config);
                yield initSquadJS({
                    rcon,
                    logs,
                    id: config.id,
                    mapsName: config.mapsName,
                    plugins: config.plugins,
                    database: config.database,
                });
                yield connectToDatabase(config.db, config.database);
            }
            catch (error) {
                const err = error;
                if ((err === null || err === void 0 ? void 0 : err.id) && (err === null || err === void 0 ? void 0 : err.message)) {
                    console.log(chalk.yellow(`[SquadJS]`), chalk.red(`Server ${err.id} error: ${err.message}`));
                }
                else {
                    console.log(chalk.yellow(`[SquadJS]`), chalk.red(error));
                }
            }
        }
    }
});
initial();
