const express = require("express");

const {
  getNetworkOverview,
  getNetworkDirects,
  getNetworkLevels,
  getNetworkLevelMembers,
  searchNetworkMembers,
  getNetworkTree,
  getNetworkTreeChildren,
} = require(
  "../../controllers/admin/adminNetworkController"
);

const adminAuthMiddleware =
  require(
    "../../middleware/adminAuthMiddleware"
  );


const router = express.Router();


// ==========================================
// ALL NETWORK ROUTES REQUIRE ADMIN AUTH
// ==========================================

router.use(
  adminAuthMiddleware
);


// ==========================================
// MEMBER SEARCH
// ==========================================

router.get(
  "/search",
  searchNetworkMembers
);


// ==========================================
// NETWORK OVERVIEW
// ==========================================

router.get(
  "/overview",
  getNetworkOverview
);


// ==========================================
// DIRECT REFERRALS
// ==========================================

router.get(
  "/directs",
  getNetworkDirects
);


// ==========================================
// LEVEL SUMMARY
// ==========================================

router.get(
  "/levels",
  getNetworkLevels
);


// ==========================================
// LEVEL MEMBERS
// ==========================================

router.get(
  "/level-members",
  getNetworkLevelMembers
);


// ==========================================
// VISUAL TREE
// ==========================================

// Root + immediate children
router.get(
  "/tree",
  getNetworkTree
);


// Lazy-load children for one node
router.get(
  "/tree/:memberId/children",
  getNetworkTreeChildren
);


module.exports = router;