const db = require("../../config/db");
const { isAddress, getAddress } = require("ethers");
const { logAdminAction } = require("../../utils/adminAuditLogger");

// =========================================================
// GET MEMBERS
// =========================================================

const getMembers = async (req, res) => {
  try {
    const {
      search = "",
      activation = "",
      status = "",
      wallet = "",
      rank = "",
      joinedFrom = "",
      joinedTo = "",
      activatedFrom = "",
      activatedTo = "",
      sort = "newest",
    } = req.query;

    const page = Math.max(
      parseInt(req.query.page, 10) || 1,
      1
    );

    const requestedLimit =
      parseInt(req.query.limit, 10) || 20;

    const limit = Math.min(
      Math.max(requestedLimit, 10),
      100
    );

    const offset = (page - 1) * limit;

    // =====================================================
    // WHERE
    // =====================================================

    const conditions = [];
    const params = [];

    if (search.trim()) {
      const keyword = `%${search.trim()}%`;

      conditions.push(`
        (
          m.user_id LIKE ?
          OR m.name LIKE ?
          OR m.email LIKE ?
          OR m.mobile_no LIKE ?
          OR m.trx LIKE ?
        )
      `);

      params.push(
        keyword,
        keyword,
        keyword,
        keyword,
        keyword
      );
    }

    // package_choose >= 2 = activated
    // package_choose = 1 = not activated

    if (activation === "activated") {
      conditions.push(
        "m.package_choose >= 2"
      );
    }

    if (activation === "inactive") {
      conditions.push(
        "m.package_choose = 1"
      );
    }

    // Account status:
    // 0 = active
    // 1 = blocked

    if (status === "active") {
      conditions.push("m.status = 0");
    }

    if (status === "blocked") {
      conditions.push("m.status = 1");
    }

    if (wallet === "registered") {
      conditions.push(`
        m.trx IS NOT NULL
        AND TRIM(m.trx) != ''
      `);
    }

    if (wallet === "missing") {
      conditions.push(`
        (
          m.trx IS NULL
          OR TRIM(m.trx) = ''
        )
      `);
    }

    if (
      rank !== "" &&
      Number.isInteger(Number(rank)) &&
      Number(rank) >= 0 &&
      Number(rank) <= 12
    ) {
      conditions.push(
        "m.level_achieved = ?"
      );

      params.push(Number(rank));
    }

    // =====================================================
    // JOINING DATE
    // =====================================================

    if (joinedFrom) {
      conditions.push(
        "m.dateOfJoining >= ?"
      );

      params.push(
        `${joinedFrom} 00:00:00`
      );
    }

    if (joinedTo) {
      conditions.push(
        "m.dateOfJoining < DATE_ADD(?, INTERVAL 1 DAY)"
      );

      params.push(joinedTo);
    }

    // =====================================================
    // ACTIVATION DATE
    // =====================================================

    if (activatedFrom) {
      conditions.push(
        "m.date_of_activation >= ?"
      );

      params.push(
        `${activatedFrom} 00:00:00`
      );
    }

    if (activatedTo) {
      conditions.push(
        "m.date_of_activation < DATE_ADD(?, INTERVAL 1 DAY)"
      );

      params.push(activatedTo);
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(
            " AND "
          )}`
        : "";

    // =====================================================
    // SORTING
    // Do not allow raw query input into ORDER BY.
    // =====================================================

    const sortMap = {
      newest: "m.id DESC",
      oldest: "m.id ASC",

      joining_newest:
        "m.dateOfJoining DESC, m.id DESC",

      joining_oldest:
        "m.dateOfJoining ASC, m.id ASC",

      activation_newest:
        "m.date_of_activation DESC, m.id DESC",

      investment_high:
        "m.package_amount DESC, m.id DESC",

      investment_low:
        "m.package_amount ASC, m.id DESC",

      rank_high:
        "m.level_achieved DESC, m.id DESC",

      rank_low:
        "m.level_achieved ASC, m.id DESC",
    };

    const orderBy =
      sortMap[sort] || sortMap.newest;

    // =====================================================
    // TOTAL COUNT
    // =====================================================

    const countSql = `
      SELECT COUNT(*) AS total
      FROM member m
      ${whereClause}
    `;

    const [countRows] =
      await db.execute(
        countSql,
        params
      );

    const total = Number(
      countRows[0]?.total || 0
    );

    const totalPages = Math.max(
      Math.ceil(total / limit),
      1
    );

    // =====================================================
    // MEMBERS
    //
    // real_sponsor_id stores sponsor's PUBLIC user_id.
    // Therefore sponsor joins on sponsor.user_id,
    // NOT sponsor.id.
    // =====================================================

    const membersSql = `
      SELECT
        m.id,
        m.user_id,
        m.name,
        m.email,
        m.mobile_no,
        m.country,

        m.real_sponsor_id,

        sponsor.id AS sponsor_member_id,
        sponsor.user_id AS sponsor_user_id,
        sponsor.name AS sponsor_name,

        m.trx,

        m.dateOfJoining,
        m.date_of_activation,

        m.status,

        m.package_choose,
        m.package_amount,

        m.level_achieved

      FROM member m

      LEFT JOIN member sponsor
        ON sponsor.user_id = m.real_sponsor_id

      ${whereClause}

      ORDER BY ${orderBy}

      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const [rows] =
      await db.execute(
        membersSql,
        params
      );

    // =====================================================
    // MAP RESPONSE
    // =====================================================

    const members = rows.map(
      (member) => {
        const packageChoose = Number(
          member.package_choose || 1
        );

        const level = Number(
          member.level_achieved || 0
        );

        const accountStatus = Number(
          member.status || 0
        );

        const wallet = String(
          member.trx || ""
        ).trim();

        return {
          id: member.id,

          user_id:
            member.user_id || "",

          name:
            member.name || "",

          email:
            member.email || "",

          mobile_no:
            member.mobile_no || "",

          country:
            member.country || "",

          sponsor: {
            member_id:
              member.sponsor_member_id ||
              null,

            user_id:
              member.sponsor_user_id ||
              member.real_sponsor_id ||
              "",

            name:
              member.sponsor_name || "",
          },

          package_choose:
            packageChoose,

          package_amount: Number(
            member.package_amount || 0
          ),

          activated:
            packageChoose >= 2,

          rankLevel: level,

          rank:
            level > 0
              ? `E-${String(
                  level
                ).padStart(2, "0")}`
              : "Unranked",

          status:
            accountStatus,

          blocked:
            accountStatus === 1,

          wallet: wallet,

          walletRegistered:
            Boolean(wallet),

          dateOfJoining:
            member.dateOfJoining,

          date_of_activation:
            member.date_of_activation,
        };
      }
    );

    return res.status(200).json({
      success: true,

      data: members,

      pagination: {
        page,
        limit,
        total,
        totalPages,
      },

      filters: {
        search,
        activation,
        status,
        wallet,
        rank,
        joinedFrom,
        joinedTo,
        activatedFrom,
        activatedTo,
        sort,
      },
    });
  } catch (error) {
    console.error(
      "Admin get members error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load members.",
    });
  }
};


