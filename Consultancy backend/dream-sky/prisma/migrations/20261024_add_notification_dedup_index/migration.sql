-- DreamSky CRM: Phase 28.25C.4 - Safe Source-Only Migration Artifact (Prepared, NOT Applied)
-- Objective: Establish database-enforced concurrency deduplication for follow-up staff notifications
-- Deduplication Key: (recipientUserId, appointmentId, COALESCE(action, ''), COALESCE(newDatetime, datetime, appointmentDatetime, ''))
-- Qualifying Predicate: ("payload" IS NOT NULL AND ("payload"->>'appointmentId') IS NOT NULL AND COALESCE("payload"->>'action', '') IN ('SCHEDULED', 'RESCHEDULED', 'CANCELLED'))
-- Mandatory Safety: Do NOT apply to database during static remediation phases. No migrations or database connections allowed.

-- ============================================================================
-- Step 1: Consolidate delivery status, read state, and timestamps into survivor (row_num = 1)
--
-- Deterministic Merge Policy:
-- 1. Identity & Timestamps: Retains the earliest created notification (MIN(createdAt), MIN(id))
--    as the canonical historical record.
-- 2. Read State Preservation: If ANY duplicate in the group was marked read (payload->>'read' = 'true'
--    or payload->>'readAt' IS NOT NULL), the survivor's payload is updated to read = true, preserving
--    the latest readAt timestamp. This prevents marking duplicate alerts from reverting read state.
-- 3. Delivery Status: If ANY duplicate progressed to 'SENT' and survivor is 'QUEUED', survivor status
--    is upgraded to 'SENT' and sentAt is preserved from the latest delivered duplicate.
-- 4. Scope & Predicate: Strictly scoped to follow-up lifecycle notifications where
--    ("payload" IS NOT NULL AND ("payload"->>'appointmentId') IS NOT NULL AND COALESCE("payload"->>'action', '') IN ('SCHEDULED', 'RESCHEDULED', 'CANCELLED')).
--    Ordinary notifications carrying an appointmentId without a qualifying follow-up action are never deduplicated.
-- ============================================================================
WITH duplicate_partitions AS (
    SELECT
        "id",
        "recipientUserId",
        ("payload"->>'appointmentId') AS appt_id,
        COALESCE(("payload"->>'action'), '') AS act,
        COALESCE(("payload"->>'newDatetime'), ("payload"->>'datetime'), ("payload"->>'appointmentDatetime'), '') AS new_dt,
        "status",
        "sentAt",
        "payload",
        ROW_NUMBER() OVER (
            PARTITION BY
                "recipientUserId",
                ("payload"->>'appointmentId'),
                COALESCE(("payload"->>'action'), ''),
                COALESCE(("payload"->>'newDatetime'), ("payload"->>'datetime'), ("payload"->>'appointmentDatetime'), '')
            ORDER BY "createdAt" ASC, "id" ASC
        ) as row_num,
        COUNT(*) OVER (
            PARTITION BY
                "recipientUserId",
                ("payload"->>'appointmentId'),
                COALESCE(("payload"->>'action'), ''),
                COALESCE(("payload"->>'newDatetime'), ("payload"->>'datetime'), ("payload"->>'appointmentDatetime'), '')
        ) as partition_count,
        -- Detect if any record in the duplicate group was read (safe boolean parsing without throwing on malformed strings)
        BOOL_OR(
            (CASE WHEN lower(COALESCE("payload"->>'read', '')) = 'true' THEN true ELSE false END)
            OR ("payload"->>'readAt') IS NOT NULL
        ) OVER (
            PARTITION BY
                "recipientUserId",
                ("payload"->>'appointmentId'),
                COALESCE(("payload"->>'action'), ''),
                COALESCE(("payload"->>'newDatetime'), ("payload"->>'datetime'), ("payload"->>'appointmentDatetime'), '')
        ) as group_any_read,
        -- Capture the latest read timestamp across duplicates
        MAX("payload"->>'readAt') OVER (
            PARTITION BY
                "recipientUserId",
                ("payload"->>'appointmentId'),
                COALESCE(("payload"->>'action'), ''),
                COALESCE(("payload"->>'newDatetime'), ("payload"->>'datetime'), ("payload"->>'appointmentDatetime'), '')
        ) as group_latest_read_at,
        -- Detect if any record in the duplicate group was sent
        BOOL_OR("status" = 'SENT') OVER (
            PARTITION BY
                "recipientUserId",
                ("payload"->>'appointmentId'),
                COALESCE(("payload"->>'action'), ''),
                COALESCE(("payload"->>'newDatetime'), ("payload"->>'datetime'), ("payload"->>'appointmentDatetime'), '')
        ) as group_any_sent,
        -- Capture the latest sent timestamp across duplicates
        MAX("sentAt") OVER (
            PARTITION BY
                "recipientUserId",
                ("payload"->>'appointmentId'),
                COALESCE(("payload"->>'action'), ''),
                COALESCE(("payload"->>'newDatetime'), ("payload"->>'datetime'), ("payload"->>'appointmentDatetime'), '')
        ) as group_latest_sent_at
    FROM "Notification"
    WHERE "payload" IS NOT NULL
      AND ("payload"->>'appointmentId') IS NOT NULL
      AND COALESCE("payload"->>'action', '') IN ('SCHEDULED', 'RESCHEDULED', 'CANCELLED')
),
survivors_needing_update AS (
    SELECT
        dp."id",
        dp.group_any_read,
        dp.group_latest_read_at,
        dp.group_any_sent,
        dp.group_latest_sent_at
    FROM duplicate_partitions dp
    WHERE dp.row_num = 1
      AND dp.partition_count > 1
      AND (
          (dp.group_any_read = true AND (CASE WHEN lower(COALESCE(dp."payload"->>'read', '')) = 'true' THEN true ELSE false END) = false)
          OR (dp.group_any_sent = true AND dp."status" = 'QUEUED')
      )
)
UPDATE "Notification" n
SET
    "status" = CASE
        WHEN snu.group_any_sent = true AND n."status" = 'QUEUED' THEN 'SENT'::"NotificationStatus"
        ELSE n."status"
    END,
    "sentAt" = COALESCE(n."sentAt", snu.group_latest_sent_at),
    "payload" = (
        CASE
            WHEN snu.group_any_read = true THEN
                jsonb_set(
                    jsonb_set(n."payload", '{read}', 'true'::jsonb, true),
                    '{readAt}',
                    to_jsonb(COALESCE(n."payload"->>'readAt', snu.group_latest_read_at, CURRENT_TIMESTAMP::text)),
                    true
                )
            ELSE n."payload"
        END
    ),
    "updatedAt" = CURRENT_TIMESTAMP
