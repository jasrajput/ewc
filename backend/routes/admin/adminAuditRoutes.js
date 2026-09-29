const express = require(
  "express"
);

const {
  getAuditLogs,
} = require(
  "../../controllers/admin/adminAuditController"
);

const adminAuthMiddleware =
  require(
    "../../middleware/adminAuthMiddleware"
  );


const router =
  express.Router();


router.use(
  adminAuthMiddleware
);


router.get(
  "/",
  getAuditLogs
);


module.exports = router;