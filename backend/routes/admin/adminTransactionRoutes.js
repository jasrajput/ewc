const express =
  require("express");

const {
  getTransactionSummary,
  getTransactions,
  getTransactionDetails,
} = require(
  "../../controllers/admin/adminTransactionController"
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


// Keep this before /:id
router.get(
  "/summary",
  getTransactionSummary
);


router.get(
  "/",
  getTransactions
);


router.get(
  "/:id",
  getTransactionDetails
);


module.exports =
  router;