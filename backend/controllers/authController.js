const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");


// =========================================================
// REGISTER
// =========================================================

const register = async (req, res) => {
  let connection;

  try {
    const {
      username,
      name,
      email,
      country,
      mobile_no,
      password,
      confirmPassword,
      ref_id,
    } = req.body;

    // =====================================================
    // VALIDATION
    // =====================================================

    if (
      !username ||
      !name ||
      !email ||
      !country ||
      !mobile_no ||
      !password ||
      !confirmPassword ||
      !ref_id
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required.",
      });
    }

    const cleanUsername = username.trim();
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanCountry = country.trim().toLowerCase();
    const cleanMobile = mobile_no.trim();
    const cleanRefId = ref_id.trim();

    // =====================================================
    // USERNAME VALIDATION
    // =====================================================

    if (!/^[a-zA-Z0-9_]{4,20}$/.test(cleanUsername)) {
      return res.status(400).json({
        success: false,
        message:
          "Username must be 4-20 characters and contain only letters, numbers, or underscores.",
      });
    }

    // =====================================================
    // EMAIL VALIDATION
    // =====================================================

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    // =====================================================
    // MOBILE VALIDATION
    //
    // Frontend sends international format:
    // +919876543210
    // +14155552671
    // =====================================================

    if (!/^\+[1-9]\d{7,14}$/.test(cleanMobile)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid mobile number.",
      });
    }

    // =====================================================
    // COUNTRY VALIDATION
    //
    // intl-tel-input sends ISO2:
    // in, us, gb, ae etc.
    // =====================================================

    if (!/^[a-z]{2}$/.test(cleanCountry)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid country.",
      });
    }

    // =====================================================
    // PASSWORD VALIDATION
    // =====================================================

    if (password.length < 8) {
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

    // =====================================================
    // GET DATABASE CONNECTION
    // =====================================================

    connection = await db.getConnection();

    // =====================================================
    // CHECK USERNAME
    // =====================================================

    const [usernameRows] = await connection.execute(
      `
        SELECT id
        FROM member
        WHERE user_id = ?
        LIMIT 1
      `,
      [cleanUsername]
    );

    if (usernameRows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Username is already taken.",
      });
    }

    // =====================================================
    // CHECK EMAIL
    // =====================================================

    const [emailRows] = await connection.execute(
      `
        SELECT id
        FROM member
        WHERE email = ?
        LIMIT 1
      `,
      [cleanEmail]
    );

    if (emailRows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered.",
      });
    }

    // =====================================================
    // CHECK MOBILE NUMBER
    // =====================================================

    const [mobileRows] = await connection.execute(
      `
        SELECT id
        FROM member
        WHERE mobile_no = ?
        LIMIT 1
      `,
      [cleanMobile]
    );

    if (mobileRows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Mobile number is already registered.",
      });
    }

    // =====================================================
    // CHECK REFERRAL / SPONSOR
    // =====================================================

    const [sponsorRows] = await connection.execute(
      `
        SELECT id, user_id
        FROM member
        WHERE user_id = ?
        LIMIT 1
      `,
      [cleanRefId]
    );

    if (sponsorRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid referral ID.",
      });
    }

    const sponsor = sponsorRows[0];

    // =====================================================
    // HASH PASSWORD
    // =====================================================

    const hashedPassword = await bcrypt.hash(password, 12);

    // =====================================================
    // START TRANSACTION
    // =====================================================

    await connection.beginTransaction();

    // =====================================================
    // INSERT MEMBER
    // =====================================================

    const [memberResult] = await connection.execute(
      `
        INSERT INTO member (
          user_id,
          real_sponsor_id,
          name,
          password,
          email,
          mobile_no,
          country,
          dateOfJoining
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        cleanUsername,
        sponsor.user_id,
        cleanName,
        hashedPassword,
        cleanEmail,
        cleanMobile,
        cleanCountry,
      ]
    );

    const newMemberId = memberResult.insertId;

    // =====================================================
    // CREATE USER WALLET
    //
    // user_wallet.user_id stores member.id
    // =====================================================

    await connection.execute(
      `
        INSERT INTO user_wallet (user_id)
        VALUES (?)
      `,
      [newMemberId]
    );

    // =====================================================
    // CREATE GENERATION LEVELS
    //
    // Level 1   = Direct Sponsor
    // Level 2   = Sponsor's Sponsor
    // ...
    // Level 100 = Maximum
    // =====================================================

    let parentUserId = sponsor.user_id;
    let userLevel = 1;

    // Used to protect against corrupted/circular sponsor chains
    const visited = new Set();

    while (parentUserId && userLevel <= 100) {
      // ===================================================
      // CIRCULAR CHAIN PROTECTION
      // ===================================================

      if (visited.has(parentUserId)) {
        throw new Error(
          "Circular sponsor hierarchy detected."
        );
      }

      visited.add(parentUserId);

      // ===================================================
      // GET CURRENT UPLINE
      // ===================================================

      const [parentRows] = await connection.execute(
        `
          SELECT id, user_id, real_sponsor_id
          FROM member
          WHERE user_id = ?
          LIMIT 1
        `,
        [parentUserId]
      );

      if (parentRows.length === 0) {
        break;
      }

      const parent = parentRows[0];

      // Extra protection
      if (Number(parent.id) === Number(newMemberId)) {
        throw new Error(
          "Invalid sponsor hierarchy detected."
        );
      }

      // ===================================================
      // INSERT GENERATION LEVEL
      // ===================================================

      await connection.execute(
        `
          INSERT INTO levels (
            from_id,
            to_id,
            level
          )
          VALUES (?, ?, ?)
        `,
        [
          newMemberId,
          parent.id,
          userLevel,
        ]
      );

      // Move upward
      parentUserId = parent.real_sponsor_id;

      userLevel++;
    }

    // =====================================================
    // COMMIT
    // =====================================================

    await connection.commit();

    // =====================================================
    // SUCCESS
    // =====================================================

    return res.status(201).json({
      success: true,
      message: "Registration successful.",

      user: {
        id: newMemberId,
        user_id: cleanUsername,
        name: cleanName,
        email: cleanEmail,
        mobile_no: cleanMobile,
        country: cleanCountry,
        ref_id: sponsor.user_id,
      },
    });
  } catch (error) {
    // =====================================================
    // ROLLBACK
    // =====================================================

    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Registration rollback error:",
          rollbackError
        );
      }
    }

    console.error("Registration error:", error);

    // =====================================================
    // DUPLICATE DATABASE KEY
    // =====================================================

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message:
          "Username, email, or mobile number is already registered.",
      });
    }

    // =====================================================
    // SERVER ERROR
    // =====================================================

    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again.",
    });
  } finally {
    // =====================================================
    // RELEASE CONNECTION
    // =====================================================

    if (connection) {
      connection.release();
    }
  }
};


const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    // =========================================================
    // VALIDATE INPUT
    // =========================================================

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Username/email and password are required.",
      });
    }

    const cleanIdentifier = identifier.trim();

    // =========================================================
    // FIND USER
    // =========================================================

    const [rows] = await db.execute(
      `
        SELECT id, user_id, email, password, status
        FROM member
        WHERE user_id = ? OR email = ?
        LIMIT 1
      `,
      [cleanIdentifier, cleanIdentifier]
    );

    // =========================================================
    // USER NOT FOUND
    // =========================================================

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid username/email or password.",
      });
    }

    const user = rows[0];

    // =========================================================
    // CHECK IF USER IS BLOCKED
    // status: 0 = active
    // status: 1 = blocked
    // =========================================================

    if (Number(user.status) === 1) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked. Please contact support.",
      });
    }

    // =========================================================
    // VERIFY PASSWORD
    // =========================================================

    const passwordValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid username/email or password.",
      });
    }

    // =========================================================
    // GENERATE JWT
    // =========================================================

    console.log("LOGIN USER:", user.id, user.user_id);

    const token = jwt.sign(
      {
        id: user.id,
        userId: user.user_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // =========================================================
    // LOGIN SUCCESS
    // =========================================================

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        user_id: user.user_id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
};

const checkReferral = async (req, res) => {
  try {
    const { ref_id } = req.body;

    if (!ref_id || !ref_id.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please enter a referral ID.",
      });
    }

    const cleanRefId = ref_id.trim();

    const [rows] = await db.execute(
      `
        SELECT id, user_id, name
        FROM member
        WHERE user_id = ?
        LIMIT 1
      `,
      [cleanRefId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Invalid referral ID.",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Valid referral: ${rows[0].name}`,
      referral: {
        user_id: rows[0].user_id,
        name: rows[0].name,
      },
    });
  } catch (error) {
    console.error("Referral check error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify referral.",
    });
  }
};

