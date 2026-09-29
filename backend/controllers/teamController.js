const db = require("../config/db");

// =====================================================
// DIRECT PARTNERS
// =====================================================

const getDirectPartners = async (req, res) => {
  try {
    const memberId = req.user?.id;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Please login again.",
      });
    }

    // Get logged-in user's public user_id because
    // member.real_sponsor_id stores sponsor's user_id.
    const [users] = await db.execute(
      `SELECT user_id
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

    const userId = users[0].user_id;

    const [rows] = await db.execute(
      `SELECT
        id,
        user_id,
        name,
        package_choose,
        package_amount,
        dateOfJoining,
        date_of_activation
       FROM member
       WHERE real_sponsor_id = ?
       ORDER BY id DESC`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("Direct partners error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load direct partners.",
    });
  }
};

// =====================================================
// COMPLETE COMMUNITY / DOWNLINE
// =====================================================

const getCommunity = async (req, res) => {
  try {
    const memberId = req.user?.id;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Please login again.",
      });
    }

    /*
      Old PHP:
        SELECT from_id, level, package_amount
        FROM levels
        WHERE to_id = ?

      Then another member query for every row.

      Here we JOIN member directly.
    */

    const [rows] = await db.execute(
      `SELECT
        l.from_id,
        l.level,
        l.package_amount,
        m.user_id,
        m.name,
        m.real_sponsor_id,
        m.package_choose,
        m.dateOfJoining,
        m.date_of_activation
       FROM levels l
       INNER JOIN member m ON m.id = l.from_id
       WHERE l.to_id = ?
       ORDER BY l.level ASC, l.id ASC`,
      [memberId]
    );

    return res.status(200).json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("Community error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load community.",
    });
  }
};

// =====================================================
// LEVEL-WISE GENEALOGY SUMMARY
// =====================================================

const getLevelSummary = async (req, res) => {
  try {
    const memberId = req.user?.id;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Please login again.",
      });
    }

    /*
      Your old PHP made 4 queries per level.

      We can calculate everything in ONE query.

      Based on your old levels table:
        status = 1 -> active
        status = 0 -> inactive
    */

    const [rows] = await db.execute(
      `SELECT
        level,
        COUNT(*) AS total_team,
        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS active_team,
        SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) AS inactive_team,
        COALESCE(SUM(package_amount), 0) AS total_investment
       FROM levels
       WHERE to_id = ?
       GROUP BY level
       ORDER BY level ASC`,
      [memberId]
    );

    const data = rows.map((row) => ({
      level: Number(row.level),
      total_team: Number(row.total_team || 0),
      active_team: Number(row.active_team || 0),
      inactive_team: Number(row.inactive_team || 0),
      total_investment: Number(row.total_investment || 0),
    }));

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Level summary error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load level summary.",
    });
  }
};

// =====================================================
// MEMBERS OF A PARTICULAR LEVEL
// Useful when clicking a level card
// =====================================================

const getLevelMembers = async (req, res) => {
  try {
    const memberId = req.user?.id;
    const level = Number(req.params.level);

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Please login again.",
      });
    }

    if (!Number.isInteger(level) || level < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid level.",
      });
    }

    const [rows] = await db.execute(
      `SELECT
        l.from_id,
        l.level,
        l.package_amount,
        l.status,
        m.user_id,
        m.name,
        m.real_sponsor_id,
        m.package_choose,
        m.dateOfJoining,
        m.date_of_activation
       FROM levels l
       INNER JOIN member m ON m.id = l.from_id
       WHERE l.to_id = ?
       AND l.level = ?
       ORDER BY l.id ASC`,
      [memberId, level]
    );

    return res.status(200).json({
      success: true,
      level,
      total: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("Level members error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load level members.",
    });
  }
};

// =====================================================
// NETWORK TREE - ROOT
// Logged-in member + immediate direct partners
// =====================================================

const getNetworkTree = async (req, res) => {
  try {
    const memberId = req.user?.id;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Please login again.",
      });
    }

    // Get logged-in member
    const [users] = await db.execute(
      `SELECT
        id,
        user_id,
        real_sponsor_id,
        name,
        package_choose,
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

    // Logged-in user's total downline stats
    const [rootStats] = await db.execute(
      `SELECT
        COUNT(*) AS downline_count,
        COALESCE(SUM(package_amount), 0) AS downline_business
       FROM levels
       WHERE to_id = ?`,
      [user.id]
    );

    // Immediate/direct children + their total downline stats
    const [children] = await db.execute(
      `SELECT
        m.id,
        m.user_id,
        m.real_sponsor_id,
        m.name,
        m.package_choose,
        m.package_amount,

        (
          SELECT COUNT(*)
          FROM levels l
          WHERE l.to_id = m.id
        ) AS downline_count,

        (
          SELECT COALESCE(SUM(l.package_amount), 0)
          FROM levels l
          WHERE l.to_id = m.id
        ) AS downline_business

       FROM member m
       WHERE m.real_sponsor_id = ?
  
       ORDER BY m.id ASC`,
      [user.user_id]
    );

    return res.status(200).json({
      success: true,

      data: {
        root: {
          ...user,
          downline_count: Number(rootStats[0]?.downline_count || 0),
          downline_business: Number(rootStats[0]?.downline_business || 0),
        },

        children: children.map((member) => ({
          ...member,
          downline_count: Number(member.downline_count || 0),
          downline_business: Number(member.downline_business || 0),
        })),
      },
    });
  } catch (error) {
    console.error("Network tree error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load network tree.",
    });
  }
};

// =====================================================
// NETWORK TREE - EXPAND NODE
// Returns immediate children of selected member
// =====================================================

const getNetworkTreeChildren = async (req, res) => {
  try {
    const memberId = req.user?.id;
    const userId = req.params.userId;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Please login again.",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Member ID is required.",
      });
    }

    // Security:
    // selected user must either be logged-in user or belong
    // somewhere in logged-in user's levels/downline.
    const [allowed] = await db.execute(
      `SELECT m.id
       FROM member m
       WHERE m.user_id = ?
       AND (
         m.id = ?
         OR EXISTS (
           SELECT 1
           FROM levels l
           WHERE l.to_id = ?
           AND l.from_id = m.id
         )
       )
       LIMIT 1`,
      [userId, memberId, memberId]
    );

    if (!allowed.length) {
      return res.status(403).json({
        success: false,
        message: "You cannot view this network.",
      });
    }

    const [children] = await db.execute(
      `SELECT
        m.id,
        m.user_id,
        m.real_sponsor_id,
        m.name,
        m.package_choose,
        m.package_amount,

        (
          SELECT COUNT(*)
          FROM levels l
          WHERE l.to_id = m.id
        ) AS downline_count,

        (
          SELECT COALESCE(SUM(l.package_amount), 0)
          FROM levels l
          WHERE l.to_id = m.id
        ) AS downline_business

       FROM member m
       WHERE m.real_sponsor_id = ?
       ORDER BY m.id ASC`,
      [userId]
    );

    return res.status(200).json({
      success: true,

      parent: userId,

      data: children.map((member) => ({
        ...member,
        downline_count: Number(member.downline_count || 0),
        downline_business: Number(member.downline_business || 0),
      })),
    });
  } catch (error) {
    console.error("Network tree children error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load network members.",
    });
  }
};

module.exports = {
  getDirectPartners,
  getCommunity,
  getLevelSummary,
  getLevelMembers,
  getNetworkTree,
  getNetworkTreeChildren,
};