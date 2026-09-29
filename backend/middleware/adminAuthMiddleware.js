const jwt = require("jsonwebtoken");

const adminAuthMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Admin authentication required.",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Admin authentication required.",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    // Critical:
    // A normal member JWT must never work on admin routes.
    if (
      decoded.type !== "admin" ||
      !decoded.admin
    ) {
      return res.status(403).json({
        success: false,
        message: "Admin access required.",
      });
    }

    req.admin = {
      username: decoded.admin,
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Admin session has expired. Please login again.",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid admin session.",
    });
  }
};

module.exports = adminAuthMiddleware;