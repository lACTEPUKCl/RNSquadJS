import chalk from 'chalk';
import { format } from 'date-fns';
import { LogsReaderEvents, LogsReader } from 'squad-logs';
import { RconEvents, Rcon } from 'squad-rcon';
import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { EventEmitter } from 'node:events';
import EventEmitter$2, { EventEmitter as EventEmitter$1 } from 'events';
import axios from 'axios';
import url, { fileURLToPath } from 'url';
import fs$1 from 'fs/promises';
import { promisify } from 'util';

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

function __classPrivateFieldGet(receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}

function __classPrivateFieldSet(receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
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
const adminForceTeamChange = (execute, steamID) => __awaiter(void 0, void 0, void 0, function* () {
    yield execute(`AdminForceTeamChange ${steamID}`);
});
const adminKillServer = (execute) => __awaiter(void 0, void 0, void 0, function* () {
    yield execute(`AdminKillServer`);
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
    CHAT_COMMAND_SKIPMAP: 'CHAT_COMMAND:skipmap', CHAT_COMMAND_VOTEMAP: 'CHAT_COMMAND:votemap', CHAT_COMMAND_ADMINS: 'CHAT_COMMAND:admins', CHAT_COMMAND_REPORT: 'CHAT_COMMAND:report', CHAT_COMMAND_R: 'CHAT_COMMAND:r', CHAT_COMMAND_STVOL: 'CHAT_COMMAND:ролл', CHAT_COMMAND_ROLL: 'CHAT_COMMAND:roll', CHAT_COMMAND_FIX: 'CHAT_COMMAND:fix', CHAT_COMMAND_BONUS: 'CHAT_COMMAND:bonus', CHAT_COMMAND_STATS: 'CHAT_COMMAND:stats', CHAT_COMMAND_DISCORD: 'CHAT_COMMAND:discord', CHAT_COMMAND_SWITCH: 'CHAT_COMMAND:switch', CHAT_COMMAND_SWAP: 'CHAT_COMMAND:swap', CHAT_COMMAND_SW: 'CHAT_COMMAND:sw', CHAT_COMMAND_MSS: 'CHAT_COMMAND:mss' });
const UPDATERS_REJECT_TIMEOUT = 10000;
const UPDATE_TIMEOUT = 30000;

const getPlayerBySteamID = (state, steamID) => { var _a; return ((_a = state.players) === null || _a === void 0 ? void 0 : _a.find((player) => player.steamID === steamID)) || null; };
const getPlayerByEOSID = (state, eosID) => { var _a; return ((_a = state.players) === null || _a === void 0 ? void 0 : _a.find((player) => player.eosID === eosID)) || null; };
const getPlayerByName = (state, name) => { var _a; return ((_a = state.players) === null || _a === void 0 ? void 0 : _a.find((player) => player.name.includes(name))) || null; };
const getSquadByID = (state, squadID) => { var _a; return ((_a = state.squads) === null || _a === void 0 ? void 0 : _a.find((squad) => squad.squadID === squadID)) || null; };
const getAdmins = (state, adminPermission) => state.admins
    ? Object.keys(state.admins).filter((admin) => { var _a; return (_a = state.admins) === null || _a === void 0 ? void 0 : _a[admin][adminPermission]; })
    : null;
const getPlayers = (state) => state.players;

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
const cleaningTime = 604800000;
function connectToDatabase(dbURL) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = new MongoClient(dbURL);
        dbLink = dbURL;
        try {
            yield client.connect();
            console.log('Connected to MongoDB');
            db = client.db(dbName);
            collectionMain = db.collection(dbCollectionMain);
            collectionTemp = db.collection(dbCollectionTemp);
            collectionServerInfo = db.collection(dbCollectionServerInfo);
            isConnected = true;
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            setInterval(pingDatabase, 60000);
        }
        catch (err) {
            console.error('Error connecting to MongoDB:', err);
            isConnected = false;
            setReconnectTimer(dbLink);
        }
    });
}
function pingDatabase(dbLink) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const pingResult = yield db.command({ ping: 1 });
            if (pingResult.ok === 1) {
                console.log('Database pinged successfully');
            }
        }
        catch (error) {
            const getTime = () => format(new Date(), 'd LLL HH:mm:ss');
            console.error(`[${getTime()}]Error pinging database`);
            isConnected = false;
            setReconnectTimer(dbLink);
        }
    });
}
function setReconnectTimer(dbLink) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connectToDatabase(dbLink);
            }, 30000);
        }
    });
}
function createUserIfNullableOrUpdateName(steamID, name) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!db || !isConnected)
            return;
        try {
            const resultMain = yield collectionMain.findOne({
                _id: steamID,
            });
            const resultTemp = yield collectionTemp.findOne({
                _id: steamID,
            });
            const fields = {
                _id: steamID,
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
                squad: { timeplayed: 0, leader: 0, cmd: 0 },
                matches: {
                    matches: 0,
                    winrate: 0,
                    won: 0,
                    lose: 0,
                    history: { matches: [] },
                },
                weapons: {},
            };
            if (!resultMain) {
                yield collectionMain.insertOne(fields);
            }
            if (!resultTemp) {
                yield collectionTemp.insertOne(fields);
            }
            if (resultMain) {
                if (name.trim() !== resultMain.name.trim()) {
                    yield updateUserName(steamID, name.trim());
                }
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
function updateUserBonuses(steamID, count) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isConnected)
            return;
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
        yield collectionMain.updateOne(user, doc);
        yield collectionTemp.updateOne(user, doc);
        if (field === 'won' || field === 'lose') {
            const resultMain = yield collectionMain.findOne({
                _id: steamID,
            });
            const resultTemp = yield collectionTemp.findOne({
                _id: steamID,
            });
            const matchesMain = ((resultMain === null || resultMain === void 0 ? void 0 : resultMain.matches.won) || 0) + ((resultMain === null || resultMain === void 0 ? void 0 : resultMain.matches.lose) || 0);
            const matchesTemp = ((resultTemp === null || resultTemp === void 0 ? void 0 : resultTemp.matches.won) || 0) + ((resultTemp === null || resultTemp === void 0 ? void 0 : resultTemp.matches.lose) || 0);
            if (resultMain) {
                const doc = {
                    $set: {
                        'matches.matches': matchesMain,
                        'matches.winrate': Number(((resultMain.matches.won / matchesMain) * 100).toFixed(3)),
                    },
                };
                yield collectionMain.updateOne(user, doc);
            }
            if (resultTemp) {
                const doc = {
                    $set: {
                        'matches.matches': matchesTemp,
                        'matches.winrate': Number(((resultTemp.matches.won / matchesTemp) * 100).toFixed(3)),
                    },
                };
                yield collectionTemp.updateOne(user, doc);
            }
        }
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
function cleanHistoryLayers(serverID, rnsHistoryLayers) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isConnected)
            return;
        const result = yield collectionServerInfo.findOne({
            _id: serverID.toString(),
        });
        if (!result)
            return;
        const data = {
            $set: { rnsHistoryLayers: [rnsHistoryLayers] },
        };
        yield collectionServerInfo.updateOne(result, data);
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
    const autorestart = (data) => __awaiter(void 0, void 0, void 0, function* () {
        const lastRestartTime = yield getTimeStampForRestartServer(id);
        if (!lastRestartTime)
            return;
        if (new Date().getTime() - lastRestartTime > 86400000) {
            if (data.length === 0) {
                if (!isRestartTimeoutSet)
                    setRestartTimeout();
            }
            else {
                if (isRestartTimeoutSet) {
                    clearRestartTimeout();
                }
            }
        }
    });
    listener.on(EVENTS.UPDATED_PLAYERS, autorestart);
};

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
        const { players, currentMap } = state;
        if (!players)
            return;
        players.forEach((e) => {
            const { steamID } = e;
            if (!steamID)
                return;
            if (playersBonusesCurrentTime.find((e) => e.steamID === steamID))
                return;
            playersBonusesCurrentTime.push({
                steamID,
                timer: setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
                    var _a;
                    if ((_a = currentMap === null || currentMap === void 0 ? void 0 : currentMap.layer) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('seed')) {
                        yield updateUserBonuses(steamID, seedBonus);
                    }
                    else {
                        yield updateUserBonuses(steamID, classicBonus);
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
    const { adminsEnable, reportEnable, stvolEnable, fixEnable, discordEnable, statsEnable, bonusEnable, swapEnable, swapTimeout, statsTimeout, stvolTimeout, adminsMessage, reportMessage, stvolTimeOutMessage, discordMessage, statsTimeOutMessage, statsPlayerNotFoundMessage, bonusWarnMessage, } = options;
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
        const range = Math.floor(Math.random() * 100 + 1);
        adminBroadcast(execute, `Игроку ${name} выпало число ${range}`);
        players.push(steamID);
        setTimeout(() => {
            players = players.filter((player) => player !== steamID);
        }, parseInt(stvolTimeout));
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
            const { players } = state;
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
        const deletionTime = parseInt(swapTimeout);
        const { steamID } = data;
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
    listener.on(EVENTS.CHAT_COMMAND_ROLL, stvol);
    listener.on(EVENTS.CHAT_COMMAND_FIX, fix);
    listener.on(EVENTS.CHAT_COMMAND_BONUS, bonus);
    listener.on(EVENTS.CHAT_COMMAND_STATS, stats);
    listener.on(EVENTS.CHAT_COMMAND_DISCORD, discord);
    listener.on(EVENTS.CHAT_COMMAND_SWITCH, swap);
    listener.on(EVENTS.CHAT_COMMAND_SWAP, swap);
    listener.on(EVENTS.CHAT_COMMAND_SW, swap);
};

var _Analyzer_data, _Analyzer_options, _Analyzer_analysisPromise;
class Analyzer extends EventEmitter {
    constructor(data, options) {
        super({ captureRejections: true });
        _Analyzer_data.set(this, void 0);
        _Analyzer_options.set(this, void 0);
        _Analyzer_analysisPromise.set(this, null);
        __classPrivateFieldSet(this, _Analyzer_data, data, "f");
        __classPrivateFieldSet(this, _Analyzer_options, options, "f");
    }
    get options() {
        return __classPrivateFieldGet(this, _Analyzer_options, "f");
    }
    get data() {
        return __classPrivateFieldGet(this, _Analyzer_data, "f");
    }
    analyze() {
        __classPrivateFieldSet(this, _Analyzer_analysisPromise, new Promise((resolve, reject) => {
            const data = __classPrivateFieldGet(this, _Analyzer_data, "f");
            data.setVar('AnalysisStartTime', Date.now());
            data.setVar('ServerName', '');
            data.setVar('ServerVersion', '');
            data.setVar('ServerCPU', '');
            data.setVar('ServerVersionMajor', '');
            data.setVar('ServerOS', '');
            data.setVar('MaxQueue', 0);
            data.setVar('UniqueClientNetSpeedValues', new Set());
            data.setVar('ServerLiveTime', 0);
            data.setVar('ServerSeedingTime', 0);
            data.setVar('CalculateLiveTime', this.calcSeedingLiveTime);
            data.setVar('explosionCountersPerController', []);
            data.setVar('serverMoveTimestampExpiredPerController', []);
            data.setVar('pawnsToPlayerNames', []);
            data.setVar('pawnToSteamID', []);
            data.setVar('chainIdToPlayerController', []);
            data.setVar('playerNameToPlayerController', []);
            data.setVar('playerControllerToPlayerName', []);
            data.setVar('playerControllerToSteamID', []);
            data.setVar('steamIDToPlayerController', new Map());
            data.setVar('killsPerPlayerController', []);
            data.setVar('knifeWoundsPerPlayerController', []);
            const knives = [
                'BP_AK74Bayonet',
                'BP_AKMBayonet',
                'BP_Bayonet2000',
                'BP_G3Bayonet',
                'BP_M9Bayonet',
                'BP_OKC-3S',
                'BP_QNL-95_Bayonet',
                'BP_SA80Bayonet',
                'BP_SKS_Bayonet',
                'BP_SKS_Optic_Bayonet',
                'BP_SOCP_Knife_AUS',
            ];
            data.setVar('connectionTimesByPlayerController', []);
            data.setVar('disconnectionTimesByPlayerController', []);
            data.setVar('playerControllerToNetspeed', []);
            data.setVar('fobHitsPerController', []);
            this.on('line', (line) => {
                var _a;
                let regex, res;
                regex = /\[(.+)\]\[[\s\d]+\]LogSquad: .+: Server Tick Rate: (\d+.?\d+)/;
                res = regex.exec(line);
                if (res) {
                    const timePoint = this.getDateTime(res[1]);
                    data.addTimePoint(timePoint);
                    data.setNewCounterValue('tickRate', Math.round(+res[2]));
                    return;
                }
                regex = / ServerName: \'(.+)\' RegisterTimeout:/;
                res = regex.exec(line);
                if (res) {
                    data.setVar('ServerName', res[1]);
                    return;
                }
                regex = /LogInit: OS: .+, CPU: (.+), GPU:/;
                res = regex.exec(line);
                if (res) {
                    data.setVar('ServerCPU', res[1]);
                    return;
                }
                regex = /LogNetVersion: Set ProjectVersion to (V|v.+)\. Version/;
                res = regex.exec(line);
                if (res) {
                    let serverVersion = res[1];
                    data.setVar('ServerVersion', serverVersion);
                    data.setVar('ServerVersionMajor', +serverVersion.substring(1, 2));
                    return;
                }
                regex = /NotifyAcceptingChannel/;
                res = regex.exec(line);
                if (res) {
                    const val = data.incrementCounter('queue', 1).y;
                    const maxQueue = data.getVar('MaxQueue');
                    if (val > maxQueue)
                        data.setVar('MaxQueue', val);
                }
                regex =
                    /AUTH HANDLER: Sending auth result to user .+ with flag success\? 0/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('queueDisconnections', 3);
                    return;
                }
                regex = /LogOnline: Warning: STEAM: AUTH: Ticket from user .+ is empty/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('steamEmptyTicket', 1);
                    return;
                }
                regex = /CloseBunch/;
                res = regex.exec(line);
                if (res) {
                    data.incrementCounter('queue', -1);
                }
                regex = /LogSquad: PostLogin: NewPlayer:/;
                res = regex.exec(line);
                if (res) {
                    data.getVar('CalculateLiveTime')(data);
                    data.incrementCounter('players', 1);
                }
                regex =
                    /^\[([0-9.:-]+)]\[([ 0-9]*)]LogNet: UChannel::Close: Sending CloseBunch\. ChIndex == [0-9]+\. Name: \[UChannel\] ChIndex: [0-9]+, Closing: [0-9]+ \[UNetConnection\] RemoteAddr: (.+):[0-9]+, Name: (Steam|EOSIp)NetConnection_[0-9]+, Driver: GameNetDriver (Steam|EOS)NetDriver_[0-9]+, IsServer: YES, PC: ([^ ]+PlayerController_.*_[0-9]+), Owner: [^ ]+PlayerController_.*_[0-9]+/;
                res = regex.exec(line);
                if (res) {
                    data.getVar('CalculateLiveTime')(data);
                    data.incrementCounter('players', -1);
                    const disconnectionTimesByPlayerController = data.getVar('disconnectionTimesByPlayerController');
                    disconnectionTimesByPlayerController[res[6]] = this.getDateTime(res[1]);
                    return;
                }
                regex =
                    /LogOnlineGame: Display: Kicking player: .+ ; Reason = Host closed the connection/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('hostClosedConnection', 3);
                    return;
                }
                regex = /\[(.+)\].+LogSquad: OnPreLoadMap: Loading map .+\/([^\/]+)$/;
                res = regex.exec(line);
                if (res) {
                    const timePoint = this.getDateTime(res[1]);
                    data.setNewCounterValue('layers', 150, res[2], timePoint);
                    return;
                }
                regex =
                    /\[(.+)\]\[[\s\d]+].*LogWorld: SeamlessTravel to: .+\/([^\/]+)$/;
                res = regex.exec(line);
                if (res) {
                    data.setNewCounterValue('layers', 150, res[2]);
                    return;
                }
                regex =
                    /ApplyExplosiveDamage\(\).*DamageInstigator=([^ ]+PlayerController_.*_\d+) /;
                res = regex.exec(line);
                if (res) {
                    const playerController = res[1];
                    if (this.options.PLAYER_CONTROLLER_FILTER == '' ||
                        this.options.PLAYER_CONTROLLER_FILTER == playerController)
                        data.incrementFrequencyCounter('frags', 1);
                    const explosionCountersPerController = data.getVar('explosionCountersPerController');
                    if (!explosionCountersPerController[playerController])
                        explosionCountersPerController[playerController] = 0;
                    explosionCountersPerController[playerController]++;
                    return;
                }
                regex =
                    /ServerMove\: TimeStamp expired: ([\d\.]+), CurrentTimeStamp: ([\d\.]+), Character: (.+)/;
                res = regex.exec(line);
                if (res) {
                    const timestampExpired = +res[1];
                    const currentTimeStamp = +res[2];
                    const delta = currentTimeStamp - timestampExpired;
                    const playerName = data.getVar('pawnsToPlayerNames')[res[3]];
                    const pawnToSteamID = data.getVar('pawnToSteamID');
                    const steamID = pawnToSteamID[res[3]];
                    const steamIDToPlayerController = data.getVar('steamIDToPlayerController');
                    const playerControllerHistory = steamIDToPlayerController.get(steamID);
                    console.log(playerControllerHistory);
                    const lastPlayerController = [...playerControllerHistory].pop();
                    const playerNameToPlayerController = data.getVar('playerNameToPlayerController');
                    const playerController = steamID
                        ? lastPlayerController
                        : playerNameToPlayerController[playerName];
                    let unidentifiedPawns = data.getVar('UnidentifiedPawns');
                    if (!unidentifiedPawns) {
                        data.setVar('UnidentifiedPawns', new Set());
                        unidentifiedPawns = data.getVar('UnidentifiedPawns');
                    }
                    if (!playerController)
                        unidentifiedPawns.add(`${res[3]} - ${playerName} - ${steamID} - ${playerController}`);
                    if (this.options.PLAYER_CONTROLLER_FILTER == '' ||
                        this.options.PLAYER_CONTROLLER_FILTER == playerController)
                        data.incrementFrequencyCounter('serverMove', 0.05);
                    const serverMoveTimestampExpiredPerController = data.getVar('serverMoveTimestampExpiredPerController');
                    if (delta > 150 || !this.options.ENABLE_TSEXPIRED_DELTA_CHECK) {
                        if (!serverMoveTimestampExpiredPerController[playerController]) {
                            serverMoveTimestampExpiredPerController[playerController] = 0;
                        }
                        serverMoveTimestampExpiredPerController[playerController]++;
                    }
                    return;
                }
                regex = /Warning: UNetConnection::Tick/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('unetConnectionTick', 1);
                    return;
                }
                regex = /SetReplicates called on non-initialized actor/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('nonInitializedActor', 1);
                    return;
                }
                regex = /RotorWashEffectListener/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('rotorWashEffectListener', 1);
                    return;
                }
                regex = /\[(.+)\]\[([\s\d]+)\].+Client netspeed is (\d+)/;
                res = regex.exec(line);
                if (res) {
                    data.setNewCounterValue('clientNetSpeed', +res[3] / 1000);
                    data.getVar('UniqueClientNetSpeedValues').add(+res[3]);
                    const playerControllerToNetspeed = data.getVar('playerControllerToNetspeed');
                    const chainIdToPlayerController = data.getVar('chainIdToPlayerController');
                    const playerController = chainIdToPlayerController[+res[2]];
                    if (playerController) {
                        if (!playerControllerToNetspeed[playerController])
                            playerControllerToNetspeed[playerController] = [];
                        playerControllerToNetspeed[playerController].push(+res[3]);
                    }
                    return;
                }
                if (data.getVar('ServerVersionMajor') < 7) {
                    regex = /OnPossess\(\): PC=(.+) Pawn=(.+) FullPath/;
                    res = regex.exec(line);
                    let pawnsToPlayerNames;
                    if (res) {
                        pawnsToPlayerNames = data.getVar('pawnsToPlayerNames');
                        pawnsToPlayerNames[res[2]] = res[1];
                        const playerNameToPlayerController = data.getVar('playerNameToPlayerController');
                        const playerController = playerNameToPlayerController[res[1]];
                        const playerControllerToSteamID = data.getVar('playerControllerToSteamID');
                        const steamID = playerControllerToSteamID[playerController];
                        const pawnToSteamID = data.getVar('pawnToSteamID');
                        pawnToSteamID[res[2]] = steamID;
                    }
                    regex =
                        /\[(.+)\]\[([\s\d]+)\]LogSquad: PostLogin: NewPlayer: [^ ]+PlayerController_.*.+PersistentLevel\.(.+)/;
                    res = regex.exec(line);
                    if (res) {
                        const chainIdToPlayerController = data.getVar('chainIdToPlayerController');
                        const connectionTimesByPlayerController = data.getVar('connectionTimesByPlayerController');
                        chainIdToPlayerController[+res[2]] = res[3];
                        connectionTimesByPlayerController[res[3]] = this.getDateTime(res[1]);
                    }
                    regex = /Die\(\): Player:.+from (.+) caused by (.+)/;
                    res = regex.exec(line);
                    if (res) {
                        let playerController = res[1];
                        if (!playerController || playerController == 'nullptr') {
                            const playerNameToPlayerController = data.getVar('playerNameToPlayerController');
                            playerController =
                                playerNameToPlayerController[pawnsToPlayerNames[res[2]]];
                        }
                        if (this.options.PLAYER_CONTROLLER_FILTER == '' ||
                            this.options.PLAYER_CONTROLLER_FILTER == playerController)
                            data.incrementFrequencyCounter('PlayerKills', 1 / 5);
                        const killsPerPlayerController = data.getVar('killsPerPlayerController');
                        if (!killsPerPlayerController[playerController])
                            killsPerPlayerController[playerController] = 0;
                        killsPerPlayerController[playerController]++;
                        return;
                    }
                    regex = /Wound\(\): Player:.+from (.+) caused by (.+)/;
                    res = regex.exec(line);
                    if (res) {
                        let playerController = res[1];
                        if (!playerController || playerController == 'nullptr') {
                            const playerNameToPlayerController = data.getVar('playerNameToPlayerController');
                            const pawnsToPlayerNames = data.getVar('pawnsToPlayerNames');
                            playerController =
                                playerNameToPlayerController[pawnsToPlayerNames[res[2]]];
                        }
                        let weaponUsed = res[2];
                        // If weaponUsed is any of the knives
                        if (!knives.includes(weaponUsed)) {
                            return;
                        }
                        if (this.options.PLAYER_CONTROLLER_FILTER == '' ||
                            this.options.PLAYER_CONTROLLER_FILTER == playerController)
                            data.incrementFrequencyCounter('PlayerKnifeWounds', 1);
                        const knifeWoundsPerPlayerController = data.getVar('knifeWoundsPerPlayerController');
                        if (!knifeWoundsPerPlayerController[playerController])
                            knifeWoundsPerPlayerController[playerController] = 0;
                        knifeWoundsPerPlayerController[playerController]++;
                        return;
                    }
                }
                else {
                    regex =
                        /^\[([0-9.:-]+)]\[([ 0-9]*)]LogSquad: PostLogin: NewPlayer: BP_PlayerController_.* .+PersistentLevel\.(.+) \(IP: ([\d\.]+) \| Online IDs: EOS: (.+) steam: (\d+)\)/;
                    res = regex.exec(line);
                    if (res) {
                        const playerController = res[3];
                        res[2];
                        const currentGameTime = this.getDateTime(res[1]);
                        const chainIdToPlayerController = data.getVar('chainIdToPlayerController');
                        const connectionTimesByPlayerController = data.getVar('connectionTimesByPlayerController');
                        chainIdToPlayerController[+res[2]] = playerController;
                        connectionTimesByPlayerController[res[3]] = currentGameTime;
                        const steamID = res[6];
                        const playerControllerToSteamID = data.getVar('playerControllerToSteamID');
                        playerControllerToSteamID[playerController] = steamID;
                        const steamIDToPlayerController = data.getVar('steamIDToPlayerController');
                        const playerControllerHistory = steamIDToPlayerController.get(steamID);
                        if (!playerControllerHistory)
                            steamIDToPlayerController.set(steamID, [playerController]);
                        else
                            playerControllerHistory.push(playerController);
                        // const _controller = new PlayerController(chainID, playerController, currentGameTime)
                    }
                    regex =
                        /OnPossess\(\): PC=(.+) \(Online IDs: EOS: (.+) steam: (\d+)\) Pawn=(.+) FullPath/;
                    res = regex.exec(line);
                    if (res) {
                        const pawnToSteamID = data.getVar('pawnToSteamID');
                        pawnToSteamID[res[4]] = res[3];
                        data.getVar('pawnsToPlayerNames')[res[4]] = res[1];
                    }
                    regex =
                        /LogPhysics: Warning: Component FoliageInstancedStaticMeshComponent/;
                    res = regex.exec(line);
                    if (res) {
                        data.incrementFrequencyCounter('FoliageInstancedStaticMeshComponent', 1);
                    }
                    regex =
                        /^\[([0-9.:-]+)]\[([ 0-9]*)]LogSquadTrace: \[DedicatedServer](?:ASQSoldier::)?Die\(\): Player:(.+) KillingDamage=(?:-)*([0-9.]+) from ([A-z_0-9]+) \(Online IDs: EOS: ([\w\d]{32}) steam: (\d{17}) \| Contoller ID: ([\w\d]+)\) caused by ([A-z_0-9-]+)_C/;
                    res = regex.exec(line);
                    if (res) {
                        let playerController = res[5];
                        if (this.options.PLAYER_CONTROLLER_FILTER == '' ||
                            this.options.PLAYER_CONTROLLER_FILTER == playerController)
                            data.incrementFrequencyCounter('PlayerKills', 1 / 5);
                        const killsPerPlayerController = data.getVar('killsPerPlayerController');
                        if (!killsPerPlayerController[playerController])
                            killsPerPlayerController[playerController] = 0;
                        killsPerPlayerController[playerController]++;
                        return;
                    }
                    regex =
                        /^\[([0-9.:-]+)]\[([ 0-9]*)]LogSquadTrace: \[DedicatedServer](?:ASQSoldier::)?Wound\(\): Player:(.+) KillingDamage=(?:-)*([0-9.]+) from ([A-z_0-9]+) \(Online IDs: EOS: ([\w\d]{32}) steam: (\d{17}) \| Controller ID: ([\w\d]+)\) caused by ([A-z_0-9-]+)_C/;
                    res = regex.exec(line);
                    if (res) {
                        let playerController = res[5];
                        let weaponUsed = res[9];
                        // If weaponUsed is any of the knives
                        if (!knives.includes(weaponUsed)) {
                            return;
                        }
                        if (this.options.PLAYER_CONTROLLER_FILTER == '' ||
                            this.options.PLAYER_CONTROLLER_FILTER == playerController)
                            data.incrementFrequencyCounter('PlayerKnifeWounds', 1);
                        const knifeWoundsPerPlayerController = data.getVar('knifeWoundsPerPlayerController');
                        if (!knifeWoundsPerPlayerController[playerController])
                            knifeWoundsPerPlayerController[playerController] = 0;
                        knifeWoundsPerPlayerController[playerController]++;
                        return;
                    }
                }
                // regex = /\[.+\]\[([\s\d]+)\]LogSquad: Player (.+) has been added to Team/;
                // res = regex.exec(line);
                // if (res) {
                //     playerNameToPlayerController[ res[ 2 ] ] = chainIdToPlayerController[ +res[ 1 ] ];
                //     playerControllerToPlayerName[ chainIdToPlayerController[ +res[ 1 ] ] ] = res[ 2 ];
                //     return;
                // }
                regex = /\[(.+)\]\[([\s\d]+)\]LogNet: Join succeeded: (.+)/;
                res = regex.exec(line);
                if (res) {
                    const playerNameToPlayerController = data.getVar('playerNameToPlayerController');
                    const chainIdToPlayerController = data.getVar('chainIdToPlayerController');
                    const playerControllerToPlayerName = data.getVar('playerControllerToPlayerName');
                    playerNameToPlayerController[res[3]] =
                        chainIdToPlayerController[+res[2]];
                    playerControllerToPlayerName[chainIdToPlayerController[+res[2]]] =
                        res[3];
                    delete chainIdToPlayerController[+res[2]];
                    return;
                }
                regex =
                    /\[.+\]\[([\s\d]+)\]LogEOS: \[Category: LogEOSAntiCheat\] \[AntiCheatServer\] \[RegisterClient-001\].+AccountId: (\d+) IpAddress/;
                res = regex.exec(line);
                if (res) {
                    const chainIdToPlayerController = data.getVar('chainIdToPlayerController');
                    const playerController = chainIdToPlayerController[+res[1]];
                    if (playerController) {
                        const steamID = res[2];
                        const playerControllerToSteamID = data.getVar('playerControllerToSteamID');
                        playerControllerToSteamID[playerController] = steamID;
                        const steamIDToPlayerController = data.getVar('steamIDToPlayerController');
                        const playerControllerHistory = steamIDToPlayerController.get(steamID);
                        if (!playerControllerHistory)
                            steamIDToPlayerController.set(steamID, [playerController]);
                        else if (!playerControllerHistory.includes(playerController))
                            playerControllerHistory.push(playerController);
                    }
                    return;
                }
                regex =
                    /TakeDamage\(\): BP_FOBRadio_Woodland_C.+Online IDs: EOS: ([\w\d]{32}) steam: (\d{17})\)/;
                res = regex.exec(line);
                if (res) {
                    const fobHitsPerController = data.getVar('fobHitsPerController');
                    const steamIDToPlayerController = data.getVar('steamIDToPlayerController');
                    const playerController = [
                        ...steamIDToPlayerController.get(res[2]),
                    ].pop();
                    if (this.options.PLAYER_CONTROLLER_FILTER == '' ||
                        this.options.PLAYER_CONTROLLER_FILTER == playerController)
                        data.incrementFrequencyCounter('RadioHits', 0.1);
                    fobHitsPerController[playerController] =
                        (fobHitsPerController[playerController] || 0) + 1;
                    return;
                }
                regex =
                    /LogSquadVoiceChannel: Warning: Unable to find channel for packet sender/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('unableToFindVoiceChannel', 0.005);
                    return;
                }
                regex =
                    /DealDamage was called but there was no valid actor or component/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('dealDamageOnInvalidActorOrComponent', 1);
                    return;
                }
                regex = /TraceAndMessageClient\(\): SQVehicleSeat::TakeDamage/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('SQVehicleSeatTakeDamage', 1);
                    return;
                }
                regex = /LogSquadCommon: SQCommonStatics Check Permissions/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('SQCommonStaticsCheckPermissions', 1);
                    return;
                }
                regex = /Updated suppression multiplier/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('updatedSuppressionMultiplier', 1);
                    return;
                }
                regex = /PlayerWounded_Implementation\(\): Driver Assist Points:/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('driverAssistPoints', 1);
                    return;
                }
                regex = /Base Directory:.+\/([^\/]+)\/$/;
                res = regex.exec(line);
                if (res) {
                    data.setVar('ServerOS', res[1]);
                    return;
                }
                regex = /LogNet: NotifyAcceptingConnection accepted from/;
                res = regex.exec(line);
                if (res) {
                    data.incrementFrequencyCounter('AcceptedConnection', 0.001);
                    return;
                }
                regex =
                    /ChangeState\(\):.+OldState=(?<oldState>\w+) NewState=(?<newState>\w+)/;
                res = regex.exec(line);
                if (res) {
                    const state = (_a = res.groups) === null || _a === void 0 ? void 0 : _a.newState;
                    switch (state === null || state === void 0 ? void 0 : state.toLowerCase()) {
                        case 'playing':
                            data.incrementCounter('SpawnedCount', 1);
                            break;
                        case 'inactive':
                            data.incrementCounter('SpawnedCount', -1);
                            break;
                    }
                    return;
                }
            });
            this.on('error', (err) => {
                reject(err);
            });
        }), "f");
        return __classPrivateFieldGet(this, _Analyzer_analysisPromise, "f");
    }
    close() {
        const data = __classPrivateFieldGet(this, _Analyzer_data, "f");
        const startTime = data.getVar('AnalysisStartTime');
        const analysisEndTime = Date.now();
        const analysisDurationMs = analysisEndTime - startTime;
        const analysisDuration = (analysisDurationMs / 1000).toFixed(1);
        data.setVar('AnalysisEndTime', analysisEndTime);
        data.setVar('AnalysisDurationMs', analysisDurationMs);
        data.setVar('AnalysisDuration', analysisDuration);
        this.emit('close', __classPrivateFieldGet(this, _Analyzer_data, "f"));
        return __classPrivateFieldGet(this, _Analyzer_data, "f");
    }
    getDateTime(date) {
        const parts = date.replace(/:\d+$/, '').replace(/-/, 'T').split('T');
        parts[0] = parts[0].replace(/\./g, '-');
        parts[1] = parts[1].replace(/\./g, ':');
        const res = `${parts.join('T')}Z`;
        return new Date(res);
    }
    calcSeedingLiveTime(data, liveThreshold = 75, seedingMinThreshold = 2) {
        const prevAmountPlayersData = data.getCounterLastValue('players');
        if (!prevAmountPlayersData)
            return;
        if (prevAmountPlayersData.y >= liveThreshold) {
            data.setVar('SeedingDone', true);
            const prevLiveTime = data.getVar('ServerLiveTime');
            const curTime = data.getLastTimePoint().time;
            const timeDiff = +curTime - +prevAmountPlayersData.time;
            data.setVar('ServerLiveTime', prevLiveTime + timeDiff);
        }
        else if (prevAmountPlayersData.y >= seedingMinThreshold) {
            if (data.getVar('SeedingDone'))
                return;
            else
                data.setVar('SeedingDone', false);
            const prevLiveTime = data.getVar('ServerSeedingTime');
            const curTime = data.getLastTimePoint().time;
            const timeDiff = +curTime - +prevAmountPlayersData.time;
            data.setVar('ServerSeedingTime', prevLiveTime + timeDiff);
        }
    }
}
_Analyzer_data = new WeakMap(), _Analyzer_options = new WeakMap(), _Analyzer_analysisPromise = new WeakMap();

