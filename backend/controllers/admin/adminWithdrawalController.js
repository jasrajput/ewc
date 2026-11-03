
"use strict";

const db = require("../../config/db");
const fs = require("node:fs/promises");
const path = require("node:path");
const { ethers } = require("ethers");

const PAYOUT_ABI = [
  "function merkleRoot() view returns (bytes32)",
  "function usdtClaimed(address) view returns (uint256)",
  "function queuedUSDT(address) view returns (uint256)",
];

const number = (value) => Number(value || 0);
const statusLabel = (status) => Number(status) === 1 ? "Approved" : "Pending";

const formatWithdrawal = (row) => ({
  id: Number(row.id),
  member: {
    id: row.member_id ? Number(row.member_id) : null,
    user_id: row.member_user_id || null,
    name: row.member_name || "",
    email: row.member_email || "",
    mobile_no: row.member_mobile || "",
    wallet: row.member_wallet || null,
    blocked: Number(row.member_status || 0) === 1,
  },
  amount: number(row.amount),
  pendingBalance: number(row.pending_balance),
  isQueued: Number(row.is_queued || 0) === 1,
  status: number(row.withdrawal_status),
  statusLabel: statusLabel(row.withdrawal_status),
  neftNo: row.neft_no || null,
  remarks: row.remarks || null,
  requestedAt: row.date_of_withdrawal || null,
  approvedAt: Number(row.withdrawal_status) === 1
    ? row.date_of_approved || null
    : null,
  tds: number(row.tds),
  adminCharge: number(row.admin_charge),
  deduction: number(row.deduction),
  payable: number(row.payable),
  type: number(row.type_is),
  apiStatus: row.api_status ?? null,
  blockchain: {
    txnId: row.txn_id || null,
    txId: row.tx_id || null,
    blockNumber: row.block_number == null ? null : String(row.block_number),
    logIndex: row.log_index == null ? null : Number(row.log_index),
    cumulativeAmount: number(row.cumulative_amount),
    price: number(row.price),
  },
});

const WITHDRAWAL_SELECT = `
  w.id, w.amount, w.pending_balance, w.is_queued,
  w.status AS withdrawal_status, w.neft_no, w.remarks,
  w.date_of_withdrawal, w.date_of_approved, w.tds,
  w.\`admin\` AS admin_charge, w.payable, w.api_status,
  w.deduction, w.type_is, w.txn_id, w.block_number,
  w.log_index, w.cumulative_amount, w.tx_id, w.price,
  m.id AS member_id, m.user_id AS member_user_id,
  m.name AS member_name, m.email AS member_email,
  m.mobile_no AS member_mobile, m.trx AS member_wallet,
  m.status AS member_status
`;

const SUMMARY_SELECT = `
  COUNT(*) AS totalRequests,
  COALESCE(SUM(amount), 0) AS totalRequested,
  SUM(CASE WHEN status <> 1 THEN 1 ELSE 0 END) AS pendingRequests,
  COALESCE(SUM(CASE WHEN status <> 1
    THEN CASE WHEN is_queued = 1 THEN pending_balance ELSE amount END
    ELSE 0 END), 0) AS pendingAmount,
  SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS approvedRequests,
  COALESCE(SUM(CASE WHEN status = 1 THEN amount ELSE 0 END), 0) AS approvedAmount,
  COALESCE(SUM(payable), 0) AS totalPayable,
  COALESCE(SUM(deduction), 0) AS totalDeduction,
  COALESCE(SUM(tds), 0) AS totalTds,
  COALESCE(SUM(\`admin\`), 0) AS totalAdminCharge
`;

const normalizeSummary = (row = {}) => Object.fromEntries([
  "totalRequests", "totalRequested", "pendingRequests", "pendingAmount",
  "approvedRequests", "approvedAmount", "totalPayable", "totalDeduction",
  "totalTds", "totalAdminCharge", "todayRequests", "todayRequested",
].map((key) => [key, number(row[key])]));

