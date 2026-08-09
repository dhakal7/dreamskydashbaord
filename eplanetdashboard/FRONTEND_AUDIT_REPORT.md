# Education Consultancy ERP/CRM Frontend Audit Report

**Audit date:** 2026-07-22  
**Scope:** Frontend source inspection, routing, authentication, role-based navigation, dashboards, ERP modules, student journey UI, shared components, enterprise UI, architecture, code quality, and build/lint validation.

This audit is based only on implementation that could be verified in the repository. Route names, mock types, documentation, and planned features were not counted as completed functionality unless a usable implementation exists.

## 1. Overall Completion

**Estimated frontend completion: 62%**

The project has a strong application shell and several genuinely functional workflows, but multiple routed modules are explicitly `ComingSoon` pages. Authentication, payments, finance, users, and several enterprise controls are still demo or placeholder implementations.

**Final verdict: 🟠 Development In Progress**

## 2. Phase Completion Table

| Phase | Status | Completion |
|---|---:|---:|
| Phase 1: Existing Project Analysis | ⚠️ Partial | 85% |
| Phase 2: Authentication & RBAC | ⚠️ Partial | 78% |
| Phase 3: Six Role Dashboards | ⚠️ Partial | 70% |
| Phase 4: ERP Modules | ⚠️ Partial | 35% |
| Phase 5: Student Journey UI | ⚠️ Partial | 58% |
| Phase 6: Enterprise UI Features | ⚠️ Partial | 58% |

## 3. Phase 1: Existing Project Analysis

**Status: ⚠️ Partial**

### Implemented

- Reusable application shell in [src/components/layout/app-shell.tsx](src/components/layout/app-shell.tsx)
- Reusable sidebar, topbar, mobile navigation, breadcrumbs, command palette, global search, and notification center
- Shared Card, Button, Badge, Input, Select, Dialog, Tabs, Progress, Skeleton, and Tooltip primitives
- Reusable [DataTable](src/components/shared/data-table.tsx) with sorting, pagination, row selection, and column visibility
- Reusable status badges, stepper, page headers, loaders, empty states, and error states
- Tailwind-based design tokens and light/dark theme variables in [src/index.css](src/index.css)
- Responsive utility classes throughout the application
- Lazy-loaded routes in [src/app/router.tsx](src/app/router.tsx)

### Partial or problematic

- Chart components are reusable within the dashboard but are not generalized into a broader chart abstraction.
- Several pages use locally duplicated card, badge, metric, and status styles.
- Shared components accept broad `any` types, particularly [src/components/shared/data-table.tsx](src/components/shared/data-table.tsx).
- The design language is generally consistent, but application detail pages use noticeably different spacing, typography, and card styling from the rest of the CRM.
- “Export”, “PDF”, “Filters”, “Save view”, and “Insights” controls are sometimes presentation-only.

## 4. Phase 2: Authentication & Role-Based Frontend

**Status: ⚠️ Partial**

| Requirement | Status | Evidence |
|---|---:|---|
| Login UI | ✅ | [src/features/auth/login-page.tsx](src/features/auth/login-page.tsx) |
| Protected routes | ✅ | [src/components/auth/route-guards.tsx](src/components/auth/route-guards.tsx) |
| Role guards | ✅ | `RoleGuard` and dashboard route restrictions |
| Role-based sidebar | ✅ | [src/components/layout/nav-items.ts](src/components/layout/nav-items.ts) |
| Role-based navigation | ✅ | Permission-filtered navigation matrix |
| Dynamic dashboards | ✅ | [src/features/dashboard/dashboard-page.tsx](src/features/dashboard/dashboard-page.tsx) |
| Permission-based UI | ⚠️ | Primarily applied to routes and navigation, not consistently to page actions |
| Unauthorized page | ✅ | [src/components/auth/unauthorized-page.tsx](src/components/auth/unauthorized-page.tsx) |
| Session handling | ⚠️ | LocalStorage demo session only |
| Logout flow | ⚠️ | Sidebar logout works; topbar “Log out” menu item has no handler |
| Real authentication | ❌ | Credentials are hard-coded demo credentials |

### Findings

- [src/store/auth-store.ts](src/store/auth-store.ts) uses `eplanet-demo-role` and `eplanet-authenticated` in localStorage.
- The login password is the shared demo password `eplanet-demo`.
- `setRole()` grants authentication immediately, so the role switcher is a development preview tool rather than a secure role transition.
- The topbar contains a second logout option that does not call `logout()`.

