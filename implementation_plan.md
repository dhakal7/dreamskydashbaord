# Issue Analysis & Fix Plan

## Status Overview

| # | Issue | Status |
|---|-------|--------|
| 1 | Admit Student — searchable student picker | ✅ Already done |
| 2 | Capture List & Admitted Students — separate sections | ✅ Already done |
| 3 | Fees & Payments — Delete + Email from fee list | ✅ Already done |
| 4 | Lead → Student conversion — compulsory fields | 🔴 **Needs fix** |
| 5 | Lead stage drag-and-drop | ✅ Already done |
| 6 | Documents — upload slow, display broken | ✅ Fixed in previous session |
| 7 | EPT & IELTS/PTE instructor access | 🟡 **Partially done — needs enhancement** |

---

## ✅ Issues Already Fixed — Details

### Issue 1 — Admit Student: Searchable Student Picker
The "Add Student Fee" modal in `fee-management-panel.tsx` already uses a `<SearchableStudentPicker>` component (line 674) that supports typing to filter students by name, email, or phone. **No change needed.**

### Issue 2 — Capture List & Admitted Students: Separate Sections
`classes-page.tsx` already has two separate tab sections:
- **`batches`** tab — Admitted/enrolled class batches
- **`capture`** tab — Class inquiry-only list (students not applying for admission)

`sectionTab` state toggles between them on line 75. **No change needed.**

### Issue 3 — Fees: Delete & Email
`fee-management-panel.tsx` already has:
- A **Delete** button on every fee row (line 639–647) with confirmation dialog
- A **Send Mail** button for unpaid/due students (line 627–637)

Both are fully wired to the API (`DELETE /payments/:id`, `POST /payments/:id/remind`). **No change needed.**

### Issue 5 — Lead Stage Drag-and-Drop
`leads-pipeline.tsx` already uses `@dnd-kit/core` with `MouseSensor` and `TouchSensor`. Leads can be dragged between **New → Contacted → Counseling → Interested** columns with optimistic updates. **No change needed.**

### Issue 6 — Documents: Upload & Display
Fixed in the previous session:
- Critical decrypt bug fixed (documents now viewable)
- Multer crash on multiple files fixed
- Upload timeout increased to 120s
- Inline error display added to dialog

---

## 🔴 Issue 4 — Lead → Student Conversion: Make Fields Optional

### What's Wrong
When converting a Lead to a full Student record, `student-form-dialog.tsx` enforces a 5-step Zod schema with many **required** fields:

| Field | Currently | Should Be |
|-------|-----------|-----------|
| Email | Required (valid email) | Optional |
| Date of Birth | Required | Optional |
| Passport Number | Required | Optional |
| Address | Required | Optional |
| Academic Records | Min 1 required | Optional (0 allowed) |
| Parent/Guardian | Min 1 required | Optional |
| Budget USD | Min $1,000 required | Optional |
| Preferred Countries | Min 1 required | Optional |

Staff cannot save a student record if they only have the name and phone at the time of walk-in conversion. This blocks the workflow.

### Proposed Changes

#### [MODIFY] [student-form-dialog.tsx](file:///Users/suyogdhakal/Desktop/eplanetcrm3%202/eplanetdashboard/src/features/students/components/student-form-dialog.tsx)

Relax the Zod schema so only **Name** and **Phone** are required. Everything else becomes optional. The step validation will also be updated so users can proceed past each step without being blocked.

**New required-only fields:**
- `name` — still required (min 2 chars)
- `phone` — still required (min 10 digits)

**Fields becoming optional:**
- `email` — optional
- `dob` — optional
- `gender` — optional (default: skip)
- `nationality` — optional
- `passportNumber` — optional
- `address` — optional
- `academics` — optional array (min 0)
- `englishTestType` — optional
- `preferredCountries` — optional (min 0)
- `budgetUsd` — optional
- `parents` — optional (min 0)

---

## 🟡 Issue 7 — EPT & IELTS/PTE Instructor Access

### What's Wrong

The `teacher` role in `rbac.ts` (line 57) currently has very limited permissions:
```
teacher: ['dashboard.view', 'leads.view', 'classes.view', 'reports.view', 'settings.manage', 'events.view']
```

Teachers can **view** classes but **cannot**:
- Add new enrollments (`classes.manage` is missing from `teacher` role)
- View student details (`students.view` is missing)
- Mark attendance (gated by `classes.manage` in the classes page)
- Add students to the Capture List (gated in the UI by role check)

Additionally, the classes page does not distinguish between **EPT** and **IELTS/PTE** instructors. All teachers see the same classes regardless of their subject specialization.

### Proposed Changes

#### [MODIFY] [rbac.ts](file:///Users/suyogdhakal/Desktop/eplanetcrm3%202/eplanetdashboard/src/lib/rbac.ts)
- Add `students.view` and `classes.manage` to the `teacher` role so instructors can:
  - View enrolled student profiles
  - Add/remove enrollments directly
  - Mark class attendance

#### [MODIFY] [classes-page.tsx](file:///Users/suyogdhakal/Desktop/eplanetcrm3%202/eplanetdashboard/src/features/classes/classes-page.tsx)
- Add a `canManageEnrollments` permission check (`classes.manage`)
- Show "Enroll Student" and "Add to Capture List" buttons to teachers with this permission
- Filter classes shown to a teacher by their `linkedId` (teacherId match) — so EPT instructors only see EPT classes and IELTS/PTE instructors only see their own classes

#### [MODIFY] [classes/selectors.ts](file:///Users/suyogdhakal/Desktop/eplanetcrm3%202/eplanetdashboard/src/features/classes/selectors.ts)
- Verify/update `getClassesForRole()` to properly filter classes by teacher's linked ID when role is `teacher`

---

## Implementation Scope

The two remaining fixes are **small and safe** — they touch only 3 files total:

| File | Change | Risk |
|------|--------|------|
| `student-form-dialog.tsx` | Relax Zod schema — only name & phone required | Low — additive only, no data deleted |
| `rbac.ts` | Add `students.view` + `classes.manage` to `teacher` | Low — grants access, doesn't remove anything |
| `classes-page.tsx` | Show enrollment buttons for teachers with `classes.manage` | Low — UI-only gating |

> [!IMPORTANT]
> **Confirm the teacher role change:** Adding `classes.manage` to `teacher` means ALL users with role `teacher` can enroll students. If you want EPT and IELTS/PTE to be **separate roles** (so each only sees their own subject's classes), let me know and I'll add a `ept_teacher` and `ielts_pte_teacher` role. Otherwise the current single `teacher` role approach with filtering by `linkedId` is used.

> [!IMPORTANT]
> **Student form optional fields:** Making all fields optional means staff could create minimal records (name + phone only). This is intentional per your request. The backend API for student creation will also need to allow optional fields — should I check and update the backend validation as well?

Approve to proceed with implementing both Issue 4 and Issue 7 fixes.
