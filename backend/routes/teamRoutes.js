const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getDirectPartners,
  getCommunity,
  getLevelSummary,
  getLevelMembers,
  getNetworkTree,
  getNetworkTreeChildren,
} = require("../controllers/teamController");

router.get("/directs", authMiddleware, getDirectPartners);
router.get("/community", authMiddleware, getCommunity);

router.get("/levels", authMiddleware, getLevelSummary);
router.get("/levels/:level", authMiddleware, getLevelMembers);

router.get("/tree", authMiddleware, getNetworkTree);
router.get("/tree/:userId", authMiddleware, getNetworkTreeChildren);

module.exports = router;