require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const globalForPrisma = global;

const getClient = () => {
    const dbUrl = process.env.DATABASE_URL || "postgresql://dreamsky_database:DreamskyPass2026@localhost/dreamsky_DreamSky?schema=public";

    const isRemoteDb = Boolean(
        dbUrl.includes("supabase") ||
        dbUrl.includes("render.com") ||
        dbUrl.includes("neon.tech") ||
        dbUrl.includes("neon.com") ||
        process.env.DB_USE_SSL === "true"
    );
    
    const pool = new Pool({
        connectionString: dbUrl,
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
