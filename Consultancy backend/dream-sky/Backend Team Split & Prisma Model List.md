# Backend Team Split & Prisma Model List
## Education Consultancy ERP + CRM — 2-Backend-Dev Plan

Team: 3 people — 1 frontend/UI-UX, 2 backend+database. This doc covers only the backend split and the consolidated data model.

---

## 1. How the split is designed

Goal: **zero modules where you're both editing the same code.** Every module below has exactly one owner, start to finish. The two of you never need to sit down and co-write a file — you agree on a handful of small *contracts* up front (§3), then go build independently and it snaps together at the end.

The 16 modules split into two fully independent vertical tracks:

- **Track A — "Identity & Student Pipeline"**: the auth mechanism itself, plus everything that follows one student through the pipeline.
- **Track B — "Users/Business Layer & Support Systems"**: everything CRUD-shaped that sits on top of auth, reference data, money-out (commission), and everything that isn't the pipeline itself.

Even Authentication and User Management — which look like one module — split cleanly, because they're actually two different concerns: *proving who you are* (Auth) vs. *managing the records of who exists* (User Management). One person owns the first, the other owns the second, and User Management just imports Auth's middleware as a black box.

---

## 2. The split

### Track A ( owns pipeline logic)
**"Prove who they are, then follow the student"**

| Module | Notes |
|---|---|
| Authentication (login, refresh tokens, 2FA, logout, JWT issuance, RBAC guard/middleware) | the RBAC middleware you write here is *imported*, not co-written, by every other module in both tracks — see §3 contract #2 |
| Student Management (leads, pipeline stages, profile, payments/installments/receipts) | the CRM heart — most logic-dense module in this track |
| Follow-up | communication log + reminders, sits directly on Student |
| Appointment | booking against a Student + Counselor |
| Document Management | uploads/verification/expiry, sits on Student |
| Student Application (applications, offers, AI-recommendation stub) | depends on University existing — coordinate timing with Track B, see §4 |
| Visa Module | depends on Application existing |
| Student Portal endpoints + Agent Portal's *pipeline/document/visa* read views | scoped-read layers over the above |

### Track B 
**"Everything around the student"**

| Module | Notes |
|---|---|
| User & Branch Management (CRUD for users/branches, invite flow, role assignment) | depends on Track A's Auth middleware existing to protect its routes, but that's an *import*, not a co-write — see §3 |
| University Module (universities/courses/countries) | **no dependencies — start this immediately**, it unblocks Track A's Application module fastest |
| Commission Module | can build the rules engine + snapshot logic against dummy student/counselor IDs early, wire to real data once Track A's Student model is stable |
| Class Module | roster/attendance/materials — needs Teacher (User) + Student, otherwise self-contained |
| Event Module | mostly self-contained, needs User for creator/audience |
| Notification Module | deferred to later per your existing plan (Phase 6) — natural fit here since it fans out to everything else |
| Dashboard & Reports | needs most other modules to have data first — do this last |
| Website Module | public routes, decoupled — can build anytime, good filler task if blocked on something else |
| Agent Portal's *commission/performance* views | pairs naturally with owning Commission |

### Why this split and not module-by-module alternation
Splitting by *vertical concern* keeps each person entirely inside their own folder tree (`/modules/auth`, `/modules/student-management`, etc. for A; `/modules/users`, `/modules/university`, `/modules/commission`, etc. for B) — genuinely zero shared files. What makes independent coding possible without either of you waiting on the other is agreeing on a small set of **contracts** *before* either of you writes service code — not by co-writing, just by writing down the shape on paper/Notion/a shared doc and both building against it.

---

## 3. Contracts to agree on before coding starts (write these down, don't co-code them)

These are the only things that need to be settled jointly. Once settled, each of you goes fully independent.

