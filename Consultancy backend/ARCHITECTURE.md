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
| `index.js` | Base router — mounts all module routers (`/auth`, `/students`, etc.) and health check |
| `auth.routes.js` | Defines auth endpoints, applies `requireAuth`/`requireRole` per route |
| `student.routes.js` | Defines student CRUD + pipeline endpoints with appropriate middleware |

**Rules:**
- ✅ Define HTTP method + URL path
- ✅ Apply middleware (auth, RBAC)
- ✅ Call the correct controller function
- ❌ No business logic
- ❌ No DB queries
- ❌ No validation logic
- ❌ No `req.body` processing

### `src/middlewares/`
| File | What it does |
|------|-------------|
| `auth.middleware.js` | `requireAuth` — verifies JWT, attaches `req.user`. `requirePasswordChanged` — blocks users who must change password |
| `rbac.middleware.js` | `requireRole(...roles)` — checks `req.user.role`. `requireOwnStudentPortal` — ensures students only see their own data |

**Rules:**
- ✅ Read/verify tokens
- ✅ Check roles/permissions
- ✅ Attach data to `req` (e.g., `req.user`)
- ✅ Call `next()` or throw errors
- ❌ No DB queries (except reading user if needed)
- ❌ No business logic
- ❌ No response sending (only errors)

### `src/controllers/`
| File | What it does |
|------|-------------|
| `auth.controller.js` | Handles auth HTTP requests (login, refresh, logout, me, changePassword, activatePortal) |
| `student.controller.js` | Handles student HTTP requests (CRUD, pipeline, timeline) |

**Rules:**
- ✅ Extract data from `req.body`, `req.params`, `req.query`, `req.user`
- ✅ Call the validator
- ✅ Call the service
- ✅ Send the response using `sendSuccess` / `sendCreated`
- ❌ No business logic
- ❌ No DB queries
- ❌ No direct Prisma calls

### `src/validators/`
| File | What it does |
|------|-------------|
| `auth.validator.js` | Validates login, changePassword, refreshToken, activatePortal bodies |
| `student.validator.js` | Validates create, update, pipelineChange bodies |

**Rules:**
- ✅ Check required fields exist
- ✅ Check types and formats (email regex, string length)
- ✅ Throw `AppError.badRequest()` on invalid input
- ❌ No DB queries (don't check "does this email exist" — that's the service's job)
- ❌ No business rules

### `src/services/`
| File | What it does |
|------|-------------|
| `auth.service.js` | Login, token refresh/rotation, logout, getMe, changePassword, activateStudentPortal |
| `student.service.js` | CRUD, search/filter, pipeline transitions, soft delete, timeline |

**Rules:**
- ✅ ALL business logic lives here
- ✅ ALL Prisma/DB queries live here
- ✅ Enforce business rules (unique email, valid transitions, permissions)
- ✅ Return plain data objects
- ❌ No access to `req` or `res` (doesn't know about HTTP)
- ❌ No response formatting

### `src/utils/`
| File | What it does |
|------|-------------|
| `apiError.js` | Custom `AppError` class with factory methods (`badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `internal`) |
| `response.util.js` | `sendSuccess(res, {statusCode, message, data})` and `sendCreated()` helpers |
| `password.util.js` | `hashPassword()`, `comparePassword()`, `generateTempPassword()` using bcrypt |
| `jwt.util.js` | `signAccessToken()`, `signRefreshToken()`, `verifyAccessToken()`, `verifyRefreshToken()`, `hashToken()`, `refreshExpiresAt()` |

### `src/prisma/index.js`
- Creates a **singleton** PrismaClient with the pg driver adapter
- Uses `global` to prevent multiple instances during hot-reload
- Read `DATABASE_URL` from environment

### `src/config/index.js`
- Exports config values from env vars (PORT, NODE_ENV)

### `src/constants/index.js`
- Exports constant enums (ROLES, PIPELINE_STAGES) for use across the app

### `prisma/schema.prisma`
- The single source of truth for all database models and enums
- Currently has **31 models** (30 original + RefreshToken)

### `.env`
- `PORT`, `NODE_ENV`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`

---

## Standard Response Shapes

**Success:**
```json
{ "success": true, "message": "...", "data": { ... } }
```

**Error:**
```json
{ "success": false, "code": "ERROR_CODE", "message": "Human-readable message" }
```

All errors flow through the global error handler in `app.js`. Services throw `AppError` — the handler formats it.

---

## Troubleshooting Quick Reference

| Problem | Check First | File(s) |
|---------|-------------|---------|
| Server won't start | Missing env vars, port conflict | `server.js`, `.env` |
| `Cannot find module` | Missing npm install or wrong import path | `package.json`, the failing import |
| `PrismaClient requires adapter` | Prisma singleton not using pg adapter | `src/prisma/index.js` |
| 401 Unauthorized | Token missing, expired, or malformed | `middlewares/auth.middleware.js`, `utils/jwt.util.js` |
| 403 Forbidden | User's role not in the allowed list for this route | `middlewares/rbac.middleware.js`, the route file |
| 400 Validation Error | Bad request body (missing/invalid fields) | `validators/*.validator.js` |
| 404 Not Found (route) | Route not defined or not mounted | `routes/index.js`, the specific `*.routes.js` |
| 404 Not Found (resource) | ID doesn't exist in DB | The relevant `services/*.service.js` |
| 409 Conflict | Duplicate unique field (email, etc.) | The relevant `services/*.service.js` |
| 500 Internal Error | Unexpected crash — check the console log | `app.js` error handler, then the service |
| DB connection error | Wrong DATABASE_URL or PostgreSQL not running | `.env`, `src/prisma/index.js`, check `pg` service |
| Schema out of sync | Ran `db push` or migration didn't apply | `prisma/schema.prisma`, run `npx prisma db push` |
| Password issues | Bcrypt hash mismatch, wrong salt rounds | `utils/password.util.js` |
| Token expired too fast | Check JWT_ACCESS_EXPIRES_IN in .env | `.env` |
| Pipeline stage rejected | Invalid transition (backward move) | `services/student.service.js` → `isValidTransition()` |

---

## What Goes Where — Decision Checklist

> Before writing code, ask: "Which layer owns this responsibility?"

| Logic Type | Belongs In | NOT In |
|-----------|-----------|--------|
| "Which HTTP method and URL?" | `routes/` | anywhere else |
| "Is this user logged in?" | `middlewares/auth.middleware.js` | controller or service |
| "Does this user have permission?" | `middlewares/rbac.middleware.js` | controller or service |
| "Is the request body valid?" | `validators/` | controller or service |
| "Extract data from req and send response" | `controllers/` | service or route |
| "Business rules, DB reads/writes" | `services/` | controller or middleware |
| "Hash a password, sign a JWT" | `utils/` | service directly |
| "Global error formatting" | `app.js` error handler | individual routes |

---

## Active Modules

| Module | Phase | Status | Route Prefix |
|--------|-------|--------|-------------|
| Health Check | 2 | ✅ Done | `GET /api/health` |
| Authentication | 5 | ✅ Done | `/api/auth/*` |
| Student Management | 6 | ✅ Done | `/api/students/*` |

---

*Last updated: Phase 6 completion*
