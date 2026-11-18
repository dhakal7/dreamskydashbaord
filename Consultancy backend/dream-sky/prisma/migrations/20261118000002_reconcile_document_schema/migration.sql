-- Migration 2 of 2 (PostgreSQL 13):
-- Atomic, rerun-safe additive reconciliation of public."Document" and
-- public."DocumentVersion" against production_schema_20261117.sql.
--
-- Explicit transaction:
--   Wrapped in BEGIN / COMMIT so any precondition failure, unknown enum value,
--   orphan FK check failure, or post-condition mismatch rolls back atomically.
--   Preserves all existing document records and metadata.

BEGIN;

-- ─── 1. PRECONDITION CHECKS ──────────────────────────────────────────────────
DO $$
DECLARE
  missing_label TEXT;
  extra_label TEXT;
  v_udt_schema TEXT;
  v_udt TEXT;
  v_null TEXT;
  pk_ok BOOLEAN;
  req RECORD;
BEGIN
  IF to_regclass('public."Document"') IS NULL THEN
    RAISE EXCEPTION 'Precondition failed: table public."Document" does not exist.';
  END IF;
  IF to_regclass('public."User"') IS NULL THEN
    RAISE EXCEPTION 'Precondition failed: table public."User" does not exist.';
  END IF;

  -- Verify Document.status exists with expected public."DocumentStatus" type and NOT NULL
  SELECT udt_schema, udt_name, is_nullable INTO v_udt_schema, v_udt, v_null
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'Document' AND column_name = 'status';
  IF v_udt_schema IS DISTINCT FROM 'public' OR v_udt IS DISTINCT FROM 'DocumentStatus' OR v_null IS DISTINCT FROM 'NO' THEN
    RAISE EXCEPTION 'Precondition failed: Document.status must be NOT NULL public."DocumentStatus" (got %.%, nullable=%).',
      v_udt_schema, v_udt, v_null;
  END IF;

  -- Confirm Migration 1 committed all required DocumentStatus labels
  FOR missing_label IN
    SELECT v.label
    FROM (VALUES
      ('UPLOADED'), ('PENDING_STUDENT_REVIEW'), ('CHANGES_REQUESTED'),
      ('RE_UPLOADED'), ('VERIFIED'), ('REJECTED'), ('EXPIRED'), ('PENDING')
    ) AS v(label)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'DocumentStatus' AND e.enumlabel = v.label
    )
  LOOP
    RAISE EXCEPTION 'Precondition failed: DocumentStatus is missing enum label %. Apply and commit 20261118000001_add_document_enum_values first.', missing_label;
  END LOOP;

  -- Confirm Migration 1 committed all expected DocumentType labels (including legacy)
  FOR missing_label IN
    SELECT v.label
    FROM (VALUES
      ('ENGLISH_TEST'), ('VISA'), ('PASSPORT'), ('CITIZENSHIP'), ('BIRTH_CERTIFICATE'),
      ('NATIONAL_ID'), ('SEE_CERTIFICATE'), ('PLUS_TWO_CERTIFICATE'), ('BACHELORS_CERTIFICATE'),
      ('TRANSCRIPT'), ('CHARACTER_CERTIFICATE'), ('IELTS'), ('PTE'), ('TOEFL'), ('DUOLINGO'),
      ('BANK_STATEMENT'), ('BANK_CERTIFICATE'), ('INCOME_CERTIFICATE'), ('TAX_CLEARANCE'),
      ('SPONSORSHIP_LETTER'), ('AFFIDAVIT'), ('LOAN_LETTER'), ('PROPERTY_VALUATION'),
      ('VISA_APPLICATION'), ('VISA_DOCUMENTS'), ('OFFER_LETTER'), ('COE'), ('CV'), ('SOP'),
      ('RECOMMENDATION'), ('FINANCIAL'), ('VISA_LETTER'), ('OTHER')
    ) AS v(label)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'DocumentType' AND e.enumlabel = v.label
    )
  LOOP
    RAISE EXCEPTION 'Precondition failed: DocumentType is missing enum label %. Apply and commit 20261118000001_add_document_enum_values first.', missing_label;
  END LOOP;

  -- Ensure DocumentCategory enum exists in public schema and matches Prisma labels exactly
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'DocumentCategory'
  ) THEN
    CREATE TYPE public."DocumentCategory" AS ENUM (
      'IDENTITY', 'ACADEMIC', 'ENGLISH_TEST', 'FINANCE', 'VISA', 'OTHER'
    );
  END IF;

  FOR missing_label IN
    SELECT v.label
    FROM (VALUES ('IDENTITY'), ('ACADEMIC'), ('ENGLISH_TEST'), ('FINANCE'), ('VISA'), ('OTHER')) AS v(label)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'DocumentCategory' AND e.enumlabel = v.label
    )
  LOOP
    RAISE EXCEPTION 'Precondition failed: public."DocumentCategory" is missing enum label %.', missing_label;
  END LOOP;

  SELECT string_agg(e.enumlabel, ', ') INTO extra_label
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typname = 'DocumentCategory'
    AND e.enumlabel NOT IN ('IDENTITY', 'ACADEMIC', 'ENGLISH_TEST', 'FINANCE', 'VISA', 'OTHER');
  IF extra_label IS NOT NULL THEN
    RAISE EXCEPTION 'Precondition failed: public."DocumentCategory" contains unexpected enum label(s): %.', extra_label;
  END IF;

  -- If DocumentVersion already exists, verify its primary key on (id) and its 5 core columns
  IF to_regclass('public."DocumentVersion"') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = c.conkey[1]
      WHERE n.nspname = 'public'
        AND t.relname = 'DocumentVersion'
        AND c.contype = 'p'
        AND array_length(c.conkey, 1) = 1
        AND a.attname = 'id'
    ) INTO pk_ok;
    IF NOT pk_ok THEN
      RAISE EXCEPTION 'Precondition failed: existing public."DocumentVersion" must have a single-column PRIMARY KEY on "id".';
    END IF;

    FOR req IN
      SELECT * FROM (VALUES
        ('id', 'text', 'NO'),
        ('documentId', 'text', 'NO'),
        ('versionNumber', 'int4', 'NO'),
        ('fileUrl', 'text', 'NO'),
        ('createdAt', 'timestamp', 'NO')
      ) AS expected(col_name, exp_udt, exp_null)
    LOOP
      SELECT udt_schema, udt_name, is_nullable INTO v_udt_schema, v_udt, v_null
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'DocumentVersion'
        AND column_name = req.col_name;

      IF v_udt IS NULL THEN
        RAISE EXCEPTION 'Precondition failed: existing public."DocumentVersion" is missing required column "%".', req.col_name;
      END IF;
      IF v_udt_schema <> 'pg_catalog' OR v_udt <> req.exp_udt OR v_null <> req.exp_null THEN
        RAISE EXCEPTION 'Precondition failed: DocumentVersion.% has incompatible definition (expected pg_catalog.%, nullable=%; got %.%, nullable=%).',
          req.col_name, req.exp_udt, req.exp_null, v_udt_schema, v_udt, v_null;
      END IF;
    END LOOP;
  END IF;
