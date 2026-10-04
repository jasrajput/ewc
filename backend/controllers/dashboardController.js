const fs = require("fs");
const path = require("path");
const db = require("../config/db");

const MERKLE_DIRECTORY = path.join(
  __dirname,
  "../../closing-node/merkle_snapshots"
);

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
  7: "ROI Income",
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

const loadLatestSnapshotUser = (wallet) => {
  try {
    if (!wallet) return null;

    const latestFile = path.join(MERKLE_DIRECTORY, "latest.json");

    if (!fs.existsSync(latestFile)) {
      return null;
    }

    const latest = JSON.parse(
      fs.readFileSync(latestFile, "utf8")
    );

    if (!latest?.snapshot_id) {
      return null;
    }

    const snapshotFile = path.join(
      MERKLE_DIRECTORY,
      `snapshot_${latest.snapshot_id}.json`
    );

    if (!fs.existsSync(snapshotFile)) {
      return null;
    }

    const snapshot = JSON.parse(
      fs.readFileSync(snapshotFile, "utf8")
    );

    if (!Array.isArray(snapshot?.users)) {
      return null;
    }

    const normalizedWallet = String(wallet)
      .trim()
      .toLowerCase();

    return (
      snapshot.users.find(
        (item) =>
          String(item.wallet || "")
            .trim()
            .toLowerCase() === normalizedWallet
      ) || null
    );
  } catch (error) {
    console.error("Dashboard snapshot read error:", error);
    return null;
  }
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

    if (Number(user.status) === 1) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked.",
      });
    }

    // =====================================================
    // INVESTMENT TOTALS
    // =====================================================

    const [investmentRows] = await db.execute(
      `SELECT
        COALESCE(SUM(pack_amount), 0) AS totalInvestment,
        COALESCE(SUM(token_amount), 0) AS ewcAllocation,
        COUNT(*) AS investmentCount,
        MIN(created_on) AS firstInvestmentDate,
        MAX(created_on) AS latestInvestmentDate
      FROM select_packages
      WHERE u_id = ?`,
      [user.id]
    );

    const totalInvestment = Number(
      investmentRows[0]?.totalInvestment || 0
    );

    const ewcAllocation = Number(
      investmentRows[0]?.ewcAllocation || 0
    );

    const investmentCount = Number(
      investmentRows[0]?.investmentCount || 0
    );

    // =====================================================
    // DIRECT PARTNERS
    // =====================================================

    const [directCountRows] = await db.execute(
      `SELECT COUNT(*) AS totalPartners
       FROM member
       WHERE real_sponsor_id = ?`,
      [user.user_id]
    );

    const directPartners = Number(
      directCountRows[0]?.totalPartners || 0
    );

    // =====================================================
    // DIRECT BUSINESS
    //
    // Sum actual select_packages investments belonging
    // to personally sponsored members.
    // =====================================================

    const [directBusinessRows] = await db.execute(
      `SELECT COALESCE(SUM(sp.pack_amount), 0) AS directBusiness
       FROM member m
       INNER JOIN select_packages sp ON sp.u_id = m.id
       WHERE m.real_sponsor_id = ?`,
      [user.user_id]
    );

    const directSales = Number(
      directBusinessRows[0]?.directBusiness || 0
    );

    // =====================================================
    // TOTAL COMMUNITY
    // =====================================================

    const [communityCountRows] = await db.execute(
      `SELECT COUNT(DISTINCT from_id) AS totalCommunity
       FROM levels
       WHERE to_id = ?`,
      [user.id]
    );

    const totalCommunity = Number(
      communityCountRows[0]?.totalCommunity || 0
    );

    // =====================================================
    // COMMUNITY BUSINESS
    //
    // Use DISTINCT downline IDs first so a downline cannot
    // accidentally be counted multiple times.
    // =====================================================

    const [communityBusinessRows] = await db.execute(
      `SELECT COALESCE(SUM(sp.pack_amount), 0) AS communityBusiness
       FROM select_packages sp
       INNER JOIN (
         SELECT DISTINCT from_id
         FROM levels
         WHERE to_id = ?
       ) network ON network.from_id = sp.u_id`,
      [user.id]
    );

    const communitySales = Number(
      communityBusinessRows[0]?.communityBusiness || 0
    );

    // =====================================================
    // INCOME TOTALS
    //
    // 1 = Direct -> USDT
    // 5 = Rank   -> USDT
    // 6 = Salary -> USDT
    // 7 = ROI    -> EWC
    //
    // Do NOT add ROI EWC to USDT earnings.
    // =====================================================

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
      direct: 0,
      rank: 0,
      salary: 0,
      reward: 0,
      roi: 0,
    };

    incomeRows.forEach((row) => {
      const direction = Number(row.direction);
      const amount = Number(row.total || 0);

      if (direction === 1) income.direct = amount;
      if (direction === 5) income.rank = amount;
      if (direction === 6) income.salary = amount;

      if (direction === 7) {
        income.reward = amount;
        income.roi = amount;
      }
    });

    const totalEarnings =
      income.direct +
      income.rank +
      income.salary;

    const totalUsdtEarnings = totalEarnings;
    const totalRoiEwc = income.roi;

    // =====================================================
    // CURRENT LIVE BALANCE
    //
    // balance = Direct + Rank + Salary generated after
    // latest closing and not yet rolled into cumulative.
    // =====================================================

    const [walletRows] = await db.execute(
      `SELECT
        COALESCE(balance, 0) AS balance,
        COALESCE(cumulative_usdt_income, 0) AS cumulative_usdt_income,
        COALESCE(cumulative_roi_ewc, 0) AS cumulative_roi_ewc
       FROM user_wallet
       WHERE user_id = ?
       LIMIT 1`,
      [user.id]
    );

    const currentBalance = Number(
      walletRows[0]?.balance || 0
    );

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

        asset:
          Number(transaction.direction) === 7
            ? "EWC"
            : "USDT",

        status: "Completed",

        date: formatTransactionDate(
          transaction.created_at
        ),
      })
    );

    // =====================================================
    // ACTIVE INVESTMENT
    // =====================================================

    const [latestInvestmentRows] = await db.execute(
      `SELECT
        id,
        pack_amount,
        token_amount,
        created_on
       FROM select_packages
       WHERE u_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [user.id]
    );

    let activeInvestment = null;

    if (latestInvestmentRows.length) {
      const latestInvestment =
        latestInvestmentRows[0];

      const activationDate = new Date(
        latestInvestment.created_on
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

      const daysRemaining = Math.max(
        0,
        lockDays - daysPassed
      );

      const progress = Math.min(
        100,
        Math.max(
          0,
          Math.floor(
            (daysPassed / lockDays) * 100
          )
        )
      );

      activeInvestment = {
        amount: Number(
          latestInvestment.pack_amount || 0
        ),

        ewcAllocation: Number(
          latestInvestment.token_amount || 0
        ),

        package: `Investment #${latestInvestment.id}`,

        packageId: Number(
          latestInvestment.id
        ),

        monthlyReward: 2,

        daysRemaining,
        progress,

        activationDate:
          latestInvestment.created_on,

        roiStarts:
          daysRemaining === 0,
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
          rank.level ===
          currentRankLevel + 1
      ) || null;

    // =====================================================
    // QUALIFIED RANK MEMBERS
    //
    // IMPORTANT:
    // Required ranked members can be ANYWHERE in downteam.
    // Not only direct referrals.
    // =====================================================

    let qualifiedRankMembers = 0;

    if (
      nextRank &&
      nextRank.requiredRank > 0
    ) {
      const [rankMemberRows] =
        await db.execute(
          `SELECT COUNT(DISTINCT l.from_id) AS total
           FROM levels l
           INNER JOIN member m
             ON m.id = l.from_id
           WHERE l.to_id = ?
           AND m.level_achieved >= ?`,
          [
            user.id,
            nextRank.requiredRank,
          ]
        );

      qualifiedRankMembers = Number(
        rankMemberRows[0]?.total || 0
      );
    }

    // =====================================================
    // RANK PROGRESS
    // =====================================================

    let rankProgress = 100;

    if (nextRank) {
      const directProgress =
        nextRank.directBusiness > 0
          ? Math.min(
              100,
              (directSales /
                nextRank.directBusiness) *
                100
            )
          : 100;

      const communityProgress =
        nextRank.teamBusiness > 0
          ? Math.min(
              100,
              (communitySales /
                nextRank.teamBusiness) *
                100
            )
          : 100;

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
    // CLAIMABLE
    // =====================================================

    const snapshotUser =
      loadLatestSnapshotUser(user.trx);

    const cumulativeUsdtIncome = Number(
      snapshotUser?.cumulative_usdt_income || 0
    );

    const cumulativeRoiEwc = Number(
      snapshotUser?.cumulative_roi_ewc || 0
    );

    // =====================================================
    // LAST CLAIMED CUMULATIVE VALUES
    //
    // We need cumulative values, not SUM(), because each
    // withdrawal row already stores the cumulative values
    // supplied to the contract for that claim.
    // =====================================================

    const [claimedRows] = await db.execute(
      `SELECT
        cumulative_usdt,
        cumulative_roi_ewc
       FROM withdrawals
       WHERE user_id = ?
       AND status = 1
       ORDER BY id DESC
       LIMIT 1`,
      [user.id]
    );

    const usdtClaimed = Number(
      claimedRows[0]?.cumulative_usdt || 0
    );

    const roiEwcClaimed = Number(
      claimedRows[0]?.cumulative_roi_ewc || 0
    );

    const claimableUsdt = Math.max(
      0,
      cumulativeUsdtIncome -
        usdtClaimed
    );

    const claimableEwc = Math.max(
      0,
      cumulativeRoiEwc -
        roiEwcClaimed
    );

    // =====================================================
    // TOKEN EXPLORER
    // =====================================================

    let explorerUrl = "";

    if (EWC_TOKEN.contractAddress) {
      explorerUrl =
        `https://testnet.bscscan.com/token/` +
        EWC_TOKEN.contractAddress;
    }

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,

      data: {
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
            !!String(
              user.trx || ""
            ).trim(),

          joined_at:
            user.dateOfJoining,

          activation_date:
            user.date_of_activation,

          package_choose:
            Number(
              user.package_choose || 1
            ),

          package_amount:
            totalInvestment,

          level_achieved:
            currentRankLevel,
        },

        stats: {
          totalInvestment,
          ewcAllocation,
          investmentCount,

          /*
           * USDT earnings only.
           * ROI is EWC and is returned separately.
           */
          totalEarnings:
            totalUsdtEarnings,

          totalUsdtEarnings,
          totalRoiEwc,

          /*
           * Keep claimable for old Dashboard.jsx
           * compatibility.
           *
           * claimable = USDT
           */
          claimable:
            claimableUsdt,

          claimableUsdt,
          claimableEwc,

          claimedUsdt:
            usdtClaimed,

          claimedEwc:
            roiEwcClaimed,

          /*
           * Income generated after the last closing.
           * This is NOT currently claimable until included
           * in the next Merkle snapshot.
           */
          currentBalance,

          directPartners,
          totalCommunity,

          directSales,
          communitySales,

          activeInvestment,
        },

        income,

        rank: {
          level:
            currentRankLevel,

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

          progress:
            rankProgress,

          nextRequirements:
            nextRank
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

        token: {
          ...EWC_TOKEN,
          explorerUrl,
        },

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