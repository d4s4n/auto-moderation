class SpamDetector {
    constructor(settings) {
        if (SpamDetector.instance) {
            return SpamDetector.instance;
        }

        this.userMessages = new Map();
        this.windows = [{
            duration: 8000,
            limit: 6,
            name: 'Короткое'
        }, {
            duration: 20000,
            limit: 10,
            name: 'Среднее'
        }, {
            duration: 60000,
            limit: 25,
            name: 'Длинное'
        }];
        this.trivialMessageLimit = 4;
        this.identicalMessageThreshold = 5;
        this.similarMessagePairsThreshold = 4;
        this.minMessagesForContentCheck = 5;
        this.minMessagesForRateCheck = 4;
        this.rateMultiplierFlood = 1.8;
        this.rateMultiplierContent = 1.0;
        this.linkSpamTrigger = settings.linkProtectionEnabled;

        SpamDetector.instance = this;
    }

    static getInstance(settings) {
        if (!SpamDetector.instance) {
            SpamDetector.instance = new SpamDetector(settings);
        }
        return SpamDetector.instance;
    }

    addMessage(nickname, message) {
        if (!this.userMessages.has(nickname)) this.userMessages.set(nickname, []);
        const userHistory = this.userMessages.get(nickname);
        const currentTime = Date.now();
        userHistory.push({
            message,
            datetime: currentTime
        });
        const maxWindowDuration = Math.max(...this.windows.map(w => w.duration));
        const recentMessages = userHistory.filter(entry => currentTime - entry.datetime <= maxWindowDuration);
        this.userMessages.set(nickname, recentMessages);

        if (this.linkSpamTrigger && this.isMessageContainingLink(message)) {
            return {
                isSpamming: true,
                reason: 'Ссылка'
            };
        }

        for (const window of this.windows) {
            const messagesInWindow = recentMessages.filter(entry => currentTime - entry.datetime <= window.duration);
            const messageCountInWindow = messagesInWindow.length;
            if (messageCountInWindow < this.minMessagesForRateCheck) continue;
            const timestamps = messagesInWindow.map(e => e.datetime);
            const oldestTime = Math.min(...timestamps);
            const timeSpan = Math.max(1000, currentTime - oldestTime);
            const messageRate = messageCountInWindow / (timeSpan / 1000);
            const allowedRate = window.limit / (window.duration / 1000);

            if (messageCountInWindow >= this.minMessagesForContentCheck) {
                const messageCounts = new Map();
                let maxIdenticalCount = 0;
                messagesInWindow.forEach(entry => {
                    const msg = entry.message.trim();
                    if (msg.length === 0) return;
                    const count = (messageCounts.get(msg) || 0) + 1;
                    messageCounts.set(msg, count);
                    if (count > maxIdenticalCount) maxIdenticalCount = count;
                });
                if (maxIdenticalCount >= this.identicalMessageThreshold) {
                    if (messageRate > allowedRate * this.rateMultiplierContent) {
                        return {
                            isSpamming: true,
                            reason: `Одинаковые (${maxIdenticalCount}/${this.identicalMessageThreshold} сообщения)`
                        };
                    }
                }
                const trivialMessagesCount = messagesInWindow.filter(entry => this.isTrivialMessage(entry.message)).length;
                if (trivialMessagesCount >= this.trivialMessageLimit) {
                    if (messageRate > allowedRate * this.rateMultiplierContent) {
                        return {
                            isSpamming: true,
                            reason: `Примитивные (${trivialMessagesCount}/${this.trivialMessageLimit})`
                        };
                    }
                }
                if (maxIdenticalCount < this.identicalMessageThreshold) {
                    const similarPairs = this.countSimilarMessagePairs(messagesInWindow);
                    const dynamicSimilarThreshold = Math.max(this.similarMessagePairsThreshold, Math.floor(messageCountInWindow * 0.3));
                    if (similarPairs >= dynamicSimilarThreshold) {
                        if (messageRate > allowedRate * this.rateMultiplierContent) {
                            return {
                                isSpamming: true,
                                reason: `Похожие (${similarPairs}/${dynamicSimilarThreshold})`
                            };
                        }
                    }
                }
            }
            if (messageRate > allowedRate * this.rateMultiplierFlood && messageCountInWindow > window.limit * 0.7) {
                return {
                    isSpamming: true,
                    reason: `Флуд (Частота: ${messageRate.toFixed(1)} > ${allowedRate.toFixed(1)}*${this.rateMultiplierFlood})`
                };
            }
        }
        return {
            isSpamming: false
        };
    }

    countSimilarMessagePairs(messages) {
        let similarCount = 0;
        const processedPairs = new Set();
        for (let i = 0; i < messages.length; i++) {
            for (let j = i + 1; j < messages.length; j++) {
                const pairKey = `${i}-${j}`;
                if (messages[i].message.trim() === messages[j].message.trim()) continue;
                if (!processedPairs.has(pairKey)) {
                    if (this.isSimilar(messages[i].message, messages[j].message)) {
                        similarCount++;
                        processedPairs.add(pairKey);
                    }
                }
            }
        }
        return similarCount;
    }

    isSimilar(message1, message2) {
        const msg1 = message1.trim(),
            msg2 = message2.trim();
        if (msg1.length < 5 || msg2.length < 5 || this.isTrivialMessage(msg1) || this.isTrivialMessage(msg2)) return false;
        const len1 = msg1.length,
            len2 = msg2.length,
            minLen = Math.min(len1, len2);
        let levenshteinThreshold;
        if (minLen <= 8) levenshteinThreshold = 2;
        else if (minLen <= 15) levenshteinThreshold = 3;
        else levenshteinThreshold = Math.max(4, Math.ceil(minLen * 0.3));
        const levenshteinDist = this.levenshteinDistance(msg1, msg2);
        if (levenshteinDist <= levenshteinThreshold) {
            return Math.abs(len1 - len2) <= Math.max(levenshteinThreshold + 2, Math.ceil(minLen * 0.5));
        }
        if (minLen < 10) return false;
        const words1 = new Set(msg1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
        const words2 = new Set(msg2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
        if (words1.size < 2 || words2.size < 2) return false;
        const intersection = new Set([...words1].filter(word => words2.has(word)));
        const union = new Set([...words1, ...words2]);
        return (intersection.size / union.size) > 0.6;
    }

    isMessageContainingLink(message) {
        const linkRegex = /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&\/\/=]*))|(www\.[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&\/\/=]*))|([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\.[a-zA-Z]{2,}\b([-a-zA-Z0-9()@:%_+.~#?&\/\/=]*))/i;
        return linkRegex.test(message);
    }

    isTrivialMessage(message) {
        const msg = message.trim();
        if (msg.length < 3) return false;
        if (/^(.)\1{2,}$/.test(msg)) return true;
        for (let len = 1; len <= Math.min(5, Math.floor(msg.length / 2)); len++) {
            const pattern = msg.substring(0, len);
            const regex = new RegExp(`^(${pattern})+$`);
            if (regex.test(msg) && msg.length >= len * 2 && msg.length > pattern.length) return true;
        }
        return false;
    }

    levenshteinDistance(a, b) {
        if (a === b) return 0;
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                const cost = (b.charAt(i - 1) === a.charAt(j - 1)) ? 0 : 1;
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + cost, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
            }
        }
        return matrix[b.length][a.length];
    }
}

module.exports = SpamDetector;