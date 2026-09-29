const db = require("../config/db");

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
    // USER
    // =====================================================

    const [users] = await db.execute(
      `SELECT id, user_id, name, level_achieved
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

    // =====================================================
    // DIRECT BUSINESS
    // Same logic as old PHP:
    // package_choose >= 2
    // =====================================================

    const [directRows] = await db.execute(
      `SELECT COALESCE(SUM(package_amount), 0) AS total
       FROM member
       WHERE real_sponsor_id = ?
       AND package_choose >= 2`,
      [user.user_id]
    );

    const directBusiness = Number(directRows[0]?.total || 0);

    // =====================================================
    // TOTAL DOWNLINE BUSINESS
    // =====================================================

    const [teamRows] = await db.execute(
      `SELECT COALESCE(SUM(package_amount), 0) AS total
       FROM levels
       WHERE to_id = ?`,
      [user.id]
    );

    const teamBusiness = Number(teamRows[0]?.total || 0);

    // =====================================================
    // DIRECT MEMBERS' RANKS
    // =====================================================

    const [directRankRows] = await db.execute(
      `SELECT level_achieved, COUNT(*) AS total
       FROM member
       WHERE real_sponsor_id = ?
       GROUP BY level_achieved`,
      [user.user_id]
    );

    // Returns number of DIRECTS at required rank OR higher
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

      const directCompleted =
        directBusiness >= rank.directBusiness;

      const teamCompleted =
        teamBusiness >= rank.teamBusiness;

      const rankMembersCompleted =
        rank.requiredRankCount === 0 ||
        rankAchievers >= rank.requiredRankCount;

      const achieved = currentRankLevel >= rank.level;

      const eligible =
        directCompleted &&
        teamCompleted &&
        rankMembersCompleted;

      return {
        ...rank,

        progress: {
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

        achieved,
        eligible,
      };
    });

    // =====================================================
    // CURRENT / NEXT RANK
    // =====================================================

    const currentRank =
      currentRankLevel > 0
        ? RANKS.find((rank) => rank.level === currentRankLevel) || null
        : null;

    const nextRank =
      currentRankLevel < RANKS.length
        ? RANKS[currentRankLevel]
        : null;

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
            }
          : null,

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