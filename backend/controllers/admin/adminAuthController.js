const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../../config/db");

// =========================================================
// ADMIN LOGIN
// =========================================================

const login = async (req, res) => {
  try {
    const { admin, password } = req.body;

    // =====================================================
    // VALIDATION
    // =====================================================

    if (!admin || !password) {
      return res.status(400).json({
        success: false,
        message: "Admin username and password are required.",
      });
    }

    const cleanAdmin = admin.trim();

    // =====================================================
    // FIND ADMIN
    // =====================================================

    const [rows] = await db.execute(
      `
        SELECT Admin, Password
        FROM admin_login
        WHERE Admin = ?
        LIMIT 1
      `,
      [cleanAdmin]
    );

    if (!rows.length) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin username or password.",
      });
    }

    const adminUser = rows[0];

    // =====================================================
    // VERIFY BCRYPT PASSWORD
    // =====================================================

    const passwordValid = await bcrypt.compare(
      password,
      adminUser.Password
    );

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin username or password.",
      });
    }

    // =====================================================
    // GENERATE ADMIN JWT
    // =====================================================

    const token = jwt.sign(
      {
        admin: adminUser.Admin,
        type: "admin",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      }
    );

    // =====================================================
    // SUCCESS
    // =====================================================

    return res.status(200).json({
      success: true,
      message: "Admin login successful.",
      token,
      admin: {
        username: adminUser.Admin,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to sign in. Please try again.",
    });
  }
};

// =========================================================
// CURRENT ADMIN
// =========================================================

const me = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `
        SELECT Admin
        FROM admin_login
        WHERE Admin = ?
        LIMIT 1
      `,
      [req.admin.username]
    );

    if (!rows.length) {
      return res.status(401).json({
        success: false,
        message: "Admin account not found.",
      });
    }

    return res.status(200).json({
      success: true,
      admin: {
        username: rows[0].Admin,
      },
    });
  } catch (error) {
    console.error("Admin me error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify admin session.",
    });
  }
};

module.exports = {
  login,
  me,
};