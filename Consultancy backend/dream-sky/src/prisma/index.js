require("dotenv").config({ override: false });
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const { validateDatabaseUrl } = require("../config");

const globalForPrisma = global;

const getClient = () => {
    // Validate database configuration before constructing any pool or client
    const dbUrl = validateDatabaseUrl(process.env.DATABASE_URL, process.env.NODE_ENV);

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
    const client = new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });

    client.$pool = pool;
    return client;
};

const prisma = globalForPrisma.prisma ?? getClient();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

module.exports = prisma;
