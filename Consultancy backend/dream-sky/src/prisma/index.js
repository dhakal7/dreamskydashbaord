require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const globalForPrisma = global;

const getClient = () => {
    let dbUrl = process.env.DATABASE_URL || "postgresql://dreamsky_database:DreamskyPass2026@127.0.0.1:5432/dreamsky_DreamSky?schema=public";
    
    // Auto-fix stale user/password if old credentials persist in .env or shell cache
    if (dbUrl.includes("dreamsky_dreamsky")) {
        dbUrl = dbUrl.replace("dreamsky_dreamsky", "dreamsky_database").replace(/:[^@]+@/, ":DreamskyPass2026@");
    }

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
