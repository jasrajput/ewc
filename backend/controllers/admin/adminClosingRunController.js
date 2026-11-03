
const db = require("../../config/db");

// ======================================================
// HELPERS
// ======================================================

const isComplete = (row) =>
  ["done", "deferred"].includes(row.roi_status) &&
  row.usdt_status === "done" &&
  row.snapshot_status === "done" &&
  row.publish_status === "done";

const formatRun = (row) => {
  if (!row) return null;

  return {
    id: row.slot_key,
    slotKey: row.slot_key,
    runDate: row.run_date,
    slotHour: Number(row.slot_key.slice(-2)),
    roiStatus: row.roi_status || "pending",
    usdtStatus: row.usdt_status || "pending",
    snapshotStatus: row.snapshot_status || "pending",
    publishStatus: row.publish_status || "pending",
    snapshotId: row.snapshot_id || null,
    merkleRoot: row.merkle_root || null,
    txHash: row.tx_hash || null,
    createdAt: row.created_at || null,
    updatedAt: row.created_at || null,
    complete: isComplete(row),
  };
};

// ======================================================
// COMMON SELECT
// Daily ROI comes from closing_runs.
// Three-hour stages come from closing_slot_runs.
// ======================================================

const BASE_SELECT = `
  SELECT
    s.slot_key,
    DATE_FORMAT(s.run_date, '%Y-%m-%d') AS run_date,

    COALESCE(d.roi_status, 'pending') AS roi_status,

    s.usdt_status,
    s.snapshot_status,
    s.publish_status,
    s.snapshot_id,
    s.merkle_root,
    s.tx_hash,
    DATE_FORMAT(s.created_at, '%Y-%m-%d %H:%i:%s')
      AS created_at

  FROM closing_slot_runs s

  LEFT JOIN closing_runs d
    ON d.run_date = s.run_date
`;

// ======================================================
// GET /api/admin/closing-runs/summary
// ======================================================

const getClosingRunsSummary = async (req, res) => {
  try {
    const [rows] = await db.execute(BASE_SELECT);

    const runs = rows.map(formatRun);
    const completedRuns = runs.filter(
      (run) => run.complete
    ).length;

    const publishedRuns = runs.filter(
      (run) => run.publishStatus === "done"
    );

    const newestRun = [...runs].sort((a, b) =>
      b.slotKey.localeCompare(a.slotKey)
    )[0] || null;

    const latestPublished = [...publishedRuns].sort(
      (a, b) => b.slotKey.localeCompare(a.slotKey)
    )[0] || null;

    return res.status(200).json({
      success: true,
      data: {
        totalRuns: runs.length,
        completedRuns,
        pendingRuns: runs.length - completedRuns,

        roiPending: runs.filter(
          (run) => !["done", "deferred"].includes(
            run.roiStatus
          )
        ).length,

        roiDeferred: runs.filter(
          (run) => run.roiStatus === "deferred"
        ).length,

        usdtPending: runs.filter(
          (run) => run.usdtStatus !== "done"
        ).length,

        snapshotPending: runs.filter(
          (run) => run.snapshotStatus !== "done"
        ).length,

        publishPending: runs.filter(
          (run) => run.publishStatus !== "done"
        ).length,

        latestRunDate: newestRun?.runDate || null,
        latestRun: newestRun,
        latestPublished,
      },
    });
  } catch (error) {
    console.error("Closing runs summary error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load closing runs summary.",
    });
  }
};

// ======================================================
// GET /api/admin/closing-runs
// ======================================================

const getClosingRuns = async (req, res) => {
  try {
    const page = Math.max(
      1,
      parseInt(req.query.page, 10) || 1
    );

    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 20)
    );

    const search = String(req.query.search || "")
      .trim()
      .toLowerCase();

    const status = String(req.query.status || "")
      .trim()
      .toLowerCase();

    const roiStatus = String(req.query.roiStatus || "")
      .trim()
      .toLowerCase();

    const usdtStatus = String(req.query.usdtStatus || "")
      .trim()
      .toLowerCase();

    const snapshotStatus = String(
      req.query.snapshotStatus || ""
    ).trim().toLowerCase();

    const publishStatus = String(
      req.query.publishStatus || ""
    ).trim().toLowerCase();

    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();

    const sort = String(req.query.sort || "newest")
      .trim()
      .toLowerCase();

    const [rows] = await db.execute(BASE_SELECT);

    let runs = rows.map(formatRun);

    // Search by slot, snapshot, root, transaction hash.
    if (search) {
      runs = runs.filter((run) =>
        [
          run.slotKey,
          run.snapshotId,
          run.merkleRoot,
          run.txHash,
        ].some((value) =>
          String(value || "").toLowerCase().includes(search)
        )
      );
    }

    if (status === "complete") {
      runs = runs.filter((run) => run.complete);
    } else if (status === "pending") {
      runs = runs.filter((run) => !run.complete);
    }

    if (roiStatus) {
      runs = runs.filter(
        (run) => run.roiStatus === roiStatus
      );
    }

    if (usdtStatus) {
      runs = runs.filter(
        (run) => run.usdtStatus === usdtStatus
      );
    }

    if (snapshotStatus) {
      runs = runs.filter(
        (run) => run.snapshotStatus === snapshotStatus
      );
    }

    if (publishStatus) {
      runs = runs.filter(
        (run) => run.publishStatus === publishStatus
      );
    }

    if (from) {
      runs = runs.filter((run) => run.runDate >= from);
    }

    if (to) {
      runs = runs.filter((run) => run.runDate <= to);
    }

    if (sort === "oldest") {
      runs.sort((a, b) =>
        a.slotKey.localeCompare(b.slotKey)
      );
    } else if (sort === "updated") {
      runs.sort((a, b) =>
        String(b.updatedAt || "").localeCompare(
          String(a.updatedAt || "")
        )
      );
    } else {
      runs.sort((a, b) =>
        b.slotKey.localeCompare(a.slotKey)
      );
    }

    const total = runs.length;
    const offset = (page - 1) * limit;

    return res.status(200).json({
      success: true,
      data: {
        runs: runs.slice(offset, offset + limit),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Closing runs list error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load closing runs.",
    });
  }
};

// ======================================================
// GET /api/admin/closing-runs/:id
// The ID is the slot key, e.g. 2026-11-04_00.
// ======================================================

const getClosingRunDetails = async (req, res) => {
  try {
    const slotKey = String(req.params.id || "");

    if (!/^\d{4}-\d{2}-\d{2}_(00|03|06|09|12|15|18|21)$/.test(slotKey)) {
      return res.status(400).json({
        success: false,
        message: "Invalid closing slot key.",
      });
    }

    const [rows] = await db.execute(
      `${BASE_SELECT}
       WHERE s.slot_key = ?
       LIMIT 1`,
      [slotKey]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Closing run not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        run: formatRun(rows[0]),
      },
    });
  } catch (error) {
    console.error("Closing run details error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load closing run details.",
    });
  }
};

module.exports = {
  getClosingRunsSummary,
  getClosingRuns,
  getClosingRunDetails,
};
