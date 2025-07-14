const {
    PERMISSIONS,
    PLUGIN_OWNER_ID
} = require('../constants.js');

function format(template, values = {}) {
    if (!template) return '';
    return Object.entries(values).reduce((acc, [key, value]) => acc.replace(new RegExp(`{${key}}`, 'g'), value), template);
}

module.exports = (Command, actionHandler, messages, throttledSendMessage) => {
    return class WarnCommand extends Command {
        constructor() {
            super({
                name: 'warn',
                description: 'Выдать предупреждение игроку.',
                aliases: ['варн'],
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
            причина = 'Не указана'
        }) {
            const executor = await bot.api.getUser(user.username);
            if (!executor) return;

            if (!executor.isOwner && !executor.hasPermission(PERMISSIONS.WARN)) {
                return this.onInsufficientPermissions(bot, typeChat, user);
            }

            if (bot.pluginData.autoModeration.immunitySet.has(игрок.toLowerCase())) return;

            if (игрок.toLowerCase() === user.username.toLowerCase()) {
                return throttledSendMessage(typeChat, format(messages.WARN_FAIL_SELF), user.username);
            }
            if (игрок.toLowerCase() === bot.username.toLowerCase()) {
                return throttledSendMessage(typeChat, format(messages.WARN_FAIL_BOT), user.username);
            }
            const targetUser = await bot.api.getUser(игрок);
            if (targetUser && targetUser.hasPermission(PERMISSIONS.IMMUNE)) {
                return throttledSendMessage(typeChat, format(messages.WARN_FAIL_IMMUNE, {
                    target: игрок
                }), user.username);
            }
            await actionHandler.applyWarn(игрок, user.username, причина);
        }
    }
};