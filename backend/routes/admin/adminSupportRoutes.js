const express =
  require("express");

const {
  getSupportSummary,
  getSupportTickets,
  getSupportTicketDetails,
  replyToSupportTicket,
  updateSupportTicketStatus,
  markSupportTicketRead,
} = require(
  "../../controllers/admin/adminSupportController"
);

const {
  adminListAgents,
  adminCreateAgent,
  adminUpdateAgentStatus,
  adminAssignTicket,
} = require("../../controllers/supportAgentController");


// Use the SAME middleware import/export
// already used by your other admin routes.
const adminAuthMiddleware =
  require(
    "../../middleware/adminAuthMiddleware"
  );


const router =
  express.Router();


router.use(
  adminAuthMiddleware
);


router.get("/agents", adminListAgents);

router.post("/agents", adminCreateAgent);

router.patch(
  "/agents/:id/status",
  adminUpdateAgentStatus
);

router.patch(
  "/:id/assign",
  adminAssignTicket
);

// Must remain before /:id
router.get(
  "/summary",
  getSupportSummary
);


router.get(
  "/",
  getSupportTickets
);


router.get(
  "/:id",
  getSupportTicketDetails
);


router.post(
  "/:id/reply",
  replyToSupportTicket
);


router.patch(
  "/:id/status",
  updateSupportTicketStatus
);


router.patch(
  "/:id/read",
  markSupportTicketRead
);


module.exports =
  router;