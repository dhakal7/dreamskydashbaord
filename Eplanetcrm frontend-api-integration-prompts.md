# eplanetcrm Frontend API Integration Prompts — Connecting Frontend to Dream-Sky Backend

This document contains step-by-step prompts to replace the mock data system (`src/mock/`) in **eplanetdashboard** with live API connections to the merged **dream-sky backend** (`Consultancy backend/dream-sky/`).

---

## Architecture Overview

- **Frontend:** Vite + React + TypeScript + Tailwind CSS + Zustand + React Router v6 + TanStack React Query + Axios.
- **Backend:** `dream-sky` (Express 5 + Prisma ORM + PostgreSQL).
- **Base URL:** `http://localhost:5001/api` (configurable via `VITE_API_BASE_URL`).
- **Response Format:**
  - **Success:** `{ success: true, message: "...", data: { ... } }`
  - **Error:** `{ success: false, code: "...", message: "..." }`
- **Auth Strategy:** JWT Bearer access tokens in Axios default headers / Zustand `auth-store`, refresh token via `/api/auth/refresh`.

---

## Prompt F0 — Master Context & Setup (Paste first in session)

```text
You are connecting the eplanetcrm React frontend (located in `eplanetdashboard/`) to the single merged Express backend (`Consultancy backend/dream-sky/`).

PROJECT CONTEXT:
1. Frontend uses Vite + React + TypeScript + Zustand + React Router + Axios + TanStack React Query.
2. Backend is running at `http://localhost:5001/api`.
3. Standard backend response envelopes:
   - Success: { success: true, message: string, data: any }
   - Error: { success: false, code: string, message: string }
4. Authentication uses Bearer JWT tokens. Login returns { token, user }. Refresh token is handled at POST /api/auth/refresh.

STRICT INTEGRATION RULES:
1. Do not break existing UI components, styling, or layouts. Only replace `src/mock/` imports with real React Query hooks or Axios services.
2. Store tokens securely in memory / Zustand `auth-store` and `localStorage` (for persistent session restoration).
3. Every API call must use a centralized Axios instance with response interceptors that format errors consistently using `AppError` / standard error toast notifications.
4. Keep TypeScript strict (`npx tsc --noEmit -p tsconfig.app.json` must pass cleanly after every phase).
5. Retain mock fallback mode behind a feature flag (`VITE_USE_MOCK_DATA=false` by default) during migration so UI tests remain stable.

Confirm you have read and understood these rules before starting Phase F1.
```

---

## Phase F1 — Axios Client, Auth Store & Real JWT Auth Integration

```text
PHASE F1: Build Axios API client & replace mock authentication with live JWT backend endpoints.

Source files to create/modify in `eplanetdashboard/`:
1. `src/lib/api-client.ts`:
   - Create centralized Axios instance with `baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'`.
   - Request interceptor: Attach `Authorization: Bearer <accessToken>` from `useAuthStore.getState().token`.
   - Response interceptor:
     - On 401 (Unauthorized), attempt silent refresh via `POST /api/auth/refresh`. If refresh succeeds, update token and retry original request. If fails, clear auth state and redirect to `/login`.
     - Unwrap `response.data.data` where appropriate, or return standard payload.
2. `src/store/auth-store.ts`:
   - Update state interface: `{ user: User | null, token: string | null, isAuthenticated: boolean, isLoading: boolean }`.
   - Add actions: `login(email, password)`, `logout()`, `fetchMe()`, `setToken(token)`.
   - Wire `login()` to `POST /api/auth/login`.
   - Wire `fetchMe()` to `GET /api/auth/me`.
   - Wire `logout()` to `POST /api/auth/logout`.
3. `src/features/auth/login-page.tsx`:
   - Replace dummy login logic with `authStore.login(email, password)`.
   - Handle loading states and error notifications on invalid credentials.

Verification:
- Run `npx tsc --noEmit -p tsconfig.app.json`.
- Test logging in with seeded user credentials (`admin@eplanet.com` / `password123`) against `dream-sky` server.
- Verify JWT token is saved, headers sent, and `/api/auth/me` returns current user profile with role.
```

---

## Phase F2 — Student & Pipeline Management Integration

```text
PHASE F2: Replace mock Student, Lead & Follow-Up data with live API endpoints using TanStack React Query.

Target Backend Endpoints:
- `GET /api/students` (query params: `page`, `limit`, `search`, `stage`, `branchId`, `counselorId`)
- `POST /api/students` (Create new lead/student)
- `GET /api/students/:id` (Student details with stage history and test scores)
- `PATCH /api/students/:id/stage` (Update pipeline stage)
- `GET /api/follow-ups` (List follow-ups, filter by counselor/status)
- `POST /api/follow-ups` (Log new follow-up)
- `GET /api/appointments` (List appointments)
- `POST /api/appointments` (Schedule appointment)

Tasks in `eplanetdashboard/`:
1. Create `src/api/student-api.ts`: API functions wrapping Axios calls for students, leads, and pipeline history.
2. Create `src/api/followup-api.ts` & `src/api/appointment-api.ts`.
3. Create React Query hooks in `src/hooks/use-students.ts`, `src/hooks/use-followups.ts`, and `src/hooks/use-appointments.ts`.
4. Update `src/features/students/` and `src/features/leads/`:
   - Replace direct `src/mock/entities.ts` imports with `useStudents()`, `useUpdateStudentStage()`, `useCreateStudent()`.
   - Wire Kanban board drag-and-drop to trigger `PATCH /api/students/:id/stage`.
