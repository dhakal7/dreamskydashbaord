-- DreamSky CRM: Phase 28.25C - Safe Source-Only Migration Artifact (Prepared, NOT Applied)
-- Objective: Add dedicated "AppointmentReminder" table for persistent appointment reminder offsets and poller scheduling
-- Mandatory Safety: Do NOT apply to database during Phase 28.25C. No migrations or database connections allowed.

-- Step 1: Create AppointmentReminder table if not exists
CREATE TABLE IF NOT EXISTS "AppointmentReminder" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "offset" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentReminder_pkey" PRIMARY KEY ("id")
);

-- Step 1b: Reconcile pre-existing AppointmentReminder schema shapes safely without data loss
DO $$
DECLARE
    has_scheduled_for BOOLEAN;
    has_remind_at BOOLEAN;
    id_udt TEXT;
    id_nullable TEXT;
    appointment_id_udt TEXT;
    appointment_id_nullable TEXT;
    scheduled_for_udt TEXT;
    scheduled_for_nullable TEXT;
    offset_udt TEXT;
    offset_nullable TEXT;
    status_udt TEXT;
    status_nullable TEXT;
    sent_at_udt TEXT;
    created_at_udt TEXT;
    created_at_nullable TEXT;
    updated_at_udt TEXT;
    updated_at_nullable TEXT;
    has_pkey BOOLEAN;
    invalid_status_count BIGINT;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'AppointmentReminder'
          AND column_name = 'scheduledFor'
    ) INTO has_scheduled_for;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'AppointmentReminder'
          AND column_name = 'remindAt'
    ) INTO has_remind_at;

    IF has_remind_at AND has_scheduled_for THEN
        RAISE EXCEPTION 'Migration 20261024_add_appointment_reminder blocked: "AppointmentReminder" contains both "remindAt" and "scheduledFor" columns. Reconcile duplicate timestamp columns before running this migration.';
    ELSIF has_remind_at AND NOT has_scheduled_for THEN
        ALTER TABLE "AppointmentReminder" RENAME COLUMN "remindAt" TO "scheduledFor";
    ELSIF NOT has_scheduled_for AND NOT has_remind_at THEN
        RAISE EXCEPTION 'Migration 20261024_add_appointment_reminder blocked: "AppointmentReminder" exists without "scheduledFor" or "remindAt" column.';
    END IF;

    ALTER TABLE "AppointmentReminder"
        ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

    SELECT udt_name, is_nullable INTO id_udt, id_nullable
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'AppointmentReminder'
      AND column_name = 'id';

    IF id_udt IS NULL OR id_udt NOT IN ('text', 'varchar', 'bpchar') OR id_nullable <> 'NO' THEN
        RAISE EXCEPTION 'Migration 20261024_add_appointment_reminder blocked: "AppointmentReminder"."id" has incompatible type "%" or nullability "%" (expected NOT NULL TEXT).', COALESCE(id_udt, 'MISSING'), COALESCE(id_nullable, 'MISSING');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = '"AppointmentReminder"'::regclass
          AND contype = 'p'
    ) INTO has_pkey;

    IF NOT has_pkey THEN
        RAISE EXCEPTION 'Migration 20261024_add_appointment_reminder blocked: "AppointmentReminder" is missing a primary key constraint on "id".';
    END IF;

    SELECT udt_name, is_nullable INTO appointment_id_udt, appointment_id_nullable
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'AppointmentReminder'
      AND column_name = 'appointmentId';

    IF appointment_id_udt IS NULL OR appointment_id_udt NOT IN ('text', 'varchar', 'bpchar') OR appointment_id_nullable <> 'NO' THEN
        RAISE EXCEPTION 'Migration 20261024_add_appointment_reminder blocked: "AppointmentReminder"."appointmentId" has incompatible type "%" or nullability "%" (expected NOT NULL TEXT).', COALESCE(appointment_id_udt, 'MISSING'), COALESCE(appointment_id_nullable, 'MISSING');
    END IF;

    SELECT udt_name, is_nullable INTO scheduled_for_udt, scheduled_for_nullable
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'AppointmentReminder'
      AND column_name = 'scheduledFor';

    IF scheduled_for_udt IS NULL OR scheduled_for_udt NOT IN ('timestamp', 'timestamptz') OR scheduled_for_nullable <> 'NO' THEN
        RAISE EXCEPTION 'Migration 20261024_add_appointment_reminder blocked: "AppointmentReminder"."scheduledFor" has incompatible type "%" or nullability "%" (expected NOT NULL TIMESTAMP).', COALESCE(scheduled_for_udt, 'MISSING'), COALESCE(scheduled_for_nullable, 'MISSING');
    END IF;

    SELECT udt_name, is_nullable INTO offset_udt, offset_nullable
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'AppointmentReminder'
      AND column_name = 'offset';

    IF offset_udt IS NULL OR offset_udt NOT IN ('text', 'varchar', 'bpchar') OR offset_nullable <> 'NO' THEN
        RAISE EXCEPTION 'Migration 20261024_add_appointment_reminder blocked: "AppointmentReminder"."offset" has incompatible type "%" or nullability "%" (expected NOT NULL TEXT for "24H"/"1H" offsets). Do not blindly cast; inspect database state first.', COALESCE(offset_udt, 'MISSING'), COALESCE(offset_nullable, 'MISSING');
    END IF;

    SELECT udt_name, is_nullable INTO status_udt, status_nullable
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'AppointmentReminder'
      AND column_name = 'status';

    IF status_udt IS NULL OR status_udt NOT IN ('text', 'varchar', 'bpchar') OR status_nullable <> 'NO' THEN
        RAISE EXCEPTION 'Migration 20261024_add_appointment_reminder blocked: "AppointmentReminder"."status" has incompatible type "%" or nullability "%" (expected NOT NULL TEXT for PENDING/SENT/FAILED statuses). Do not blindly cast; inspect database state first.', COALESCE(status_udt, 'MISSING'), COALESCE(status_nullable, 'MISSING');
    END IF;

    SELECT udt_name INTO sent_at_udt
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'AppointmentReminder'
      AND column_name = 'sentAt';

    IF sent_at_udt IS NULL OR sent_at_udt NOT IN ('timestamp', 'timestamptz') THEN
        RAISE EXCEPTION 'Migration 20261024_add_appointment_reminder blocked: "AppointmentReminder"."sentAt" has incompatible type "%" (expected nullable TIMESTAMP).', COALESCE(sent_at_udt, 'MISSING');
    END IF;

    SELECT udt_name, is_nullable INTO created_at_udt, created_at_nullable
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'AppointmentReminder'
      AND column_name = 'createdAt';

    IF created_at_udt IS NULL OR created_at_udt NOT IN ('timestamp', 'timestamptz') OR created_at_nullable <> 'NO' THEN
        RAISE EXCEPTION 'Migration 20261024_add_appointment_reminder blocked: "AppointmentReminder"."createdAt" has incompatible type "%" or nullability "%" (expected NOT NULL TIMESTAMP).', COALESCE(created_at_udt, 'MISSING'), COALESCE(created_at_nullable, 'MISSING');
    END IF;

    SELECT udt_name, is_nullable INTO updated_at_udt, updated_at_nullable
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'AppointmentReminder'
      AND column_name = 'updatedAt';

    IF updated_at_udt IS NULL OR updated_at_udt NOT IN ('timestamp', 'timestamptz') OR updated_at_nullable <> 'NO' THEN
        RAISE EXCEPTION 'Migration 20261024_add_appointment_reminder blocked: "AppointmentReminder"."updatedAt" has incompatible type "%" or nullability "%" (expected NOT NULL TIMESTAMP).', COALESCE(updated_at_udt, 'MISSING'), COALESCE(updated_at_nullable, 'MISSING');
    END IF;

    EXECUTE 'SELECT COUNT(*) FROM "AppointmentReminder" WHERE "status" IS NULL OR "status" NOT IN (''PENDING'', ''SENT'', ''FAILED'')'
        INTO invalid_status_count;

    IF invalid_status_count > 0 THEN
        RAISE EXCEPTION 'Migration 20261024_add_appointment_reminder blocked: % existing row(s) in "AppointmentReminder" have status outside (PENDING, SENT, FAILED).', invalid_status_count;
    END IF;
