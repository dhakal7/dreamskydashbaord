# Backend Merge Phase Prompts — Copy-Paste Into Claude Code

Goal: collapse `eplanetbackend` (Track B, TypeScript, own DB) and
`dream-sky` (Track A, JavaScript, own DB) into **one backend, one schema,
one database** — `dream-sky` as the base, since it already owns the
student pipeline and already has stub models waiting for Track B's logic.

Run these **in a Claude Code session opened at the repo root that contains
both `eplanetbackend/` and `Consultancy backend/dream-sky/`** (or point it
at wherever you've placed them side by side). Paste Prompt M0 once at the
start. Then run M1–M8 in order — each is one focused session. Do not skip
the git-safety steps; this phase touches a schema with real migrations
already applied.

---

## Prompt M0 — Master Context (paste first, every session)

```
You are merging two backends of an Education Consultancy ERP + CRM system
into one. Read both trees before changing anything:

  - "Consultancy backend/dream-sky/"  → TARGET. Plain JavaScript, Express
    5, Prisma, Postgres. Owns: auth (real JWT), Student, PipelineStageHistory,
    TestScore, Document, CommunicationLog, Appointment, Payment,
    Transaction, Application, Offer, VisaCase, RefreshToken. Also has
    STUB models with no service/controller/route code yet: Branch, User,
    CounselorProfile, TeacherProfile, ReferralAgentProfile, CommissionRule,
    Commission, Class, Enrollment, AttendanceRecord, ClassContent, Event,
    EventReminder, Notification, NotificationTemplate, AuditLog.

  - "eplanetbackend/" → SOURCE OF LOGIC ONLY, being retired as a server.
    TypeScript, Express 5, Prisma, its own DB. Has a more complete version
    of the stub models above (real enums, extra fields) plus entirely new
    models dream-sky lacks: Country, University, Course, RecommendationResult,
    PublicInquiry. Auth here is a MOCK (x-mock-user header) — never port
    this, dream-sky's real auth replaces it everywhere.

END STATE: dream-sky is the only backend that runs. eplanetbackend's
Express app is deleted once its logic has been moved. One Prisma schema,
one migration history, one Postgres database (dream-sky's).

STRICT RULES — do not violate these:
1. Never modify the following dream-sky models' EXISTING fields: User,
   Student, PipelineStageHistory, TestScore, Document, CommunicationLog,
   Appointment, Payment, Transaction, Application, Offer, VisaCase,
   RefreshToken, Branch's existing fields. You may ADD new fields to these
   only if a phase prompt below explicitly says to.
2. Never touch dream-sky's src/services/auth.service.js, student.service.js,
   followup.service.js, appointment.service.js, document.service.js,
   application.service.js, visa.service.js, portal.service.js, or any file
   under src/utils/ — these are Track A's contract-bearing files.
3. Every ported file must be converted from TypeScript to plain JavaScript
   (CommonJS, `require`/`module.exports`) to match dream-sky's existing
   code — do not introduce a TS build step into dream-sky.
4. Every ported route must use dream-sky's existing response helpers
   (`sendSuccess`, `sendCreated` from src/utils/response.util.js and
   `AppError` from src/utils/apiError.js) — NOT eplanetbackend's
   successResponse/errorResponse shape. Note the shapes differ:
   dream-sky: { success, message, data } / { success: false, code, message }
   eplanetbackend: { success, data } / { success: false, error: {code, message} }
   dream-sky's shape wins everywhere.
5. Every ported route must use dream-sky's real `requireAuth`/`requireRole`
   middleware (src/middlewares/auth.middleware.js,
   src/middlewares/rbac.middleware.js) — delete any reference to
   eplanetbackend's mock auth entirely, don't leave it commented out.
6. Work on a new git branch in the dream-sky repo: `git checkout -b
   backend-merge`. Commit after each phase prompt completes successfully.
7. After any schema change, run `npx prisma validate`, then
   `npx prisma migrate dev --name <describe-it>`, then `npx prisma generate`,
   and confirm the dev server still starts before moving to the next phase.
8. If a step seems to require breaking rule 1 or 2, stop and tell me
   instead of doing it.

Confirm you've read both directory trees and understand these rules before
starting Phase M1.
```

---

## Prompt M1 — Schema Reconciliation

```
Phase M1: Merge the two Prisma schemas into dream-sky/prisma/schema.prisma.
Do NOT run a migration yet — this phase is schema-file editing only.

Work model-by-model. For each, the decision is already made:

KEEP DREAM-SKY'S VERSION UNCHANGED (do not touch):
  User, Student, PipelineStageHistory, TestScore, Document,
  CommunicationLog, Appointment, Payment, Transaction, Application, Offer,
  VisaCase, RefreshToken, CounselorProfile, TeacherProfile,
  ReferralAgentProfile (the latter three are already identical between
  both schemas — verify this yourself before skipping).

MERGE (combine fields from both, dream-sky's relations stay authoritative):
  Branch — add eplanetbackend's `email` field and widen `address` to match
  (eplanetbackend has it required, dream-sky optional — keep it optional).
  Keep dream-sky's `isActive`.

REPLACE dream-sky's version with eplanetbackend's version, adjusting only
what's needed to keep dream-sky's existing relations working:
  CommissionRule, Commission, Class, Event, EventReminder, Notification,
  NotificationTemplate, AuditLog, Enrollment, AttendanceRecord,
  ClassContent.

  Specific renames required when you do this (so relations still point at
  dream-sky's real User/Branch/Student/University tables instead of the
  plain-string IDs eplanetbackend used as placeholders for an unknown
  Track A):
    - Commission.recipientUserId → recipientId, and add back the relation
      `recipient User @relation(fields: [recipientId], references: [id])`
      dream-sky's original had.
    - Commission.studentId stays a plain field but ALSO add the relation
      `student Student @relation(fields: [studentId], references: [id])`
      dream-sky's original had — eplanetbackend's did not have this FK
      because Track B wasn't supposed to join across tracks; now that it's
      one schema, wire it.
    - Event.createdBy (string) → createdById, with relation
      `createdBy User? @relation(fields: [createdById], references: [id])`.
    - AuditLog.actor (string) → actorId, with relation
      `actor User? @relation(fields: [actorId], references: [id])`.
    - Class.teacherId stays a plain field but add relation `teacher User
      @relation(fields: [teacherId], references: [id])`.
  Keep every enum eplanetbackend defines (CommissionRuleRole,
  CommissionRuleType, CommissionStatus, AttendanceStatus,
  ClassContentType, EventType, EventApprovalStatus, ReminderOffset,
  ReminderStatus, NotificationChannel, NotificationTemplateApprovalStatus,
  NotificationStatus) — these replace dream-sky's looser String-typed
  status fields on the same models. Where dream-sky's CommissionRule.type
  used its own CommissionType enum and .triggerStage used PipelineStage
  enum, keep using dream-sky's PipelineStage enum for triggerStage (do not
  replace it with eplanetbackend's plain String) since that enum is
  Track A's and other code depends on it.

ADD AS NEW (paste in below a `// ─── Ported from Track B ───` comment,
verbatim from eplanetbackend, no changes needed):
  Level, FieldOfStudy enums; Country, University, Course models;
  RecommendationResult model; PublicInquiry model.
  University/Course may reference CommissionRule.scopeUniversityId — keep
  that relation intact.

