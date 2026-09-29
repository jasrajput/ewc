const db = require("../config/db");
const bcrypt = require("bcryptjs");
const { isAddress, getAddress } = require("viem");

/*
|--------------------------------------------------------------------------
| GET PROFILE
|--------------------------------------------------------------------------
*/

exports.getProfile = async (req, res) => {
  try {
    const memberId = req.user?.id;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Please login again.",
      });
    }

    const [rows] = await db.execute(
      `SELECT
        id,
        user_id,
        name,
        email,
        mobile_no,
        country,
        trx,
        dateOfJoining,
        date_of_activation,
        package_choose,
        package_amount,
        level_achieved
      FROM member
      WHERE id = ?
      LIMIT 1`,
      [memberId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Account not found.",
      });
    }

    const user = rows[0];

    return res.json({
      success: true,
      data: {
        user_id: user.user_id,
        name: user.name || "",
        email: user.email || "",
        mobile_no: user.mobile_no || "",
        country: user.country || "",
        wallet: user.trx || "",
        walletRegistered: !!user.trx,
        dateOfJoining: user.dateOfJoining,
        date_of_activation: user.date_of_activation,
        package_choose: Number(user.package_choose || 0),
        package_amount: Number(user.package_amount || 0),
        level_achieved: Number(user.level_achieved || 0),
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load profile.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE PROFILE
|--------------------------------------------------------------------------
|
| user_id, sponsor, package, rank, wallet etc. cannot be changed here.
|
*/

exports.updateProfile = async (req, res) => {
  try {
    const memberId = req.user?.id;
    let { name, email, mobile_no, country } = req.body;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Please login again.",
      });
    }

    name = String(name || "").trim();
    email = String(email || "").trim().toLowerCase();
    mobile_no = String(mobile_no || "").trim();
    country = String(country || "").trim().toLowerCase();

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Name is required.",
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Name is too long.",
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email address is required.",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address.",
      });
    }

    if (!mobile_no) {
      return res.status(400).json({
        success: false,
        message: "Mobile number is required.",
      });
    }

    if (!country) {
      return res.status(400).json({
        success: false,
        message: "Country is required.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Check email belongs to another account
    |--------------------------------------------------------------------------
    */

    const [emailRows] = await db.execute(
      `SELECT id
       FROM member
       WHERE email = ?
       AND id != ?
       LIMIT 1`,
      [email, memberId]
    );

    if (emailRows.length) {
      return res.status(409).json({
        success: false,
        message: "This email address is already registered.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Update allowed profile fields only
    |--------------------------------------------------------------------------
    */

    await db.execute(
      `UPDATE member
       SET name = ?,
           email = ?,
           mobile_no = ?,
           country = ?
       WHERE id = ?`,
      [name, email, mobile_no, country, memberId]
    );

    return res.json({
      success: true,
      message: "Profile updated successfully.",
      data: {
        name,
        email,
        mobile_no,
        country,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update profile.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| REGISTER WALLET
|--------------------------------------------------------------------------
|
| Wallet registration is ONE TIME ONLY.
|
| Once member.trx contains an address, normal users cannot change it.
| This keeps the wallet used by Merkle snapshots permanently consistent.
|
*/

exports.registerWallet = async (req, res) => {
  try {
    const memberId = req.user?.id;
    let { wallet } = req.body;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Please login again.",
      });
    }

    wallet = String(wallet || "").trim();

    if (!wallet) {
      return res.status(400).json({
        success: false,
        message: "Wallet address is required.",
      });
    }

    if (!isAddress(wallet)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid wallet address.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Convert to checksum address
    |--------------------------------------------------------------------------
    */

    const normalizedWallet = getAddress(wallet);

    /*
    |--------------------------------------------------------------------------
    | Get current wallet
    |--------------------------------------------------------------------------
    */

    const [rows] = await db.execute(
      `SELECT trx
       FROM member
       WHERE id = ?
       LIMIT 1`,
      [memberId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Account not found.",
      });
    }

    const currentWallet = String(rows[0].trx || "").trim();

    /*
    |--------------------------------------------------------------------------
    | Wallet already registered
    |--------------------------------------------------------------------------
    */

    if (currentWallet) {
      return res.status(400).json({
        success: false,
        message:
          "Wallet address has already been registered and cannot be changed.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Prevent same wallet on another EWC account
    |--------------------------------------------------------------------------
    */

    const [existingWallet] = await db.execute(
      `SELECT id
       FROM member
       WHERE LOWER(trx) = LOWER(?)
       AND id != ?
       LIMIT 1`,
      [normalizedWallet, memberId]
    );

    if (existingWallet.length) {
      return res.status(409).json({
        success: false,
        message:
          "This wallet address is already registered with another account.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Atomic one-time update
    |--------------------------------------------------------------------------
    |
    | Even if two requests arrive together, only the first one can update trx.
    |
    */

    const [result] = await db.execute(
      `UPDATE member
       SET trx = ?
       WHERE id = ?
       AND (trx IS NULL OR TRIM(trx) = '')`,
      [normalizedWallet, memberId]
    );

    if (result.affectedRows !== 1) {
      return res.status(409).json({
        success: false,
        message:
          "Wallet address has already been registered and cannot be changed.",
      });
    }

    return res.json({
      success: true,
      message:
        "Wallet address registered successfully. This wallet cannot be changed.",
      data: {
        wallet: normalizedWallet,
        walletRegistered: true,
      },
    });
  } catch (error) {
    console.error("Register wallet error:", error);

    /*
    |--------------------------------------------------------------------------
    | MySQL duplicate key
    |--------------------------------------------------------------------------
    |
    | Useful if trx also has a UNIQUE index.
    |
    */

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message:
          "This wallet address is already registered with another account.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to register wallet address.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE PASSWORD
|--------------------------------------------------------------------------
*/

exports.updatePassword = async (req, res) => {
  try {
    const memberId = req.user?.id;

    const {
      currentPassword,
      newPassword,
      confirmPassword,
    } = req.body;

    if (!memberId) {
      return res.status(401).json({
        success: false,
        message: "Invalid session. Please login again.",
      });
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "All password fields are required.",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New passwords do not match.",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters.",
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be different from your current password.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Get existing password hash
    |--------------------------------------------------------------------------
    */

    const [rows] = await db.execute(
      `SELECT password
       FROM member
       WHERE id = ?
       LIMIT 1`,
      [memberId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Account not found.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Verify current password
    |--------------------------------------------------------------------------
    */

    const passwordValid = await bcrypt.compare(
      currentPassword,
      rows[0].password
    );

    if (!passwordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Hash new password
    |--------------------------------------------------------------------------
    */

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    /*
    |--------------------------------------------------------------------------
    | Update password
    |--------------------------------------------------------------------------
    */

    await db.execute(
      `UPDATE member
       SET password = ?
       WHERE id = ?`,
      [hashedPassword, memberId]
    );

    return res.json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (error) {
    console.error("Update password error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update password.",
    });
  }
};