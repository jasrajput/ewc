const db = require("../../config/db");


// ======================================================
// BUSINESS CONFIG
// ======================================================

// Reward begins from day 101.
// Therefore 100 complete days must pass first.
const REWARD_WAIT_DAYS = 100;

// 2% of original USD/USDT investment per month.
const MONTHLY_REWARD_PERCENT = 2;


// ======================================================
// HELPERS
// ======================================================

const formatRank = (rank) => {
  const value = Number(rank || 0);

  if (value < 1 || value > 12) {
    return "Unranked";
  }

  return `E-${String(value).padStart(2, "0")}`;
};


const formatInvestment = (row) => {
  const packageAmount = Number(
    row.pack_amount || 0
  );

  const monthlyRewardUsd =
    packageAmount *
    (MONTHLY_REWARD_PERCENT / 100);

  return {
    id: Number(row.id),

    member: {
      id: Number(row.member_id),

      user_id:
        row.user_id || null,

      name:
        row.name || "",

      email:
        row.email || "",

      mobile_no:
        row.mobile_no || "",

      country:
        row.country || "",

      sponsor_user_id:
        row.real_sponsor_id ||
        null,

      rank: Number(
        row.level_achieved || 0
      ),

      rankLabel: formatRank(
        row.level_achieved
      ),

      status: Number(
        row.member_status || 0
      ),

      blocked:
        Number(
          row.member_status
        ) === 1,

      walletRegistered:
        Boolean(
          row.trx &&
            String(row.trx).trim()
        ),
    },


    // ========================================
    // INVESTMENT
    // ========================================

    packAmount:
      packageAmount,

    roiPer: Number(
      row.roi_per || 0
    ),

    roiComp: Number(
      row.roi_comp || 0
    ),

    status: Number(
      row.investment_status || 0
    ),

    createdOn:
      row.created_on || null,

    lastRoiDate:
      row.last_roi_date || null,

    tokenAmount: Number(
      row.token_amount || 0
    ),

    currentPrice: Number(
      row.current_price || 0
    ),


    // ========================================
    // REWARD PROJECTION
    // ========================================

    reward: {
      waitDays:
        REWARD_WAIT_DAYS,

      monthlyPercent:
        MONTHLY_REWARD_PERCENT,

      monthlyRewardUsd:
        Number(
          monthlyRewardUsd.toFixed(
            2
          )
        ),

      rewardStartDate:
        row.reward_start_date ||
        null,

      ageDays: Math.max(
        Number(
          row.age_days || 0
        ),
        0
      ),

      eligible:
        Number(
          row.reward_eligible ||
            0
        ) === 1,
    },
  };
};


// ======================================================
// GET INVESTMENT SUMMARY
//
// GET /api/admin/investments/summary
// ======================================================

