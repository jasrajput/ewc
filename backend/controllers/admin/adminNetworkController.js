const db = require("../../config/db");


// ======================================================
// HELPERS
// ======================================================

const getMemberByUserId = async (userId) => {
  const [rows] = await db.execute(
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
        m.level_achieved,
        m.status,
        m.trx,
        m.dateOfJoining,
        m.date_of_activation
      FROM member m
      WHERE m.user_id = ?
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
};


const formatRank = (rank) => {
  const value = Number(rank || 0);

  if (value <= 0) {
    return "Unranked";
  }

  return `E-${String(value).padStart(2, "0")}`;
};


const formatMember = (row) => ({
  id: Number(row.id),
  user_id: row.user_id,
  name: row.name || "",
  email: row.email || "",
  mobile_no: row.mobile_no || "",
  country: row.country || "",

  sponsor_user_id:
    row.real_sponsor_id || null,

  package_choose: Number(
    row.package_choose || 0
  ),

  package_amount: Number(
    row.package_amount || 0
  ),

  rank: Number(
    row.level_achieved || 0
  ),

  rankLabel: formatRank(
    row.level_achieved
  ),

  blocked:
    Number(row.status) === 1,

  walletRegistered: Boolean(
    row.trx &&
    String(row.trx).trim()
  ),

  dateOfJoining:
    row.dateOfJoining || null,

  date_of_activation:
    row.date_of_activation || null,
});


// ======================================================
// GET NETWORK OVERVIEW
//
// GET /api/admin/network/overview?member=EWC123
// ======================================================

const getNetworkOverview = async (req, res) => {
  try {
    const memberUserId = String(
      req.query.member || ""
    ).trim();

    if (!memberUserId) {
      return res.status(400).json({
        success: false,
        message: "Member user ID is required.",
      });
    }

    const member = await getMemberByUserId(
      memberUserId
    );

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
    }


    // ==========================================
    // SPONSOR
    // ==========================================

    let sponsor = null;

    if (member.real_sponsor_id) {
      const [sponsorRows] = await db.execute(
        `
          SELECT
            id,
            user_id,
            real_sponsor_id,
            name,
            email,
            mobile_no,
            country,
            package_choose,
            package_amount,
            level_achieved,
            status,
            trx,
            dateOfJoining,
            date_of_activation
          FROM member
          WHERE user_id = ?
          LIMIT 1
        `,
        [member.real_sponsor_id]
      );

      if (sponsorRows[0]) {
        sponsor = formatMember(
          sponsorRows[0]
        );
      }
    }


    // ==========================================
    // DIRECT REFERRALS
    //
    // Direct member count comes from sponsor
    // relationship.
    //
    // Direct business comes from level 1 entries
    // in levels.package_amount.
    // ==========================================

    const [directRows] = await db.execute(
      `
        SELECT
          COUNT(*) AS directPartners,

          SUM(
            CASE
              WHEN package_choose >= 2
              THEN 1
              ELSE 0
            END
          ) AS activatedDirects

        FROM member

        WHERE real_sponsor_id = ?
      `,
      [member.user_id]
    );


    const [directBusinessRows] =
      await db.execute(
        `
          SELECT
            COALESCE(
              SUM(package_amount),
              0
            ) AS directBusiness

          FROM levels

          WHERE from_id = ?
            AND level = 1
        `,
        [member.id]
      );


    const directStats =
      directRows[0] || {};

    const directBusinessStats =
      directBusinessRows[0] || {};


    // ==========================================
    // COMMUNITY
    //
    // Business is intentionally calculated from
    // levels.package_amount.
    // ==========================================

    const [communityRows] =
      await db.execute(
        `
          SELECT
            COUNT(
              DISTINCT l.to_id
            ) AS communitySize,

            COALESCE(
              SUM(l.package_amount),
              0
            ) AS communityBusiness,

            COUNT(
              DISTINCT CASE
                WHEN m.package_choose >= 2
                THEN m.id
              END
            ) AS activatedCommunity

          FROM levels l

          INNER JOIN member m
            ON m.id = l.to_id

          WHERE l.from_id = ?
        `,
        [member.id]
      );


    const communityStats =
      communityRows[0] || {};


    // ==========================================
    // LEVEL DISTRIBUTION
    // ==========================================

    const [levelRows] =
      await db.execute(
        `
          SELECT
            l.level,

            COUNT(
              DISTINCT l.to_id
            ) AS members,

            COUNT(
              DISTINCT CASE
                WHEN m.package_choose >= 2
                THEN m.id
              END
            ) AS activatedMembers,

            COALESCE(
              SUM(l.package_amount),
              0
            ) AS business

          FROM levels l

          INNER JOIN member m
            ON m.id = l.to_id

          WHERE l.from_id = ?

          GROUP BY l.level

          ORDER BY l.level ASC
        `,
        [member.id]
      );


    const levels = levelRows.map(
      (row) => ({
        level: Number(
          row.level || 0
        ),

        members: Number(
          row.members || 0
        ),

        activatedMembers: Number(
          row.activatedMembers || 0
        ),

        business: Number(
          row.business || 0
        ),
      })
    );


    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,

      data: {
        member:
          formatMember(member),

        sponsor,

        overview: {
          directPartners: Number(
            directStats.directPartners ||
              0
          ),

          activatedDirects: Number(
            directStats.activatedDirects ||
              0
          ),

          directBusiness: Number(
            directBusinessStats.directBusiness ||
              0
          ),

          communitySize: Number(
            communityStats.communitySize ||
              0
          ),

          activatedCommunity: Number(
            communityStats.activatedCommunity ||
              0
          ),

          communityBusiness: Number(
            communityStats.communityBusiness ||
              0
          ),
        },

        levels,
      },
    });
  } catch (error) {
    console.error(
      "Admin network overview error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load network overview.",
    });
  }
};


