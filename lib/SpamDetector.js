class SpamDetector {
    constructor(settings) {
        this.userMessages = {};
        this.userViolations = {};

        this.config = {
            violationLimit: settings.violationLimit || 3,
            warningThreshold: settings.warningThreshold || 1,
            violationResetTime: (settings.violationResetMinutes || 10) * 60 * 1000,
            windows: settings.windows || [
                { duration: 10000, limit: 7, reason: 'Слишком быстрый спам' },
                { duration: 60000, limit: 20, reason: 'Продолжительный спам' },
            ],
            trivialMessageLimit: settings.trivialMessageLimit || 4,
            trivialReason: settings.trivialReason || 'Спам бессмысленными сообщениями',
            similarityThreshold: settings.similarityThreshold || 4,
            similarityReason: settings.similarityReason || 'Спам похожими сообщениями',
            consecutiveConsonantsLimit: settings.consecutiveConsonantsLimit || 7,
            gibberishMinLength: settings.gibberishMinLength || 10,
            gibberishReason: settings.gibberishReason || 'Спам бессмысленным набором символов',
        };
    }

    addMessage(nickname, message) {
        const now = Date.now();

        if (!this.userMessages[nickname]) this.userMessages[nickname] = [];
        if (!this.userViolations[nickname] || (now - this.userViolations[nickname].lastViolationTime > this.config.violationResetTime)) {
            this.userViolations[nickname] = { count: 0, lastViolationTime: now };
        }

        this.userMessages[nickname].push({ message, datetime: now });

        let violationReason = null;

        for (const window of this.config.windows) {
            const messagesInWindow = this.userMessages[nickname].filter(entry => now - entry.datetime <= window.duration);
            this.userMessages[nickname] = messagesInWindow;

            if (messagesInWindow.length > window.limit) {
                violationReason = window.reason;
                break;
            }
        }

        const messagesInShortestWindow = this.userMessages[nickname].filter(entry => now - entry.datetime <= (this.config.windows[0]?.duration || 10000));

        if (!violationReason) {
            const trivialCount = messagesInShortestWindow.filter(entry => this.isTrivialMessage(entry.message)).length;
            if (trivialCount > this.config.trivialMessageLimit) {
                violationReason = this.config.trivialReason;
            }
        }

        if (!violationReason) {
            const similarCount = this.countSimilarPairs(messagesInShortestWindow);
            if (similarCount > this.config.similarityThreshold) {
                violationReason = this.config.similarityReason;
            }
        }

        if (!violationReason) {
            if (this.isGibberish(message)) {
                return { status: 'warn', violations: 1, reason: this.config.gibberishReason };
            }
        }

        if (violationReason) {
            this.userViolations[nickname].count++;
            this.userViolations[nickname].lastViolationTime = now;
            const currentViolations = this.userViolations[nickname].count;

            if (currentViolations >= this.config.violationLimit) {
                return { status: 'kick', violations: currentViolations, reason: violationReason };
            } else if (currentViolations >= this.config.warningThreshold) {
                return { status: 'warn', violations: currentViolations, reason: violationReason };
            }
        }

        return { status: 'ok', violations: this.userViolations[nickname].count, reason: null };
    }

    isGibberish(message) {
        if (message.length < this.config.gibberishMinLength) {
            return false;
        }

        const CONSONANTS = 'бвгджзйклмнпрстфхцчшщbcdfghjklmnpqrstvwxz';
        let consecutiveConsonants = 0;
        let maxConsecutiveConsonants = 0;

        for (const char of message.toLowerCase()) {
            if (CONSONANTS.includes(char)) {
                consecutiveConsonants++;
            } else {
                maxConsecutiveConsonants = Math.max(maxConsecutiveConsonants, consecutiveConsonants);
                consecutiveConsonants = 0;
            }
        }
        maxConsecutiveConsonants = Math.max(maxConsecutiveConsonants, consecutiveConsonants);

        return maxConsecutiveConsonants >= this.config.consecutiveConsonantsLimit;
    }

    countSimilarPairs(messages) {
        let similarPairs = 0;
        for (let i = 0; i < messages.length; i++) {
            for (let j = i + 1; j < messages.length; j++) {
                if (this.isSimilar(messages[i].message, messages[j].message)) {
                    similarPairs++;
                }
            }
        }
        return similarPairs;
    }

    isSimilar(message1, message2) {
        const levenshteinThreshold = 5;
        const similarityThreshold = 0.4;
        if (this.isTrivialMessage(message1) || this.isTrivialMessage(message2)) return false;
        if (this.levenshteinDistance(message1, message2) <= levenshteinThreshold) return true;

        const words1 = new Set(message1.split(/\s+/));
        const words2 = new Set(message2.split(/\s+/));
        const intersection = new Set([...words1].filter(word => words2.has(word)));
        const union = new Set([...words1, ...words2]);
        return (intersection.size / union.size) > similarityThreshold;
    }

    isTrivialMessage(message) {
        return /^(.)\1*$/.test(message) || /^(..+?)\1+$/.test(message);
    }

    levenshteinDistance(a, b) {
        const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
        for (let i = 0; i <= a.length; i += 1) matrix[0][i] = i;
        for (let j = 0; j <= b.length; j += 1) matrix[j][0] = j;
        for (let j = 1; j <= b.length; j += 1) {
            for (let i = 1; i <= a.length; i += 1) {
                const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + indicator,
                );
            }
        }
        return matrix[b.length][a.length];
    }
}

module.exports = SpamDetector;
