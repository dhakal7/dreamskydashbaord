# Dream Sky Backend — Architecture & Troubleshooting Guide

> **Keep this file updated** whenever the backend structure, responsibilities, or important logic changes.

---

## Request Flow

Every API request passes through these layers in order. No layer skips another.

```
Client Request
     │
     ▼
  server.js          → starts the app, loads env vars
     │
     ▼
  app.js             → Express setup, global middleware (cors, json parser)
     │
     ▼
  routes/index.js    → base router, mounts module routers at /api/*
     │
     ▼
  routes/*.routes.js → defines HTTP method + path, applies auth/RBAC middleware
     │
     ▼
  middlewares/       → auth.middleware.js (verifies JWT, sets req.user)
                     → rbac.middleware.js (checks role permissions)
     │
     ▼
  controllers/       → extracts data from req, calls validator, calls service, sends response
     │
     ▼
  validators/        → validates input shape/types, throws 400 on bad data
     │
     ▼
  services/          → ALL business logic + Prisma DB queries
     │
     ▼
  prisma/index.js    → Prisma ORM singleton (pg adapter)
     │
     ▼
  PostgreSQL DB
```

---

## Folder & File Responsibilities

### `src/server.js`
- **Does**: Loads `dotenv`, imports `app.js`, starts HTTP server on PORT
- **Does NOT**: Contain routes, middleware, or any logic

### `src/app.js`
- **Does**: Creates Express app, applies global middleware (cors, express.json), mounts base router, defines 404 handler, defines global error handler
- **Does NOT**: Start the server or define individual routes

### `src/routes/`
| File | What it does |
|------|-------------|
| `index.js` | Base router — mounts all module routers and health check |
| `auth.routes.js` | Auth endpoints with `requireAuth`/`requireRole` per route |
| `student.routes.js` | Student CRUD + pipeline endpoints |
| `followup.routes.js` | Follow-up CRUD + student timeline + dashboard stats |
| `appointment.routes.js` | Appointment CRUD + status changes + conflict detection + dashboard |
| `document.routes.js` | Document upload, download, verify, CRUD |
| `application.routes.js` | Application CRUD + status transitions + offer recording + dashboard |
| `visa.routes.js` | Visa case CRUD + status transitions + dashboard |
| `portal.routes.js` | Student portal read-only views (profile, dashboard, apps, visa, docs, appointments, follow-ups) |

**Rules:**
- ✅ Define HTTP method + URL path
- ✅ Apply middleware (auth, RBAC)
- ✅ Call the correct controller function
- ❌ No business logic, DB queries, validation, or `req.body` processing

### `src/middlewares/`
| File | What it does |
|------|-------------|
| `auth.middleware.js` | `requireAuth` — verifies JWT, attaches `req.user`. `requirePasswordChanged` — blocks temp-password users |
| `rbac.middleware.js` | `requireRole(...roles)` — checks `req.user.role`. `requireOwnStudentPortal` — student data isolation |
| `upload.middleware.js` | Multer file upload + MIME validation + size limits (2MB images, 10MB PDFs) |

**Rules:**
- ✅ Read/verify tokens, check roles, attach data to `req`, call `next()` or throw
- ❌ No DB queries, business logic, or response sending

### `src/controllers/`
| File | What it does |
|------|-------------|
| `auth.controller.js` | Auth HTTP handlers (login, refresh, logout, me, changePassword, activatePortal) |
| `student.controller.js` | Student HTTP handlers (CRUD, pipeline, timeline) |
| `followup.controller.js` | Follow-up HTTP handlers (CRUD, student timeline, dashboard) |
| `appointment.controller.js` | Appointment HTTP handlers (CRUD, status, dashboard) |
| `document.controller.js` | Document HTTP handlers (upload, download, verify, CRUD) |
| `application.controller.js` | Application HTTP handlers (CRUD, status, offers, dashboard) |
| `visa.controller.js` | Visa case HTTP handlers (CRUD, status, dashboard) |
| `portal.controller.js` | Portal HTTP handlers (all read-only) |

**Rules:**
- ✅ Extract from `req.body` / `req.params` / `req.query` / `req.user`
- ✅ Call validator, call service, send response
- ❌ No business logic or DB calls

### `src/validators/`
| File | What it does |
|------|-------------|
| `auth.validator.js` | Validates login, changePassword, refreshToken, activatePortal |
| `student.validator.js` | Validates create, update, pipelineChange |
| `followup.validator.js` | Validates create, update (channel, direction, content) |
| `appointment.validator.js` | Validates create, update, statusChange |
| `document.validator.js` | Validates upload (studentId, type), verify (status) |
| `application.validator.js` | Validates create, update, statusChange, offer |
| `visa.validator.js` | Validates create (applicationId), statusChange |

**Rules:**
- ✅ Check required fields, types, formats (email regex, enum values)
- ✅ Throw `AppError.badRequest()` on invalid input
- ❌ No DB queries or business rules

### `src/services/`
| File | What it does |
|------|-------------|
| `auth.service.js` | Login, token refresh/rotation, logout, getMe, changePassword, activateStudentPortal |
| `student.service.js` | CRUD, search/filter, pipeline transitions, soft delete, timeline |
| `followup.service.js` | CRUD, student timeline, cross-student filtering, dashboard stats |
| `appointment.service.js` | CRUD, conflict detection, status transitions, dashboard stats |
| `document.service.js` | Upload pipeline (compress → encrypt → store), download (decrypt), CRUD, verify |
| `application.service.js` | CRUD, status transitions, offer recording (auto-ACCEPTED), dashboard stats |
| `visa.service.js` | CRUD, status transitions (auto-timestamps), dashboard stats. Linked to Application |
| `portal.service.js` | Read-only aggregation of Student, Application, Visa, Document, Appointment, Follow-up data + journey timeline |