const getInvestmentSummary = async (
  req,
  res
) => {
  try {
    const [rows] =
      await db.execute(
        `
          SELECT

            COUNT(*) AS totalInvestments,

            COUNT(
              DISTINCT sp.u_id
            ) AS uniqueInvestors,

            COALESCE(
              SUM(sp.pack_amount),
              0
            ) AS totalInvested,

            COALESCE(
              AVG(sp.pack_amount),
              0
            ) AS averageInvestment,

            COALESCE(
              MAX(sp.pack_amount),
              0
            ) AS highestInvestment,


            -- =================================
            -- TODAY
            -- =================================

            SUM(
              CASE
                WHEN DATE(sp.created_on)
                     = CURDATE()
                THEN 1
                ELSE 0
              END
            ) AS todayInvestments,

            COALESCE(
              SUM(
                CASE
                  WHEN DATE(sp.created_on)
                       = CURDATE()
                  THEN sp.pack_amount
                  ELSE 0
                END
              ),
              0
            ) AS todayInvested,


            -- =================================
            -- DAY-101 ELIGIBILITY
            -- =================================

            SUM(
              CASE
                WHEN CURDATE() >=
                     DATE_ADD(
                       DATE(sp.created_on),
                       INTERVAL ? DAY
                     )
                THEN 1
                ELSE 0
              END
            ) AS rewardEligibleInvestments,


            COALESCE(
              SUM(
                CASE
                  WHEN CURDATE() >=
                       DATE_ADD(
                         DATE(sp.created_on),
                         INTERVAL ? DAY
                       )
                  THEN sp.pack_amount
                  ELSE 0
                END
              ),
              0
            ) AS rewardEligiblePrincipal,


            -- =================================
            -- PROJECTED MONTHLY REWARD
            --
            -- 2% of original USD investment.
            -- This is NOT token distribution.
            -- =================================

            COALESCE(
              SUM(
                CASE
                  WHEN CURDATE() >=
                       DATE_ADD(
                         DATE(sp.created_on),
                         INTERVAL ? DAY
                       )
                  THEN
                    sp.pack_amount
                    * (? / 100)
                  ELSE 0
                END
              ),
              0
            ) AS projectedMonthlyRewardUsd

          FROM select_packages sp
        `,
        [
          REWARD_WAIT_DAYS,
          REWARD_WAIT_DAYS,
          REWARD_WAIT_DAYS,
          MONTHLY_REWARD_PERCENT,
        ]
      );


    const row =
      rows[0] || {};


    return res.status(200).json({
      success: true,

      data: {
        totalInvestments: Number(
          row.totalInvestments || 0
        ),

        uniqueInvestors: Number(
          row.uniqueInvestors || 0
        ),

        totalInvested: Number(
          row.totalInvested || 0
        ),

        averageInvestment: Number(
          row.averageInvestment || 0
        ),

        highestInvestment: Number(
          row.highestInvestment || 0
        ),

        todayInvestments: Number(
          row.todayInvestments || 0
        ),

        todayInvested: Number(
          row.todayInvested || 0
        ),

        rewardEligibleInvestments:
          Number(
            row.rewardEligibleInvestments ||
              0
          ),

        rewardEligiblePrincipal:
          Number(
            row.rewardEligiblePrincipal ||
              0
          ),

        projectedMonthlyRewardUsd:
          Number(
            row.projectedMonthlyRewardUsd ||
              0
          ),

        rewardPolicy: {
          waitDays:
            REWARD_WAIT_DAYS,

          startsFromDay: 101,

          monthlyPercent:
            MONTHLY_REWARD_PERCENT,

          basis:
            "Original USD investment value",
        },
      },
    });

  } catch (error) {
    console.error(
      "Admin investment summary error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to load investment summary.",
    });
  }
};


// ======================================================
// GET INVESTMENTS
//
// GET /api/admin/investments
//
// One row = one select_packages record.
// ======================================================

