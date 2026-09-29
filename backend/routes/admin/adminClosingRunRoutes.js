const express =
  require("express");

const {
  getClosingRunSummary,
  getClosingRuns,
  getClosingRunDetails,
} = require(
  "../../controllers/admin/adminClosingRunController"
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


// /summary must remain before /:id
router.get(
  "/summary",
  getClosingRunSummary
);


router.get(
  "/",
  getClosingRuns
);


router.get(
  "/:id",
  getClosingRunDetails
);


module.exports =
  router;