## 5. Phase 3: Six Role-Based Dashboards

All six dashboard components exist and are dispatched by the current role:

- [Super Admin Dashboard](src/features/dashboard/role-dashboards/super-admin-dashboard.tsx)
- [Front Desk Dashboard](src/features/dashboard/role-dashboards/front-desk-dashboard.tsx)
- [Counselor Dashboard](src/features/dashboard/role-dashboards/counselor-dashboard.tsx)
- [Teacher Dashboard](src/features/dashboard/role-dashboards/teacher-dashboard.tsx)
- [Student Dashboard](src/features/dashboard/role-dashboards/student-dashboard.tsx)
- [Referral Agent Dashboard](src/features/dashboard/role-dashboards/agent-dashboard.tsx)

**Status: ⚠️ Partial**

| Dashboard | KPI | Charts | Tables/Lists | Quick Actions | Notifications | Loading/Empty | Responsive |
|---|---:|---:|---:|---:|---:|---:|---:|
| Super Admin | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ |
| Front Desk | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Counselor | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Teacher | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Student | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Referral Agent | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |

### Findings

- Loading is provided at the route shell level through [src/components/shared/page-loader.tsx](src/components/shared/page-loader.tsx), not through role-specific data loading states.
- Several dashboard values are derived from seeded mock data.
- Front Desk’s “Today’s Appointments” statistic is hard-coded to `0` in [src/features/dashboard/role-selectors.ts](src/features/dashboard/role-selectors.ts), although the panel reads appointment state separately.
- The dashboard wrapper contains enterprise feature messaging and controls that are not fully functional.

## 6. Phase 4: ERP Module Matrix

| Module | Status | Findings |
|---|---:|---|
| Lead Management | ⚠️ Partial | Pipeline, table, search, filters, pagination, badges; Add Lead has no implementation and no detail/edit workflow |
| Student Management | ⚠️ Partial | List, profile, create dialog, filters, pagination, assignment; edit action is not wired |
| Reception | ❌ Missing | No reception module or route |
| Appointments | ⚠️ Partial | Calendar day/week/month views, filters, create/edit dialog; no dedicated details page or table pagination |
| Follow-ups | ⚠️ Partial | Calendar, timeline, list, filters, detail dialog; no complete create workflow |
| Teacher | ⚠️ Partial | Teacher data appears in dashboards/classes; no teacher management module |
| Language Classes | ⚠️ Partial | Classes list/detail, roster, attendance history, materials; Add Class is disabled |
| Attendance | ⚠️ Partial | Read-only attendance views exist inside class pages; no standalone attendance workflow or editing |
| Applications | ⚠️ Partial | List/detail, filters, pagination, stage changes, stepper; Add Application is not wired |
| Visa | ❌ Missing | Route is only a ComingSoon page |
| Documents | ❌ Missing | Route is only a ComingSoon page |
| Payments | ❌ Missing | No page, route, store, or payment workflow |
| Finance | ❌ Missing | No finance module |
| Referral | ⚠️ Partial | Referral agent dashboard and commission data exist; no dedicated referral management page |
| Commission | ⚠️ Partial | Ledger and read-only rules page; limited mutation and no full rule management workflow |
| Reports | ❌ Missing | Route is only a ComingSoon page |
| Notification Center | ⚠️ Partial | Local dropdown with seeded notifications; no persistence, routing, or dedicated notification page |
| Events | ⚠️ Partial | Upcoming/past lists and type filter; no create/edit/details workflow |
| Branch Management | ⚠️ Partial | List/detail and staff display; read-only, no branch CRUD |
| Users | ❌ Missing | No user administration module |
| Settings | ❌ Missing | Route is only a ComingSoon page |

### Explicit placeholder pages

- [src/features/visa/visa-page.tsx](src/features/visa/visa-page.tsx)
- [src/features/documents/documents-page.tsx](src/features/documents/documents-page.tsx)
- [src/features/universities/universities-page.tsx](src/features/universities/universities-page.tsx)
- [src/features/countries/countries-page.tsx](src/features/countries/countries-page.tsx)
- [src/features/courses/courses-page.tsx](src/features/courses/courses-page.tsx)
- [src/features/reports/reports-page.tsx](src/features/reports/reports-page.tsx)
- [src/features/settings/settings-page.tsx](src/features/settings/settings-page.tsx)

