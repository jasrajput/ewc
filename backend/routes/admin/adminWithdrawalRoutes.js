
const express = require("express");

const {
  getWithdrawalSummary,
  getWithdrawals,
  getWithdrawalDetails,
  getMerkleOverview,
} = require("../../controllers/admin/adminWithdrawalController");

const adminAuthMiddleware = require("../../middleware/adminAuthMiddleware");

const router = express.Router();

router.use(adminAuthMiddleware);

// Summary
router.get("/summary", getWithdrawalSummary);

// Published Merkle snapshot and claimable balances
router.get("/merkle-overview", getMerkleOverview);

// Withdrawal list
router.get("/", getWithdrawals);

// Individual withdrawal details (keep last)
router.get("/:id", getWithdrawalDetails);

module.exports = router;
