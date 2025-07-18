const delay = ms => new Promise(res => setTimeout(res, ms));

class ActionHandler {
    constructor(bot, settings, messages, throttledSendMessage, dataManager, immunitySet) {
        this.bot = bot;
        this.api = bot.api;
        this.settings = settings;
        this.messages = messages;
        this.throttledSendMessage = throttledSendMessage;
        this.getPlayerData = dataManager.getPlayerData;
        this.updatePlayerData = dataManager.updatePlayerData;
        this.immunitySet = immunitySet;
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
            const playerData = this.getPlayerData(target);

            playerData.history = playerData.history || [];
            playerData.history.push({ type: 'ban', moderator, reason: finalReason, date: Date.now() });

            if (moderator === 'AutoMod') {
                const durationMinutes = this.settings.autoBanDurationMinutes || 60;
                const expiry = Date.now() + durationMinutes * 60 * 1000;

                await targetUser.setBlacklist(true);
                playerData.banInfo = { expiry, reason: finalReason, moderator };
                playerData.warns = 0; 
                await this.updatePlayerData(target, playerData);

                const durationText = `${durationMinutes} минут`;
                await this.throttledSendMessage('clan', this._format('BAN_SUCCESS_AUTO', {
                    target,
                    duration: durationText,
                    reason: finalReason
                }));
            } else {
                await targetUser.setBlacklist(true);
                playerData.warns = 0;
                playerData.banInfo = { expiry: null, reason: finalReason, moderator }; 
                await this.updatePlayerData(target, playerData);
                await this.throttledSendMessage('clan', this._format('BAN_SUCCESS', {
                    target,
                    moderator,
                    reason: finalReason
                }));
            }

            this.api.sendMessage('command', `/c kick ${target}`);
            
            const currentUiState = this.bot.pluginUiState.get('auto-moderation') || { violators: [] };
            const newViolator = {
                id: target,
                username: target,
                count: 'БАН',
                lastReason: finalReason,
                date: new Date().toISOString()
            };
            
            const existingIndex = currentUiState.violators.findIndex(v => v.id === target);
            let newViolators;
            
            if (existingIndex > -1) {
                newViolators = [...currentUiState.violators];
                newViolators[existingIndex] = newViolator;
            } else {
                newViolators = [newViolator, ...currentUiState.violators];
            }
            
            this.bot.api.sendUiUpdate('auto-moderation', { violators: newViolators.slice(0, 50) });
        } finally {
            this.immunitySet.delete(targetLower);
        }
    }

    async applyWarn(target, moderator, reason) {
        const playerData = this.getPlayerData(target);
        const newWarns = (playerData.warns || 0) + 1;

        playerData.history = playerData.history || [];
        playerData.history.push({ type: 'warn', moderator, reason, date: Date.now() });

        playerData.warns = newWarns;
        playerData.warnTimestamp = Date.now();
        await this.updatePlayerData(target, playerData);
        
        const currentUiState = this.bot.pluginUiState.get('auto-moderation') || { violators: [] };
        const newViolator = {
            id: target,
            username: target,
            count: newWarns,
            lastReason: reason,
            date: new Date().toISOString()
        };
        
        const existingIndex = currentUiState.violators.findIndex(v => v.id === target);
        let newViolators;
        
        if (existingIndex > -1) {
            newViolators = [...currentUiState.violators];
            newViolators[existingIndex] = newViolator;
        } else {
            newViolators = [newViolator, ...currentUiState.violators];
        }
        
        this.bot.api.sendUiUpdate('auto-moderation', { violators: newViolators.slice(0, 50) });

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