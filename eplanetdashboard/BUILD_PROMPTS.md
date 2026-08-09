# E-Planet Consultancy CRM — Build Prompts for Phases 2–10

Each block below is a self-contained prompt. Paste one at a time into a new chat (or
Claude Code, pointed at the `eplanet-crm` project folder) once the previous phase is
merged in. They all assume the Phase 1 foundation already exists — app shell, design
system, types, mock data, and the Leads module — and tell Claude to build on top of it
rather than starting over.

Build them in order; later phases occasionally read data shaped by earlier ones
(e.g. Documents assumes Students exists).

---

## Phase 2 — Students Module

```
You're continuing work on the E-Planet Consultancy CRM frontend (React 19 + TypeScript
+ Vite + Tailwind v4 + Radix + Zustand + TanStack Query/Table). The app shell, design
system (src/components/ui), shared components (DataTable, PageHeader, EmptyState,
status-badges), types (src/types/index.ts), and mock data (src/mock/) already exist —
reuse them, don't recreate them. Follow the existing feature-folder pattern used by
src/features/leads/.

Build out the Students module fully, replacing the placeholder at
src/features/students/students-page.tsx:

1. Student List page (route: /students)
   - DataTable with: avatar, name, student ID, counselor, status, preferred country/level,
     English test score, documents progress (x/y), created date
   - Filters: search, status, counselor, preferred country, preferred level
   - Bulk actions: assign counselor, export, delete
   - "Add Student" button opening a multi-step form (see #3)

2. Student Profile page (route: /students/:id)
   - Header card: avatar, name, student ID, status badge, quick actions (call, email, edit)
   - Tabs: Personal, Academic, English Test, Study Preferences, Parents, Documents,
     Applications, Visa, Activity, Timeline
   - Each tab renders real data from the mock Student record (academics[], englishTest,
     parents[], etc.) — Documents/Applications/Visa tabs should cross-reference
     studentDocuments / applications / visaCases from src/mock by studentId
   - Activity tab reuses the activity timeline pattern from the dashboard's
     RecentActivityPanel, filtered to this student
   - Timeline tab shows a chronological visual timeline (stage changes, documents,
     applications, visa milestones)

3. Add/Edit Student form
   - Multi-step (React Hook Form + Zod), with a progress indicator, section dividers,
     and inline validation errors
   - Steps: Personal Info → Academic Background → English Test → Study Preferences →
     Parents/Guardians
   - On submit (mock), show a success toast (sonner) and navigate to the new profile

Update src/app/router.tsx to point both /students and /students/:id at real components.
Match the existing visual language exactly: same Card/Badge/Avatar/Tabs primitives,
same spacing scale, same font-tabular treatment for IDs and numbers. No new npm
packages — everything needed (react-hook-form, zod, @hookform/resolvers, dayjs,
framer-motion) is already installed.
```

---

## Phase 3 — Follow-ups Module

```
Continuing the E-Planet Consultancy CRM. Build out the Follow-ups module fully,
replacing src/features/followups/followups-page.tsx. Reuse the existing design system,
shared components, the FollowUp type (src/types/index.ts), and mock data
(src/mock — followUps array, 100 records).

Deliverables:
1. View toggle: Calendar / Timeline / List (same toggle-button pattern used in the
   Leads page for Table/Pipeline)
2. Calendar view — month grid, color-coded dots per day by priority, click a day to see
   that day's follow-ups in a side panel or popover
3. Timeline view — chronological vertical timeline grouped by date, similar styling to
   the dashboard's RecentActivityPanel but denser
4. List view — DataTable with student, counselor, reminder, priority, status, channel,
   date, time; filters for status/priority/counselor/channel; row click opens a detail
   drawer/dialog to mark complete, reschedule, or add a note
5. Color coding must be consistent with priorityMeta / followUpStatusMeta in
   src/components/shared/status-badges.tsx — extend that file if you need new mappings,
   don't invent a parallel system

Update the router to use the real page. Keep everything responsive down to mobile
(calendar should collapse to a scrollable agenda list on small screens rather than a
cramped grid).
```

---

## Phase 4 — Appointments Module

