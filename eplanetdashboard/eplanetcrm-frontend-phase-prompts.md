# eplanetcrm Frontend — Remaining Build Phases

Paste **Prompt 0** into Claude Code once, at the start of a session, before any phase
prompt. It re-establishes context so Claude Code doesn't have to re-derive it. Then
paste one phase prompt at a time — finish and verify each before moving to the next.

All 6 role dashboards (Super Admin, Front Desk, Counselor, Teacher, Student, Referral
Agent) are already built and wired to a mock auth/role-switcher. These phases build the
full pages those dashboards currently link out to (or should link out to).

---

## Prompt 0 — Master Context (paste first, every session)

```
PROJECT: eplanetcrm — Education Consultancy ERP/CRM frontend for E-Planet Consultancy.
Stack: Vite + React + TypeScript + Tailwind + shadcn/ui, React Router, Zustand,
dayjs, framer-motion, lucide-react. No backend yet — everything is driven off
mock data in src/mock/, typed in src/types/index.ts.

CURRENT STATE:
- Role system exists: src/types/index.ts has `Role`; src/store/auth-store.ts holds
  the mock "current user" (useAuthStore), switchable via a "Preview dashboard as"
  dropdown in the topbar. Six roles: super_admin, front_desk, counselor, teacher,
  student, referral_agent.
- Six role-scoped dashboards exist under src/features/dashboard/role-dashboards/,
  dispatched from src/features/dashboard/dashboard-page.tsx based on
  useAuthStore's currentUser.role. Data for them is scoped in
  src/features/dashboard/role-selectors.ts.
- Mock data already exists for: students, leads, follow-ups, appointments,
  applications, visa cases, documents (src/mock/entities.ts, reference.ts),
  branches (src/mock/branches.ts), teachers + referral agents
  (src/mock/staff.ts), classes/enrollments/attendance/materials
  (src/mock/classes.ts), commission rules + commission records
  (src/mock/commissions.ts). Re-use and extend these — don't create parallel
  mock files for the same entities.
- Existing full-page features to pattern-match against: src/features/students,
  src/features/leads, src/features/applications, src/features/followups,
  src/features/appointments — each has a list page (filters, table/kanban),
  and some have a detail page. Copy their structure/conventions exactly:
  PageHeader, Card, EmptyState, status badge components from
  src/components/shared/status-badges.tsx, data-table patterns, and the
  existing color/spacing/typography system (do not introduce new design
  tokens — check src/index.css and tailwind config before adding any).
- Router: src/app/router.tsx — routes are flat, lazy-loaded, wrapped by
  AppShell. Nav: src/components/layout/nav-items.ts has getNavItems(role) —
  currently "commissions" and "referrals" nav entries point at /reports as a
  placeholder. Real routes need to replace those placeholders.

BOUNDARIES:
- Don't touch the 6 dashboard files or role-selectors.ts unless a phase
  explicitly says to — dashboards should start linking to real pages once
  those pages exist, but the dashboard cards/data logic stay as-is.
- Don't invent a backend or fetch calls — everything reads from src/mock.
- Match existing naming: kebab-case files, PascalCase components, feature
  folders under src/features/<module>/.
- Every new list page needs: PageHeader with title+description+actions,
  an EmptyState for the zero-data case, and either a Card-based list or the
  existing DataTable pattern (check src/components/shared/data-table.tsx
  usage in src/features/leads or src/features/students first).
- Run `npx tsc --noEmit -p tsconfig.app.json` and `npx oxlint <changed files>`
  before considering a phase done. Report both results.

Confirm you've read this, then wait for the phase prompt.
```

---

## Phase 1 — Class Module (Teacher's own-classes pages)

```
PHASE 1: Class Module pages.

Build:
1. src/features/classes/classes-page.tsx — list of all classes (filterable by
   subject, status, teacher), using ClassSession from src/mock/classes.ts.
   Role-aware: Super Admin sees all classes; Teacher sees only their own
   (reuse the same scoping pattern as getTeacherDashboard in
   dashboard/role-selectors.ts, don't duplicate logic — extract a shared
   selector if needed into src/features/classes/selectors.ts).
2. src/features/classes/class-detail-page.tsx — single class: roster
   (Enrollment[]), attendance history (AttendanceRecord[]), materials
   (ClassMaterial[]), with an "Enrolled X/Capacity Y" header stat block.
3. Add routes: /classes and /classes/:id in src/app/router.tsx (lazy-loaded,
   matching existing pattern).
4. Update nav-items.ts: point counselor/teacher/super_admin's nav at
   real /classes route (front_desk, student, referral_agent should NOT get
   a Classes nav item — check the permission matrix in the master plan).
5. Update TeacherDashboard's class cards to link to /classes/:id.

Verify with tsc + oxlint as per Prompt 0, then summarize what was built.
```

