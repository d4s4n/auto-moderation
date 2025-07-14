const {
    PERMISSIONS,
    PLUGIN_OWNER_ID
} = require('../constants.js');

function format(template, values = {}) {
    if (!template) return '';
    return Object.entries(values).reduce((acc, [key, value]) => acc.replace(new RegExp(`{${key}}`, 'g'), value), template);
}

module.exports = (Command, actionHandler, messages, throttledSendMessage) => {
    return class BanCommand extends Command {
        constructor() {
            super({
                name: 'ban',
                description: 'Забанить игрока и добавить в черный список.',
                aliases: ['бан'],
                owner: PLUGIN_OWNER_ID,
                args: [{
                        name: 'игрок',
                        type: 'string',
                        required: true
                    },
                    {
                        name: 'причина',
                        type: 'greedy_string',
                        required: false
                    }
                ],
                allowedChatTypes: ['clan', 'private'],
            });
        }

        async handler(bot, typeChat, user, {
            игрок,
            причина = 'Причина не указана'
        }) {
            const executor = await bot.api.getUser(user.username);
            if (!executor) return;

            if (!executor.isOwner && !executor.hasPermission(PERMISSIONS.BAN)) {
                return this.onInsufficientPermissions(bot, typeChat, user);
            }

            if (bot.pluginData.autoModeration.immunitySet.has(игрок.toLowerCase())) return;

            if (игрок.toLowerCase() === user.username.toLowerCase()) {
                return throttledSendMessage(typeChat, format(messages.BAN_FAIL_SELF), user.username);
            }
            if (игрок.toLowerCase() === bot.username.toLowerCase()) {
                return throttledSendMessage(typeChat, format(messages.BAN_FAIL_BOT), user.username);
            }
            const targetUser = await bot.api.getUser(игрок);
            if (targetUser && targetUser.hasPermission(PERMISSIONS.IMMUNE)) {
                return throttledSendMessage(typeChat, format(messages.BAN_FAIL_IMMUNE, {
                    target: игрок
                }), user.username);
            }
            await actionHandler.applyBan(игрок, user.username, причина);
        }
    }
};