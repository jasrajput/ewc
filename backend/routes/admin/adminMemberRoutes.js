const express = require("express");

const {
  getMembers,
  getMemberDetails,
  updateMemberProfile,
  updateMemberStatus,
  updateMemberRoiStatus,
  updateMemberRank,
  removeMemberRank
} = require(
  "../../controllers/admin/adminMemberController"
);

const adminAuthMiddleware = require(
  "../../middleware/adminAuthMiddleware"
);

const router = express.Router();

router.use(adminAuthMiddleware);


// =========================================================
// MEMBERS
// =========================================================

router.get(
  "/",
  getMembers
);

router.get(
  "/:id",
  getMemberDetails
);

router.patch(
  "/:id/profile",
  updateMemberProfile
);

router.patch(
  "/:id/status",
  updateMemberStatus
);

router.patch(
  "/:id/roi-status",
  updateMemberRoiStatus
);

router.patch("/:id/rank", updateMemberRank);
router.delete(
  "/:id/rank",
  removeMemberRank
);

module.exports = router;