After editing, run `npx prisma validate` and fix any relation errors it
reports (missing back-relations are the most likely issue — add the
`@relation` field on both sides). Do not run migrate dev yet. Show me a
diff summary of every model you changed before finishing this phase.
```

---

## Prompt M2 — Migrate & Verify Schema

```
Phase M2: Apply the merged schema.

1. Run `npx prisma migrate dev --name "merge-track-b-schema"` inside
   dream-sky/. Fix any migration errors without changing the model
   decisions from Phase M1 (only fix syntax/relation mistakes).
2. Run `npx prisma generate`.
3. Run `npx prisma studio` briefly (or just `npx prisma validate`) to
   confirm all new tables (CommissionRule, Commission, Class, Enrollment,
   AttendanceRecord, ClassContent, Event, EventReminder, Notification,
   NotificationTemplate, AuditLog with new columns, Country, University,
   Course, RecommendationResult, PublicInquiry) exist with the expected
   columns.
4. Confirm `npm run dev` still starts the dream-sky server with no schema
   errors and that existing Track A endpoints still respond (use the
   PowerShell smoke test in MERGE_GUIDE.md Part 7 if you have Postgres
   running locally).
5. Commit: `git add . && git commit -m "M2: apply merged schema migration"`.
```

---

## Prompt M3 — Port Commission Module

```
Phase M3: Port the commission engine logic from eplanetbackend into
dream-sky, targeting the merged schema from M1/M2.