// =========================================================
// UPDATE MEMBER STATUS
// Block / Unblock only.
// No delete operation exists.
// =========================================================

const updateMemberStatus = async (req, res) => {
  try {
    const memberId = Number(req.params.id);

    const status = Number(req.body.status);

    // ==========================================
    // VALIDATION
    // ==========================================

    if (!Number.isInteger(memberId) || memberId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid member.",
      });
    }

    if (![0, 1].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be 0 or 1.",
      });
    }


    // ==========================================
    // GET MEMBER
    // ==========================================

    const [members] = await db.execute(
      `
        SELECT
          id,
          user_id,
          name,
          status

        FROM member

        WHERE id = ?

        LIMIT 1
      `,
      [memberId]
    );

    if (!members.length) {
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
    }

    const member = members[0];

    const currentStatus = Number(member.status || 0);


    // ==========================================
    // NO CHANGE NEEDED
    // ==========================================

    if (currentStatus === status) {
      return res.status(200).json({
        success: true,

        message:
          status === 1
            ? "Member is already blocked."
            : "Member is already active.",

        data: {
          id: member.id,
          user_id: member.user_id,
          status,
        },
      });
    }


    // ==========================================
    // UPDATE
    // ==========================================

    await db.execute(
      `
        UPDATE member

        SET
          status = ?,
          updated_at = CURRENT_TIMESTAMP

        WHERE id = ?
      `,
      [status, memberId]
    );


    // ==========================================
    // AUDIT
    // ==========================================

    await logAdminAction({
      req,

      action:
        status === 1
          ? "MEMBER_BLOCKED"
          : "MEMBER_UNBLOCKED",

      entityType: "member",
      entityId: memberId,
      entityUserId: member.user_id,

      fieldName: "status",

      oldValue: currentStatus,
      newValue: status,

      description:
        status === 1
          ? "Member account blocked."
          : "Member account unblocked.",
    });


    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,

      message:
        status === 1
          ? "Member blocked successfully."
          : "Member unblocked successfully.",

      data: {
        id: member.id,
        user_id: member.user_id,
        status,
      },
    });
  } catch (error) {
    console.error(
      "Admin member status error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to update member status.",
    });
  }
};


