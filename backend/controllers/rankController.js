
const db = require("../config/db");

// =====================================================
// EWC ELEVATOR RANK CONFIGURATION
// =====================================================
//
// Qualification:
//
// Personal Investment (mandatory)
//             AND
// (
//    Direct Business
//         OR
//    (Community Business AND required ranked direct members)
// )
//
// Personal investment and direct business are cumulative.
// =====================================================

const RANKS = [
  { level: 1, name: "E-01", personalInvestment: 50, directBusiness: 1000, teamBusiness: 1000, requiredRank: 0, requiredRankCount: 0, teamPercentage: 1 },
  { level: 2, name: "E-02", personalInvestment: 50, directBusiness: 1500, teamBusiness: 3000, requiredRank: 1, requiredRankCount: 2, teamPercentage: 3 },
  { level: 3, name: "E-03", personalInvestment: 50, directBusiness: 5000, teamBusiness: 10000, requiredRank: 2, requiredRankCount: 2, teamPercentage: 6 },
  { level: 4, name: "E-04", personalInvestment: 100, directBusiness: 15000, teamBusiness: 30000, requiredRank: 3, requiredRankCount: 2, teamPercentage: 9 },
  { level: 5, name: "E-05", personalInvestment: 200, directBusiness: 50000, teamBusiness: 100000, requiredRank: 4, requiredRankCount: 2, teamPercentage: 12 },
  { level: 6, name: "E-06", personalInvestment: 300, directBusiness: 150000, teamBusiness: 300000, requiredRank: 5, requiredRankCount: 2, teamPercentage: 15 },
  { level: 7, name: "E-07", personalInvestment: 500, directBusiness: 500000, teamBusiness: 1000000, requiredRank: 6, requiredRankCount: 2, teamPercentage: 18 },
  { level: 8, name: "E-08", personalInvestment: 750, directBusiness: 1500000, teamBusiness: 3000000, requiredRank: 7, requiredRankCount: 2, teamPercentage: 21 },
  { level: 9, name: "E-09", personalInvestment: 1500, directBusiness: 5000000, teamBusiness: 10000000, requiredRank: 8, requiredRankCount: 2, teamPercentage: 24 },
  { level: 10, name: "E-10", personalInvestment: 3000, directBusiness: 15000000, teamBusiness: 30000000, requiredRank: 9, requiredRankCount: 2, teamPercentage: 26 },
  { level: 11, name: "E-11", personalInvestment: 5000, directBusiness: 50000000, teamBusiness: 100000000, requiredRank: 10, requiredRankCount: 2, teamPercentage: 28 },
  { level: 12, name: "E-12", personalInvestment: 10000, directBusiness: 250000000, teamBusiness: 500000000, requiredRank: 11, requiredRankCount: 2, teamPercentage: 30 },
];

// =====================================================
// GET RANK PROGRESS
// =====================================================