Source files (read, then rewrite as plain JS in dream-sky's structure):
  eplanetbackend/src/modules/commission/commission.service.ts
  eplanetbackend/src/modules/commission/commission.controller.ts
  eplanetbackend/src/modules/commission/commission-rule.controller.ts
  eplanetbackend/src/modules/commission/commission.routes.ts

Create in dream-sky:
  src/services/commission.service.js
  src/controllers/commission.controller.js
  src/routes/commission.routes.js
  (validators, if the source has meaningful Zod schemas, convert them to
  whatever validation pattern dream-sky's other validators already use —
  check src/validators/application.validator.js for the house style first)

Rules for the port:
  - Replace every eplanetbackend response call with dream-sky's
    sendSuccess/sendCreated/AppError per Prompt M0 rule 4.
  - Replace every eplanetbackend requireAuth()/requireRole(...) mock call
    with dream-sky's real requireAuth, requireRole from
    src/middlewares/auth.middleware.js and rbac.middleware.js.
  - Replace `recipientUserId` references with `recipientId`, matching the
    M1 schema rename.
  - The commission rule-snapshot immutability logic (storing ruleSnapshot
    as a JSON copy of CommissionRule at generation time, never mutating it
    after) must be preserved exactly — this is a non-negotiable business
    rule, not a style choice.
  - Mount the new router in dream-sky's src/routes/index.js:
    router.use("/commissions", require("./commission.routes"));
    router.use("/commission-rules", require("./commissionRule.routes"));
    (add these as new lines, do not touch the existing Track A mount
    lines above them)

Verify: server starts, `GET /api/commissions` and `GET /api/commission-rules`
respond with the correct empty-list shape once you're authenticated as the
seeded admin user.
```

---

## Prompt M4 — Port Class Module

```
Phase M4: Port the class module the same way as Phase M3.

Source: eplanetbackend/src/modules/classes/class.controller.ts,
class.routes.ts (and any class.service.ts if present — check the folder
for the actual file list first, this listing may be incomplete).

Cover: Class, Enrollment, AttendanceRecord, ClassContent CRUD and the
attendance-marking / material-upload endpoints your earlier planning docs
describe (CODE_STRUCTURE.md / BUILD_PROMPTS.md in the repo root have the
original spec if you need to cross-check expected behavior).

Same conversion rules as Phase M3 (plain JS, dream-sky response shape,
dream-sky real auth, teacherId relation wired per M1).

Mount: router.use("/classes", require("./class.routes"));

Verify server starts and GET /api/classes responds correctly for a
TEACHER-role test user.
```

---

## Prompt M5 — Port Event Module

```
Phase M5: Port the event module.

Source: eplanetbackend/src/modules/events/event.controller.ts,
event.routes.ts.

Cover: Event CRUD with EventApprovalStatus workflow (REQUESTED →
approved/rejected by Super Admin), EventReminder scheduling
(-1mo/-1wk/-1d/0 cadence per the master plan doc).

Same conversion rules as Phase M3. Wire createdById per the M1 rename.

Mount: router.use("/events", require("./event.routes"));

Verify server starts and GET /api/events responds correctly.
```

---

## Prompt M6 — Port Notification Module

```
Phase M6: Port the notification module.

Source: eplanetbackend/src/modules/notifications/notification.controller.ts,
notification.service.ts, notification.poller.ts, notification.routes.ts.

Cover: NotificationTemplate CRUD (with approval-status workflow), and
Notification send/queue logic. If notification.poller.ts implements a
background polling loop, port it as a node-cron job or setInterval running
inside dream-sky's src/server.js startup — check what dream-sky already
has for background jobs (likely nothing yet) before choosing an approach,
and tell me what you chose and why.

Same conversion rules as Phase M3.

Mount: router.use("/notifications", require("./notification.routes"));

Verify server starts and GET /api/notifications responds correctly.
```

---

## Prompt M7 — Port University/Course/Country, Recommendation, Public Modules

```
Phase M7: Port the remaining eplanetbackend modules — these have no
dream-sky equivalent at all, so this is closer to a straight copy than a
merge, just converted to plain JS and dream-sky's contracts.

Source:
  eplanetbackend/src/modules/university/university.controller.ts,
    course.controller.ts, country.controller.ts, university.routes.ts
  eplanetbackend/src/modules/recommendation/recommendation.controller.ts,
    recommendation.scoring.ts, recommendation.routes.ts
  eplanetbackend/src/modules/public/public.controller.ts, public.routes.ts

Cover:
  - Country/University/Course full CRUD, writes restricted to
    SUPER_ADMIN (per the original permission matrix), reads open to any
    authenticated role.
  - Recommendation engine: keep the scoring logic in
    recommendation.scoring.ts byte-for-byte in behavior (GPA
    normalization, 15% budget stretch buffer, STRONG_MATCH/REACH/SAFETY
    buckets) — only convert syntax to plain JS, do not "improve" the
    algorithm. It should read Student data via dream-sky's Student model
    now that it's in the same DB (previously it took an opaque recordId
    because it couldn't join across tracks — now it can join directly,
    but keep accepting a plain studentId parameter rather than assuming
    the caller passes a full Student object).
  - PublicInquiry: public-facing website inquiry form submission
    (unauthenticated POST) and Super-Admin-only list/view endpoints.