var _DataStore_resetFrequencySeconds;
const RESET_FREQUENCY_SECONDS_DEFAULT = 120;
class DataStore extends EventEmitter$1 {
    constructor(resetFrequencySeconds = RESET_FREQUENCY_SECONDS_DEFAULT) {
        super();
        _DataStore_resetFrequencySeconds.set(this, void 0);
        __classPrivateFieldSet(this, _DataStore_resetFrequencySeconds, resetFrequencySeconds, "f");
        this.timePoints = [];
        this.counters = new Map();
        this.vars = new Map();
    }
    get resetFrequencySeconds() {
        return __classPrivateFieldGet(this, _DataStore_resetFrequencySeconds, "f");
    }
    incrementCounter(key, incrementer, time = null) {
        const counter = this.counters.get(key);
        const value = +((counter === null || counter === void 0 ? void 0 : counter.length) ? counter[counter.length - 1].y : 0) + incrementer;
        return this.setNewCounterValue(key, value, undefined, time);
    }
    incrementCounterLast(key, incrementer) {
        const counter = this.counters.get(key);
        if (counter && counter.length > 0) {
            counter[counter.length - 1].y += incrementer;
        }
    }
    incrementFrequencyCounter(key, incrementer) {
        const timeNow = this.getLastTimePoint();
        const counter = this.counters.get(key);
        if (!counter ||
            +timeNow.time - +counter[counter.length - 1].time >
                __classPrivateFieldGet(this, _DataStore_resetFrequencySeconds, "f") * 1000) {
            this.resetFrequencyCounter(key);
        }
        this.incrementCounterLast(key, incrementer);
    }
    resetFrequencyCounter(key) {
        this.getPreLastTimePoint();
        const counter = this.counters.get(key);
        if (counter === null || counter === void 0 ? void 0 : counter.length) {
            this.setNewCounterValue(key, 0, undefined, counter[counter.length - 1].time, true);
        }
        this.setNewCounterValue(key, 0);
    }
    setNewCounterValue(key, value, label, time = null, skipDuplication = false) {
        var _a, _b;
        let timePoint;
        if (time && +time > 0) {
            timePoint = this.addTimePoint(time instanceof Date ? time : new Date(time));
        }
        else {
            timePoint = this.getLastTimePoint();
        }
        const oldCounter = this.counters.get(key);
        if (!oldCounter) {
            this.counters.set(key, []);
        }
        const newObj = {
            y: value,
            x: timePoint.formatted,
            time: timePoint.time,
            label: label,
        };
        if (oldCounter && !skipDuplication) {
            const oldObjDuplication = {
                y: oldCounter[oldCounter.length - 1].y,
                x: timePoint.formatted,
                time: timePoint.time,
                label: label,
            };
            (_a = this.counters.get(key)) === null || _a === void 0 ? void 0 : _a.push(oldObjDuplication);
        }
        (_b = this.counters.get(key)) === null || _b === void 0 ? void 0 : _b.push(newObj);
        return newObj;
    }
    addTimePoint(time) {
        const obj = {
            time: time,
            formatted: time.toLocaleString(),
        };
        if (!this.timePoints.find((t) => +t.time === +obj.time)) {
            this.timePoints.push(obj);
        }
        return obj;
    }
    getLastTimePoint() {
        return this.timePoints[this.timePoints.length - 1];
    }
    getPreLastTimePoint() {
        return this.timePoints[this.timePoints.length - 2];
    }
    getTimePoints() {
        return this.timePoints.map((p) => p.formatted);
    }
    getCounterData(key) {
        return this.counters.get(key) || [];
    }
    getCounterLastValue(key) {
        const data = this.getCounterData(key);
        return data[data.length - 1];
    }
    getCounters() {
        return [...this.counters.keys()];
    }
    setVar(key, value) {
        this.vars.set(key, value);
    }
    getVarKeys() {
        return [...this.vars.keys()];
    }
    getVar(key) {
        return this.vars.get(key);
    }
}
_DataStore_resetFrequencySeconds = new WeakMap();