---

## Phase 2 — Commission Module (Counselor + Agent + Super Admin)

```
PHASE 2: Commission Module pages.

Build:
1. src/features/commissions/commission-ledger-page.tsx — table of
   Commission records (src/mock/commissions.ts), columns: earner, student,
   rule name (from ruleSnapshot — never the live rule), amount, status,
   generated date, paid date. Filterable by status and earner type.
   Role-aware: counselor/referral_agent see only their own records
   (earnerId === currentUser.linkedId); super_admin sees all and gets a
   "Mark Paid" action per row (status -> 'paid', set paidAt) — client-side
   state update only, no backend.
2. src/features/commissions/commission-rules-page.tsx — super_admin only.
   List of CommissionRule (src/mock/commissions.ts), showing type, trigger
   stage, effective dates, active flag. Read-only for now (no create/edit
   form yet — flag that as a follow-up, don't build it this phase).
3. Add routes: /commissions and /commission-rules.
4. Update nav-items.ts: counselor and referral_agent's "My Commission" /
   "My Referrals" placeholder links (currently pointing at /reports) should
   point at /commissions. Add /commission-rules to super_admin's nav only.
5. Update CounselorDashboard and ReferralAgentDashboard commission sections
   to link out to /commissions.

IMPORTANT: Commission immutability is non-negotiable per the project's
architecture — never let the ledger page display or derive amounts from the
live CommissionRule, only from each record's own ruleSnapshot. Say so
explicitly in your summary so I know it was respected.

Verify with tsc + oxlint, then summarize.
```

---

## Phase 3 — Branch & User Management (Super Admin only)

```
PHASE 3: Branch & User Management pages.

Build:
1. src/features/branches/branches-page.tsx — super_admin only. Card grid or
   table of Branch (src/mock/branches.ts): name, city, manager, staff count,
   student count, revenue vs target (reuse the progress-bar pattern from
   SuperAdminDashboard's branch rollup panel — extract it to a shared
   component if that's cleaner than duplicating).
2. src/features/branches/branch-detail-page.tsx — single branch's staff
   list and student count. Staff list can be assembled from counselors +
   teachers + front desk mock users filtered by branchId if that field
   exists on them; if it doesn't yet, add a branchId field to those mock
   records (staff.ts, reference.ts) rather than faking it in the page.
3. Add routes: /branches and /branches/:id, nav item for super_admin only.
4. Do NOT build user CRUD forms this phase (create/edit user) — that
   needs the real auth contract from Track A and shouldn't be faked with
   a form that goes nowhere. Flag it as a follow-up instead.

Verify with tsc + oxlint, then summarize.
```

---

## Phase 4 — Event Module

```
PHASE 4: Event Module pages.

Build:
1. Add Event and EventReminder types to src/types/index.ts (fields per the
   master plan §6: name, type [seminar/uni_visit/fair/webinar/meeting],
   date, location, audience roles, reminder schedule -1mo/-1wk/-1d/0).
2. src/mock/events.ts — mock event data, exported via src/mock/index.ts
   (follow the same pattern as branches.ts/classes.ts).
3. src/features/events/events-page.tsx — calendar or list view (check if
   react-big-calendar is already a dependency before adding a new one —
   it's referenced in package.json's @types, confirm the base package is
   too) of upcoming/past events, filterable by type.
4. Add route /events, nav item for super_admin (create) and counselor
   (request-only per the permission matrix — read-only view is fine for
   this phase, don't build the "request" workflow yet).

Verify with tsc + oxlint, then summarize.
```

---

## Phase 5 — Notifications & Public Website Module

```
PHASE 5: Notification Module enhancements + public Website module.

Build:
1. Enhance src/components/layout/notification-center.tsx (check what
   exists first) to read from a richer NotificationTemplate-aware mock if
   one doesn't exist yet — add src/mock/notifications.ts if templates
   aren't already modeled.
2. src/features/website/ — a small set of public-facing marketing pages
   (landing, contact/inquiry form) that live OUTSIDE the AppShell (no
   sidebar/topbar) since they're meant to be public. Add a separate router
   branch in src/app/router.tsx for these, not nested under AppShell.
3. Public inquiry form should write to a local PublicInquiry mock list
   (client-state only) and show a success state — no real submission
   endpoint exists yet.

Verify with tsc + oxlint, then summarize.
```

---

## Notes for you (not for Claude Code)

- Run these in order — later phases assume earlier ones' routes/nav exist.
- After each phase, `npm run dev` and click through the new pages under
  each role (use the topbar role switcher) before starting the next phase.
- If a phase prompt produces something that conflicts with what's already
  in the dashboards, that's a signal to paste back the actual error/diff
  here rather than letting Claude Code guess — same rule as the backend
  track prompts.