## 7. Phase 5: Student Journey UI

**Status: ⚠️ Partial**

| Journey Feature | Status | Evidence |
|---|---:|---|
| Student Timeline | ✅ | Profile Timeline tab |
| Pipeline View | ✅ | Leads pipeline |
| Status Tracker | ✅ | Application stepper and status badges |
| Application Progress | ✅ | Application detail page |
| Visa Progress | ⚠️ | Dashboard/profile visualization exists, but Visa module is missing |
| Payment Timeline | ⚠️ | Lifecycle milestone inferred from enrollment/application status |
| Document Progress | ⚠️ | Profile/dashboard summaries exist, but Documents module is missing |
| Interview Timeline | ⚠️ | Lifecycle stage inferred from visa checklist mock data |
| Activity Timeline | ✅ | Student activity/timeline tabs and shared activity panels |

The central lifecycle implementation is [src/features/students/lifecycle.ts](src/features/students/lifecycle.ts). It is useful as a presentation model, but several milestones are inferred rather than generated from dedicated payment, visa, or document transactions.

## 8. Phase 6: Enterprise UI Features

| Feature | Status | Findings |
|---|---:|---|
| Global Search | ✅ | Searches seeded students, leads, universities, and courses |
| Advanced Filters | ⚠️ | UI exists but controls are not connected to page filtering |
| Saved Filters/Views | ⚠️ | Static example views in [src/components/shared/saved-views.tsx](src/components/shared/saved-views.tsx) |
| Notification Center | ⚠️ | Local state only; no persistence or navigation |
| Command Palette | ⚠️ | Works for a small fixed list of routes |
| Dark Mode | ✅ | Zustand preference and document class toggle |
| Loading Skeletons | ✅ | Shared route-level loader |
| Error Pages | ✅ | Not-found, unauthorized, and reusable error states |
| Empty States | ✅ | Used broadly |
| Print Views | ⚠️ | Calls `window.print()` without a dedicated print layout |
| Export UI | ⚠️ | CSV export works; PDF, Excel, and some export actions are toast simulations |
| Responsive Improvements | ✅ | Responsive classes and mobile drawer exist |
| Accessibility | ⚠️ | Focus-visible styling and labels exist, but table sorting, modal controls, and several icon/action patterns need deeper review |
| Performance | ⚠️ | Lazy routes exist, but bundle warnings remain |

Enterprise toolbar controls in [src/components/shared/enterprise-toolbar.tsx](src/components/shared/enterprise-toolbar.tsx) include several non-functional actions:

- “Save view” only shows a toast
- “Filters” only shows a toast
- “PDF” only shows a toast
- “Insights” only shows a toast
- The “Excel” button exports CSV content with a `.csv` filename

## 9. UI Consistency Review

**Status: ⚠️ Partial**

### Strengths

- Consistent use of Tailwind design tokens
- Repeated page header, card, status badge, and table patterns
- Light and dark theme variables
- Consistent responsive grid patterns
- Shared button and form primitives

### Inconsistencies

- Application and class detail pages use larger, heavier headings and more bespoke spacing than list pages.
- Some pages use `shadow-sm`, others use `shadow-soft`, `shadow-card`, or no shadow.
- Status badges are sometimes shared components and sometimes locally-created spans with custom colors.
- Commission, branch, event, and application pages duplicate status pill styling.
- Some pages use `text-2xl font-bold`; others use the shared dashboard typography style.
- Repeated local card markup creates variation in border radius, padding, and background treatment.
- Some action buttons have icons while similar actions elsewhere are text-only.
- Animation use is inconsistent: dashboard cards and sidebar use Framer Motion, while other pages use ad hoc CSS or no transitions.
- Mobile responsiveness is mostly class-driven but has not been verified with automated viewport testing.

## 10. Architecture Problems

1. **Demo authentication is mixed into production-facing application structure.** The role switcher and localStorage session are useful for demos but should be isolated behind a development-only boundary.
2. **Route permissions and action permissions are uneven.** Routes are protected, but buttons such as Add, Edit, Delete, Mark Paid, and stage transitions are not consistently permission-gated.
3. **Multiple domain modules are represented only by routes and mock types.** Visa, Documents, Reports, Settings, Payments, Finance, Reception, and Users have no meaningful feature implementation.
4. **State management is fragmented between stores, local component state, and static mock data.** This makes it difficult to establish authoritative ownership for records and mutations.
5. **React Query is configured but not used for data fetching.** [src/App.tsx](src/App.tsx) creates a QueryClient, while the application continues to read seeded mock data and Zustand stores.
6. **Dashboard selectors contain presentation-oriented proxy logic.** Payment queues and some lifecycle milestones are inferred from lead/application status rather than domain records.
7. **The shared DataTable API is powerful but too loosely typed.** It uses `ColumnDef<TData, any>[]` and does not expose server-side pagination, loading, error, or controlled filter state.
8. **Feature page boundaries are inconsistent.** Some modules have stores and components, while others are one-file placeholders. There is no consistent module contract.

