const express = require("express");

const {
  createTicket,
  getTickets,
  getTicketDetails,
  replyToTicket,
  markTicketRead,
  getSupportSummary,
} = require(
  "../controllers/supportController"
);


// IMPORTANT:
// Replace this path/name ONLY if your existing
// member auth middleware has a different export.
const authMiddleware =
  require(
    "../middleware/authMiddleware"
  );


const router =
  express.Router();


router.use(
  authMiddleware
);


// Summary must stay before /:id
router.get(
  "/summary",
  getSupportSummary
);


router.post(
  "/tickets",
  createTicket
);


router.get(
  "/tickets",
  getTickets
);


router.get(
  "/tickets/:id",
  getTicketDetails
);


router.post(
  "/tickets/:id/reply",
  replyToTicket
);


router.patch(
  "/tickets/:id/read",
  markTicketRead
);


module.exports =
  router;