const {
    PERMISSIONS,
    PLUGIN_OWNER_ID
} = require('../constants.js');

function format(template, values = {}) {
    if (!template) return '';
    return Object.entries(values).reduce((acc, [key, value]) => acc.replace(new RegExp(`{${key}}`, 'g'), value), template);
}

module.exports = (Command, messages, throttledSendMessage, dataManager) => {
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
            this.getPlayerData = dataManager.getPlayerData;
            this.updatePlayerData = dataManager.updatePlayerData;
        }

        async handler(bot, typeChat, user, {
            игрок
        }) {
            const executor = await bot.api.getUser(user.username);
            if (!executor) return;

            if (!executor.isOwner && !executor.hasPermission(PERMISSIONS.WARN)) {
                return this.onInsufficientPermissions(bot, typeChat, user);
            }

            const playerData = this.getPlayerData(игрок);
            if (!playerData.warns || playerData.warns === 0) {
                return throttledSendMessage(typeChat, format(messages.UNWARN_FAIL_NO_WARNS, {
                    target: игрок
                }), user.username);
            }

            playerData.warns = 0;
            playerData.warnTimestamp = null;
            await this.updatePlayerData(игрок, playerData);
            
            const currentUiState = bot.pluginUiState.get('auto-moderation') || { violators: [] };
            const updatedViolators = currentUiState.violators.filter(v => v.username !== игрок);
            bot.api.sendUiUpdate('auto-moderation', { violators: updatedViolators });
            
            throttledSendMessage('clan', format(messages.UNWARN_SUCCESS, {
                target: игрок,
                moderator: user.username
            }));
        }
    }
};