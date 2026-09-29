const express = require("express");

const {
  getRankMembers,
  getRankDistribution,
  getMemberRankDetails,
} = require(
  "../../controllers/admin/adminRankController"
);

const adminAuthMiddleware =
  require(
    "../../middleware/adminAuthMiddleware"
  );


const router = express.Router();


// ==========================================
// ADMIN AUTH
// ==========================================

router.use(
  adminAuthMiddleware
);


// ==========================================
// RANK DISTRIBUTION
//
// Keep this before /member/:id.
// ==========================================

router.get(
  "/distribution",
  getRankDistribution
);


// ==========================================
// MEMBER RANK DETAILS
// ==========================================

router.get(
  "/member/:id",
  getMemberRankDetails
);


// ==========================================
// RANK MEMBER LIST
// ==========================================

router.get(
  "/",
  getRankMembers
);


module.exports = router;