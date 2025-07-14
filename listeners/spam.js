const SpamDetector = require('../lib/SpamDetector.js');

function setupSpamListener(bot, settings, actionHandler, formatter) {
    const spamDetector = SpamDetector.getInstance(settings);

    bot.on('chat', async (user, message) => {
        if (user.isModerator || user.isOwner || await bot.api.hasPermission(user.username, 'moderation.immune')) {
            return;
        }

        const spamResult = spamDetector.addMessage(user.username, message);

        if (spamResult.isSpamming) {
            bot.api.sendMessage('clan', formatter.format('SPAM_DETECTED', {
                username: user.username
            }));
            const reason = formatter.format('SPAM_ACTION_WARN_REASON', {
                reason: spamResult.reason
            });
            await actionHandler.applyWarn(user.username, 'AutoMod', reason);
        }
    });
}

module.exports = setupSpamListener;