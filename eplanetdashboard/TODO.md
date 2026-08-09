# Implementation Progress

## Task 1: Teacher-specific Reports Page
- [x] `src/features/reports/reports-page.tsx` — Added teacher view with attendance trends + test results

## Task 2: RBAC & Nav Updates
- [x] `src/lib/rbac.ts` — Remove `students.view`, add `settings.manage` for teacher
- [x] `src/components/layout/nav-items.ts` — Remove `students`, add `settings` for teacher

## Task 3: Settings Page Role Gating
- [x] `src/features/settings/settings-page.tsx` — Added role-gated sections:
  - Profile + Password for all roles
  - Admin-only: Commission Setup with:
    - **Counselors**: Global commission rule (same for all counselors) — type/value/trigger
    - **Referral Agents**: Per-agent custom commission rules (individual type/value/trigger per agent) with activate/deactivate
  - Branch Management removed (for future)

## Task 4: Dashboard Role Rework Plan
- [ ] Front Desk Dashboard
  - Keep the mini calendar, appointment booking, lead creation, and student overview cards.
  - Refine the “Interested Leads” section into a conversion card that shows student summary details and a clear “Register as Student” action.
  - Ensure the dashboard continues to surface branch-level student/lead activity and fee queue data.

- [ ] Student Dashboard
  - Replace the current summary view with a profile-first layout for the logged-in student.
  - Show a read-only profile card with limited edit access: only profile photo changes should be allowed for the student themselves.
  - Add an issue-reporting area with comments/notes so students can report incorrect profile information.
  - Restrict the appointments area to the student’s own next appointment only.
  - Rework the applications section into card-based views with a detail view for a selected application.
  - Add document upload + history and a notes section for student-facing updates.

- [ ] Teacher Dashboard
  - Keep the overview focused on classes, attendance, and student progress.
  - Make class cards interactive so opening a class supports attendance submission and updates the attendance view immediately.
  - Add materials management for each class.
  - Allow teacher access to a student profile drill-down from class roster items showing attendance history and teacher notes/messages.
  - Keep the reports section focused on weekly/monthly attendance and test-result averages.

- [ ] Counselor Dashboard
  - Ensure the leads experience is scoped to leads assigned to the logged-in counselor.
  - Restrict stage-change actions so only front desk and super admin can update lead state.
  - Keep the rest of the counselor dashboard intact with student and follow-up visibility.

- [ ] Navigation & Access
  - Confirm that teacher and student roles have access to profile/settings entry points from the sidebar.
  - Ensure role-based permissions align with the requested behavior for profile editing, document upload, and lead-state changes.

- [ ] Implementation Order
  1. Front desk conversion flow and dashboard layout refinements.
  2. Student self-service dashboard and profile issue reporting.
  3. Teacher class attendance/materials/student message flow.
  4. Counselor lead-scoping and stage-change restrictions.
  5. QA pass for role-based navigation, permissions, and dashboard behavior.
