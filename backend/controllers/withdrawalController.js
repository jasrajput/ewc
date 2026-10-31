
const fs = require("fs");
const path = require("path");
const db = require("../config/db");

const MERKLE_DIRECTORY = path.join(
  __dirname,
  "../../closing-node/merkle_snapshots"
);

const sendInfo = (res, data) => res.json({ success: true, data });

/* =========================================================
   WITHDRAWAL INFO
========================================================= */

exports.getWithdrawalInfo = async (req, res) => {
  try {
    const memberId = req.user?.id;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Please login again.",
      });
    }

    // Member and live income balance
    const [rows] = await db.execute(
      `SELECT
         m.id,
         m.user_id,
         m.name,
         m.trx,
         COALESCE(uw.balance, 0) AS income_balance
       FROM member AS m
       LEFT JOIN user_wallet AS uw ON uw.user_id = m.id
       WHERE m.id = ?
       LIMIT 1`,
      [memberId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const user = rows[0];
    const wallet = String(user.trx || "").trim();

    // These values are from recorded successful withdrawals.
    // The blockchain contract remains authoritative for actual claims.
    const [claimedRows] = await db.execute(
      `SELECT
         COALESCE(SUM(amount), 0) AS usdt_claimed,
         COALESCE(SUM(roi_ewc_amount), 0) AS roi_ewc_claimed
       FROM withdrawals
       WHERE user_id = ?
         AND status = 1`,
      [memberId]
    );

    const claimed = claimedRows[0] || {};

    const result = {
      user_id: user.user_id,
      name: user.name,
      wallet,

      // Live balance credited by deposit events and night closing.
      incomeBalance: String(user.income_balance ?? "0"),

      // Cumulative entitlements from the published Merkle snapshot.
      cumulativeUsdtIncome: "0",
      cumulativeRoiEwc: "0",

      // Successful claims recorded in MySQL.
      usdtClaimed: String(claimed.usdt_claimed ?? "0"),
      roiEwcClaimed: String(claimed.roi_ewc_claimed ?? "0"),

      proof: [],
      root: "",
      merkleRoot: "",
      snapshotId: "",
      merkleAvailable: false,
      merkleError: "",
    };

    if (!wallet) {
      result.merkleError = "Wallet address is not available for this account.";
      return sendInfo(res, result);
    }

    /* =====================================================
       LATEST MERKLE SNAPSHOT
    ===================================================== */

    const latestFile = path.join(MERKLE_DIRECTORY, "latest.json");

    if (!fs.existsSync(latestFile)) {
      result.merkleError = "Withdrawal data is not available yet.";
      return sendInfo(res, result);
    }

    let latest;

    try {
      latest = JSON.parse(fs.readFileSync(latestFile, "utf8"));
    } catch (error) {
      console.error("Unable to read latest.json:", error);
      result.merkleError = "Invalid latest Merkle snapshot.";
      return sendInfo(res, result);
    }

    if (!latest?.snapshot_id || !latest?.root) {
      result.merkleError = "Invalid latest Merkle snapshot.";
      return sendInfo(res, result);
    }

    result.snapshotId = String(latest.snapshot_id);
    result.root = String(latest.root);
    result.merkleRoot = String(latest.root);

    /* =====================================================
       READ SNAPSHOT FILE
    ===================================================== */

    // Validate the identifier before using it in a file path.
    const snapshotId = String(latest.snapshot_id);

    if (!/^[a-zA-Z0-9_-]+$/.test(snapshotId)) {
      result.merkleError = "Invalid snapshot identifier.";
      return sendInfo(res, result);
    }

    const snapshotFile = path.join(
      MERKLE_DIRECTORY,
      `snapshot_${snapshotId}.json`
    );

    if (!fs.existsSync(snapshotFile)) {
      result.merkleError = "Merkle snapshot file not found.";
      return sendInfo(res, result);
    }

    let snapshot;

    try {
      snapshot = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
    } catch (error) {
      console.error("Unable to read snapshot:", error);
      result.merkleError = "Invalid Merkle snapshot data.";
      return sendInfo(res, result);
    }

    if (!Array.isArray(snapshot?.users)) {
      result.merkleError = "Invalid Merkle snapshot data.";
      return sendInfo(res, result);
    }

    /* =====================================================
       FIND USER IN SNAPSHOT
    ===================================================== */

    const normalizedWallet = wallet.toLowerCase();

    const snapshotUser = snapshot.users.find(
      (item) =>
        String(item.wallet || "").trim().toLowerCase() === normalizedWallet
    );

    if (!snapshotUser) {
      // User has no entitlement in this snapshot.
      return sendInfo(res, result);
    }

    /* =====================================================
       CUMULATIVE ENTITLEMENTS
    ===================================================== */

    result.cumulativeUsdtIncome = String(
      snapshotUser.cumulative_usdt_income ?? "0"
    );

    result.cumulativeRoiEwc = String(
      snapshotUser.cumulative_roi_ewc ?? "0"
    );

    result.proof = Array.isArray(snapshotUser.proof)
      ? snapshotUser.proof
      : [];

    result.merkleAvailable = true;
    result.merkleError = "";

    return sendInfo(res, result);
  } catch (error) {
    console.error("Withdrawal info error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load withdrawal information.",
    });
  }
};

/* =========================================================
   WITHDRAWAL HISTORY
========================================================= */

exports.getWithdrawalHistory = async (req, res) => {
  try {
    const memberId = req.user?.id;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Please login again.",
      });
    }

    const [rows] = await db.execute(
      `SELECT
         txn_id,
         amount,
         roi_ewc_amount,
         cumulative_usdt,
         cumulative_roi_ewc,
         date_of_withdrawal,
         status
       FROM withdrawals
       WHERE user_id = ?
       ORDER BY id DESC`,
      [memberId]
    );

    const history = rows.map((row) => ({
      txn_id: row.txn_id || "",
      usdt_amount: String(row.amount ?? "0"),
      roi_ewc_amount: String(row.roi_ewc_amount ?? "0"),
      cumulative_usdt: String(row.cumulative_usdt ?? "0"),
      cumulative_roi_ewc: String(row.cumulative_roi_ewc ?? "0"),
      date_of_withdrawal: row.date_of_withdrawal,
      status: Number(row.status),
      status_text: Number(row.status) === 1 ? "Approved" : "Pending",
    }));

    return res.json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error) {
    console.error("Withdrawal history error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load withdrawal history.",
    });
  }
};
