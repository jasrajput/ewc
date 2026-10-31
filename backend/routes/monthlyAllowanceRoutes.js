
const express = require("express");
const router = express.Router();

const {
  getMonthlyAllowance,
} = require("../controllers/monthlyAllowanceController");

// Use the same authentication middleware as /rank/progress.
const { authenticate } = require("../middleware/auth");

router.get("/", authenticate, getMonthlyAllowance);

module.exports = router;
