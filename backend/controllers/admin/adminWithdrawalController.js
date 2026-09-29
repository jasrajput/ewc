const db = require("../../config/db");


// ======================================================
// HELPERS
// ======================================================

const getWithdrawalStatus = (status) => {
  return Number(status) === 1
    ? "Approved"
    : "Pending";
};


const formatWithdrawal = (row) => {
  return {
    id: Number(row.id),

    member: {
      id: row.member_id
        ? Number(row.member_id)
        : null,

      user_id:
        row.member_user_id || null,

      name:
        row.member_name || "",

      email:
        row.member_email || "",

      mobile_no:
        row.member_mobile || "",

      wallet:
        row.member_wallet || null,

      blocked:
        Number(
          row.member_status || 0
        ) === 1,
    },

    amount: Number(
      row.amount || 0
    ),

    pendingBalance: Number(
      row.pending_balance || 0
    ),

    status: Number(
      row.withdrawal_status || 0
    ),

    statusLabel:
      getWithdrawalStatus(
        row.withdrawal_status
      ),

    neftNo:
      row.neft_no || null,

    remarks:
      row.remarks || null,

    requestedAt:
      row.date_of_withdrawal ||
      null,

    approvedAt:
      Number(
        row.withdrawal_status
      ) === 1
        ? row.date_of_approved ||
          null
        : null,

    tds: Number(
      row.tds || 0
    ),

    adminCharge: Number(
      row.admin_charge || 0
    ),

    deduction: Number(
      row.deduction || 0
    ),

    payable: Number(
      row.payable || 0
    ),

    type: Number(
      row.type_is || 0
    ),

    apiStatus:
      row.api_status || null,

    blockchain: {
      txnId:
        row.txn_id || null,

      txId:
        row.tx_id || null,

      blockNumber:
        row.block_number !==
          null &&
        row.block_number !==
          undefined
          ? String(
              row.block_number
            )
          : null,

      logIndex:
        row.log_index !==
          null &&
        row.log_index !==
          undefined
          ? Number(
              row.log_index
            )
          : null,

      cumulativeAmount:
        Number(
          row.cumulative_amount ||
            0
        ),

      price:
        Number(
          row.price || 0
        ),
    },
  };
};


// ======================================================
// GET WITHDRAWAL SUMMARY
//
// GET /api/admin/withdrawals/summary
// ======================================================

const getWithdrawalSummary = async (
  req,
  res
) => {
  try {
    const [rows] =
      await db.execute(`
        SELECT

          COUNT(*) AS totalRequests,

          COALESCE(
            SUM(amount),
            0
          ) AS totalRequested,


          -- Pending = everything that is
          -- currently not status 1.
          SUM(
            CASE
              WHEN status <> 1
              THEN 1
              ELSE 0
            END
          ) AS pendingRequests,

          COALESCE(
            SUM(
              CASE
                WHEN status <> 1
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS pendingAmount,


          SUM(
            CASE
              WHEN status = 1
              THEN 1
              ELSE 0
            END
          ) AS approvedRequests,

          COALESCE(
            SUM(
              CASE
                WHEN status = 1
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS approvedAmount,


          COALESCE(
            SUM(payable),
            0
          ) AS totalPayable,


          COALESCE(
            SUM(deduction),
            0
          ) AS totalDeduction,


          COALESCE(
            SUM(tds),
            0
          ) AS totalTds,


          COALESCE(
            SUM(\`admin\`),
            0
          ) AS totalAdminCharge,


          -- TODAY
          SUM(
            CASE
              WHEN DATE(
                date_of_withdrawal
              ) = CURDATE()
              THEN 1
              ELSE 0
            END
          ) AS todayRequests,

          COALESCE(
            SUM(
              CASE
                WHEN DATE(
                  date_of_withdrawal
                ) = CURDATE()
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS todayRequested


        FROM withdrawals
      `);


    const row =
      rows[0] || {};


    return res.status(200).json({
      success: true,

      data: {
        totalRequests: Number(
          row.totalRequests || 0
        ),

        totalRequested: Number(
          row.totalRequested || 0
        ),

        pendingRequests: Number(
          row.pendingRequests || 0
        ),

        pendingAmount: Number(
          row.pendingAmount || 0
        ),

        approvedRequests: Number(
          row.approvedRequests || 0
        ),

        approvedAmount: Number(
          row.approvedAmount || 0
        ),

        totalPayable: Number(
          row.totalPayable || 0
        ),

        totalDeduction: Number(
          row.totalDeduction || 0
        ),

        totalTds: Number(
          row.totalTds || 0
        ),

        totalAdminCharge: Number(
          row.totalAdminCharge || 0
        ),

        todayRequests: Number(
          row.todayRequests || 0
        ),

        todayRequested: Number(
          row.todayRequested || 0
        ),
      },
    });

  } catch (error) {
    console.error(
      "Admin withdrawal summary error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load withdrawal summary.",
    });
  }
};