// GET /api/admin/withdrawals/summary
const getWithdrawalSummary = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT ${SUMMARY_SELECT},
        SUM(CASE WHEN DATE(date_of_withdrawal) = CURDATE()
          THEN 1 ELSE 0 END) AS todayRequests,
        COALESCE(SUM(CASE WHEN DATE(date_of_withdrawal) = CURDATE()
          THEN amount ELSE 0 END), 0) AS todayRequested
      FROM withdrawals
    `);

    return res.status(200).json({
      success: true,
      data: normalizeSummary(rows[0]),
    });
  } catch (error) {
    console.error("Admin withdrawal summary error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load withdrawal summary.",
    });
  }
};

// GET /api/admin/withdrawals
const getWithdrawals = async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "").trim().toLowerCase();
    const blockchain = String(req.query.blockchain || "").trim().toLowerCase();
    const sort = String(req.query.sort || "newest").trim();

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const minAmount = req.query.minAmount == null || req.query.minAmount === ""
      ? null : Number(req.query.minAmount);
    const maxAmount = req.query.maxAmount == null || req.query.maxAmount === ""
      ? null : Number(req.query.maxAmount);

    if (
      (minAmount !== null && (!Number.isFinite(minAmount) || minAmount < 0)) ||
      (maxAmount !== null && (!Number.isFinite(maxAmount) || maxAmount < 0))
    ) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a valid non-negative number.",
      });
    }

    if (minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
      return res.status(400).json({
        success: false,
        message: "Minimum amount cannot exceed maximum amount.",
      });
    }

    const where = [];
    const params = [];

    if (search) {
      const fields = [
        "m.user_id", "m.name", "m.email", "m.mobile_no",
        "m.trx", "w.txn_id", "w.tx_id", "w.neft_no"
      ];

      where.push(`(${fields.map((field) => `${field} LIKE ?`).join(" OR ")})`);
      params.push(...fields.map(() => `%${search}%`));
    }

    if (status === "approved") where.push("w.status = 1");
    if (status === "pending") where.push("w.status <> 1");

    for (const [key, field, operator] of [
      ["requestedFrom", "date_of_withdrawal", ">="],
      ["requestedTo", "date_of_withdrawal", "<="],
      ["approvedFrom", "date_of_approved", ">="],
      ["approvedTo", "date_of_approved", "<="],
    ]) {
      if (req.query[key]) {
        where.push(`DATE(w.${field}) ${operator} ?`);
        params.push(String(req.query[key]).trim());
      }
    }

    if (minAmount !== null) {
      where.push("w.amount >= ?");
      params.push(minAmount);
    }

    if (maxAmount !== null) {
      where.push("w.amount <= ?");
      params.push(maxAmount);
    }

    if (blockchain === "recorded") {
      where.push(`
        (
          NULLIF(TRIM(w.txn_id), '') IS NOT NULL
          OR NULLIF(TRIM(w.tx_id), '') IS NOT NULL
          OR w.block_number IS NOT NULL
        )
      `);
    } else if (blockchain === "missing") {
      where.push(`
        (
          NULLIF(TRIM(w.txn_id), '') IS NULL
          AND NULLIF(TRIM(w.tx_id), '') IS NULL
          AND w.block_number IS NULL
        )
      `);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const sorts = {
      newest: "w.date_of_withdrawal DESC, w.id DESC",
      oldest: "w.date_of_withdrawal ASC, w.id ASC",
      amount_desc: "w.amount DESC, w.id DESC",
      amount_asc: "w.amount ASC, w.id DESC",
      payable_desc: "w.payable DESC, w.id DESC",
      payable_asc: "w.payable ASC, w.id DESC",
      approved_newest:
        "CASE WHEN w.status = 1 THEN 0 ELSE 1 END ASC, w.date_of_approved DESC, w.id DESC",
    };

    const orderBy = sorts[sort] || sorts.newest;

    const [countRows] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM withdrawals w
       LEFT JOIN member m ON m.id = w.user_id
       ${whereSql}`,
      params
    );

    const total = number(countRows[0]?.total);

    const [rows] = await db.execute(
      `SELECT ${WITHDRAWAL_SELECT}
       FROM withdrawals w
       LEFT JOIN member m ON m.id = w.user_id
       ${whereSql}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.status(200).json({
      success: true,
      data: {
        withdrawals: rows.map(formatWithdrawal),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Admin withdrawals error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load withdrawals.",
    });
  }
};

// GET /api/admin/withdrawals/:id
const getWithdrawalDetails = async (req, res) => {
  try {
    const withdrawalId = Number(req.params.id);

    if (!Number.isInteger(withdrawalId) || withdrawalId < 1) {
      return res.status(400).json({
        success: false,
        message: "Valid withdrawal ID is required.",
      });
    }

    const [rows] = await db.execute(
      `SELECT ${WITHDRAWAL_SELECT}
       FROM withdrawals w
       LEFT JOIN member m ON m.id = w.user_id
       WHERE w.id = ?
       LIMIT 1`,
      [withdrawalId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Withdrawal not found.",
      });
    }

    const withdrawal = formatWithdrawal(rows[0]);
    let memberSummary = normalizeSummary();

    if (withdrawal.member.id) {
      const [summaryRows] = await db.execute(
        `SELECT ${SUMMARY_SELECT}
         FROM withdrawals
         WHERE user_id = ?`,
        [withdrawal.member.id]
      );

      memberSummary = normalizeSummary(summaryRows[0]);
    }

    return res.status(200).json({
      success: true,
      data: { withdrawal, memberSummary },
    });
  } catch (error) {
    console.error("Admin withdrawal details error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load withdrawal details.",
    });
  }
};

// GET /api/admin/withdrawals/merkle-overview

/**
 * Wait between RPC calls or retries.
 */
const merkleRpcSleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry temporary RPC failures.
 *
 * Handles BSC rate limits, HTTP 429, temporary RPC
 * unavailability and related ethers BAD_DATA errors.
 */
const merkleRpcCall = async (operation, label, maxAttempts = 5) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const message = [
        error?.message,
        error?.shortMessage,
        error?.info?.error?.message,
        error?.error?.message,
        error?.value?.[0]?.error?.message,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const rateLimited =
        error?.status === 429 ||
        error?.error?.code === -32005 ||
        error?.value?.[0]?.error?.code === -32005 ||
        message.includes("rate limit") ||
        message.includes("too many requests") ||
        message.includes("429");

      const temporaryFailure =
        rateLimited ||
        error?.code === "TIMEOUT" ||
        error?.code === "SERVER_ERROR" ||
        message.includes("timeout") ||
        message.includes("temporarily unavailable") ||
        message.includes("missing response for request");

      if (!temporaryFailure || attempt === maxAttempts) {
        throw error;
      }

      const baseDelay = rateLimited ? 1500 : 750;
      const delay = Math.min(
        baseDelay * 2 ** (attempt - 1),
        12000
      );

      console.warn(
        `[Merkle RPC] ${label} failed. ` +
        `Retry ${attempt}/${maxAttempts - 1} ` +
        `in ${delay}ms: ${error.message}`
      );

      await merkleRpcSleep(delay);
    }
  }
};

/**
 * Admin Merkle overview.
 *
 * - Validates latest.json and snapshot
 * - Verifies published root on BSC
 * - Reads claimed and queued amounts
 * - Avoids JSON-RPC batching
 * - Limits request concurrency
 * - Retries temporary rate limits
 */
const getMerkleOverview = async (req, res) => {
  try {
    // ==================================================
    // CONFIGURATION
    // ==================================================

    const directory = process.env.MERKLE_SNAPSHOT_DIR;
    const payoutAddress = process.env.MERKLE_CONTRACT;
    const rpcUrl = process.env.RPC_URL;

    if (!directory || !path.isAbsolute(directory)) {
      throw new Error(
        "MERKLE_SNAPSHOT_DIR must be an absolute path"
      );
    }

    if (!payoutAddress || !ethers.isAddress(payoutAddress)) {
      throw new Error("Invalid MERKLE_CONTRACT");
    }

    if (!rpcUrl) {
      throw new Error("RPC_URL is missing");
    }

    // ==================================================
    // LOAD LATEST SNAPSHOT
    // ==================================================

    const latest = JSON.parse(
      await fs.readFile(
        path.join(directory, "latest.json"),
        "utf8"
      )
    );

    const snapshotId = String(latest.snapshot_id || "");

    if (!/^[a-zA-Z0-9_-]+$/.test(snapshotId)) {
      throw new Error("Invalid snapshot ID");
    }

    const snapshot = JSON.parse(
      await fs.readFile(
        path.join(
          directory,
          `snapshot_${snapshotId}.json`
        ),
        "utf8"
      )
    );

    if (
      !snapshot.root ||
      !latest.root ||
      snapshot.root.toLowerCase() !== latest.root.toLowerCase()
    ) {
      throw new Error("Snapshot/root mismatch");
    }

    if (!Array.isArray(snapshot.users)) {
      throw new Error("Invalid snapshot users");
    }

    // ==================================================
    // BSC PROVIDER — DISABLE BATCHING
    // ==================================================

    const provider = new ethers.JsonRpcProvider(
      rpcUrl,
      56,
      {
        batchMaxCount: 1,
        staticNetwork: true,
      }
    );

    const payout = new ethers.Contract(
      payoutAddress,
      PAYOUT_ABI,
      provider
    );

    // ==================================================
    // VERIFY PUBLISHED ROOT
    // ==================================================

    const currentRoot = await merkleRpcCall(
      () => payout.merkleRoot(),
      "Read published Merkle root"
    );

    if (
      currentRoot.toLowerCase() !==
      latest.root.toLowerCase()
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Snapshot does not match the published on-chain Merkle root.",
      });
    }

    // ==================================================
    // LOAD MEMBER INFORMATION
    // ==================================================

    const memberIds = [
      ...new Set(
        snapshot.users.map((user) =>
          Number(user.user_id)
        )
      ),
    ];

    const [memberRows] = memberIds.length
      ? await db.query(
          `
          SELECT
            id,
            user_id,
            name
          FROM member
          WHERE id IN (?)
          `,
          [memberIds]
        )
      : [[]];

    const memberMap = new Map(
      memberRows.map((member) => [
        Number(member.id),
        member,
      ])
    );

    // ==================================================
    // READ CLAIMED AND QUEUED USDT
    // ==================================================

    const users = [];

    let unclaimedTotal = 0n;
    let queuedTotal = 0n;

    // Process sequentially to avoid a burst of eth_call.
    // Increase concurrency only after verifying RPC limits.
    for (const user of snapshot.users) {
      const wallet = ethers.getAddress(user.wallet);

      const cumulative = BigInt(
        user.cumulative_usdt_income_wei
      );

      const claimed = BigInt(
        await merkleRpcCall(
          () => payout.usdtClaimed(wallet),
          `Read claimed USDT for ${wallet}`
        )
      );

      // Small spacing between normal successful RPC reads.
      await merkleRpcSleep(150);

      const queued = BigInt(
        await merkleRpcCall(
          () => payout.queuedUSDT(wallet),
          `Read queued USDT for ${wallet}`
        )
      );

      if (cumulative < claimed) {
        throw new Error(
          `Claimed exceeds snapshot entitlement: ${wallet}`
        );
      }

      const unclaimed = cumulative - claimed;

      unclaimedTotal += unclaimed;
      queuedTotal += queued;

      const member = memberMap.get(
        Number(user.user_id)
      );

      users.push({
        userId:
          member?.user_id ||
          String(user.user_id),

        memberId: Number(user.user_id),

        name: member?.name || "",

        wallet,

        cumulativeUsdt: ethers.formatUnits(
          cumulative,
          18
        ),

        claimedUsdt: ethers.formatUnits(
          claimed,
          18
        ),

        unclaimedUsdt: ethers.formatUnits(
          unclaimed,
          18
        ),

        queuedUsdt: ethers.formatUnits(
          queued,
          18
        ),

        cumulativeEwc: user.cumulative_roi_ewc,
      });

      // Prevent immediate back-to-back wallet reads.
      await merkleRpcSleep(150);
    }

    // ==================================================
    // SUCCESS RESPONSE
    // ==================================================

    return res.status(200).json({
      success: true,

      data: {
        snapshotId: latest.snapshot_id,
        root: latest.root,
        publishedTransaction: latest.tx_hash,

        totals: {
          unclaimedUsdt: ethers.formatUnits(
            unclaimedTotal,
            18
          ),

          queuedUsdt: ethers.formatUnits(
            queuedTotal,
            18
          ),
        },

        users,
      },
    });
  } catch (error) {
    console.error(
      "Admin Merkle overview error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to load published Merkle claims.",
    });
  }
};


module.exports = {
  getWithdrawalSummary,
  getWithdrawals,
  getWithdrawalDetails,
  getMerkleOverview,
};