// ======================================================
// GET DIRECT REFERRALS
//
// GET /api/admin/network/directs
//   ?member=EWC123
//   &search=abc
//   &page=1
//   &limit=20
// ======================================================

const getNetworkDirects = async (
  req,
  res
) => {
  try {
    const memberUserId = String(
      req.query.member || ""
    ).trim();

    const search = String(
      req.query.search || ""
    ).trim();

    const page = Math.max(
      Number(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        Number(req.query.limit) || 20,
        1
      ),
      100
    );

    const offset =
      (page - 1) * limit;


    if (!memberUserId) {
      return res.status(400).json({
        success: false,
        message:
          "Member user ID is required.",
      });
    }


    const member =
      await getMemberByUserId(
        memberUserId
      );


    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
    }


    const where = [
      "m.real_sponsor_id = ?",
    ];

    const params = [
      member.user_id,
    ];


    if (search) {
      const term = `%${search}%`;

      where.push(`
        (
          m.user_id LIKE ?
          OR m.name LIKE ?
          OR m.email LIKE ?
          OR m.mobile_no LIKE ?
        )
      `);

      params.push(
        term,
        term,
        term,
        term
      );
    }


    const whereSql = `
      WHERE ${where.join(" AND ")}
    `;


    const [countRows] =
      await db.execute(
        `
          SELECT COUNT(*) AS total

          FROM member m

          ${whereSql}
        `,
        params
      );


    const total = Number(
      countRows[0]?.total || 0
    );


    const [rows] =
      await db.execute(
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
            m.level_achieved,
            m.status,
            m.trx,
            m.dateOfJoining,
            m.date_of_activation

          FROM member m

          ${whereSql}

          ORDER BY m.id DESC

          LIMIT ? OFFSET ?
        `,
        [
          ...params,
          limit,
          offset,
        ]
      );


    return res.status(200).json({
      success: true,

      data: {
        member:
          formatMember(member),

        directs:
          rows.map(formatMember),

        pagination: {
          page,
          limit,
          total,

          totalPages:
            Math.ceil(
              total / limit
            ),
        },
      },
    });
  } catch (error) {
    console.error(
      "Admin network directs error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load direct referrals.",
    });
  }
};


// ======================================================
// GET LEVEL SUMMARY
//
// GET /api/admin/network/levels?member=EWC123
// ======================================================

const getNetworkLevels = async (req, res) => {
  try {
    const memberUserId = String(
      req.query.member || ""
    ).trim();

    if (!memberUserId) {
      return res.status(400).json({
        success: false,
        message: "Member user ID is required.",
      });
    }

    const member = await getMemberByUserId(
      memberUserId
    );

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
    }


    const [rows] = await db.execute(
      `
        SELECT
          l.level,

          COUNT(
            DISTINCT l.to_id
          ) AS members,

          COUNT(
            DISTINCT CASE
              WHEN m.package_choose >= 2
              THEN m.id
            END
          ) AS activatedMembers,

          COALESCE(
            SUM(l.package_amount),
            0
          ) AS business

        FROM levels l

        INNER JOIN member m
          ON m.id = l.to_id

        WHERE l.from_id = ?

        GROUP BY l.level

        ORDER BY l.level ASC
      `,
      [member.id]
    );


    return res.status(200).json({
      success: true,

      data: {
        member:
          formatMember(member),

        levels: rows.map(
          (row) => ({
            level: Number(
              row.level || 0
            ),

            members: Number(
              row.members || 0
            ),

            activatedMembers: Number(
              row.activatedMembers || 0
            ),

            business: Number(
              row.business || 0
            ),
          })
        ),
      },
    });
  } catch (error) {
    console.error(
      "Admin network levels error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load network levels.",
    });
  }
};


// ======================================================
// GET MEMBERS IN ONE LEVEL
//
// GET /api/admin/network/level-members
//   ?member=EWC123
//   &level=2
//   &search=abc
//   &page=1
// ======================================================

const getNetworkLevelMembers = async (req, res) => {
  try {
    const memberUserId = String(
      req.query.member || ""
    ).trim();

    const level = Number(
      req.query.level
    );

    const search = String(
      req.query.search || ""
    ).trim();

    const page = Math.max(
      Number(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        Number(req.query.limit) || 20,
        1
      ),
      100
    );

    const offset =
      (page - 1) * limit;


    // ==========================================
    // VALIDATION
    // ==========================================

    if (!memberUserId) {
      return res.status(400).json({
        success: false,
        message:
          "Member user ID is required.",
      });
    }


    if (
      !Number.isInteger(level) ||
      level < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid network level is required.",
      });
    }


    // ==========================================
    // FIND ROOT MEMBER
    // ==========================================

    const member =
      await getMemberByUserId(
        memberUserId
      );


    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
    }


    // ==========================================
    // FILTERS
    // ==========================================

    const where = [
      "l.from_id = ?",
      "l.level = ?",
    ];

    const params = [
      member.id,
      level,
    ];


    if (search) {
      const term = `%${search}%`;

      where.push(`
        (
          m.user_id LIKE ?
          OR m.name LIKE ?
          OR m.email LIKE ?
          OR m.mobile_no LIKE ?
        )
      `);

      params.push(
        term,
        term,
        term,
        term
      );
    }


    const whereSql = `
      WHERE ${where.join(" AND ")}
    `;


    // ==========================================
    // COUNT MEMBERS
    // ==========================================

    const [countRows] =
      await db.execute(
        `
          SELECT
            COUNT(
              DISTINCT m.id
            ) AS total

          FROM levels l

          INNER JOIN member m
            ON m.id = l.to_id

          ${whereSql}
        `,
        params
      );


    const total = Number(
      countRows[0]?.total || 0
    );


    // ==========================================
    // GET LEVEL MEMBERS
    //
    // IMPORTANT:
    // member.package_amount = current member package
    //
    // l.package_amount =
    // business amount recorded in this
    // network/level relationship
    // ==========================================

    const [rows] =
      await db.execute(
        `
          SELECT DISTINCT
            m.id,
            m.user_id,
            m.real_sponsor_id,
            m.name,
            m.email,
            m.mobile_no,
            m.country,
            m.package_choose,
            m.package_amount,
            m.level_achieved,
            m.status,
            m.trx,
            m.dateOfJoining,
            m.date_of_activation,

            l.package_amount
              AS level_package_amount,

            l.status
              AS level_status,

            l.created_on
              AS level_created_on

          FROM levels l

          INNER JOIN member m
            ON m.id = l.to_id

          ${whereSql}

          ORDER BY m.id DESC

          LIMIT ? OFFSET ?
        `,
        [
          ...params,
          limit,
          offset,
        ]
      );


    // ==========================================
    // FORMAT MEMBERS
    // ==========================================

    const members = rows.map(
      (row) => ({
        ...formatMember(row),

        network: {
          level,

          packageAmount: Number(
            row.level_package_amount ||
              0
          ),

          status: Number(
            row.level_status || 0
          ),

          createdOn:
            row.level_created_on ||
            null,
        },
      })
    );


    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,

      data: {
        member:
          formatMember(member),

        level,

        members,

        pagination: {
          page,
          limit,
          total,

          totalPages:
            Math.ceil(
              total / limit
            ),
        },
      },
    });
  } catch (error) {
    console.error(
      "Admin level members error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load level members.",
    });
  }
};


// ======================================================
// MEMBER SEARCH
//
// Used by the admin Network page.
//
// GET /api/admin/network/search?search=jas
// ======================================================

const searchNetworkMembers = async (
  req,
  res
) => {
  try {
    const search = String(
      req.query.search || ""
    ).trim();


    if (search.length < 1) {
      return res.status(200).json({
        success: true,
        data: {
          members: [],
        },
      });
    }


    const term = `%${search}%`;


    const [rows] =
      await db.execute(
        `
          SELECT
            id,
            user_id,
            real_sponsor_id,
            name,
            email,
            mobile_no,
            country,
            package_choose,
            package_amount,
            level_achieved,
            status,
            trx,
            dateOfJoining,
            date_of_activation

          FROM member

          WHERE
            user_id LIKE ?
            OR name LIKE ?
            OR email LIKE ?
            OR mobile_no LIKE ?

          ORDER BY
            CASE
              WHEN user_id = ?
              THEN 0
              ELSE 1
            END,
            id DESC

          LIMIT 20
        `,
        [
          term,
          term,
          term,
          term,
          search,
        ]
      );


    return res.status(200).json({
      success: true,

      data: {
        members:
          rows.map(formatMember),
      },
    });
  } catch (error) {
    console.error(
      "Admin network member search error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to search members.",
    });
  }
};


// ======================================================
// FORMAT NETWORK TREE NODE
// ======================================================

const formatTreeNode = (row) => {
  return {
    id: Number(row.id),

    user_id: row.user_id,

    name: row.name || "",

    email: row.email || "",

    sponsor_user_id:
      row.real_sponsor_id || null,

    package_choose: Number(
      row.package_choose || 0
    ),

    package_amount: Number(
      row.package_amount || 0
    ),

    rank: Number(
      row.level_achieved || 0
    ),

    rankLabel: formatRank(
      row.level_achieved
    ),

    blocked:
      Number(row.status) === 1,

    activated:
      Number(row.package_choose) >= 2,

    walletRegistered: Boolean(
      row.trx &&
      String(row.trx).trim()
    ),

    dateOfJoining:
      row.dateOfJoining || null,

    directCount: Number(
      row.direct_count || 0
    ),

    hasChildren:
      Number(
        row.direct_count || 0
      ) > 0,
  };
};

// ======================================================
// GET NETWORK TREE ROOT
//
// GET /api/admin/network/tree?member=EWC1001
//
// Returns:
// root member + immediate direct children
// ======================================================

const getNetworkTree = async (
  req,
  res
) => {
  try {
    const memberUserId = String(
      req.query.member || ""
    ).trim();


    // ==========================================
    // VALIDATION
    // ==========================================

    if (!memberUserId) {
      return res.status(400).json({
        success: false,
        message:
          "Member user ID is required.",
      });
    }


    // ==========================================
    // ROOT MEMBER
    // ==========================================

    const [rootRows] =
      await db.execute(
        `
          SELECT
            m.id,
            m.user_id,
            m.real_sponsor_id,
            m.name,
            m.email,
            m.package_choose,
            m.package_amount,
            m.level_achieved,
            m.status,
            m.trx,
            m.dateOfJoining,

            (
              SELECT COUNT(*)
              FROM member child
              WHERE child.real_sponsor_id
                    = m.user_id
            ) AS direct_count

          FROM member m

          WHERE m.user_id = ?

          LIMIT 1
        `,
        [memberUserId]
      );


    if (!rootRows[0]) {
      return res.status(404).json({
        success: false,
        message:
          "Member not found.",
      });
    }


    const root =
      formatTreeNode(
        rootRows[0]
      );


    // ==========================================
    // IMMEDIATE CHILDREN
    // ==========================================

    const [childRows] =
      await db.execute(
        `
          SELECT
            m.id,
            m.user_id,
            m.real_sponsor_id,
            m.name,
            m.email,
            m.package_choose,
            m.package_amount,
            m.level_achieved,
            m.status,
            m.trx,
            m.dateOfJoining,

            (
              SELECT COUNT(*)
              FROM member child
              WHERE child.real_sponsor_id
                    = m.user_id
            ) AS direct_count

          FROM member m

          WHERE m.real_sponsor_id = ?

          ORDER BY
            m.dateOfJoining ASC,
            m.id ASC
        `,
        [root.user_id]
      );


    const children =
      childRows.map(
        formatTreeNode
      );


    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,

      data: {
        root: {
          ...root,

          children,
        },
      },
    });
  } catch (error) {
    console.error(
      "Admin network tree error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load network tree.",
    });
  }
};

// ======================================================
// GET TREE NODE CHILDREN
//
// GET /api/admin/network/tree/:memberId/children
//
// memberId here is numeric member.id.
//
// Returns only immediate children.
// ======================================================

const getNetworkTreeChildren = async (
  req,
  res
) => {
  try {
    const memberId = Number(
      req.params.memberId
    );


    // ==========================================
    // VALIDATION
    // ==========================================

    if (
      !Number.isInteger(memberId) ||
      memberId < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid member ID is required.",
      });
    }


    // ==========================================
    // FIND PARENT MEMBER
    // ==========================================

    const [parentRows] =
      await db.execute(
        `
          SELECT
            id,
            user_id,
            real_sponsor_id,
            name,
            email,
            package_choose,
            package_amount,
            level_achieved,
            status,
            trx,
            dateOfJoining

          FROM member

          WHERE id = ?

          LIMIT 1
        `,
        [memberId]
      );


    if (!parentRows[0]) {
      return res.status(404).json({
        success: false,
        message:
          "Member not found.",
      });
    }


    const parent =
      parentRows[0];


    // ==========================================
    // LOAD IMMEDIATE CHILDREN
    // ==========================================

    const [childRows] =
      await db.execute(
        `
          SELECT
            m.id,
            m.user_id,
            m.real_sponsor_id,
            m.name,
            m.email,
            m.package_choose,
            m.package_amount,
            m.level_achieved,
            m.status,
            m.trx,
            m.dateOfJoining,

            (
              SELECT COUNT(*)
              FROM member child
              WHERE child.real_sponsor_id
                    = m.user_id
            ) AS direct_count

          FROM member m

          WHERE m.real_sponsor_id = ?

          ORDER BY
            m.dateOfJoining ASC,
            m.id ASC
        `,
        [parent.user_id]
      );


    const children =
      childRows.map(
        formatTreeNode
      );


    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,

      data: {
        parent: {
          id: Number(
            parent.id
          ),

          user_id:
            parent.user_id,

          name:
            parent.name || "",
        },

        children,

        total:
          children.length,
      },
    });
  } catch (error) {
    console.error(
      "Admin network tree children error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load network children.",
    });
  }
};

module.exports = {
  getNetworkOverview,
  getNetworkDirects,
  getNetworkLevels,
  getNetworkLevelMembers,
  searchNetworkMembers,

  getNetworkTree,
  getNetworkTreeChildren,
};