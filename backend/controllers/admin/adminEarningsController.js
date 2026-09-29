const db = require("../../config/db");


// ==========================================
// EWC EARNING DIRECTIONS
// ==========================================

const EARNING_DIRECTIONS = {
  1: "Direct Income",
  5: "Rank Income",
  6: "Salary Income",
  7: "Reward Income",
};


// ==========================================
// GET ADMIN EARNINGS
//
// GET /api/admin/earnings
//
// Supported filters:
//
// ?search=jas
// ?member=jas1
// ?direction=1
// ?from=2026-09-01
// ?to=2026-09-30
// ?sort=newest
// ?page=1
// ?limit=20
//
// ==========================================

const getEarnings = async (req, res) => {
  try {
    const {
      search = "",
      member = "",
      direction = "",
      from = "",
      to = "",
      sort = "newest",
      page = 1,
      limit = 20,
    } = req.query;


    // ========================================
    // PAGINATION
    // ========================================

    const currentPage = Math.max(
      Number(page) || 1,
      1
    );

    const pageLimit = Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

    const offset =
      (currentPage - 1) * pageLimit;


    // ========================================
    // WHERE
    // ========================================

    const where = [
      "t.direction IN (1, 5, 6, 7)",
      "t.credit > 0",
    ];

    const params = [];


    // ========================================
    // SEARCH
    // ========================================

    const searchValue = String(search).trim();

    if (searchValue) {
      const term = `%${searchValue}%`;

      where.push(`
        (
          m.user_id LIKE ?
          OR m.name LIKE ?
          OR m.email LIKE ?
          OR t.description LIKE ?
        )
      `);

      params.push(
        term,
        term,
        term,
        term
      );
    }


    // ========================================
    // EXACT MEMBER FILTER
    //
    // Member Details sends:
    // /admin/earnings?member=jas1
    // ========================================

    const memberValue = String(member).trim();

    if (memberValue) {
      where.push(
        "m.user_id = ?"
      );

      params.push(memberValue);
    }


    // ========================================
    // DIRECTION FILTER
    // ========================================

    if (
      direction !== "" &&
      direction !== undefined &&
      direction !== null
    ) {
      const directionNumber =
        Number(direction);

      if (
        ![1, 5, 6, 7].includes(
          directionNumber
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid earning type.",
        });
      }

      where.push(
        "t.direction = ?"
      );

      params.push(
        directionNumber
      );
    }


    // ========================================
    // DATE FILTERS
    // ========================================

    if (from) {
      where.push(
        "t.created_at >= ?"
      );

      params.push(
        `${from} 00:00:00`
      );
    }

    if (to) {
      where.push(
        "t.created_at <= ?"
      );

      params.push(
        `${to} 23:59:59`
      );
    }


    const whereSql = `
      WHERE ${where.join(" AND ")}
    `;


    // ========================================
    // SORT
    // ========================================

    const sortOptions = {
      newest: "t.id DESC",
      oldest: "t.id ASC",

      amount_high:
        "t.credit DESC, t.id DESC",

      amount_low:
        "t.credit ASC, t.id DESC",
    };

    const orderBy =
      sortOptions[sort] ||
      sortOptions.newest;


    // ========================================
    // COUNT
    // ========================================

    const [countRows] =
      await db.execute(
        `
          SELECT
            COUNT(*) AS total

          FROM trasections t

          INNER JOIN member m
            ON m.id = t.user_id

          ${whereSql}
        `,
        params
      );

    const total = Number(
      countRows[0]?.total || 0
    );


    // ========================================
    // SUMMARY
    //
    // IMPORTANT:
    // This summary respects member/search/date
    // filters but intentionally does NOT apply
    // the selected direction filter.
    //
    // Example:
    // if viewing jas1 + Direct Income,
    // cards still show jas1's Direct/Rank/
    // Salary/Reward totals together.
    // ========================================

    const summaryWhere = [
      "t.direction IN (1, 5, 6, 7)",
      "t.credit > 0",
    ];

    const summaryParams = [];


    if (searchValue) {
      const term = `%${searchValue}%`;

      summaryWhere.push(`
        (
          m.user_id LIKE ?
          OR m.name LIKE ?
          OR m.email LIKE ?
          OR t.description LIKE ?
        )
      `);

      summaryParams.push(
        term,
        term,
        term,
        term
      );
    }


    if (memberValue) {
      summaryWhere.push(
        "m.user_id = ?"
      );

      summaryParams.push(
        memberValue
      );
    }


    if (from) {
      summaryWhere.push(
        "t.created_at >= ?"
      );

      summaryParams.push(
        `${from} 00:00:00`
      );
    }


    if (to) {
      summaryWhere.push(
        "t.created_at <= ?"
      );

      summaryParams.push(
        `${to} 23:59:59`
      );
    }


    const summaryWhereSql = `
      WHERE ${summaryWhere.join(
        " AND "
      )}
    `;


    const [summaryRows] =
      await db.execute(
        `
          SELECT

            COALESCE(
              SUM(
                CASE
                  WHEN t.direction = 1
                  THEN t.credit
                  ELSE 0
                END
              ),
              0
            ) AS directIncome,

            COALESCE(
              SUM(
                CASE
                  WHEN t.direction = 5
                  THEN t.credit
                  ELSE 0
                END
              ),
              0
            ) AS rankIncome,

            COALESCE(
              SUM(
                CASE
                  WHEN t.direction = 6
                  THEN t.credit
                  ELSE 0
                END
              ),
              0
            ) AS salaryIncome,

            COALESCE(
              SUM(
                CASE
                  WHEN t.direction = 7
                  THEN t.credit
                  ELSE 0
                END
              ),
              0
            ) AS rewardIncome,

            COALESCE(
              SUM(
                CASE
                  WHEN t.direction
                    IN (1, 5, 6, 7)
                  THEN t.credit
                  ELSE 0
                END
              ),
              0
            ) AS totalIncome,

            COUNT(*) AS totalEntries,

            COUNT(
              DISTINCT t.user_id
            ) AS earningMembers

          FROM trasections t

          INNER JOIN member m
            ON m.id = t.user_id

          ${summaryWhereSql}
        `,
        summaryParams
      );


    const summary =
      summaryRows[0] || {};


    // ========================================
    // EARNINGS
    // ========================================

    const queryParams = [
      ...params,
      pageLimit,
      offset,
    ];


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

            m.id AS member_id,
            m.user_id,
            m.name,
            m.email,
            m.level_achieved,
            m.status

          FROM trasections t

          INNER JOIN member m
            ON m.id = t.user_id

          ${whereSql}

          ORDER BY ${orderBy}

          LIMIT ? OFFSET ?
        `,
        queryParams
      );


    // ========================================
    // FORMAT RESPONSE
    // ========================================

    const earnings = rows.map(
      (row) => {
        const directionNumber =
          Number(row.direction);

        const rankNumber =
          Number(
            row.level_achieved || 0
          );

        return {
          id: row.id,

          amount: Number(
            row.credit || 0
          ),

          direction:
            directionNumber,

          type:
            EARNING_DIRECTIONS[
              directionNumber
            ] || "Income",

          description:
            row.description || "",

          created_at:
            row.created_at,

          member: {
            id: row.member_id,

            user_id:
              row.user_id,

            name:
              row.name || "",

            email:
              row.email || "",

            rank:
              rankNumber > 0
                ? `E-${String(
                    rankNumber
                  ).padStart(
                    2,
                    "0"
                  )}`
                : "Unranked",

            blocked:
              Number(
                row.status
              ) === 1,
          },
        };
      }
    );


    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,

      data: {
        summary: {
          totalIncome: Number(
            summary.totalIncome || 0
          ),

          directIncome: Number(
            summary.directIncome || 0
          ),

          rankIncome: Number(
            summary.rankIncome || 0
          ),

          salaryIncome: Number(
            summary.salaryIncome || 0
          ),

          rewardIncome: Number(
            summary.rewardIncome || 0
          ),

          totalEntries: Number(
            summary.totalEntries || 0
          ),

          earningMembers: Number(
            summary.earningMembers || 0
          ),
        },

        earnings,

        pagination: {
          page: currentPage,
          limit: pageLimit,
          total,

          totalPages:
            Math.ceil(
              total / pageLimit
            ),
        },

        filters: {
          search: searchValue,
          member: memberValue,

          direction:
            direction === ""
              ? null
              : Number(direction),

          from: from || null,
          to: to || null,
          sort:
  Object.prototype.hasOwnProperty.call(
    sortOptions,
    sort
  )
    ? sort
    : "newest",
        },
      },
    });
  } catch (error) {
    console.error(
      "Admin earnings error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load earnings.",
    });
  }
};


module.exports = {
  getEarnings,
};