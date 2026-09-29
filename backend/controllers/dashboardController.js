const db = require("../config/db");

// =========================================================
// TOKEN CONFIG
// =========================================================

const EWC_TOKEN = {
  name: "Elevate World Community",
  symbol: "EWC",
  network: "BNB Smart Chain",
  decimals: 18,
  totalSupply: 0,
  contractAddress: process.env.EWC_TOKEN_ADDRESS || "",
};

// =========================================================
// RANK CONFIG
// =========================================================

const RANKS = [
  { level: 1, name: "E-01", directBusiness: 100, teamBusiness: 1000, requiredRank: 0, requiredRankCount: 0, teamPercentage: 1 },
  { level: 2, name: "E-02", directBusiness: 200, teamBusiness: 3000, requiredRank: 1, requiredRankCount: 2, teamPercentage: 3 },
  { level: 3, name: "E-03", directBusiness: 300, teamBusiness: 10000, requiredRank: 2, requiredRankCount: 2, teamPercentage: 6 },
  { level: 4, name: "E-04", directBusiness: 500, teamBusiness: 30000, requiredRank: 3, requiredRankCount: 2, teamPercentage: 9 },
  { level: 5, name: "E-05", directBusiness: 700, teamBusiness: 100000, requiredRank: 4, requiredRankCount: 2, teamPercentage: 12 },
  { level: 6, name: "E-06", directBusiness: 1000, teamBusiness: 300000, requiredRank: 5, requiredRankCount: 2, teamPercentage: 15 },
  { level: 7, name: "E-07", directBusiness: 2000, teamBusiness: 1000000, requiredRank: 6, requiredRankCount: 2, teamPercentage: 18 },
  { level: 8, name: "E-08", directBusiness: 3000, teamBusiness: 3000000, requiredRank: 7, requiredRankCount: 2, teamPercentage: 21 },
  { level: 9, name: "E-09", directBusiness: 5000, teamBusiness: 10000000, requiredRank: 8, requiredRankCount: 2, teamPercentage: 24 },
  { level: 10, name: "E-10", directBusiness: 10000, teamBusiness: 30000000, requiredRank: 9, requiredRankCount: 2, teamPercentage: 26 },
  { level: 11, name: "E-11", directBusiness: 15000, teamBusiness: 100000000, requiredRank: 10, requiredRankCount: 2, teamPercentage: 28 },
  { level: 12, name: "E-12", directBusiness: 25000, teamBusiness: 500000000, requiredRank: 11, requiredRankCount: 2, teamPercentage: 30 },
];

// =========================================================
// TRANSACTION TYPES
// =========================================================

const TRANSACTION_TYPES = {
  1: "Direct Income",
  5: "Rank Income",
  6: "Salary Income",
  7: "Reward Income",
};

// =========================================================
// HELPERS
// =========================================================

const getRankName = (level) => {
  const rank = RANKS.find((item) => item.level === Number(level));
  return rank?.name || "Unranked";
};

const formatTransactionDate = (date) => {
  if (!date) return "";

  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// =========================================================
// DASHBOARD
// =========================================================

const getDashboard = async (req, res) => {
  try {
    // =====================================================
    // AUTH USER
    // =====================================================

    const memberId = req.user?.id;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Please login again.",
      });
    }

    // =====================================================
    // GET USER
    // =====================================================

    const [users] = await db.execute(
      `SELECT
        id,
        user_id,
        name,
        email,
        mobile_no,
        country,
        real_sponsor_id,
        trx,
        dateOfJoining,
        date_of_activation,
        status,
        package_choose,
        package_amount,
        level_achieved
      FROM member
      WHERE id = ?
      LIMIT 1`,
      [memberId]
    );

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const user = users[0];

    // =====================================================
    // BLOCKED USER
    // =====================================================

    if (Number(user.status) === 1) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked.",
      });
    }

    // =====================================================
    // DIRECT PARTNERS + DIRECT BUSINESS
    // =====================================================

    const [directRows] = await db.execute(
      `SELECT
        COUNT(*) AS totalPartners,
        COALESCE(
          SUM(
            CASE
              WHEN package_choose >= 2 THEN package_amount
              ELSE 0
            END
          ),
          0
        ) AS directBusiness
      FROM member
      WHERE real_sponsor_id = ?`,
      [user.user_id]
    );

    const directPartners = Number(
      directRows[0]?.totalPartners || 0
    );

    const directSales = Number(
      directRows[0]?.directBusiness || 0
    );

    // =====================================================
    // TOTAL COMMUNITY + COMMUNITY BUSINESS
    //
    // levels:
    // from_id = downline numeric member ID
    // to_id   = upline numeric member ID
    // =====================================================

    const [communityRows] = await db.execute(
      `SELECT
        COUNT(DISTINCT from_id) AS totalCommunity,
        COALESCE(SUM(package_amount), 0) AS communityBusiness
      FROM levels
      WHERE to_id = ?`,
      [user.id]
    );

    const totalCommunity = Number(
      communityRows[0]?.totalCommunity || 0
    );

    const communitySales = Number(
      communityRows[0]?.communityBusiness || 0
    );

    // =====================================================
    // TOTAL EARNINGS
    //
    // trasections.user_id = numeric member.id
    //
    // Only income directions are counted.
    // =====================================================

    const [earningRows] = await db.execute(
      `SELECT COALESCE(SUM(credit), 0) AS total
      FROM trasections
      WHERE user_id = ?
      AND direction IN (1, 5, 6, 7)`,
      [user.id]
    );

    const totalEarnings = Number(
      earningRows[0]?.total || 0
    );


    const [incomeRows] = await db.execute(
  `SELECT
    direction,
    COALESCE(SUM(credit), 0) AS total
  FROM trasections
  WHERE user_id = ?
  AND direction IN (1, 5, 6, 7)
  GROUP BY direction`,
  [user.id]
);