FROM survivors_needing_update snu
WHERE n."id" = snu."id";

-- ============================================================================
-- Step 1b: Archive redundant duplicate rows into NotificationDedupArchive before deletion
-- Exact columns of model Notification:
-- ("id", "channel", "templateId", "recipientUserId", "subject", "body", "status", "payload", "sentAt", "createdAt", "updatedAt")
-- ============================================================================
CREATE TABLE IF NOT EXISTS "NotificationDedupArchive" (
    LIKE "Notification" INCLUDING DEFAULTS,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDedupArchive_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'NotificationDedupArchive_pkey'
          AND conrelid = '"NotificationDedupArchive"'::regclass
    ) THEN
        ALTER TABLE "NotificationDedupArchive"
        ADD CONSTRAINT "NotificationDedupArchive_pkey" PRIMARY KEY ("id");
    END IF;
END $$;

INSERT INTO "NotificationDedupArchive" (
    "id",
    "channel",
    "templateId",
    "recipientUserId",
    "subject",
    "body",
    "status",
    "payload",
    "sentAt",
    "createdAt",
    "updatedAt",
    "archivedAt"
)
SELECT
    n."id",
    n."channel",
    n."templateId",
    n."recipientUserId",
    n."subject",
    n."body",
    n."status",
    n."payload",
    n."sentAt",
    n."createdAt",
    n."updatedAt",
    CURRENT_TIMESTAMP
FROM "Notification" n
WHERE n."id" IN (
    SELECT "id"
    FROM (
        SELECT
            "id",
            ROW_NUMBER() OVER (
                PARTITION BY
                    "recipientUserId",
                    ("payload"->>'appointmentId'),
                    COALESCE(("payload"->>'action'), ''),
                    COALESCE(("payload"->>'newDatetime'), ("payload"->>'datetime'), ("payload"->>'appointmentDatetime'), '')
                ORDER BY "createdAt" ASC, "id" ASC
            ) as row_num
        FROM "Notification"
        WHERE "payload" IS NOT NULL
          AND ("payload"->>'appointmentId') IS NOT NULL
          AND COALESCE("payload"->>'action', '') IN ('SCHEDULED', 'RESCHEDULED', 'CANCELLED')
    ) duplicates
    WHERE duplicates.row_num > 1
)
ON CONFLICT ("id") DO NOTHING;

-- ============================================================================
-- Step 2: Delete redundant duplicate rows (retaining row_num = 1)
-- ============================================================================
DELETE FROM "Notification"
WHERE "id" IN (
    SELECT "id"
    FROM (
        SELECT
            "id",
            ROW_NUMBER() OVER (
                PARTITION BY
                    "recipientUserId",
                    ("payload"->>'appointmentId'),
                    COALESCE(("payload"->>'action'), ''),
                    COALESCE(("payload"->>'newDatetime'), ("payload"->>'datetime'), ("payload"->>'appointmentDatetime'), '')
                ORDER BY "createdAt" ASC, "id" ASC
            ) as row_num
        FROM "Notification"
        WHERE "payload" IS NOT NULL
          AND ("payload"->>'appointmentId') IS NOT NULL
          AND COALESCE("payload"->>'action', '') IN ('SCHEDULED', 'RESCHEDULED', 'CANCELLED')
    ) duplicates
    WHERE duplicates.row_num > 1
);

-- ============================================================================
-- Step 3: Enforce concurrency uniqueness via partial unique index
-- Key matches the cleanup partition: (recipientUserId, appointmentId, COALESCE(action, ''), COALESCE(newDatetime, datetime, appointmentDatetime, ''))
-- Predicate matches the cleanup WHERE: ("payload" IS NOT NULL AND ("payload"->>'appointmentId') IS NOT NULL AND COALESCE("payload"->>'action', '') IN ('SCHEDULED', 'RESCHEDULED', 'CANCELLED'))
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_dedup_followup_uidx"
ON "Notification" (
    "recipientUserId",
    ("payload"->>'appointmentId'),
    COALESCE(("payload"->>'action'), ''),
    COALESCE(("payload"->>'newDatetime'), ("payload"->>'datetime'), ("payload"->>'appointmentDatetime'), '')
)
WHERE (
    "payload" IS NOT NULL
    AND ("payload"->>'appointmentId') IS NOT NULL
    AND COALESCE("payload"->>'action', '') IN ('SCHEDULED', 'RESCHEDULED', 'CANCELLED')
);

COMMENT ON INDEX "Notification_dedup_followup_uidx" IS
'Guarantees at-most-once follow-up notification dispatch per staff member per appointment action (SCHEDULED, RESCHEDULED, CANCELLED) and reschedule target';
