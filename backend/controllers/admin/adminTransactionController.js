const db = require("../../config/db");


// ======================================================
// TRANSACTION TYPES
// ======================================================

const TRANSACTION_TYPES = {
  1: "Direct",
  5: "Rank",
  6: "Salary",
  7: "Reward",
};


const getTransactionType = (direction) => {
  return (
    TRANSACTION_TYPES[
      Number(direction)
    ] || "Other"
  );
};


// ======================================================
// FORMAT TRANSACTION
// ======================================================

const formatTransaction = (row) => {
  const credit =
    Number(row.credit || 0);

  const debit =
    Number(row.debit || 0);

  return {
    id: Number(row.id),

    direction:
      Number(row.direction),

    type:
      getTransactionType(
        row.direction
      ),

    credit,

    debit,

    net:
      credit - debit,

    description:
      row.description || "",

    createdAt:
      row.created_at || null,

    member: {
      id:
        row.member_id
          ? Number(row.member_id)
          : null,

      user_id:
        row.member_user_id ||
        null,

      name:
        row.member_name || "",

      email:
        row.member_email || "",

      mobile_no:
        row.member_mobile || "",

      wallet:
        row.member_wallet || null,

      status:
        Number(
          row.member_status || 0
        ),
    },
  };
};


// ======================================================
// SUMMARY
//
// GET /api/admin/transactions/summary
// ======================================================

const getTransactionSummary = async (
  req,
  res
) => {
  try {
    const [rows] =
      await db.execute(`
        SELECT

          COUNT(*) AS totalTransactions,

          COALESCE(
            SUM(credit),
            0
          ) AS totalCredits,

          COALESCE(
            SUM(debit),
            0
          ) AS totalDebits,

          COALESCE(
            SUM(credit),
            0
          )
          -
          COALESCE(
            SUM(debit),
            0
          ) AS netLedger,


          COALESCE(
            SUM(
              CASE
                WHEN direction = 1
                THEN credit
                ELSE 0
              END
            ),
            0
          ) AS directIncome,


          COALESCE(
            SUM(
              CASE
                WHEN direction = 5
                THEN credit
                ELSE 0
              END
            ),
            0
          ) AS rankIncome,


          COALESCE(
            SUM(
              CASE
                WHEN direction = 6
                THEN credit
                ELSE 0
              END
            ),
            0
          ) AS salaryIncome,


          COALESCE(
            SUM(
              CASE
                WHEN direction = 7
                THEN credit
                ELSE 0
              END
            ),
            0
          ) AS rewardIncome,


          SUM(
            CASE
              WHEN DATE(created_at)
                   = CURDATE()
              THEN 1
              ELSE 0
            END
          ) AS todayTransactions,


          COALESCE(
            SUM(
              CASE
                WHEN DATE(created_at)
                     = CURDATE()
                THEN credit
                ELSE 0
              END
            ),
            0
          ) AS todayCredits,


          COALESCE(
            SUM(
              CASE
                WHEN DATE(created_at)
                     = CURDATE()
                THEN debit
                ELSE 0
              END
            ),
            0
          ) AS todayDebits


        FROM trasections
      `);


    const row =
      rows[0] || {};


    return res.status(200).json({
      success: true,

      data: {
        totalTransactions:
          Number(
            row.totalTransactions ||
              0
          ),

        totalCredits:
          Number(
            row.totalCredits || 0
          ),

        totalDebits:
          Number(
            row.totalDebits || 0
          ),

        netLedger:
          Number(
            row.netLedger || 0
          ),

        income: {
          direct:
            Number(
              row.directIncome ||
                0
            ),

          rank:
            Number(
              row.rankIncome ||
                0
            ),

          salary:
            Number(
              row.salaryIncome ||
                0
            ),

          reward:
            Number(
              row.rewardIncome ||
                0
            ),
        },

        today: {
          transactions:
            Number(
              row.todayTransactions ||
                0
            ),

          credits:
            Number(
              row.todayCredits ||
                0
            ),

          debits:
            Number(
              row.todayDebits ||
                0
            ),
        },
      },
    });

  } catch (error) {
    console.error(
      "Admin transaction summary error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load transaction summary.",
    });
  }
};


// ======================================================
// TRANSACTION LIST
//
// GET /api/admin/transactions
// ======================================================