END $$;

-- ─── 2. RECONCILE public."Document" ──────────────────────────────────────────
ALTER TABLE public."Document"
  ADD COLUMN IF NOT EXISTS "category" TEXT DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS "customName" TEXT,
  ADD COLUMN IF NOT EXISTS "currentVersion" INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewComment" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);

-- Backfill NULL currentVersion to 1 without overwriting existing version numbers
UPDATE public."Document" SET "currentVersion" = 1 WHERE "currentVersion" IS NULL;
ALTER TABLE public."Document"
  ALTER COLUMN "currentVersion" SET DEFAULT 1,
  ALTER COLUMN "currentVersion" SET NOT NULL;

-- Convert Document.category from text -> public."DocumentCategory" if still text,
-- or validate/backfill if already public."DocumentCategory".
DO $$
DECLARE
  col_udt_schema TEXT;
  col_udt TEXT;
  unknown_cats TEXT;
BEGIN
  SELECT udt_schema, udt_name INTO col_udt_schema, col_udt
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'Document'
    AND column_name = 'category';

  IF col_udt_schema = 'pg_catalog' AND col_udt IN ('text', 'varchar', 'bpchar') THEN
    SELECT string_agg(DISTINCT "category", ', ') INTO unknown_cats
    FROM public."Document"
    WHERE "category" IS NOT NULL
      AND UPPER(BTRIM("category")) NOT IN (
        'IDENTITY', 'ACADEMIC', 'ENGLISH_TEST', 'FINANCE', 'VISA', 'OTHER'
      );

    IF unknown_cats IS NOT NULL THEN
      RAISE EXCEPTION 'Aborted: public."Document".category contains unknown non-NULL value(s): %', unknown_cats;
    END IF;

    ALTER TABLE public."Document" ALTER COLUMN "category" DROP DEFAULT;
    ALTER TABLE public."Document"
      ALTER COLUMN "category" TYPE public."DocumentCategory"
      USING (
        CASE
          WHEN "category" IS NULL THEN 'OTHER'::public."DocumentCategory"
          ELSE UPPER(BTRIM("category"))::public."DocumentCategory"
        END
      );
  ELSIF col_udt_schema <> 'public' OR col_udt <> 'DocumentCategory' THEN
    RAISE EXCEPTION 'Precondition failed: public."Document".category has unexpected type "%.%".', col_udt_schema, col_udt;
  END IF;

  UPDATE public."Document" SET "category" = 'OTHER'::public."DocumentCategory" WHERE "category" IS NULL;
  ALTER TABLE public."Document"
    ALTER COLUMN "category" SET DEFAULT 'OTHER'::public."DocumentCategory",
    ALTER COLUMN "category" SET NOT NULL;
