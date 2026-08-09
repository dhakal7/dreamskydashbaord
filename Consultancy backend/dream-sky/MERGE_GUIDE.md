# Track A → Track B: Complete Merge & Handoff Guide

> **Project:** Dream Sky Consultancy Management System  
> **Date:** August 3, 2026  
> **From:** Track A Developer (Core Student Pipeline)  
> **To:** Track B Developer (User Management, Branch, Payments, Notifications)  
> **Purpose:** Step-by-step guide for merging Track A into Track B's work

---

## Is Track A Ready to Merge?

**Short answer: Almost, but NOT YET.**

There are **4 issues that must be fixed before sharing the code**. None of them are complex, but all of them will cause real problems if left unfixed.

### Issue 1: Many Track A Files Are NOT Committed to Git

**This is the most urgent problem.** Running `git status` reveals that 25+ source files created during Phase 5-8 (Appointments, Documents, Applications, Visa, Portal) are still untracked:

```
?? src/controllers/application.controller.js
?? src/controllers/appointment.controller.js
?? src/controllers/document.controller.js
?? src/controllers/portal.controller.js
?? src/controllers/visa.controller.js
?? src/middlewares/upload.middleware.js
?? src/routes/application.routes.js
?? src/routes/appointment.routes.js
?? src/routes/document.routes.js
?? src/routes/portal.routes.js
?? src/routes/visa.routes.js
?? src/services/application.service.js
?? src/services/appointment.service.js
?? src/services/document.service.js
?? src/services/portal.service.js
?? src/services/visa.service.js
?? src/utils/encryption.util.js
?? src/utils/storage.util.js
?? src/validators/application.validator.js
?? src/validators/appointment.validator.js
?? src/validators/document.validator.js
?? src/validators/visa.validator.js
?? ARCHITECTURE.md
```

If you push or zip right now, **Track B will only get half the code**. You must commit everything first.

### Issue 2: `uploads/` Directory Missing from `.gitignore`

The encrypted student documents stored in `uploads/` will be committed to git if you run `git add .`. This is a **data leak risk**.

**Fix:** Add `uploads/` to `.gitignore` before committing.

### Issue 3: No `.env.example` File

Your friend will have no idea what environment variables are needed. The real `.env` is (correctly) gitignored, but without an example file, Track B cannot set up their environment.

**Fix:** Create a `.env.example` with all variable names (no real values).

### Issue 4: `requirePasswordChanged` Middleware Not Attached

The middleware is defined in `auth.middleware.js` but never used in any route file. A student who receives a temporary password via portal activation can skip the password change and access all protected endpoints. Track B will inherit this security gap.

**Fix:** Apply it to the route-level or note it as a known issue for Track B to handle during integration.

---

## Part 1: Preparing Track A Before Sharing

Follow these steps IN ORDER before giving anything to your friend.

### Step 1: Fix `.gitignore`

Add these entries to the bottom of your `.gitignore`:

```
# Uploaded student documents (encrypted, local storage)
uploads/

# Test scripts (optional - Track B may want to see them)
# scripts/

# IDE / editor folders
.claude/
.windsurf/
.agents/
```

### Step 2: Create `.env.example`

Create a file called `.env.example` at the project root:

```env
# ─── Server ───────────────────────────────────────────────
NODE_ENV=development
PORT=5000

# ─── Database ─────────────────────────────────────────────
# PostgreSQL connection string
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/dreamsky_db?schema=public"

# ─── JWT Secrets ──────────────────────────────────────────
# Must be long, random strings. Different for access vs refresh.
JWT_ACCESS_SECRET=your-access-secret-minimum-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-minimum-32-chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# ─── Document Encryption ─────────────────────────────────
# Must be exactly 64 hex characters (32 bytes for AES-256)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
DOCUMENT_ENCRYPTION_KEY=your-64-char-hex-key-here
```

### Step 3: Commit ALL Track A Files

