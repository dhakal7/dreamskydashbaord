const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const router = require("./routes");

const app = express();

// ─── Security Middleware ───────────────────────────────────────────
app.use(helmet());
app.use(cors());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
        success: false,
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests from this IP, please try again after 15 minutes"
    }
});
app.use("/api", limiter);

// ─── Core Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────
app.use("/api", router);

// ─── 404 Handler ──────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

// ─── Global Error Handler ─────────────────────────────────────────
// Catches everything thrown via next(err) or throw inside async handlers.
// Uses the standard error response shape (Contract #5 from backend split doc):
//   { success: false, code, message }
app.use((err, req, res, next) => {
    // Log unexpected errors (not operational AppErrors)
    if (!err.isOperational) {
        console.error("💥 Unexpected error:", err);
    }

    const statusCode = err.statusCode || 500;
    const code = err.code || "INTERNAL_ERROR";
    const message = err.isOperational ? err.message : "Internal Server Error";

    res.status(statusCode).json({ success: false, code, message });
});

module.exports = app;