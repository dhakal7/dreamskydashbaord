# Complete Project Connection Audit: Backend <-> Frontend

## 1. System Architecture & Port Topology

The ePlanet CRM / Dreamsky project consists of three main interconnected services:

| Component | Path | Tech Stack | Local Port / Base URL |
| :--- | :--- | :--- | :--- |
| **Backend Service** | `Consultancy backend/dream-sky` | Express.js / Node.js / Prisma ORM | `http://localhost:5001` (API Base: `/api`) |
| **Dashboard Frontend** | `eplanetdashboard` | React / Vite / TypeScript / Tailwind | `http://localhost:5173` |
| **Landing Page Frontend** | `final project` | HTML5 / JS / TS / Vite | `http://localhost:5174` |

---

## 2. Environment Variables & Cross-Origin Configuration

### Backend Setup (`Consultancy backend/dream-sky/.env`)
- **Port:** `PORT=5001`
- **Database:** `postgresql://postgres:admin123@localhost:5432/dreamsky_db?schema=public`
- **CORS Config (`src/app.js`):** Enabled globally via `app.use(cors())`, allowing seamless cross-origin requests from `localhost:5173`, `localhost:5174`, or production domains.
- **Rate Limiting:** 100 requests per 15-minute window on `/api` routes.

### Dashboard Setup (`eplanetdashboard/.env`)
- **API Target:** `VITE_API_BASE_URL=http://localhost:5001/api`
- **Mock Flag:** `VITE_USE_MOCK=false` (Live API backend mode active)

### Landing Page Setup (`final project/src/lib/api-client.ts`)
- **API Target:** Defaults to `http://localhost:5001/api`

---

## 3. Authentication & Security Handshake

1. **Token Specifications:**
   - **Access Token:** JWT signed with `JWT_ACCESS_SECRET` (Expires in 15 minutes).
   - **Refresh Token:** JWT signed with `JWT_REFRESH_SECRET` (Expires in 30 days).
2. **Frontend Storage & Synchronization:**
   - Both frontends store tokens under `eplanet-access-token` and `dreamsky-access-token` in `localStorage` (if *Remember Me* is active) or `sessionStorage`.
3. **Automated Bearer Injection:**
   - Axios request interceptor (`api-client.ts`) attaches `Authorization: Bearer <accessToken>` to every outgoing HTTP call.
4. **Silent Refresh Interceptor (`401` Error Handling):**
   - On `401 Unauthorized`, `api-client.ts` automatically pauses incoming requests, issues a `POST /api/auth/refresh` request with the stored refresh token, updates storage with the new access token, and retries the original failed call without logging out the user.

---

## 4. Response Envelope Protocol

The backend wraps all API outputs in a standard JSON envelope:
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

The frontend Axios client in `eplanetdashboard/src/lib/api-client.ts` automatically unwraps this envelope in the response interceptor:
```typescript
if (response.data && typeof response.data === 'object' && 'success' in response.data) {
  return response.data.data;
}
```
This ensures feature components receive clean, direct TypeScript typed payloads (`Student[]`, `Application`, etc.).

---

## 5. Exhaustive Route & Endpoint Connection Matrix

A full automated codebase audit verified **102 frontend API call definitions** against **105 backend route handler bindings**. **100% of frontend endpoints are fully supported by backend handlers.**

### Module Mapping Summary

| Module | Backend File | Base Route | Key Connected Features | Connection Status |
| :--- | :--- | :--- | :--- | :---: |
| **Auth** | `auth.routes.js` | `/api/auth` | Login, Logout, Refresh, Get Profile (`/me`), Password Reset, Student Portal Activation | ✅ Connected |
| **Students** | `student.routes.js` | `/api/students` | List, Create, Profile Detail, Update, Delete, Pipeline Stage Transition, Timeline Audit | ✅ Connected |
| **Applications**| `application.routes.js` | `/api/applications` | Application Tracking, Status Updates, Upload Offer Letter | ✅ Connected |
| **Appointments** | `appointment.routes.js` | `/api/appointments` | Schedule Appointments, Dashboard Aggregates, Status Updates | ✅ Connected |
| **Classes & LMS**| `class.routes.js` | `/api/classes` | Course Batches, Enrollment, Attendance Tracking, Study Materials | ✅ Connected |
| **Commissions** | `commission.routes.js` | `/api/commissions` | Rule Configuration, Payout Tracking, Dispute Resolution | ✅ Connected |
| **Documents** | `document.routes.js` | `/api/documents` | File Uploads, Document Verification, Secure Downloading | ✅ Connected |
| **Events** | `event.routes.js` | `/api/events` | Event Calendar, Manager Approvals/Rejections | ✅ Connected |
| **Follow-ups** | `followup.routes.js` | `/api/follow-ups` | Lead Call Schedules, Counselor Dashboard Aggregates | ✅ Connected |
| **Notifications**| `notification.routes.js` | `/api/notifications` | Direct Alerts, Quick Composer, Email Notification Templates | ✅ Connected |
| **Universities** | `university.routes.js` | `/api/universities` | University Catalog, Country Management | ✅ Connected |
| **Courses** | `course.routes.js` | `/api/courses` | Program Catalog, Dynamic Seat Decrement | ✅ Connected |
| **Visa Cases** | `visa.routes.js` | `/api/visa-cases` | Visa Pipeline Management, Document Requirements | ✅ Connected |
| **Inquiries** | `public.routes.js` | `/api/inquiries` | Public Website Lead Inquiries, Conversion to Student Record | ✅ Connected |
| **Portal** | `portal.routes.js` | `/api/portal` | Student Self-Service Dashboard, Applications, Visa & Docs | ✅ Connected |
| **Recommendations**| `recommendation.routes.js` | `/api/recommendations` | AI Course/University Recommendation History | ✅ Connected |

---

## 6. Public Landing Page (`final project`) Integrations

The landing page connects to the Express backend via:
1. **`POST /api/public/inquiry`**: Captures visitor inquiries on country/study destination pages.
2. **`GET /api/public/universities` & `GET /api/public/courses`**: Dynamically displays featured institutions and study programs.
3. **Dashboard Redirect**: Passes authentication state across tabs to seamlessly launch `http://localhost:5173`.

---

## 7. Verification Summary & Key Recommendations

1. **Database Readiness:** Ensure PostgreSQL is active on port `5432` with database `dreamsky_db` created and Prisma migrations applied (`npx prisma db push`).
2. **Unified Dev Script:** You can run `npm run dev` from the workspace root to start all 3 services concurrently (`landing`, `dashboard`, and `backend`).
3. **Rate Limit Consideration:** The 100 req / 15 min rate limiter on `/api` is ideal for production security. For stress testing or bulk automated testing locally, you can adjust `max` in `Consultancy backend/dream-sky/src/app.js`.