const getTransactions = async (
  req,
  res
) => {
  try {
    const search = String(
      req.query.search || ""
    ).trim();


    const type = String(
      req.query.type || ""
    )
      .trim()
      .toLowerCase();


    const flow = String(
      req.query.flow || ""
    )
      .trim()
      .toLowerCase();


    const from = String(
      req.query.from || ""
    ).trim();


    const to = String(
      req.query.to || ""
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
    // VALIDATION
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
          OR t.description LIKE ?
          OR CAST(t.id AS CHAR) LIKE ?
        )
      `);

      params.push(
        term,
        term,
        term,
        term,
        term,
        term,
        term
      );
    }


    // ==========================================
    // TYPE
    // ==========================================

    const typeMap = {
      direct: 1,
      rank: 5,
      salary: 6,
      reward: 7,
    };


    if (
      Object.prototype
        .hasOwnProperty.call(
          typeMap,
          type
        )
    ) {
      where.push(
        "t.direction = ?"
      );

      params.push(
        typeMap[type]
      );
    }


    // ==========================================
    // FLOW
    // ==========================================

    if (flow === "credit") {
      where.push(
        "t.credit > 0"
      );
    }


    if (flow === "debit") {
      where.push(
        "t.debit > 0"
      );
    }


    // ==========================================
    // DATE
    // ==========================================

    if (from) {
      where.push(
        "DATE(t.created_at) >= ?"
      );

      params.push(from);
    }


    if (to) {
      where.push(
        "DATE(t.created_at) <= ?"
      );

      params.push(to);
    }


    // ==========================================
    // AMOUNT
    //
    // Uses whichever side of the ledger contains
    // the larger recorded value.
    // ==========================================

    if (minAmount !== null) {
      where.push(`
        GREATEST(
          COALESCE(t.credit, 0),
          COALESCE(t.debit, 0)
        ) >= ?
      `);

      params.push(
        minAmount
      );
    }


    if (maxAmount !== null) {
      where.push(`
        GREATEST(
          COALESCE(t.credit, 0),
          COALESCE(t.debit, 0)
        ) <= ?
      `);

      params.push(
        maxAmount
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
        "t.created_at DESC, t.id DESC",

      oldest:
        "t.created_at ASC, t.id ASC",

      highest:
        `
          GREATEST(
            COALESCE(t.credit, 0),
            COALESCE(t.debit, 0)
          ) DESC,
          t.id DESC
        `,

      lowest:
        `
          GREATEST(
            COALESCE(t.credit, 0),
            COALESCE(t.debit, 0)
          ) ASC,
          t.id ASC
        `,

      credit_desc:
        "t.credit DESC, t.id DESC",

      debit_desc:
        "t.debit DESC, t.id DESC",
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

          FROM trasections t

          LEFT JOIN member m
            ON m.id = t.user_id

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

            t.id,
            t.credit,
            t.debit,
            t.direction,
            t.description,
            t.created_at,


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


          FROM trasections t

          LEFT JOIN member m
            ON m.id = t.user_id


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
        transactions:
          rows.map(
            formatTransaction
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
      "Admin transactions error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load transactions.",
    });
  }
};


// ======================================================
// SINGLE TRANSACTION
//
// GET /api/admin/transactions/:id
// ======================================================

const getTransactionDetails = async (
  req,
  res
) => {
  try {
    const transactionId =
      Number(
        req.params.id
      );


    if (
      !Number.isInteger(
        transactionId
      ) ||
      transactionId < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid transaction ID is required.",
      });
    }


    const [rows] =
      await db.execute(
        `
          SELECT

            t.id,
            t.credit,
            t.debit,
            t.direction,
            t.description,
            t.created_at,


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


          FROM trasections t

          LEFT JOIN member m
            ON m.id = t.user_id

          WHERE t.id = ?

          LIMIT 1
        `,
        [transactionId]
      );


    if (!rows[0]) {
      return res.status(404).json({
        success: false,
        message:
          "Transaction not found.",
      });
    }


    const transaction =
      formatTransaction(
        rows[0]
      );


    // ==========================================
    // MEMBER LEDGER SUMMARY
    // ==========================================

    let memberSummary = null;


    if (
      transaction.member.id
    ) {
      const [summaryRows] =
        await db.execute(
          `
            SELECT

              COUNT(*)
                AS totalTransactions,

              COALESCE(
                SUM(credit),
                0
              ) AS totalCredits,

              COALESCE(
                SUM(debit),
                0
              ) AS totalDebits,

              COALESCE(
                SUM(credit),
                0
              )
              -
              COALESCE(
                SUM(debit),
                0
              ) AS netLedger

            FROM trasections

            WHERE user_id = ?
          `,
          [
            transaction
              .member.id,
          ]
        );


      const row =
        summaryRows[0] || {};


      memberSummary = {
        totalTransactions:
          Number(
            row.totalTransactions ||
              0
          ),

        totalCredits:
          Number(
            row.totalCredits || 0
          ),

        totalDebits:
          Number(
            row.totalDebits || 0
          ),

        netLedger:
          Number(
            row.netLedger || 0
          ),
      };
    }


    return res.status(200).json({
      success: true,

      data: {
        transaction,
        memberSummary,
      },
    });

  } catch (error) {
    console.error(
      "Admin transaction details error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load transaction details.",
    });
  }
};


module.exports = {
  getTransactionSummary,
  getTransactions,
  getTransactionDetails,
};