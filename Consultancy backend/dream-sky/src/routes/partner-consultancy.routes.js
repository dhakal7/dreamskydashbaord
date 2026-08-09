const { Router } = require("express");
const router = Router();
const partnerController = require("../controllers/partner-consultancy.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

router.use(requireAuth);

router.get("/", partnerController.getAllPartnerConsultancies);
router.post("/", partnerController.createOrFindPartnerConsultancy);

module.exports = router;
