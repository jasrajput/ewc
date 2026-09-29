const fs = require("fs");
const path = require("path");
const db = require("../config/db");

const MERKLE_DIRECTORY = path.join(
  __dirname,
  "../../closing-node/merkle_snapshots"
);

exports.getWithdrawalInfo = async (req, res) => {
  try {
    const memberId = req.user?.id;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Please login again.",
      });
    }

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

    const result = {
      user_id: user.user_id,
      name: user.name,
      wallet,
      minimumWithdrawal: 10,
      merkleAvailable: false,
      cumulativeAmount: "0",
      proof: [],
      root: "",
      snapshotId: "",
      merkleError: "",
    };

    if (!wallet) {
      result.merkleError = "Wallet address is not available for this account.";

      return res.json({
        success: true,
        data: result,
      });
    }

    const latestFile = path.join(MERKLE_DIRECTORY, "latest.json");

    if (!fs.existsSync(latestFile)) {
      return res.json({
        success: true,
        data: result,
      });
    }

    let latest;

    try {
      latest = JSON.parse(fs.readFileSync(latestFile, "utf8"));
    } catch {
      result.merkleError = "Invalid latest Merkle snapshot.";

      return res.json({
        success: true,
        data: result,
      });
    }

    if (!latest?.snapshot_id || !latest?.root) {
      result.merkleError = "Invalid latest Merkle snapshot.";

      return res.json({
        success: true,
        data: result,
      });
    }

    result.snapshotId = latest.snapshot_id;
    result.root = latest.root;

    const snapshotFile = path.join(
      MERKLE_DIRECTORY,
      `snapshot_${latest.snapshot_id}.json`
    );

    if (!fs.existsSync(snapshotFile)) {
      result.merkleError = "Merkle snapshot file not found.";

      return res.json({
        success: true,
        data: result,
      });
    }

    let snapshot;

    try {
      snapshot = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
    } catch {
      result.merkleError = "Invalid Merkle snapshot data.";

      return res.json({
        success: true,
        data: result,
      });
    }

    if (!Array.isArray(snapshot?.users)) {
      result.merkleError = "Invalid Merkle snapshot data.";

      return res.json({
        success: true,
        data: result,
      });
    }

    const normalizedWallet = wallet.toLowerCase();

    const snapshotUser = snapshot.users.find(
      (item) =>
        String(item.wallet || "").trim().toLowerCase() === normalizedWallet
    );

    if (!snapshotUser) {
      return res.json({
        success: true,
        data: result,
      });
    }

    result.cumulativeAmount = String(
      snapshotUser.cumulative_amount || "0"
    );

    result.proof = Array.isArray(snapshotUser.proof)
      ? snapshotUser.proof
      : [];

    result.merkleAvailable = true;

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Withdrawal info error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load withdrawal information.",
    });
  }
};

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
      `SELECT txn_id, amount, date_of_withdrawal, status
       FROM withdrawals
       WHERE user_id = ?
       ORDER BY id DESC`,
      [memberId]
    );

    const history = rows.map((row) => ({
      txn_id: row.txn_id || "",
      amount: Number(row.amount || 0),
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