## 11. Code Quality Issues

### Duplicate code

- Local status badge implementations in commission, event, application, and branch pages
- Repeated KPI card markup across feature pages
- Repeated list-row layouts in dashboard and feature components
- Repeated card styling rather than consistently using shared composition components

### Broad typing

Notable `any` usage appears in:

- [src/components/shared/data-table.tsx](src/components/shared/data-table.tsx)
- [src/features/dashboard/components/charts.tsx](src/features/dashboard/components/charts.tsx)
- [src/features/students/components/profile-tabs/timeline-tab.tsx](src/features/students/components/profile-tabs/timeline-tab.tsx)
- [src/features/students/components/student-form-dialog.tsx](src/features/students/components/student-form-dialog.tsx)
- [src/features/appointments/components/appointment-dialog.tsx](src/features/appointments/components/appointment-dialog.tsx)

### Stub actions

- Add Lead
- Add Application
- Add Class
- Student Edit
- QR Code display
- PDF export
- Saved view persistence
- Smart Insights
- Topbar logout

### Lint warnings

`npm run lint` exits successfully but reports many Fast Refresh warnings because files export both React components and constants/functions. Main affected areas include:

- [src/app/router.tsx](src/app/router.tsx)
- [src/components/shared/status-badges.tsx](src/components/shared/status-badges.tsx)
- [src/components/ui/button.tsx](src/components/ui/button.tsx)
- [src/components/ui/badge.tsx](src/components/ui/badge.tsx)
- Multiple feature filter files

### Performance concerns

The production build succeeds, but Vite reports chunks larger than 500 kB:

- Dashboard chunk: approximately 450 kB
- Main index chunk: approximately 624 kB

The bundle warning is likely driven by dashboard imports, chart libraries, UI dependencies, and broad shared imports.

### Testing gap

- No test script exists in [package.json](package.json).
- No unit, integration, accessibility, or end-to-end test suite was found.
- Responsive behavior and role-specific workflows have not been automatically verified.

## 12. Validation Results

### Production build

Command:

```bash
npm run build
```

Result: **Passed**

TypeScript compilation and Vite production bundling completed successfully.

Vite reported a bundle-size warning for chunks larger than 500 kB.

### Lint

Command:

```bash
npm run lint
```

Result: **Passed with warnings**

The main warnings are Fast Refresh warnings caused by files exporting both React components and constants/functions.

### Tests

No test command is configured in [package.json](package.json), and no automated test suite was found during the audit.

## 13. Priority Tasks

### 🔴 Critical

1. Implement Visa, Documents, Payments, Finance, Users, Reports, and Settings modules.
2. Replace demo authentication with real session/token handling.
3. Fix the topbar logout action.
4. Add permission checks to create, edit, delete, payment, and workflow transition actions.
5. Add tests for protected routes, role navigation, dashboard access, and primary CRUD workflows.
6. Define authoritative data ownership instead of deriving payment, visa, and lifecycle state from mock records.

### 🟡 Recommended

1. Wire Add Lead, Add Application, Add Class, and Student Edit actions.
2. Replace static enterprise toolbar actions with real workflows.
3. Connect Advanced Filters and Saved Views to page state.
4. Create dedicated shared KPI, status, list-row, and filter primitives.
5. Remove or isolate the demo role switcher from production builds.
6. Split large dashboard and main bundles further.
7. Replace broad `any` usage with precise TanStack Table, Recharts, and form types.
8. Separate constants from component files to remove Fast Refresh warnings.
9. Add real notification persistence, read state, and navigation targets.
10. Add dedicated print layouts and true XLSX/PDF export behavior.

### 🟢 Optional

1. Add richer dashboard-specific charts for non-admin roles.
2. Add keyboard navigation and `aria-sort` behavior to tables.
3. Add dedicated detail pages for appointments, events, leads, and commissions.
4. Add visual regression testing across desktop and mobile breakpoints.
5. Add audit logging for all state mutations.

