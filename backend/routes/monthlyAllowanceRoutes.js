
const express = require("express");
const router = express.Router();

const {
  getMonthlyAllowance,
} = require("../controllers/monthlyAllowanceController");

const authMiddleware = require("../middleware/authMiddleware");

router.get("/", authMiddleware, getMonthlyAllowance);

module.exports = router;
