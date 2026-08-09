const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const globalForPrisma = global;

const getClient = () => {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
};

const prisma = globalForPrisma.prisma ?? getClient();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

module.exports = prisma;
