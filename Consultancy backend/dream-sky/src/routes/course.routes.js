const { Router } = require("express");
const universityController = require("../controllers/university.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = Router();

router.use(requireAuth);

// ─── Courses ──────────────────────────────────────────────────────────────────
// Reads + search/filter: any authenticated role | Writes: SUPER_ADMIN only
router.get("/", universityController.listCourses);
router.get("/:id", universityController.getCourse);
router.post("/", requireRole("SUPER_ADMIN"), universityController.createCourse);
router.put("/:id", requireRole("SUPER_ADMIN"), universityController.updateCourse);
router.delete("/:id", requireRole("SUPER_ADMIN"), universityController.deleteCourse);

/**
 * PATCH /:id/decrement-seats
 * Integration point: Track A's Application module calls this when confirming a student application.
 * Do NOT add pipeline/application logic here — this is a pure seat-count operation.
 */
router.patch(
  "/:id/decrement-seats",
  requireRole("SUPER_ADMIN", "COUNSELOR"),
  universityController.decrementSeats
);

module.exports = router;
