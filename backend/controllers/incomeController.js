const db = require("../config/db");

const INCOME_DIRECTIONS = {
  direct: 1,
  reward: 7,
  rank: 5,
  salary: 6,
};

exports.getIncome = async (req, res) => {
  console.log("REQ USER:", req.user);
  try {
    const { type } = req.params;
    const direction = INCOME_DIRECTIONS[type];

    if (!direction) {
      return res.status(400).json({
        success: false,
        message: "Invalid income type.",
      });
    }

    const userId = req.user.id;

    const [rows] = await db.execute(
      `SELECT id, credit, description, created_at
       FROM trasections
       WHERE user_id = ? AND direction = ?
       ORDER BY created_at DESC`,
      [userId, direction]
    );

    const total = rows.reduce((sum, row) => sum + Number(row.credit || 0), 0);

    return res.json({
      success: true,
      type,
      total,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("Get income error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch income.",
    });
  }
};