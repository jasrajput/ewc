require("dotenv").config();

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const incomeRoutes = require("./routes/incomeRoutes");
const teamRoutes = require("./routes/teamRoutes");
const rankRoutes = require("./routes/rankRoutes");
const withdrawalRoutes = require("./routes/withdrawalRoutes");
const accountRoutes = require("./routes/accountRoutes");
const supportRoutes = require("./routes/supportRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const adminAuthRoutes = require("./routes/admin/adminAuthRoutes");
const adminDashboardRoutes = require("./routes/admin/adminDashboardRoutes");
const adminMemberRoutes = require("./routes/admin/adminMemberRoutes");
const adminAuditRoutes = require("./routes/admin/adminAuditRoutes");
const adminEarningsRoutes = require("./routes/admin/adminEarningsRoutes");
const adminNetworkRoutes = require("./routes/admin/adminNetworkRoutes");
const adminRankRoutes = require("./routes/admin/adminRankRoutes");
const adminInvestmentRoutes = require("./routes/admin/adminInvestmentRoutes");
const adminWithdrawalRoutes = require("./routes/admin/adminWithdrawalRoutes");
const adminClosingRunRoutes = require("./routes/admin/adminClosingRunRoutes");
const adminTransactionRoutes = require("./routes/admin/adminTransactionRoutes");
const adminSupportRoutes = require("./routes/admin/adminSupportRoutes");
const adminAnnouncementRoutes = require("./routes/admin/adminAnnouncementRoutes");



const app = express();

// =========================================================
// CORS
// =========================================================

app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// =========================================================
// MIDDLEWARE
// =========================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================================================
// ROUTES
// =========================================================

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/income", incomeRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/rank", rankRoutes);
app.use("/api/withdrawal", withdrawalRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/notifications", notificationRoutes);

app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/admin/members", adminMemberRoutes);
app.use("/api/admin/audit-logs", adminAuditRoutes);
app.use("/api/admin/network", adminNetworkRoutes);
app.use("/api/admin/earnings", adminEarningsRoutes);
app.use("/api/admin/ranks", adminRankRoutes);
app.use("/api/admin/investments", adminInvestmentRoutes);
app.use("/api/admin/withdrawals", adminWithdrawalRoutes);
app.use("/api/admin/closing-runs", adminClosingRunRoutes);
app.use("/api/admin/transactions", adminTransactionRoutes);
app.use("/api/admin/support", adminSupportRoutes);
app.use("/api/admin/announcements", adminAnnouncementRoutes);

// Test API
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "EWC API is running",
  });
});

// =========================================================
// 404
// =========================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

// =========================================================
// SERVER
// =========================================================

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`EWC API running on http://localhost:${PORT}`);
});