// =========================================================
// GET MEMBER DETAILS
// =========================================================

const getMemberDetails = async (req, res) => {
  try {
    const memberId = Number(req.params.id);

    if (!Number.isInteger(memberId) || memberId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid member.",
      });
    }

    // -----------------------------------------------------
    // MEMBER
    // real_sponsor_id = sponsor's public user_id
    // -----------------------------------------------------

    const [members] = await db.execute(
      `
        SELECT
          m.id,
          m.user_id,
          m.real_sponsor_id,
          m.name,
          m.email,
          m.mobile_no,
          m.country,

          m.package_choose,
          m.package_amount,
          m.date_of_activation,

          m.level_achieved,

          m.status,
          m.roi_status,

          m.trx,
          m.dateOfJoining,

          sponsor.id AS sponsor_member_id,
          sponsor.user_id AS sponsor_user_id,
          sponsor.name AS sponsor_name,
          sponsor.email AS sponsor_email

        FROM member m

        LEFT JOIN member sponsor
          ON sponsor.user_id = m.real_sponsor_id

        WHERE m.id = ?

        LIMIT 1
      `,
      [memberId]
    );

    if (!members.length) {
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
    }

    const member = members[0];

    // -----------------------------------------------------
    // RUN SUMMARY QUERIES
    // -----------------------------------------------------

    const [
      directResult,
      communityResult,
      incomeResult,
      withdrawalResult,
      recentIncomeResult,
    ] = await Promise.all([
      // Direct partners.
      // levels.from_id / to_id use numeric member IDs.
      db.execute(
        `
          SELECT
            COUNT(DISTINCT l.to_id) AS directPartners,

            COALESCE(
              SUM(
                CASE
                  WHEN downline.package_choose >= 2
                  THEN downline.package_amount
                  ELSE 0
                END
              ),
              0
            ) AS directBusiness

          FROM levels l

          LEFT JOIN member downline
            ON downline.id = l.to_id

          WHERE l.from_id = ?
            AND l.level = 1
        `,
        [memberId]
      ),

      // Entire community.
      db.execute(
        `
          SELECT
            COUNT(DISTINCT l.to_id) AS communitySize,

            COALESCE(
              SUM(
                CASE
                  WHEN downline.package_choose >= 2
                  THEN downline.package_amount
                  ELSE 0
                END
              ),
              0
            ) AS communityBusiness

          FROM levels l

          LEFT JOIN member downline
            ON downline.id = l.to_id

          WHERE l.from_id = ?
        `,
        [memberId]
      ),

      // Earnings by known EWC directions.
      db.execute(
  `
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN direction = 1
            THEN credit
            ELSE 0
          END
        ),
        0
      ) AS directIncome,

      COALESCE(
        SUM(
          CASE
            WHEN direction = 5
            THEN credit
            ELSE 0
          END
        ),
        0
      ) AS rankIncome,

      COALESCE(
        SUM(
          CASE
            WHEN direction = 6
            THEN credit
            ELSE 0
          END
        ),
        0
      ) AS salaryIncome,

      COALESCE(
        SUM(
          CASE
            WHEN direction = 7
            THEN credit
            ELSE 0
          END
        ),
        0
      ) AS rewardIncome,

      COALESCE(
        SUM(
          CASE
            WHEN direction IN (1, 5, 6, 7)
            THEN credit
            ELSE 0
          END
        ),
        0
      ) AS totalIncome

    FROM trasections

    WHERE user_id = ?
  `,
  [memberId]
),

      // Withdrawal summary.
      db.execute(
        `
          SELECT
            COUNT(*) AS totalRequests,

            COALESCE(
              SUM(amount),
              0
            ) AS totalRequested,

            COALESCE(
              SUM(
                CASE
                  WHEN status = 0
                  THEN amount
                  ELSE 0
                END
              ),
              0
            ) AS pendingAmount,

            COALESCE(
              SUM(
                CASE
                  WHEN status = 1
                  THEN amount
                  ELSE 0
                END
              ),
              0
            ) AS approvedAmount

          FROM withdrawals

          WHERE user_id = ?
        `,
        [memberId]
      ),

      // Recent earnings.
     db.execute(
  `
    SELECT
      id,
      credit,
      debit,
      direction,
      description,
      created_at

    FROM trasections

    WHERE user_id = ?
      AND direction IN (1, 5, 6, 7)
      AND credit > 0

    ORDER BY id DESC

    LIMIT 8
  `,
  [memberId]
),
    ]);

    const direct =
      directResult[0]?.[0] || {};

    const community =
      communityResult[0]?.[0] || {};

    const income =
      incomeResult[0]?.[0] || {};

    const withdrawals =
      withdrawalResult[0]?.[0] || {};

    const recentIncome =
      recentIncomeResult[0] || [];

    const packageChoose = Number(
      member.package_choose || 1
    );

    const status = Number(
      member.status || 0
    );

    const roiStatus = Number(
      member.roi_status || 0
    );

    const rankLevel = Number(
      member.level_achieved || 0
    );

    const wallet = String(
      member.trx || ""
    ).trim();

    const directionLabels = {
      1: "Direct Income",
      5: "Rank Income",
      6: "Salary Income",
      7: "Reward Income",
    };

    return res.status(200).json({
      success: true,

      data: {
        member: {
          id: member.id,

          user_id: member.user_id || "",

          name: member.name || "",

          email: member.email || "",

          mobile_no:
            member.mobile_no || "",

          country:
            member.country || "",

          dateOfJoining:
            member.dateOfJoining,

          status,

          blocked: status === 1,

          roi_status: roiStatus,

          roiBlocked:
            roiStatus === 1,

          package_choose:
            packageChoose,

          package_amount: Number(
            member.package_amount || 0
          ),

          activated:
            packageChoose >= 2,

          date_of_activation:
            member.date_of_activation,

          level_achieved:
            rankLevel,

          rank:
            rankLevel > 0
              ? `E-${String(
                  rankLevel
                ).padStart(2, "0")}`
              : "Unranked",

          trx: wallet,

          walletRegistered:
            Boolean(wallet),

          sponsor: {
            member_id:
              member.sponsor_member_id ||
              null,

            user_id:
              member.sponsor_user_id ||
              member.real_sponsor_id ||
              "",

            name:
              member.sponsor_name || "",

            email:
              member.sponsor_email || "",
          },
        },

        network: {
          directPartners: Number(
            direct.directPartners || 0
          ),

          directBusiness: Number(
            direct.directBusiness || 0
          ),

          communitySize: Number(
            community.communitySize || 0
          ),

          communityBusiness: Number(
            community.communityBusiness ||
              0
          ),
        },

        earnings: {
          direct: Number(
            income.directIncome || 0
          ),

          rank: Number(
            income.rankIncome || 0
          ),

          salary: Number(
            income.salaryIncome || 0
          ),

          reward: Number(
            income.rewardIncome || 0
          ),

          total: Number(
            income.totalIncome || 0
          ),
        },

        withdrawals: {
          totalRequests: Number(
            withdrawals.totalRequests || 0
          ),

          totalRequested: Number(
            withdrawals.totalRequested ||
              0
          ),

          pendingAmount: Number(
            withdrawals.pendingAmount ||
              0
          ),

          approvedAmount: Number(
            withdrawals.approvedAmount ||
              0
          ),
        },

        recentEarnings:
          recentIncome.map((item) => ({
            id: item.id,

            amount: Number(
              item.credit || 0
            ),

            direction: Number(
              item.direction
            ),

            type:
              directionLabels[
                Number(item.direction)
              ] || "Income",

            description:
              item.description || "",

            created_at:
              item.created_at,
          })),
      },
    });
  } catch (error) {
    console.error(
      "Admin member details error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load member details.",
    });
  }
};


