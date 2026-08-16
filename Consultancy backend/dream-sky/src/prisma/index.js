require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const { Pool } = require("pg");

const globalForPrisma = global;

const getClient = () => {
    // Only enable SSL for actual remote cloud databases, NOT for local PostgreSQL
    const isRemoteDb = Boolean(
        process.env.DATABASE_URL?.includes("supabase") ||
        process.env.DATABASE_URL?.includes("render.com") ||
        process.env.DATABASE_URL?.includes("neon.tech") ||
        process.env.DATABASE_URL?.includes("neon.com") ||
        process.env.DB_USE_SSL === "true"
    );
    
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: isRemoteDb ? { rejectUnauthorized: false } : false,
    });
    
    const adapter = new PrismaPg(pool);
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