const dpacAnticheat = (state, options) => {
    const { execute, logger, players } = state;
    const { logDir, liveThreshold, seedingMinThreshold, explosionThreshold, serverMoveTimeStampExpiredThreshold, knifeWoundsThreshold, fobHitsThreshold, enableEmbed, color, pingGroups, enableFullLog, warnInGameAdmins, interval, } = options;
    const uniqueRowsSet = new Set();
    setInterval(cheaterCheck, 3000);
    function cheaterCheck() {
        return __awaiter(this, void 0, void 0, function* () {
            const logDirectory = logDir;
            const logFile = fs
                .readdirSync(logDirectory)
                .find((f) => f.endsWith('SquadGame.log'));
            if (!logFile) {
                logger.error('(DPAC) Anticheat: No log file found.');
                return;
            }
            logger.log(`(DPAC) Anticheat: Log found: ${logFile}`);
            const logPath = path.join(logDirectory, logFile);
            const fileNameNoExt = logFile.replace(/\.[^\.]+$/, '');
            try {
                yield fs.promises.access(logPath, fs.constants.R_OK);
            }
            catch (error) {
                logger.error(`\n\x1b[1m\x1b[34mUnable to read: \x1b[32m${fileNameNoExt}\x1b[0m`);
            }
            const fileStream = fs.createReadStream(logPath);
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity,
            });
            const optionsAnalyzer = {
                ENABLE_TSEXPIRED_DELTA_CHECK: true,
                PLAYER_CONTROLLER_FILTER: '', // To move to a better place. Set to a real player controller value like BP_PlayerController_C_2146648925 to filter the graph (partially implemented)
                LIVE_THRESHOLD: liveThreshold,
                SEEDING_MIN_THRESHOLD: seedingMinThreshold,
            };
            const data = new DataStore();
            const analyzer = new Analyzer(data, optionsAnalyzer);
            data.on('close', (data) => {
                var _a;
                console.log('Event data:', data);
                if (!data.getVar('ServerName'))
                    data.setVar('ServerName', fileNameNoExt);
                const serverUptimeMs = +data.timePoints[data.timePoints.length - 1].time -
                    +data.timePoints[0].time;
                const serverUptimeHours = (serverUptimeMs / 1000 / 60 / 60).toFixed(1);
                const startTime = data.getVar('AnalysisStartTime');
                const totalEndTime = Date.now();
                data.setVar('TotalEndTime', totalEndTime);
                const analysisDuration = data.getVar('AnalysisDuration');
                const totalDurationMs = totalEndTime - startTime;
                const totalDuration = (totalDurationMs / 1000).toFixed(1);
                data.setVar('TotalDurationMs', totalDurationMs);
                data.setVar('TotalDuration', totalDuration);
                const liveTime = (data.getVar('ServerLiveTime') /
                    1000 /
                    60 /
                    60).toFixed();
                const seedingTime = (data.getVar('ServerSeedingTime') /
                    1000 /
                    60 /
                    60).toFixed(1);
                let contentBuilding = [];
                contentBuilding.push({
                    row: `### ${data.getVar('ServerName')} SERVER STAT REPORT: ${fileNameNoExt} ###`,
                });
                contentBuilding.push({
                    row: `# == Server CPU: ${data.getVar('ServerCPU')}`,
                });
                contentBuilding.push({
                    row: `# == Server OS: ${data.getVar('ServerOS')}`,
                });
                contentBuilding.push({
                    row: `# == Squad Version: ${data.getVar('ServerVersion')}`,
                });
                contentBuilding.push({
                    row: `# == Server Uptime: ${serverUptimeHours} h`,
                });
                contentBuilding.push({ row: `# == Server Seeding Time: ${seedingTime}` });
                contentBuilding.push({ row: `# == Server Live Time: ${liveTime}` });
                contentBuilding.push({
                    row: `# == Host Closed Connections: ${data
                        .getCounterData('hostClosedConnection')
                        .map((e) => e.y / 3)
                        .reduce((acc, curr) => acc + curr, 0)}`,
                });
                contentBuilding.push({
                    row: `# == Failed Queue Connections: ${data
                        .getCounterData('queueDisconnections')
                        .map((e) => e.y / 3)
                        .reduce((acc, curr) => acc + curr, 0)}`,
                });
                contentBuilding.push({
                    row: `# == Steam Empty Tickets: ${data
                        .getCounterData('steamEmptyTicket')
                        .map((e) => e.y)
                        .reduce((acc, curr) => acc + curr, 0)}`,
                });
                /*       contentBuilding.push({
                row: `# == Unique Client NetSpeed Values: ${[
                  ...data.getVar('UniqueClientNetSpeedValues').values()
                ].join('; ')}`
              }); */
                contentBuilding.push({
                    row: `# == Accepted Connection Lines (Cap is 50,000): ${data
                        .getCounterData('AcceptedConnection')
                        .map((e) => Math.round(e.y * 1000))
                        .reduce((acc, curr) => acc + curr, 0)}`,
                });
                contentBuilding.push({
                    row: `# == Analysis duration: ${analysisDuration}s`,
                });
                contentBuilding.push({ row: `# == Total duration: ${totalDuration}s` });
                contentBuilding.push({
                    row: `### ${data.getVar('ServerName')} SUSPECTED CHEATER REPORT: ${fileNameNoExt} ###`,
                });
                logger.log(`\n\x1b[1m\x1b[34m### ${data.getVar('ServerName')} SERVER STAT REPORT: \x1b[32m${fileNameNoExt}\x1b[34m ###\x1b[0m`);
                logger.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mServer Name:\x1b[0m ${data.getVar('ServerName')}`);
                logger.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mServer CPU:\x1b[0m ${data.getVar('ServerCPU')}`);
                logger.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mServer OS:\x1b[0m ${data.getVar('ServerOS')}`);
                logger.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mSquad Version:\x1b[0m ${data.getVar('ServerVersion')}`);
                logger.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mServer Uptime:\x1b[0m ${serverUptimeHours} h`);
                logger.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mServer Live Time:\x1b[0m ${liveTime} h`);
                logger.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mServer Seeding Time:\x1b[0m ${seedingTime} h`);
                logger.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mHost Closed Connections:\x1b[0m ${data
                    .getCounterData('hostClosedConnection')
                    .map((e) => e.y / 3)
                    .reduce((acc, curr) => acc + curr, 0)}`);
                logger.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mFailed Queue Connections:\x1b[0m ${data
                    .getCounterData('queueDisconnections')
                    .map((e) => e.y / 3)
                    .reduce((acc, curr) => acc + curr, 0)}`);
                logger.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mSteam Empty Tickets:\x1b[0m ${data
                    .getCounterData('steamEmptyTicket')
                    .map((e) => e.y)
                    .reduce((acc, curr) => acc + curr, 0)}`);
                /*       logger.log(
                
                `\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mUnique Client NetSpeed Values:\x1b[0m ${[
                  ...data.getVar('UniqueClientNetSpeedValues').values()
                ].join('; ')}`
              ); */
                logger.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mAccepted Connection Lines (Cap is 50,000):\x1b[0m ${data
                    .getCounterData('AcceptedConnection')
                    .map((e) => Math.round(e.y * 1000))
                    .reduce((acc, curr) => acc + curr, 0)}`);
                logger.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mAnalysis duration:\x1b[0m ${analysisDuration}s`);
                logger.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mTotal duration:\x1b[0m ${totalDuration}s`);
                logger.log(`\x1b[1m\x1b[34m### CHEATING REPORT: \x1b[32m${data.getVar('ServerName')}\x1b[34m ###\x1b[0m`);
                const cheaters = {
                    Explosions: data.getVar('explosionCountersPerController'),
                    ServerMoveTimeStampExpired: data.getVar('serverMoveTimestampExpiredPerController'),
                    //ClientNetSpeed: data.getVar('playerControllerToNetspeed'),
                    KnifeWounds: data.getVar('knifeWoundsPerPlayerController'),
                    FOBHits: data.getVar('fobHitsPerController'),
                };
                let suspectedCheaters = new Set();
                for (let cK in cheaters) {
                    let minCount = 200;
                    switch (cK) {
                        case 'Explosions':
                            if (+explosionThreshold === 0) {
                                break;
                            }
                            else {
                                minCount = +explosionThreshold;
                                break;
                            }
                        case 'ServerMoveTimeStampExpired':
                            if (+serverMoveTimeStampExpiredThreshold === 0) {
                                break;
                            }
                            else {
                                minCount = +serverMoveTimeStampExpiredThreshold;
                                break;
                            }
                        /* case 'ClientNetSpeed':
                        if (this.options.clientNetSpeedThreshold === 0) {
                          break;
                        } else {
                          minCount = this.options.clientNetSpeedThreshold;
                          break;
                        } */
                        case 'KnifeWounds':
                            if (+knifeWoundsThreshold === 0) {
                                break;
                            }
                            else {
                                minCount = +knifeWoundsThreshold;
                                break;
                            }
                        case 'FOBHits':
                            if (+fobHitsThreshold === 0) {
                                break;
                            }
                            else {
                                minCount = +fobHitsThreshold;
                                break;
                            }
                    }
                    contentBuilding.push({ row: `# == ${cK.toUpperCase()}` });
                    logger.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31m${cK.toUpperCase()}\x1b[0m`);
                    for (let playerId in cheaters[cK]) {
                        const referenceValue = cheaters[cK][playerId];
                        if ((typeof referenceValue === 'number' && referenceValue > minCount) ||
                            (typeof referenceValue === 'object' &&
                                referenceValue.find((v) => v > minCount))) {
                            let playerName;
                            let playerSteamID;
                            let playerController;
                            playerController = playerId;
                            const playerControllerToPlayerName = data.getVar('playerControllerToPlayerName');
                            const playerControllerToSteamID = data.getVar('playerControllerToSteamID');
                            playerName = playerControllerToPlayerName[playerController];
                            playerSteamID = playerControllerToSteamID[playerController];
                            const row = `#  > ${playerSteamID} | ${playerController} | ${playerName}: ${cheaters[cK][playerId]}`;
                            // Check if the row is already in the set
                            if (!uniqueRowsSet.has(row)) {
                                suspectedCheaters.add(playerSteamID);
                                uniqueRowsSet.add(row);
                                contentBuilding.push({ row });
                                logger.log(`\x1b[1m\x1b[34m#\x1b[0m  > \x1b[33m${playerSteamID}\x1b[90m ${playerController}\x1b[37m ${playerName}\x1b[90m: \x1b[91m${cheaters[cK][playerId]}\x1b[0m`);
                            }
                        }
                    }
                }
                if (suspectedCheaters.size === 0) {
                    logger.log(`\x1b[1m\x1b[34m### NO SUSPECTED CHEATERS FOUND: \x1b[32m${data.getVar('ServerName')}\x1b[34m ###\x1b[0m`);
                    return;
                }
                else {
                    contentBuilding.push({
                        row: `### SUSPECTED CHEATERS SESSIONS: ${data.getVar('ServerName')} ###`,
                    });
                    logger.log(`\x1b[1m\x1b[34m### SUSPECTED CHEATERS SESSIONS: \x1b[32m${data.getVar('ServerName')}\x1b[34m ###\x1b[0m`);
                    let suspectedCheatersNames = [];
                    for (let playerSteamID of suspectedCheaters) {
                        const disconnectionTimesByPlayerController = data.getVar('disconnectionTimesByPlayerController');
                        const connectionTimesByPlayerController = data.getVar('connectionTimesByPlayerController');
                        const explosionCountersPerController = data.getVar('explosionCountersPerController');
                        const serverMoveTimestampExpiredPerController = data.getVar('serverMoveTimestampExpiredPerController');
                        data.getVar('playerControllerToNetspeed');
                        const killsPerPlayerController = data.getVar('killsPerPlayerController');
                        const knifeWoundsPerPlayerController = data.getVar('knifeWoundsPerPlayerController');
                        const fobHitsPerController = data.getVar('fobHitsPerController');
                        const steamIDToPlayerController = data.getVar('steamIDToPlayerController');
                        const playerControllerHistory = steamIDToPlayerController.get(playerSteamID);
                        if (!playerControllerHistory)
                            continue;
                        const playerControllerToPlayerName = data.getVar('playerControllerToPlayerName');
                        let playerName = playerControllerToPlayerName[playerControllerHistory[0]];
                        suspectedCheatersNames.push(playerName);
                        contentBuilding.push({
                            row: `# == ${playerSteamID} | ${playerName}`,
                        });
                        logger.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[33m${playerSteamID} \x1b[37m${playerName}\x1b[90m`);
                        for (let playerController of playerControllerHistory) {
                            let stringifiedConnectionTime = connectionTimesByPlayerController[playerController].toLocaleString();
                            let stringifiedDisconnectionTime = ((_a = disconnectionTimesByPlayerController[playerController]) === null || _a === void 0 ? void 0 : _a.toLocaleString()) || 'N/A';
                            contentBuilding.push({
                                row: `#  >  ${playerController}: (${stringifiedConnectionTime} - ${stringifiedDisconnectionTime})`,
                            });
                            contentBuilding.push({
                                row: `#  >>>>>${explosionCountersPerController[playerController] || 0} Explosions, ${serverMoveTimestampExpiredPerController[playerController] || 0} ServerMoveTimeStampExpired, ${killsPerPlayerController[playerController] || 0} Kills, ${knifeWoundsPerPlayerController[playerController] || 0} Knife Wounds, ${fobHitsPerController[playerController] || 0} FOB Hits`,
                            });
                            logger.log(`\x1b[1m\x1b[34m#\x1b[0m  > \x1b[90m ${playerController}\x1b[90m: \x1b[37m(${stringifiedConnectionTime} - ${stringifiedDisconnectionTime})\x1b[90m`);
                            logger.log(`\x1b[1m\x1b[34m#\x1b[0m  >>>>> \x1b[91m${explosionCountersPerController[playerController] || 0} Explosions, ${serverMoveTimestampExpiredPerController[playerController] || 0} ServerMoveTimeStampExpired, ${killsPerPlayerController[playerController] || 0} Kills, ${knifeWoundsPerPlayerController[playerController] || 0} Knife Wounds, ${fobHitsPerController[playerController] || 0} FOB Hits\x1b[0m`);
                            if (enableEmbed) {
                                `\`\`\`# == ${playerSteamID} | ${playerName}
# > ${playerController}: (${stringifiedConnectionTime} - ${stringifiedDisconnectionTime}
#  >>>>>${explosionCountersPerController[playerController] || 0} Explosions
#  >>>>>${serverMoveTimestampExpiredPerController[playerController] || 0} ServerMoveTimeStampExpired
#  >>>>>${killsPerPlayerController[playerController] || 0} Kills
#  >>>>>${knifeWoundsPerPlayerController[playerController] || 0} Knife Wounds
#  >>>>>${fobHitsPerController[playerController] || 0} FOB Hits
\`\`\``;
                                //this.sendDiscordMessage(message);
                            }
                        }
                    }
                    const unidentifiedPawns = data.getVar('UnidentifiedPawns');
                    if ((unidentifiedPawns === null || unidentifiedPawns === void 0 ? void 0 : unidentifiedPawns.size) > 0) {
                        logger.log(`\x1b[1m\x1b[34m### UNIDENTIFIED PAWNS: \x1b[32m${data.getVar('ServerName')}\x1b[34m ###\x1b[0m`);
                        contentBuilding.push({
                            row: `#### UNIDENTIFIED PAWNS: ${data.getVar('ServerName')} ###`,
                        });
                        for (let pawn of unidentifiedPawns) {
                            logger.log(`\x1b[ 1m\x1b[ 34m#\x1b[ 0m == \x1b[ 1m${pawn} \x1b[ 0m`);
                            contentBuilding.push({ row: `# == ${pawn}` });
                        }
                    }
                    contentBuilding.push({
                        row: `#### FINISHED ALL REPORTS: ${data.getVar('ServerName')} ###`,
                    });
                    logger.log(`\x1b[1m\x1b[34m### FINISHED ALL REPORTS: \x1b[32m${data.getVar('ServerName')}\x1b[34m ###\x1b[0m`);
                    if (pingGroups.length > 0) ;
                    const maxCharacterLimit = 2000;
                    let currentMessage = '';
                    // this.sendDiscordMessage({
                    //   content: `${pingables}\nJust because a "SUSPECTED CHEATER" is list in the Output does NOT *always* guarantee they are a Cheater. Verify with recorded in-game footage if possible. Get with https://discord.gg/onlybans to go over the results in more detail if you are not sure.\n\nFor more information on what each line means in the output, please visit: https://www.guardianonlybans.com/logcheck-info`,
                    // });
                    if (enableFullLog) {
                        for (const item of contentBuilding) {
                            const row = item.row + '\n';
                            if (currentMessage.length + row.length <= maxCharacterLimit) {
                                // If adding the row doesn't exceed the character limit, add it to the current message
                                currentMessage += row;
                            }
                            else {
                                // If adding the row exceeds the character limit, send the current message
                                // this.sendDiscordMessage({
                                //   content: `\`\`\`\n${currentMessage}\n\`\`\``,
                                // });
                                // Start a new message with the current row
                                currentMessage = row;
                            }
                        }
                        // Send the remaining message if any
                        // if (currentMessage.length > 0) {
                        //   this.sendDiscordMessage({
                        //     content: `\`\`\`\n${currentMessage}\n\`\`\``,
                        //   });
                        // }
                    }
                    console.log(currentMessage);
                    warnInGameAdmin(suspectedCheatersNames);
                }
            });
            rl.on('line', (line) => {
                analyzer.emit('line', line);
            });
            rl.on('close', () => {
                analyzer.close();
            });
            rl.on('error', (err) => {
                logger.log(err);
            });
            yield analyzer.analyze();
        });
    }
    function warnInGameAdmin(suspectedCheatersNames) {
        return __awaiter(this, void 0, void 0, function* () {
            const admins = getAdmins(state, 'canseeadminchat');
            if (!players)
                return;
            for (const player of players) {
                if (!(admins === null || admins === void 0 ? void 0 : admins.includes(player.steamID)))
                    continue;
                if (warnInGameAdmins) {
                    const cheatersList = [...suspectedCheatersNames].join('\n');
                    adminWarn(execute, player.steamID, `Suspected Cheater(s) Found!\n${cheatersList}`);
                }
            }
        });
    }
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

const mySquadStats = (state, options) => __awaiter(void 0, void 0, void 0, function* () {
    const { listener, execute, logger, currentMap, serverInfo } = state;
    const { accessToken } = options;
    const serverName = serverInfo === null || serverInfo === void 0 ? void 0 : serverInfo.serverName;
    let match;
    let trackedKillstreaks = {};
    let isProcessingFailedRequests;
    const currentVersion = 'v4.2.3';
    checkVersion();
    setInterval(() => pingMySquadStats(), 60000);
    // Post Request to create Server in API
    let dataType = 'servers';
    const serverData = {
        name: serverName,
        version: currentVersion,
    };
    const response = yield postDataToAPI(dataType, serverData, accessToken);
    if (response.successStatus === 'Error')
        console.log(response);
    logger.error(`Mount-Server | ${response.successStatus} | ${response.successMessage}`);
    // Get Request to get Match Info from API
    dataType = 'matches';
    const matchResponse = yield getDataFromAPI(dataType, accessToken);
    match = matchResponse.match;
    if (response.successStatus === 'Error')
        logger.error(`Mount-Match | ${matchResponse.successStatus} | ${matchResponse.successMessage}`);
    // Get Admins
    const admins = getAdmins(state, 'cameraman');
    if (!admins)
        return;
    // Make a players request to the API for each admin
    for (let i = 0; i < admins.length; i++) {
        const adminId = admins[i];
        let playerData = {};
        playerData = {
            steamID: adminId,
            isAdmin: 1,
        };
        const dataType = 'players';
        const response = yield patchDataInAPI(dataType, playerData, accessToken);
        // Only log the response if it's an error
        if (response.successStatus === 'Error')
            logger.error(`Mount-Admins | ${response.successStatus} | ${response.successMessage}`);
    }
    const onChatCommand = (data) => __awaiter(void 0, void 0, void 0, function* () {
        // Check if message is empty
        if (data.message.length === 0) {
            yield adminWarn(execute, data.steamID, `Please input your Link Code given by MySquadStats.com.`);
            return;
        }
        // Check if message is not the right length
        if (data.message.length !== 6) {
            yield adminWarn(execute, data.steamID, `Please input a valid 6-digit Link Code.`);
            return;
        }
        // Get Player from API
        let dataType = `players?search=${data.steamID}`;
        let response = yield getDataFromAPI(dataType, accessToken);
        if (response.successStatus === 'Error') {
            yield adminWarn(execute, data.steamID, `An error occurred while trying to link your account.\nPlease try again later.`);
            return;
        }
        const player = response.data[0];
        // If discordID is already linked, return error
        if (player.discordID !== 'Unknown') {
            yield adminWarn(execute, data.steamID, `Your account is already linked.\nContact an MySquadStats.com if this is wrong.`);
            return;
        }
        // Post Request to link Player in API
        dataType = 'playerLink';
        const linkData = {
            steamID: data.steamID,
            code: data.message,
        };
        response = yield postDataToAPI(dataType, linkData, accessToken);
        if (response.successStatus === 'Error') {
            yield adminWarn(execute, data.steamID, `${response.successMessage}\nPlease try again later.`);
            return;
        }
        yield adminWarn(execute, data.steamID, `Thank you for linking your accounts.`);
    });
    const onNewGame = (info) => __awaiter(void 0, void 0, void 0, function* () {
        // Post Request to create Server in API
        let dataType = 'servers';
        const serverData = {
            name: serverName,
            version: currentVersion,
        };
        const serverResponse = yield postDataToAPI(dataType, serverData, accessToken);
        logger.log(`NewGame-Server | ${serverResponse.successStatus} | ${serverResponse.successMessage}`);
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
        const matchResponse = yield postDataToAPI(dataType, newMatchData, accessToken);
        match = matchResponse.match;
        if (matchResponse.successStatus === 'Error') {
            logger.error(`NewGame-Post-Match${matchResponse.successStatus} | ${matchResponse.successMessage}`);
        }
    });
    const onRoundTickets = (info) => __awaiter(void 0, void 0, void 0, function* () {
        // Patch Request to update last Match in API
        if (info.action === 'lost')
            return;
        dataType = 'matches';
        const matchData = {
            endTime: info.time,
            winner: info.subfaction,
        };
        const updateResponse = yield patchDataInAPI(dataType, matchData, accessToken);
        if (updateResponse.successStatus === 'Error') {
            logger.error(`NewGame-Patch-Match | ${updateResponse.successStatus} | ${updateResponse.successMessage}`);
        }
    });
    function postDataToAPI(dataType, data, accessToken) {
        return __awaiter(this, void 0, void 0, function* () {
            const __dirname = fileURLToPath(import.meta.url);
            try {
                const response = yield axios.post(`https://mysquadstats.com/api/${dataType}`, data, {
                    params: { accessToken },
                });
                return response.data;
            }
            catch (error) {
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
        });
    }
    function getDataFromAPI(dataType, accessToken) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield axios.get(`https://mysquadstats.com/api/${dataType}`, {
                    params: { accessToken },
                });
                return response.data;
            }
            catch (error) {
                return handleApiError(error);
            }
        });
    }
    function onPlayerConnected(info) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            let playerData = {};
            const players = getPlayers(state);
            if (players &&
                players.length <= 50 &&
                currentMap &&
                ((_a = currentMap.layer) === null || _a === void 0 ? void 0 : _a.includes('seed'))) {
                playerData = {
                    isSeeder: 1,
                };
            }
            // Patch Request to create Player in API
            const dataType = 'players';
            const player = getPlayerBySteamID(state, info.steamID);
            playerData = Object.assign(Object.assign({}, playerData), { eosID: info.eosID, steamID: info.steamID, lastName: player ? player.name : null, lastIP: info.ip });
            const response = yield patchDataInAPI(dataType, playerData, accessToken);
            if (response.successStatus === 'Error') {
                logger.error(`Connected-Player | ${response.successStatus} | ${response.successMessage}`);
            }
        });
    }
    function onPlayerWounded(info) {
        return __awaiter(this, void 0, void 0, function* () {
            // Post Request to create Wound in API
            const dataType = 'wounds';
            const victimPlayer = getPlayerByName(state, info.victimName);
            const attackerPlayer = getPlayerBySteamID(state, info.attackerSteamID);
            let teamkill = false;
            if ((attackerPlayer === null || attackerPlayer === void 0 ? void 0 : attackerPlayer.teamID) === (victimPlayer === null || victimPlayer === void 0 ? void 0 : victimPlayer.teamID))
                teamkill = true;
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
            const response = yield postDataToAPI(dataType, woundData, accessToken);
            if (response.successStatus === 'Error') {
                logger.error(`Wounds-Wound | ${response.successStatus} | ${response.successMessage}`);
            }
        });
    }
    function onPlayerDied(info) {
        return __awaiter(this, void 0, void 0, function* () {
            // Killstreaks
            if (info.victimName) {
                // Post Request to create Death in API
                const dataType = 'deaths';
                const victimPlayer = getPlayerByName(state, info.victimName);
                const attackerPlayer = getPlayerBySteamID(state, info.attackerSteamID);
                let teamkill = false;
                if ((attackerPlayer === null || attackerPlayer === void 0 ? void 0 : attackerPlayer.teamID) === (victimPlayer === null || victimPlayer === void 0 ? void 0 : victimPlayer.teamID))
                    teamkill = true;
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
                const response = yield postDataToAPI(dataType, deathData, accessToken);
                if (response.successStatus === 'Error') {
                    logger.error(`Died-Death | ${response.successStatus} | ${response.successMessage}`);
                }
            }
        });
    }
    function onPlayerRevived(info) {
        return __awaiter(this, void 0, void 0, function* () {
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
            const response = yield postDataToAPI(dataType, reviveData, accessToken);
            if (response.successStatus === 'Error') {
                logger.error(`Revives-Revive | ${response.successStatus} | ${response.successMessage}`);
            }
        });
    }
    function killstreakWounded(info) {
        return __awaiter(this, void 0, void 0, function* () {
            const attackerPlayer = getPlayerBySteamID(state, info.attackerSteamID);
            if (!attackerPlayer)
                return;
            // Get the attacker's Steam ID
            const eosID = attackerPlayer.eosID;
            // Check if this is the first time the attacker has made a killstreak
            if (!trackedKillstreaks.hasOwnProperty(eosID)) {
                // Set the player's initial killstreak to 0
                trackedKillstreaks[eosID] = 0;
            }
            // Increment the player's kill streak by 1
            trackedKillstreaks[eosID] += 1;
        });
    }
    function killstreakDied(info) {
        return __awaiter(this, void 0, void 0, function* () {
            const victimPlayer = getPlayerByName(state, info.victimName);
            if (!victimPlayer)
                return;
            const eosID = victimPlayer.eosID;
            // Update highestKillstreak in the SQL database and get the new highestKillstreak
            yield updateHighestKillstreak(eosID);
            if (trackedKillstreaks.hasOwnProperty(eosID)) {
                delete trackedKillstreaks[eosID];
            }
        });
    }
    function killstreakNewGame() {
        return __awaiter(this, void 0, void 0, function* () {
            // Get an array of all the Steam IDs in the trackedKillstreaks object
            const eosIDs = Object.keys(trackedKillstreaks);
            // Loop through the array
            for (const eosID of eosIDs) {
                if (trackedKillstreaks[eosID] > 0) {
                    // Update highestKillstreak in the SQL database
                    yield updateHighestKillstreak(eosID);
                }
                // Remove the player from the trackedKillstreaks object
                delete trackedKillstreaks[eosID];
            }
        });
    }
    function killstreakDisconnected(info) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!info.eosID)
                return;
            const eosID = info.eosID;
            // Update highestKillstreak in the SQL database
            if (trackedKillstreaks.hasOwnProperty(eosID)) {
                if (trackedKillstreaks[eosID] > 0) {
                    yield updateHighestKillstreak(eosID);
                }
            }
            delete trackedKillstreaks[eosID];
        });
    }
    function updateHighestKillstreak(eosID) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get the player's current killstreak from the trackedKillstreaks object
            const currentKillstreak = trackedKillstreaks[eosID];
            // Return is the player's current killstreak is 0
            if (!currentKillstreak || currentKillstreak === 0)
                return;
            try {
                // Patch Request to update highestKillstreak in API
                const dataType = 'playerKillstreaks';
                const playerData = {
                    eosID: eosID,
                    highestKillstreak: currentKillstreak,
                    match: match ? match.id : null,
                };
                const response = yield patchDataInAPI(dataType, playerData, accessToken);
                if (response.successStatus === 'Error') {
                    logger.error(`Error updating highestKillstreak in database for ${eosID}: ${response.successMessage}`);
                }
            }
            catch (error) {
                logger.error(`Error updating highestKillstreak in database for ${eosID}: ${error}`);
            }
        });
    }
    function patchDataInAPI(dataType, data, accessToken) {
        return __awaiter(this, void 0, void 0, function* () {
            const __dirname = fileURLToPath(import.meta.url);
            try {
                const response = yield axios.patch(`https://mysquadstats.com/api/${dataType}`, data, {
                    params: { accessToken },
                });
                return response.data;
            }
            catch (error) {
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
        });
    }
    function checkVersion() {
        return __awaiter(this, void 0, void 0, function* () {
            const owner = 'IgnisAlienus';
            const newOwner = 'Ignis-Bots';
            const repo = 'SquadJS-My-Squad-Stats';
            let latestVersion;
            let currentOwner;
            try {
                latestVersion = yield getLatestVersion(owner, repo);
                currentOwner = owner;
            }
            catch (error) {
                logger.error(`Error retrieving the latest version of ${repo} from ${owner}: ${error}`);
                try {
                    latestVersion = yield getLatestVersion(newOwner, repo);
                    currentOwner = newOwner;
                }
                catch (error) {
                    logger.error(`Error retrieving the latest version of ${repo} from ${newOwner}: ${error}`);
                    return;
                }
            }
            if (currentVersion.localeCompare(latestVersion, undefined, {
                numeric: true,
            }) < 0) {
                logger.log(`New version of ${repo} is available. Updating...`);
                const updatedCodeUrl = `https://raw.githubusercontent.com/${currentOwner}/${repo}/${latestVersion}/squad-server/plugins/my-squad-stats.js`;
                // Download the updated code
                let updatedCode;
                try {
                    const response = yield axios.get(updatedCodeUrl);
                    updatedCode = response.data;
                }
                catch (error) {
                    logger.error(`For downloading the updated code: ${error}`);
                    return;
                }
                const __dirname = path.dirname(fileURLToPath(import.meta.url));
                const filePath = path.join(__dirname, 'my-squad-stats.js');
                fs.writeFileSync(filePath, updatedCode);
                logger.log(`Successfully updated ${repo} to version ${latestVersion}`);
            }
            else if (currentVersion > latestVersion) {
                logger.log(`You are running a newer version of ${repo} than the latest version.\nThis likely means you are running a pre-release version.\nCurrent version: ${currentVersion} Latest Version: ${latestVersion}\nhttps://github.com/${currentOwner}/${repo}/releases`);
            }
            else if (currentVersion === latestVersion) {
                logger.log(`You are running the latest version of ${repo}.`);
            }
            else {
                logger.log(`Unable to check for updates in ${repo}.`);
            }
        });
    }
    function pingMySquadStats() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.log('Pinging My Squad Stats...');
            if (isProcessingFailedRequests) {
                logger.log('Already processing failed requests...');
                return;
            }
            isProcessingFailedRequests = true;
            const __dirname = fileURLToPath(import.meta.url);
            // If MySquadStats_Failed_Requests folder exists, delete it if empty to use the new folder
            const failedRequestsFolderPath = path.join(__dirname, '..', '..', 'MySquadStats_Failed_Requests');
            if (fs.existsSync(failedRequestsFolderPath)) {
                const files = fs.readdirSync(failedRequestsFolderPath);
                if (files.length === 0) {
                    fs.rmdirSync(failedRequestsFolderPath);
                }
            }
            const dataType = 'ping';
            const response = yield getDataFromAPI(dataType, accessToken);
            if (response.successMessage === 'pong') {
                logger.log('Pong! My Squad Stats is up and running.');
                // Check for any failed requests and retry
                const filePath = path.join(__dirname, '..', '..', 'MySquadStats_Data', 'send-retry-requests.json');
                if (fs.existsSync(filePath)) {
                    logger.log('Retrying failed POST requests...');
                    const failedRequests = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    // Sort the array so that match requests come first
                    failedRequests.sort((a, b) => {
                        if (a.dataType === 'matches' && b.dataType !== 'matches') {
                            return -1;
                        }
                        else if (a.dataType !== 'matches' && b.dataType === 'matches') {
                            return 1;
                        }
                        else {
                            return 0;
                        }
                    });
                    for (let i = 0; i < failedRequests.length; i++) {
                        const request = failedRequests[i];
                        const retryResponse = yield postDataToAPI(request.dataType, request.data, accessToken);
                        logger.log(`${retryResponse.successStatus} | ${retryResponse.successMessage}`);
                        if (retryResponse.successStatus === 'Success') {
                            // Remove the request from the array
                            failedRequests.splice(i, 1);
                            // Decrement i so the next iteration won't skip an item
                            i--;
                            // Write the updated failedRequests array back to the file
                            fs.writeFileSync(filePath, JSON.stringify(failedRequests));
                        }
                        // Wait for 5 seconds before processing the next request
                        yield new Promise((resolve) => setTimeout(resolve, 5000));
                    }
                    // Delete the file if there are no more failed requests
                    if (failedRequests.length === 0) {
                        fs.unlinkSync(filePath);
                    }
                    logger.log('Finished retrying failed POST requests.');
                }
                const patchFilePath = path.join(__dirname, '..', '..', 'MySquadStats_Data', 'patch-retry-requests.json');
                if (fs.existsSync(patchFilePath)) {
                    logger.log('Retrying failed PATCH requests...');
                    const failedRequests = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    // Sort the array so that match requests come first
                    failedRequests.sort((a, b) => {
                        if (a.dataType === 'matches' && b.dataType !== 'matches') {
                            return -1;
                        }
                        else if (a.dataType !== 'matches' && b.dataType === 'matches') {
                            return 1;
                        }
                        else {
                            return 0;
                        }
                    });
                    for (let i = 0; i < failedRequests.length; i++) {
                        const request = failedRequests[i];
                        const retryResponse = yield patchDataInAPI(request.dataType, request.data, accessToken);
                        logger.log(`${retryResponse.successStatus} | ${retryResponse.successMessage}`);
                        if (retryResponse.successStatus === 'Success') {
                            // Remove the request from the array
                            failedRequests.splice(i, 1);
                            // Decrement i so the next iteration won't skip an item
                            i--;
                            // Write the updated failedRequests array back to the file
                            fs.writeFileSync(patchFilePath, JSON.stringify(failedRequests));
                        }
                        // Wait for 5 seconds before processing the next request
                        yield new Promise((resolve) => setTimeout(resolve, 5000));
                    }
                    // Delete the file if there are no more failed requests
                    if (failedRequests.length === 0) {
                        fs.unlinkSync(patchFilePath);
                    }
                    logger.log('Finished retrying failed PATCH requests.');
                }
            }
            isProcessingFailedRequests = false;
        });
    }
    function getLatestVersion(owner, repo) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
            const response = yield fetch(url);
            const data = yield response.json();
            return data.tag_name;
        });
    }
    function isErrorResponse(error) {
        var _a;
        return (typeof error === 'object' &&
            error !== null &&
            'response' in error &&
            typeof ((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) === 'number');
    }
    function handleApiError(error) {
        if (isErrorResponse(error)) {
            let errMsg = `${error.response.status} - ${error.response.statusText}`;
            const status = 'Error';
            if (error.response.status === 502) {
                errMsg +=
                    ' Unable to connect to the API. My Squad Stats is likely down.';
            }
            else if (error.response.status === 500) {
                errMsg += ' Internal server error. Something went wrong on the server.';
            }
            return {
                successStatus: status,
                successMessage: errMsg,
            };
        }
        else if (error.request) {
            return {
                successStatus: 'Error',
                successMessage: 'No response received from the API. Please check your network connection.',
            };
        }
        else {
            return {
                successStatus: 'Error',
                successMessage: `Error: ${error.message}`,
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
});

const randomizerMaps = (state) => {
    const { listener, execute, logger } = state;
    const layerNames = new Set(Object.values(state.maps).map((map) => map.layerName));
    const historyLayersMax = layerNames.size;
    let rnsHistoryLayers = [];
    const newGame = () => __awaiter(void 0, void 0, void 0, function* () {
        const { id } = state;
        rnsHistoryLayers = yield getHistoryLayers(id);
        const map = yield recursiveGenerate();
        if (map) {
            logger.log(`Set next Layer ${map}`);
            console.log(rnsHistoryLayers);
            yield adminSetNextLayer(execute, map);
        }
    });
    listener.on(EVENTS.NEW_GAME, newGame);
    const recursiveGenerate = () => __awaiter(void 0, void 0, void 0, function* () {
        const { id } = state;
        if (rnsHistoryLayers.length >= historyLayersMax) {
            yield cleanHistoryLayers(id, rnsHistoryLayers[historyLayersMax - 1]);
        }
        if (rnsHistoryLayers.length >= historyLayersMax) {
            rnsHistoryLayers = rnsHistoryLayers.slice(-1);
            return recursiveGenerate();
        }
        getRandomLayer();
        // if (!rnsHistoryLayers.find((e) => e === layer.layer)) {
        //   await serverHistoryLayers(id, layer.layer);
        //   return layer.map;
        // }
        return recursiveGenerate();
    });
    const getRandomLayer = () => {
        const layersLength = Object.keys(state.maps).length;
        const random = Math.floor(Math.random() * layersLength);
        const map = Object.keys(state.maps)[random];
        const layer = state.maps[map].layerName;
        return { layer, map };
    };
};

const rnsStats = (state) => {
    const { listener, execute } = state;
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
        for (const player of players) {
            const { teamID, steamID, possess } = player;
            const user = yield getUserDataWithSteamID(steamID);
            if (user)
                adminWarn(execute, steamID, `Игрок: ${user.name}\nУбийств: ${user.kills}\nСмертей: ${user.death}\nПомощь: ${user.revives}\nТимкилы: ${user.teamkills}\nK/D: ${user.kd}
        `);
            if (possess === null || possess === void 0 ? void 0 : possess.toLowerCase().includes('developeradmincam'))
                return;
            if (!winner)
                return;
            if (teamID === winner) {
                yield updateGames(steamID, 'won');
            }
            else {
                yield updateGames(steamID, 'lose');
            }
        }
        winner = '';
        yield creatingTimeStamp();
    });
    const updatedPlayers = () => {
        const { players } = state;
        if (!players)
            return;
        players.forEach((e) => {
            const { steamID } = e;
            if (!steamID)
                return;
            if (playersCurrenTime.find((e) => e.steamID === steamID))
                return;
            playersCurrenTime.push({
                steamID,
                timer: setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
                    const user = getPlayerBySteamID(state, steamID);
                    if (user && user.possess) {
                        yield updatePossess(steamID, user.possess);
                    }
                    if (user && user.role) {
                        yield updateRoles(steamID, user.role);
                    }
                    if (user && user.isLeader && user.squadID) {
                        yield updateTimes(steamID, 'leader', user.name);
                        const squad = getSquadByID(state, user.squadID);
                        if ((squad && squad.squadName === 'CMD Squad') ||
                            (squad && squad.squadName === 'Command Squad')) {
                            yield updateTimes(steamID, 'cmd', user.name);
                        }
                    }
                    if (user) {
                        yield updateTimes(steamID, 'timeplayed', user.name);
                    }
                }), 60000),
            });
        });
        playersCurrenTime = playersCurrenTime.filter((e) => {
            const currentUser = players.find((c) => c.steamID === e.steamID);
            if (!currentUser) {
                clearInterval(e.timer);
                return false;
            }
            return e;
        });
    };
    const onDied = (data) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const { currentMap } = state;
        if ((_a = currentMap === null || currentMap === void 0 ? void 0 : currentMap.layer) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('seed'))
            return;
        const { attackerSteamID, victimName, attackerEOSID } = data;
        const attacker = getPlayerByEOSID(state, attackerEOSID);
        const victim = getPlayerByName(state, victimName);
        if (!victim)
            return;
        if ((attacker === null || attacker === void 0 ? void 0 : attacker.teamID) === (victim === null || victim === void 0 ? void 0 : victim.teamID) && attacker.name !== victim.name) {
            return yield updateUser(attackerSteamID, 'teamkills');
        }
        yield updateUser(attackerSteamID, 'kills', victim.weapon || 'null');
        yield updateUser(victim.steamID, 'death');
    });
    const onRevived = (data) => __awaiter(void 0, void 0, void 0, function* () {
        var _b;
        const { currentMap } = state;
        if ((_b = currentMap === null || currentMap === void 0 ? void 0 : currentMap.layer) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes('seed'))
            return;
        const { reviverSteamID } = data;
        yield updateUser(reviverSteamID, 'revives');
    });
    listener.on(EVENTS.UPDATED_PLAYERS, updatedPlayers);
    listener.on(EVENTS.PLAYER_DIED, onDied);
    listener.on(EVENTS.PLAYER_REVIVED, onRevived);
    listener.on(EVENTS.ROUND_ENDED, onRoundEnded);
    listener.on(EVENTS.ROUND_TICKETS, onRoundTickets);
};

