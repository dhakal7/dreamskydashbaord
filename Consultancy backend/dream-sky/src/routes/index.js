const { Router } = require("express");
const router = Router();

// ─── Health Check ─────────────────────────────────────────────────
router.get(["/", "/health"], (req, res) => {
    res.json({ success: true, status: "ok", message: "Dream Sky API is live & healthy 🚀" });
});

// ─── Module Routers ───────────────────────────────────────────────
router.use("/auth", require("./auth.routes"));
router.use("/users", require("./user.routes"));
router.use("/students", require("./student.routes"));
router.use("/follow-ups", require("./followup.routes"));
router.use("/appointments", require("./appointment.routes"));
router.use("/documents", require("./document.routes"));
router.use("/applications", require("./application.routes"));
router.use("/visa-cases", require("./visa.routes"));
router.use("/portal", require("./portal.routes"));

// ─── Track B Merged Modules ───────────────────────────────────────
router.use("/commissions", require("./commission.routes"));
router.use("/classes", require("./class.routes"));
router.use("/events", require("./event.routes"));
router.use("/partner-consultancies", require("./partner-consultancy.routes"));


// ─── M6: Notifications ────────────────────────────────────────────
router.use("/notifications", require("./notification.routes"));

// ─── M7: University / Country / Course / Recommendation / Public ──
router.use("/universities", require("./university.routes"));
router.use("/courses", require("./course.routes"));
router.use("/recommendations", require("./recommendation.routes"));

const { publicRouter, inquiryRouter } = require("./public.routes");
router.use("/public", publicRouter);
router.use("/inquiries", inquiryRouter);

module.exports = router;
