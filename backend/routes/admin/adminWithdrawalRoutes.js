const express = require("express");

const {
  getWithdrawalSummary,
  getWithdrawals,
  getWithdrawalDetails,
} = require(
  "../../controllers/admin/adminWithdrawalController"
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


// Keep /summary before /:id
router.get(
  "/summary",
  getWithdrawalSummary
);

router.get(
  "/",
  getWithdrawals
);

router.get(
  "/:id",
  getWithdrawalDetails
);


module.exports = router;