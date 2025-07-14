const delay = ms => new Promise(res => setTimeout(res, ms));

class ActionHandler {
    constructor(bot, settings, messages, throttledSendMessage) {
        this.bot = bot;
        this.api = bot.api;
        this.settings = settings;
        this.messages = messages;
        this.throttledSendMessage = throttledSendMessage;
        this.warns = bot.pluginData.autoModeration.warns;
        this.tempBans = bot.pluginData.autoModeration.tempBans;
        this.immunitySet = bot.pluginData.autoModeration.immunitySet;
    }

    _format(key, values = {}) {
        const template = this.messages[key] || '';
        return Object.entries(values).reduce((acc, [k, v]) => acc.replace(new RegExp(`{${k}}`, 'g'), v), template);
    }

    async applyBan(target, moderator, reason) {
        const targetLower = target.toLowerCase();
        this.immunitySet.add(targetLower);

        try {
            const targetUser = await this.api.getUser(target);
            if (!targetUser) return;

            const finalReason = reason && reason !== 'Причина не указана' ? reason : 'Не указана';

            if (moderator === 'AutoMod') {
                const durationMinutes = this.settings.autoBanDurationMinutes || 60;
                const expiry = Date.now() + durationMinutes * 60 * 1000;

                await targetUser.setBlacklist(true);
                this.tempBans.set(targetLower, {
                    expiry
                });
                this.warns.delete(targetLower);

                const durationText = `${durationMinutes} минут`;
                await this.throttledSendMessage('clan', this._format('BAN_SUCCESS_AUTO', {
                    target,
                    duration: durationText,
                    reason: finalReason
                }));
            } else {
                await targetUser.setBlacklist(true);
                this.warns.delete(targetLower);
                await this.throttledSendMessage('clan', this._format('BAN_SUCCESS', {
                    target,
                    moderator,
                    reason: finalReason
                }));
            }

            await delay(300);
            this.api.sendMessage('command', `/c kick ${target}`);
        } finally {
            this.immunitySet.delete(targetLower);
        }
    }

    async applyWarn(target, moderator, reason) {
        const targetLower = target.toLowerCase();
        const currentWarns = this.warns.get(targetLower)?.count || 0;
        const newWarns = currentWarns + 1;

        this.warns.set(targetLower, {
            count: newWarns,
            timestamp: Date.now()
        });

        const messageKey = moderator === 'AutoMod' ? 'WARN_SUCCESS_AUTO' : 'WARN_SUCCESS';
        await this.throttledSendMessage('clan', this._format(messageKey, {
            moderator,
            target,
            reason,
            newWarns,
            warnsToBan: this.settings.warnsToBan
        }));

        if (newWarns >= this.settings.warnsToBan) {
            const banReason = this._format('BAN_BY_WARNS_REASON');
            await this.applyBan(target, 'AutoMod', banReason);
        }
    }
}

module.exports = ActionHandler;