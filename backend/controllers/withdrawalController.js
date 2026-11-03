
"use strict";

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const db = require("../config/db");

const MERKLE_DIRECTORY = process.env.MERKLE_SNAPSHOT_DIR ||
  path.resolve(__dirname, "../../closing-node/merkle_snapshots");

const PAYOUT_ABI = [
  "function merkleRoot() view returns (bytes32)",
  "function usdtClaimed(address) view returns (uint256)",
  "function roiEwcClaimed(address) view returns (uint256)",
  "function queuedUSDT(address) view returns (uint256)",
];

const sendInfo = (res, data) => res.json({ success: true, data });

function readSnapshot() {
  const latestFile = path.join(MERKLE_DIRECTORY, "latest.json");
  if (!fs.existsSync(latestFile)) return null;

  const latest = JSON.parse(fs.readFileSync(latestFile, "utf8"));
  const id = String(latest.snapshot_id || "");

  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("Invalid Merkle snapshot identifier");
  }

  const file = path.join(MERKLE_DIRECTORY, `snapshot_${id}.json`);
  const snapshot = JSON.parse(fs.readFileSync(file, "utf8"));

  if (
    !ethers.isHexString(latest.root, 32) ||
    snapshot.root?.toLowerCase() !== latest.root.toLowerCase() ||
    !Array.isArray(snapshot.users)
  ) {
    throw new Error("Invalid or mismatched Merkle snapshot");
  }

  return { latest, snapshot };
}

function getPayout() {
  const address = process.env.MERKLE_CONTRACT;
  const rpc = process.env.RPC_URL;

  if (!ethers.isAddress(address) || !rpc) {
    throw new Error("MERKLE_CONTRACT or RPC_URL is not configured");
  }

  const provider = new ethers.JsonRpcProvider(rpc, 56);
  return new ethers.Contract(address, PAYOUT_ABI, provider);
}

// GET /api/withdrawal/info
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
      `SELECT m.id, m.user_id, m.name, m.trx,
              COALESCE(uw.balance, 0) AS income_balance
       FROM member m
       LEFT JOIN user_wallet uw ON uw.user_id = m.id
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

    const result = {
      user_id: user.user_id,
      name: user.name,
      wallet,
      incomeBalance: String(user.income_balance ?? "0"),
      cumulativeUsdtIncome: "0",
      cumulativeRoiEwc: "0",
      usdtClaimed: "0",
      roiEwcClaimed: "0",
      queuedUsdt: "0",
      claimableUsdt: "0",
      claimableEwc: "0",
      proof: [],
      root: "",
      merkleRoot: "",
      snapshotId: "",
      merkleAvailable: false,
      merkleError: "",
    };

    if (!ethers.isAddress(wallet)) {
      result.merkleError = "No valid registered wallet was found.";
      return sendInfo(res, result);
    }

    const payout = getPayout();
    const [claimedUSDT, claimedEWC, queuedUSDT, onChainRoot] =
      await Promise.all([
        payout.usdtClaimed(wallet),
        payout.roiEwcClaimed(wallet),
        payout.queuedUSDT(wallet),
        payout.merkleRoot(),
      ]);

    result.usdtClaimed = ethers.formatUnits(claimedUSDT, 18);
    result.roiEwcClaimed = ethers.formatUnits(claimedEWC, 18);
    result.queuedUsdt = ethers.formatUnits(queuedUSDT, 18);

    const published = readSnapshot();

    if (!published) {
      result.merkleError = "No published payout snapshot is available.";
      return sendInfo(res, result);
    }

    const { latest, snapshot } = published;

    result.snapshotId = String(latest.snapshot_id);
    result.root = latest.root;
    result.merkleRoot = latest.root;

    if (onChainRoot.toLowerCase() !== latest.root.toLowerCase()) {
      result.merkleError = "Published snapshot does not match the payout contract.";
      return sendInfo(res, result);
    }

    const snapshotUser = snapshot.users.find(
      (u) => String(u.wallet || "").toLowerCase() === wallet.toLowerCase()
    );

    if (!snapshotUser) {
      result.merkleError = "No earnings are included in the current snapshot.";
      return sendInfo(res, result);
    }

    const cumulativeUSDT = ethers.parseUnits(
      String(snapshotUser.cumulative_usdt_income ?? "0"), 18
    );
    const cumulativeEWC = ethers.parseUnits(
      String(snapshotUser.cumulative_roi_ewc ?? "0"), 18
    );

    result.cumulativeUsdtIncome = ethers.formatUnits(cumulativeUSDT, 18);
    result.cumulativeRoiEwc = ethers.formatUnits(cumulativeEWC, 18);
    result.claimableUsdt = ethers.formatUnits(
      cumulativeUSDT > claimedUSDT ? cumulativeUSDT - claimedUSDT : 0n, 18
    );
    result.claimableEwc = ethers.formatUnits(
      cumulativeEWC > claimedEWC ? cumulativeEWC - claimedEWC : 0n, 18
    );

    result.proof = Array.isArray(snapshotUser.proof) ? snapshotUser.proof : [];
    result.merkleAvailable = true;

    return sendInfo(res, result);
  } catch (error) {
    console.error("Withdrawal info error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load withdrawal information.",
    });
  }
};

// GET /api/withdrawal/history
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
      `SELECT txn_id, amount, roi_ewc_amount,
              cumulative_usdt, cumulative_roi_ewc,
              pending_balance, is_queued,
              date_of_withdrawal, status
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
      pending_balance: String(row.pending_balance ?? "0"),
      is_queued: Number(row.is_queued || 0),
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