Same conversion rules as Phase M3 (plain JS, dream-sky response shape,
dream-sky real auth for the protected endpoints — public ones stay
public).

Mount:
  router.use("/universities", require("./university.routes"));
  router.use("/recommendations", require("./recommendation.routes"));
  router.use("/public", require("./public.routes"));

Verify server starts, GET /api/universities responds, and POST
/api/public/inquiries works without an auth header.
```

---

## Prompt M8 — Retire eplanetbackend, Final Verification

```
Phase M8: Cleanup and full smoke test.

1. Confirm every route eplanetbackend exposed now exists under dream-sky's
   src/routes/index.js: commissions, commission-rules, classes, events,
   notifications, universities, courses, countries, recommendations,
   public. List anything from eplanetbackend/src/modules/ you have NOT
   ported yet and tell me — do not silently skip anything.
2. Confirm dream-sky's app.js already has cors/helmet/express-rate-limit
   (per its own MERGE_GUIDE.md Part 4.2/9) — if not, add them now, above
   the route mount, without touching the existing error handler at the
   bottom.
3. Run the full Track A smoke test from
   "Consultancy backend/dream-sky/MERGE_GUIDE.md" Part 7, plus a matching
   pass over every newly-mounted route from this merge.
4. Run `npx prisma validate` one final time.
5. Once everything above passes, tell me explicitly which directories are
   now safe to delete: eplanetbackend/ (entire folder — its logic now
   lives in dream-sky), and eplanetbackend's separate `eplanet_db`
   database. Do NOT delete them yourself — list them and stop, I'll
   confirm and remove them manually.
6. Commit: `git add . && git commit -m "M8: backend merge complete —
   eplanetbackend logic fully ported into dream-sky"`.
```

---

## After this: frontend wiring

Once M0–M8 are done, the frontend's `src/lib/` gets a real API client
(axios instance + React Query hooks) pointed at dream-sky's single running
server instead of `src/mock/`. That's a separate phase — ask for it once
the backend merge is verified working end-to-end.
