-- DreamSky CRM: Add dedicated Student.leadStage column with full canonical + alias preservation
-- Target: prisma/migrations/20261113_add_lead_stage/migration.sql

-- Step 1: Add nullable leadStage column without default
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "leadStage" TEXT;

-- Step 2: Backfill & normalize all 6 canonical stages + recognized legacy aliases from academicBackground JSONB
UPDATE "Student"
SET "leadStage" = CASE UPPER(REPLACE(TRIM("academicBackground"->>'leadStage'), '-', '_'))
    WHEN 'FOLLOWUP' THEN 'FOLLOW_UP'
    WHEN 'CONTACTED' THEN 'FOLLOW_UP'
    WHEN 'COUNSELING' THEN 'COUNSELLING'
    ELSE UPPER(REPLACE(TRIM("academicBackground"->>'leadStage'), '-', '_'))
END
WHERE "currentStage" IN ('LEAD', 'PROSPECT')
  AND NULLIF(TRIM("academicBackground"->>'leadStage'), '') IS NOT NULL
  AND UPPER(REPLACE(TRIM("academicBackground"->>'leadStage'), '-', '_')) IN (
      'NEW', 'FOLLOW_UP', 'FOLLOWUP', 'CONTACTED',
      'ASSIGNED', 'COUNSELLING', 'COUNSELING',
      'INTERESTED', 'NOT_CONTRACTED'
  );

-- Step 3: Fallback ONLY when JSONB leadStage is missing, NULL, or empty (never overwrite unrecognized non-null values)
UPDATE "Student"
SET "leadStage" = 'NEW'
WHERE "currentStage" = 'LEAD'
  AND "leadStage" IS NULL
  AND NULLIF(TRIM("academicBackground"->>'leadStage'), '') IS NULL;

UPDATE "Student"
SET "leadStage" = 'COUNSELLING'
WHERE "currentStage" = 'PROSPECT'
  AND "leadStage" IS NULL
  AND NULLIF(TRIM("academicBackground"->>'leadStage'), '') IS NULL;

-- Step 4: Clear physical leadStage on post-enrollment records to match resolveLeadStage()
UPDATE "Student"
SET "leadStage" = NULL
WHERE "currentStage" NOT IN ('LEAD', 'PROSPECT')
  AND "leadStage" IS NOT NULL;

COMMENT ON COLUMN "Student"."leadStage" IS 'Pre-enrollment lead pipeline stage: NEW, FOLLOW_UP, ASSIGNED, COUNSELLING, INTERESTED, NOT_CONTRACTED, or NULL for post-enrollment students';