const checkAvailability = async (req, res) => {
  try {
    const { type, value } = req.body;

    if (!type || !value?.trim()) {
      return res.status(400).json({
        success: false,
        available: false,
        message: "Value is required.",
      });
    }

    const cleanValue = value.trim();

    // =====================================================
    // USERNAME
    // =====================================================

    if (type === "username") {
      if (!/^[a-zA-Z0-9_]{4,20}$/.test(cleanValue)) {
        return res.status(400).json({
          success: false,
          available: false,
          message:
            "Username must be 4-20 characters using letters, numbers, or underscores.",
        });
      }

      const [rows] = await db.execute(
        `
          SELECT id
          FROM member
          WHERE user_id = ?
          LIMIT 1
        `,
        [cleanValue]
      );

      if (rows.length > 0) {
        return res.status(200).json({
          success: true,
          available: false,
          message: "Username is already taken.",
        });
      }

      return res.status(200).json({
        success: true,
        available: true,
        message: "Username is available.",
      });
    }

    // =====================================================
    // EMAIL
    // =====================================================

    if (type === "email") {
      const cleanEmail = cleanValue.toLowerCase();

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({
          success: false,
          available: false,
          message: "Please enter a valid email address.",
        });
      }

      const [rows] = await db.execute(
        `
          SELECT id
          FROM member
          WHERE email = ?
          LIMIT 1
        `,
        [cleanEmail]
      );

      if (rows.length > 0) {
        return res.status(200).json({
          success: true,
          available: false,
          message: "Email is already registered.",
        });
      }

      return res.status(200).json({
        success: true,
        available: true,
        message: "Email is available.",
      });
    }

    // =====================================================
    // INVALID TYPE
    // =====================================================

    return res.status(400).json({
      success: false,
      available: false,
      message: "Invalid availability type.",
    });
  } catch (error) {
    console.error("Availability check error:", error);

    return res.status(500).json({
      success: false,
      available: false,
      message: "Unable to check availability.",
    });
  }
};