END $$;

ALTER TABLE public."Document"
  ALTER COLUMN "status" SET DEFAULT 'UPLOADED'::public."DocumentStatus";

-- ─── 3. RECONCILE public."DocumentVersion" ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public."DocumentVersion" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "originalName" TEXT,
  "mimeType" TEXT,
  "fileSize" INTEGER,
  "uploadedById" TEXT,
  "status" public."DocumentStatus" NOT NULL DEFAULT 'UPLOADED'::public."DocumentStatus",
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE public."DocumentVersion"
  ADD COLUMN IF NOT EXISTS "originalName" TEXT,
  ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "fileSize" INTEGER,
  ADD COLUMN IF NOT EXISTS "uploadedById" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'uploaded';

DO $$
DECLARE
  col_udt_schema TEXT;
  col_udt TEXT;
  unknown_statuses TEXT;
BEGIN
  SELECT udt_schema, udt_name INTO col_udt_schema, col_udt
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'DocumentVersion'
    AND column_name = 'status';

  IF col_udt_schema = 'pg_catalog' AND col_udt IN ('text', 'varchar', 'bpchar') THEN
    SELECT string_agg(DISTINCT "status", ', ') INTO unknown_statuses
    FROM public."DocumentVersion"
    WHERE "status" IS NOT NULL
      AND UPPER(BTRIM("status")) NOT IN (
        'UPLOADED', 'PENDING_STUDENT_REVIEW', 'CHANGES_REQUESTED', 'RE_UPLOADED',
        'VERIFIED', 'REJECTED', 'EXPIRED', 'PENDING'
      );

    IF unknown_statuses IS NOT NULL THEN
      RAISE EXCEPTION 'Aborted: public."DocumentVersion".status contains unknown non-NULL value(s): %', unknown_statuses;
    END IF;

    ALTER TABLE public."DocumentVersion" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE public."DocumentVersion"
      ALTER COLUMN "status" TYPE public."DocumentStatus"
      USING (
        CASE
          WHEN "status" IS NULL THEN 'UPLOADED'::public."DocumentStatus"
          ELSE UPPER(BTRIM("status"))::public."DocumentStatus"
        END
      );
  ELSIF col_udt_schema <> 'public' OR col_udt <> 'DocumentStatus' THEN
    RAISE EXCEPTION 'Precondition failed: public."DocumentVersion".status has unexpected type "%.%".', col_udt_schema, col_udt;
  END IF;

  UPDATE public."DocumentVersion" SET "status" = 'UPLOADED'::public."DocumentStatus" WHERE "status" IS NULL;
  ALTER TABLE public."DocumentVersion"
    ALTER COLUMN "status" SET DEFAULT 'UPLOADED'::public."DocumentStatus",
    ALTER COLUMN "status" SET NOT NULL;
END $$;

