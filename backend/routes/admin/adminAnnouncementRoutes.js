const express = require("express");

const {
  getAnnouncementSummary,
  getAnnouncements,
  getAnnouncementDetails,
  createAnnouncement,
  updateAnnouncement,
  publishAnnouncement,
} = require(
  "../../controllers/admin/adminAnnouncementController"
);


// Use the exact admin middleware import
// already used by your working admin routes.
const adminAuthMiddleware =
  require(
    "../../middleware/adminAuthMiddleware"
  );


const router =
  express.Router();


router.use(
  adminAuthMiddleware
);


// Keep before /:id
router.get(
  "/summary",
  getAnnouncementSummary
);


router.get(
  "/",
  getAnnouncements
);


router.post(
  "/",
  createAnnouncement
);


router.get(
  "/:id",
  getAnnouncementDetails
);


router.patch(
  "/:id",
  updateAnnouncement
);


router.post(
  "/:id/publish",
  publishAnnouncement
);


module.exports = router;