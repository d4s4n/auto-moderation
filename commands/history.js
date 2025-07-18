const {
    PERMISSIONS,
    PLUGIN_OWNER_ID
} = require('../constants.js');

function format(template, values = {}) {
    if (!template) return '';
    return Object.entries(values).reduce((acc, [key, value]) => acc.replace(new RegExp(`{${key}}`, 'g'), value), template);
}

module.exports = (Command, messages, throttledSendMessage, dataManager) => {
    return class HistoryCommand extends Command {
        constructor() {
            super({
                name: 'history',
                description: 'Посмотреть историю наказаний игрока.',
                aliases: ['история'],
                owner: PLUGIN_OWNER_ID,
                args: [{
                    name: 'игрок',
                    type: 'string',
                    required: true
                }],
                allowedChatTypes: ['clan', 'private'],
            });
            this.getPlayerData = dataManager.getPlayerData;
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
            if (!playerData.history || playerData.history.length === 0) {
                return throttledSendMessage(typeChat, format(messages.HISTORY_FAIL_NO_RECORDS, {
                    target: игрок
                }), user.username);
            }

            const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
            const cleanString = (str) => str.replace(emojiRegex, '');
            
            const messagesToSend = [];
            messagesToSend.push(cleanString(`История наказаний для ${игрок}:`));
            
            playerData.history.forEach(record => {
                const date = new Date(record.date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                let message = `${date} - ${record.type.toUpperCase()}: выдан модератором ${record.moderator}.`;
                if (record.reason) {
                    message += ` Причина: ${record.reason}`;
                }
                messagesToSend.push(cleanString(message));
            });

            throttledSendMessage(typeChat, messagesToSend, user.username);
        }
    }
};