-- Verify existing index definition or create DocumentVersion_documentId_idx
DO $$
DECLARE
  idx_exists BOOLEAN;
  idx_matches BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'i' AND c.relname = 'DocumentVersion_documentId_idx'
  ) INTO idx_exists;

  IF idx_exists THEN
    SELECT EXISTS (
      SELECT 1
      FROM pg_index ix
      JOIN pg_class idx ON idx.oid = ix.indexrelid
      JOIN pg_namespace idx_ns ON idx_ns.oid = idx.relnamespace
      JOIN pg_am am ON am.oid = idx.relam
      JOIN pg_class tbl ON tbl.oid = ix.indrelid
      JOIN pg_namespace tbl_ns ON tbl_ns.oid = tbl.relnamespace
      JOIN pg_attribute a ON a.attrelid = tbl.oid AND a.attnum = ix.indkey[0]
      WHERE idx_ns.nspname = 'public'
        AND idx.relname = 'DocumentVersion_documentId_idx'
        AND tbl_ns.nspname = 'public'
        AND tbl.relname = 'DocumentVersion'
        AND ix.indisvalid = TRUE
        AND ix.indisready = TRUE
        AND ix.indisunique = FALSE
        AND ix.indpred IS NULL
        AND ix.indexprs IS NULL
        AND am.amname = 'btree'
        AND ix.indnkeyatts = 1
        AND ix.indnatts = 1
        AND a.attname = 'documentId'
    ) INTO idx_matches;

    IF NOT idx_matches THEN
      RAISE EXCEPTION 'Aborted: existing index public."DocumentVersion_documentId_idx" does not index (documentId) on public."DocumentVersion".';
    END IF;
  ELSE
    CREATE INDEX "DocumentVersion_documentId_idx"
      ON public."DocumentVersion"("documentId");
  END IF;
END $$;

-- ─── 4. ORPHAN PRE-CHECKS & DEFINITION-VERIFIED FOREIGN KEYS ─────────────────
DO $$
DECLARE
  orphan_count INTEGER;
  fk_matches BOOLEAN;
  fk_exists BOOLEAN;
BEGIN
  -- 4a. Document_reviewedById_fkey -> User(id) ON DELETE SET NULL ON UPDATE CASCADE
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE n.nspname = 'public' AND t.relname = 'Document' AND c.conname = 'Document_reviewedById_fkey'
  ) INTO fk_exists;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_class rt ON rt.oid = c.confrelid
    JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = c.conkey[1]
    JOIN pg_attribute ra ON ra.attrelid = rt.oid AND ra.attnum = c.confkey[1]
    WHERE n.nspname = 'public' AND t.relname = 'Document'
      AND c.contype = 'f' AND c.conname = 'Document_reviewedById_fkey'
      AND array_length(c.conkey, 1) = 1 AND a.attname = 'reviewedById'
      AND rn.nspname = 'public' AND rt.relname = 'User' AND ra.attname = 'id'
      AND c.confdeltype = 'n' AND c.confupdtype = 'c'
      AND c.convalidated = TRUE
  ) INTO fk_matches;

  IF NOT fk_matches THEN
    IF fk_exists THEN
      ALTER TABLE public."Document" DROP CONSTRAINT "Document_reviewedById_fkey";
    END IF;
    SELECT COUNT(*) INTO orphan_count
    FROM public."Document" d
    WHERE d."reviewedById" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public."User" u WHERE u.id = d."reviewedById");
    IF orphan_count > 0 THEN
      RAISE EXCEPTION 'Aborted: % orphaned Document.reviewedById row(s) found.', orphan_count;
    END IF;
    ALTER TABLE public."Document"
      ADD CONSTRAINT "Document_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  -- 4b. DocumentVersion_documentId_fkey -> Document(id) ON DELETE CASCADE ON UPDATE CASCADE
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE n.nspname = 'public' AND t.relname = 'DocumentVersion' AND c.conname = 'DocumentVersion_documentId_fkey'
  ) INTO fk_exists;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_class rt ON rt.oid = c.confrelid
    JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = c.conkey[1]
    JOIN pg_attribute ra ON ra.attrelid = rt.oid AND ra.attnum = c.confkey[1]
    WHERE n.nspname = 'public' AND t.relname = 'DocumentVersion'
      AND c.contype = 'f' AND c.conname = 'DocumentVersion_documentId_fkey'
      AND array_length(c.conkey, 1) = 1 AND a.attname = 'documentId'
      AND rn.nspname = 'public' AND rt.relname = 'Document' AND ra.attname = 'id'
      AND c.confdeltype = 'c' AND c.confupdtype = 'c'
      AND c.convalidated = TRUE
  ) INTO fk_matches;

  IF NOT fk_matches THEN
    IF fk_exists THEN
      ALTER TABLE public."DocumentVersion" DROP CONSTRAINT "DocumentVersion_documentId_fkey";
    END IF;
    SELECT COUNT(*) INTO orphan_count
    FROM public."DocumentVersion" dv
    WHERE NOT EXISTS (SELECT 1 FROM public."Document" d WHERE d.id = dv."documentId");
    IF orphan_count > 0 THEN
      RAISE EXCEPTION 'Aborted: % orphaned DocumentVersion.documentId row(s) found.', orphan_count;
    END IF;
    ALTER TABLE public."DocumentVersion"
      ADD CONSTRAINT "DocumentVersion_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES public."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- 4c. DocumentVersion_uploadedById_fkey -> User(id) ON DELETE SET NULL ON UPDATE CASCADE
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE n.nspname = 'public' AND t.relname = 'DocumentVersion' AND c.conname = 'DocumentVersion_uploadedById_fkey'
  ) INTO fk_exists;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_class rt ON rt.oid = c.confrelid
    JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = c.conkey[1]
    JOIN pg_attribute ra ON ra.attrelid = rt.oid AND ra.attnum = c.confkey[1]
    WHERE n.nspname = 'public' AND t.relname = 'DocumentVersion'
      AND c.contype = 'f' AND c.conname = 'DocumentVersion_uploadedById_fkey'
      AND array_length(c.conkey, 1) = 1 AND a.attname = 'uploadedById'
      AND rn.nspname = 'public' AND rt.relname = 'User' AND ra.attname = 'id'
      AND c.confdeltype = 'n' AND c.confupdtype = 'c'
      AND c.convalidated = TRUE
  ) INTO fk_matches;

  IF NOT fk_matches THEN
    IF fk_exists THEN
      ALTER TABLE public."DocumentVersion" DROP CONSTRAINT "DocumentVersion_uploadedById_fkey";
    END IF;
    SELECT COUNT(*) INTO orphan_count
    FROM public."DocumentVersion" dv
    WHERE dv."uploadedById" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public."User" u WHERE u.id = dv."uploadedById");
    IF orphan_count > 0 THEN
      RAISE EXCEPTION 'Aborted: % orphaned DocumentVersion.uploadedById row(s) found.', orphan_count;
    END IF;
    ALTER TABLE public."DocumentVersion"
      ADD CONSTRAINT "DocumentVersion_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── 5. POST-CONDITION VERIFICATION ──────────────────────────────────────────
