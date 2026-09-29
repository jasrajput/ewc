const express = require("express");

const {
  getDashboard,
} = require("../../controllers/admin/adminDashboardController");

const adminAuthMiddleware = require("../../middleware/adminAuthMiddleware");

const router = express.Router();

router.get(
  "/",
  adminAuthMiddleware,
  getDashboard
);

module.exports = router;