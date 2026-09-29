const db = require("../../config/db");

const getDashboard = async (req, res) => {
  try {
    // =====================================================
    // MEMBER OVERVIEW
    // =====================================================

    const [memberRows] = await db.execute(`
      SELECT
        COUNT(*) AS totalMembers,

        COALESCE(
          SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END),
          0
        ) AS activeMembers,

        COALESCE(
          SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END),
          0
        ) AS blockedMembers,

        COALESCE(
          SUM(CASE WHEN package_choose >= 2 THEN 1 ELSE 0 END),
          0
        ) AS activatedMembers,

        COALESCE(
          SUM(
            CASE
              WHEN package_choose >= 2
              THEN package_amount
              ELSE 0
            END
          ),
          0
        ) AS totalBusiness,

        COALESCE(
          SUM(CASE WHEN trx IS NOT NULL AND TRIM(trx) != '' THEN 1 ELSE 0 END),
          0
        ) AS walletRegistered
      FROM member
    `);

    const members = memberRows[0] || {};

    // =====================================================
    // TODAY'S MEMBERS
    // =====================================================

    const [todayRows] = await db.execute(`
      SELECT COUNT(*) AS total
      FROM member
      WHERE DATE(dateOfJoining) = CURDATE()
    `);

    const todayRegistrations = Number(
      todayRows[0]?.total || 0
    );

    // =====================================================
    // INCOME / COMMISSION TOTALS
    // =====================================================

    const [incomeRows] = await db.execute(`
      SELECT
        COALESCE(SUM(credit), 0) AS totalIncome,

        COALESCE(
          SUM(CASE WHEN direction = 1 THEN credit ELSE 0 END),
          0
        ) AS directIncome,

        COALESCE(
          SUM(CASE WHEN direction = 5 THEN credit ELSE 0 END),
          0
        ) AS rankIncome,

        COALESCE(
          SUM(CASE WHEN direction = 6 THEN credit ELSE 0 END),
          0
        ) AS salaryIncome,

        COALESCE(
          SUM(CASE WHEN direction = 7 THEN credit ELSE 0 END),
          0
        ) AS rewardIncome
      FROM trasections
      WHERE direction IN (1, 5, 6, 7)
    `);

    const income = incomeRows[0] || {};

    // =====================================================
    // WITHDRAWALS
    // =====================================================

    const [withdrawalRows] = await db.execute(`
      SELECT
        COUNT(*) AS totalRequests,

        COALESCE(SUM(amount), 0) AS totalAmount,

        COALESCE(
          SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END),
          0
        ) AS pendingRequests,

        COALESCE(
          SUM(CASE WHEN status = 0 THEN amount ELSE 0 END),
          0
        ) AS pendingAmount,

        COALESCE(
          SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END),
          0
        ) AS approvedRequests,

        COALESCE(
          SUM(CASE WHEN status = 1 THEN amount ELSE 0 END),
          0
        ) AS approvedAmount
      FROM withdrawals
    `);

    const withdrawals = withdrawalRows[0] || {};

    // =====================================================
    // RANK DISTRIBUTION
    // =====================================================

    const [rankRows] = await db.execute(`
      SELECT
        level_achieved,
        COUNT(*) AS total
      FROM member
      WHERE level_achieved > 0
      GROUP BY level_achieved
      ORDER BY level_achieved ASC
    `);

    const rankDistribution = rankRows.map((row) => ({
      level: Number(row.level_achieved || 0),
      name: `E-${String(
        Number(row.level_achieved || 0)
      ).padStart(2, "0")}`,
      total: Number(row.total || 0),
    }));

    // =====================================================
    // RECENT MEMBERS
    // =====================================================

    const [recentMemberRows] = await db.execute(`
      SELECT
        id,
        user_id,
        name,
        email,
        country,
        package_choose,
        package_amount,
        level_achieved,
        status,
        trx,
        dateOfJoining
      FROM member
      ORDER BY id DESC
      LIMIT 7
    `);

    const recentMembers = recentMemberRows.map((member) => ({
      id: member.id,
      user_id: member.user_id,
      name: member.name,
      email: member.email,
      country: member.country,

      package_choose: Number(
        member.package_choose || 1
      ),

      package_amount: Number(
        member.package_amount || 0
      ),

      level_achieved: Number(
        member.level_achieved || 0
      ),

      rank:
        Number(member.level_achieved || 0) > 0
          ? `E-${String(
              Number(member.level_achieved)
            ).padStart(2, "0")}`
          : "Unranked",

      status: Number(member.status || 0),

      walletRegistered: Boolean(
        String(member.trx || "").trim()
      ),

      joined_at: member.dateOfJoining,
    }));

    // =====================================================
    // RECENT INCOME TRANSACTIONS
    // =====================================================

    const [transactionRows] = await db.execute(`
      SELECT
        t.id,
        t.user_id,
        t.credit,
        t.direction,
        t.description,
        t.created_at,
        m.user_id AS username,
        m.name
      FROM trasections t
      LEFT JOIN member m
        ON m.id = t.user_id
      WHERE t.direction IN (1, 5, 6, 7)
      ORDER BY t.created_at DESC
      LIMIT 7
    `);

    const incomeNames = {
      1: "Direct Income",
      5: "Rank Income",
      6: "Salary Income",
      7: "Reward Income",
    };

    const recentTransactions =
      transactionRows.map((row) => ({
        id: row.id,

        member_id: row.user_id,

        username: row.username || "",

        name: row.name || "",

        amount: Number(row.credit || 0),

        direction: Number(row.direction),

        type:
          incomeNames[Number(row.direction)] ||
          "Income",

        description: row.description || "",

        created_at: row.created_at,
      }));

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,

      data: {
        overview: {
          totalMembers: Number(
            members.totalMembers || 0
          ),

          activeMembers: Number(
            members.activeMembers || 0
          ),

          blockedMembers: Number(
            members.blockedMembers || 0
          ),

          activatedMembers: Number(
            members.activatedMembers || 0
          ),

          walletRegistered: Number(
            members.walletRegistered || 0
          ),

          todayRegistrations,

          totalBusiness: Number(
            members.totalBusiness || 0
          ),

          totalIncome: Number(
            income.totalIncome || 0
          ),
        },

        income: {
          direct: Number(
            income.directIncome || 0
          ),

          rank: Number(
            income.rankIncome || 0
          ),

          salary: Number(
            income.salaryIncome || 0
          ),

          reward: Number(
            income.rewardIncome || 0
          ),

          total: Number(
            income.totalIncome || 0
          ),
        },

        withdrawals: {
          totalRequests: Number(
            withdrawals.totalRequests || 0
          ),

          totalAmount: Number(
            withdrawals.totalAmount || 0
          ),

          pendingRequests: Number(
            withdrawals.pendingRequests || 0
          ),

          pendingAmount: Number(
            withdrawals.pendingAmount || 0
          ),

          approvedRequests: Number(
            withdrawals.approvedRequests || 0
          ),

          approvedAmount: Number(
            withdrawals.approvedAmount || 0
          ),
        },

        rankDistribution,

        recentMembers,

        recentTransactions,
      },
    });
  } catch (error) {
    console.error(
      "Admin dashboard error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load admin dashboard.",
    });
  }
};

module.exports = {
  getDashboard,
};