const getRankProgress = async (req, res) => {
  try {
    const memberId = req.user?.id;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Please login again.",
      });
    }

    // =====================================================
    // USER + PERSONAL INVESTMENT
    // =====================================================

    const [users] = await db.execute(
      `SELECT
          id,
          user_id,
          name,
          level_achieved,
          package_amount
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

    const currentRankLevel = Number(user.level_achieved || 0);

    // Cumulative personal investment.
    const personalInvestment = Number(user.package_amount || 0);

    // =====================================================
    // DIRECT BUSINESS
    // =====================================================
    //
    // Sum of personal investments of directly sponsored
    // active members.
    //
    // =====================================================

    const [directRows] = await db.execute(
      `SELECT
          COALESCE(SUM(package_amount), 0) AS total
       FROM member
       WHERE real_sponsor_id = ?
         AND package_choose >= 2`,
      [user.user_id]
    );

    const directBusiness = Number(directRows[0]?.total || 0);

    // =====================================================
    // COMMUNITY BUSINESS
    // =====================================================
    //
    // Match the event processor's getTeamBusiness():
    // Sum of downline member package amounts via levels.
    // Exclude the user's own member ID.
    //
    // =====================================================

    const [teamRows] = await db.execute(
      `SELECT
          COALESCE(SUM(COALESCE(m.package_amount, 0)), 0) AS total
       FROM levels l
       INNER JOIN member m ON m.id = l.from_id
       WHERE l.to_id = ?
         AND l.from_id <> ?`,
      [user.id, user.id]
    );

    const teamBusiness = Number(teamRows[0]?.total || 0);

    // =====================================================
    // DIRECT MEMBERS' RANKS
    // =====================================================

    const [directRankRows] = await db.execute(
      `SELECT
          level_achieved,
          COUNT(*) AS total
       FROM member
       WHERE real_sponsor_id = ?
       GROUP BY level_achieved`,
      [user.user_id]
    );

    const countRankAchievers = (requiredRank) => {
      if (!requiredRank) return 0;

      return directRankRows.reduce((total, row) => {
        if (Number(row.level_achieved || 0) >= requiredRank) {
          return total + Number(row.total || 0);
        }

        return total;
      }, 0);
    };

    // =====================================================
    // BUILD RANK PROGRESS
    // =====================================================

    const ranks = RANKS.map((rank) => {
      const rankAchievers = countRankAchievers(rank.requiredRank);

      // Mandatory personal investment.
      const personalCompleted =
        personalInvestment >= rank.personalInvestment;

      // Path 1: Direct business.
      const directCompleted =
        directBusiness >= rank.directBusiness;

      // Path 2: Community business + E-members.
      const teamCompleted =
        teamBusiness >= rank.teamBusiness;

      const rankMembersCompleted =
        rank.requiredRankCount === 0 ||
        rankAchievers >= rank.requiredRankCount;

      const directRouteCompleted = directCompleted;

      const communityRouteCompleted =
        teamCompleted && rankMembersCompleted;

      // Final qualification.
      const eligible =
        personalCompleted &&
        (directRouteCompleted || communityRouteCompleted);

      // Rank already stored in the database.
      const achieved = currentRankLevel >= rank.level;

      return {
        ...rank,

        progress: {
          personalInvestment: {
            current: personalInvestment,
            required: rank.personalInvestment,
            completed: personalCompleted,
          },

          directBusiness: {
            current: directBusiness,
            required: rank.directBusiness,
            completed: directCompleted,
          },

          teamBusiness: {
            current: teamBusiness,
            required: rank.teamBusiness,
            completed: teamCompleted,
          },

          rankMembers: {
            current: rankAchievers,
            required: rank.requiredRankCount,
            requiredRank:
              rank.requiredRank > 0
                ? `E-${String(rank.requiredRank).padStart(2, "0")}`
                : null,
            completed: rankMembersCompleted,
          },
        },

        qualification: {
          personalCompleted,
          directRouteCompleted,
          communityRouteCompleted,
        },

        achieved,
        eligible,
      };
    });

    // =====================================================
    // CURRENT / NEXT RANK
    // =====================================================

    const currentRank =
      currentRankLevel > 0
        ? RANKS.find(
            (rank) => rank.level === currentRankLevel
          ) || null
        : null;

    const nextRank =
      currentRankLevel < RANKS.length
        ? RANKS[currentRankLevel]
        : null;

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,

      data: {
        currentRank: currentRank
          ? {
              level: currentRank.level,
              name: currentRank.name,
              teamPercentage: currentRank.teamPercentage,
            }
          : null,

        nextRank: nextRank
          ? {
              level: nextRank.level,
              name: nextRank.name,
              personalInvestment: nextRank.personalInvestment,
            }
          : null,

        personalInvestment,
        directBusiness,
        teamBusiness,
        ranks,
      },
    });
  } catch (error) {
    console.error("Rank progress error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load rank progress.",
    });
  }
};

module.exports = {
  getRankProgress,
};
