const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const router = require("./routes");

const app = express();

// ─── Trust Proxy (required for LiteSpeed/cPanel reverse proxy) ────
app.set("trust proxy", 1);

// ─── Security Middleware ───────────────────────────────────────────
app.use(helmet());
app.use(cors({
    origin: true,
    credentials: true
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === "development" ? 10000 : 100, // High limit in dev mode
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests from this IP, please try again after 15 minutes"
    }
});
app.use(["/api", "/"], limiter);

// ─── Core Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

    res.status(statusCode).json({
        success: false,
        code,
        message,
        details: err.stack || String(err)
    });
});

module.exports = app;