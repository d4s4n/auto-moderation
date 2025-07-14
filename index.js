const {
    PLUGIN_OWNER_ID,
    PERMISSIONS
} = require('./constants.js');
const ActionHandler = require('./lib/ActionHandler.js');
const SpamDetector = require('./lib/SpamDetector.js');

const createBanCommand = require('./commands/ban.js');
const createUnbanCommand = require('./commands/unban.js');
const createWarnCommand = require('./commands/warn.js');
const createUnwarnCommand = require('./commands/unwarn.js');

function formatMessage(template, values = {}) {
    if (!template) return '';
    return Object.entries(values).reduce((acc, [key, value]) => {
        return acc.replace(new RegExp(`{${key}}`, 'g'), value);
    }, template);
}

async function onLoad(bot, options) {
    const log = bot.sendLog;
    const Command = bot.api.Command;
    const settings = options.settings;
    const messages = settings.messageConfig || {};

    bot.pluginData = bot.pluginData || {};
    bot.pluginData.autoModeration = {
        warns: new Map(),
        tempBans: new Map(),
        immunitySet: new Set(),
        lastMessageTime: 0,
        unbanInterval: null,
        warnResetInterval: null,
    };

    const throttledSendMessage = async (type, message, username) => {
        if (type !== 'clan') {
            return bot.api.sendMessage(type, message, username);
        }
        const now = Date.now();
        const lastTime = bot.pluginData.autoModeration.lastMessageTime;
        const timeSince = now - lastTime;
        const delayNeeded = 300 - timeSince;
        if (delayNeeded > 0) {
            await new Promise(res => setTimeout(res, delayNeeded));
        }
        bot.pluginData.autoModeration.lastMessageTime = Date.now();
        bot.api.sendMessage(type, message, username);
    };

    const actionHandler = new ActionHandler(bot, settings, messages, throttledSendMessage);

    if (settings.spamProtectionEnabled) {
        const spamDetector = new SpamDetector(settings);
        bot.events.on('chat:message', async (data) => {
            if (data.type !== 'clan') return;
            const {
                username,
                message
            } = data;
            if (!username || username.toLowerCase() === bot.username.toLowerCase()) return;
            if (bot.pluginData.autoModeration.immunitySet.has(username.toLowerCase())) return;

            const user = await bot.api.getUser(username);
            if (!user || user.hasPermission(PERMISSIONS.IMMUNE) || user.isOwner || user.isModerator) return;

            const spamResult = spamDetector.addMessage(username, message);
            if (spamResult.isSpamming) {
                const reason = formatMessage(messages.SPAM_ACTION_WARN_REASON);
                await actionHandler.applyWarn(username, 'AutoMod', reason);
            }
        });
        log(`[${PLUGIN_OWNER_ID}] Модуль защиты от спама включен.`);
    }

    bot.events.on('clan:player_joined', (data) => {
        if (!data || !data.username) return;
        const usernameLower = data.username.toLowerCase();
        const warns = bot.pluginData.autoModeration.warns;
        const tempBans = bot.pluginData.autoModeration.tempBans;
        if (warns.has(usernameLower) || tempBans.has(usernameLower)) {
            warns.delete(usernameLower);
            if (tempBans.has(usernameLower)) {
                tempBans.delete(usernameLower);
                bot.api.getUser(data.username).then(user => {
                    if (user && user.isBlacklisted) user.setBlacklist(false);
                });
            }
            log(`[AutoMod] Нарушения для ${data.username} сброшены после перезахода в клан.`);
        }
    });

    const checkExpiredBans = async () => {
        const now = Date.now();
        const tempBans = bot.pluginData.autoModeration.tempBans;
        for (const [username, banInfo] of tempBans.entries()) {
            if (now >= banInfo.expiry) {
                try {
                    const user = await bot.api.getUser(username);
                    if (user && user.isBlacklisted) {
                        await user.setBlacklist(false);
                        log(`[AutoMod] Временный бан для игрока ${username} истек. Игрок разбанен.`);
                    }
                } catch (e) {
                    log(`[AutoMod] Ошибка при авторазбане ${username}: ${e.message}`);
                }
                tempBans.delete(username);
            }
        }
    };

    const checkExpiredWarns = async () => {
        const now = Date.now();
        const warns = bot.pluginData.autoModeration.warns;
        const resetTime = (settings.warnResetMinutes || 1440) * 60 * 1000;
        for (const [username, warnData] of warns.entries()) {
            if (now - warnData.timestamp > resetTime) {
                warns.delete(username);
                throttledSendMessage('clan', formatMessage(messages.WARN_RESET_AUTO, {
                    username
                }));
                log(`[AutoMod] Варны для ${username} сброшены по истечении времени.`);
            }
        }
    };

    bot.pluginData.autoModeration.unbanInterval = setInterval(checkExpiredBans, 60 * 1000);
    bot.pluginData.autoModeration.warnResetInterval = setInterval(checkExpiredWarns, 5 * 60 * 1000);

    bot.once('end', () => {
        const intervals = bot.pluginData?.autoModeration;
        if (intervals) {
            if (intervals.unbanInterval) clearInterval(intervals.unbanInterval);
            if (intervals.warnResetInterval) clearInterval(intervals.warnResetInterval);
        }
    });

    try {
        await bot.api.registerPermissions([{
                name: PERMISSIONS.BAN,
                description: 'Доступ к командам ban/unban',
                owner: PLUGIN_OWNER_ID
            },
            {
                name: PERMISSIONS.WARN,
                description: 'Доступ к командам warn/unwarn',
                owner: PLUGIN_OWNER_ID
            },
            {
                name: PERMISSIONS.IMMUNE,
                description: 'Иммунитет к наказаниям от плагина',
                owner: PLUGIN_OWNER_ID
            },
        ]);
        await bot.api.addPermissionsToGroup('Moderator', [PERMISSIONS.WARN]);
        await bot.api.addPermissionsToGroup('Admin', [PERMISSIONS.WARN, PERMISSIONS.BAN, PERMISSIONS.IMMUNE]);
        const commandsToRegister = [
            new(createBanCommand(Command, actionHandler, messages, throttledSendMessage))(),
            new(createUnbanCommand(Command, messages, throttledSendMessage))(),
            new(createWarnCommand(Command, actionHandler, messages, throttledSendMessage))(),
            new(createUnwarnCommand(Command, messages, throttledSendMessage))(),
        ];
        for (const cmd of commandsToRegister) {
            await bot.api.registerCommand(cmd);
        }
        log(`[${PLUGIN_OWNER_ID}] Плагин модерации успешно загружен.`);
    } catch (error) {
        log(`[${PLUGIN_OWNER_ID}] Ошибка при загрузке: ${error.message}\n${error.stack}`);
    }
}

async function onUnload({
    botId,
    prisma
}) {
    console.log(`[${PLUGIN_OWNER_ID}] Удаление ресурсов для бота ID: ${botId}`);
    try {
        await prisma.command.deleteMany({
            where: {
                botId,
                owner: PLUGIN_OWNER_ID
            }
        });
        await prisma.permission.deleteMany({
            where: {
                botId,
                owner: PLUGIN_OWNER_ID
            }
        });
        console.log(`[${PLUGIN_OWNER_ID}] Команды и права плагина удалены.`);
    } catch (error) {
        console.error(`[${PLUGIN_OWNER_ID}] Ошибка при очистке ресурсов:`, error);
    }
}

module.exports = {
    onLoad,
    onUnload,
};