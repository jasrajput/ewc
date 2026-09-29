const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { getRankProgress } = require("../controllers/rankController");

router.get("/progress", authMiddleware, getRankProgress);

module.exports = router;