5. Update `src/features/followups/` and `src/features/appointments/` to use real query hooks.

Verification:
- Run `npx tsc --noEmit -p tsconfig.app.json`.
- Verify student list populates from Postgres DB, filtering works, stage transitions persist on backend, and follow-ups display correctly.
```

---

## Phase F3 — Applications, Visa Cases & Document Uploads Integration

```text
PHASE F3: Wire Application tracking, Visa processing, and Document file uploads/downloads.

Target Backend Endpoints:
- `GET /api/applications`, `POST /api/applications`, `PATCH /api/applications/:id`
- `GET /api/visa-cases`, `POST /api/visa-cases`, `PATCH /api/visa-cases/:id`
- `GET /api/documents`
- `POST /api/documents/upload` (Multipart `FormData`: `file`, `studentId`, `category`)
- `GET /api/documents/:id/download`

Tasks in `eplanetdashboard/`:
1. Create `src/api/application-api.ts`, `src/api/visa-api.ts`, `src/api/document-api.ts`.
2. Create React Query hooks: `useApplications()`, `useVisaCases()`, `useDocuments()`, `useUploadDocument()`.
3. Update `src/features/applications/`:
   - Replace mock application records with live backend queries and status update mutations.
4. Update `src/features/visas/` or `src/features/students/components/student-visa-tab.tsx`:
   - Wire visa stage history and milestone updates to `/api/visa-cases`.
5. Update `src/features/documents/` or document upload modals:
   - Use `FormData` to send file uploads to `POST /api/documents/upload`.
   - Wire file download buttons to `GET /api/documents/:id/download`.

Verification:
- Run `npx tsc --noEmit -p tsconfig.app.json`.
- Verify uploading a document saves file to backend storage and metadata in DB; verify application status changes reflect immediately.
```

---

## Phase F4 — Commission, Class, Event & Notification Integration

```text
PHASE F4: Connect Track B merged modules (Commissions, Classes, Events, Notifications).

Target Backend Endpoints:
- `GET /api/commissions`, `GET /api/commission-rules`, `POST /api/commissions/:id/pay`
- `GET /api/classes`, `GET /api/classes/:id`, `POST /api/classes/:id/attendance`
- `GET /api/events`, `POST /api/events`, `PATCH /api/events/:id/status`
- `GET /api/notifications`, `PATCH /api/notifications/:id/read`

Tasks in `eplanetdashboard/`:
1. Create `src/api/commission-api.ts`, `src/api/class-api.ts`, `src/api/event-api.ts`, `src/api/notification-api.ts`.
2. Create React Query hooks in `src/hooks/`:
   - `useCommissions()`, `useCommissionRules()`, `usePayCommission()`
   - `useClasses()`, `useMarkAttendance()`
   - `useEvents()`, `useCreateEvent()`
   - `useNotifications()`, `useMarkNotificationRead()`
3. Replace mock data in:
   - `src/features/commissions/commission-ledger-page.tsx`
   - `src/features/classes/classes-page.tsx` & `class-detail-page.tsx`
   - `src/features/events/events-page.tsx`
   - `src/components/layout/notification-center.tsx`

Verification:
- Run `npx tsc --noEmit -p tsconfig.app.json`.
- Verify commission ledger reflects immutability snapshots from backend; verify attendance marking updates DB records.
```

---

## Phase F5 — University Catalog, Recommendation Engine & Public Inquiry Integration

```text
PHASE F5: Wire University search, Course recommendations, and Public inquiry website form.

Target Backend Endpoints:
- `GET /api/universities`, `GET /api/courses`
- `POST /api/recommendations/score` (Pass student ID & criteria -> returns score & match level: STRONG_MATCH / REACH / SAFETY)
- `POST /api/public/inquiries` (Unauthenticated public inquiry form submission)
- `GET /api/inquiries` (Super Admin inquiry view)

Tasks in `eplanetdashboard/`:
1. Create `src/api/university-api.ts`, `src/api/recommendation-api.ts`, `src/api/public-api.ts`.
2. Connect `src/features/universities/` & `src/features/courses/` to live catalog APIs.
3. Connect Recommendation view:
   - Send student GPA, budget, target country, test scores to `POST /api/recommendations/score`.
   - Render resulting safety/reach bucket recommendations.
4. Connect Public Website inquiry form (`src/features/website/`):
   - Wire form submit to `POST /api/public/inquiries` without needing authorization header.
   - Wire Super Admin inquiry inbox to `GET /api/inquiries`.

Verification:
- Run `npx tsc --noEmit -p tsconfig.app.json`.
- Verify public form posts inquiry successfully without auth; verify recommendation engine returns accurate match buckets.
```

---

## Phase F6 — End-to-End Verification & Mock Cleanup

```text
PHASE F6: Full end-to-end testing, error boundary validation, and mock data deprecation.

Tasks:
1. Audit all 6 role dashboards (`super_admin`, `front_desk`, `counselor`, `teacher`, `student`, `referral_agent`) to ensure all metrics and widgets derive data from live API hooks (`useAuthStore` & React Query).
2. Check for leftover mock imports (`grep -rn "src/mock" src/`).
3. Add environmental switch `VITE_USE_MOCK_DATA` in `src/lib/api-client.ts` as fallback if needed for offline development.
4. Verify error handling: test network offline mode, 401 token expiry, 403 forbidden access, and 500 internal server errors to ensure toast alerts display cleanly.
5. Run full build test: `npm run build` and `npx tsc --noEmit`.

Verification:
- Confirm zero TypeScript errors.
- Confirm production build compiles cleanly into `dist/`.
```
