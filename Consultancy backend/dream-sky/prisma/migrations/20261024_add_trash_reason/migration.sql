-- DreamSky CRM: Phase 28.25B - Safe Source-Only Migration Artifact (Prepared, NOT Applied)
-- Objective: Add dedicated trashReason, trashedAt, and trashedById columns to "Student"
-- Mandatory Safety: Do NOT apply to database during Phase 28.25B.

-- Step 1: Add columns safely with IF NOT EXISTS
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "trashReason" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "trashedAt" TIMESTAMP(3);
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "trashedById" TEXT;

-- Step 2: Safe foreign key reference to User table for auditability
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Student_trashedById_fkey'
          AND conrelid = '"Student"'::regclass
    ) THEN
        ALTER TABLE "Student" ADD CONSTRAINT "Student_trashedById_fkey"
        FOREIGN KEY ("trashedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Step 3: Backfill from durable academicBackground JSON where records are currently soft-deleted (isActive = false)
-- Uses CASE with regex to safely parse ISO 8601 strings and guard against NULLs, malformed timestamps, and missing FKs
UPDATE "Student"
SET "trashReason" = NULLIF(TRIM("academicBackground"->>'trashReason'), ''),
    "trashedAt" = CASE
        WHEN ("academicBackground"->>'trashedAt') ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}'
        THEN ("academicBackground"->>'trashedAt')::timestamp
        ELSE NULL
    END,
    "trashedById" = CASE
        WHEN ("academicBackground"->>'trashedById') IS NOT NULL
         AND EXISTS (SELECT 1 FROM "User" u WHERE u.id = ("academicBackground"->>'trashedById'))
        THEN ("academicBackground"->>'trashedById')
        ELSE NULL
    END
WHERE "isActive" = false
  AND "academicBackground" IS NOT NULL
  AND "academicBackground"->>'trashReason' IS NOT NULL
  AND "trashReason" IS NULL;

-- Step 3b: Ensure active/restored students (isActive = true) never retain stale physical trash metadata
UPDATE "Student"
SET "trashReason" = NULL,
    "trashedAt" = NULL,
    "trashedById" = NULL
WHERE "isActive" = true
  AND ("trashReason" IS NOT NULL OR "trashedAt" IS NOT NULL OR "trashedById" IS NOT NULL);

-- Step 4: Index on trashed records for fast trash view queries
CREATE INDEX IF NOT EXISTS "Student_isActive_currentStage_idx" ON "Student"("isActive", "currentStage");

COMMENT ON COLUMN "Student"."trashReason" IS 'Durable explanation provided by administrator upon moving lead/student to Trash';
COMMENT ON COLUMN "Student"."trashedAt" IS 'Timestamp when the record was soft-deleted to Trash';
COMMENT ON COLUMN "Student"."trashedById" IS 'User ID of the administrator who moved the record to Trash';
