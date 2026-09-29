const express = require("express");

const {
  getInvestmentSummary,
  getInvestments,
  getMemberInvestmentDetails,
} = require(
  "../../controllers/admin/adminInvestmentController"
);

const adminAuthMiddleware =
  require(
    "../../middleware/adminAuthMiddleware"
  );

const router =
  express.Router();


router.use(
  adminAuthMiddleware
);


// IMPORTANT:
// specific routes before parameter routes

router.get(
  "/summary",
  getInvestmentSummary
);

router.get(
  "/member/:id",
  getMemberInvestmentDetails
);

router.get(
  "/",
  getInvestments
);


module.exports = router;