const express = require("express");
const { register, login, checkReferral, checkAvailability } = require("../controllers/authController");

const router = express.Router();

router.post("/login", login);
router.post("/register", register);
router.post("/check-referral", checkReferral);
router.post("/check-availability", checkAvailability);

module.exports = router;