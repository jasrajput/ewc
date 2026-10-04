const express = require("express");
const router = express.Router();

const {
    getInvestmentHistory
} = require("../controllers/investmentController");

const authMiddleware = require("../middleware/authMiddleware");

router.get("/history", authMiddleware, getInvestmentHistory);

module.exports = router;