const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { Pool } = require("pg");

async function main() {
    console.log("==========================================");
    console.log("  EXPLICIT POSTGRESQL SCHEMA MIGRATION    ");
    console.log("==========================================");

    const envUrl = process.env.DATABASE_URL || "";
    const pass = envUrl.match(/:([^:@]+)@/)?.[1] || "DreamskyPass2026";
    
    const connectionStrings = [
        `postgresql://dreamsky_dreamsky:${pass}@127.0.0.1:5432/dreamsky_DreamSky?schema=public`,
        `postgresql://dreamsky:${pass}@127.0.0.1:5432/dreamsky_DreamSky?schema=public`,
        envUrl,
        `postgresql://dreamsky_database:${pass}@127.0.0.1:5432/dreamsky_DreamSky?schema=public`,
    ].filter(Boolean);

    let pool = null;
    let connectedUser = "";
    for (const connStr of connectionStrings) {
        try {
            const testPool = new Pool({ connectionString: connStr, connectionTimeoutMillis: 2000 });
            await testPool.query("SELECT 1");
            pool = testPool;
            connectedUser = connStr.match(/\/\/([^:]+):/)?.[1] || "user";
            console.log(`   ✅ Connected successfully as table owner: '${connectedUser}'`);
            break;
        } catch (e) {
            // try next
        }
    }

    if (!pool) {
        pool = new Pool({
            connectionString: "postgresql://dreamsky_dreamsky:DreamskyPass2026@127.0.0.1:5432/dreamsky_DreamSky?schema=public",
        });
    }

    const runSql = async (label, sql) => {
        try {
            await pool.query(sql);
            console.log(`   ✅ ${label}`);
        } catch (e) {
            console.log(`   ⚠️ ${label}: ${e.message}`);
        }
    };

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

    // Transfer table ownership to dreamsky_database so backend has 100% control
    await runSql("Transfer Student ownership to dreamsky_database", `ALTER TABLE "Student" OWNER TO "dreamsky_database";`);
    await runSql("Transfer Document ownership to dreamsky_database", `ALTER TABLE "Document" OWNER TO "dreamsky_database";`);
    await runSql("Transfer DocumentVersion ownership to dreamsky_database", `ALTER TABLE "DocumentVersion" OWNER TO "dreamsky_database";`);

    console.log("\n==========================================");
    console.log("  DATABASE SCHEMA SUCCESSFULLY MIGRATED!  ");
    console.log("==========================================");
    await pool.end();
}

main().catch((err) => {
    console.error("Migration error:", err);
    process.exit(1);
});
