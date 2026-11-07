const crypto = require("crypto");
const db = require("../config/db");
const {
  sendRegistrationOtpEmail,
} = require("../services/registrationOtpMailer");

const normalizeEmail = (value) =>
  String(value || "").trim().toLowerCase();

const validEmail = (email) =>
  email.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const otpHash = (email, code) => {
  const secret = process.env.REGISTRATION_OTP_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "REGISTRATION_OTP_SECRET must be at least 32 characters"
    );
  }

  return crypto
    .createHmac("sha256", secret)
    .update(`${email}:${code}`)
    .digest("hex");
};

const equalHash = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(a, "hex"),
    Buffer.from(b, "hex")
  );
};

// POST /api/auth/register/send-otp
const sendRegistrationOtp = async (req, res) => {
  const email = normalizeEmail(req.body?.email);

  if (!validEmail(email)) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid email.",
    });
  }

  let connection;
  let locked = false;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    locked = true;

    // Use query() for legacy member collation compatibility.
    const [member] = await connection.query(
      "SELECT id FROM member WHERE email = ? LIMIT 1",
      [email]
    );

    if (member.length) {
      await connection.rollback();
      locked = false;

      return res.status(409).json({
        success: false,
        message: "Email is already registered.",
      });
    }

    const [rows] = await connection.query(
      `
        SELECT
          email,
          sent_count,
          TIMESTAMPDIFF(
            SECOND,
            window_started_at,
            UTC_TIMESTAMP()
          ) AS window_age,
          TIMESTAMPDIFF(
            SECOND,
            last_sent_at,
            UTC_TIMESTAMP()
          ) AS seconds_since_sent
        FROM registration_email_verifications
        WHERE email = ?
        FOR UPDATE
      `,
      [email]
    );

    if (rows.length) {
      const row = rows[0];

      if (Number(row.seconds_since_sent) < 60) {
        await connection.rollback();
        locked = false;

        return res.status(429).json({
          success: false,
          message:
            "Wait 60 seconds before requesting another code.",
        });
      }

      if (
        Number(row.window_age) < 900 &&
        Number(row.sent_count) >= 3
      ) {
        await connection.rollback();
        locked = false;

        return res.status(429).json({
          success: false,
          message:
            "Too many codes requested for this email. Try again in 15 minutes.",
        });
      }
    }

    const code = String(
      crypto.randomInt(0, 1000000)
    ).padStart(6, "0");

    const digest = otpHash(email, code);

    if (rows.length) {
      await connection.query(
        `
          UPDATE registration_email_verifications
          SET
            otp_hash = ?,
            otp_expires_at = DATE_ADD(
              UTC_TIMESTAMP(), INTERVAL 5 MINUTE
            ),
            attempts = 0,
            registration_token_hash = NULL,
            registration_expires_at = NULL,
            sent_count = IF(
              TIMESTAMPDIFF(
                SECOND,
                window_started_at,
                UTC_TIMESTAMP()
              ) >= 900,
              1,
              sent_count + 1
            ),
            window_started_at = IF(
              TIMESTAMPDIFF(
                SECOND,
                window_started_at,
                UTC_TIMESTAMP()
              ) >= 900,
              UTC_TIMESTAMP(),
              window_started_at
            ),
            last_sent_at = UTC_TIMESTAMP()
          WHERE email = ?
        `,
        [digest, email]
      );
    } else {
      await connection.query(
        `
          INSERT INTO registration_email_verifications (
            email,
            otp_hash,
            otp_expires_at,
            attempts,
            sent_count,
            window_started_at,
            last_sent_at
          )
          VALUES (
            ?,
            ?,
            DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE),
            0,
            1,
            UTC_TIMESTAMP(),
            UTC_TIMESTAMP()
          )
        `,
        [email, digest]
      );
    }

    await connection.commit();
    locked = false;

    try {
      await sendRegistrationOtpEmail(email, code);
    } catch (mailError) {
      await db.query(
        `
          UPDATE registration_email_verifications
          SET otp_hash = NULL
          WHERE email = ? AND otp_hash = ?
        `,
        [email, digest]
      );

      console.error(
        "Registration OTP email failed:",
        mailError
      );

      return res.status(503).json({
        success: false,
        message:
          "Unable to send verification email. Please try again later.",
      });
    }

    return res.json({
      success: true,
      message: "Verification code sent to your email.",
      expiresInSeconds: 300,
      resendAfterSeconds: 60,
    });
  } catch (error) {
    if (locked && connection) {
      await connection.rollback().catch(() => {});
    }

    console.error("Send registration OTP error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to send verification code.",
    });
  } finally {
    if (connection) connection.release();
  }
};

// POST /api/auth/register/verify-otp
const verifyRegistrationOtp = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.otp || "").trim();

  if (!validEmail(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({
      success: false,
      message: "Enter the 6-digit code sent to your email.",
    });
  }

  let connection;
  let tx = false;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    tx = true;

    const [rows] = await connection.query(
      `
        SELECT
          otp_hash,
          (otp_expires_at > UTC_TIMESTAMP()) AS is_valid,
          attempts
        FROM registration_email_verifications
        WHERE email = ?
        FOR UPDATE
      `,
      [email]
    );

    if (
      !rows.length ||
      !rows[0].otp_hash ||
      !Number(rows[0].is_valid)
    ) {
      await connection.rollback();
      tx = false;

      return res.status(400).json({
        success: false,
        message:
          "Code expired or not found. Request a new code.",
      });
    }

    if (Number(rows[0].attempts) >= 5) {
      await connection.rollback();
      tx = false;

      return res.status(429).json({
        success: false,
        message:
          "Too many incorrect attempts. Request a new code.",
      });
    }

    const correct = equalHash(
      rows[0].otp_hash,
      otpHash(email, code)
    );

    if (!correct) {
      await connection.query(
        `
          UPDATE registration_email_verifications
          SET attempts = attempts + 1
          WHERE email = ?
        `,
        [email]
      );

      await connection.commit();
      tx = false;

      return res.status(400).json({
        success: false,
        message: "Incorrect verification code.",
      });
    }

    const registrationToken = crypto
      .randomBytes(32)
      .toString("hex");

    const tokenHash = crypto
      .createHash("sha256")
      .update(registrationToken)
      .digest("hex");

    await connection.query(
      `
        UPDATE registration_email_verifications
        SET
          otp_hash = NULL,
          otp_expires_at = NULL,
          registration_token_hash = ?,
          registration_expires_at = DATE_ADD(
            UTC_TIMESTAMP(), INTERVAL 10 MINUTE
          )
        WHERE email = ?
      `,
      [tokenHash, email]
    );

    await connection.commit();
    tx = false;

    return res.json({
      success: true,
      message: "Email verified.",
      registrationToken,
    });
  } catch (error) {
    if (tx && connection) {
      await connection.rollback().catch(() => {});
    }

    console.error("Verify registration OTP error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify code.",
    });
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  sendRegistrationOtp,
  verifyRegistrationOtp,
};