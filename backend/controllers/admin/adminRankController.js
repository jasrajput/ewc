const db = require("../../config/db");


// ======================================================
// HELPERS
// ======================================================

const formatRank = (rank) => {
  const value = Number(rank || 0);

  if (value < 1 || value > 12) {
    return "Unranked";
  }

  return `E-${String(value).padStart(
    2,
    "0"
  )}`;
};


const formatMember = (row) => {
  if (!row) {
    return null;
  }

  const rank = Number(
    row.level_achieved || 0
  );

  return {
    id: Number(row.id),

    user_id: row.user_id,

    name: row.name || "",

    email: row.email || "",

    mobile_no:
      row.mobile_no || "",

    country:
      row.country || "",

    sponsor_user_id:
      row.real_sponsor_id || null,

    package_choose: Number(
      row.package_choose || 0
    ),

    package_amount: Number(
      row.package_amount || 0
    ),

    rank,

    rankLabel:
      formatRank(rank),

    status: Number(
      row.status || 0
    ),

    blocked:
      Number(row.status) === 1,

    activated:
      Number(
        row.package_choose
      ) >= 2,

    walletRegistered: Boolean(
      row.trx &&
      String(row.trx).trim()
    ),

    dateOfJoining:
      row.dateOfJoining || null,

    date_of_activation:
      row.date_of_activation ||
      null,
  };
};


// ======================================================
// GET RANK MEMBERS
//
// GET /api/admin/ranks
//
// Filters:
// search
// rank
// activation
// status
// joinedFrom
// joinedTo
// sort
// page
// limit
// ======================================================