## 14. Final Verdict

**🟠 Development In Progress**

The project is not production-ready as a complete Education Consultancy ERP/CRM. The shell, routing, role-based dashboard structure, core student/lead/application/class/appointment workflows, reusable UI primitives, and responsive foundation are solid and compile successfully.

The main blocker is feature completeness: seven routed modules are explicit placeholders, several required ERP domains are absent entirely, and authentication, enterprise controls, and many mutations remain demo implementations.

## 15. Backend Authorization and Data Visibility Requirements

The frontend now applies role-based filtering as a secondary safeguard through
[src/lib/data-visibility.ts](src/lib/data-visibility.ts). This is useful for preventing
accidental rendering of unauthorized mock records, but it is not a security boundary.
The current frontend still receives complete in-memory mock collections, so a real
backend must enforce the same rules before records leave the API or database layer.

### 15.1 Source of truth

Every authenticated request should be evaluated using a server-side authorization
context derived from the validated session or access token. The client must never be
trusted to submit its own `role`, `branchId`, `counselorId`, `teacherId`, or `studentId`
as proof of access.

The server-side request context should contain at least:

```ts
type AuthorizationContext = {
	userId: string
	role: 'super_admin' | 'front_desk' | 'counselor' | 'teacher' | 'student' | 'referral_agent'
	branchId?: string
	counselorId?: string
	teacherId?: string
	studentId?: string
	referralAgentId?: string
}
```

These values should be loaded from the authenticated user and server-side staff
relationships. They should not be taken from URL parameters, query parameters, hidden
form fields, or localStorage values.

### 15.2 Query enforcement model

Authorization should be applied inside the repository/service query that loads records,
before pagination, sorting, aggregation, export, or search. Filtering only in the React
component is insufficient because a user could still receive restricted data through:

- Browser developer tools
- Direct API requests
- Export endpoints
- Detail URLs with guessed IDs
- Dashboard aggregate endpoints
- Search or autocomplete endpoints
- Cached query responses

A recommended service pattern is:

```ts
function applyVisibility<T>(query: Query<T>, auth: AuthorizationContext) {
	switch (auth.role) {
		case 'super_admin':
			return query
		case 'front_desk':
			return query.where('branch_id', auth.branchId)
		case 'counselor':
			return query.where('counselor_id', auth.counselorId)
		case 'teacher':
			return query.where('class_id', 'in', classIdsForTeacher(auth.teacherId))
		case 'student':
			return query.where('student_id', auth.studentId)
		case 'referral_agent':
			return query.where('referral_agent_id', auth.referralAgentId)
		default:
			throw new ForbiddenError()
	}
}
```

The exact implementation may differ by database, but the important property is that
every collection has a mandatory server-side visibility scope and uses deny-by-default
behavior when the authorization relationship is missing.

### 15.3 Required record scopes by role

| Role | Required backend scope |
|---|---|
| Super Admin | All branches and all authorized CRM records |
| Front Desk | Records whose branch matches the authenticated user's assigned branch |
| Counselor | Records assigned to the authenticated counselor, including their students, leads, appointments, follow-ups, applications, visa cases, and commissions |
| Teacher | Assigned classes and records belonging to students enrolled in those classes; no counseling, finance, or unrelated teacher data |
| Student | Records whose `student_id` equals the authenticated student's ID |
| Referral Agent | Records whose referral or commission ownership equals the authenticated referral agent's ID |

Branch filtering should be based on a normalized branch relationship, not only on a
denormalized display name. Counselor and teacher branch membership should also be
validated server-side so a stale or manipulated relationship cannot cross branch
boundaries.

### 15.4 Endpoint-specific requirements

The following API behaviors are required before this CRM can claim production-grade
data visibility:

