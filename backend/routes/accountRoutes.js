const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getProfile,
  updateProfile,
  registerWallet,
  updatePassword,
} = require("../controllers/accountController");

router.get("/profile", authMiddleware, getProfile);
router.put("/profile", authMiddleware, updateProfile);
router.put("/wallet", authMiddleware, registerWallet);
router.put("/password", authMiddleware, updatePassword);

module.exports = router;