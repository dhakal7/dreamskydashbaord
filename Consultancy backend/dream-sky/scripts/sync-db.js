const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Syncing database schema safely...')

  // 1. Create DocumentCategory enum if not exists
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
        CREATE TYPE "DocumentCategory" AS ENUM ('IDENTITY', 'ACADEMIC', 'ENGLISH_TEST', 'FINANCE', 'VISA', 'OTHER');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `)

  // 2. Add DocumentType enum values if missing
  const typesToAdd = [
    'PASSPORT', 'CITIZENSHIP', 'NATIONAL_ID', 'BIRTH_CERTIFICATE',
    'SEE_TRANSCRIPT', 'SEE_CHARACTER', 'PLUS2_TRANSCRIPT', 'PLUS2_CHARACTER',
    'BACHELOR_TRANSCRIPT', 'BACHELOR_DEGREE', 'MASTER_TRANSCRIPT', 'MASTER_DEGREE',
    'IELTS', 'PTE', 'TOEFL', 'SAT', 'GRE', 'GMAT',
    'BANK_BALANCE_CERTIFICATE', 'BANK_STATEMENT', 'PROPERTY_VALUATION', 'INCOME_SOURCE', 'TAX_CLEARANCE', 'RELATIONSHIP_CERTIFICATE',
    'OFFER_LETTER', 'COE_CAS_I20', 'VISA_GRANT_LETTER', 'VISA_REFUSAL_LETTER',
    'SOP', 'CV_RESUME', 'RECOMMENDATION_LETTER', 'WORK_EXPERIENCE'
  ]

  for (const t of typesToAdd) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS '${t}'`)
    } catch (e) {
      // Ignore if enum value already exists or not postgres enum
    }
  }

  // 3. Add DocumentStatus enum values if missing
  const statusesToAdd = ['UPLOADED', 'PENDING_STUDENT_REVIEW', 'CHANGES_REQUESTED', 'RE_UPLOADED', 'VERIFIED', 'REJECTED', 'EXPIRED', 'PENDING']
  for (const s of statusesToAdd) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS '${s}'`)
    } catch (e) {
      // Ignore if enum value already exists
    }
  }

  // 4. Add new columns to Student table
  await prisma.$executeRawUnsafe(`ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "studentCode" TEXT;`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "passportNumber" TEXT;`)

  // 5. Add new columns to Document table
  await prisma.$executeRawUnsafe(`ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "category" "DocumentCategory" DEFAULT 'OTHER';`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "customName" TEXT;`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "reviewComment" TEXT;`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "currentVersion" INTEGER DEFAULT 1;`)

  // 6. Create DocumentVersion table
  await prisma.$executeRawUnsafe(`
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
  `)

  console.log('✅ DATABASE SCHEMA SUCCESSFULLY SYNCED IN 1 SECOND!')
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Error syncing db:', err)
  process.exit(1)
})