```
Continuing the E-Planet Consultancy CRM. Build out the Appointments module fully,
replacing src/features/appointments/appointments-page.tsx. Use the existing
Appointment type and the 30 mock appointments in src/mock.

Build a calendar scheduler with Daily / Weekly / Monthly views (view toggle, same
pattern as Leads' Table/Pipeline toggle). You may use react-big-calendar (already
installed, needs a dayjs localizer — wire that up) or a custom Tailwind grid if you can
match the existing visual language more closely; pick whichever gets you a better
result and say which you chose.

Each appointment renders as a card showing: student name + avatar, counselor, time
range, type (counseling/document_review/visa_prep/follow_up/orientation), status badge,
and location icon (branch office / video call / phone call — use different lucide
icons per location).

Include:
- A "New Appointment" button opening a form (React Hook Form + Zod): student picker,
  counselor picker, type, date/time range, location
- Click on an existing appointment to view/edit/cancel it in a Dialog
- Today's appointments should visually stand out (e.g. a subtle left border or
  highlight) consistent with how TodaysAppointmentsPanel highlights them on the
  dashboard

Update the router. Match spacing, radii, shadows, and color tokens from
src/index.css — don't introduce new colors outside the existing brand/slate/semantic
palette.
```

---

## Phase 5 — Applications Module

```
Continuing the E-Planet Consultancy CRM. Build out the Applications module fully,
replacing src/features/applications/applications-page.tsx. Use the existing
Application / ApplicationStage types and the 50 mock applications in src/mock.

Deliverables:
1. Applications list — DataTable with student, university (+flag/country), course,
   stage badge (reuse ApplicationStageBadge from status-badges.tsx), intake, tuition,
   submitted date, last update. Filters: stage, country, university, counselor.
2. Application detail — a Dialog or dedicated route (/applications/:id) showing a
   horizontal or vertical timeline/stepper matching this exact flow:
   Application Submitted → University Review → Conditional Offer → Unconditional
   Offer → Accepted, with Rejected as a possible terminal state at any point (style it
   distinctly, e.g. red, breaking off the main line rather than sitting inline).
   Each completed stage shows a timestamp; the current stage is highlighted; future
   stages are muted.
3. A way to advance an application's stage (e.g. a "Move to next stage" button or a
   stage-picker dropdown) that updates local state (Zustand store, same pattern as
   src/features/leads/store.ts) and fires a success toast.

Update the router (add /applications/:id if you go that route). Keep the stepper
component generic enough that it could plausibly be reused for the Visa checklist in
the next phase — extract shared bits into src/components/shared/ if natural.
```

---

## Phase 6 — Visa Processing Module

```
Continuing the E-Planet Consultancy CRM. Build out the Visa Processing module fully,
replacing src/features/visa/visa-page.tsx. Use the existing VisaCase / VisaStep /
VisaStatus types and the 20 mock visa cases in src/mock.

Deliverables:
1. Visa case list — cards or table (your call, pick whichever reads better for ~20
   items) showing student, country, university, overall status badge (VisaStatusBadge),
   and a progress bar (use the existing Progress component) showing checklist
   completion %.
2. Visa case detail (Dialog or /visa/:id route) with:
   - A modern checklist UI for the 6 steps: Medical, Biometric, Financial, Interview,
     Embassy Submission, Decision — each with a status icon/badge and completed date
     if applicable
   - A visual progress bar at the top summarizing overall completion
   - A status badge for the overall case status
   - A small timeline/log of when each step was completed, styled consistently with
     the Applications timeline from Phase 5
3. Filters on the list view: status, country.

Update the router. Reuse VisaStatusBadge and the Progress primitive rather than
building new ones. If you built a generic stepper/timeline component in the
Applications phase, reuse it here instead of duplicating the logic.
```

---

## Phase 7 — Documents Module

```
Continuing the E-Planet Consultancy CRM. Build out the Documents module fully,
replacing src/features/documents/documents-page.tsx. Use the existing StudentDocument /
DocumentType types and the 140 mock documents in src/mock.

Deliverables:
1. A drag-and-drop upload zone (react-dropzone is already installed) supporting the
   9 document types: Passport, Citizenship, Academic, CV, SOP, Recommendation,
   Financial, Offer Letter, Visa Letter. Since there's no real backend, simulate the
   upload (progress bar, then add to local Zustand state) rather than actually
   persisting files.
2. A documents table/grid per student (or globally, filterable by student) showing:
   file name, type, version, upload date, uploaded by, status (pending_review /
   verified / rejected), and file size.
3. A preview affordance — for mock purposes this can be a placeholder preview panel
   (icon + filename + metadata) rather than a real file viewer, since there's no real
   file behind the mock records.
4. Version history — clicking a document shows prior versions (increment version
   number on "re-upload" in the mock flow).
5. Status badges consistent with the rest of the app (add a docStatusMeta mapping to
   src/components/shared/status-badges.tsx if one doesn't fit the existing patterns).

Update the router. Keep the empty/loading states consistent with EmptyState /
Skeleton already in the codebase.
```

