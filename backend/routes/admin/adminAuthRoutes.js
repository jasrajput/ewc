const express = require("express");

const {
  login,
  me,
} = require("../../controllers/admin/adminAuthController");

const adminAuthMiddleware = require("../../middleware/adminAuthMiddleware");

const router = express.Router();

// Public
router.post("/login", login);

// Protected
router.get("/me", adminAuthMiddleware, me);

module.exports = router;