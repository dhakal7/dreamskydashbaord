-- DreamSky CRM: Phase 28.25C.9D.19 - Canonical Migration Artifact
-- Objective: Add DocumentCategory enum, expand DocumentType and DocumentStatus enums, add review columns to Document, and create DocumentVersion table.

-- Step 1: Create DocumentCategory Enum
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentCategory') THEN
        CREATE TYPE "DocumentCategory" AS ENUM ('IDENTITY', 'ACADEMIC', 'ENGLISH_TEST', 'FINANCE', 'VISA', 'OTHER');
    END IF;
END $$;

-- Step 2: Expand DocumentType Enum with missing values
DO $$ BEGIN
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'CITIZENSHIP';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'BIRTH_CERTIFICATE';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'NATIONAL_ID';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'SEE_CERTIFICATE';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'PLUS_TWO_CERTIFICATE';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'BACHELORS_CERTIFICATE';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'CHARACTER_CERTIFICATE';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'IELTS';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'PTE';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'TOEFL';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'DUOLINGO';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'BANK_CERTIFICATE';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'INCOME_CERTIFICATE';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'TAX_CLEARANCE';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'SPONSORSHIP_LETTER';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'AFFIDAVIT';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'LOAN_LETTER';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'PROPERTY_VALUATION';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'VISA_APPLICATION';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'VISA_DOCUMENTS';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'COE';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'CV';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'SOP';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'RECOMMENDATION';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'FINANCIAL';
    ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'VISA_LETTER';
END $$;

-- Step 3: Expand DocumentStatus Enum with missing values
DO $$ BEGIN
    ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS 'UPLOADED';
    ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS 'IN_REVIEW';
    ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS 'PENDING_STUDENT_REVIEW';
    ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED';
    ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS 'RE_UPLOADED';
END $$;

-- Step 4: Add new columns to Document table safely
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER';
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "customName" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "currentVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "reviewComment" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);

-- Step 5: Add Foreign Key for reviewedById
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Document_reviewedById_fkey'
          AND conrelid = '"Document"'::regclass
    ) THEN
        ALTER TABLE "Document" ADD CONSTRAINT "Document_reviewedById_fkey"
        FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Step 6: Create DocumentVersion table
CREATE TABLE IF NOT EXISTS "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "uploadedById" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- Step 7: Add Foreign Keys and Indexes for DocumentVersion
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'DocumentVersion_documentId_fkey'
          AND conrelid = '"DocumentVersion"'::regclass
    ) THEN
        ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey"
        FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'DocumentVersion_uploadedById_fkey'
          AND conrelid = '"DocumentVersion"'::regclass
    ) THEN
        ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_uploadedById_fkey"
        FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");

DO $$ BEGIN
    IF EXISTS (
        SELECT 1
        FROM "DocumentVersion"
        GROUP BY "documentId", "versionNumber"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot create unique index DocumentVersion_documentId_versionNumber_key: duplicate (documentId, versionNumber) rows exist in DocumentVersion and require manual reconciliation before applying uniqueness.';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentVersion_documentId_versionNumber_key" ON "DocumentVersion"("documentId", "versionNumber");

-- Step 8: Backfill existing documents to create initial DocumentVersion (v1) if versions are missing
INSERT INTO "DocumentVersion" ("id", "documentId", "versionNumber", "fileUrl", "originalName", "mimeType", "fileSize", "uploadedById", "status", "notes", "createdAt")
SELECT 
    'docver-' || d."id",
    d."id",
    COALESCE(d."currentVersion", 1),
    d."fileUrl",
    d."originalName",
    d."mimeType",
    d."fileSize",
    d."uploadedById",
    d."status",
    d."notes",
    d."createdAt"
FROM "Document" d
WHERE NOT EXISTS (
    SELECT 1 FROM "DocumentVersion" dv WHERE dv."documentId" = d."id"
)
ON CONFLICT DO NOTHING;