const getInvestments = async (
  req,
  res
) => {
  try {
    const search = String(
      req.query.search || ""
    ).trim();


    const eligibility = String(
      req.query.eligibility || ""
    )
      .trim()
      .toLowerCase();


    const memberStatus = String(
      req.query.status || ""
    )
      .trim()
      .toLowerCase();


    const investedFrom = String(
      req.query.investedFrom || ""
    ).trim();


    const investedTo = String(
      req.query.investedTo || ""
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
          OR m.real_sponsor_id LIKE ?
        )
      `);

      params.push(
        term,
        term,
        term,
        term,
        term
      );
    }


    if (
      eligibility ===
      "eligible"
    ) {
      where.push(`
        CURDATE() >=
        DATE_ADD(
          DATE(sp.created_on),
          INTERVAL ${REWARD_WAIT_DAYS} DAY
        )
      `);
    }


    if (
      eligibility ===
      "waiting"
    ) {
      where.push(`
        CURDATE() <
        DATE_ADD(
          DATE(sp.created_on),
          INTERVAL ${REWARD_WAIT_DAYS} DAY
        )
      `);
    }


    if (
      memberStatus ===
      "active"
    ) {
      where.push(
        "m.status = 0"
      );
    }


    if (
      memberStatus ===
      "blocked"
    ) {
      where.push(
        "m.status = 1"
      );
    }


    if (investedFrom) {
      where.push(
        "DATE(sp.created_on) >= ?"
      );

      params.push(
        investedFrom
      );
    }


    if (investedTo) {
      where.push(
        "DATE(sp.created_on) <= ?"
      );

      params.push(
        investedTo
      );
    }


    if (minAmount !== null) {
      where.push(
        "sp.pack_amount >= ?"
      );

      params.push(
        minAmount
      );
    }


    if (maxAmount !== null) {
      where.push(
        "sp.pack_amount <= ?"
      );

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
        "sp.created_on DESC, sp.id DESC",

      oldest:
        "sp.created_on ASC, sp.id ASC",

      amount_desc:
        "sp.pack_amount DESC, sp.id DESC",

      amount_asc:
        "sp.pack_amount ASC, sp.id DESC",

      reward_start:
        `
          DATE_ADD(
            DATE(sp.created_on),
            INTERVAL ${REWARD_WAIT_DAYS} DAY
          ) ASC,
          sp.id ASC
        `,

      roi_desc:
        "sp.roi_per DESC, sp.id DESC",
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

          FROM select_packages sp

          INNER JOIN member m
            ON m.id = sp.u_id

          ${whereSql}
        `,
        params
      );


    const total =
      Number(
        countRows[0]?.total || 0
      );


    // ==========================================
    // LIST
    // ==========================================

    const [rows] =
      await db.execute(
        `
          SELECT

            -- INVESTMENT
            sp.id,
            sp.u_id,
            sp.pack_amount,
            sp.roi_per,
            sp.roi_comp,
            sp.status
              AS investment_status,
            sp.created_on,
            sp.last_roi_date,
            sp.token_amount,
            sp.current_price,


            -- MEMBER
            m.id
              AS member_id,

            m.user_id,
            m.real_sponsor_id,
            m.name,
            m.email,
            m.mobile_no,
            m.country,
            m.level_achieved,
            m.status
              AS member_status,
            m.trx,


            -- =================================
            -- REWARD CALCULATIONS
            -- =================================

            DATE_ADD(
              DATE(sp.created_on),
              INTERVAL ${REWARD_WAIT_DAYS} DAY
            ) AS reward_start_date,


            GREATEST(
              DATEDIFF(
                CURDATE(),
                DATE(sp.created_on)
              ),
              0
            ) AS age_days,


            CASE
              WHEN CURDATE() >=
                   DATE_ADD(
                     DATE(sp.created_on),
                     INTERVAL ${REWARD_WAIT_DAYS} DAY
                   )
              THEN 1
              ELSE 0
            END AS reward_eligible


          FROM select_packages sp

          INNER JOIN member m
            ON m.id = sp.u_id


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
        investments:
          rows.map(
            formatInvestment
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

        rewardPolicy: {
          waitDays:
            REWARD_WAIT_DAYS,

          startsFromDay: 101,

          monthlyPercent:
            MONTHLY_REWARD_PERCENT,

          basis:
            "Original USD investment value",
        },
      },
    });

  } catch (error) {
    console.error(
      "Admin investments error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to load investments.",
    });
  }
};


// ======================================================
// GET MEMBER INVESTMENT DETAILS
//
// GET /api/admin/investments/member/:id
//
// :id = numeric member.id
// ======================================================

const getMemberInvestmentDetails =
  async (req, res) => {
    try {
      const memberId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(
          memberId
        ) ||
        memberId < 1
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Valid member ID is required.",
        });
      }


      // ========================================
      // MEMBER
      // ========================================

      const [memberRows] =
        await db.execute(
          `
            SELECT
              m.id,
              m.user_id,
              m.real_sponsor_id,
              m.name,
              m.email,
              m.mobile_no,
              m.country,

              m.package_choose,
              m.package_amount,

              m.level_achieved,
              m.status,
              m.roi_status,

              m.trx,
              m.dateOfJoining,
              m.date_of_activation,

              sponsor.id
                AS sponsor_member_id,

              sponsor.name
                AS sponsor_name

            FROM member m

            LEFT JOIN member sponsor
              ON sponsor.user_id
                 = m.real_sponsor_id

            WHERE m.id = ?

            LIMIT 1
          `,
          [memberId]
        );


      if (!memberRows[0]) {
        return res.status(404).json({
          success: false,

          message:
            "Member not found.",
        });
      }


      const memberRow =
        memberRows[0];


      // ========================================
      // ALL INVESTMENT RECORDS
      // ========================================

      const [investmentRows] =
        await db.execute(
          `
            SELECT
              sp.id,
              sp.u_id,
              sp.pack_amount,
              sp.roi_per,
              sp.roi_comp,

              sp.status
                AS investment_status,

              sp.created_on,
              sp.last_roi_date,
              sp.token_amount,
              sp.current_price,


              m.id
                AS member_id,

              m.user_id,
              m.real_sponsor_id,
              m.name,
              m.email,
              m.mobile_no,
              m.country,
              m.level_achieved,

              m.status
                AS member_status,

              m.trx,


              DATE_ADD(
                DATE(sp.created_on),
                INTERVAL ${REWARD_WAIT_DAYS} DAY
              ) AS reward_start_date,


              GREATEST(
                DATEDIFF(
                  CURDATE(),
                  DATE(sp.created_on)
                ),
                0
              ) AS age_days,


              CASE
                WHEN CURDATE() >=
                     DATE_ADD(
                       DATE(sp.created_on),
                       INTERVAL ${REWARD_WAIT_DAYS} DAY
                     )
                THEN 1
                ELSE 0
              END AS reward_eligible


            FROM select_packages sp

            INNER JOIN member m
              ON m.id = sp.u_id

            WHERE sp.u_id = ?

            ORDER BY
              sp.created_on DESC,
              sp.id DESC
          `,
          [memberId]
        );


      // ========================================
      // MEMBER INVESTMENT TOTALS
      // ========================================

      const [totalRows] =
        await db.execute(
          `
            SELECT

              COUNT(*) AS investmentCount,

              COALESCE(
                SUM(pack_amount),
                0
              ) AS totalInvested,

              COALESCE(
                MAX(pack_amount),
                0
              ) AS highestInvestment,

              MIN(created_on)
                AS firstInvestmentDate,

              MAX(created_on)
                AS latestInvestmentDate,


              SUM(
                CASE
                  WHEN CURDATE() >=
                       DATE_ADD(
                         DATE(created_on),
                         INTERVAL ${REWARD_WAIT_DAYS} DAY
                       )
                  THEN 1
                  ELSE 0
                END
              ) AS eligibleInvestments,


              COALESCE(
                SUM(
                  CASE
                    WHEN CURDATE() >=
                         DATE_ADD(
                           DATE(created_on),
                           INTERVAL ${REWARD_WAIT_DAYS} DAY
                         )
                    THEN
                      pack_amount
                      * (
                        ${MONTHLY_REWARD_PERCENT}
                        / 100
                      )
                    ELSE 0
                  END
                ),
                0
              ) AS projectedMonthlyRewardUsd


            FROM select_packages

            WHERE u_id = ?
          `,
          [memberId]
        );


      const totals =
        totalRows[0] || {};


      // ========================================
      // MEMBER RESPONSE
      // ========================================

      const member = {
        id: Number(
          memberRow.id
        ),

        user_id:
          memberRow.user_id ||
          null,

        name:
          memberRow.name || "",

        email:
          memberRow.email || "",

        mobile_no:
          memberRow.mobile_no ||
          "",

        country:
          memberRow.country || "",

        sponsor_user_id:
          memberRow.real_sponsor_id ||
          null,

        sponsor:
          memberRow.real_sponsor_id
            ? {
                id:
                  memberRow.sponsor_member_id
                    ? Number(
                        memberRow.sponsor_member_id
                      )
                    : null,

                user_id:
                  memberRow.real_sponsor_id,

                name:
                  memberRow.sponsor_name ||
                  null,
              }
            : null,

        package_choose:
          Number(
            memberRow.package_choose ||
              0
          ),

        package_amount:
          Number(
            memberRow.package_amount ||
              0
          ),

        level_achieved:
          Number(
            memberRow.level_achieved ||
              0
          ),

        rankLabel:
          formatRank(
            memberRow.level_achieved
          ),

        status:
          Number(
            memberRow.status || 0
          ),

        blocked:
          Number(
            memberRow.status
          ) === 1,

        roiStatus:
          Number(
            memberRow.roi_status ||
              0
          ),

        wallet:
          memberRow.trx || null,

        dateOfJoining:
          memberRow.dateOfJoining ||
          null,

        dateOfActivation:
          memberRow.date_of_activation ||
          null,
      };


      return res.status(200).json({
        success: true,

        data: {
          member,

          summary: {
            investmentCount:
              Number(
                totals.investmentCount ||
                  0
              ),

            totalInvested:
              Number(
                totals.totalInvested ||
                  0
              ),

            highestInvestment:
              Number(
                totals.highestInvestment ||
                  0
              ),

            firstInvestmentDate:
              totals.firstInvestmentDate ||
              null,

            latestInvestmentDate:
              totals.latestInvestmentDate ||
              null,

            eligibleInvestments:
              Number(
                totals.eligibleInvestments ||
                  0
              ),

            projectedMonthlyRewardUsd:
              Number(
                totals.projectedMonthlyRewardUsd ||
                  0
              ),
          },

          investments:
            investmentRows.map(
              formatInvestment
            ),

          rewardPolicy: {
            waitDays:
              REWARD_WAIT_DAYS,

            startsFromDay: 101,

            monthlyPercent:
              MONTHLY_REWARD_PERCENT,

            basis:
              "Original USD investment value",
          },
        },
      });

    } catch (error) {
      console.error(
        "Admin member investment details error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Unable to load member investment details.",
      });
    }
  };


module.exports = {
  getInvestmentSummary,
  getInvestments,
  getMemberInvestmentDetails,
};