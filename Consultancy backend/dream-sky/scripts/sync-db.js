const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const prisma = require("../src/prisma");

async function main() {
    console.log("==========================================");
    console.log("  EXPLICIT POSTGRESQL SCHEMA MIGRATION    ");
    console.log("==========================================");

    const runSql = async (label, sql) => {
        try {
            await prisma.$executeRawUnsafe(sql);
            console.log(`   ✅ ${label}`);
        } catch (e) {
            console.log(`   ⚠️ ${label}: ${e.message}`);
        }
    };

    // 1. Create DocumentCategory enum if not exists
    await runSql("DocumentCategory Enum", `
        DO $$ BEGIN
            CREATE TYPE "DocumentCategory" AS ENUM ('IDENTITY', 'ACADEMIC', 'ENGLISH_TEST', 'FINANCE', 'VISA', 'OTHER');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    // 2. Add new columns to Student table
    await runSql("Student.studentCode column", `ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "studentCode" TEXT;`);
    await runSql("Student.passportNumber column", `ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "passportNumber" TEXT;`);

    // 3. Add new columns to Document table
    await runSql("Document.category column", `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "category" "DocumentCategory" DEFAULT 'OTHER';`);
    await runSql("Document.customName column", `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "customName" TEXT;`);
    await runSql("Document.reviewComment column", `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "reviewComment" TEXT;`);
    await runSql("Document.reviewedById column", `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;`);
    await runSql("Document.reviewedAt column", `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);`);
    await runSql("Document.currentVersion column", `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "currentVersion" INTEGER DEFAULT 1;`);

    // 4. Create DocumentVersion table
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
            "status" "DocumentStatus" DEFAULT 'UPLOADED',
            "notes" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    console.log("\n==========================================");
    console.log("  DATABASE SCHEMA SUCCESSFULLY MIGRATED!  ");
    console.log("==========================================");
    await prisma.$disconnect();
}

main().catch((err) => {
    console.error("Migration error:", err);
    process.exit(1);
});
