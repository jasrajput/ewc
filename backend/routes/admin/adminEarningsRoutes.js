const express = require("express");

const {
  getEarnings,
} = require(
  "../../controllers/admin/adminEarningsController"
);

const adminAuthMiddleware =
  require(
    "../../middleware/adminAuthMiddleware"
  );


const router = express.Router();


// ==========================================
// ALL EARNINGS ROUTES REQUIRE ADMIN AUTH
// ==========================================

router.use(
  adminAuthMiddleware
);


// GET /api/admin/earnings
router.get(
  "/",
  getEarnings
);


module.exports = router;