const express = require("express");
const { rateLimit } = require("express-rate-limit");

const supportAgentAuth = require(
  "../middleware/supportAgentAuth"
);

const controller = require(
  "../controllers/supportAgentController"
);

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Try again later.",
  },
});

const replyLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

router.post("/login", loginLimiter, controller.login);

router.use(supportAgentAuth);


router.get("/me", controller.me);

router.get(
  "/notifications",
  controller.getAgentNotificationSummary
);

router.get("/tickets", controller.getTickets);
router.get("/tickets/:id", controller.getTicketDetails);

router.post(
  "/tickets/:id/reply",
  replyLimiter,
  controller.replyToTicket
);

router.patch(
  "/tickets/:id/status",
  controller.updateStatus
);

module.exports = router;