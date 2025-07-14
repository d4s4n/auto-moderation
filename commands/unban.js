const {
    PERMISSIONS,
    PLUGIN_OWNER_ID
} = require('../constants.js');

function format(template, values = {}) {
    if (!template) return '';
    return Object.entries(values).reduce((acc, [key, value]) => acc.replace(new RegExp(`{${key}}`, 'g'), value), template);
}

module.exports = (Command, messages, throttledSendMessage) => {
    return class UnbanCommand extends Command {
        constructor() {
            super({
                name: 'unban',
                description: 'Разбанить игрока и убрать из черного списка.',
                aliases: ['анбан'],
                owner: PLUGIN_OWNER_ID,
                args: [{
                    name: 'игрок',
                    type: 'string',
                    required: true
                }],
                allowedChatTypes: ['clan', 'private'],
            });
        }

        async handler(bot, typeChat, user, {
            игрок
        }) {
            const executor = await bot.api.getUser(user.username);
            if (!executor) return;

            if (!executor.isOwner && !executor.hasPermission(PERMISSIONS.BAN)) {
                return this.onInsufficientPermissions(bot, typeChat, user);
            }

            const targetUser = await bot.api.getUser(игрок);
            if (!targetUser || !targetUser.isBlacklisted) {
                return throttledSendMessage(typeChat, format(messages.UNBAN_FAIL_NOT_BANNED, {
                    target: игрок
                }), user.username);
            }
            await targetUser.setBlacklist(false);
            throttledSendMessage('clan', format(messages.UNBAN_SUCCESS, {
                target: игрок,
                moderator: user.username
            }));
        }
    }
};