const rename = promisify(fs$1.rename);
const rnsLogs = (state, options) => {
    const { listener } = state;
    const { logPath } = options;
    let logData = []; // Массив для хранения данных перед записью в файл
    const writeInterval = 6000; // Интервал записи данных (1 минута)
    const cleanLogsInterval = 24 * 60 * 60 * 1000; // Интервал очистки старых логов (сутки)
    let matchIsEnded = false;
    function cleanOldLogsFiles() {
        return __awaiter(this, void 0, void 0, function* () {
            const currentDate = new Date();
            const expiryLogDate = new Date(currentDate.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 дня
            try {
                const files = yield fs$1.readdir(logPath);
                console.log(files);
                for (const file of files) {
                    const filePath = path.join(logPath, file);
                    const stats = yield fs$1.stat(filePath);
                    if (stats.mtime < expiryLogDate) {
                        yield fs$1.unlink(filePath);
                    }
                }
            }
            catch (err) {
                console.error('Ошибка чтения директории:', err);
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
                    const data = yield fs$1.readFile(logFilePath, 'utf-8');
                    logs = JSON.parse(data);
                }
                catch (err) {
                    logs = [];
                }
                logs = logs.concat(tempData);
                yield fs$1.writeFile(logFilePath, JSON.stringify(logs, null, 2));
            }
            catch (error) {
                console.error(error);
            }
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
                console.error('Ошибка при переименовании файла:', err);
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
            const { time, squadName, eosID } = data;
            const player = getPlayerByEOSID(state, eosID);
            const currentTime = new Date(time).toLocaleString('ru-RU', {
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
    const { voteTick, voteDuration, voteRepeatDelay, onlyForVip, needVotes } = options;
    let voteReadyToStart = true;
    let voteStarting = false;
    let voteStartingRepeat = true;
    let secondsToEnd = voteDuration / 1000;
    let timer;
    let timerDelayStarting;
    let timerDelayNextStart;
    let historyPlayers = [];
    let votes = {
        '+': [],
        '-': [],
    };
    const chatCommand = (data) => {
        const { steamID } = data;
        const { admins } = state;
        if (state.votingActive || voteStarting) {
            adminWarn(execute, steamID, 'В данный момент голосование уже идет!');
            return;
        }
        if (!voteStartingRepeat) {
            adminWarn(execute, steamID, 'Должно пройти 15 минут после последнего использования skipmap!');
            return;
        }
        if (!voteReadyToStart) {
            adminWarn(execute, steamID, 'Голосование за завершение матча будет доступно через 1 минуту после начала матча!');
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
        adminBroadcast(execute, 'Голосование за пропуск текущей карты!\nИспользуйте +(За) -(Против) для голосования');
        historyPlayers.push(steamID);
        state.votingActive = true;
        voteStarting = true;
        voteStartingRepeat = false;
        timer = setInterval(() => {
            secondsToEnd = secondsToEnd - voteTick / 1000;
            const positive = votes['+'].length;
            const negative = votes['-'].length;
            const currentVotes = positive - negative <= 0 ? 0 : positive - negative;
            if (secondsToEnd <= 0) {
                if (currentVotes >= needVotes) {
                    adminBroadcast(execute, 'Голосование завершено!\nМатч завершается!');
                    adminBroadcast(execute, `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`);
                    state.skipmap = true;
                    reset();
                    adminEndMatch(execute);
                    return;
                }
                timerDelayNextStart = setTimeout(() => {
                    voteStartingRepeat = true;
                }, voteRepeatDelay);
                adminBroadcast(execute, 'Голосование завершено!\nНе набрано необходимое количество голосов за пропуск текущей карты');
                adminBroadcast(execute, `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`);
                reset();
            }
            else {
                adminBroadcast(execute, `Голосование за пропуск текущей карты!\nЗа: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`);
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
        clearTimeout(timerDelayNextStart);
        historyPlayers = [];
        voteReadyToStart = false;
        voteStartingRepeat = true;
        state.skipmap = false;
        timerDelayStarting = setTimeout(() => {
            voteReadyToStart = true;
        }, 60000);
    };
    listener.on(EVENTS.CHAT_COMMAND_SKIPMAP, chatCommand);
    listener.on(EVENTS.CHAT_MESSAGE, chatMessage);
    listener.on(EVENTS.NEW_GAME, newGame);
    const reset = () => {
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

const voteMap = (state, options) => {
    const { listener, execute, maps } = state;
    const { voteTick, voteDuration, onlyForVip, needVotes } = options;
    let voteReadyToStart = true;
    let voteStarting = false;
    let secondsToEnd = voteDuration / 1000;
    let timer;
    let timerDelayStarting;
    let timerDelayNextStart;
    let tempAlliance;
    let vote = false;
    let historyPlayers = [];
    let votes = {
        '+': [],
        '-': [],
    };
    const findFactionAlliance = (faction, teamData, subFaction) => {
        for (const alliance in teamData) {
            if (teamData[alliance][faction]) {
                if (teamData[alliance][faction].includes(subFaction)) {
                    return alliance;
                }
                return;
            }
        }
        return undefined;
    };
    const validateFactionSubFaction = (mapData, mapName, teamName, faction, subFaction) => {
        var _a;
        if (Object.keys(mapData[mapName])[0].includes('Team 1 / Team 2')) {
            teamName = 'Team 1 / Team 2';
        }
        const teamData = (_a = mapData[mapName]) === null || _a === void 0 ? void 0 : _a[teamName];
        const alliance = findFactionAlliance(faction, teamData, subFaction);
        if (tempAlliance === alliance) {
            tempAlliance = '';
            return false;
        }
        if (!alliance) {
            tempAlliance = '';
            return false;
        }
        tempAlliance = alliance;
        return true;
    };
    const validateSelectedMapAndTeams = (mapData, mapName, team1Faction, team1SubFaction, team2Faction, team2SubFaction) => {
        const team1Valid = validateFactionSubFaction(mapData, mapName, 'Team 1', team1Faction, team1SubFaction);
        const team2Valid = validateFactionSubFaction(mapData, mapName, 'Team 2', team2Faction, team2SubFaction);
        if (team1Valid && team2Valid) {
            return true;
        }
        return false;
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
        const parseMessage = (message) => {
            const [layerName, team1, team2] = message.split(/\s+/);
            if (!layerName || !team1 || !team2) {
                throw new Error('Неправильный формат сообщения');
            }
            const [mapName] = layerName.split('_');
            const [team1Faction, team1SubFaction] = team1.split('+');
            const [team2Faction, team2SubFaction] = team2.split('+');
            return {
                mapName,
                layerName,
                team1Faction,
                team1SubFaction,
                team2Faction,
                team2SubFaction,
            };
        };
        // Пример использования функции parseMessage
        const parsedMessage = parseMessage(message);
        const { layerName, team1Faction, team1SubFaction, team2Faction, team2SubFaction, } = parsedMessage;
        const isValidMapAndTeams = validateSelectedMapAndTeams(maps, layerName, team1Faction, team1SubFaction, team2Faction, team2SubFaction);
        if (!isValidMapAndTeams || message.length === 0) {
            adminWarn(execute, steamID, 'Неправильно указано название карты, список карт можно найти в дискорд канале discord.gg/rn-server плагины!');
            return;
        }
        adminBroadcast(execute, `Голосование за следующую карту ${message}!\nИспользуйте +(За) -(Против) для голосования`);
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
                    adminSetNextLayer(execute, message);
                    vote = true;
                    return;
                }
                adminBroadcast(execute, 'Голосование завершено!\nНе набрано необходимое количество голосов');
                adminBroadcast(execute, `За: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`);
                reset();
            }
            else {
                adminBroadcast(execute, `Голосование за следующую карту ${message}!\nЗа: ${positive} Против: ${negative} Набрано: ${currentVotes} из ${needVotes} голос(ов)`);
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
        clearTimeout(timerDelayNextStart);
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
    mySquadStats,
    dpacAnticheat,
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
    const coreEmitter = new EventEmitter$2();
    const localEmitter = new EventEmitter$2();
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
    if (!fs.existsSync(filePath)) {
        logger.error(`Maps ${mapsName} not found`);
        process.exit(1);
    }
    return new Promise((res) => {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (!data || Object.keys(data).length === 0) {
            logger.error(`Maps ${mapsName} empty or invalid`);
            process.exit(1);
        }
        const maps = {};
        for (const mapName in data) {
            const teams = data[mapName];
            const teamsInfo = {};
            for (const teamName in teams) {
                const factions = teams[teamName];
                const factionsInfo = {};
                for (const factionName in factions) {
                    const unitTypes = factions[factionName];
                    factionsInfo[factionName] = unitTypes;
                }
                teamsInfo[teamName] = factionsInfo;
            }
            maps[mapName] = teamsInfo;
        }
        logger.log('Loaded maps');
        res(maps);
    });
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
    if (!fs.existsSync(configPath)) {
        console.log(chalk.yellow(`[SquadJS]`), chalk.red('Config file required!'));
        return null;
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
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
                });
                yield connectToDatabase(config.db);
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
