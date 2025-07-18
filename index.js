const {
    PLUGIN_OWNER_ID,
    PERMISSIONS
} = require('./constants.js');
const ActionHandler = require('./lib/ActionHandler.js');
const SpamDetector = require('./lib/SpamDetector.js');
const { getUiPageContent } = require('./lib/ui.js');

const createBanCommand = require('./commands/ban.js');
const createUnbanCommand = require('./commands/unban.js');
const createWarnCommand = require('./commands/warn.js');
const createUnwarnCommand = require('./commands/unwarn.js');
const createHistoryCommand = require('./commands/history.js');


function formatMessage(template, values = {}) {
    if (!template) return '';
    return Object.entries(values).reduce((acc, [key, value]) => {
        return acc.replace(new RegExp(`{${key}}`, 'g'), value);
    }, template);
}

async function onLoad(bot, { settings, store }) {
    const log = bot.sendLog;
    const Command = bot.api.Command;
    const messages = settings.messageConfig || {};

    const playerData = new Map();
    const immunitySet = new Set();
    let lastMessageTime = 0;
    
    let spamDetector;
    if (settings.spamProtectionEnabled) {
        spamDetector = new SpamDetector(settings);
    }

    async function loadInitialData() {
        const allData = await store.getAll();
        allData.forEach((value, key) => {
            playerData.set(key, value);
        });
        
        const violators = [];
        const now = Date.now();
        const warnResetTime = (settings.warnResetMinutes || 1440) * 60 * 1000;
        
        for (const [username, data] of playerData.entries()) {
            if (data.warns > 0) {
                if (!data.warnTimestamp || (now - data.warnTimestamp) <= warnResetTime) {
                    const lastWarn = data.history
                        ?.filter(h => h.type === 'warn')
                        ?.sort((a, b) => b.date - a.date)[0];
                    
                    violators.push({
                        id: username,
                        username: username,
                        count: data.warns,
                        lastReason: lastWarn?.reason || 'Нарушение правил',
                        date: new Date(data.warnTimestamp || now).toISOString()
                    });
                }
            }
            
            if (data.banInfo && (!data.banInfo.expiry || data.banInfo.expiry > now)) {
                const lastBan = data.history
                    ?.filter(h => h.type === 'ban')
                    ?.sort((a, b) => b.date - a.date)[0];
                    
                violators.push({
                    id: username,
                    username: username,
                    count: 'БАН',
                    lastReason: lastBan?.reason || data.banInfo.reason || 'Бан',
                    date: new Date(data.banInfo.timestamp || now).toISOString()
                });
            }
        }
        
        bot.api.sendUiUpdate('auto-moderation', { violators });
    }

    function getPlayerData(username) {
        const usernameLower = username.toLowerCase();
        return playerData.get(usernameLower) || { warns: 0, banInfo: null, history: [] };
    }

    async function updatePlayerData(username, data) {
        const usernameLower = username.toLowerCase();
        playerData.set(usernameLower, data);
        await store.set(usernameLower, data);
    }

    const throttledSendMessage = async (type, message, username) => {
        if (type !== 'clan') {
            return bot.api.sendMessage(type, message, username);
        }
        const now = Date.now();
        const timeSince = now - lastMessageTime;
        const delayNeeded = 300 - timeSince;
        if (delayNeeded > 0) {
            await new Promise(res => setTimeout(res, delayNeeded));
        }
        lastMessageTime = Date.now();
        bot.api.sendMessage(type, message, username);
    };

    const actionHandler = new ActionHandler(bot, settings, messages, throttledSendMessage, { getPlayerData, updatePlayerData }, immunitySet);
    
    const messageHandler = async (msg) => {
        if (!msg) return;
        if (msg.pluginName === 'auto-moderation' && msg.type === 'auto-moderation:clear-violations') {
            const username = msg.payload.username;
            if (username) {
                if (spamDetector && spamDetector.userViolations[username]) {
                    spamDetector.userViolations[username].count = 0;
                }
                
                const usernameLower = username.toLowerCase();
                const playerData = getPlayerData(usernameLower);
                if (playerData.warns > 0 || playerData.banInfo) {
                    playerData.warns = 0;
                    playerData.warnTimestamp = null;
                    playerData.banInfo = null;
                    await updatePlayerData(usernameLower, playerData);
                    
                    try {
                        const user = await bot.api.getUser(username);
                        if (user && user.isBlacklisted) {
                            await user.setBlacklist(false);
                        }
                    } catch (e) {
                        log(`[AutoMod] Ошибка при снятии блокировки: ${e.message}`);
                    }
                }
                
                const currentUiState = bot.pluginUiState.get('auto-moderation') || { violators: [] };
                const updatedViolators = currentUiState.violators.filter(v => v.username !== username);
                bot.api.sendUiUpdate('auto-moderation', { violators: updatedViolators });

                log(`[AutoMod] Нарушения для ${username} сброшены через UI.`);
            }
        }
    };

    process.on('message', messageHandler);

    bot.once('end', () => {
        process.removeListener('message', messageHandler);
        const intervals = bot.pluginData?.autoModeration;
        if (intervals) {
            if (intervals.unbanInterval) clearInterval(intervals.unbanInterval);
            if (intervals.warnResetInterval) clearInterval(intervals.warnResetInterval);
            if (intervals.uiUpdateInterval) clearInterval(intervals.uiUpdateInterval);
        }
    });

    if (settings.spamProtectionEnabled) {
        bot.events.on('chat:message', async (data) => {
            if (!settings.spamProtectionEnabled) return;
            if (data.type !== 'clan') return;
            
            const { username, message } = data;

            if (!username || username.toLowerCase() === bot.username.toLowerCase() || immunitySet.has(username.toLowerCase())) return;

            const user = await bot.api.getUser(username);
            if (!user || user.hasPermission(PERMISSIONS.IMMUNE) || user.isOwner || user.isModerator) return;

            const spamResult = spamDetector.addMessage(username, message);
            
            if (spamResult.status === 'warn') {
                await actionHandler.applyWarn(username, 'AutoMod', spamResult.reason);
            } else if (spamResult.status === 'kick') {
                await actionHandler.applyBan(username, 'AutoMod', spamResult.reason);
            }
        });
        log(`[${PLUGIN_OWNER_ID}] Модуль защиты от спама включен.`);
    }

    bot.events.on('clan:player_joined', (data) => {
        if (!data || !data.username) return;
        const usernameLower = data.username.toLowerCase();
        const currentData = getPlayerData(usernameLower);

        if (currentData.warns > 0 || (currentData.banInfo && currentData.banInfo.expiry)) {
            currentData.warns = 0;
            if (currentData.banInfo) {
                currentData.banInfo = null;
                bot.api.getUser(data.username).then(user => {
                    if (user && user.isBlacklisted) user.setBlacklist(false);
                });
            }
            updatePlayerData(usernameLower, currentData);
            log(`[AutoMod] Нарушения для ${data.username} сброшены после перезахода в клан.`);
            
            const currentUiState = bot.pluginUiState.get('auto-moderation') || { violators: [] };
            const updatedViolators = currentUiState.violators.filter(v => v.username !== data.username);
            bot.api.sendUiUpdate('auto-moderation', { violators: updatedViolators });
        }
    });

    const checkExpiredBans = async () => {
        const now = Date.now();
        for (const [username, data] of playerData.entries()) {
            if (data.banInfo && data.banInfo.expiry && now >= data.banInfo.expiry) {
                try {
                    const user = await bot.api.getUser(username);
                    if (user && user.isBlacklisted) {
                        await user.setBlacklist(false);
                        log(`[AutoMod] Временный бан для игрока ${username} истек. Игрок разбанен.`);
                    }
                    data.banInfo = null;
                    await updatePlayerData(username, data);
                    
                    const currentUiState = bot.pluginUiState.get('auto-moderation') || { violators: [] };
                    const updatedViolators = currentUiState.violators.filter(v => v.username !== username);
                    bot.api.sendUiUpdate('auto-moderation', { violators: updatedViolators });
                } catch (e) {
                    log(`[AutoMod] Ошибка при авторазбане ${username}: ${e.message}`);
                }
            }
        }
    };

    const checkExpiredWarns = async () => {
        const now = Date.now();
        const resetTime = (settings.warnResetMinutes || 1440) * 60 * 1000;
        for (const [username, data] of playerData.entries()) {
            if (data.warns > 0 && data.warnTimestamp && (now - data.warnTimestamp > resetTime)) {
                data.warns = 0;
                data.warnTimestamp = null;
                await updatePlayerData(username, data);
                throttledSendMessage('clan', formatMessage(messages.WARN_RESET_AUTO, { username }));
                log(`[AutoMod] Варны для ${username} сброшены по истечении времени.`);
                
                const currentUiState = bot.pluginUiState.get('auto-moderation') || { violators: [] };
                const updatedViolators = currentUiState.violators.filter(v => v.username !== username);
                bot.api.sendUiUpdate('auto-moderation', { violators: updatedViolators });
            }
        }
    };

    const sendPeriodicUiUpdates = () => {
        const currentUiState = bot.pluginUiState.get('auto-moderation');
        if (currentUiState && currentUiState.violators && currentUiState.violators.length > 0) {
            bot.api.sendUiUpdate('auto-moderation', { violators: currentUiState.violators });
        }
    };

    bot.pluginData = bot.pluginData || {};
    bot.pluginData.autoModeration = {
        unbanInterval: setInterval(checkExpiredBans, 60 * 1000),
        warnResetInterval: setInterval(checkExpiredWarns, 5 * 60 * 1000),
        uiUpdateInterval: setInterval(sendPeriodicUiUpdates, 30 * 1000)
    };
    
    try {
        await bot.api.registerPermissions([
            { name: PERMISSIONS.BAN, description: 'Доступ к командам ban/unban', owner: PLUGIN_OWNER_ID },
            { name: PERMISSIONS.WARN, description: 'Доступ к командам warn/unwarn', owner: PLUGIN_OWNER_ID },
            { name: PERMISSIONS.IMMUNE, description: 'Иммунитет к наказаниям от плагина', owner: PLUGIN_OWNER_ID },
        ]);
        await bot.api.addPermissionsToGroup('Moderator', [PERMISSIONS.WARN]);
        await bot.api.addPermissionsToGroup('Admin', [PERMISSIONS.WARN, PERMISSIONS.BAN, PERMISSIONS.IMMUNE]);
        
        const commandsToRegister = [
            new(createBanCommand(Command, actionHandler, messages, throttledSendMessage, immunitySet))(),
            new(createUnbanCommand(Command, messages, throttledSendMessage, { getPlayerData, updatePlayerData }))(),
            new(createWarnCommand(Command, actionHandler, messages, throttledSendMessage, immunitySet))(),
            new(createUnwarnCommand(Command, messages, throttledSendMessage, { getPlayerData, updatePlayerData }))(),
            new(createHistoryCommand(Command, messages, throttledSendMessage, { getPlayerData }))(),
        ];

        for (const cmd of commandsToRegister) {
            await bot.api.registerCommand(cmd);
        }
        
        await loadInitialData();
        log(`[${PLUGIN_OWNER_ID}] Плагин модерации успешно загружен.`);
    } catch (error) {
        log(`[${PLUGIN_OWNER_ID}] Ошибка при загрузке: ${error.message}\\n${error.stack}`);
    }
}

async function onUnload({ botId, prisma }) {
    try {
        await prisma.command.deleteMany({
            where: { botId, owner: PLUGIN_OWNER_ID }
        });
        await prisma.permission.deleteMany({
            where: { botId, owner: PLUGIN_OWNER_ID }
        });
    } catch (error) {
        console.error(`[${PLUGIN_OWNER_ID}] Ошибка при очистке ресурсов:`, error);
    }
}

async function handleAction({ botProcess, action, payload }) {
    if (!botProcess) throw new Error("Бот должен быть запущен для выполнения этого действия.");

    switch (action) {
        case 'clear-violations':
            const username = payload.id;
            botProcess.send({ type: 'auto-moderation:clear-violations', pluginName: 'auto-moderation', payload: { username } });
            return { logMessage: `Команда на очистку нарушений для ${username} отправлена.` };
        default:
            throw new Error(`Неизвестное действие: ${action}`);
    }
}

module.exports = {
    onLoad,
    onUnload,
    getUiPageContent,
    handleAction
};