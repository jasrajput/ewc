const fs = require("fs");
const path = require("path");
const db = require("../config/db");

const MERKLE_DIRECTORY = path.join(
  __dirname,
  "../../closing-node/merkle_snapshots"
);

/* =========================================================
 * WITHDRAWAL INFO
 * ========================================================= */

exports.getWithdrawalInfo = async (req, res) => {
  try {
    const memberId = req.user?.id;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Please login again.",
      });
    }

    /* -------------------------------------------------------
     * MEMBER
     * ------------------------------------------------------- */

    const [rows] = await db.execute(
      `SELECT id, user_id, name, trx
       FROM member
       WHERE id = ?
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

    /* -------------------------------------------------------
     * CLAIMED TOTALS
     *
     * withdrawals.amount         = actual USDT received
     * withdrawals.roi_ewc_amount = actual EWC received
     *
     * status = 1 means successful/approved claim.
     * ------------------------------------------------------- */

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

      cumulativeUsdtIncome: "0",
      cumulativeRoiEwc: "0",

      usdtClaimed: String(
        claimed.usdt_claimed || "0"
      ),

      roiEwcClaimed: String(
        claimed.roi_ewc_claimed || "0"
      ),

      proof: [],
      root: "",
      snapshotId: "",

      merkleAvailable: false,
      merkleError: "",
    };

    /* -------------------------------------------------------
     * WALLET REQUIRED
     * ------------------------------------------------------- */

    if (!wallet) {
      result.merkleError =
        "Wallet address is not available for this account.";

      return res.json({
        success: true,
        data: result,
      });
    }

    /* -------------------------------------------------------
     * LATEST SNAPSHOT
     * ------------------------------------------------------- */

    const latestFile = path.join(
      MERKLE_DIRECTORY,
      "latest.json"
    );

    if (!fs.existsSync(latestFile)) {
      result.merkleError =
        "Withdrawal data is not available yet.";

      return res.json({
        success: true,
        data: result,
      });
    }

    let latest;

    try {
      latest = JSON.parse(
        fs.readFileSync(latestFile, "utf8")
      );
    } catch (error) {
      console.error(
        "Unable to read latest.json:",
        error
      );

      result.merkleError =
        "Invalid latest Merkle snapshot.";

      return res.json({
        success: true,
        data: result,
      });
    }

    if (
      !latest?.snapshot_id ||
      !latest?.root
    ) {
      result.merkleError =
        "Invalid latest Merkle snapshot.";

      return res.json({
        success: true,
        data: result,
      });
    }

    result.snapshotId =
      String(latest.snapshot_id);

    result.root =
      String(latest.root);

    /* -------------------------------------------------------
     * SNAPSHOT FILE
     * ------------------------------------------------------- */

    const snapshotFile = path.join(
      MERKLE_DIRECTORY,
      `snapshot_${latest.snapshot_id}.json`
    );

    if (!fs.existsSync(snapshotFile)) {
      result.merkleError =
        "Merkle snapshot file not found.";

      return res.json({
        success: true,
        data: result,
      });
    }

    let snapshot;

    try {
      snapshot = JSON.parse(
        fs.readFileSync(snapshotFile, "utf8")
      );
    } catch (error) {
      console.error(
        "Unable to read snapshot:",
        error
      );

      result.merkleError =
        "Invalid Merkle snapshot data.";

      return res.json({
        success: true,
        data: result,
      });
    }

    if (!Array.isArray(snapshot?.users)) {
      result.merkleError =
        "Invalid Merkle snapshot data.";

      return res.json({
        success: true,
        data: result,
      });
    }

    /* -------------------------------------------------------
     * FIND CURRENT USER IN SNAPSHOT
     * ------------------------------------------------------- */

    const normalizedWallet =
      wallet.toLowerCase();

    const snapshotUser =
      snapshot.users.find(
        (item) =>
          String(item.wallet || "")
            .trim()
            .toLowerCase() ===
          normalizedWallet
      );

    if (!snapshotUser) {
      /*
       * User simply has no entitlement in this snapshot.
       * This is not a server error.
       */

      return res.json({
        success: true,
        data: result,
      });
    }

    /* -------------------------------------------------------
     * NEW TWO-ASSET CUMULATIVE VALUES
     * ------------------------------------------------------- */

    result.cumulativeUsdtIncome =
      String(
        snapshotUser.cumulative_usdt_income ||
        "0"
      );

    result.cumulativeRoiEwc =
      String(
        snapshotUser.cumulative_roi_ewc ||
        "0"
      );

    result.proof =
      Array.isArray(snapshotUser.proof)
        ? snapshotUser.proof
        : [];

    result.merkleAvailable = true;
    result.merkleError = "";

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(
      "Withdrawal info error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load withdrawal information.",
    });
  }
};

/* =========================================================
 * WITHDRAWAL HISTORY
 * ========================================================= */

exports.getWithdrawalHistory = async (req, res) => {
  try {
    const memberId = req.user?.id;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid session. Please login again.",
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
      txn_id:
        row.txn_id || "",

      usdt_amount:
        String(row.amount || "0"),

      roi_ewc_amount:
        String(row.roi_ewc_amount || "0"),

      cumulative_usdt:
        String(row.cumulative_usdt || "0"),

      cumulative_roi_ewc:
        String(row.cumulative_roi_ewc || "0"),

      date_of_withdrawal:
        row.date_of_withdrawal,

      status:
        Number(row.status),

      status_text:
        Number(row.status) === 1
          ? "Approved"
          : "Pending",
    }));

    return res.json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error) {
    console.error(
      "Withdrawal history error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load withdrawal history.",
    });
  }
};