```bash
cd dream-sky

# Stage everything
git add .

# Review what you are about to commit
git status

# Make sure uploads/ is NOT listed (if it exists)
# Make sure .env is NOT listed
# Make sure node_modules/ is NOT listed

# Commit
git commit -m "Track A complete: Auth, Student, Follow-up, Appointment, Document, Application, Visa, Portal"
```

### Step 4: Verify the Commit is Complete

```bash
# This should show NO untracked source files
git status

# This should list ALL your source files
git ls-files src/
```

Verify these files appear in the commit:

| Must be committed | Check |
|---|---|
| `src/controllers/application.controller.js` | |
| `src/controllers/appointment.controller.js` | |
| `src/controllers/document.controller.js` | |
| `src/controllers/portal.controller.js` | |
| `src/controllers/visa.controller.js` | |
| `src/middlewares/upload.middleware.js` | |
| `src/routes/application.routes.js` | |
| `src/routes/appointment.routes.js` | |
| `src/routes/document.routes.js` | |
| `src/routes/portal.routes.js` | |
| `src/routes/visa.routes.js` | |
| `src/services/application.service.js` | |
| `src/services/appointment.service.js` | |
| `src/services/document.service.js` | |
| `src/services/portal.service.js` | |
| `src/services/visa.service.js` | |
| `src/utils/encryption.util.js` | |
| `src/utils/storage.util.js` | |
| `src/validators/application.validator.js` | |
| `src/validators/appointment.validator.js` | |
| `src/validators/document.validator.js` | |
| `src/validators/visa.validator.js` | |
| `ARCHITECTURE.md` | |
| `.env.example` | |

---

## Part 2: How to Share the Code with Track B

### Option A: GitHub / GitLab (Recommended)

This is the cleanest approach for collaboration.

```bash
# 1. Create a new repo on GitHub (private recommended)
#    Name it: dream-sky-backend

# 2. Add the remote
git remote add origin https://github.com/YOUR-USERNAME/dream-sky-backend.git

# 3. Push your Track A code to main
git push -u origin main

# 4. Share the repo URL with your friend
# 5. Add your friend as a collaborator on GitHub:
#    Settings → Collaborators → Add your friend's GitHub username
```

Your friend then:

```bash
# Clone the repo
git clone https://github.com/YOUR-USERNAME/dream-sky-backend.git
cd dream-sky-backend

# Create a new branch for Track B work
git checkout -b track-b/core-modules
```

### Option B: USB Drive / File Share (Simple but Less Safe)

```powershell
# Create a clean archive (no node_modules, no uploads, no .env)
Compress-Archive -Path @(
    "prisma",
    "src",
    "scripts",
    "package.json",
    "package-lock.json",
    ".gitignore",
    ".env.example",
    "ARCHITECTURE.md",
    "MERGE_GUIDE.md"
) -DestinationPath "dream-sky-track-a.zip"
```

Give the ZIP to your friend. They extract it, then:

```bash
cd dream-sky-backend
npm install
# Copy .env.example to .env and fill in real values
cp .env.example .env
npx prisma generate
npx prisma migrate dev
```

---

## Part 3: Git Workflow for the Merge

### Branch Strategy

```
main (or master)
  ├── track-a/complete    ← Your Track A code lives here
  └── track-b/core-modules ← Your friend builds Track B here
        └── merge back to main when ready
```

### Recommended Workflow

```bash
# Track A developer (you):
git checkout main
# All Track A code is already on main

# Track B developer (your friend):
git clone <repo-url>
git checkout -b track-b/core-modules

# ... builds User Management, Branch, Payment, Notification modules ...

# When Track B is ready to merge:
git checkout main
git pull origin main              # Get latest Track A changes
git checkout track-b/core-modules
git merge main                    # Merge Track A into Track B branch first
# Resolve any conflicts HERE, not on main
git checkout main
git merge track-b/core-modules   # Fast-forward merge into main
git push origin main
```