1. **Prisma schema v1** — the actual data contract. Sketch it together in one sitting (or draft it solo and have the other review), then each of you owns migrations only for your own models day-to-day.
2. **JWT payload shape** — e.g. `{ userId, role, branchId, iat, exp }`. Track B's User Management needs to know exactly what claims Track A's tokens carry, without needing to read Track A's implementation.
3. **RBAC middleware signature** — Track A ships something like `requireRole(...roles)` and `requireAuth` as an exported function. Track B (and everyone else) imports it as a dependency and treats it as a black box — they don't need to know how 2FA or refresh tokens work internally.
4. **Permission-matrix config shape** (`role + resource + action` → allow/deny) — agree on the JSON/config shape once; Track A's middleware reads it, Track B's route guards read it too.
5. **Error response shape** (`{ code, message, details }` or similar) — agreed once so `/reports` and `/dashboard` don't have to special-case every module's response format.
6. **University/Course ID contract** — Track A's Application module just needs to know `University.id` and `Course.id` exist and their shape; it can build against mock IDs until Track B's University module ships, no coordination needed beyond the schema.

Once these six things are written down, neither of you needs to touch the other's code or wait on a merge to keep moving.

Suggested rough sequencing (adjust to your actual calendar):

```
Day 1      Both: sketch Prisma schema v1 + the 6 contracts above together (one sitting, not ongoing pairing)
Day 2+     A: Authentication module (owns JWT + RBAC middleware, ships it as an importable package/module)
           B: User & Branch Management (builds against the JWT/middleware contract, not against A's actual code yet)
                + University Module in parallel (zero dependencies)
Next       A: Student Management, Follow-up, Appointment
           B: Commission rule config (against mock student/counselor IDs)
Next       A: Document Management, Student Application (needs B's University — built against the ID contract, integrates once B ships it)
           B: Class Module, Event Module
Next       A: Visa Module, Student/Agent portal pipeline views
           B: Wire Commission to real data once A's Student module is merged in, Website Module
Last       A + B: Notification (whoever's free first), Dashboard & Reports (B, needs everything else populated)
Final      Both: integration pass — merge branches, wire Track A's middleware into Track B's routes for real, run through the permission matrix end-to-end
```

---

## 4. Consolidated Prisma model list

Per your instruction: models are merged wherever one table can reasonably hold what earlier docs modeled as several. Below, each merge is called out with the reasoning so you can split it back out later if a merged model gets too wide in practice.

### Identity & Access
| Model | Owner | Covers | Merge note |
|---|---|---|---|
| `Branch` | Track B (User Mgmt) | branch record | — |
| `User` | Track A (Auth) owns auth fields; Track B (User Mgmt) owns CRUD over the same table | email, passwordHash, role enum, branchId, 2FA secret, status | Front Desk and Super Admin need no extra fields beyond this — no separate profile model for them. This is the one model both tracks touch, which is why the JWT-payload and RBAC contracts (§3) matter — Track A reads/writes auth fields, Track B reads/writes profile fields, and they don't need to coordinate row-by-row as long as the columns are agreed upfront. |
| `CounselorProfile` | Track A | specialization, target/quota (optional) | 1:1 with User, only for Counselor role |
| `TeacherProfile` | Track B | subjects taught | 1:1 with User, only for Teacher role |
| `ReferralAgentProfile` | Track B | referral code, QR code URL, payout/bank details | merged what earlier docs split into "ReferralLink" + agent details into one profile — no reason for a link to be its own table when it's 1:1 with the agent |

