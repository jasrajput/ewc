const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const {
  getWithdrawalInfo,
  getWithdrawalHistory,
} = require("../controllers/withdrawalController");

router.get("/info", authMiddleware, getWithdrawalInfo);
router.get("/history", authMiddleware, getWithdrawalHistory);

module.exports = router;