| Endpoint category | Backend requirement |
|---|---|
| Students | Apply role scope to list, search, detail, export, and aggregate endpoints |
| Leads | Apply branch or counselor ownership scope to list, search, detail, export, and pipeline totals |
| Appointments | Return all for Super Admin, branch appointments for Front Desk, own appointments for Counselors and Students, teaching schedule only for Teachers, and none for Referral Agents unless explicitly assigned |
| Follow-ups | Apply branch scope for Front Desk and counselor ownership for Counselors; do not return other counselors' reminders |
| Applications | Scope by assigned counselor or authorized student ownership; detail endpoints must repeat the check |
| Visa cases | Scope by assigned counselor or authorized student ownership; checklist and progress subresources need the same check |
| Documents | Scope by authorized student ownership; file download and preview URLs must be protected independently |
| Payments and finance | Scope by authorized student, branch, or finance permission; never rely on a filtered frontend table |
| Classes | Scope by assigned teacher or enrolled student; roster, attendance, assignments, and materials require class authorization |
| Commissions | Scope by authenticated earner for Counselors and Referral Agents; only authorized administrators can view cross-user ledgers or mark records paid |
| Referrals | Scope by authenticated referral agent unless the user has an explicit administrative permission |
| Search | Restrict searchable entity types and apply the same record scope as normal list endpoints |
| Dashboards | Calculate counts, totals, charts, and recent activity from already-scoped queries |

An unauthorized detail request should return a consistent `404` or `403` according to
the API security policy. A `404` is often preferable for object endpoints because it
does not reveal whether another user's record exists. The response must not contain a
partial record, display name, count, or metadata that leaks the protected object.

### 15.5 Search, calendar, and export protections

Search is an especially high-risk bypass because it can expose records even when the
main list page is filtered. Search endpoints should:

1. Derive allowed entity types from server-side role permissions.
2. Apply ownership or branch predicates before text matching.
3. Limit returned fields to the minimum required for the result row.
4. Enforce pagination and rate limits.
5. Apply the same scope to autocomplete, global search, command actions, and exports.

Calendar endpoints must scope events before date-range aggregation. A Counselor must
not receive another counselor's event and then rely on the UI to hide it. The same
rule applies to CSV/PDF/XLSX exports, dashboard charts, calendar feeds, notifications,
and any websocket or realtime subscription.

### 15.6 Mutation and authorization checks

Read visibility alone is not enough. Every mutation must authorize both the operation
and the target record. Examples include:

- A counselor can update only their assigned leads, students, follow-ups, applications,
	and visa cases, unless a separate administrative permission exists.
- Front Desk can create or update operational records only inside their assigned branch.
- A teacher can update attendance or assignments only for their assigned classes.
- A student cannot edit counselor-owned workflow fields, payment status, visa decisions,
	or another student's records.
- A Referral Agent can view or update only explicitly supported referral fields and can
	never mark another agent's commission as paid.
- Mark-paid, delete, reassign, export, bulk-update, and stage-transition actions must
	be checked server-side even if the corresponding button is hidden in React.

The server should use transactions for reassignment and ownership-changing operations.
Audit records should capture the actor, target record, previous owner, new owner,
authorization decision, timestamp, and request correlation ID.

### 15.7 Caching and response handling

Role-scoped data must not be stored in a shared cache without a user or authorization
scope in the cache key. Query keys should include the authenticated user or an equivalent
permission scope, and logout or role changes should clear cached protected data.

API responses should avoid returning unrestricted embedded relationships. For example,
an authorized application response must not embed a counselor, student, payment, or
document object that the requesting user is not independently allowed to view.

### 15.8 Required backend test coverage

Before production release, add authorization tests for every role and every high-risk
endpoint. At minimum, tests should verify:

- A Front Desk user cannot read another branch's student, lead, appointment, follow-up,
	document, or payment.
- A Counselor cannot read another counselor's student, lead, appointment, calendar,
	follow-up, task, performance, commission, application, or visa case.
- A Teacher cannot read counseling records or another teacher's classes and schedules.
- A Student cannot search, detail, export, or infer the existence of another student.
- A Referral Agent cannot read another agent's referrals or commissions.
- Detail, search, dashboard, aggregate, export, download, and realtime endpoints all
	enforce the same policy.
- Changing a client-supplied role or ownership identifier does not expand access.
- Unauthorized mutations are rejected and produce an audit event where applicable.

The frontend visibility helpers should also receive unit tests as a defense-in-depth
check, but passing those tests must never be treated as proof that backend authorization
is complete.

### 15.9 Implementation handoff

The next backend implementation task should be to create a shared authorization layer
used by every repository and endpoint, then replace direct collection reads with scoped
service methods. The frontend should consume those scoped API responses through React
Query, keep the existing visibility helpers as a rendering safeguard, and display a
generic unauthorized or not-found state when a scoped API returns no accessible record.

Until this backend work is complete, the role-based data visibility implementation is
**frontend defense in depth only** and must not be represented as complete security or
production authorization.