END $$;

-- Step 2: Safe foreign key reference to Appointment table with cascading delete
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'AppointmentReminder_appointmentId_fkey'
          AND conrelid = '"AppointmentReminder"'::regclass
    ) THEN
        ALTER TABLE "AppointmentReminder" ADD CONSTRAINT "AppointmentReminder_appointmentId_fkey"
        FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Step 3: Indexes for background poller and relationship lookups
CREATE INDEX IF NOT EXISTS "AppointmentReminder_status_scheduledFor_idx" ON "AppointmentReminder"("status", "scheduledFor");
CREATE INDEX IF NOT EXISTS "AppointmentReminder_appointmentId_idx" ON "AppointmentReminder"("appointmentId");

-- Step 4: Optional status validation check
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'AppointmentReminder_status_check'
          AND conrelid = '"AppointmentReminder"'::regclass
    ) THEN
        ALTER TABLE "AppointmentReminder" ADD CONSTRAINT "AppointmentReminder_status_check"
        CHECK ("status" IN ('PENDING', 'SENT', 'FAILED'));
    END IF;
END $$;

COMMENT ON TABLE "AppointmentReminder" IS 'Durable appointment reminder queue for time-based notification dispatch';
COMMENT ON COLUMN "AppointmentReminder"."offset" IS 'Reminder interval offset prior to appointment datetime (e.g. 24H, 1H)';
COMMENT ON COLUMN "AppointmentReminder"."scheduledFor" IS 'Calculated timestamp when the reminder becomes eligible for dispatch';