// ======================================================
// GET WITHDRAWALS
//
// GET /api/admin/withdrawals
// ======================================================

const getWithdrawals = async (
  req,
  res
) => {
  try {
    const search = String(
      req.query.search || ""
    ).trim();


    const status = String(
      req.query.status || ""
    )
      .trim()
      .toLowerCase();


    const requestedFrom = String(
      req.query.requestedFrom || ""
    ).trim();


    const requestedTo = String(
      req.query.requestedTo || ""
    ).trim();


    const approvedFrom = String(
      req.query.approvedFrom || ""
    ).trim();


    const approvedTo = String(
      req.query.approvedTo || ""
    ).trim();


    const minAmount =
      req.query.minAmount !==
        undefined &&
      req.query.minAmount !== ""
        ? Number(
            req.query.minAmount
          )
        : null;


    const maxAmount =
      req.query.maxAmount !==
        undefined &&
      req.query.maxAmount !== ""
        ? Number(
            req.query.maxAmount
          )
        : null;


    const blockchain = String(
      req.query.blockchain || ""
    )
      .trim()
      .toLowerCase();


    const sort = String(
      req.query.sort ||
        "newest"
    ).trim();


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
    // VALIDATE AMOUNTS
    // ==========================================

    if (
      minAmount !== null &&
      (
        !Number.isFinite(
          minAmount
        ) ||
        minAmount < 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Minimum amount must be a valid non-negative number.",
      });
    }


    if (
      maxAmount !== null &&
      (
        !Number.isFinite(
          maxAmount
        ) ||
        maxAmount < 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Maximum amount must be a valid non-negative number.",
      });
    }


    if (
      minAmount !== null &&
      maxAmount !== null &&
      minAmount > maxAmount
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Minimum amount cannot be greater than maximum amount.",
      });
    }


    // ==========================================
    // FILTERS
    // ==========================================

    const where = [];
    const params = [];


    if (search) {
      const term =
        `%${search}%`;

      where.push(`
        (
          m.user_id LIKE ?
          OR m.name LIKE ?
          OR m.email LIKE ?
          OR m.mobile_no LIKE ?
          OR m.trx LIKE ?
          OR w.txn_id LIKE ?
          OR w.tx_id LIKE ?
          OR w.neft_no LIKE ?
        )
      `);

      params.push(
        term,
        term,
        term,
        term,
        term,
        term,
        term,
        term
      );
    }


    if (status === "approved") {
      where.push(
        "w.status = 1"
      );
    }


    if (status === "pending") {
      where.push(
        "w.status <> 1"
      );
    }


    if (requestedFrom) {
      where.push(
        "DATE(w.date_of_withdrawal) >= ?"
      );

      params.push(
        requestedFrom
      );
    }


    if (requestedTo) {
      where.push(
        "DATE(w.date_of_withdrawal) <= ?"
      );

      params.push(
        requestedTo
      );
    }


    if (approvedFrom) {
      where.push(
        "DATE(w.date_of_approved) >= ?"
      );

      params.push(
        approvedFrom
      );
    }


    if (approvedTo) {
      where.push(
        "DATE(w.date_of_approved) <= ?"
      );

      params.push(
        approvedTo
      );
    }


    if (minAmount !== null) {
      where.push(
        "w.amount >= ?"
      );

      params.push(
        minAmount
      );
    }


    if (maxAmount !== null) {
      where.push(
        "w.amount <= ?"
      );

      params.push(
        maxAmount
      );
    }


    if (
      blockchain ===
      "recorded"
    ) {
      where.push(`
        (
          NULLIF(
            TRIM(w.txn_id),
            ''
          ) IS NOT NULL

          OR NULLIF(
            TRIM(w.tx_id),
            ''
          ) IS NOT NULL

          OR w.block_number
             IS NOT NULL
        )
      `);
    }


    if (
      blockchain ===
      "missing"
    ) {
      where.push(`
        (
          NULLIF(
            TRIM(w.txn_id),
            ''
          ) IS NULL

          AND NULLIF(
            TRIM(w.tx_id),
            ''
          ) IS NULL

          AND w.block_number
              IS NULL
        )
      `);
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
        "w.date_of_withdrawal DESC, w.id DESC",

      oldest:
        "w.date_of_withdrawal ASC, w.id ASC",

      amount_desc:
        "w.amount DESC, w.id DESC",

      amount_asc:
        "w.amount ASC, w.id DESC",

      payable_desc:
        "w.payable DESC, w.id DESC",

      payable_asc:
        "w.payable ASC, w.id DESC",

      approved_newest:
        `
          CASE
            WHEN w.status = 1
            THEN 0
            ELSE 1
          END ASC,
          w.date_of_approved DESC,
          w.id DESC
        `,
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

          FROM withdrawals w

          LEFT JOIN member m
            ON m.id = w.user_id

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

            w.id,

            w.amount,
            w.pending_balance,

            w.status
              AS withdrawal_status,

            w.neft_no,
            w.remarks,

            w.date_of_withdrawal,
            w.date_of_approved,

            w.tds,

            w.\`admin\`
              AS admin_charge,

            w.payable,
            w.api_status,
            w.deduction,
            w.type_is,

            w.txn_id,
            w.block_number,
            w.log_index,
            w.cumulative_amount,
            w.tx_id,
            w.price,


            m.id
              AS member_id,

            m.user_id
              AS member_user_id,

            m.name
              AS member_name,

            m.email
              AS member_email,

            m.mobile_no
              AS member_mobile,

            m.trx
              AS member_wallet,

            m.status
              AS member_status


          FROM withdrawals w

          LEFT JOIN member m
            ON m.id = w.user_id


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
        withdrawals:
          rows.map(
            formatWithdrawal
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
      "Admin withdrawals error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load withdrawals.",
    });
  }
};


// ======================================================
// GET SINGLE WITHDRAWAL
//
// GET /api/admin/withdrawals/:id
// ======================================================

const getWithdrawalDetails = async (
  req,
  res
) => {
  try {
    const withdrawalId =
      Number(
        req.params.id
      );


    if (
      !Number.isInteger(
        withdrawalId
      ) ||
      withdrawalId < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid withdrawal ID is required.",
      });
    }


    const [rows] =
      await db.execute(
        `
          SELECT

            w.id,

            w.amount,
            w.pending_balance,

            w.status
              AS withdrawal_status,

            w.neft_no,
            w.remarks,

            w.date_of_withdrawal,
            w.date_of_approved,

            w.tds,

            w.\`admin\`
              AS admin_charge,

            w.payable,
            w.api_status,
            w.deduction,
            w.type_is,

            w.txn_id,
            w.block_number,
            w.log_index,
            w.cumulative_amount,
            w.tx_id,
            w.price,


            m.id
              AS member_id,

            m.user_id
              AS member_user_id,

            m.name
              AS member_name,

            m.email
              AS member_email,

            m.mobile_no
              AS member_mobile,

            m.trx
              AS member_wallet,

            m.status
              AS member_status


          FROM withdrawals w

          LEFT JOIN member m
            ON m.id = w.user_id

          WHERE w.id = ?

          LIMIT 1
        `,
        [withdrawalId]
      );


    if (!rows[0]) {
      return res.status(404).json({
        success: false,
        message:
          "Withdrawal not found.",
      });
    }


    const withdrawal =
      formatWithdrawal(
        rows[0]
      );


    // ========================================
    // MEMBER WITHDRAWAL SUMMARY
    // ========================================

    let memberSummary = {
      totalRequests: 0,
      totalRequested: 0,
      pendingRequests: 0,
      pendingAmount: 0,
      approvedRequests: 0,
      approvedAmount: 0,
      totalPayable: 0,
    };


    if (
      withdrawal.member.id
    ) {
      const [summaryRows] =
        await db.execute(
          `
            SELECT

              COUNT(*)
                AS totalRequests,

              COALESCE(
                SUM(amount),
                0
              ) AS totalRequested,


              SUM(
                CASE
                  WHEN status <> 1
                  THEN 1
                  ELSE 0
                END
              ) AS pendingRequests,

              COALESCE(
                SUM(
                  CASE
                    WHEN status <> 1
                    THEN amount
                    ELSE 0
                  END
                ),
                0
              ) AS pendingAmount,


              SUM(
                CASE
                  WHEN status = 1
                  THEN 1
                  ELSE 0
                END
              ) AS approvedRequests,

              COALESCE(
                SUM(
                  CASE
                    WHEN status = 1
                    THEN amount
                    ELSE 0
                  END
                ),
                0
              ) AS approvedAmount,


              COALESCE(
                SUM(payable),
                0
              ) AS totalPayable


            FROM withdrawals

            WHERE user_id = ?
          `,
          [
            withdrawal.member.id,
          ]
        );


      const memberRow =
        summaryRows[0] || {};


      memberSummary = {
        totalRequests:
          Number(
            memberRow.totalRequests ||
              0
          ),

        totalRequested:
          Number(
            memberRow.totalRequested ||
              0
          ),

        pendingRequests:
          Number(
            memberRow.pendingRequests ||
              0
          ),

        pendingAmount:
          Number(
            memberRow.pendingAmount ||
              0
          ),

        approvedRequests:
          Number(
            memberRow.approvedRequests ||
              0
          ),

        approvedAmount:
          Number(
            memberRow.approvedAmount ||
              0
          ),

        totalPayable:
          Number(
            memberRow.totalPayable ||
              0
          ),
      };
    }


    return res.status(200).json({
      success: true,

      data: {
        withdrawal,
        memberSummary,
      },
    });

  } catch (error) {
    console.error(
      "Admin withdrawal details error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load withdrawal details.",
    });
  }
};


module.exports = {
  getWithdrawalSummary,
  getWithdrawals,
  getWithdrawalDetails,
};