const { Router } = require("express");
const publicController = require("../controllers/public.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

// ─── Public router (unauthenticated) ─────────────────────────────────────────
const router = Router();

router.get("/countries", publicController.listPublicCountries);
router.get("/universities", publicController.listPublicUniversities);
router.get("/universities/:universityId", publicController.getPublicUniversity);
router.get("/courses", publicController.listPublicCourses);
router.post("/inquiry", publicController.submitPublicInquiry);

// ─── Inquiry management router (authenticated staff) ──────────────────────────
const inquiryRouter = Router();

inquiryRouter.use(requireAuth);
inquiryRouter.get(
  "/",
  requireRole("SUPER_ADMIN", "COUNSELOR"),
  publicController.listInquiries
);
inquiryRouter.get(
  "/:id",
  requireRole("SUPER_ADMIN", "COUNSELOR"),
  publicController.getInquiry
);
inquiryRouter.patch(
  "/:id/convert",
  requireRole("SUPER_ADMIN", "COUNSELOR"),
  publicController.markInquiryConverted
);

module.exports = { publicRouter: router, inquiryRouter };
