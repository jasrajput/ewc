const jwt = require("jsonwebtoken");
const db = require("../config/db");

const supportAgentAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Support agent login required.",
      });
    }

    const secret = process.env.SUPPORT_AGENT_JWT_SECRET;

    if (!secret) {
      throw new Error("SUPPORT_AGENT_JWT_SECRET is missing.");
    }

    const decoded = jwt.verify(header.slice(7), secret);

    if (
      decoded.type !== "support_agent" ||
      !Number.isSafeInteger(decoded.id)
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid support session.",
      });
    }

    const [rows] = await db.query(
      `
        SELECT id, name, email, is_active
        FROM support_agents
        WHERE id = ?
        LIMIT 1
      `,
      [decoded.id]
    );

    if (!rows.length || Number(rows[0].is_active) !== 1) {
      return res.status(403).json({
        success: false,
        message: "Support account is disabled or unavailable.",
      });
    }

    req.supportAgent = rows[0];
    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Support session expired. Please sign in.",
      });
    }

    console.error("Support agent authentication:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to authenticate support agent.",
    });
  }
};

module.exports = supportAgentAuth;