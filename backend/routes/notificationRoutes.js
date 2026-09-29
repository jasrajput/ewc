const express = require("express");

const {
  getUnreadCount,
  getRecentNotifications,
  getNotifications,
  markAnnouncementRead,
} = require(
  "../controllers/notificationController"
);


// IMPORTANT:
// Replace this import with the SAME member auth
// middleware already used by your working support routes.
const authMiddleware =
  require("../middleware/authMiddleware");


const router = express.Router();

router.use(authMiddleware);


router.get(
  "/unread-count",
  getUnreadCount
);

router.get(
  "/recent",
  getRecentNotifications
);

router.get(
  "/",
  getNotifications
);

router.patch(
  "/announcement/:id/read",
  markAnnouncementRead
);


module.exports = router;