const getRankMembers = async (req, res) => {
  try {
    const search = String(
      req.query.search || ""
    ).trim();

    const rankFilter =
      req.query.rank !== undefined &&
      req.query.rank !== ""
        ? Number(req.query.rank)
        : null;

    const activation = String(
      req.query.activation || ""
    )
      .trim()
      .toLowerCase();

    const status = String(
      req.query.status || ""
    )
      .trim()
      .toLowerCase();

    const joinedFrom = String(
      req.query.joinedFrom || ""
    ).trim();

    const joinedTo = String(
      req.query.joinedTo || ""
    ).trim();

    const sort = String(
      req.query.sort || "rank_desc"
    ).trim();

    const page = Math.max(
      Number(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        Number(req.query.limit) || 20,
        1
      ),
      100
    );

    const offset =
      (page - 1) * limit;


    // ==========================================
    // VALIDATE RANK
    // ==========================================

    if (
      rankFilter !== null &&
      (
        !Number.isInteger(rankFilter) ||
        rankFilter < 0 ||
        rankFilter > 12
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Rank must be between 0 and 12.",
      });
    }


    // ==========================================
    // FILTERS
    // ==========================================

    const where = [];
    const params = [];


    if (search) {
      const term = `%${search}%`;

      where.push(`
        (
          m.user_id LIKE ?
          OR m.name LIKE ?
          OR m.email LIKE ?
          OR m.mobile_no LIKE ?
        )
      `);

      params.push(
        term,
        term,
        term,
        term
      );
    }


    if (rankFilter !== null) {
      where.push(
        "COALESCE(m.level_achieved, 0) = ?"
      );

      params.push(rankFilter);
    }


    if (activation === "activated") {
      where.push(
        "m.package_choose >= 2"
      );
    } else if (
      activation === "inactive"
    ) {
      where.push(
        "m.package_choose = 1"
      );
    }


    if (status === "active") {
      where.push(
        "m.status = 0"
      );
    } else if (
      status === "blocked"
    ) {
      where.push(
        "m.status = 1"
      );
    }


    if (joinedFrom) {
      where.push(
        "DATE(m.dateOfJoining) >= ?"
      );

      params.push(joinedFrom);
    }


    if (joinedTo) {
      where.push(
        "DATE(m.dateOfJoining) <= ?"
      );

      params.push(joinedTo);
    }


    const whereSql =
      where.length
        ? `WHERE ${where.join(" AND ")}`
        : "";


    // ==========================================
    // SORT
    // ==========================================

    const sortMap = {
      rank_desc:
        "m.level_achieved DESC, m.id DESC",

      rank_asc:
        "m.level_achieved ASC, m.id DESC",

      newest:
        "m.dateOfJoining DESC, m.id DESC",

      oldest:
        "m.dateOfJoining ASC, m.id ASC",

      package_desc:
        "m.package_amount DESC, m.id DESC",

      package_asc:
        "m.package_amount ASC, m.id DESC",

      achieved_newest:
        "achievement.created_on DESC, m.id DESC",
    };


    const orderBy =
      sortMap[sort] ||
      sortMap.rank_desc;


    // ==========================================
    // TOTAL COUNT
    // ==========================================

    const [countRows] =
      await db.execute(
        `
          SELECT
            COUNT(*) AS total

          FROM member m

          ${whereSql}
        `,
        params
      );


    const total = Number(
      countRows[0]?.total || 0
    );


    // ==========================================
    // MEMBER + RANK INFORMATION
    // ==========================================

    const [rows] =
      await db.execute(
        `
          SELECT

            -- ==================================
            -- MEMBER
            -- ==================================

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
            m.trx,

            m.dateOfJoining,
            m.date_of_activation,


            -- ==================================
            -- DIRECT MEMBERS
            -- ==================================

            COALESCE(
              direct_stats.direct_count,
              0
            ) AS direct_count,


            -- ==================================
            -- NETWORK
            -- ==================================

            COALESCE(
              network_stats.community_size,
              0
            ) AS community_size,

            COALESCE(
              network_stats.community_business,
              0
            ) AS community_business,


            -- ==================================
            -- RANK INCOME
            -- ==================================

            COALESCE(
              income_stats.rank_income,
              0
            ) AS rank_income,


            -- ==================================
            -- LATEST ACHIEVED_LEVEL RECORD
            -- ==================================

            achievement.id
              AS achievement_id,

            achievement.level_achieved
              AS achieved_level,

            achievement.level_amount
              AS achieved_level_amount,

            achievement.reward
              AS achieved_reward,

            achievement.status
              AS achieved_status,

            achievement.created_on
              AS achieved_on,

            achievement.rank
              AS achieved_rank


          FROM member m


          -- ====================================
          -- DIRECT COUNT
          -- ====================================

          LEFT JOIN (
            SELECT
              real_sponsor_id,

              COUNT(*) AS direct_count

            FROM member

            GROUP BY
              real_sponsor_id
          ) direct_stats

            ON direct_stats.real_sponsor_id
               = m.user_id


          -- ====================================
          -- COMMUNITY BUSINESS
          -- ====================================

          LEFT JOIN (
            SELECT
              from_id,

              COUNT(
                DISTINCT to_id
              ) AS community_size,

              COALESCE(
                SUM(package_amount),
                0
              ) AS community_business

            FROM levels

            GROUP BY
              from_id
          ) network_stats

            ON network_stats.from_id
               = m.id


          -- ====================================
          -- RANK INCOME
          --
          -- direction 5 = Rank Income
          -- ====================================

          LEFT JOIN (
            SELECT
              user_id,

              COALESCE(
                SUM(credit),
                0
              ) AS rank_income

            FROM trasections

            WHERE direction = 5

            GROUP BY user_id
          ) income_stats

            ON income_stats.user_id
               = m.id


          -- ====================================
          -- LATEST ACHIEVED RANK RECORD
          --
          -- We take the newest achieved_level
          -- row for each member.
          --
          -- pool is intentionally NOT used.
          -- ====================================

          LEFT JOIN achieved_level achievement

            ON achievement.id = (
              SELECT al.id

              FROM achieved_level al

              WHERE al.member_id = m.id

              ORDER BY
                al.created_on DESC,
                al.id DESC

              LIMIT 1
            )


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


    // ==========================================
    // FORMAT RESPONSE
    // ==========================================

    const members =
      rows.map((row) => ({
        ...formatMember(row),


        // ======================================
        // NETWORK
        // ======================================

        directCount: Number(
          row.direct_count || 0
        ),

        communitySize: Number(
          row.community_size || 0
        ),

        communityBusiness: Number(
          row.community_business || 0
        ),


        // ======================================
        // RANK INCOME
        // ======================================

        rankIncome: Number(
          row.rank_income || 0
        ),


        // ======================================
        // LATEST ACHIEVEMENT
        // ======================================

        achievement:
          row.achievement_id
            ? {
                id: Number(
                  row.achievement_id
                ),

                levelAchieved: Number(
                  row.achieved_level || 0
                ),

                rank:
                  row.achieved_rank ||
                  formatRank(
                    row.achieved_level
                  ),

                levelAmount: Number(
                  row.achieved_level_amount ||
                    0
                ),

                reward:
                  row.achieved_reward ||
                  null,

                // Raw value for now.
                // We will label this after
                // confirming status semantics.
                status: Number(
                  row.achieved_status || 0
                ),

                createdOn:
                  row.achieved_on ||
                  null,
              }
            : null,
      }));


    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,

      data: {
        members,

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
      "Admin rank members error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load rank members.",
    });
  }
};


// ======================================================
// GET RANK DISTRIBUTION
//
// GET /api/admin/ranks/distribution
// ======================================================

const getRankDistribution = async (
  req,
  res
) => {
  try {
    // ==========================================
    // OVERALL SUMMARY
    // ==========================================

    const [summaryRows] =
      await db.execute(
        `
          SELECT
            COUNT(*) AS totalMembers,

            SUM(
              CASE
                WHEN COALESCE(
                  level_achieved,
                  0
                ) = 0
                THEN 1
                ELSE 0
              END
            ) AS unrankedMembers,

            SUM(
              CASE
                WHEN level_achieved
                     BETWEEN 1 AND 12
                THEN 1
                ELSE 0
              END
            ) AS rankedMembers,

            COALESCE(
              MAX(level_achieved),
              0
            ) AS highestRank

          FROM member
        `
      );


    const summary =
      summaryRows[0] || {};


    // ==========================================
    // DISTRIBUTION
    // ==========================================

    const [distributionRows] =
      await db.execute(
        `
          SELECT
            COALESCE(
              level_achieved,
              0
            ) AS rank,

            COUNT(*) AS members

          FROM member

          WHERE COALESCE(
            level_achieved,
            0
          ) BETWEEN 0 AND 12

          GROUP BY
            COALESCE(
              level_achieved,
              0
            )

          ORDER BY rank ASC
        `
      );


    const distributionMap =
      new Map();

    distributionRows.forEach(
      (row) => {
        distributionMap.set(
          Number(row.rank),
          Number(
            row.members || 0
          )
        );
      }
    );


    // Always return 0 through 12,
    // even if a rank has no members.
    const distribution = [];

    for (
      let rank = 0;
      rank <= 12;
      rank += 1
    ) {
      distribution.push({
        rank,

        rankLabel:
          formatRank(rank),

        members:
          distributionMap.get(
            rank
          ) || 0,
      });
    }


    // ==========================================
    // RANK INCOME
    // ==========================================

    const [incomeRows] =
      await db.execute(
        `
          SELECT
            COALESCE(
              SUM(credit),
              0
            ) AS totalRankIncome

          FROM trasections

          WHERE direction = 5
        `
      );


    return res.status(200).json({
      success: true,

      data: {
        summary: {
          totalMembers: Number(
            summary.totalMembers ||
              0
          ),

          rankedMembers: Number(
            summary.rankedMembers ||
              0
          ),

          unrankedMembers: Number(
            summary.unrankedMembers ||
              0
          ),

          highestRank: Number(
            summary.highestRank ||
              0
          ),

          highestRankLabel:
            formatRank(
              summary.highestRank
            ),

          totalRankIncome: Number(
            incomeRows[0]
              ?.totalRankIncome ||
              0
          ),
        },

        distribution,
      },
    });
  } catch (error) {
    console.error(
      "Admin rank distribution error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load rank distribution.",
    });
  }
};


// ======================================================
// GET MEMBER RANK DETAILS
//
// GET /api/admin/ranks/member/:id
//
// Read-only diagnostic endpoint.
// ======================================================

const getMemberRankDetails = async (req, res) => {
  try {
    const memberId = Number(req.params.id);

    if (!Number.isInteger(memberId) || memberId < 1) {
      return res.status(400).json({
        success: false,
        message: "Valid member ID is required.",
      });
    }

    // ==========================================
    // MEMBER / CURRENT RANK
    // ==========================================

    const [memberRows] = await db.execute(
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
          m.trx,
          m.dateOfJoining,
          m.date_of_activation

        FROM member m

        WHERE m.id = ?

        LIMIT 1
      `,
      [memberId]
    );

    if (!memberRows[0]) {
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
    }

    const member = memberRows[0];


    // ==========================================
    // DIRECT STATISTICS
    // ==========================================

    const [directRows] = await db.execute(
      `
        SELECT
          COUNT(*) AS totalDirects,

          SUM(
            CASE
              WHEN package_choose >= 2
              THEN 1
              ELSE 0
            END
          ) AS activatedDirects

        FROM member

        WHERE real_sponsor_id = ?
      `,
      [member.user_id]
    );


    // ==========================================
    // NETWORK STATISTICS
    // ==========================================

    const [networkRows] = await db.execute(
      `
        SELECT
          COUNT(
            DISTINCT l.to_id
          ) AS communitySize,

          COALESCE(
            SUM(l.package_amount),
            0
          ) AS communityBusiness,

          COUNT(
            DISTINCT CASE
              WHEN m.package_choose >= 2
              THEN m.id
            END
          ) AS activatedCommunity

        FROM levels l

        INNER JOIN member m
          ON m.id = l.to_id

        WHERE l.from_id = ?
      `,
      [memberId]
    );


    // ==========================================
    // LEVEL BUSINESS BREAKDOWN
    // ==========================================

    const [levelRows] = await db.execute(
      `
        SELECT
          l.level,

          COUNT(
            DISTINCT l.to_id
          ) AS members,

          COALESCE(
            SUM(l.package_amount),
            0
          ) AS business

        FROM levels l

        WHERE l.from_id = ?

        GROUP BY l.level

        ORDER BY l.level ASC
      `,
      [memberId]
    );


    // ==========================================
    // ACHIEVED RANK HISTORY
    //
    // achieved_level.member_id
    // uses numeric member.id
    //
    // pool intentionally excluded.
    // ==========================================

    const [achievementRows] = await db.execute(
      `
        SELECT
          id,
          member_id,
          level_achieved,
          level_amount,
          reward,
          status,
          created_on,
          rank

        FROM achieved_level

        WHERE member_id = ?

        ORDER BY
          level_achieved DESC,
          created_on DESC,
          id DESC
      `,
      [memberId]
    );


    // ==========================================
    // LATEST ACHIEVEMENT RECORD
    // ==========================================

    const [latestAchievementRows] = await db.execute(
      `
        SELECT
          id,
          level_achieved,
          level_amount,
          reward,
          status,
          created_on,
          rank

        FROM achieved_level

        WHERE member_id = ?

        ORDER BY
          level_achieved DESC,
          created_on DESC,
          id DESC

        LIMIT 1
      `,
      [memberId]
    );


    // ==========================================
    // RANK INCOME LEDGER
    //
    // direction = 5
    // ==========================================

    const [incomeRows] = await db.execute(
      `
        SELECT
          COALESCE(
            SUM(credit),
            0
          ) AS totalRankIncome,

          COUNT(*) AS rankIncomeEntries

        FROM trasections

        WHERE user_id = ?
          AND direction = 5
      `,
      [memberId]
    );


    // ==========================================
    // RECENT RANK INCOME
    // ==========================================

    const [recentIncomeRows] = await db.execute(
      `
        SELECT
          id,
          credit,
          debit,
          direction,
          description,
          created_at

        FROM trasections

        WHERE user_id = ?
          AND direction = 5

        ORDER BY
          created_at DESC,
          id DESC

        LIMIT 10
      `,
      [memberId]
    );


    const directStats =
      directRows[0] || {};

    const networkStats =
      networkRows[0] || {};

    const incomeStats =
      incomeRows[0] || {};

    const latestAchievement =
      latestAchievementRows[0] || null;


    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,

      data: {
        member: formatMember(member),

        currentRank: {
          level: Number(
            member.level_achieved || 0
          ),

          label: formatRank(
            member.level_achieved
          ),
        },

        latestAchievement:
          latestAchievement
            ? {
                id: Number(
                  latestAchievement.id
                ),

                levelAchieved: Number(
                  latestAchievement.level_achieved ||
                    0
                ),

                rank:
                  latestAchievement.rank ||
                  formatRank(
                    latestAchievement.level_achieved
                  ),

                levelAmount: Number(
                  latestAchievement.level_amount ||
                    0
                ),

                reward:
                  latestAchievement.reward ||
                  null,

                // Raw because status meaning
                // has not been defined yet.
                status: Number(
                  latestAchievement.status ||
                    0
                ),

                createdOn:
                  latestAchievement.created_on ||
                  null,
              }
            : null,

        statistics: {
          totalDirects: Number(
            directStats.totalDirects ||
              0
          ),

          activatedDirects: Number(
            directStats.activatedDirects ||
              0
          ),

          communitySize: Number(
            networkStats.communitySize ||
              0
          ),

          activatedCommunity: Number(
            networkStats.activatedCommunity ||
              0
          ),

          communityBusiness: Number(
            networkStats.communityBusiness ||
              0
          ),

          totalRankIncome: Number(
            incomeStats.totalRankIncome ||
              0
          ),

          rankIncomeEntries: Number(
            incomeStats.rankIncomeEntries ||
              0
          ),

          totalRanksAchieved:
            achievementRows.length,
        },

        achievements:
          achievementRows.map((row) => ({
            id: Number(row.id),

            levelAchieved: Number(
              row.level_achieved || 0
            ),

            rank:
              row.rank ||
              formatRank(
                row.level_achieved
              ),

            levelAmount: Number(
              row.level_amount || 0
            ),

            reward:
              row.reward || null,

            // Do not assign semantic labels
            // until achieved_level.status is defined.
            status: Number(
              row.status || 0
            ),

            createdOn:
              row.created_on || null,
          })),

        levels:
          levelRows.map((row) => ({
            level: Number(
              row.level || 0
            ),

            members: Number(
              row.members || 0
            ),

            business: Number(
              row.business || 0
            ),
          })),

        recentRankIncome:
          recentIncomeRows.map((row) => ({
            id: Number(row.id),

            credit: Number(
              row.credit || 0
            ),

            debit: Number(
              row.debit || 0
            ),

            amount: Number(
              row.credit || 0
            ),

            direction: Number(
              row.direction || 0
            ),

            description:
              row.description || "",

            created_at:
              row.created_at || null,
          })),
      },
    });
  } catch (error) {
    console.error(
      "Admin member rank details error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load member rank details.",
    });
  }
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  getRankMembers,
  getRankDistribution,
  getMemberRankDetails,
};