---

## Phase 8 — Universities, Countries & Courses (catalog modules)

```
Continuing the E-Planet Consultancy CRM. Build out three related catalog modules,
replacing their placeholders: src/features/universities/universities-page.tsx,
src/features/countries/countries-page.tsx, src/features/courses/courses-page.tsx.
Use the existing University / Country / Course types and mock data in src/mock
(25 universities, 8 countries, ~75 courses across all universities).

1. Universities — professional DataTable: logo initial, name, country (with flag),
   city, ranking, acceptance rate, tuition from, scholarship availability, application
   deadline, course count. Filters: country, scholarship availability. Sortable by
   ranking and tuition.
2. Countries — a card grid (not a table): flag, country name, university count,
   student count, visa difficulty badge, average tuition, and top 2-3 popular courses
   as small chips. Cards should link through to a filtered Universities view for that
   country.
3. Courses — a card grid: course name, level badge, university + country, duration,
   intake months, tuition. Filters: level, country, field of study. Search by name.

These three should feel obviously related (shared visual language, cross-links between
them) without being identical — vary card vs. table based on what suits the data, as
specified above. Update the router for all three routes.
```

---

## Phase 9 — Reports Module

```
Continuing the E-Planet Consultancy CRM. Build out the Reports module fully,
replacing src/features/reports/reports-page.tsx. Reuse the selector pattern from
src/features/dashboard/selectors.ts (don't duplicate data-shaping logic — extend or
import from there where it overlaps) and the chart-building patterns from
src/features/dashboard/components/charts.tsx (same ChartTooltip, same color palette
constants).

Deliverables:
1. A filter bar: country, counselor, university, date range (use the existing Select
   primitive; a simple two-date-input range picker is fine, no need for a fancy date
   range picker library).
2. A grid of charts reacting to those filters:
   - Bar chart: applications or leads by month
   - Line chart: enrollment/conversion trend over time
   - Pie chart: distribution by country or source
   - Area chart: cumulative students over time
3. Export buttons (PDF/CSV) — for the mock frontend, these can trigger a toast
   ("Export started" / "Report downloaded") rather than a real file export, since
   there's no backend yet.
4. A summary stats strip at the top (reuse the StatCards pattern from the dashboard,
   or a lighter variant of it) reflecting the current filter selection.

Update the router. This page should feel like the analytical, filterable sibling of
the Dashboard — not a duplicate of it.
```

---

## Phase 10 — Settings Module

```
Continuing the E-Planet Consultancy CRM. Build out the Settings module fully,
replacing src/features/settings/settings-page.tsx.

Use a left-nav + right-content settings layout (Tabs component, oriented vertically,
or a simple sidebar list — match whichever feels more "enterprise SaaS" per the
existing HubSpot/Linear/Notion-inspired direction) with these sections:

1. Profile — avatar, name, email, role (read-only for role), password change form
2. Branch/Workspace — consultancy name, address, branding color (already fixed to the
   brand palette, so this can be display-only), timezone
3. Counselors — a table of the 7 mock counselors (src/mock/reference.ts) with role,
   students handled, conversion rate, and an "Invite counselor" button opening a form
   (mock only — add to local state, don't persist)
4. Notifications — toggle switches (use the existing Switch component) for follow-up
   reminders, application updates, visa updates, weekly reports
5. Appearance — dark mode toggle (wire to the existing useUIStore, don't duplicate the
   theme logic already in src/store/ui-store.ts)

All forms should use React Hook Form + Zod for validation and show success toasts on
save. No backend calls — everything mutates local/mock state only.

Update the router.
```

---

## General notes for every phase

- Don't add new npm dependencies unless something is genuinely missing — the full
  stack (react-hook-form, zod, framer-motion, recharts, react-big-calendar,
  react-dropzone, dnd-kit, dayjs, sonner) is already installed.
- Don't restyle existing shared components (Button, Card, Badge, etc.) per-module —
  extend them centrally in src/components/ui/ or src/components/shared/ if a new
  variant is genuinely needed, so every module stays visually consistent.
- Run `npx tsc --noEmit -p tsconfig.app.json` and `npm run build` before considering a
  phase done — both should be clean.
- Keep mock data changes additive-only in src/mock/ — other modules may already depend
  on the existing shape.