// =========================================================
// UPDATE SAFE PROFILE FIELDS
// =========================================================

const updateMemberProfile = async (req, res) => {
  try {
    const memberId = Number(req.params.id);

    if (!Number.isInteger(memberId) || memberId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid member.",
      });
    }

    // ==========================================
    // ALLOWED PROFILE FIELDS
    // ==========================================

    const name = String(req.body.name || "").trim();

    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const mobileNo = String(req.body.mobile_no || "").trim();

    const country = String(req.body.country || "").trim();

    let wallet = String(req.body.trx || "").trim();


    // ==========================================
    // VALIDATION
    // ==========================================

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Name is required.",
      });
    }

    if (name.length > 110) {
      return res.status(400).json({
        success: false,
        message: "Name is too long.",
      });
    }

    if (email.length > 120) {
      return res.status(400).json({
        success: false,
        message: "Email is too long.",
      });
    }

    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address.",
      });
    }

    if (mobileNo.length > 120) {
      return res.status(400).json({
        success: false,
        message: "Mobile number is too long.",
      });
    }

    if (country.length > 120) {
      return res.status(400).json({
        success: false,
        message: "Country is too long.",
      });
    }


    // ==========================================
    // BEP-20 / EVM WALLET VALIDATION
    // ==========================================

    if (wallet) {
      if (!isAddress(wallet)) {
        return res.status(400).json({
          success: false,
          message: "Enter a valid BEP-20 wallet address.",
        });
      }

      // Normalize to checksum format.
      wallet = getAddress(wallet);
    }


    // ==========================================
    // GET EXISTING MEMBER
    // ==========================================

    const [members] = await db.execute(
      `
        SELECT
          id,
          user_id,
          name,
          email,
          mobile_no,
          country,
          trx

        FROM member

        WHERE id = ?

        LIMIT 1
      `,
      [memberId]
    );

    if (!members.length) {
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
    }

    const member = members[0];


    // ==========================================
    // UNIQUE EMAIL
    // ==========================================

    if (email) {
      const [duplicateEmail] = await db.execute(
        `
          SELECT
            id,
            user_id

          FROM member

          WHERE email = ?
            AND id != ?

          LIMIT 1
        `,
        [email, memberId]
      );

      if (duplicateEmail.length) {
        return res.status(409).json({
          success: false,
          message:
            "This email is already registered to another member.",
        });
      }
    }


    // ==========================================
    // UNIQUE WALLET
    //
    // Wallet comparison is case-insensitive.
    // ==========================================

    if (wallet) {
      const [duplicateWallet] = await db.execute(
        `
          SELECT
            id,
            user_id

          FROM member

          WHERE LOWER(trx) = LOWER(?)
            AND id != ?

          LIMIT 1
        `,
        [wallet, memberId]
      );

      if (duplicateWallet.length) {
        return res.status(409).json({
          success: false,
          message:
            "This withdrawal wallet is already registered to another member.",
        });
      }
    }


    // ==========================================
    // SAVE OLD VALUES BEFORE UPDATE
    // ==========================================

    const oldEmail = String(member.email || "")
      .trim()
      .toLowerCase();

    const oldWallet = String(member.trx || "").trim();

    const newEmail = email;

    const newWallet = wallet;


    // ==========================================
    // UPDATE MEMBER
    // ==========================================

    await db.execute(
      `
        UPDATE member

        SET
          name = ?,
          email = ?,
          mobile_no = ?,
          country = ?,
          trx = ?,
          updated_at = CURRENT_TIMESTAMP

        WHERE id = ?
      `,
      [
        name,
        email || null,
        mobileNo || null,
        country || null,
        wallet || null,
        memberId,
      ]
    );


    // ==========================================
    // AUDIT: EMAIL CHANGE
    // ==========================================

    if (oldEmail !== newEmail) {
      await logAdminAction({
        req,

        action: "MEMBER_EMAIL_CHANGED",

        entityType: "member",
        entityId: memberId,
        entityUserId: member.user_id,

        fieldName: "email",

        oldValue: oldEmail || null,
        newValue: newEmail || null,

        description:
          "Member email address changed.",
      });
    }


    // ==========================================
    // AUDIT: WALLET CHANGE
    //
    // Compare case-insensitively because an EVM
    // address should not count as changed merely
    // because checksum casing changed.
    // ==========================================

    if (
      oldWallet.toLowerCase() !==
      newWallet.toLowerCase()
    ) {
      await logAdminAction({
        req,

        action: "MEMBER_WALLET_CHANGED",

        entityType: "member",
        entityId: memberId,
        entityUserId: member.user_id,

        fieldName: "trx",

        oldValue: oldWallet || null,
        newValue: newWallet || null,

        description:
          oldWallet && newWallet
            ? "Member BEP-20 withdrawal wallet changed."
            : !oldWallet && newWallet
              ? "Member BEP-20 withdrawal wallet registered."
              : "Member BEP-20 withdrawal wallet removed.",
      });
    }


    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,

      message: "Member profile updated successfully.",

      data: {
        id: memberId,
        user_id: member.user_id,

        name,
        email,
        mobile_no: mobileNo,
        country,

        trx: wallet,

        walletRegistered: Boolean(wallet),
      },
    });
  } catch (error) {
    console.error(
      "Admin update member error:",
      error
    );

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message:
          "The email or withdrawal wallet is already registered to another member.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to update member.",
    });
  }
};