### Student Pipeline (Track A)
| Model | Covers | Merge note |
|---|---|---|
| `Student` | lead + student in one record: contact info, source, duplicate-check fields, current pipeline stage, assignedCounselorId, referredByAgentId, academic/financial/family background **as JSON fields**, not separate tables | Earlier entity map had `ContactInfo`/`AcademicBackground`/`FinancialBackground`/`FamilyBackground` as separate models — collapsed into JSON columns on `Student` since nothing else joins against them individually; revisit only if you need to query *inside* those fields relationally |
| `PipelineStageHistory` | stage, changedAt, changedBy, reasonCode (for Lost) | kept separate — this is a log table, needed for the Timeline view and audit trail, genuinely different access pattern from `Student` itself |
| `TestScore` | type (IELTS/PTE/TOEFL), score, date, expiry, studentId | — |
| `Document` | type, status, fileUrl, uploadedBy, verifiedBy, expiry, studentId | e-signature/acknowledgment can be a boolean + timestamp field here rather than its own model |
| `CommunicationLog` | channel, direction, content, timestamp, studentId, authorId, nextFollowUpAt | merged "Follow-up reminder" into a field on this log rather than a separate reminder model — the SLA job (§5 of project instructions) just queries `MAX(CommunicationLog.timestamp)` per student |
| `Appointment` | studentId, counselorId, datetime, status, type | — |
| `Payment` | fee record: feeType, totalAmount, currency, fxRate, studentId, status | header record for an installment plan |
| `Transaction` | paymentId, amount, method, receiptNumber, paidAt | merged "Installment" and "Receipt" into one `Transaction` model — each installment paid *is* a receipt event, no need for two tables tracking the same row |
| `Application` | studentId, universityId, courseId, status, submittedAt | — |
| `Offer` | applicationId, type (conditional/unconditional), details | — |
| `VisaCase` | applicationId or studentId, status, refusalReason, resubmissionLink | — |

### Business Layer (Track B)
| Model | Covers | Merge note |
|---|---|---|
| `Country` | — | — |
| `University` | countryId, details | — |
| `Course` | universityId, entry requirements, scholarships, deadlines, minGPA, English requirement, cost estimate | — |
| `CommissionRule` | role (counselor/agent), type (fixed/%/tiered), triggerStage, effectiveFrom/To, scope (branch/university if applicable) | — |
| `Commission` | ruleSnapshot (JSON, immutable copy of the rule at generation time), recipientId, studentId, amount, status (pending/paid/disputed) | this is the model where immutability actually matters — don't merge this one further |
| `Class` | teacherId, name, schedule | — |
| `Enrollment` | classId, studentId | — |
| `AttendanceRecord` | classId, studentId, date, status | — |
| `ClassContent` | classId, type enum (NOTE / MATERIAL / ASSIGNMENT), title, body, fileUrl, dueDate | merged what could've been three separate models (Note, Material, Assignment) into one, since they're the same shape and all need to surface on the Student dashboard the same way |
| `Event` | title, type, datetime, createdBy, branchId | — |
| `EventReminder` | eventId, offset (e.g. -1d), status | kept separate from `Notification` — Event owns *when* to remind, Notification owns *how to deliver*, matching your project instructions |
| `Notification` | channel, template, recipientId, status, sentAt, payload | — |
| `NotificationTemplate` | channel, name, content, approvalStatus (for WhatsApp) | — |
| `AuditLog` | actor, entity, entityId, field, oldValue, newValue, timestamp | — |

**Total: 30 models** — down from what a fully-normalized version of the earlier entity map would produce (35–40+), by collapsing background-info tables into JSON fields, folding installments/receipts into one transaction table, and merging class notes/materials/assignments into one typed content table.

Permission matrix is **not** a model yet — per project instructions it starts as a config file, DB-backed is a Phase 8 upgrade.

---

## 5. Still-open decisions (flagging per your project instructions — haven't been answered yet)

- **Commission trigger granularity**: per-branch, per-university, or global rules? Affects whether `CommissionRule` needs a `branchId`/`universityId` scope column from day one or can add it later.
- **Redis/Socket.IO timing**: your project instructions already say defer to Phase 6 — confirming that still holds now that it's a 2-person build (no reason to change, just flagging it's still parked).

Let me know if you want the actual `schema.prisma` file written out next — that'd be the natural next step so both of you are coding against the same file from day one.
