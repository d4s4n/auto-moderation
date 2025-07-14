const {
    PERMISSIONS,
    PLUGIN_OWNER_ID
} = require('../constants.js');

function format(template, values = {}) {
    if (!template) return '';
    return Object.entries(values).reduce((acc, [key, value]) => acc.replace(new RegExp(`{${key}}`, 'g'), value), template);
}

module.exports = (Command, messages, throttledSendMessage) => {
    return class UnwarnCommand extends Command {
        constructor() {
            super({
                name: 'unwarn',
                description: 'Снять все предупреждения с игрока.',
                aliases: ['анварн'],
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

            if (!executor.isOwner && !executor.hasPermission(PERMISSIONS.WARN)) {
                return this.onInsufficientPermissions(bot, typeChat, user);
            }

            const warnMap = bot.pluginData.autoModeration.warns;
            const targetLower = игрок.toLowerCase();
            if (!warnMap.has(targetLower) || warnMap.get(targetLower)?.count === 0) {
                return throttledSendMessage(typeChat, format(messages.UNWARN_FAIL_NO_WARNS, {
                    target: игрок
                }), user.username);
            }
            warnMap.delete(targetLower);
            throttledSendMessage('clan', format(messages.UNWARN_SUCCESS, {
                target: игрок,
                moderator: user.username
            }));
        }
    }
};