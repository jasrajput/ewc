const express = require("express");
const { rateLimit } = require("express-rate-limit");

const {
  register,
  login,
  checkReferral,
  checkAvailability,
  checkInvestmentAccount,
} = require("../controllers/authController");

const {
  sendRegistrationOtp,
  verifyRegistrationOtp,
} = require("../controllers/registrationOtpController");

const router = express.Router();

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many registration requests. Try again later.",
  },
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many OTP attempts. Try again later.",
  },
});

router.post("/login", login);

router.post(
  "/register/send-otp",
  registerLimiter,
  sendRegistrationOtp
);

router.post(
  "/register/verify-otp",
  otpLimiter,
  verifyRegistrationOtp
);

router.post("/register", registerLimiter, register);

router.post("/check-referral", checkReferral);
router.post("/check-availability", checkAvailability);
router.post("/check-investment-account", checkInvestmentAccount);

module.exports = router;