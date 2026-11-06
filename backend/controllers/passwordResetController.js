
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../config/db");

const {
  sendPasswordResetEmail,
} = require("../services/passwordResetMailer");

const GENERIC_MESSAGE =
  "If an account exists with that email, a password reset link will be sent.";

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const validToken = (token) =>
  typeof token === "string" &&
  /^[a-f0-9]{64}$/i.test(token);

// =====================================================
// REQUEST PASSWORD RESET
// =====================================================

const maskEmail = (email) => {
  const value = String(email || "").trim();

  if (value.length <= 8) {
    return "***";
  }

  return `${value.slice(0, 3)}${"*".repeat(
    Math.max(3, value.length - 8)
  )}${value.slice(-5)}`;
};

const forgotPassword = async (req, res) => {
  const identifier = String(
    req.body?.identifier || req.body?.email || ""
  ).trim();

  if (!identifier || identifier.length > 254) {
    return res.status(400).json({
      success: false,
      message: "Enter your username or registered email address.",
    });
  }

  let maskedEmail = null;

  try {
    // Find member using username or email.
    // db.query() avoids the previous prepared-statement
    // collation conversion issue on the member table.
    const [members] = await db.query(
      `
        SELECT
          id,
          user_id,
          name,
          email
        FROM member
        WHERE user_id = ? OR email = ?
        LIMIT 1
      `,
      [identifier, identifier]
    );

    if (members.length) {
      const member = members[0];
      maskedEmail = member.email
        ? maskEmail(member.email)
        : null;

      // Only send reset emails to registered addresses.
      if (
        member.email &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)
      ) {
        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = hashToken(token);

        const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, "");

        if (!frontendUrl) {
          throw new Error("FRONTEND_URL is not configured.");
        }

        // Replace previous unused reset links.
        await db.query(
          `DELETE FROM password_reset_tokens
           WHERE member_id = ?`,
          [member.id]
        );

        // Save hashed token with 15-minute expiry.
        await db.query(
          `
            INSERT INTO password_reset_tokens (
              member_id,
              token_hash,
              expires_at
            )
            VALUES (
              ?,
              ?,
              DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)
            )
          `,
          [member.id, tokenHash]
        );

        const resetLink =
          `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;

        try {
          await sendPasswordResetEmail(
            member.email,
            resetLink,
            member.name || member.user_id || "Member"
          );
        } catch (mailError) {
          // Invalidate token if sending fails.
          await db.query(
            `DELETE FROM password_reset_tokens
             WHERE token_hash = ?`,
            [tokenHash]
          );

          console.error("Password reset email error:", mailError);
        }
      }
    }
  } catch (error) {
    console.error("Forgot password error:", error);
  }

  // Never reveal whether an account exists.
  return res.status(200).json({
    success: true,
    message: GENERIC_MESSAGE,
    maskedEmail,
  });
};


// =====================================================
// RESET PASSWORD
// =====================================================

const resetPassword = async (req, res) => {
  const { token, password, confirmPassword } = req.body || {};

  if (!validToken(token)) {
    return res.status(400).json({
      success: false,
      message: "Invalid password reset link.",
    });
  }

  if (
    typeof password !== "string" ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 8 characters.",
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: "Passwords do not match.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [tokens] = await connection.query(
      `SELECT id, member_id
       FROM password_reset_tokens
       WHERE token_hash = ?
         AND expires_at > UTC_TIMESTAMP()
       FOR UPDATE`,
      [hashToken(token)]
    );

    if (!tokens.length) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "Reset link has expired or already been used.",
      });
    }

    const resetRecord = tokens[0];

    // Hash using the same algorithm as existing member login.
    const hashedPassword = await bcrypt.hash(password, 12);

    await connection.query(
      `UPDATE member
       SET password = ?
       WHERE id = ?`,
      [hashedPassword, resetRecord.member_id]
    );

    // Delete every reset token for this member.
    await connection.query(
      "DELETE FROM password_reset_tokens WHERE member_id = ?",
      [resetRecord.member_id]
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "Password updated successfully. You can now log in.",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Reset password error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to reset password. Please try again.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const verifyResetToken = async (req, res) => {
  const token = String(req.query.token || "");

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({
      success: false,
      message: "Invalid password reset link.",
    });
  }

  try {
    const tokenHash = require("crypto")
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const [rows] = await db.query(
      `SELECT id
       FROM password_reset_tokens
       WHERE token_hash = ?
         AND expires_at > UTC_TIMESTAMP()
       LIMIT 1`,
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "This reset link has expired or already been used.",
      });
    }

    return res.json({
      success: true,
      message: "Valid reset link.",
    });
  } catch (error) {
    console.error("Reset token verification error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify reset link.",
    });
  }
};

module.exports = {
  forgotPassword,
  resetPassword,
  verifyResetToken
};
