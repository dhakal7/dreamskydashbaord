Education Consultancy ERP + CRM — Master System Plan
0. Scope Note
This plan supersedes the earlier single-branch, 6-role design in favor of what's specified in the master prompt: multi-branch-capable, 6 roles (Super Admin, Front Desk, Counselor, Teacher, Student, Referral Agent), with a bundled LMS-lite and self-serve portals. Where the old plan and this one conflict, this one wins unless you tell me otherwise.
---
1. Vision & Product Shape
This is not a CRM — it's a vertical ERP for education consultancies, covering three audiences under one roof:
Internal operators (Super Admin, Front Desk, Counselor, Teacher) — run the business
External stakeholders (Student, Referral Agent) — self-serve portals with restricted, scoped views
The business itself — university database, commission engine, event system, and analytics that make the consultancy's operations legible to its owner
Think of it as three products sharing one data model: an Operations CRM (lead → visa pipeline), a Lightweight LMS (for IELTS/PTE prep classes), and Two Partner Portals (student, agent). Building it that way — as separable modules against a shared core — is what makes "modular, so features can be added later" actually true, rather than aspirational.
---
2. Missing Features (Not in the Prompt, Should Be In Scope)
The prompt asked to flag anything standard-for-enterprise that's missing. Here's what I'd add, with justification:
Feature	Why it matters
Document expiry tracking (passport, test scores, medical)	IELTS/PTE scores and passports expire mid-pipeline; without alerts, applications get rejected on technicalities.
Duplicate lead detection	Multi-channel intake (walk-in, Facebook, referral, website) will create duplicate leads for the same person; needs phone/email fuzzy-match at entry.
Lead scoring / prioritization	With Front Desk feeding many counselors, some ranking (budget, urgency, intake proximity) prevents good leads from going cold.
SLA & escalation rules	"No follow-up in N days" or "document pending X days" should auto-escalate to Branch/Super Admin — the prompt has reminders but not escalation.
Multi-currency & FX handling	Tuition/living costs are in destination currency (AUD/CAD/GBP), fees collected in NPR — needs an FX layer, not just numbers.
Refund & dispute workflow	Visa refusals trigger partial refunds per company policy — needs a formal state machine, not ad hoc.
E-signature / document acknowledgment	For SOPs, LORs, and consultancy agreements — avoids printer/scanner dependency.
WhatsApp template pre-approval workflow	Meta requires templates be pre-approved; the system needs a template library + status tracker, not free-text send.
Bulk import/export tooling	Migrating existing student data from Excel/paper on day one is a real, immediate need.
Multi-branch rollup reporting	If Super Admin can create branches, someone needs cross-branch dashboards distinct from single-branch counselor/agent views.
Data retention / audit granularity	Passport numbers, financial docs — needs field-level audit logs and a retention policy, beyond generic "audit logs."
Waitlist / intake capacity management	Universities cap intake seats; without this, counselors oversell nonexistent seats.
Helpdesk/ticketing for students	Students will have questions outside the pipeline (portal login issues, doc re-upload) — a lightweight ticket queue avoids WhatsApp chaos.
I'd hold off on full HR/payroll (mentioned nowhere, but "employee" language creeps in) — that's a distinct product; commission tracking for counselors/agents is in scope, general payroll is not, unless you want it.
---
3. User Roles & Permission Matrix
Capability	Super Admin	Front Desk	Counselor	Teacher	Student	Referral Agent
Create branches, users, roles	✅	❌	❌	❌	❌	❌
Manage university/course/country DB	✅	❌ (view)	❌ (view)	❌	❌ (view)	❌
Register new lead	✅	✅	✅	❌	❌	✅ (own referral only)
Assign lead to counselor	✅	✅	❌	❌	❌	❌
Full student profile (own students)	✅	view-only	✅	❌	own only	own referrals, status only
Document upload/verify	✅	upload only	✅ verify	❌	upload own	❌
Visa & application progress edit	✅	❌	✅	❌	view own	view own (status only)
Fee collection / receipts	✅	✅	view own students	❌	view own	❌
Commission rule config	✅	❌	❌	❌	❌	❌
View own commission	—	❌	✅	❌	❌	✅
Mark commission paid	✅	❌	❌	❌	❌	❌
Class/attendance/materials	✅	❌	❌	✅ (own classes)	view own	❌
Event creation	✅	❌	request only	❌	❌	❌
Reports: branch-wide	✅	❌	own performance	own classes	❌	own performance
System settings/permissions	✅	❌	❌	❌	❌	❌
This needs to be enforced at the API layer (not just hidden UI), since Student and Agent are external, semi-trusted logins.
---
4. Student Journey Pipeline
Merging the prompt's 10-stage lead pipeline with the granularity a real consultancy needs (matches the earlier 14-stage depth):
```
1. New Lead           → captured, source tagged
2. Contacted          → first outreach logged
3. Qualified          → interest + eligibility confirmed
4. Counseling Booked   → appointment scheduled
5. Counseling Done     → profile built, country/course/university shortlisted
6. Documentation       → passport, transcripts, SOP, LOR, test scores collected
7. Application Submitted → to university
8. Offer Received      → conditional/unconditional
9. Fee Payment (tuition/deposit)
10. Visa Documentation  → financials, medical, biometric
11. Visa Submitted
12. Visa Decision       → Granted / Refused (refused → loop back to reapply or exit)
13. Pre-Departure       → travel, orientation, briefing
14. Post-Departure      → arrival confirmation, alumni/referral follow-up
    (parallel: Lost — can be exited from any stage with reason code)
```
Views needed: Kanban (per counselor), List (filterable, bulk actions), Timeline (per student, audit trail).
---
5. Module Breakdown
5.1 Lead & Front Desk Module
Registration form (name, phone, email, address, country/intake interest, source), duplicate check on submit, counselor auto/manual assignment, appointment booking with calendar sync, fee collection with receipt generation and payment-proof upload, today's appointments/follow-ups dashboard.
5.2 Counselor Workspace
Assigned-student list with pipeline-stage filter, full student profile (academic/financial/family background, test scores, passport), document upload+verification with checklist per country/university, visa & application status tracker, private notes, communication log (calls/WhatsApp/email unified thread), next-follow-up reminders, AI university recommendation panel (accept/override).
5.3 AI Recommendation Engine
Inputs: GPA, test scores, budget, preferred country/course, gap years. Outputs: ranked university list with admission-probability estimate, scholarship matches, and rationale text. This should be a scoring service behind an API, not hardcoded rules, so Super Admin's university database changes automatically feed better matches. Model choice (rules-engine v1, ML-ranked v2) is a build-phase decision, not a day-one requirement.
5.4 Teacher / Class Module
Class roster, attendance (per-session), daily notes, study material + assignment upload, student progress view, upcoming class schedule.
5.5 Student Portal
Read-only-plus-upload: attendance, notes, materials, assignments, visa/application status, payment history, uploaded docs, counselor suggestions, profile self-update, document upload, notifications.
5.6 Referral Agent Portal
Own-referrals list with pipeline status, commission earned/paid/pending, payment history, performance dashboard, unique referral link + QR code generator.
5.7 Commission Engine
This is the most complex module (flagged in the earlier plan too, and still true here). Needs:
Structures: fixed, percentage, tiered — all configurable per role (counselor vs agent) and potentially per branch/university
Trigger points: configurable per pipeline stage (e.g., on Offer, on Visa Granted, on Fee Paid) rather than hardcoded to "successful student"
Immutability: once a commission record is generated against a rule version, later rule changes must not retroactively alter it — store the rule snapshot, not a reference
Admin actions: mark-paid workflow with notification to counselor/agent, dispute/adjustment trail
5.8 University & Course Database
Countries, universities, courses, entry requirements, scholarships, deadlines, min GPA, English requirements, cost estimates, visa success rate — this is reference data Super Admin owns; everything else (recommendations, application tracking) reads from it.
5.9 Event Management
Create events (seminar, uni visit, fair, webinar, meeting), calendar view, auto-notification cadence (1mo/1wk/1day/same-day) fanned out to relevant roles.
5.10 Payments
Fee types (registration, application, test, visa, consultancy), installment plans, receipts, outstanding balance tracking, payment history, due-payment reminders. Needs the multi-currency layer noted in §2.
5.11 Notifications
Channels: in-app (real-time via WebSocket), email, SMS, WhatsApp Business API. Needs a template system per channel (WhatsApp especially, due to Meta pre-approval) and a per-user/per-role notification-preference setting.
5.12 Dashboards & Reports
Executive dashboard (revenue, student growth, country/university analytics), role-scoped dashboards (counselor/agent/teacher performance), and exportable reports (student, counselor, teacher, agent, revenue, country, university, visa, application, attendance).
5.13 Security
RBAC enforced server-side, JWT with refresh tokens, 2FA (at least for Super Admin/Counselor), field-level audit logs (esp. passport/financial data), daily encrypted backups, session timeout, permission matrix as data (not code) so Super Admin can adjust without a deploy.
---
6. Database — High-Level Entity Map
```
Branch ─┬─ User (role: enum) ─┬─ Counselor profile
        │                     ├─ Teacher profile
        │                     └─ FrontDesk profile
        │
Lead/Student ─┬─ ContactInfo
              ├─ AcademicBackground
              ├─ FinancialBackground
              ├─ FamilyBackground
              ├─ TestScore (type: IELTS/PTE/TOEFL, score, date, expiry)
              ├─ Document (type, status, uploaded\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_by, verified\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_by, expiry)
              ├─ PipelineStage (current + history log, timestamped)
              ├─ Application ─── University ─── Course ─── Country
              ├─ Offer (conditional/unconditional, university, course)
              ├─ VisaCase (status, refusal reason if any, resubmission link)
              ├─ Payment ─── Installment ─── Receipt
              ├─ CommunicationLog (channel, direction, content, timestamp)
              ├─ Note (author, private/shared)
              └─ AssignedCounselor / ReferredByAgent

ReferralAgent ─┬─ ReferralLink/QRCode
               └─ Commission ─── CommissionRuleSnapshot

CommissionRule (role, type: fixed/%/tiered, trigger\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_stage, effective\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_from, effective\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_to)

Class ─┬─ Teacher
       ├─ Enrollment ─── Student
       ├─ AttendanceRecord
       ├─ Material
       └─ Assignment

Event ─── EventNotification (schedule: -1mo/-1wk/-1d/0, audience roles)

Notification (channel, template, recipient, status, sent\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_at)
AuditLog (actor, entity, field, old\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_value, new\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_value, timestamp)
```
This is intentionally entity-level, not a full ERD with FKs/types — that's the right next artifact once the stack is locked (Prisma schema or equivalent), so it isn't hand-modeled twice.
---
7. API Architecture (outline)
REST, versioned (`/api/v1/`), resource-oriented, grouped by module:
```
/auth            (login, refresh, 2FA, logout)
/users           (Super Admin only for CRUD; role-scoped read)
/branches
/leads           (create, assign, convert-to-student)
/students/:id    (profile, background, test-scores, documents)
/pipeline/:studentId  (stage transitions, history)
/applications
/offers
/visa-cases
/universities /courses /countries
/payments /installments /receipts
/commissions /commission-rules
/classes /attendance /materials /assignments
/events
/notifications
/reports (branch, counselor, agent, teacher, revenue, ...)
/referrals (agent-scoped)
```
Real-time (Socket.IO or equivalent): notification push, live pipeline updates on Kanban boards, live attendance marking.
---
8. Tech Stack — Evaluation of the Proposed Stack
The prompt specifies Next.js/NestJS/Prisma/Redis/Socket.IO/AWS. This is a reasonable, coherent, production-grade choice — a step up in complexity from the earlier React/Express-or-Django/Postgres plan, and better suited to what's now a multi-portal, real-time system:
Next.js over plain React — makes sense given you'll eventually need SEO-able public pages (landing, agent referral links) alongside authenticated app views.
NestJS over Express — the structured, modular DI pattern pays off once you have 6 roles × 13 modules; plain Express will get unwieldy here.
Prisma — good fit with Postgres, strong TypeScript story, easier than hand-written SQL for a schema this size.
Redis — needed for session/rate-limiting and as a pub/sub backbone for Socket.IO notifications; not optional at this scope.
Socket.IO — justified by the real-time notification/live-pipeline requirement; wasn't in the earlier plan because that plan didn't have live dashboards.
AWS S3 / Cloudinary — document storage (passports, transcripts) — S3 for secure private docs, Cloudinary if you want on-the-fly image transforms (e.g., photo compression for scanned docs); you likely only need one of these, not both — pick S3 alone unless you have a specific image-pipeline need.
One flag: this is a considerably heavier stack for a solo builder to operate (NestJS + Prisma + Redis + Socket.IO + Docker + CI/CD all at once). It's the right architecture for the product, but worth deciding upfront whether you want to stand all of it up in Phase 0, or defer Redis/Socket.IO to the phase where real-time notifications actually get built, and start with a simpler synchronous NestJS+Prisma+Postgres core.
---
9. Folder Structure (monorepo)
```
/apps
  /web          (Next.js — admin, front desk, counselor, teacher UI)
  /student-portal   (or a route-scoped section within /web)
  /agent-portal     (same)
  /api          (NestJS — modules per domain: auth, leads, students,
                 pipeline, payments, commissions, classes, events,
                 notifications, reports)
/packages
  /db           (Prisma schema + migrations, shared types)
  /ui           (shared shadcn/Tailwind components)
  /config       (eslint, tsconfig, env schema)
/infra
  docker-compose.yml
  /nginx
  /github-actions
```
A monorepo (Turborepo or Nx) keeps the three frontends (internal app, student portal, agent portal) sharing types/UI without duplicating code — worth setting up in Phase 0 rather than retrofitting later.
---
10. Build Roadmap (Phased)
Phase	Scope	Notes
0 — Foundation	Monorepo, auth (JWT+2FA), RBAC scaffolding, branch/user CRUD, DB schema v1, CI/CD skeleton	No business features yet — get the skeleton right, since 6 roles × 3 portals makes retrofitting auth painful
1 — Core Pipeline	Lead capture, Front Desk workflow, counselor assignment, pipeline stages (Kanban/List/Timeline), student profile	This is the CRM heart
2 — Documents & Applications	Document upload/verify, university/course DB, application + offer tracking	Depends on S3 setup
3 — Payments & Commission	Fee collection, receipts, installments, commission engine (rules + snapshots)	Highest logic complexity — budget the most time here
4 — Teacher/Class Module	Classes, attendance, materials, assignments	Fairly self-contained; can parallelize with Phase 3
5 — Student & Agent Portals	Both external-facing portals, scoped read/write	Needs Phase 1–3 data model stable first
6 — Notifications & Events	Email/SMS/WhatsApp integration, event calendar, escalation rules	WhatsApp approval is an external bottleneck — start that application in parallel with Phase 0
7 — AI Recommendations	University/scholarship matching engine	Can ship as rules-based v1, upgrade later
8 — Dashboards, Reports, Polish	Executive dashboard, all reports, audit logs, backups, load/security testing	Pre-launch hardening
External bottlenecks that don't compress no matter how fast the code moves (per your existing notes): WhatsApp Business API approval, Nepali payment gateway onboarding (eSewa/Khalti/Fonepay) — start both in Phase 0, not Phase 6, since approval timelines run in parallel to development regardless of when you build the integration code.
---
11. Open Decisions Before Coding Starts
Multi-branch now or later? Building branch-scoping into every query from day one is cheap; retrofitting it later is expensive. Recommend building it in even if you launch single-branch.
Redis/Socket.IO in Phase 0 or deferred to Phase 6? Affects infra complexity early on.
S3 vs Cloudinary vs both — pick one for document storage.
Commission trigger granularity — per-branch, per-university, or global rules? Affects the rule-snapshot schema.
AI recommendation: rules-engine v1 or ML from day one? Rules-engine is far faster to ship and can be swapped later behind the same API.
Deployable codebase vs chat-based prototype — still open from before, and matters more now given the stack complexity (NestJS/Prisma/Docker are not really buildable purely in-chat).
---
Want me to turn Phase 0 and Phase 1 into a week-by-week task breakdown next, or draft the Prisma schema for the core entities in §6 first?