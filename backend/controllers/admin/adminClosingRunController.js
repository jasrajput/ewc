const db = require("../../config/db");


// ======================================================
// HELPERS
// ======================================================

const formatRun = (row) => ({
  id: Number(row.id),

  runDate: row.run_date || null,

  roiStatus:
    row.roi_status || "pending",

  snapshotStatus:
    row.snapshot_status || "pending",

  snapshotId:
    row.snapshot_id || null,

  merkleRoot:
    row.merkle_root || null,

  publishStatus:
    row.publish_status || "pending",

  txHash:
    row.tx_hash || null,

  updatedAt:
    row.updated_at || null,

  complete:
    row.roi_status === "done" &&
    row.snapshot_status === "done" &&
    row.publish_status === "done",
});


// ======================================================
// SUMMARY
//
// GET /api/admin/closing-runs/summary
// ======================================================

const getClosingRunSummary = async (
  req,
  res
) => {
  try {
    const [summaryRows] =
      await db.execute(`
        SELECT

          COUNT(*) AS totalRuns,

          SUM(
            CASE
              WHEN roi_status = 'done'
               AND snapshot_status = 'done'
               AND publish_status = 'done'
              THEN 1
              ELSE 0
            END
          ) AS completedRuns,

          SUM(
            CASE
              WHEN roi_status <> 'done'
                OR snapshot_status <> 'done'
                OR publish_status <> 'done'
              THEN 1
              ELSE 0
            END
          ) AS pendingRuns,

          SUM(
            CASE
              WHEN roi_status = 'pending'
              THEN 1
              ELSE 0
            END
          ) AS roiPending,

          SUM(
            CASE
              WHEN snapshot_status = 'pending'
              THEN 1
              ELSE 0
            END
          ) AS snapshotPending,

          SUM(
            CASE
              WHEN publish_status = 'pending'
              THEN 1
              ELSE 0
            END
          ) AS publishPending,

          MAX(run_date) AS latestRunDate

        FROM closing_runs
      `);


    const summary =
      summaryRows[0] || {};


    // Latest run
    const [latestRows] =
      await db.execute(`
        SELECT
          id,
          run_date,
          roi_status,
          snapshot_status,
          snapshot_id,
          merkle_root,
          publish_status,
          tx_hash,
          updated_at

        FROM closing_runs

        ORDER BY
          run_date DESC,
          id DESC

        LIMIT 1
      `);


    // Latest successfully published run
    const [publishedRows] =
      await db.execute(`
        SELECT
          id,
          run_date,
          snapshot_id,
          merkle_root,
          tx_hash,
          updated_at

        FROM closing_runs

        WHERE publish_status = 'done'

        ORDER BY
          run_date DESC,
          id DESC

        LIMIT 1
      `);


    const latestRun =
      latestRows[0]
        ? formatRun(
            latestRows[0]
          )
        : null;


    const latestPublished =
      publishedRows[0]
        ? {
            id: Number(
              publishedRows[0].id
            ),

            runDate:
              publishedRows[0]
                .run_date ||
              null,

            snapshotId:
              publishedRows[0]
                .snapshot_id ||
              null,

            merkleRoot:
              publishedRows[0]
                .merkle_root ||
              null,

            txHash:
              publishedRows[0]
                .tx_hash ||
              null,

            updatedAt:
              publishedRows[0]
                .updated_at ||
              null,
          }
        : null;


    return res.status(200).json({
      success: true,

      data: {
        totalRuns: Number(
          summary.totalRuns || 0
        ),

        completedRuns: Number(
          summary.completedRuns || 0
        ),

        pendingRuns: Number(
          summary.pendingRuns || 0
        ),

        roiPending: Number(
          summary.roiPending || 0
        ),

        snapshotPending: Number(
          summary.snapshotPending || 0
        ),

        publishPending: Number(
          summary.publishPending || 0
        ),

        latestRunDate:
          summary.latestRunDate ||
          null,

        latestRun,

        latestPublished,
      },
    });

  } catch (error) {
    console.error(
      "Admin closing run summary error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load closing run summary.",
    });
  }
};


// ======================================================
// LIST
//
// GET /api/admin/closing-runs
// ======================================================