### If You Both Need to Work Simultaneously

```bash
# You (Track A) work on: track-a/fixes
# Friend (Track B) works on: track-b/core-modules
# Neither touches main directly
# Both create Pull Requests to main
# Review each other's PRs before merging
```

---

## Part 4: What Your Friend Needs to Know

### 4.1 Files Track B Must NOT Modify

These files contain Track A business logic. If Track B changes them, they will break existing modules.

| File | Reason |
|------|--------|
| `src/services/auth.service.js` | JWT payload contract, login logic, portal activation |
| `src/services/student.service.js` | Pipeline transition rules |
| `src/services/followup.service.js` | Communication log logic |
| `src/services/appointment.service.js` | Conflict detection engine |
| `src/services/document.service.js` | Encryption pipeline |
| `src/services/application.service.js` | University application state machine |
| `src/services/visa.service.js` | Visa status transitions |
| `src/services/portal.service.js` | Read-only student aggregation |
| `src/utils/apiError.js` | Error shape contract |
| `src/utils/response.util.js` | Response shape contract |
| `src/utils/jwt.util.js` | Token signing/verification |
| `src/utils/password.util.js` | Bcrypt hashing |
| `src/utils/encryption.util.js` | AES-256-GCM for documents |
| `src/utils/storage.util.js` | File system abstraction |

### 4.2 Files Track B CAN and SHOULD Modify

