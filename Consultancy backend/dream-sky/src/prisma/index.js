require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const globalForPrisma = global;

const getClient = () => {
    const productionUrl = "postgresql://dreamsky_database:DreamskyPass2026@127.0.0.1:5432/dreamsky_DreamSky?schema=public";
    const localUrl = "postgresql://postgres:postgres@127.0.0.1:5432/dreamsky_db?schema=public";

    const isLocalDev = __dirname.startsWith("/Users/") || __dirname.includes("suyogdhakal");
    const dbUrl = isLocalDev ? localUrl : productionUrl;

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
