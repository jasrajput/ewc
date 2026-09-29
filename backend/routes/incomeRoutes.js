const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { getIncome } = require("../controllers/incomeController");

router.get("/:type", authMiddleware, getIncome);

module.exports = router;