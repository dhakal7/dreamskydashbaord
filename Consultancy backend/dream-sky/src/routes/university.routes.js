const { Router } = require("express");
const universityController = require("../controllers/university.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = Router();

router.use(requireAuth);

// ─── Countries ────────────────────────────────────────────────────────────────
// Reads: any authenticated role | Writes: SUPER_ADMIN only
router.get("/countries", universityController.listCountries);
router.get("/countries/:id", universityController.getCountry);
router.post("/countries", requireRole("SUPER_ADMIN"), universityController.createCountry);
router.put("/countries/:id", requireRole("SUPER_ADMIN"), universityController.updateCountry);
router.delete("/countries/:id", requireRole("SUPER_ADMIN"), universityController.deleteCountry);

// ─── Universities ─────────────────────────────────────────────────────────────
// Reads: any authenticated role | Writes: SUPER_ADMIN only
router.get("/", universityController.listUniversities);
router.get("/:id", universityController.getUniversity);
router.get("/:id/courses", universityController.getUniversityCourses);
router.post("/", requireRole("SUPER_ADMIN"), universityController.createUniversity);
router.put("/:id", requireRole("SUPER_ADMIN"), universityController.updateUniversity);
router.delete("/:id", requireRole("SUPER_ADMIN"), universityController.deleteUniversity);

module.exports = router;
