const {
    PERMISSIONS,
    PLUGIN_OWNER_ID
} = require('../constants.js');

function format(template, values = {}) {
    if (!template) return '';
    return Object.entries(values).reduce((acc, [key, value]) => acc.replace(new RegExp(`{${key}}`, 'g'), value), template);
}

module.exports = (Command, messages, throttledSendMessage, dataManager) => {
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
            this.getPlayerData = dataManager.getPlayerData;
            this.updatePlayerData = dataManager.updatePlayerData;
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
            const playerData = this.getPlayerData(игрок);

            if ((!targetUser || !targetUser.isBlacklisted) && !playerData.banInfo) {
                return throttledSendMessage(typeChat, format(messages.UNBAN_FAIL_NOT_BANNED, {
                    target: игрок
                }), user.username);
            }

            if (targetUser && targetUser.isBlacklisted) {
                await targetUser.setBlacklist(false);
            }
            
            if (playerData.banInfo) {
                playerData.banInfo = null;
                await this.updatePlayerData(игрок, playerData);
            }
            
            const currentUiState = bot.pluginUiState.get('auto-moderation') || { violators: [] };
            const updatedViolators = currentUiState.violators.filter(v => v.username !== игрок);
            bot.api.sendUiUpdate('auto-moderation', { violators: updatedViolators });

            throttledSendMessage('clan', format(messages.UNBAN_SUCCESS, {
                target: игрок,
                moderator: user.username
            }));
        }
    }
};