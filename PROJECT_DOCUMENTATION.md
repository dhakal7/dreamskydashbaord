# DreamSky Education Consultancy — Project Documentation

> **Last Updated:** August 14, 2026
> **Audit Status:** Completed — 2 bugs found and fixed

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Sub-Project Breakdown](#3-sub-project-breakdown)
4. [Architecture & Connection Map](#4-architecture--connection-map)
5. [Backend API Reference](#5-backend-api-reference)
6. [Frontend Routes](#6-frontend-routes)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Database Schema Overview](#8-database-schema-overview)
9. [Environment Variables](#9-environment-variables)
10. [Email / SMTP Service](#10-email--smtp-service)
11. [Background Services](#11-background-services)
12. [Bugs Found & Fixed](#12-bugs-found--fixed)
13. [Known Issues & Warnings](#13-known-issues--warnings)
14. [Running Locally](#14-running-locally)
15. [Tech Stack Summary](#15-tech-stack-summary)

---

## 1. Project Overview

**DreamSky Education Consultancy** is a full-stack platform serving a Nepal-based overseas education consultancy. It consists of:

| Component | Purpose |
|-----------|---------|
| **dream-sky backend** | Main REST API (Node.js + Express + Prisma + PostgreSQL) |
| **eplanetdashboard** | Staff CRM dashboard (React + TypeScript + Vite) |
| **final project** | Public-facing landing website (React + TypeScript + Vite) |
| **eplanetbackend** | Legacy Track B backend (TypeScript, modules merged into dream-sky) |
| **Dreamsky/** | Static HTML pages for countries (UK, USA, Australia, Canada, NZ, Europe) |

The platform manages the full student lifecycle from **lead capture → counseling → application → visa → departure** along with staff, classes, commissions, events, and university/course databases.

---

## 2. Repository Structure

```
eplanetcrm3/
├── Consultancy backend/
│   └── dream-sky/                  ← Main backend (Node.js)
│       ├── src/
│       │   ├── app.js              ← Express app setup
│       │   ├── server.js           ← Entry point + notification poller
│       │   ├── routes/             ← 19 route files
│       │   ├── controllers/        ← 17 controller files
│       │   ├── services/           ← 16 service files
│       │   ├── middlewares/        ← Auth, RBAC, upload middleware
│       │   ├── prisma/             ← Prisma client singleton
│       │   └── utils/              ← JWT utils, AppError
│       └── prisma/
│           ├── schema.prisma       ← Full database schema (837 lines)
│           └── migrations/         ← Migration history
│
├── eplanetdashboard/               ← CRM frontend (React + TypeScript)
│   └── src/
│       ├── App.tsx                 ← Root app (QueryClient + Router)
│       ├── app/router.tsx          ← React Router (all routes)
│       ├── api/                    ← Axios wrappers (14 API modules)
│       ├── features/               ← 22 page-level feature modules
│       ├── store/                  ← Zustand stores (auth, ui, notifications)
│       ├── lib/                    ← api-client, rbac, role-map, query-client
│       └── types/index.ts          ← All shared TypeScript types
│
├── final project/                  ← Public landing site (React 18)
│   └── src/pages/HomePage.tsx
│
├── eplanetbackend/                 ← Legacy Track B backend (TypeScript)
│   └── src/modules/               ← Merged into dream-sky
│
├── Dreamsky/                       ← Static HTML country pages
│   ├── index.html, uk.html, usa.html, australia.html...
│   └── team.html, privacy.html, terms.html
│
└── package.json                    ← Root workspace config
```

---

## 3. Sub-Project Breakdown

### 3.1 Consultancy Backend — dream-sky

**Directory:** `Consultancy backend/dream-sky/`
**Port:** `5001`
**Entry Point:** `src/server.js`
**Type:** Node.js (CommonJS) + Express 5 + Prisma 7 + PostgreSQL

#### Services
| Service File | Responsibility |
|---|---|
| `auth.service.js` | Login, JWT, refresh token rotation, portal activation |
| `student.service.js` | Student CRUD, pipeline stages, lifecycle tracking |
| `application.service.js` | University application management |
| `appointment.service.js` | Scheduling, calendar integration |
| `followup.service.js` | Follow-up reminders and tracking |
| `document.service.js` | Encrypted document upload/storage |
| `visa.service.js` | Visa case tracking with checklist |
| `commission.service.js` | Commission rules engine + ledger |
| `class.service.js` | IELTS/PTE classes, enrollment, attendance |
| `event.service.js` | Events with approval workflow + email notifications |
| `notification.service.js` | IN_APP notification creation |
| `notification.poller.js` | Background job — fires event reminders every 60s |
| `email.service.js` | Nodemailer SMTP (welcome, invite, event emails) |
| `recommendation.scoring.js` | Student-to-university matching engine |
| `portal.service.js` | Student self-service portal |
| `user.service.js` | Staff user management |

#### Middleware Stack
| Middleware | Purpose |
|---|---|
| `requireAuth` | JWT Bearer token verification → sets `req.user` |
| `requirePasswordChanged` | Blocks access if `mustChangePassword` is true |
| `requireRole(...roles)` | RBAC factory — checks `req.user.role` |
| `requireOwnStudentPortal` | Students can only access their own data |
| Upload (Multer) | File upload handling |
| Helmet | HTTP security headers |
| CORS | Cross-origin (open in dev — restrict in prod) |
| Rate Limiter | 100 req/15 min prod, 10,000 in dev |

---

### 3.2 CRM Dashboard — eplanetdashboard

**Directory:** `eplanetdashboard/`
**Port:** `5173`
**API Base:** `http://localhost:5001/api`
**Type:** React 19 + TypeScript + Vite + TailwindCSS 4

#### Dual Mode
| Mode | `VITE_USE_MOCK` | Behaviour |
|---|---|---|
| **Mock** | `true` | Local demo data, no backend needed |
| **Real** | `false` | Calls dream-sky with JWT auth |

#### Zustand Stores
| Store | State Managed |
|---|---|
| `auth-store.ts` | Login/logout, JWT tokens, session restore, role switching |
| `ui-store.ts` | Theme (dark/light), sidebar, mobile nav, command palette |
| `notifications-store.ts` | In-app notification list and read state |

#### API Modules (`src/api/`)
`student-api.ts`, `application-api.ts`, `appointment-api.ts`, `followup-api.ts`, `document-api.ts`, `visa-api.ts`, `commission-api.ts`, `class-api.ts`, `event-api.ts`, `notification-api.ts`, `university-api.ts`, `recommendation-api.ts`, `partner-consultancy-api.ts`, `public-api.ts`

#### Feature Pages (`src/features/`)
| Feature | Route | Key Roles |
|---|---|---|
| Dashboard | `/dashboard/{role}` | All (role-specific view) |
| Students | `/students`, `/students/:id` | Counselor, Admin |
| Leads | `/leads` | Counselor, Admin |
| Follow-ups | `/follow-ups` | Counselor, Admin |
| Appointments | `/appointments` | All staff |
| Applications | `/applications/:id` | Counselor, Admin |
| Visa | `/visa/:id` | Counselor, Admin |
| Documents | `/documents` | All staff |
| Universities | `/universities` | All staff |
| Countries | `/countries` | All staff |
| Courses | `/courses` | All staff |
| Classes | `/classes/:id` | Teacher, Admin |
| Materials | `/materials` | Teacher, Admin |
| Commissions | `/commissions` | Admin, Agent |
| Referrals | `/referrals` | Admin, Agent |
| Commission Rules | `/commission-rules` | Super Admin only |
| Events | `/events` | All staff |
| Reports | `/reports` | Admin |
| Users | `/users` | Admin |
| Settings | `/settings` | Admin |
| Reception | `/reception` | Front Desk |

---

### 3.3 Landing Website — final project

**Directory:** `final project/`
**Port:** `5174`
**Type:** React 18 + TypeScript + Vite + TailwindCSS 3

Sections: HeroSection, DestinationsSection, UniversitiesSection, ServicesSection, WhyUsSection, TestPrepSection, FAQSection, ContactSection, AuthModal (Login/Signup/Consultation)

---

### 3.4 Track B Backend — eplanetbackend (Legacy)

**Directory:** `eplanetbackend/`
**Status:** LEGACY — all modules merged into dream-sky
**WARNING:** Do NOT run alongside dream-sky — both default to port 5001

---

### 3.5 Static HTML Pages — Dreamsky

**Directory:** `Dreamsky/`
**Type:** Plain HTML + TailwindCSS (served statically)

Pages: index, uk, usa, australia, canada, newzealand, europe, team, mission-vision, privacy, terms

---

## 4. Architecture & Connection Map

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser / Client                         │
│                                                             │
│  Landing Site (:5174)    CRM Dashboard (:5173)   Static HTML│
│       │                        │                            │
└───────┼────────────────────────┼────────────────────────────┘
        │ POST /api/inquiries     │ All /api/* + Bearer JWT
        ▼                        ▼
┌───────────────────────────────────────────────────────┐
│           dream-sky Backend  (localhost:5001)          │
│                                                       │
│  Express 5 + Helmet + CORS + Rate Limiter             │
│  requireAuth → JWT verify → req.user                  │
│  requireRole → RBAC check                             │
│  Controllers → Services → Prisma ORM                 │
│                      │                               │
└──────────────────────┼────────────────────────────────┘
                       │
          ┌────────────┴─────────────┐
          │  PostgreSQL              │  Gmail SMTP (port 587)
          │  dreamsky_db:5432        │  dreamskyadmission@gmail.com
          └──────────────────────────┘
```

---

## 5. Backend API Reference

**Local Base URL:** `http://localhost:5001/api`
**Production Base URL:** `https://pbkp.com.np/api`

### Auth Endpoints (`/auth`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | Public | Login all roles |
| POST | `/auth/refresh` | Public | Refresh token pair |
| POST | `/auth/logout` | Bearer | Revoke refresh token |
| GET | `/auth/me` | Bearer | Current user profile |
| POST | `/auth/change-password` | Bearer | Change password |
| POST | `/auth/activate-student-portal` | Bearer + COUNSELOR+ | Create student account |

### Module Endpoints
| Path Prefix | Auth | Notes |
|---|---|---|
| `/students` | Required | Full CRUD + pipeline stage changes |
| `/follow-ups` | Required | |
| `/appointments` | Required | |
| `/documents` | Required | File upload with encryption |
| `/applications` | Required | |
| `/visa-cases` | Required | |
| `/commissions` | Required | Rules engine + ledger |
| `/classes` | Required | Enrollment + attendance |
| `/events` | Required | Approval workflow |
| `/notifications` | Required | IN_APP + templates |
| `/universities` | Required | |
| `/courses` | Required | |
| `/recommendations` | Required | Scoring engine |
| `/partner-consultancies` | Required | B2B partners |
| `/users` | Required (Admin) | |
| `/portal` | Required (Student) | |
| `/public` + `/inquiries` | Public | Walk-in form |
| `/health` or `/` | Public | Health check |

---

## 6. Frontend Routes

| Path | Component | Guard |
|---|---|---|
| `/login` | LoginPage | Public |
| `/unauthorized` | UnauthorizedPage | Public |
| `/website` | LandingPage | Public |
| `/` | DashboardRedirect | Protected |
| `/dashboard/super-admin` | DashboardPage | RoleGuard |
| `/dashboard/frontdesk` | DashboardPage | RoleGuard |
| `/dashboard/counselor` | DashboardPage | RoleGuard |
| `/dashboard/teacher` | DashboardPage | RoleGuard |
| `/dashboard/student` | DashboardPage | RoleGuard |
| `/dashboard/referral` | DashboardPage | RoleGuard |
| `/students` | StudentsPage | Permission |
| `/students/:id` | StudentProfilePage | Permission |
| `/applications/:id` | ApplicationDetailPage | Permission |
| `/visa/:id` | VisaCaseDetailPage | Permission |
| `/classes/:id` | ClassDetailPage | Permission |
| `/commission-rules` | CommissionRulesPage | Admin only |

---

## 7. Authentication & Authorization

### JWT Lifecycle
```
1. POST /auth/login { email, password }
2. Server returns { accessToken (15min), refreshToken (30d) }
3. Client stores tokens (localStorage=remember, sessionStorage=no-remember)
4. Every request: Authorization: Bearer <accessToken>
5. On 401: auto-retry via POST /auth/refresh (token rotation)
6. On logout: refresh token deleted from DB, storage cleared
```

### Role Hierarchy
```
SUPER_ADMIN    → Full system access
BRANCH_ADMIN   → Mapped to super_admin frontend (temporary stopgap)
COUNSELOR      → Student management, follow-ups, applications
FRONT_DESK     → Reception, appointments
TEACHER        → Classes, attendance, materials
REFERRAL_AGENT → Referred students, commission ledger
STUDENT        → Own portal data only (read-mostly)
```

### Frontend Role Map
| Backend (DB) | Frontend |
|---|---|
| SUPER_ADMIN | super_admin |
| BRANCH_ADMIN | super_admin (stopgap) |
| COUNSELOR | counselor |
| FRONT_DESK | front_desk |
| TEACHER | teacher |
| STUDENT | student |
| REFERRAL_AGENT | referral_agent |

---

## 8. Database Schema Overview

**Database:** PostgreSQL — `dreamsky_db`
**ORM:** Prisma 7.9
**Schema:** `Consultancy backend/dream-sky/prisma/schema.prisma`

### Models Summary

**Identity & Access:** Branch, User, CounselorProfile, TeacherProfile, ReferralAgentProfile, RefreshToken

**Student Pipeline:** Student, PipelineStageHistory

**Business:** Application, OfferLetter, VisaCase, Appointment, FollowUp, Document, CommunicationLog, Commission, CommissionRule

**Academic:** University, Country, Course, Class, ClassEnrollment, ClassAttendance, ClassContent

**Platform:** Event, EventReminder, Notification, NotificationTemplate, PartnerConsultancy, AuditLog, Inquiry

### Pipeline Stages
```
LEAD → PROSPECT → ENROLLED → APPLIED → OFFER_RECEIVED → VISA_APPLIED → VISA_APPROVED → DEPARTED → LOST
```

---

## 9. Environment Variables

### dream-sky Backend
| Variable | Example Value |
|---|---|
| `NODE_ENV` | `development` |
| `PORT` | `5001` |
| `DATABASE_URL` | `postgresql://postgres:admin123@localhost:5432/dreamsky_db` |
| `JWT_ACCESS_SECRET` | 64+ char secret |
| `JWT_REFRESH_SECRET` | 64+ char secret |
| `JWT_ACCESS_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | `30d` |
| `DOCUMENT_ENCRYPTION_KEY` | 64-char hex string |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `dreamskyadmission@gmail.com` |
| `SMTP_PASS` | Gmail App Password |
| `EMAIL_FROM` | `DreamSky Education <dreamskyadmission@gmail.com>` |

### CRM Dashboard
| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `http://localhost:5001/api` (dev) / `https://pbkp.com.np/api` (prod) |
| `VITE_USE_MOCK` | `false` |
| `VITE_LANDING_URL` | `http://localhost:5174` |

---

## 10. Email / SMTP Service

**File:** `src/services/email.service.js`
**Provider:** Gmail via Nodemailer (port 587 STARTTLS)

| Function | Trigger |
|---|---|
| `sendWelcomeStudentEmail` | Student portal activated |
| `sendStaffInvitationEmail` | New staff user created |
| `sendEventNotificationEmail` | Event approved by admin |
| `sendNotificationEmail` | Generic notification dispatch |

> Email failures are always fire-and-forget — they log errors but never block the primary operation. If SMTP env vars are missing, emails are silently skipped.

---

## 11. Background Services

### Notification Poller
**File:** `src/services/notification.poller.js`
**Started:** After server listen in `src/server.js`
**Interval:** Every 60 seconds

**What it does:**
1. Queries `EventReminder` rows with `status=PENDING` and `scheduledFor <= now`
2. Finds all matching users by `audienceRoles` + branch filter
3. Creates `IN_APP` notifications for each user
4. Marks reminders as `SENT`
5. Uses `unref()` — does not prevent clean server shutdown

**Reminder Offsets:**
| Offset | When |
|---|---|
| ONE_MONTH | 1 month before event |
| ONE_WEEK | 1 week before event |
| ONE_DAY | 1 day before event |
| SAME_DAY | Same day at 08:00 AM |

---

## 12. Bugs Found & Fixed

### BUG 1 (CRITICAL) — Prisma datasource missing `url`
**File:** `Consultancy backend/dream-sky/prisma/schema.prisma`

The `datasource db` block was missing the mandatory `url` field. Without it, Prisma cannot locate or connect to PostgreSQL — the entire backend would fail.

**Before:**
```prisma
datasource db {
  provider = "postgresql"
}
```

**After (fixed):**
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

---

### BUG 2 (MINOR) — Duplicate localStorage calls in auth-store.ts
**File:** `eplanetdashboard/src/store/auth-store.ts`

During SSO token parsing at startup, `dreamsky-access-token`, `dreamsky-refresh-token`, and `dreamsky-user` were each written to localStorage **twice**. In the logout flow, 4 `removeItem` calls were also duplicated. These were copy-paste artifacts.

**Fixed:** All duplicate `setItem` and `removeItem` calls removed.

---

## 13. Known Issues & Warnings

### PORT CONFLICT — eplanetbackend vs dream-sky
Both `Consultancy backend/dream-sky/.env` and `eplanetbackend/.env` set `PORT=5001`. Running both simultaneously will cause a bind failure.

**Fix:** Do not run `eplanetbackend` — it is a legacy backend. If needed for testing, set its port to `5002`.

---

### CORS Open in Development
`app.js` uses `origin: true` which reflects any origin. Must be restricted in production:
```js
app.use(cors({
  origin: ['https://pbkp.com.np', 'https://your-crm-domain.com'],
  credentials: true
}))
```

---

### BRANCH_ADMIN maps to super_admin (frontend)
In `role-map.ts`, `BRANCH_ADMIN` maps to `super_admin` as a temporary stopgap. A dedicated branch-admin dashboard is an open action item.

---

### tempPassword returned in API response
`activateStudentPortal` returns `tempPassword` in the JSON response as a safety net. This should be removed once email delivery is confirmed reliable.

---

## 14. Running Locally

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Database `dreamsky_db` created

### Start Backend
```bash
cd "Consultancy backend/dream-sky"
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
# → Running on http://localhost:5001
```

### Start CRM Dashboard
```bash
cd eplanetdashboard
npm install
npm run dev
# → Running on http://localhost:5173
```

### Start Landing Website
```bash
cd "final project"
npm install
npm run dev
# → Running on http://localhost:5174
```

### Verify
- Backend health: `GET http://localhost:5001/health`
- Dashboard: `http://localhost:5173/login`
- Landing: `http://localhost:5174`

---

## 15. Tech Stack Summary

| Layer | Technology | Version |
|---|---|---|
| Backend Runtime | Node.js | 20+ |
| Backend Framework | Express | 5.x |
| ORM | Prisma | 7.9.x |
| Database | PostgreSQL | 15+ |
| Auth | JWT + bcryptjs | — |
| Email | Nodemailer | 9.x |
| File Upload | Multer | 2.x |
| Image Processing | Sharp | 0.35.x |
| Excel Export | xlsx | 0.18.x |
| Frontend Framework | React | 19.x (dashboard), 18.x (landing) |
| Language | TypeScript | 6.0 |
| Build Tool | Vite | 8.x |
| CSS Framework | TailwindCSS | 4.x (dashboard), 3.x (landing) |
| State Management | Zustand | 5.x |
| HTTP Client | Axios | 1.x |
| Data Fetching | TanStack React Query | 5.x |
| Tables | TanStack React Table | 8.x |
| Charts | Recharts | 3.x |
| Drag & Drop | DND Kit | — |
| Calendar | React Big Calendar | 1.x |
| Forms | React Hook Form + Zod | — |
| Animation | Framer Motion | 12.x |
| Icons | Lucide React | — |
| Toasts | Sonner | 2.x |
| UI Primitives | Radix UI | — |
| Security Headers | Helmet | 8.x |
| Rate Limiting | express-rate-limit | 8.x |

---

*Generated by project audit — August 14, 2026*