const income = {
  reward: 0,
  direct: 0,
  rank: 0,
  salary: 0,
};

incomeRows.forEach((row) => {
  const direction = Number(row.direction);
  const amount = Number(row.total || 0);

  if (direction === 1) income.direct = amount;
  if (direction === 5) income.rank = amount;
  if (direction === 6) income.salary = amount;
  if (direction === 7) income.reward = amount;
});


    // =====================================================
    // RECENT TRANSACTIONS
    // =====================================================

    const [transactionRows] = await db.execute(
      `SELECT
        credit,
        direction,
        description,
        created_at
      FROM trasections
      WHERE user_id = ?
      AND direction IN (1, 5, 6, 7)
      ORDER BY created_at DESC
      LIMIT 5`,
      [user.id]
    );

    const recentTransactions = transactionRows.map(
      (transaction, index) => ({
        id: `${transaction.direction}-${index}-${new Date(
          transaction.created_at
        ).getTime()}`,

        type:
          TRANSACTION_TYPES[Number(transaction.direction)] ||
          transaction.description ||
          "Income",

        amount: Number(transaction.credit || 0),

        status: "Completed",

        date: formatTransactionDate(
          transaction.created_at
        ),
      })
    );

    // =====================================================
    // INVESTMENT
    // =====================================================

    const packageAmount = Number(
      user.package_amount || 0
    );

    const packageChoose = Number(
      user.package_choose || 1
    );

    let activeInvestment = null;

    if (packageChoose >= 2 && packageAmount > 0) {
      let daysRemaining = null;
      let progress = 0;

      /*
      |--------------------------------------------------------------------------
      | 100 DAY LOCK
      |--------------------------------------------------------------------------
      */

      if (user.date_of_activation) {
        const activationDate = new Date(
          user.date_of_activation
        );

        const now = new Date();

        const lockDays = 100;

        const millisecondsPerDay =
          1000 * 60 * 60 * 24;

        const daysPassed = Math.max(
          0,
          Math.floor(
            (now.getTime() -
              activationDate.getTime()) /
              millisecondsPerDay
          )
        );

        daysRemaining = Math.max(
          0,
          lockDays - daysPassed
        );

        progress = Math.min(
          100,
          Math.max(
            0,
            Math.floor(
              (daysPassed / lockDays) * 100
            )
          )
        );
      }

      activeInvestment = {
        amount: packageAmount,

        /*
        |--------------------------------------------------------------------------
        | We don't currently have confirmed package names.
        | Therefore return package ID instead of inventing names.
        |--------------------------------------------------------------------------
        */

        package: `Package ${packageChoose}`,

        packageId: packageChoose,

        monthlyReward: 2,

        daysRemaining,

        progress,

        activationDate:
          user.date_of_activation || null,
      };
    }

    // =====================================================
    // RANK
    // =====================================================

    const currentRankLevel = Number(
      user.level_achieved || 0
    );

    const currentRank =
      RANKS.find(
        (rank) =>
          rank.level === currentRankLevel
      ) || null;

    const nextRank =
      RANKS.find(
        (rank) =>
          rank.level === currentRankLevel + 1
      ) || null;

    /*
    |--------------------------------------------------------------------------
    | DIRECT RANK MEMBERS
    |--------------------------------------------------------------------------
    |
    | For the next rank we need direct members whose level_achieved
    | is equal to or higher than the required rank.
    |--------------------------------------------------------------------------
    */

    let qualifiedRankMembers = 0;

    if (
      nextRank &&
      nextRank.requiredRank > 0
    ) {
      const [rankMemberRows] =
        await db.execute(
          `SELECT COUNT(*) AS total
          FROM member
          WHERE real_sponsor_id = ?
          AND level_achieved >= ?`,
          [
            user.user_id,
            nextRank.requiredRank,
          ]
        );

      qualifiedRankMembers = Number(
        rankMemberRows[0]?.total || 0
      );
    }

    // =====================================================
    // RANK PROGRESS
    //
    // Dashboard needs one simple percentage.
    // We calculate each requirement separately and use
    // the lowest one because ALL requirements are required.
    // =====================================================

    let rankProgress = 100;

    if (nextRank) {
      const directProgress = Math.min(
        100,
        (directSales /
          nextRank.directBusiness) *
          100
      );

      const communityProgress = Math.min(
        100,
        (communitySales /
          nextRank.teamBusiness) *
          100
      );

      let rankMemberProgress = 100;

      if (
        nextRank.requiredRankCount > 0
      ) {
        rankMemberProgress = Math.min(
          100,
          (qualifiedRankMembers /
            nextRank.requiredRankCount) *
            100
        );
      }

      rankProgress = Math.floor(
        Math.min(
          directProgress,
          communityProgress,
          rankMemberProgress
        )
      );
    }

    // =====================================================
    // TOKEN EXPLORER
    // =====================================================

    let explorerUrl = "";

    if (EWC_TOKEN.contractAddress) {
      explorerUrl =
        `https://bscscan.com/token/` +
        EWC_TOKEN.contractAddress;
    }

    // =====================================================
    // DASHBOARD RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,

      data: {
        // -------------------------------------------------
        // USER
        // -------------------------------------------------

        user: {
          id: user.id,
          user_id: user.user_id,
          name: user.name,
          email: user.email,
          mobile_no: user.mobile_no,
          country: user.country,
          sponsor: user.real_sponsor_id,

          wallet_address:
            user.trx || "",

          walletRegistered:
            !!String(user.trx || "").trim(),

          joined_at:
            user.dateOfJoining,

          activation_date:
            user.date_of_activation,

          package_choose:
            packageChoose,

          package_amount:
            packageAmount,

          level_achieved:
            currentRankLevel,
        },

        // -------------------------------------------------
        // STATS
        // -------------------------------------------------

        stats: {
          /*
          |--------------------------------------------------------------------------
          | Current package/investment amount.
          |
          | If later you keep multiple investment records,
          | totalInvestment should be calculated from that table instead.
          |--------------------------------------------------------------------------
          */

          totalInvestment:
            packageAmount,

          totalEarnings,

          /*
          |--------------------------------------------------------------------------
          | DO NOT derive claimable from Web2 transactions.
          |
          | Actual claimable depends on:
          | Merkle cumulative entitlement
          | -
          | on-chain claimedAmount
          |
          | Keep this zero until dashboard is connected to that state.
          |--------------------------------------------------------------------------
          */

          claimable: 0,

          /*
          |--------------------------------------------------------------------------
          | No confirmed DB source for EWC allocation yet.
          |--------------------------------------------------------------------------
          */

          ewcAllocation: 0,

          directPartners,
          totalCommunity,

          directSales,
          communitySales,

          activeInvestment,
        },

        income,
        // -------------------------------------------------
        // RANK
        // -------------------------------------------------

        rank: {
          level: currentRankLevel,

          current:
            currentRank?.name ||
            "Unranked",

          next:
            nextRank?.name ||
            null,

          teamPercentage:
            currentRank?.teamPercentage ||
            0,

          directSales,
          communitySales,

          progress: rankProgress,

          nextRequirements: nextRank
            ? {
                directBusiness:
                  nextRank.directBusiness,

                communityBusiness:
                  nextRank.teamBusiness,

                requiredRank:
                  nextRank.requiredRank
                    ? getRankName(
                        nextRank.requiredRank
                      )
                    : null,

                requiredRankCount:
                  nextRank.requiredRankCount,

                qualifiedRankMembers,
              }
            : null,
        },

        // -------------------------------------------------
        // TOKEN
        // -------------------------------------------------

        token: {
          ...EWC_TOKEN,
          explorerUrl,
        },

        // -------------------------------------------------
        // RECENT TRANSACTIONS
        // -------------------------------------------------

        recentTransactions,
      },
    });
  } catch (error) {
    console.error(
      "Dashboard error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load dashboard.",
    });
  }
};

module.exports = {
  getDashboard,
};