// =========================================================
// ROI STATUS
//
// 0 = ROI allowed
// 1 = ROI blocked
// =========================================================

const updateMemberRoiStatus = async (req, res) => {
  try {
    const memberId = Number(req.params.id);

    const roiStatus = Number(req.body.roi_status);


    // ==========================================
    // VALIDATION
    // ==========================================

    if (!Number.isInteger(memberId) || memberId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid member.",
      });
    }

    if (![0, 1].includes(roiStatus)) {
      return res.status(400).json({
        success: false,
        message: "ROI status must be 0 or 1.",
      });
    }


    // ==========================================
    // GET MEMBER
    // ==========================================

    const [members] = await db.execute(
      `
        SELECT
          id,
          user_id,
          roi_status

        FROM member

        WHERE id = ?

        LIMIT 1
      `,
      [memberId]
    );

    if (!members.length) {
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
    }

    const member = members[0];

    const currentRoiStatus = Number(
      member.roi_status || 0
    );


    // ==========================================
    // NO CHANGE NEEDED
    // ==========================================

    if (currentRoiStatus === roiStatus) {
      return res.status(200).json({
        success: true,

        message:
          roiStatus === 1
            ? "Member ROI is already blocked."
            : "Member ROI is already enabled.",

        data: {
          id: member.id,
          user_id: member.user_id,
          roi_status: roiStatus,
        },
      });
    }


    // ==========================================
    // UPDATE
    // ==========================================

    await db.execute(
      `
        UPDATE member

        SET
          roi_status = ?,
          updated_at = CURRENT_TIMESTAMP

        WHERE id = ?
      `,
      [roiStatus, memberId]
    );


    // ==========================================
    // AUDIT
    // ==========================================

    await logAdminAction({
      req,

      action:
        roiStatus === 1
          ? "MEMBER_ROI_BLOCKED"
          : "MEMBER_ROI_UNBLOCKED",

      entityType: "member",
      entityId: memberId,
      entityUserId: member.user_id,

      fieldName: "roi_status",

      oldValue: currentRoiStatus,
      newValue: roiStatus,

      description:
        roiStatus === 1
          ? "Member ROI blocked."
          : "Member ROI unblocked.",
    });


    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,

      message:
        roiStatus === 1
          ? "Member ROI blocked successfully."
          : "Member ROI unblocked successfully.",

      data: {
        id: member.id,
        user_id: member.user_id,
        roi_status: roiStatus,
      },
    });
  } catch (error) {
    console.error(
      "Admin ROI status error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to update ROI status.",
    });
  }
};

module.exports = {
  getMembers,
  getMemberDetails,
  updateMemberProfile,
  updateMemberStatus,
  updateMemberRoiStatus,
};