DO $$
DECLARE
  v_udt_schema TEXT;
  v_udt TEXT;
  v_null TEXT;
  v_def TEXT;
BEGIN
  SELECT udt_schema, udt_name, is_nullable, column_default
  INTO v_udt_schema, v_udt, v_null, v_def
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'Document' AND column_name = 'category';
  IF v_udt_schema <> 'public' OR v_udt <> 'DocumentCategory' OR v_null <> 'NO' OR COALESCE(v_def, '') NOT LIKE '%OTHER%' THEN
    RAISE EXCEPTION 'Post-condition failed for Document.category (type=%.%, nullable=%, default=%).', v_udt_schema, v_udt, v_null, v_def;
  END IF;

  SELECT udt_schema, udt_name, is_nullable, column_default
  INTO v_udt_schema, v_udt, v_null, v_def
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'Document' AND column_name = 'status';
  IF v_udt_schema <> 'public' OR v_udt <> 'DocumentStatus' OR v_null <> 'NO' OR COALESCE(v_def, '') NOT LIKE '%UPLOADED%' THEN
    RAISE EXCEPTION 'Post-condition failed for Document.status (type=%.%, nullable=%, default=%).', v_udt_schema, v_udt, v_null, v_def;
  END IF;

  SELECT udt_schema, udt_name, is_nullable, column_default
  INTO v_udt_schema, v_udt, v_null, v_def
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'Document' AND column_name = 'currentVersion';
  IF v_udt_schema <> 'pg_catalog' OR v_udt <> 'int4' OR v_null <> 'NO' OR COALESCE(v_def, '') <> '1' THEN
    RAISE EXCEPTION 'Post-condition failed for Document.currentVersion (type=%.%, nullable=%, default=%).', v_udt_schema, v_udt, v_null, v_def;
  END IF;

  SELECT udt_schema, udt_name, is_nullable, column_default
  INTO v_udt_schema, v_udt, v_null, v_def
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'DocumentVersion' AND column_name = 'status';
  IF v_udt_schema <> 'public' OR v_udt <> 'DocumentStatus' OR v_null <> 'NO' OR COALESCE(v_def, '') NOT LIKE '%UPLOADED%' THEN
    RAISE EXCEPTION 'Post-condition failed for DocumentVersion.status (type=%.%, nullable=%, default=%).', v_udt_schema, v_udt, v_null, v_def;
  END IF;
END $$;

COMMIT;