| File | What to Add |
|------|-------------|
| `src/routes/index.js` | Mount new route files (add lines at the bottom) |
| `prisma/schema.prisma` | Add new models BELOW existing ones |
| `src/app.js` | Add `cors`, `helmet`, `express-rate-limit` ABOVE the route mount |
| `src/constants/index.js` | Add new constants (don't rename existing ones) |
| `.gitignore` | Add new entries (don't remove existing ones) |
| `package.json` | Install new packages via `npm install <pkg>` |

### 4.3 Shared Contracts Track B Must Follow

**JWT Payload (req.user after requireAuth):**

```javascript
req.user = {
    userId:             "cuid",         // Primary key in User table
    role:               "SUPER_ADMIN",  // SUPER_ADMIN | BRANCH_ADMIN | COUNSELOR | FRONT_DESK | TEACHER | REFERRAL_AGENT | STUDENT
    branchId:           "cuid | null",  // null for SUPER_ADMIN
    studentId:          "cuid | null",  // only for STUDENT role
    mustChangePassword: false           // true = temp password active
};
```

**Success Response (always use sendSuccess/sendCreated):**

```javascript
// Import
const { sendSuccess, sendCreated } = require("../utils/response.util");

// Usage
sendSuccess(res, { message: "Branch updated.", data: branch });
sendCreated(res, { message: "User created.", data: user });

// Output shape
{ success: true, message: "...", data: { ... } }
```

**Error Throwing (always use AppError):**

```javascript
const AppError = require("../utils/apiError");

throw AppError.badRequest("Branch name is required.", "VALIDATION_ERROR");
throw AppError.notFound("User not found.", "USER_NOT_FOUND");
throw AppError.forbidden("Not allowed.", "FORBIDDEN");
throw AppError.conflict("Email already exists.", "DUPLICATE_EMAIL");
// Global error handler in app.js catches and formats all of these
```

**Prisma Client (never create a new instance):**

```javascript
const prisma = require("../prisma");
// This is the singleton. Use it directly. Never do new PrismaClient().
```

**Middleware Usage (always requireAuth first, then requireRole):**

```javascript
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

router.post("/users", requireAuth, requireRole("SUPER_ADMIN"), controller.create);
```

### 4.4 Database Schema Rules for Track B

**Rule 1:** Do not modify any existing Track A model fields. Adding NEW fields to existing models is OK if coordinated.

**Rule 2:** Add new models BELOW the `// BUSINESS LAYER (Track B)` comment in `schema.prisma`.

**Rule 3:** If Track B needs to add a field to an existing Track A model (e.g., adding `branchId` to `Student`), discuss it first. Track A queries may need updating.

**Rule 4:** Run migrations after any schema change:

```bash
npx prisma migrate dev --name "describe-what-changed"
npx prisma generate
```

### 4.5 Models That Already Exist for Track B

These models are already defined in the schema but have NO service/controller/route code yet. Track B should build the business logic for them:

| Model | Lines in Schema | Status |
|-------|----------------|--------|
| `Branch` | 175-186 | Schema exists, no routes/services |
| `Payment` | 375-388 | Schema exists, no routes/services |
| `Transaction` | 390-400 | Schema exists, no routes/services |
| `Commission` | 516-531 | Schema exists, no routes/services |
| `CommissionRule` | 499-514 | Schema exists, no routes/services |
| `Notification` | 613-624 | Schema exists, no routes/services |
| `NotificationTemplate` | 626-636 | Schema exists, no routes/services |
| `AuditLog` | 638-649 | Schema exists, no routes/services |
| `Class` | 533-546 | Schema exists, no routes/services |
| `Enrollment` | 548-558 | Schema exists, no routes/services |
| `AttendanceRecord` | 560-571 | Schema exists, no routes/services |
| `Event` | 587-601 | Schema exists, no routes/services |

### 4.6 Cross-Module Foreign Key Dependencies

Track B code will reference Track A tables, and vice versa. Here's the map:

```
User.branchId ──────→ Branch.id           (Track B owns Branch)
User.studentId ─────→ Student.id          (Track A owns Student)
Payment.studentId ──→ Student.id          (Track B creates, references Track A)
Commission.studentId→ Student.id          (Track B creates, references Track A)
Commission.recipientId→ User.id           (Both tracks share User)
Student.assignedCounselorId → User.id     (Track A references User)
Application.universityId → University.id  (Track A references Track B's University)
Application.courseId → Course.id          (Track A references Track B's Course)
```

---

## Part 5: How to Merge Track B Back Into Track A

### Step-by-Step Merge Process

```bash
# 1. Track B developer finishes their work
git add .
git commit -m "Track B: User, Branch, Payment, Notification modules"

# 2. Switch to main and pull latest Track A changes
git checkout main
git pull origin main

# 3. Merge Track B branch
git merge track-b/core-modules

# 4. If there are NO conflicts:
#    Done! Push to main.
git push origin main

# 5. If there ARE conflicts:
#    Git will tell you which files conflict.
#    See "Resolving Conflicts" section below.
```

### Files Most Likely to Conflict

| File | Why | How to Resolve |
|------|-----|----------------|
| `src/routes/index.js` | Both tracks add mount lines | Keep ALL lines. Track A lines first, Track B lines after. |
| `prisma/schema.prisma` | Both tracks may edit models | Keep ALL models. Track A models first, Track B additions below. |
| `package.json` | Both tracks add dependencies | Accept both. Then run `npm install` to regenerate `package-lock.json`. |
| `src/app.js` | Track B adds `cors`, `helmet` | Track B middleware goes ABOVE `app.use("/api", router)`. Keep Track A's error handler at the bottom. |
| `.gitignore` | Both may add entries | Keep ALL entries from both sides. |
| `src/constants/index.js` | Track B may add new constants | Merge both objects together. |

### Resolving Conflicts in `src/routes/index.js`

The correct merged version should look like:

```javascript
const { Router } = require("express");
const router = Router();

// Health Check
router.get("/health", (req, res) => {
    res.json({ success: true, status: "ok", message: "Dream Sky API is healthy" });
});

// ─── Track A Module Routers ───────────────────────────────
router.use("/auth", require("./auth.routes"));
router.use("/students", require("./student.routes"));
router.use("/follow-ups", require("./followup.routes"));
router.use("/appointments", require("./appointment.routes"));
router.use("/documents", require("./document.routes"));
router.use("/applications", require("./application.routes"));
router.use("/visa-cases", require("./visa.routes"));
router.use("/portal", require("./portal.routes"));

// ─── Track B Module Routers ───────────────────────────────
router.use("/users", require("./user.routes"));
router.use("/branches", require("./branch.routes"));
router.use("/payments", require("./payment.routes"));
router.use("/notifications", require("./notification.routes"));

module.exports = router;
```

### Resolving Conflicts in `prisma/schema.prisma`

Rule: **Keep everything.** Track A models stay where they are. Track B adds below.

After resolving, run:

```bash
npx prisma migrate dev --name "merge-track-a-and-track-b"
npx prisma generate
```

---

## Part 6: Environment Variables & Database Setup for Track B

### Environment Variables Track B Needs to Add

Track B should add their own variables BELOW Track A's in `.env`:

```env
# ─── Track A (DO NOT CHANGE) ─────────────────────────────
NODE_ENV=development
PORT=5000
DATABASE_URL="postgresql://..."
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
DOCUMENT_ENCRYPTION_KEY=...

# ─── Track B (ADD BELOW) ─────────────────────────────────
# Email / Notifications (if using nodemailer)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
NOTIFICATION_FROM_EMAIL=

# Payment Gateway (if applicable)
PAYMENT_GATEWAY_KEY=
PAYMENT_GATEWAY_SECRET=
```

Update `.env.example` with the new variable names too.

### Database Setup

Track A and Track B should use the **same database**. All models are in one Prisma schema.

```bash
# Track B developer sets up:
# 1. Install PostgreSQL (if not already running)
# 2. Create the database
psql -U postgres -c "CREATE DATABASE dreamsky_db;"

# 3. Copy .env.example to .env and fill in DATABASE_URL
# 4. Run all migrations
npx prisma migrate dev

# 5. Seed the test admin user
node scripts/seed-test-user.js
```

### Packages Track B Will Likely Need

```bash
# Security hardening (should be added to the shared project)
npm install cors helmet express-rate-limit

# Email (for Notification module)
npm install nodemailer

# Payment gateway (choose one)
npm install stripe
# or: npm install khalti-checkout-web

# Cron jobs (for scheduled notifications)
npm install node-cron
```

---

## Part 7: Testing After Merge

### Quick Smoke Test

After merging, run through this sequence to verify nothing broke:

```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma client
npx prisma generate

# 3. Run migrations
npx prisma migrate dev

# 4. Start server
npm run dev

# 5. Test health check
curl http://localhost:5001/api/health
# Expected: { "success": true, "status": "ok", ... }
```

### Track A Endpoint Verification

Test every Track A module still works:

```powershell
$base = "http://localhost:5001/api"

# Login
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"admin@dreamsky.com","password":"Test@1234"}'
$token = $login.data.accessToken
$h = @{ Authorization = "Bearer $token" }
Write-Host "Login: OK"

# Students
Invoke-RestMethod -Uri "$base/students" -Method GET -Headers $h | Out-Null
Write-Host "Students List: OK"

# Follow-ups
Invoke-RestMethod -Uri "$base/follow-ups" -Method GET -Headers $h | Out-Null
Write-Host "Follow-ups List: OK"

# Appointments
Invoke-RestMethod -Uri "$base/appointments" -Method GET -Headers $h | Out-Null
Write-Host "Appointments List: OK"

# Documents
Invoke-RestMethod -Uri "$base/documents" -Method GET -Headers $h | Out-Null
Write-Host "Documents List: OK"

# Applications
Invoke-RestMethod -Uri "$base/applications" -Method GET -Headers $h | Out-Null
Write-Host "Applications List: OK"

# Visa Cases
Invoke-RestMethod -Uri "$base/visa-cases" -Method GET -Headers $h | Out-Null
Write-Host "Visa Cases List: OK"

# Auth/Me
Invoke-RestMethod -Uri "$base/auth/me" -Method GET -Headers $h | Out-Null
Write-Host "Auth Me: OK"

Write-Host "`nAll Track A endpoints verified." -ForegroundColor Green
```

### Track B Endpoint Verification

Track B developer adds similar tests for their endpoints.

### What to Do If Something Breaks After Merge

```bash
# 1. Check the server console for the exact error message

# 2. If it's a Prisma error (schema mismatch):
npx prisma generate
npx prisma migrate dev

# 3. If it's a missing module error:
npm install

# 4. If it's a route conflict (duplicate paths):
# Check src/routes/index.js for duplicate mount points

# 5. If it's a "cannot find module" error:
# Check if the file was actually committed (git ls-files src/)

# 6. If nothing works, rollback:
git checkout main
git reset --hard HEAD~1    # Undo the last merge
```

---

## Part 8: API Routes Reference for Track B

Track B needs to know what URLs are already taken by Track A:

| Method | Route | Module | RBAC |
|--------|-------|--------|------|
| `POST` | `/api/auth/login` | Auth | Public |
| `POST` | `/api/auth/refresh` | Auth | Public |
| `POST` | `/api/auth/logout` | Auth | Any authenticated |
| `GET` | `/api/auth/me` | Auth | Any authenticated |
| `POST` | `/api/auth/change-password` | Auth | Any authenticated |
| `POST` | `/api/auth/activate-student-portal` | Auth | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `POST` | `/api/students` | Student | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR, FRONT_DESK |
| `GET` | `/api/students` | Student | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR, FRONT_DESK |
| `GET` | `/api/students/:id` | Student | Any authenticated |
| `PUT` | `/api/students/:id` | Student | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `DELETE` | `/api/students/:id` | Student | SUPER_ADMIN, BRANCH_ADMIN |
| `PATCH` | `/api/students/:id/pipeline` | Student | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `GET` | `/api/students/:id/timeline` | Student | Any authenticated |
| `POST` | `/api/follow-ups` | Follow-up | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR, FRONT_DESK |
| `GET` | `/api/follow-ups` | Follow-up | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR, FRONT_DESK |
| `GET` | `/api/follow-ups/dashboard` | Follow-up | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `GET` | `/api/follow-ups/student/:studentId` | Follow-up | Any authenticated |
| `GET` | `/api/follow-ups/:id` | Follow-up | Any authenticated |
| `PUT` | `/api/follow-ups/:id` | Follow-up | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `DELETE` | `/api/follow-ups/:id` | Follow-up | SUPER_ADMIN, BRANCH_ADMIN |
| `POST` | `/api/appointments` | Appointment | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR, FRONT_DESK |
| `GET` | `/api/appointments` | Appointment | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR, FRONT_DESK |
| `GET` | `/api/appointments/dashboard` | Appointment | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `GET` | `/api/appointments/:id` | Appointment | Any authenticated |
| `PUT` | `/api/appointments/:id` | Appointment | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `DELETE` | `/api/appointments/:id` | Appointment | SUPER_ADMIN, BRANCH_ADMIN |
| `PATCH` | `/api/appointments/:id/status` | Appointment | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `POST` | `/api/documents/upload` | Document | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `GET` | `/api/documents` | Document | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR, FRONT_DESK |
| `GET` | `/api/documents/:id` | Document | Any authenticated |
| `GET` | `/api/documents/:id/download` | Document | Any authenticated |
| `PATCH` | `/api/documents/:id/verify` | Document | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `PUT` | `/api/documents/:id` | Document | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `DELETE` | `/api/documents/:id` | Document | SUPER_ADMIN, BRANCH_ADMIN |
| `POST` | `/api/applications` | Application | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `GET` | `/api/applications` | Application | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR, FRONT_DESK |
| `GET` | `/api/applications/dashboard` | Application | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `GET` | `/api/applications/:id` | Application | Any authenticated |
| `PUT` | `/api/applications/:id` | Application | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `DELETE` | `/api/applications/:id` | Application | SUPER_ADMIN, BRANCH_ADMIN |
| `PATCH` | `/api/applications/:id/status` | Application | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `POST` | `/api/applications/:id/offers` | Application | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `POST` | `/api/visa-cases` | Visa | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `GET` | `/api/visa-cases` | Visa | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR, FRONT_DESK |
| `GET` | `/api/visa-cases/dashboard` | Visa | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `GET` | `/api/visa-cases/:id` | Visa | Any authenticated |
| `PUT` | `/api/visa-cases/:id` | Visa | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `DELETE` | `/api/visa-cases/:id` | Visa | SUPER_ADMIN, BRANCH_ADMIN |
| `PATCH` | `/api/visa-cases/:id/status` | Visa | SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR |
| `GET` | `/api/portal/:studentId/profile` | Portal | Own student or staff |
| `GET` | `/api/portal/:studentId/dashboard` | Portal | Own student or staff |
| `GET` | `/api/portal/:studentId/applications` | Portal | Own student or staff |
| `GET` | `/api/portal/:studentId/visa-cases` | Portal | Own student or staff |
| `GET` | `/api/portal/:studentId/documents` | Portal | Own student or staff |
| `GET` | `/api/portal/:studentId/appointments` | Portal | Own student or staff |
| `GET` | `/api/portal/:studentId/follow-ups` | Portal | Own student or staff |

**Track B should NOT create routes under these prefixes:** `/api/auth`, `/api/students`, `/api/follow-ups`, `/api/appointments`, `/api/documents`, `/api/applications`, `/api/visa-cases`, `/api/portal`.

**Track B should create routes under:** `/api/users`, `/api/branches`, `/api/payments`, `/api/notifications`, `/api/classes`, `/api/events`, `/api/commissions`, `/api/audit-logs`.

---

## Part 9: Known Limitations for Track B

Things that Track A did NOT implement that Track B may need to handle:

1. **User CRUD** — Track A only has `login`, `me`, `changePassword`, and `activateStudentPortal`. There is no endpoint to create staff users, list users, update users, or deactivate users. Track B must build the User Management module.

2. **Branch CRUD** — The `Branch` model exists in the schema but has no service, controller, or routes. Track B must build the Branch Management module.

3. **Branch Scoping** — Track A queries do NOT filter by `branchId`. If the system supports multi-branch operation, Track B must add branch-level data isolation to all relevant queries.

4. **CORS** — `app.js` does not configure CORS. Track B must add it before any frontend can call the API.

5. **Rate Limiting** — No rate limiting exists. Track B should add `express-rate-limit` to at least `/api/auth/login` and `/api/auth/refresh`.

6. **Security Headers** — No `helmet` middleware. Track B should add it.

7. **Logging** — Track A uses `console.error` for error logging. Track B may want to replace this with `winston` or `pino` for structured production logging.

8. **Seed Data** — Only one test admin exists. Track B may need to create a comprehensive seed script for test users, branches, universities, courses, etc.

---

## Part 10: Pre-Merge Checklist

### Track A Developer (You) — Before Sharing

- [ ] Fix `.gitignore` (add `uploads/`, `.claude/`, `.windsurf/`)
- [ ] Create `.env.example` with all variable names
- [ ] Run `git add .` and verify all 25+ untracked files are staged
- [ ] Run `git status` and confirm `.env`, `node_modules/`, `uploads/` are NOT staged
- [ ] Run `git commit -m "Track A complete"`
- [ ] Push to GitHub or create ZIP (excluding `node_modules` and `uploads`)
- [ ] Share the repo URL (or ZIP) with your friend
- [ ] Share this MERGE_GUIDE.md with your friend
- [ ] Share the ARCHITECTURE.md with your friend
- [ ] Tell your friend the test admin credentials (`admin@dreamsky.com` / `Test@1234`)
- [ ] Tell your friend to read Part 4 of this guide before writing any code

### Track B Developer (Your Friend) — Before Starting

- [ ] Clone or extract the code
- [ ] Run `npm install`
- [ ] Copy `.env.example` to `.env` and fill in real values
- [ ] Run `npx prisma generate`
- [ ] Run `npx prisma migrate dev`
- [ ] Run `npm run dev` and verify server starts
- [ ] Test `GET /api/health` returns success
- [ ] Login with test admin and verify token works
- [ ] Read ARCHITECTURE.md to understand the layer structure
- [ ] Read Part 4 of this guide for contracts and rules
- [ ] Create a new branch: `git checkout -b track-b/core-modules`

---

## Part 11: Post-Merge Checklist

After Track B merges back into main:

- [ ] Run `npm install` (picks up any new Track B dependencies)
- [ ] Run `npx prisma generate` (picks up any schema changes)
- [ ] Run `npx prisma migrate dev` (applies any new migrations)
- [ ] Run `npm run dev` and verify server starts without errors
- [ ] Test `GET /api/health` — should return success
- [ ] Test Track A login: `POST /api/auth/login` with admin credentials
- [ ] Test Track A students: `GET /api/students` — should return list
- [ ] Test Track A follow-ups: `GET /api/follow-ups` — should return list
- [ ] Test Track A appointments: `GET /api/appointments` — should return list
- [ ] Test Track A documents: `GET /api/documents` — should return list
- [ ] Test Track A applications: `GET /api/applications` — should return list
- [ ] Test Track A visa cases: `GET /api/visa-cases` — should return list
- [ ] Test Track B users: `GET /api/users` — should return list (Track B endpoint)
- [ ] Test Track B branches: `GET /api/branches` — should return list (Track B endpoint)
- [ ] Verify CORS headers are present in responses (Track B adds this)
- [ ] Verify no 500 Internal Server Errors on any endpoint
- [ ] Verify Prisma schema has no validation errors: `npx prisma validate`
- [ ] Run full test scripts if available

---

## Quick Reference Card

```
┌────────────────────────────────────────────────────────────┐
│                    SHARED CONTRACTS                         │
├───────────────┬────────────────────────────────────────────┤
│ JWT Payload   │ { userId, role, branchId, studentId,       │
│               │   mustChangePassword }                      │
├───────────────┼────────────────────────────────────────────┤
│ Success Resp  │ { success: true, message, data }            │
├───────────────┼────────────────────────────────────────────┤
│ Error Resp    │ { success: false, code, message }            │
├───────────────┼────────────────────────────────────────────┤
│ Auth Header   │ Authorization: Bearer <accessToken>          │
├───────────────┼────────────────────────────────────────────┤
│ Prisma Import │ require("../prisma") — singleton             │
├───────────────┼────────────────────────────────────────────┤
│ Express       │ 5.2.1 (async errors handled natively)        │
├───────────────┼────────────────────────────────────────────┤
│ Node          │ >= 20.9.0                                    │
├───────────────┼────────────────────────────────────────────┤
│ Roles         │ SUPER_ADMIN, BRANCH_ADMIN, COUNSELOR,        │
│               │ FRONT_DESK, TEACHER, REFERRAL_AGENT, STUDENT │
├───────────────┼────────────────────────────────────────────┤
│ Architecture  │ Route → Middleware → Controller → Service    │
│               │ → Prisma ORM → PostgreSQL                    │
├───────────────┼────────────────────────────────────────────┤
│ Test Admin    │ admin@dreamsky.com / Test@1234                │
└───────────────┴────────────────────────────────────────────┘
```

---

*This guide should be shared alongside the codebase. Both developers should reference it during the merge.*
