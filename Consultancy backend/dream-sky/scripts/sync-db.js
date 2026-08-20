const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { Pool } = require("pg");

async function main() {
    console.log("==========================================");
    console.log("  EXPLICIT POSTGRESQL SCHEMA MIGRATION    ");
    console.log("==========================================");

    // Read passwords & users from environment or default cPanel patterns
    const pass = process.env.DATABASE_URL?.match(/:([^:@]+)@/)?.[1] || "DreamskyPass2026";
    
    const candidates = [
        process.env.DATABASE_URL,
        `postgresql://dreamsky:${pass}@127.0.0.1:5432/dreamsky_DreamSky?schema=public`,
        `postgresql://dreamsky_database:${pass}@127.0.0.1:5432/dreamsky_DreamSky?schema=public`,
        `postgresql://postgres:postgres@127.0.0.1:5432/dreamsky_DreamSky?schema=public`,
        `postgresql://dreamsky_admin:${pass}@127.0.0.1:5432/dreamsky_DreamSky?schema=public`
    ].filter(Boolean);

    let pool = null;
    let connectedUrl = "";
    for (const connStr of candidates) {
        try {
            const testPool = new Pool({ connectionString: connStr, connectionTimeoutMillis: 2000 });
            await testPool.query("SELECT 1");
            pool = testPool;
            connectedUrl = connStr;
            console.log(`   ✅ Connected using: ${connStr.replace(/:[^:@]+@/, ":****@")}`);
            break;
        } catch (e) {
            // try next
        }
    }

    if (!pool) {
        pool = new Pool({
            connectionString: "postgresql://dreamsky_database:DreamskyPass2026@127.0.0.1:5432/dreamsky_DreamSky?schema=public",
        });
    }

    // Query current table owner
    try {
        const ownerRes = await pool.query("SELECT tableowner FROM pg_tables WHERE tablename = 'Student'");
        if (ownerRes.rows.length > 0) {
            console.log(`   ℹ️ Table 'Student' is owned by: '${ownerRes.rows[0].tableowner}'`);
        }
    } catch (e) {}

    const runSql = async (label, sql) => {
        try {
            await pool.query(sql);
            console.log(`   ✅ ${label}`);
        } catch (e) {
            console.log(`   ⚠️ ${label}: ${e.message}`);
        }
    };

    // Try reassigning table ownership to dreamsky_database if logged in as table owner
    await runSql("Transfer Student ownership to dreamsky_database", `ALTER TABLE "Student" OWNER TO "dreamsky_database";`);
    await runSql("Transfer Document ownership to dreamsky_database", `ALTER TABLE "Document" OWNER TO "dreamsky_database";`);

    // Add columns to Student table
    await runSql("Student.studentCode column", `ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "studentCode" TEXT;`);
    await runSql("Student.passportNumber column", `ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "passportNumber" TEXT;`);

    // Add columns to Document table
    await runSql("Document.category column", `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "category" TEXT DEFAULT 'other';`);
    await runSql("Document.customName column", `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "customName" TEXT;`);
    await runSql("Document.reviewComment column", `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "reviewComment" TEXT;`);
    await runSql("Document.reviewedById column", `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;`);
    await runSql("Document.reviewedAt column", `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);`);
    await runSql("Document.currentVersion column", `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "currentVersion" INTEGER DEFAULT 1;`);

    // Create DocumentVersion table
    await runSql("DocumentVersion table", `
        CREATE TABLE IF NOT EXISTS "DocumentVersion" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "documentId" TEXT NOT NULL REFERENCES "Document"("id") ON DELETE CASCADE,
            "versionNumber" INTEGER NOT NULL,
            "fileUrl" TEXT NOT NULL,
            "originalName" TEXT,
            "mimeType" TEXT,
            "fileSize" INTEGER,
            "uploadedById" TEXT,
            "status" TEXT DEFAULT 'uploaded',
            "notes" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    console.log("\n==========================================");
    console.log("  DATABASE DIAGNOSTIC & MIGRATION COMPLETE ");
    console.log("==========================================");
    await pool.end();
}

main().catch((err) => {
    console.error("Migration error:", err);
    process.exit(1);
});
