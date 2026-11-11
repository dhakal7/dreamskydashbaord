const express = require("express");

// ─── Process-level crash guards (must be first) ────────────────────────────────
// Log fatal errors but keep the process alive so cPanel doesn't see a "page not found"
process.on("uncaughtException", (err) => {
    console.error("[FATAL] Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason) => {
    console.error("[FATAL] Unhandled Promise Rejection:", reason);
});
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { createCorsMiddleware } = require("./config/cors");

// ─── Security Configuration Validation (Phase 2.7, 2.7.2, 2.7.4) ───
// Resolved BEFORE routes (and therefore Prisma) are loaded, so missing or
// malformed environment, CORS, JWT, or encryption fails fast at startup.
const { resolveEnvironment } = require("./config/environment");
resolveEnvironment(process.env);
const corsSetup = createCorsMiddleware(process.env);
const { validateJwtConfig } = require("./utils/jwt.util");
const { validateEncryptionConfig } = require("./utils/encryption.util");
validateJwtConfig(process.env);
validateEncryptionConfig(process.env);
const { validateDatabaseUrl } = require("./config");
if (process.env.NODE_ENV !== "test") {
    validateDatabaseUrl(process.env.DATABASE_URL, process.env.NODE_ENV);
}

const router = require("./routes");

const app = express();

// ─── Trust Proxy (required for LiteSpeed/cPanel reverse proxy) ────
app.set("trust proxy", 1);

// ─── Security Middleware ───────────────────────────────────────────
app.use(helmet());
// Explicit origin allowlist; unlisted browser origins get no CORS headers and a 403.
app.use(corsSetup.middleware);

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // High limit for active CRM sessions
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.includes('/auth/login') || req.path.includes('/auth/refresh'),
    message: {
        success: false,
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests from this IP, please try again after 15 minutes"
    }
});
app.use(["/api", "/"], limiter);

// ─── Core Middleware ───────────────────────────────────────────────
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── API Mutation Safety Gate (Must precede router) ────────────────
const { apiMutationGate } = require("./middleware/api-mutation-gate");
app.use(apiMutationGate);

// ─── Routes ───────────────────────────────────────────────────────
app.use(["/api", "/"], router);

// ─── 404 Handler ──────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

// ─── Global Error Handler ─────────────────────────────────────────
// Catches everything thrown via next(err) or throw inside async handlers.
// Uses the standard error response shape (Contract #5 from backend split doc):
//   { success: false, code, message }
app.use((err, req, res, next) => {
    console.error("💥 Global Error Handler:", err);

    const statusCode = err.statusCode || 500;
    const code = err.code || "INTERNAL_ERROR";
    const message = err.message || "Internal Server Error";

    const responseBody = {
        success: false,
        code,
        message,
    };

    if (process.env.NODE_ENV === "development") {
        responseBody.details = err.stack || String(err);
    } else if (err.isOperational && err.details) {
        responseBody.details = err.details;
    }

    res.status(statusCode).json(responseBody);
});

module.exports = app;