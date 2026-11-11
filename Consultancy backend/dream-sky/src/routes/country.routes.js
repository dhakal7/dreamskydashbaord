const { Router } = require("express");
const universityController = require("../controllers/university.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/rbac.middleware");

const router = Router();

router.use(requireAuth);

// ─── Countries ────────────────────────────────────────────────────────────────
// Reads: any authenticated role | Writes: SUPER_ADMIN only
router.get("/", universityController.listCountries);
router.get("/:id", universityController.getCountry);
router.post("/", requireRole("SUPER_ADMIN"), universityController.createCountry);
router.put("/:id", requireRole("SUPER_ADMIN"), universityController.updateCountry);
router.delete("/:id", requireRole("SUPER_ADMIN"), universityController.deleteCountry);

module.exports = router;