const checkInvestmentAccount = async (req, res) => {
  try {
    const { address } = req.body;

    if (!address || !address.trim()) {
      return res.status(400).json({
        success: false,
        exists: false,
        message: "Wallet address is required.",
      });
    }

    const cleanAddress = address.trim().toLowerCase();

    if (!/^0x[a-fA-F0-9]{40}$/.test(cleanAddress)) {
      return res.status(400).json({
        success: false,
        exists: false,
        message: "Invalid wallet address.",
      });
    }

    const [rows] = await db.execute(
      `
        SELECT
          id,
          user_id,
          name,
          trx,
          package_choose
        FROM member
        WHERE LOWER(trx) = ?
        LIMIT 1
      `,
      [cleanAddress]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        exists: false,
        message: "No account is registered with this wallet address.",
      });
    }

    const member = rows[0];

    return res.status(200).json({
      success: true,
      exists: true,
      message: "Account verified.",
      member: {
        user_id: member.user_id,
        name: member.name,
        wallet: member.trx,
        activated: Number(member.package_choose) >= 2,
      },
    });
  } catch (error) {
    console.error("Investment account check error:", error);

    return res.status(500).json({
      success: false,
      exists: false,
      message: "Unable to verify investment account.",
    });
  }
};

module.exports = {
  register,
  login,
  checkReferral,
  checkAvailability,
  checkInvestmentAccount
};