const getClosingRuns = async (
  req,
  res
) => {
  try {
    const status = String(
      req.query.status || ""
    )
      .trim()
      .toLowerCase();


    const roiStatus = String(
      req.query.roiStatus || ""
    )
      .trim()
      .toLowerCase();


    const snapshotStatus = String(
      req.query.snapshotStatus || ""
    )
      .trim()
      .toLowerCase();


    const publishStatus = String(
      req.query.publishStatus || ""
    )
      .trim()
      .toLowerCase();


    const from = String(
      req.query.from || ""
    ).trim();


    const to = String(
      req.query.to || ""
    ).trim();


    const search = String(
      req.query.search || ""
    ).trim();


    const sort = String(
      req.query.sort ||
        "newest"
    )
      .trim()
      .toLowerCase();


    const page = Math.max(
      Number(
        req.query.page
      ) || 1,
      1
    );


    const limit = Math.min(
      Math.max(
        Number(
          req.query.limit
        ) || 20,
        1
      ),
      100
    );


    const offset =
      (page - 1) * limit;


    // ==========================================
    // WHERE
    // ==========================================

    const where = [];
    const params = [];


    // Entire run status
    if (status === "complete") {
      where.push(`
        (
          roi_status = 'done'
          AND snapshot_status = 'done'
          AND publish_status = 'done'
        )
      `);
    }


    if (status === "pending") {
      where.push(`
        (
          roi_status = 'pending'
          OR snapshot_status = 'pending'
          OR publish_status = 'pending'
        )
      `);
    }


    // Individual stages
    if (
      ["pending", "done"].includes(
        roiStatus
      )
    ) {
      where.push(
        "roi_status = ?"
      );

      params.push(
        roiStatus
      );
    }


    if (
      ["pending", "done"].includes(
        snapshotStatus
      )
    ) {
      where.push(
        "snapshot_status = ?"
      );

      params.push(
        snapshotStatus
      );
    }


    if (
      ["pending", "done"].includes(
        publishStatus
      )
    ) {
      where.push(
        "publish_status = ?"
      );

      params.push(
        publishStatus
      );
    }


    // Dates
    if (from) {
      where.push(
        "run_date >= ?"
      );

      params.push(from);
    }


    if (to) {
      where.push(
        "run_date <= ?"
      );

      params.push(to);
    }


    // Snapshot / root / tx search
    if (search) {
      const term =
        `%${search}%`;

      where.push(`
        (
          snapshot_id LIKE ?
          OR merkle_root LIKE ?
          OR tx_hash LIKE ?
        )
      `);

      params.push(
        term,
        term,
        term
      );
    }


    const whereSql =
      where.length
        ? `WHERE ${where.join(
            " AND "
          )}`
        : "";


    // ==========================================
    // SORT
    // ==========================================

    const sortMap = {
      newest:
        "run_date DESC, id DESC",

      oldest:
        "run_date ASC, id ASC",

      updated:
        "updated_at DESC, id DESC",
    };


    const orderBy =
      sortMap[sort] ||
      sortMap.newest;


    // ==========================================
    // COUNT
    // ==========================================

    const [countRows] =
      await db.execute(
        `
          SELECT
            COUNT(*) AS total

          FROM closing_runs

          ${whereSql}
        `,
        params
      );


    const total =
      Number(
        countRows[0]?.total ||
          0
      );


    // ==========================================
    // LIST
    // ==========================================

    const [rows] =
      await db.execute(
        `
          SELECT
            id,
            run_date,
            roi_status,
            snapshot_status,
            snapshot_id,
            merkle_root,
            publish_status,
            tx_hash,
            updated_at

          FROM closing_runs

          ${whereSql}

          ORDER BY
            ${orderBy}

          LIMIT ? OFFSET ?
        `,
        [
          ...params,
          limit,
          offset,
        ]
      );


    return res.status(200).json({
      success: true,

      data: {
        runs:
          rows.map(
            formatRun
          ),

        pagination: {
          page,
          limit,
          total,

          totalPages:
            Math.ceil(
              total / limit
            ),
        },
      },
    });

  } catch (error) {
    console.error(
      "Admin closing runs error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load closing runs.",
    });
  }
};


// ======================================================
// SINGLE RUN
//
// GET /api/admin/closing-runs/:id
// ======================================================

const getClosingRunDetails = async (
  req,
  res
) => {
  try {
    const id =
      Number(
        req.params.id
      );


    if (
      !Number.isInteger(id) ||
      id < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid closing run ID is required.",
      });
    }


    const [rows] =
      await db.execute(
        `
          SELECT
            id,
            run_date,
            roi_status,
            snapshot_status,
            snapshot_id,
            merkle_root,
            publish_status,
            tx_hash,
            updated_at

          FROM closing_runs

          WHERE id = ?

          LIMIT 1
        `,
        [id]
      );


    if (!rows[0]) {
      return res.status(404).json({
        success: false,
        message:
          "Closing run not found.",
      });
    }


    return res.status(200).json({
      success: true,

      data: {
        run:
          formatRun(
            rows[0]
          ),
      },
    });

  } catch (error) {
    console.error(
      "Admin closing run details error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load closing run details.",
    });
  }
};


module.exports = {
  getClosingRunSummary,
  getClosingRuns,
  getClosingRunDetails,
};