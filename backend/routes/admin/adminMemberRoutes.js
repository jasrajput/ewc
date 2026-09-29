const express = require("express");

const {
  getMembers,
  getMemberDetails,
  updateMemberProfile,
  updateMemberStatus,
  updateMemberRoiStatus,
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


module.exports = router;