**Rules:**
- ✅ ALL business logic and Prisma/DB queries
- ✅ Enforce business rules (unique email, valid transitions, scope filtering)
- ❌ No access to `req` or `res`

### `src/utils/`
| File | Purpose |
|------|---------|
| `apiError.js` | Custom `AppError` class (badRequest, unauthorized, forbidden, notFound, conflict, internal) |
| `response.util.js` | `sendSuccess()`, `sendCreated()` — standard response shape |
| `password.util.js` | `hashPassword()`, `comparePassword()`, `generateTempPassword()` |
| `jwt.util.js` | Sign/verify access+refresh tokens, hash tokens for DB storage |
| `encryption.util.js` | AES-256-GCM encrypt/decrypt for document files |
| `storage.util.js` | File I/O abstraction (local dev → swap to S3 for production) |

### `src/prisma/index.js`
- Singleton PrismaClient with `@prisma/adapter-pg`

### `.env`
- `PORT`, `NODE_ENV`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`

---

## Standard Response Shapes

```json
// Success
{ "success": true, "message": "...", "data": { ... } }

// Error
{ "success": false, "code": "ERROR_CODE", "message": "Human-readable message" }
```

---

## Troubleshooting Quick Reference

| Problem | Check First | File(s) |
|---------|-------------|---------|
| Server won't start | Missing env vars, port conflict | `server.js`, `.env` |
| `Cannot find module` | Missing npm install or wrong import | `package.json`, the failing import |
| `PrismaClient requires adapter` | Prisma singleton missing pg adapter | `src/prisma/index.js` |
| 401 Unauthorized | Token missing, expired, or malformed | `middlewares/auth.middleware.js` |
| 403 Forbidden | Role not in allowed list | `middlewares/rbac.middleware.js`, route file |
| 400 Validation Error | Bad request body | `validators/*.validator.js` |
| 404 Not Found (route) | Route not defined or not mounted | `routes/index.js`, `*.routes.js` |
| 404 Not Found (resource) | ID doesn't exist in DB | `services/*.service.js` |
| 409 Conflict | Duplicate unique field | `services/*.service.js` |
| 500 Internal Error | Unexpected crash | `app.js` error handler, then the service |
| DB connection error | Wrong DATABASE_URL or PG not running | `.env`, `src/prisma/index.js` |
| Schema out of sync | Migration not applied | `prisma/schema.prisma`, run `npx prisma db push` |
| Pipeline stage rejected | Invalid transition | `services/student.service.js` → `isValidTransition()` |
| Follow-up status wrong | Status is derived from `nextFollowUpAt` | `services/followup.service.js` |
| Appointment conflict | Double-booking counselor or student | `services/appointment.service.js` → `checkConflicts()` |
| Can't edit appointment | Only SCHEDULED status is editable | `services/appointment.service.js` → `updateAppointment()` |
| Upload rejected | Bad file type or oversized | `middlewares/upload.middleware.js` |
| Download corrupted | Wrong encryption key or file tampered | `.env` `DOCUMENT_ENCRYPTION_KEY`, `utils/encryption.util.js` |
| File not found on disk | File deleted or path mismatch | `uploads/` directory, `utils/storage.util.js` |
| Application status rejected | Invalid transition | `services/application.service.js` → `ALLOWED_TRANSITIONS` |
| Visa case status rejected | Invalid transition | `services/visa.service.js` → `ALLOWED_TRANSITIONS` |
| Visa from non-ACCEPTED app | Application must be ACCEPTED | `services/visa.service.js` → `createVisaCase()` |
| Student sees other's data | STUDENT role isolation | `middlewares/rbac.middleware.js` → `requireOwnStudentPortal` |

---

## What Goes Where — Decision Checklist

| Logic Type | Belongs In | NOT In |
|-----------|-----------|--------|
| HTTP method + URL | `routes/` | anywhere else |
| Is user logged in? | `middlewares/auth.middleware.js` | controller or service |
| Does user have permission? | `middlewares/rbac.middleware.js` | controller or service |
| Is request body valid? | `validators/` | controller or service |
| Extract req data + send response | `controllers/` | service or route |
| Business rules + DB queries | `services/` | controller or middleware |
| Hash password, sign JWT | `utils/` | service directly |
| Global error formatting | `app.js` error handler | individual routes |

---

## Active Modules

| Module | Route Prefix | Status |
|--------|-------------|--------|
| Health Check | `GET /api/health` | ✅ Done |
| Authentication | `/api/auth/*` | ✅ Done |
| Student Management | `/api/students/*` | ✅ Done |
| Follow-up | `/api/follow-ups/*` | ✅ Done |
| Appointment | `/api/appointments/*` | ✅ Done |
| Document Management | `/api/documents/*` | ✅ Done |
| Application | `/api/applications/*` | ✅ Done |
| Visa | `/api/visa-cases/*` | ✅ Done |
| Student Portal | `/api/portal/:studentId/*` | ✅ Done |

---

*Last updated: Student Portal Module completion*
