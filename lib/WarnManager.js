class WarnManager {
    constructor(prisma, botId) {
        this.prisma = prisma;
        this.botId = botId;
    }

    async getWarns(username) {
        const user = await this.prisma.autoModUser.findUnique({
            where: {
                botId_username: {
                    botId: this.botId,
                    username: username,
                },
            },
        });
        return user ? user.warns : 0;
    }

    async setWarns(username, warns) {
        await this.prisma.autoModUser.upsert({
            where: {
                botId_username: {
                    botId: this.botId,
                    username: username,
                },
            },
            update: {
                warns
            },
            create: {
                botId: this.botId,
                username: username,
                warns,
            },
        });
    }

    async addWarn(username) {
        const currentWarns = await this.getWarns(username);
        const newWarns = currentWarns + 1;
        await this.setWarns(username, newWarns);
        return newWarns;
    }

    async clearWarns(username) {
        await this.setWarns(username, 0);
        return 0;
    }
}

module.exports = WarnManager;