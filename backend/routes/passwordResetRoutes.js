
const express = require("express");
const { rateLimit } = require("express-rate-limit");

const {
  forgotPassword,
  resetPassword,
} = require("../controllers/passwordResetController");

const router = express.Router();

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again later.",
  },
});

router.post("/forgot", forgotLimiter, forgotPassword);
router.post("/reset", resetLimiter, resetPassword);

module.exports = router;
